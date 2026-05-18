# Waiting Step UI Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show steps in WAITING state as informational cards in the UI — displaying workflow name, step name, and the resource being waited on. No action buttons.

**Architecture:** Add `getWaitingSteps()` to the engine that returns WAITING steps with their blocked resource info. Pipe through the coordinator snapshot to the UI. Render a distinct light-blue informational card with no buttons.

**Tech Stack:** TypeScript, React, node:test (engine tests compile to dist/ then run via `node --test`), CSS

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `engines/web/src/types.ts` | Add `blockedOn` field to `PendingResourceState`, add `WaitingStepInfo` interface |
| Modify | `engines/web/src/engine.ts:538-546` | Store blocked command when entering WAITING; add `getWaitingSteps()` method |
| Modify | `engines/web-ui/src/coordinator/WorkflowCoordinator.ts` | Add `waitingSteps` to snapshot, call `getWaitingSteps()` in `sync()` |
| Create | `engines/web-ui/src/components/WaitingStepCard.tsx` | Pure display component for waiting steps |
| Modify | `engines/web-ui/src/components/WorkflowRunner.tsx` | Render waiting steps from snapshot |
| Modify | `engines/web-ui/src/App.css` | Light-blue waiting card styles |
| Modify | `engines/web/src/engine-script.test.ts` (or new test file) | Test `getWaitingSteps()` |

---

### Task 1: Add types for waiting step info

**Files:**
- Modify: `engines/web/src/types.ts:234-238`

- [ ] **Step 1: Add `blockedOn` to `PendingResourceState` and new `WaitingStepInfo` interface**

```typescript
// Replace PendingResourceState (line 234-238) with:
export interface PendingResourceState {
  stepOid: string;
  blockedOn: { resource_name: string; command_type: ResourceCommandType };
  remainingCommands: ResourceCommandSpecification[];
  completionCommands: ResourceCommandSpecification[];
}

// Add after PendingResourceState:
export interface WaitingStepInfo {
  step: StepInstance;
  workflowName: string;
  resourceName: string;
  commandType: ResourceCommandType;
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit -p engines/web/tsconfig.json`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add engines/web/src/types.ts
git commit -m "feat: add WaitingStepInfo type and blockedOn field to PendingResourceState"
```

---

### Task 2: Store blocked command and expose `getWaitingSteps()`

**Files:**
- Modify: `engines/web/src/engine.ts:538-546` (blocked branch in `processResourceCommands`)
- Modify: `engines/web/src/engine.ts` (add `getWaitingSteps()` method after `getExecutingSteps()`)

- [ ] **Step 1: Write failing test — `getWaitingSteps` returns blocked step info**

Create file: `engines/web/src/engine-waiting.test.ts`

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WorkflowEngine } from './engine.js';
import { InMemoryResourceManager } from './resource-manager.js';
import type { MasterWorkflowSpecification } from './types.js';

/**
 * Two parallel USER_INTERACTION steps both try to Acquire the same exclusive
 * resource. One gets it (EXECUTING), the other enters WAITING.
 */
function makeWaitingWorkflow(): MasterWorkflowSpecification {
  return {
    local_id: 'wf-waiting-ui',
    oid: 'wf-waiting-oid',
    version: '1.0.0',
    last_modified_date: '2026-03-12',
    schemaVersion: '4.0',
    resource_property_specifications: [
      { name: 'Printer', resource_type: 'binary exclusive use' },
    ],
    steps: [
      { local_id: 'start', oid: 'start', version: '1.0.0', last_modified_date: '2026-03-12', step_type: 'START' },
      { local_id: 'parallel', oid: 'parallel', version: '1.0.0', last_modified_date: '2026-03-12', step_type: 'PARALLEL' },
      {
        local_id: 'step-a', oid: 'step-a', version: '1.0.0', last_modified_date: '2026-03-12',
        step_type: 'USER_INTERACTION', description: 'Use Printer A',
        resource_command_specifications: [
          { command_type: 'Acquire', resource_name: 'Printer' },
          { command_type: 'Release', resource_name: 'Printer' },
        ],
      },
      {
        local_id: 'step-b', oid: 'step-b', version: '1.0.0', last_modified_date: '2026-03-12',
        step_type: 'USER_INTERACTION', description: 'Use Printer B',
        resource_command_specifications: [
          { command_type: 'Acquire', resource_name: 'Printer' },
          { command_type: 'Release', resource_name: 'Printer' },
        ],
      },
      { local_id: 'wait', oid: 'wait', version: '1.0.0', last_modified_date: '2026-03-12', step_type: 'WAIT ALL' },
      { local_id: 'end', oid: 'end', version: '1.0.0', last_modified_date: '2026-03-12', step_type: 'END' },
    ],
    connections: [
      { from_step_id: 'start', to_step_id: 'parallel' },
      { from_step_id: 'parallel', to_step_id: 'step-a' },
      { from_step_id: 'parallel', to_step_id: 'step-b' },
      { from_step_id: 'step-a', to_step_id: 'wait' },
      { from_step_id: 'step-b', to_step_id: 'wait' },
      { from_step_id: 'wait', to_step_id: 'end' },
    ],
  } as unknown as MasterWorkflowSpecification;
}

describe('getWaitingSteps', () => {
  it('returns WAITING step with resource info after parallel acquire contention', () => {
    const mgr = new InMemoryResourceManager();
    const engine = new WorkflowEngine(makeWaitingWorkflow(), { resourceManager: mgr });
    engine.start();

    // One step should be EXECUTING, one should be WAITING
    const executing = engine.getExecutingSteps();
    const waiting = engine.getWaitingSteps();

    assert.equal(executing.length, 1, 'one step executing');
    assert.equal(waiting.length, 1, 'one step waiting');

    const w = waiting[0];
    assert.equal(w.workflowName, 'wf-waiting-ui');
    assert.equal(w.resourceName, 'Printer');
    assert.equal(w.commandType, 'Acquire');
    assert.equal(w.step.state, 'WAITING');
  });

  it('returns empty array when no steps are waiting', () => {
    // Simple workflow with no resources
    const wf: MasterWorkflowSpecification = {
      local_id: 'wf-simple', oid: 'wf-simple', version: '1.0.0', last_modified_date: '2026-03-12',
      schemaVersion: '4.0',
      steps: [
        { local_id: 'start', oid: 'start', version: '1.0.0', last_modified_date: '2026-03-12', step_type: 'START' },
        { local_id: 'end', oid: 'end', version: '1.0.0', last_modified_date: '2026-03-12', step_type: 'END' },
      ],
      connections: [{ from_step_id: 'start', to_step_id: 'end' }],
    } as unknown as MasterWorkflowSpecification;

    const engine = new WorkflowEngine(wf);
    engine.start();
    assert.deepEqual(engine.getWaitingSteps(), []);
  });

});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd engines/web && npx tsc && node --test dist/engine-waiting.test.js`
Expected: FAIL — `engine.getWaitingSteps is not a function`

- [ ] **Step 3: Store blocked command in `processResourceCommands`**

In `engines/web/src/engine.ts`, at the blocked branch (line 538-546), add `remaining[i]` as `blockedOn`:

```typescript
      if (blocked) {
        const blockedCmd = remaining[i];
        // blockedOn stored separately because remainingCommands is slice(i+1) —
        // the blocked command itself is retried via the resource manager grant callback
        this.pendingResources.set(target.oid, {
          stepOid: target.oid,
          blockedOn: { resource_name: blockedCmd.resource_name, command_type: blockedCmd.command_type },
          remainingCommands: remaining.slice(i + 1),
          completionCommands,
        });
        this.recordTrace(target.oid, 'WAITING');
        target.state = 'WAITING';
        return false;
      }
```

- [ ] **Step 4: Add `getWaitingSteps()` method after `getExecutingSteps()` (after line 237)**

```typescript
  /** Get all waiting steps (blocked on resources) including child workflows. */
  getWaitingSteps(): WaitingStepInfo[] {
    const result: WaitingStepInfo[] = [];
    for (const step of this.steps.values()) {
      if (step.state === 'WAITING') {
        const pending = this.pendingResources.get(step.oid);
        result.push({
          step,
          workflowName: this.workflow.local_id,
          resourceName: pending?.blockedOn.resource_name ?? 'unknown',
          commandType: pending?.blockedOn.command_type ?? 'Acquire',
        });
      }
    }
    for (const childEngine of this.activeChildEngines.values()) {
      result.push(...childEngine.getWaitingSteps());
    }
    return result;
  }
```

Update the import at the top of engine.ts (line 1-13) to include `WaitingStepInfo`:

```typescript
import type {
  MasterWorkflowSpecification,
  MasterWorkflowStep,
  WorkflowConnection,
  StepState,
  WorkflowState,
  StepInstance,
  TraceEntry,
  UserAction,
  RoutingResult,
  PendingResourceState,
  ResourceCommandSpecification,
  WaitingStepInfo,
} from './types.js';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd engines/web && npx tsc && node --test dist/engine-waiting.test.js`
Expected: PASS

- [ ] **Step 6: Run all engine tests**

Run: `cd engines/web && npm run build && npm test`
Expected: All pass

- [ ] **Step 7: Commit**

```bash
git add engines/web/src/engine.ts engines/web/src/engine-waiting.test.ts engines/web/src/types.ts
git commit -m "feat: add getWaitingSteps() to engine with blocked resource info"
```

---

### Task 3: Pipe waiting steps through coordinator snapshot

**Files:**
- Modify: `engines/web-ui/src/coordinator/WorkflowCoordinator.ts:13-22` (CoordinatorSnapshot interface)
- Modify: `engines/web-ui/src/coordinator/WorkflowCoordinator.ts:113-126` (sync method)

- [ ] **Step 1: Add `waitingSteps` to `CoordinatorSnapshot`**

Import `WaitingStepInfo` from `@engine/types.js` and add to the interface:

```typescript
export interface CoordinatorSnapshot {
  workflowState: WorkflowState;
  executingSteps: StepInstance[];
  waitingSteps: WaitingStepInfo[];
  // ... rest unchanged
}
```

- [ ] **Step 2: Update initial snapshot (line 31) and `idleSnapshot` (line 144) to include `waitingSteps: []`**

Both places return a hardcoded `CoordinatorSnapshot` — add `waitingSteps: [],` to each:

```typescript
// In the initial snapshot field (line 31):
private snapshot: CoordinatorSnapshot = {
  workflowState: 'IDLE',
  executingSteps: [],
  waitingSteps: [],
  // ... rest unchanged
};

// In idleSnapshot() (line 144):
private idleSnapshot(): CoordinatorSnapshot {
  return { workflowState: 'IDLE', executingSteps: [], waitingSteps: [], trace: [], properties: {}, inputParameters: {}, error: null, mediaMap: {}, stepParams: {} };
}
```

- [ ] **Step 3: Update `sync()` to call `engine.getWaitingSteps()`**

```typescript
  private sync(): void {
    if (!this.engine) return;
    const trace = this.engine.getTrace();
    const workflowState = this.engine.getWorkflowState();
    const properties = this.engine.getAllProperties();
    const inputParameters = this.engine.getActiveInputParameters();
    const executingSteps = this.engine.getExecutingSteps();
    const waitingSteps = this.engine.getWaitingSteps();
    // ... stepParams unchanged ...

    this.publish({ workflowState, executingSteps, waitingSteps, trace, properties, inputParameters, error: null, mediaMap: this._mediaMap, stepParams });
    // ... rest unchanged
  }
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit -p engines/web-ui/tsconfig.json`
Expected: No new errors (WorkflowRunner will error since it destructures snapshot — that's fine, fixed in next task)

- [ ] **Step 5: Commit**

```bash
git add engines/web-ui/src/coordinator/WorkflowCoordinator.ts
git commit -m "feat: expose waitingSteps in coordinator snapshot"
```

---

### Task 4: Create WaitingStepCard component

**Files:**
- Create: `engines/web-ui/src/components/WaitingStepCard.tsx`

- [ ] **Step 1: Create the component**

```tsx
import type { WaitingStepInfo } from '@engine/types.js';

function describeWait(commandType: string, resourceName: string): string {
  switch (commandType) {
    case 'Acquire':
    case 'Acquire Pool Amount':
      return `Waiting to acquire "${resourceName}"`;
    case 'Send':
      return `Waiting to send on "${resourceName}"`;
    case 'Receive':
      return `Waiting to receive from "${resourceName}"`;
    case 'Synchronize':
      return `Waiting to synchronize on "${resourceName}"`;
    default:
      return `Waiting on "${resourceName}"`;
  }
}

interface WaitingStepCardProps {
  info: WaitingStepInfo;
}

export function WaitingStepCard({ info }: WaitingStepCardProps) {
  const stepName = info.step.step.description ?? info.step.stepType;
  return (
    <div className="waiting-step-card">
      <div className="waiting-card-workflow">{info.workflowName}</div>
      <div className="waiting-card-step">{stepName}</div>
      <div className="waiting-card-resource">
        {describeWait(info.commandType, info.resourceName)}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add engines/web-ui/src/components/WaitingStepCard.tsx
git commit -m "feat: add WaitingStepCard component"
```

---

### Task 5: Render waiting steps in WorkflowRunner

**Files:**
- Modify: `engines/web-ui/src/components/WorkflowRunner.tsx`

- [ ] **Step 1: Import WaitingStepCard and destructure `waitingSteps` from snapshot**

Add import at top:
```tsx
import { WaitingStepCard } from './WaitingStepCard';
```

Update destructuring (line 14):
```tsx
const { workflowState, executingSteps, waitingSteps, trace, properties, inputParameters, error, mediaMap, stepParams } = useWorkflowSnapshot();
```

- [ ] **Step 2: Add waiting steps section after the executing steps section (after line 113, before the `workflowState === 'COMPLETED'` block)**

```tsx
          {waitingSteps.length > 0 && (
            <section className="runner-waiting">
              <h3>Waiting Steps</h3>
              {waitingSteps.map((info) => (
                <WaitingStepCard key={info.step.oid} info={info} />
              ))}
            </section>
          )}
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit -p engines/web-ui/tsconfig.json`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add engines/web-ui/src/components/WorkflowRunner.tsx
git commit -m "feat: render waiting steps in WorkflowRunner"
```

---

### Task 6: Add CSS styles for waiting step cards

**Files:**
- Modify: `engines/web-ui/src/App.css`

- [ ] **Step 1: Add waiting card styles after the `.runner-complete` rule (after line 86)**

```css
/* ── Waiting step cards ── */
.runner-waiting { margin-bottom: 1.5rem; }
.runner-waiting h3 { margin-bottom: 0.5rem; font-size: 1rem; }
.waiting-step-card {
  background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px;
  padding: 1rem; margin-bottom: 0.5rem;
}
.waiting-card-workflow {
  font-size: 0.75rem; color: #3b82f6; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.025em; margin-bottom: 0.25rem;
}
.waiting-card-step {
  font-size: 1rem; font-weight: 600; color: #1a1a1a; margin-bottom: 0.5rem;
}
.waiting-card-resource {
  font-size: 0.875rem; color: #3b82f6;
}
```

- [ ] **Step 2: Visual check — run the dev server and load a workflow with resource contention**

Run: `cd engines/web-ui && npm run dev`
Load a workflow with parallel steps competing for a resource. Verify the waiting card appears with light blue styling, workflow name, step name, and resource message. No buttons present.

- [ ] **Step 3: Commit**

```bash
git add engines/web-ui/src/App.css
git commit -m "feat: add light-blue waiting step card styles"
```

---

### Task 7: Final integration test

- [ ] **Step 1: Run all engine tests**

Run: `cd engines/web && npm run build && npm test`
Expected: All pass

- [ ] **Step 2: Run type check on web-ui**

Run: `npx tsc --noEmit -p engines/web-ui/tsconfig.json`
Expected: No errors

- [ ] **Step 3: Commit all (if any unstaged changes remain)**

```bash
git add -A
git commit -m "feat: waiting step UI — show resource-blocked steps as informational cards"
```
