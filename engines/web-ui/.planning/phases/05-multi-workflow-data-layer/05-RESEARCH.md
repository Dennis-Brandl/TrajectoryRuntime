# Phase 5: Multi-Workflow Data Layer - Research

**Researched:** 2026-03-13
**Domain:** React state management, multi-instance coordination, file handling
**Confidence:** HIGH

## Summary

This phase builds a WorkflowManager class that wraps N WorkflowCoordinator instances, providing two-layer pub/sub: manager-level events (workflow added/removed/focused) and coordinator-level events (step transitions within a single workflow). The existing WorkflowCoordinator already implements subscribe/getSnapshot for useSyncExternalStore. The WorkflowManager follows the same pattern but manages a collection of coordinators plus focus state.

Key technical challenges: (1) selector-based hooks to prevent unnecessary re-renders when only one workflow's state changes, (2) browser-side schema validation since the existing validator.ts uses Node.js APIs (readFileSync), (3) file drag-and-drop with ZIP extraction using the existing JSZip dependency, and (4) a separate HistoryStore for completed/abandoned workflows.

The approach uses zero new runtime dependencies. React 19's built-in useSyncExternalStore handles subscriptions. For selector memoization, a simple useRef-based caching pattern avoids needing the `use-sync-external-store/with-selector` shim package. The existing WorkflowCoordinator, JSZip, and Ajv (already a transitive dep) provide all needed functionality.

**Primary recommendation:** Build WorkflowManager as a plain TypeScript class with subscribe/getSnapshot following the exact same pattern as WorkflowCoordinator. Use useRef-based selector memoization in hooks rather than adding the `use-sync-external-store` shim.

## Standard Stack

### Core (already installed -- no new packages)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react | ^19.1.0 | useSyncExternalStore for subscriptions | Already in use, built-in hook |
| jszip | ^3.10.1 | Extract .WFmasterX ZIP files | Already in use for WorkflowLoader |

### Supporting (may need to add)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| ajv | ^8.x | Browser-side JSON schema validation | Import via Vite from engine; already a dependency of the engine package |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Manual selector memoization | `use-sync-external-store/with-selector` | Adds a dependency for something achievable with ~10 lines of useRef code |
| Custom WorkflowManager class | Zustand | Project decision: no Zustand. useSyncExternalStore pattern continues |

**Installation:**
```bash
# No new packages needed. Ajv is already available transitively.
# If ajv is not resolvable from web-ui, add it:
npm install ajv
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── coordinator/
│   ├── WorkflowCoordinator.ts     # (existing) Single workflow engine wrapper
│   ├── WorkflowContext.tsx         # (existing) Single coordinator context
│   └── useWorkflow.ts             # (existing) Single coordinator hooks
├── manager/
│   ├── WorkflowManager.ts         # NEW: Manages N coordinators + focus
│   ├── HistoryStore.ts            # NEW: Completed/abandoned workflow records
│   ├── WorkflowManagerContext.tsx  # NEW: React context provider
│   ├── useWorkflowManager.ts      # NEW: Manager-level hooks with selectors
│   ├── useActiveCoordinator.ts    # NEW: Hook for focused coordinator
│   ├── types.ts                   # NEW: Manager-specific types
│   └── validation.ts              # NEW: Browser-compatible spec validation
├── hooks/
│   └── useLocalStorage.ts         # (existing)
└── components/
    └── ...                        # (existing, Phase 6 will add more)
```

### Pattern 1: Two-Layer Pub/Sub (WorkflowManager)
**What:** WorkflowManager is an external store (like WorkflowCoordinator) with its own subscribe/getSnapshot. It tracks which coordinators exist, which is focused, and active count. It does NOT re-publish coordinator-level changes -- components subscribe to individual coordinators separately.
**When to use:** Always. This is the core architecture.
**Example:**
```typescript
// Source: Existing WorkflowCoordinator pattern + React docs on useSyncExternalStore

interface ManagedWorkflow {
  id: string;                        // Unique instance ID (e.g., crypto.randomUUID())
  specOid: string;                   // From workflow spec's oid field
  name: string;                      // Display name from spec description/oid
  coordinator: WorkflowCoordinator;
  loadedAt: number;                  // Date.now() timestamp
}

interface ManagerSnapshot {
  workflows: ManagedWorkflow[];      // Active workflow list
  focusedId: string | null;          // Which workflow is focused
  activeCount: number;               // Convenience: workflows.length
}

type Listener = () => void;

class WorkflowManager {
  private _workflows: ManagedWorkflow[] = [];
  private _focusedId: string | null = null;
  private _snapshot: ManagerSnapshot = { workflows: [], focusedId: null, activeCount: 0 };
  private _listeners = new Set<Listener>();

  getSnapshot = (): ManagerSnapshot => this._snapshot;

  subscribe = (listener: Listener): (() => void) => {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  };

  addWorkflow(spec: MasterWorkflowSpecification, mediaMap: Record<string, string>, environments?: MasterEnvironmentLibrary[]): string {
    const id = crypto.randomUUID();
    const coordinator = new WorkflowCoordinator();
    // Load but don't start -- user explicitly starts
    const managed: ManagedWorkflow = {
      id,
      specOid: spec.oid,
      name: spec.description || spec.oid,
      coordinator,
      loadedAt: Date.now(),
    };
    this._workflows = [...this._workflows, managed];
    this._focusedId = id; // Auto-focus new workflow
    this.publish();
    return id;
  }

  // ... focusWorkflow, removeWorkflow, getCoordinator, etc.

  private publish(): void {
    this._snapshot = {
      workflows: this._workflows,
      focusedId: this._focusedId,
      activeCount: this._workflows.length,
    };
    for (const listener of this._listeners) listener();
  }
}
```

### Pattern 2: Selector-Based Hooks (Prevent Re-renders)
**What:** Wrap useSyncExternalStore with a selector + useRef memoization so components only re-render when their selected slice changes.
**When to use:** Any hook that reads a subset of the manager or coordinator snapshot.
**Example:**
```typescript
// Source: React docs on useSyncExternalStore + Object.is comparison behavior

import { useRef, useCallback, useSyncExternalStore } from 'react';

function useManagerSelector<T>(selector: (snap: ManagerSnapshot) => T): T {
  const manager = useContext(WorkflowManagerContext)!;
  const prevRef = useRef<T>();
  const selectorRef = useRef(selector);
  selectorRef.current = selector;

  const getSnapshot = useCallback(() => {
    const next = selectorRef.current(manager.getSnapshot());
    // Return previous reference if equal (prevents re-render)
    if (Object.is(prevRef.current, next)) return prevRef.current as T;
    prevRef.current = next;
    return next;
  }, [manager]);

  return useSyncExternalStore(manager.subscribe, getSnapshot);
}

// Usage: component only re-renders when activeCount changes
function ActiveBadge() {
  const count = useManagerSelector(s => s.activeCount);
  return <span>Active ({count})</span>;
}

// Usage: component only re-renders when focusedId changes
function FocusedWorkflowName() {
  const focusedId = useManagerSelector(s => s.focusedId);
  // ...
}
```

### Pattern 3: Individual Coordinator Subscription by ID
**What:** Hook that subscribes to a specific coordinator's snapshot by workflow ID.
**When to use:** Components rendering a specific workflow's state (ActiveScreen, step renderers).
**Example:**
```typescript
function useWorkflowCoordinatorById(id: string | null): CoordinatorSnapshot | null {
  const manager = useContext(WorkflowManagerContext)!;

  const subscribe = useCallback((cb: () => void) => {
    if (!id) return () => {};
    const coordinator = manager.getCoordinator(id);
    if (!coordinator) return () => {};
    return coordinator.subscribe(cb);
  }, [manager, id]);

  const getSnapshot = useCallback(() => {
    if (!id) return null;
    const coordinator = manager.getCoordinator(id);
    return coordinator?.getSnapshot() ?? null;
  }, [manager, id]);

  return useSyncExternalStore(subscribe, getSnapshot);
}
```

### Pattern 4: HistoryStore (Separate from Manager)
**What:** Simple store for completed/abandoned workflow records. Not a WorkflowCoordinator -- just metadata.
**When to use:** When workflow reaches COMPLETED or ABORTED state, or user abandons.
**Example:**
```typescript
interface HistoryEntry {
  id: string;
  specOid: string;
  name: string;
  status: 'completed' | 'abandoned';
  startedAt: number;
  finishedAt: number;
}

class HistoryStore {
  private _entries: HistoryEntry[] = [];
  private _snapshot: HistoryEntry[] = [];
  private _listeners = new Set<Listener>();

  getSnapshot = (): HistoryEntry[] => this._snapshot;
  subscribe = (listener: Listener): (() => void) => {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  };

  addEntry(entry: HistoryEntry): void {
    this._entries = [entry, ...this._entries];
    this._snapshot = this._entries;
    for (const listener of this._listeners) listener();
  }
}
```

### Pattern 5: Browser-Compatible Validation
**What:** The existing validator.ts uses Node.js readFileSync to load the JSON schema. For the browser, import the schema as a JSON module via Vite and extract the pure validation functions.
**When to use:** On file load, before adding to manager.
**Example:**
```typescript
// validation.ts -- browser-compatible version
import Ajv from 'ajv';
import workflowSchema from '../../../../spec/workflow-schema.json';
// Vite handles JSON imports natively

// Extract the pure functions from validator.ts:
// - preStructuralChecks (pure, no Node deps)
// - semanticValidation (pure, no Node deps)
// - resourceValidation (pure, no Node deps)
// Only structuralValidation needs rewriting (replace readFileSync with import)

export function validateWorkflow(workflow: Record<string, unknown>): ValidationResult {
  const preError = preStructuralChecks(workflow);
  if (preError) return preError;
  const semanticError = semanticValidation(workflow);
  if (semanticError) return semanticError;
  const resourceError = resourceValidation(workflow);
  if (resourceError) return resourceError;
  const structuralError = structuralValidation(workflow, workflowSchema);
  if (structuralError) return structuralError;
  return { valid: true };
}
```

### Anti-Patterns to Avoid
- **Re-publishing coordinator events through manager:** Manager should NOT subscribe to each coordinator and re-emit. Components subscribe to coordinators directly via useWorkflowCoordinatorById. This avoids O(N) cascading updates.
- **Mutable snapshot objects:** Always create new snapshot references when state changes. useSyncExternalStore relies on Object.is referential equality.
- **Storing CoordinatorSnapshot in ManagerSnapshot:** The manager snapshot should contain workflow metadata only (id, name, focusedId). Coordinator state is accessed via separate subscription.
- **useEffect for subscription:** Never use useEffect to subscribe to external stores -- useSyncExternalStore handles tearing prevention correctly during concurrent rendering.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ZIP file extraction | Custom binary parser | JSZip (already installed) | ZIP format edge cases, compression algorithms |
| JSON Schema validation | Custom field checking | Ajv with imported schema | Schema has 600+ lines, AJV handles $defs, oneOf, allOf |
| UUID generation | Math.random-based IDs | crypto.randomUUID() | Cryptographically unique, built into all modern browsers |
| External store subscriptions | useEffect + useState | useSyncExternalStore | Handles concurrent mode tearing, React-blessed API |
| File type detection from drag | Custom extension parsing | File.name + File.type | Browser provides MIME type and filename |

**Key insight:** The existing codebase already has all the file-handling logic in WorkflowLoader.tsx. The Phase 5 task is to extract and refactor this logic to work with WorkflowManager instead of a single coordinator, not to rewrite it.

## Common Pitfalls

### Pitfall 1: getSnapshot Returning New Object References
**What goes wrong:** useSyncExternalStore compares via Object.is. If getSnapshot returns a new object every call, it triggers infinite re-renders.
**Why it happens:** Natural instinct to build derived objects inside getSnapshot.
**How to avoid:** Cache the snapshot in the store class. Only create a new snapshot object in the publish() method when state actually changes. Store the snapshot as `this._snapshot` and return it from getSnapshot.
**Warning signs:** "Maximum update depth exceeded" errors or UI freezing.

### Pitfall 2: Stale Closure in Coordinator Callbacks
**What goes wrong:** Callbacks passed to coordinator.submitAction capture stale state from render.
**Why it happens:** JavaScript closures capture variables at creation time.
**How to avoid:** Use `manager.getCoordinator(id)` inside callbacks rather than capturing the coordinator reference. The existing pattern of `useWorkflowStore.getState()` inside callbacks (from Phase 3) should carry forward.
**Warning signs:** Actions going to wrong workflow or using outdated state.

### Pitfall 3: Memory Leaks from Unsubscribed Coordinators
**What goes wrong:** Removing a workflow from manager without cleaning up coordinator subscriptions or blob URLs.
**Why it happens:** The coordinator has its own listener set and blob URLs.
**How to avoid:** WorkflowManager.removeWorkflow must call coordinator.reset() (which revokes blob URLs) and the useSyncExternalStore cleanup function handles unsubscription automatically.
**Warning signs:** Growing memory usage, "net::ERR_FILE_NOT_FOUND" for blob URLs.

### Pitfall 4: subscribe Function Instability
**What goes wrong:** If the subscribe function passed to useSyncExternalStore changes between renders, React resubscribes every render.
**Why it happens:** Creating new function references in render.
**How to avoid:** Define subscribe as a bound method on the store class (arrow function property), not as an inline function. The existing WorkflowCoordinator already does this correctly: `subscribe = (listener: Listener) => ...`.
**Warning signs:** Performance degradation, flickering UI.

### Pitfall 5: Drag Event Default Prevention
**What goes wrong:** Browser opens the dropped file instead of letting JS handle it.
**Why it happens:** Not calling preventDefault() on both dragover AND drop events.
**How to avoid:** Always call e.preventDefault() and e.stopPropagation() on dragover, dragenter, dragleave, and drop events.
**Warning signs:** Browser navigates away when file is dropped.

### Pitfall 6: Duplicate Spec Detection by OID
**What goes wrong:** User loads same workflow twice, gets confusing duplicate instances.
**Why it happens:** No dedup check on the spec's oid field.
**How to avoid:** WorkflowManager.addWorkflow checks if any existing managed workflow has the same specOid. If so, prompt "keep existing or replace."
**Warning signs:** Same workflow appearing twice in the active list.

## Code Examples

### Complete WorkflowManager Hook API
```typescript
// useWorkflowManager.ts
// Source: React useSyncExternalStore docs + existing useWorkflow.ts pattern

import { useContext, useCallback, useRef, useSyncExternalStore } from 'react';
import { WorkflowManagerContext } from './WorkflowManagerContext';
import type { ManagerSnapshot } from './types';

export function useWorkflowManager() {
  const manager = useContext(WorkflowManagerContext);
  if (!manager) throw new Error('useWorkflowManager must be inside WorkflowManagerProvider');
  return manager;
}

export function useManagerSnapshot(): ManagerSnapshot {
  const manager = useWorkflowManager();
  return useSyncExternalStore(manager.subscribe, manager.getSnapshot);
}

export function useManagerSelector<T>(selector: (snap: ManagerSnapshot) => T): T {
  const manager = useWorkflowManager();
  const prevRef = useRef<T>();
  const selectorRef = useRef(selector);
  selectorRef.current = selector;

  const getSnapshot = useCallback(() => {
    const next = selectorRef.current(manager.getSnapshot());
    if (Object.is(prevRef.current, next)) return prevRef.current as T;
    prevRef.current = next;
    return next;
  }, [manager]);

  return useSyncExternalStore(manager.subscribe, getSnapshot);
}

// Convenience hooks
export function useActiveCount(): number {
  return useManagerSelector(s => s.activeCount);
}

export function useFocusedId(): string | null {
  return useManagerSelector(s => s.focusedId);
}
```

### File Drop Zone Handler
```typescript
// Source: MDN HTML Drag and Drop API / File drag and drop

function useFileDrop(onFiles: (files: File[]) => void) {
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  const handlers = useMemo(() => ({
    onDragEnter: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current++;
      if (e.dataTransfer.types.includes('Files')) setIsDragging(true);
    },
    onDragLeave: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current--;
      if (dragCounter.current === 0) setIsDragging(false);
    },
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) onFiles(files);
    },
  }), [onFiles]);

  return { isDragging, handlers };
}
```

### Processing Loaded Files (Extract from existing WorkflowLoader)
```typescript
// The existing WorkflowLoader.tsx has complete ZIP extraction logic.
// Extract it into a utility function for reuse:

async function processWorkflowFile(file: File): Promise<{
  workflow: MasterWorkflowSpecification;
  mediaMap: Record<string, string>;
  environments: MasterEnvironmentLibrary[];
} | { error: string }> {
  if (file.name.endsWith('.WFmasterX')) {
    // Existing ZIP logic from WorkflowLoader.handleFile
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    // ... extract .WFmaster, .WFenvir, media files
  } else if (file.name.endsWith('.json') || file.name.endsWith('.WFmaster')) {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const workflow = parsed.workflow ?? parsed;
    return { workflow, mediaMap: {}, environments: [] };
  } else {
    return { error: `Unsupported file type: ${file.name}` };
  }
}
```

### Workflow Lifecycle: Load -> Validate -> Add to Manager
```typescript
async function handleFilesLoaded(files: File[], manager: WorkflowManager): Promise<void> {
  for (const file of files) {
    const result = await processWorkflowFile(file);
    if ('error' in result) {
      // Show error modal
      continue;
    }

    const validationResult = validateWorkflow(result.workflow as Record<string, unknown>);
    if (!validationResult.valid) {
      // Show error modal with validation details
      continue;
    }

    // Check for duplicate spec
    const existing = manager.getSnapshot().workflows.find(
      w => w.specOid === result.workflow.oid
    );
    if (existing) {
      // Prompt: keep existing or replace
      // If replace: manager.removeWorkflow(existing.id)
    }

    manager.addWorkflow(result.workflow, result.mediaMap, result.environments);
  }
}
```

### HistoryStore Hook
```typescript
// useHistoryStore.ts
export function useHistory(): HistoryEntry[] {
  const store = useContext(HistoryStoreContext)!;
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

export function useHistorySelector<T>(selector: (entries: HistoryEntry[]) => T): T {
  const store = useContext(HistoryStoreContext)!;
  const prevRef = useRef<T>();
  const selectorRef = useRef(selector);
  selectorRef.current = selector;

  const getSnapshot = useCallback(() => {
    const next = selectorRef.current(store.getSnapshot());
    if (Object.is(prevRef.current, next)) return prevRef.current as T;
    prevRef.current = next;
    return next;
  }, [store]);

  return useSyncExternalStore(store.subscribe, getSnapshot);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| useEffect + useState for subscriptions | useSyncExternalStore | React 18 (2022) | Prevents tearing in concurrent mode |
| use-sync-external-store/with-selector shim | useRef-based memoization in custom hook | React 18+ native support | No extra dependency needed |
| Context for all shared state | External store + Context for DI only | React 18+ best practice | Context used only to inject store instance, not state |

**Deprecated/outdated:**
- `use-sync-external-store` shim: Only needed for React 16/17 compat. React 19 has useSyncExternalStore built in.
- `useMutableSource`: Replaced by useSyncExternalStore in React 18.

## Open Questions

1. **Ajv availability in browser build**
   - What we know: The engine package depends on Ajv. Vite can bundle it. The schema JSON can be imported via Vite's JSON module support.
   - What's unclear: Whether Ajv is resolvable from web-ui's node_modules or needs explicit install. The tsconfig include list doesn't include validator.ts.
   - Recommendation: Create a new browser-compatible validation module in manager/validation.ts that imports Ajv directly and the schema JSON via Vite import. Extract the pure validation functions from the engine's validator.ts. If Ajv is not resolvable, `npm install ajv`.

2. **WorkflowCoordinator "loaded but not started" state**
   - What we know: Current CoordinatorSnapshot has workflowState which starts as 'IDLE'. The loadAndStart method both loads AND starts.
   - What's unclear: How to represent "loaded but not started" -- need either a new state or a separate field.
   - Recommendation: Add a `load()` method to WorkflowCoordinator that stores the spec/mediaMap/environments but doesn't call engine.start(). Add a `start()` method that creates the engine and starts. The snapshot workflowState remains 'IDLE' until start() is called. ManagedWorkflow can track `status: 'loaded' | 'running'` at the manager level.

3. **Focus persistence across page reloads**
   - What we know: useLocalStorage hook exists and is used for device type.
   - What's unclear: Whether to persist focus ID or the entire workflow list.
   - Recommendation: Persist only focusedId to localStorage. Workflow instances (engine state) cannot be serialized, so the workflow list is lost on reload anyway. Focus persistence is only useful within a session where workflows survive (they don't survive reload currently).

4. **Coordinator lifecycle monitoring**
   - What we know: Manager needs to know when a coordinator's workflow reaches COMPLETED/ABORTED to move it to history.
   - What's unclear: Best pattern -- manager subscribes to each coordinator, or coordinator emits lifecycle events.
   - Recommendation: Manager subscribes to each coordinator's subscribe/getSnapshot. In the listener callback, check if workflowState changed to COMPLETED/ABORTED. If so, move to HistoryStore and remove from manager. This is simple and uses existing patterns.

## Sources

### Primary (HIGH confidence)
- [React useSyncExternalStore official docs](https://react.dev/reference/react/useSyncExternalStore) - API signature, getSnapshot caching rules, Object.is comparison
- Existing codebase: WorkflowCoordinator.ts, WorkflowContext.tsx, useWorkflow.ts -- verified subscribe/getSnapshot pattern
- Existing codebase: WorkflowLoader.tsx -- verified ZIP extraction and file handling logic
- Existing codebase: validator.ts -- verified Node.js dependencies and pure function structure

### Secondary (MEDIUM confidence)
- [MDN HTML Drag and Drop API](https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/File_drag_and_drop) - File drop handling patterns
- [MDN DataTransfer](https://developer.mozilla.org/en-US/docs/Web/API/DataTransfer) - dataTransfer.files API
- [React 18 working group discussion](https://github.com/reactwg/react-18/discussions/86) - useSyncExternalStore selector patterns

### Tertiary (LOW confidence)
- WebSearch community patterns for selector memoization with useRef -- standard approach but not officially documented by React

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in use or available as transitive deps
- Architecture: HIGH - Direct extension of existing WorkflowCoordinator pattern, verified against React docs
- Pitfalls: HIGH - getSnapshot/Object.is behavior verified against React official docs; drag-drop patterns verified against MDN
- Validation approach: MEDIUM - Browser-compatible Ajv usage is standard but import path for schema needs verification during implementation

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable patterns, no fast-moving dependencies)
