# Phase 6: Home + Active Screens + State Commands - Research

**Researched:** 2026-03-13
**Domain:** React UI screens, Embla Carousel, file input, state commands
**Confidence:** HIGH

## Summary

Phase 6 implements three major feature areas on top of the existing Phase 5 data layer: (1) HomeScreen for loading/managing master workflows, (2) ActiveScreen with dual-level carousel (workflow swipe + step swipe), and (3) state command menu for PAUSE/RESUME/ABANDON/RESTART. The data layer is already complete -- WorkflowManager, WorkflowCoordinator, file processing, validation, and all React hooks are wired and verified.

The primary new npm dependency is `embla-carousel-react` (v8.6.0) for touch-friendly carousels. Lucide React (already installed at ^0.577.0) provides all needed icons. The existing CSS Modules + container queries pattern continues. No other new dependencies are needed -- HTML5 drag-and-drop and File API are native browser APIs.

The key architectural challenge is coordinating navigation between screens (HomeScreen triggers tab switch to Active) and adding ABANDON support to the coordinator (the engine has no abort method, so the coordinator must handle it). RESTART already works via `coordinator.restart()`.

**Primary recommendation:** Build incrementally -- Home screen first (file loading + list), then Active screen carousels (Embla for both workflow and step levels), then state commands menu, then cross-screen integration (auto-switch to Active on start).

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| embla-carousel-react | ^8.6.0 | Touch-friendly carousel for workflow and step swiping | Locked decision from v2.0 roadmap; lightweight, headless, excellent swipe support |
| lucide-react | ^0.577.0 (installed) | Icons: EllipsisVertical (3-dot menu), Plus, Upload, Play, Pause, RotateCcw, X | Already installed; consistent icon set across app |
| react | ^19.1.0 (installed) | UI framework | Already installed |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| CSS Modules | built-in (Vite) | Component-scoped styles | All component styling |
| HTML5 Drag and Drop API | native | Drag-and-drop file loading | Convenience loading on Home screen |
| HTML5 File API | native | File picker input | Primary file loading mechanism |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Embla Carousel | CSS scroll-snap | Loses programmatic control (goTo, events), dot indicators, dynamic slide management |
| HTML5 DnD | react-dropzone | Extra dependency for something simple; native API is sufficient for single-zone drop |

**Installation:**
```bash
npm install embla-carousel-react
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  components/
    screens/
      HomeScreen.tsx              # Workflow list + file loading
      HomeScreen.module.css
      ActiveScreen.tsx            # Dual carousel (workflow + step)
      ActiveScreen.module.css
    shell/
      HeaderBar.tsx               # Extended: state commands menu
      HeaderBar.module.css
    ActiveStepCard.tsx            # Updated: info card states
    StepRenderer.tsx              # Existing: YES_NO + USER_INTERACTION
    StateCommandMenu.tsx          # Dropdown menu component
    StateCommandMenu.module.css
    ConfirmDialog.tsx             # Modal confirmation for ABANDON/RESTART
    ConfirmDialog.module.css
    WorkflowCompletionCard.tsx    # Brief completion overlay
    WorkflowCompletionCard.module.css
  coordinator/
    WorkflowCoordinator.ts       # Extended: abort() method
  hooks/
    useNavigation.ts             # Tab navigation context (or callback)
```

### Pattern 1: Embla Carousel with Dynamic Slides
**What:** Embla Carousel monitors the DOM for slide additions/removals via MutationObserver (the `slideChanges` option, default true). When React re-renders with different children, Embla auto-reinitializes.
**When to use:** Both workflow-level and step-level carousels where the slide count changes at runtime.
**Example:**
```typescript
// Source: https://www.embla-carousel.com/get-started/react/
import useEmblaCarousel from 'embla-carousel-react';

function StepCarousel({ steps }: { steps: ActiveStepInfo[] }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: 'start',
    containScroll: 'trimSnaps',
  });

  return (
    <div className={styles.viewport} ref={emblaRef}>
      <div className={styles.container}>
        {steps.map((step) => (
          <div key={step.step.oid} className={styles.slide}>
            <StepCard step={step} />
          </div>
        ))}
      </div>
    </div>
  );
}
```
**Required CSS:**
```css
.viewport { overflow: hidden; }
.container { display: flex; touch-action: pan-y pinch-zoom; }
.slide { flex: 0 0 100%; min-width: 0; }
```

### Pattern 2: Dot Indicators via Embla API
**What:** Use `emblaApi.scrollSnapList()` for dot count and `emblaApi.selectedSnap()` for active dot. Listen to `select` event for updates.
**When to use:** Workflow carousel dot indicators and step carousel dot indicators.
**Example:**
```typescript
// Source: https://www.embla-carousel.com/api/methods/ + /api/events/
const [selectedIndex, setSelectedIndex] = useState(0);
const [scrollSnaps, setScrollSnaps] = useState<number[]>([]);

useEffect(() => {
  if (!emblaApi) return;
  setScrollSnaps(emblaApi.snapList());
  const onSelect = () => setSelectedIndex(emblaApi.selectedSnap());
  emblaApi.on('select', onSelect);
  onSelect(); // initial
  return () => { emblaApi.off('select', onSelect); };
}, [emblaApi]);
```

### Pattern 3: Navigation Context for Cross-Screen Tab Switching
**What:** HomeScreen needs to trigger tab switch to Active after starting a workflow. The activeTab state lives in AppShell. Use a callback prop or a lightweight navigation context.
**When to use:** When HomeScreen starts a workflow and needs to auto-switch to Active tab.
**Example:**
```typescript
// Simplest approach: pass setActiveTab callback through props
// In AppShell:
<HomeScreen onNavigateToActive={() => setActiveTab('active')} />

// Or create a NavigationContext if more screens need cross-navigation:
const NavigationContext = createContext<{ goToTab: (tab: TabId) => void } | null>(null);
```

### Pattern 4: Coordinator abort() Method
**What:** The engine has no abortWorkflow method. ABANDON must be handled at the coordinator level by publishing an ABORTED state snapshot, which triggers the manager's auto-history subscription to move the workflow to history and remove it.
**When to use:** ABANDON state command.
**Example:**
```typescript
// In WorkflowCoordinator:
abort(): void {
  if (!this.engine) return;
  this.revokeBlobUrls();
  this.engine = null;
  // Publish ABORTED state -- this triggers manager's auto-history
  this.publish({
    workflowState: 'ABORTED',
    activeSteps: [],
    trace: this.snapshot.trace,
    properties: this.snapshot.properties,
    inputParameters: {},
    error: null,
    mediaMap: {},
    stepParams: {},
  });
}
```

### Pattern 5: State Command Validity
**What:** State commands are contextually valid based on workflow state. Invalid commands should be grayed out.
**When to use:** State command menu rendering.
**Logic:**
```typescript
function getCommandValidity(workflowState: WorkflowState, hasExecutingSteps: boolean, hasPausedSteps: boolean) {
  return {
    pause: workflowState === 'RUNNING' && hasExecutingSteps,
    resume: workflowState === 'RUNNING' && hasPausedSteps,
    abandon: workflowState === 'RUNNING',
    restart: workflowState === 'RUNNING',
  };
}
```

### Pattern 6: Container Queries for Responsive Header
**What:** Phone/tablet shows 3-dot icon for state commands; desktop shows "State Commands" button. Use container queries on `device-frame` (already set up in DeviceFrame.module.css).
**When to use:** HeaderBar responsive layout.
**Example:**
```css
.commandsButton { display: none; }
.commandsDots { display: block; }

@container device-frame (min-width: 769px) {
  .commandsButton { display: block; }
  .commandsDots { display: none; }
}
```

### Anti-Patterns to Avoid
- **Using media queries instead of container queries:** The app runs inside device frames with fixed pixel widths. Media queries would respond to the browser viewport, not the device frame. Always use `@container device-frame`.
- **Creating separate carousel libraries:** Embla handles both carousel levels. Don't build custom swipe logic.
- **Storing file references in state:** Process files immediately via `processWorkflowFile()`, then discard. Don't hold File objects in React state.
- **Putting PAUSE/RESUME on individual step cards:** Per the context decisions, state commands apply to the whole workflow via the header menu, not individual steps.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Touch swipe carousel | Custom touch/pointer event handlers | Embla Carousel | Momentum, snap points, accessibility, cross-browser |
| Dot pagination | Custom position tracking | Embla API (snapList + selectedSnap + select event) | Synced with carousel state automatically |
| File type detection | Extension parsing | `processWorkflowFile()` (already built in Phase 5) | Handles .WFmasterX, .json, .WFmaster with validation |
| Workflow validation | Schema checking | `validateWorkflow()` (already built in Phase 5) | Runs all 4 validation phases |
| Workflow lifecycle | State machine from scratch | WorkflowManager (already built in Phase 5) | Add/remove/focus/start + auto-history + duplicate detection |
| Dropdown menu positioning | Manual CSS positioning | CSS with `position: absolute` relative to header | Simple positioning from top-right corner |

**Key insight:** Phase 5 built the entire data layer. Phase 6 is purely UI on top of existing hooks. The most common mistake would be reimplementing data management that already exists in WorkflowManager, WorkflowCoordinator, and their hooks.

## Common Pitfalls

### Pitfall 1: Embla Carousel Not Re-initializing on Slide Changes
**What goes wrong:** Adding/removing workflow slides doesn't update the carousel.
**Why it happens:** Embla uses MutationObserver to detect slide changes, but the `slideChanges` option defaults to `true`. The actual problem is usually that the key prop on slides isn't stable, causing React to unmount/remount the carousel container itself.
**How to avoid:** Use stable keys on slide elements (workflow id, step oid). Keep the carousel viewport and container elements stable -- only change children inside the container.
**Warning signs:** Carousel resets to first slide when a new workflow is added.

### Pitfall 2: Stale Closure in Carousel Event Handlers
**What goes wrong:** Event handlers passed to `emblaApi.on()` capture stale state.
**Why it happens:** The `emblaApi` ref is stable, but callbacks close over render-time state.
**How to avoid:** Use refs for values needed in Embla callbacks, or re-register callbacks when dependencies change (cleanup with `off()` then re-register with `on()`).
**Warning signs:** Dot indicators or navigation don't reflect current slide count.

### Pitfall 3: ABANDON Race Condition
**What goes wrong:** User clicks ABANDON, coordinator publishes ABORTED, manager removes workflow, but React still holds stale coordinator reference.
**Why it happens:** Manager's auto-history subscription fires synchronously in the coordinator's publish cycle. The useCoordinatorById hook's subscribe/getSnapshot callbacks reference a now-removed coordinator.
**How to avoid:** useCoordinatorById already handles null id gracefully (returns null). The manager's removeWorkflow shifts focus to next workflow. Ensure the UI handles null coordinator snapshot gracefully.
**Warning signs:** React error about calling setState on unmounted component, or stale card visible briefly.

### Pitfall 4: File Input Not Resetting
**What goes wrong:** User can't load the same file twice because the file input's `value` doesn't change.
**Why it happens:** HTML file inputs don't fire `onChange` if the same file is selected again.
**How to avoid:** Reset the input's value after processing: `inputRef.current.value = ''`.
**Warning signs:** Loading the same workflow file twice doesn't work.

### Pitfall 5: Drag-and-Drop Event Propagation
**What goes wrong:** Dragging a file over the page triggers the browser's default file opening behavior.
**Why it happens:** Missing `preventDefault()` on `dragover` and `drop` events.
**How to avoid:** Call `e.preventDefault()` and `e.stopPropagation()` on `dragenter`, `dragover`, `dragleave`, and `drop` events on the drop zone.
**Warning signs:** Browser navigates away when dropping a file.

### Pitfall 6: Completion Card Timing vs Auto-Removal
**What goes wrong:** The "Workflow Complete" card tries to render but the workflow is already removed from the manager.
**Why it happens:** Manager's auto-history subscription removes COMPLETED/ABORTED workflows immediately. The completion card never has time to display.
**How to avoid:** Intercept the coordinator's COMPLETED state in the Active screen before the manager removes it. Use a local `useState` to hold a "recently completed" workflow name/id with a setTimeout to clear it. The manager removal will proceed normally; the completion card renders from local state.
**Warning signs:** Completion card never appears, or appears then immediately vanishes.

## Code Examples

### File Loading with Drag-and-Drop
```typescript
// Source: HTML5 Drag and Drop API + existing processWorkflowFile
import { processWorkflowFile, isProcessingError } from '../../manager/fileProcessing';
import { useWorkflowManager } from '../../manager/useWorkflowManager';

function HomeScreen({ onNavigateToActive }: { onNavigateToActive: () => void }) {
  const manager = useWorkflowManager();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = async (files: FileList) => {
    for (const file of files) {
      const result = await processWorkflowFile(file);
      if (isProcessingError(result)) {
        setError(result.error);
        return;
      }
      const addResult = manager.addWorkflow(result.workflow, result.mediaMap, result.environments);
      if ('duplicateId' in addResult) {
        setError('This workflow is already loaded');
        return;
      }
    }
    setError(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };
}
```

### Embla Carousel Setup for Active Screen
```typescript
// Source: https://www.embla-carousel.com/get-started/react/
import useEmblaCarousel from 'embla-carousel-react';

function WorkflowCarousel({ workflows, focusedId, onFocusChange }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ align: 'start' });
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Sync Embla selection with manager focus
  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => {
      const idx = emblaApi.selectedSnap();
      setSelectedIndex(idx);
      const wf = workflows[idx];
      if (wf && wf.id !== focusedId) onFocusChange(wf.id);
    };
    emblaApi.on('select', onSelect);
    return () => { emblaApi.off('select', onSelect); };
  }, [emblaApi, workflows, focusedId, onFocusChange]);

  // When focusedId changes externally, scroll to it
  useEffect(() => {
    if (!emblaApi || !focusedId) return;
    const idx = workflows.findIndex(w => w.id === focusedId);
    if (idx >= 0 && idx !== emblaApi.selectedSnap()) {
      emblaApi.goTo(idx);
    }
  }, [emblaApi, focusedId, workflows]);

  return (
    <div ref={emblaRef} className={styles.viewport}>
      <div className={styles.container}>
        {workflows.map(wf => (
          <div key={wf.id} className={styles.slide}>
            <StepCarousel workflowId={wf.id} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

### State Command Menu with Contextual Graying
```typescript
// Dropdown menu pattern
function StateCommandMenu({ coordinator, onCommand }: Props) {
  const [open, setOpen] = useState(false);
  const snap = coordinator ? coordinator.getSnapshot() : null;

  const isRunning = snap?.workflowState === 'RUNNING';
  const hasExecuting = snap?.activeSteps.some(s => s.step.state === 'EXECUTING') ?? false;
  const hasPaused = snap?.activeSteps.some(s => s.step.state === 'PAUSED') ?? false;

  const commands = [
    { id: 'pause', label: 'Pause', enabled: isRunning && hasExecuting },
    { id: 'resume', label: 'Resume', enabled: isRunning && hasPaused },
    { id: 'abandon', label: 'Abandon', enabled: isRunning, destructive: true },
    { id: 'restart', label: 'Restart', enabled: isRunning, destructive: true },
  ];

  return (
    <div className={styles.menuContainer}>
      <button onClick={() => setOpen(!open)}>
        <EllipsisVertical size={20} />
      </button>
      {open && (
        <div className={styles.dropdown}>
          {commands.map(cmd => (
            <button
              key={cmd.id}
              disabled={!cmd.enabled}
              className={cmd.destructive ? styles.destructive : ''}
              onClick={() => { setOpen(false); onCommand(cmd.id); }}
            >
              {cmd.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

### Info Card for Non-Interactive States
```typescript
// Light blue info card for HELD, POSTED, RECEIVED, IN_PROGRESS, ABORTED
const INFO_STATES = new Set(['HELD', 'POSTED', 'RECEIVED', 'IN_PROGRESS', 'ABORTED']);

function StepInfoCard({ info }: { info: ActiveStepInfo }) {
  const label = info.step.step.description ?? info.step.stepType;
  const state = info.step.state.replace('_', ' ');

  return (
    <div className={styles.infoCard}>
      <div className={styles.infoLabel}>{label}</div>
      <div className={styles.infoState}>{state}</div>
      <div className={styles.infoTimestamp}>
        {/* Timestamp of when step entered this state -- from trace */}
      </div>
    </div>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Embla v7 scrollTo/scrollPrev/scrollNext | Embla v8 goTo/goToPrev/goToNext | v8.0.0 (Jan 2024) | Method names changed; v8 API is current |
| Embla v7 selectedScrollSnap() | Embla v8 selectedSnap() | v8.0.0 | Shorter method name |
| Embla v7 scrollSnapList() | Embla v8 snapList() | v8.0.0 | Shorter method name |
| MoreVertical (lucide-react) | EllipsisVertical | Recent | Icon renamed in newer lucide versions |
| startIndex option (Embla) | startSnap option | v8.0.0 | Option renamed |

**Deprecated/outdated:**
- Embla v7 method names (scrollTo, scrollPrev, scrollNext, selectedScrollSnap, scrollSnapList): Use v8 names (goTo, goToPrev, goToNext, selectedSnap, snapList)
- `MoreVertical` lucide icon: Now called `EllipsisVertical`

## Open Questions

1. **PAUSE applies to which steps?**
   - What we know: The engine's pause action targets a specific step_oid. The context says PAUSE applies to "the whole workflow."
   - What's unclear: Should PAUSE iterate all EXECUTING steps and pause each one?
   - Recommendation: Yes -- iterate all active steps in EXECUTING state and submit a pause action for each. This matches the "applies to the whole workflow" requirement.

2. **Completion card timing interaction with auto-removal**
   - What we know: Manager auto-removes COMPLETED/ABORTED workflows. Context says "brief card shown for a few seconds."
   - What's unclear: Exact timing -- should the manager delay removal, or should the UI handle it locally?
   - Recommendation: Handle in UI with local state. When coordinator snapshot transitions to COMPLETED, capture workflow name in local state, set a 3-second timeout to clear it. Manager removal proceeds immediately. This keeps the data layer clean.

3. **Step timestamp for info cards**
   - What we know: The context says info cards show "timestamp of when the step entered that state." The engine trace has `order` but no timestamps.
   - What's unclear: Where to source the timestamp.
   - Recommendation: Use `Date.now()` at the React render level when the step first appears in a given state. Store in a `useRef<Map<string, number>>()` keyed by `${oid}:${state}`.

## Sources

### Primary (HIGH confidence)
- Embla Carousel official docs (https://www.embla-carousel.com/get-started/react/) - React setup, API, events, options
- Embla Carousel API methods (https://www.embla-carousel.com/api/methods/) - v8 method names verified
- Embla Carousel API options (https://www.embla-carousel.com/api/options/) - align, containScroll, slideChanges
- Embla Carousel API events (https://www.embla-carousel.com/api/events/) - select, settle, slideschanged, resize
- Embla Carousel slide sizes (https://www.embla-carousel.com/guides/slide-sizes/) - CSS flex approach
- Lucide icons (https://lucide.dev/icons/ellipsis-vertical) - EllipsisVertical icon name
- Codebase: WorkflowManager.ts, WorkflowCoordinator.ts, all hooks, AppShell.tsx, HeaderBar.tsx

### Secondary (MEDIUM confidence)
- npm: embla-carousel-react v8.6.0 latest stable (via WebSearch)

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Embla Carousel docs verified directly, all other deps already installed
- Architecture: HIGH - Built on verified Phase 5 data layer; patterns derived from existing codebase
- Pitfalls: HIGH - Derived from Embla docs, HTML5 API specs, and codebase analysis

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable libraries, no fast-moving APIs)
