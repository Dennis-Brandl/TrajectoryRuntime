# Resource Management Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement runtime resource management for the TrajectoryRuntime workflow engine, enabling acquire/release semantics, queued access, sync rendezvous, and cross-workflow resource sharing.

**Architecture:** A `ResourceManager` interface with an `InMemoryResourceManager` implementation is injected into the engine via the `setup` parameter. Steps with resource commands gate activation on acquire success (entering WAITING if blocked) and release on completion. A `flushGranted()` pull pattern avoids re-entrancy in the synchronous drain loop.

**Tech Stack:** TypeScript, Node.js test runner, Ajv (validation), AdmZip (package loading)

**Spec:** `docs/superpowers/specs/2026-03-11-resource-management-design.md`

---

## File Map

### New Files

| File | Responsibility |
|---|---|
| `engines/web/src/resource-manager.ts` | `ResourceManager` interface, result types, `InMemoryResourceManager` class |
| `engines/web/src/resource-manager.test.ts` | Unit tests for InMemoryResourceManager (all 5 resource types, queuing, edge cases) |
| `engines/web/src/resource-helpers.ts` | Pure helpers: split commands into activation/completion, sort, extract sync |
| `engines/web/src/resource-helpers.test.ts` | Unit tests for resource command helpers |
| `engines/web/src/environment-loader.ts` | Parse WFenvir JSON, walk specs + child_libraries, register on ResourceManager |
| `engines/web/src/environment-loader.test.ts` | Unit tests for environment loading |
| `spec/conformance/resources/*.json` | 17 conformance test fixtures |

### Modified Files

| File | Change Summary |
|---|---|
| `engines/web/src/types.ts` | Add `ResourceCommandType` union, update `command_type` field, add `PendingResourceState`, `MasterEnvironmentLibrary` types, extend `TestFixture.setup` |
| `engines/web/src/engine.ts` | Accept `resourceManager` in setup, resource processing in activation/completion, WAITING state, `flushGranted` in drain loop, `releaseAll` on workflow end, pass to child engines |
| `engines/web/src/step-handlers.ts` | No changes needed (helpers go in new file) |
| `engines/web/src/validator.ts` | 6 new semantic validation rules for resource commands (rule 5 checked in engine.start()) |
| `engines/web/src/loader.ts` | Load WFenvir files from .WFmasterX packages |
| `engines/web/src/index.ts` | Export ResourceManager, InMemoryResourceManager, resource types |
| `engines/web/src/runner.ts` | Add `resources` subdirectory to fixture discovery, create ResourceManager for resource tests |

---

## Chunk 1: Types, Interface, and InMemoryResourceManager

### Task 1: Add resource types to types.ts

**Files:**
- Modify: `engines/web/src/types.ts:211-227` (ResourceCommandSpecification, ResourcePropertySpecification)
- Modify: `engines/web/src/types.ts:299-317` (TestFixture)

- [ ] **Step 1: Add ResourceCommandType union and update command_type**

In `engines/web/src/types.ts`, add the union type before `ResourceCommandSpecification` (before line 211) and update the `command_type` field:

```typescript
export type ResourceCommandType =
  | 'Acquire' | 'Release'
  | 'Acquire Pool Amount' | 'Release Pool Amount'
  | 'Send' | 'Receive' | 'Synchronize';
```

Update `ResourceCommandSpecification.command_type` from `string` to `ResourceCommandType`:

```typescript
export interface ResourceCommandSpecification {
  oid?: string;
  command_type: ResourceCommandType;
  resource_name: string;
  amount?: number;
  target?: string;
  source?: string;
}
```

- [ ] **Step 2: Add PendingResourceState interface**

After `ResourcePropertySpecification` (after line 227), add:

```typescript
export interface PendingResourceState {
  stepOid: string;
  remainingCommands: ResourceCommandSpecification[];
  completionCommands: ResourceCommandSpecification[];
}
```

- [ ] **Step 3: Add MasterEnvironmentLibrary types**

After `PendingResourceState`, add:

```typescript
export interface MasterEnvironmentSpecification {
  local_id: string;
  oid: string;
  description?: string;
  version: string;
  last_modified_date: string;
  library_name?: string;
  included_actions?: unknown[];
  value_property_specifications?: PropertySpecification[];
  action_property_specifications?: PropertySpecification[];
  resource_property_specifications?: ResourcePropertySpecification[];
}

export interface MasterEnvironmentLibrary {
  local_id: string;
  oid: string;
  description?: string;
  version: string;
  last_modified_date: string;
  environment_specifications: MasterEnvironmentSpecification[];
  child_libraries?: MasterEnvironmentLibrary[];
}
```

- [ ] **Step 4: Extend TestFixture.setup with resources field**

Update the `setup` property in `TestFixture` (line 305-308):

```typescript
  setup?: {
    starting_parameters?: Record<string, string>;
    initial_properties?: Record<string, string>;
    resources?: ResourcePropertySpecification[];
  };
```

- [ ] **Step 5: Verify build compiles**

Run: `cd /c/TrajectoryRuntime/engines/web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add engines/web/src/types.ts
git commit -m "feat: add resource management types (ResourceCommandType, PendingResourceState, MasterEnvironmentLibrary)"
```

---

### Task 2: ResourceManager interface and result types

**Files:**
- Create: `engines/web/src/resource-manager.ts`

- [ ] **Step 1: Create resource-manager.ts with interface and result types**

Create `engines/web/src/resource-manager.ts`:

```typescript
import type { ResourcePropertySpecification } from './types.js';

// ── Result Types ──

export type AcquireResult = { granted: true; name?: string } | { granted: false };
export type ReceiveResult = { available: true; data: string } | { available: false };
export type SyncResult = { ready: true } | { ready: false };
export type ReleaseAllResult = { released: string[]; warned: boolean };

// ── Interface ──

export interface ResourceManager {
  registerResource(spec: ResourcePropertySpecification, ownerId: string): void;
  unregisterResources(ownerId: string): void;

  acquire(resourceName: string, requesterId: string): AcquireResult;
  release(resourceName: string, requesterId: string): void;

  acquireAmount(resourceName: string, requesterId: string, amount: number): AcquireResult;
  releaseAmount(resourceName: string, requesterId: string, amount: number): void;

  acquireNamed(resourceName: string, requesterId: string): AcquireResult;
  releaseNamed(resourceName: string, requesterId: string, name: string): void;

  send(resourceName: string, requesterId: string, data: string): SyncResult;
  receive(resourceName: string, requesterId: string): ReceiveResult;
  synchronize(resourceName: string, requesterId: string): SyncResult;

  getSyncData(requesterId: string): string | undefined;
  clearSyncData(requesterId: string): void;

  flushGranted(): string[];
  releaseAll(ownerId: string): ReleaseAllResult;
  hasResource(resourceName: string): boolean;
}
```

Note: `hasResource()`, `getSyncData()`, and `clearSyncData()` are additions beyond the spec's interface, needed for environment loader idempotency and sync data delivery across the interface boundary.
```

- [ ] **Step 2: Verify build compiles**

Run: `cd /c/TrajectoryRuntime/engines/web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add engines/web/src/resource-manager.ts
git commit -m "feat: add ResourceManager interface and result types"
```

---

### Task 3: InMemoryResourceManager — binary exclusive use

**Files:**
- Modify: `engines/web/src/resource-manager.ts`
- Create: `engines/web/src/resource-manager.test.ts`

- [ ] **Step 1: Write failing tests for binary exclusive use**

Create `engines/web/src/resource-manager.test.ts`:

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryResourceManager } from './resource-manager.js';

describe('InMemoryResourceManager — binary exclusive use', () => {
  function makeManager() {
    const mgr = new InMemoryResourceManager();
    mgr.registerResource({ name: 'Lock', resource_type: 'binary exclusive use' }, 'wf1');
    return mgr;
  }

  it('acquire succeeds when resource is free', () => {
    const mgr = makeManager();
    const result = mgr.acquire('Lock', 'wf1:step1');
    assert.deepEqual(result, { granted: true });
  });

  it('acquire fails when resource is held', () => {
    const mgr = makeManager();
    mgr.acquire('Lock', 'wf1:step1');
    const result = mgr.acquire('Lock', 'wf1:step2');
    assert.deepEqual(result, { granted: false });
  });

  it('release frees the resource for next acquirer', () => {
    const mgr = makeManager();
    mgr.acquire('Lock', 'wf1:step1');
    mgr.release('Lock', 'wf1:step1');
    const result = mgr.acquire('Lock', 'wf1:step2');
    assert.deepEqual(result, { granted: true });
  });

  it('queued request is granted after release via flushGranted', () => {
    const mgr = makeManager();
    mgr.acquire('Lock', 'wf1:step1');
    mgr.acquire('Lock', 'wf1:step2'); // queued
    mgr.release('Lock', 'wf1:step1');
    const granted = mgr.flushGranted();
    assert.deepEqual(granted, ['wf1:step2']);
    // step2 now holds the lock
    const result = mgr.acquire('Lock', 'wf1:step3');
    assert.deepEqual(result, { granted: false });
  });

  it('release of unowned resource is no-op', () => {
    const mgr = makeManager();
    mgr.release('Lock', 'wf1:step1'); // no-op, no throw
  });

  it('double release is no-op', () => {
    const mgr = makeManager();
    mgr.acquire('Lock', 'wf1:step1');
    mgr.release('Lock', 'wf1:step1');
    mgr.release('Lock', 'wf1:step1'); // no-op
  });

  it('throws on unregistered resource', () => {
    const mgr = new InMemoryResourceManager();
    assert.throws(() => mgr.acquire('NoSuch', 'wf1:step1'), /not registered/);
  });

  it('FIFO queue order', () => {
    const mgr = makeManager();
    mgr.acquire('Lock', 'wf1:s1');
    mgr.acquire('Lock', 'wf1:s2'); // queued
    mgr.acquire('Lock', 'wf1:s3'); // queued
    mgr.release('Lock', 'wf1:s1');
    assert.deepEqual(mgr.flushGranted(), ['wf1:s2']);
    mgr.release('Lock', 'wf1:s2');
    assert.deepEqual(mgr.flushGranted(), ['wf1:s3']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /c/TrajectoryRuntime/engines/web && npx tsc && node --test dist/resource-manager.test.js`
Expected: FAIL (InMemoryResourceManager not yet implemented)

- [ ] **Step 3: Implement InMemoryResourceManager class with binary exclusive support**

In `engines/web/src/resource-manager.ts`, after the interface, add:

```typescript
// ── Internal State Types ──

interface BinaryExclusiveState {
  type: 'binary exclusive use';
  holder: string | null;
  queue: string[];
  ownerId: string;
}

interface BinarySharedState {
  type: 'binary shared use with pool limits';
  holders: Set<string>;
  useLimit: number;
  queue: string[];
  ownerId: string;
}

interface CountableState {
  type: 'countable use with pool limits';
  inUse: number;
  useLimit: number;
  queue: { requesterId: string; amount: number }[];
  heldAmounts: Map<string, number>;
  ownerId: string;
}

interface NamedPoolState {
  type: 'named pool';
  available: string[];
  assigned: Map<string, string>;
  queue: string[];
  ownerId: string;
}

interface SyncState {
  type: 'sync';
  sendQueue: { requesterId: string; data: string }[];
  receiveQueue: string[];
  pendingSync: string[];
  ownerId: string;
}

type ResourceState = BinaryExclusiveState | BinarySharedState | CountableState | NamedPoolState | SyncState;

// ── Implementation ──

export class InMemoryResourceManager implements ResourceManager {
  private resources = new Map<string, ResourceState>();
  private pendingGrants: string[] = [];
  private syncMatchedData = new Map<string, string>();

  registerResource(spec: ResourcePropertySpecification, ownerId: string): void {
    if (this.resources.has(spec.name)) return; // idempotent
    switch (spec.resource_type) {
      case 'binary exclusive use':
        this.resources.set(spec.name, { type: 'binary exclusive use', holder: null, queue: [], ownerId });
        break;
      case 'binary shared use with pool limits':
        this.resources.set(spec.name, { type: 'binary shared use with pool limits', holders: new Set(), useLimit: spec.use_limit ?? 1, queue: [], ownerId });
        break;
      case 'countable use with pool limits':
        this.resources.set(spec.name, { type: 'countable use with pool limits', inUse: 0, useLimit: spec.use_limit ?? 1, queue: [], heldAmounts: new Map(), ownerId });
        break;
      case 'named pool':
        this.resources.set(spec.name, { type: 'named pool', available: [...(spec.names ?? [])], assigned: new Map(), queue: [], ownerId });
        break;
      case 'sync':
        this.resources.set(spec.name, { type: 'sync', sendQueue: [], receiveQueue: [], pendingSync: [], ownerId });
        break;
    }
  }

  unregisterResources(ownerId: string): void {
    for (const [name, state] of this.resources) {
      if (state.ownerId === ownerId) {
        this.resources.delete(name);
      }
    }
  }

  hasResource(resourceName: string): boolean {
    return this.resources.has(resourceName);
  }

  private getResource(name: string): ResourceState {
    const r = this.resources.get(name);
    if (!r) throw new Error(`Resource "${name}" is not registered`);
    return r;
  }

  acquire(resourceName: string, requesterId: string): AcquireResult {
    const r = this.getResource(resourceName);
    if (r.type === 'binary exclusive use') {
      if (r.holder === null) {
        r.holder = requesterId;
        return { granted: true };
      }
      r.queue.push(requesterId);
      return { granted: false };
    }
    if (r.type === 'binary shared use with pool limits') {
      if (r.holders.size < r.useLimit && r.queue.length === 0) {
        r.holders.add(requesterId);
        return { granted: true };
      }
      r.queue.push(requesterId);
      return { granted: false };
    }
    if (r.type === 'named pool') {
      return this.acquireNamed(resourceName, requesterId);
    }
    throw new Error(`acquire() not supported for resource type "${r.type}"`);
  }

  release(resourceName: string, requesterId: string): void {
    const r = this.getResource(resourceName);
    if (r.type === 'binary exclusive use') {
      if (r.holder !== requesterId) return; // no-op
      r.holder = null;
      this.tryGrantBinaryExclusive(r);
      return;
    }
    if (r.type === 'binary shared use with pool limits') {
      if (!r.holders.has(requesterId)) return; // no-op
      r.holders.delete(requesterId);
      this.tryGrantBinaryShared(r);
      return;
    }
    if (r.type === 'named pool') {
      // For plain release on named pool, we need the name from the caller
      // This path shouldn't be hit — use releaseNamed instead
      return;
    }
  }

  private tryGrantBinaryExclusive(r: BinaryExclusiveState): void {
    if (r.holder === null && r.queue.length > 0) {
      const next = r.queue.shift()!;
      r.holder = next;
      this.pendingGrants.push(next);
    }
  }

  private tryGrantBinaryShared(r: BinarySharedState): void {
    while (r.holders.size < r.useLimit && r.queue.length > 0) {
      const next = r.queue.shift()!;
      r.holders.add(next);
      this.pendingGrants.push(next);
    }
  }

  acquireAmount(resourceName: string, requesterId: string, amount: number): AcquireResult {
    const r = this.getResource(resourceName);
    if (r.type !== 'countable use with pool limits') throw new Error(`acquireAmount() not supported for "${r.type}"`);
    if (r.inUse + amount <= r.useLimit && r.queue.length === 0) {
      r.inUse += amount;
      r.heldAmounts.set(requesterId, (r.heldAmounts.get(requesterId) ?? 0) + amount);
      return { granted: true };
    }
    r.queue.push({ requesterId, amount });
    return { granted: false };
  }

  releaseAmount(resourceName: string, requesterId: string, amount: number): void {
    const r = this.getResource(resourceName);
    if (r.type !== 'countable use with pool limits') throw new Error(`releaseAmount() not supported for "${r.type}"`);
    const held = r.heldAmounts.get(requesterId) ?? 0;
    if (held < amount) return; // no-op with warning
    r.inUse -= amount;
    const remaining = held - amount;
    if (remaining === 0) {
      r.heldAmounts.delete(requesterId);
    } else {
      r.heldAmounts.set(requesterId, remaining);
    }
    this.tryGrantCountable(r);
  }

  private tryGrantCountable(r: CountableState): void {
    // Strict FIFO: only grant head of queue
    while (r.queue.length > 0) {
      const head = r.queue[0];
      if (r.inUse + head.amount <= r.useLimit) {
        r.queue.shift();
        r.inUse += head.amount;
        r.heldAmounts.set(head.requesterId, (r.heldAmounts.get(head.requesterId) ?? 0) + head.amount);
        this.pendingGrants.push(head.requesterId);
      } else {
        break; // strict FIFO — don't skip
      }
    }
  }

  acquireNamed(resourceName: string, requesterId: string): AcquireResult {
    const r = this.getResource(resourceName);
    if (r.type !== 'named pool') throw new Error(`acquireNamed() not supported for "${r.type}"`);
    if (r.available.length > 0 && r.queue.length === 0) {
      const name = r.available.shift()!;
      r.assigned.set(requesterId, name);
      return { granted: true, name };
    }
    r.queue.push(requesterId);
    return { granted: false };
  }

  releaseNamed(resourceName: string, requesterId: string, name: string): void {
    const r = this.getResource(resourceName);
    if (r.type !== 'named pool') throw new Error(`releaseNamed() not supported for "${r.type}"`);
    const held = r.assigned.get(requesterId);
    if (held !== name) return; // no-op
    r.assigned.delete(requesterId);
    r.available.push(name);
    this.tryGrantNamed(r);
  }

  private tryGrantNamed(r: NamedPoolState): void {
    while (r.available.length > 0 && r.queue.length > 0) {
      const next = r.queue.shift()!;
      const name = r.available.shift()!;
      r.assigned.set(next, name);
      this.pendingGrants.push(next);
    }
  }

  send(resourceName: string, requesterId: string, data: string): SyncResult {
    const r = this.getResource(resourceName);
    if (r.type !== 'sync') throw new Error(`send() not supported for "${r.type}"`);
    if (r.receiveQueue.length > 0) {
      const receiverId = r.receiveQueue.shift()!;
      this.pendingGrants.push(requesterId);
      this.pendingGrants.push(receiverId);
      this.syncMatchedData.set(receiverId, data);
      return { ready: true };
    }
    r.sendQueue.push({ requesterId, data });
    return { ready: false };
  }

  receive(resourceName: string, requesterId: string): ReceiveResult {
    const r = this.getResource(resourceName);
    if (r.type !== 'sync') throw new Error(`receive() not supported for "${r.type}"`);
    if (r.sendQueue.length > 0) {
      const sender = r.sendQueue.shift()!;
      this.pendingGrants.push(sender.requesterId);
      return { available: true, data: sender.data };
    }
    r.receiveQueue.push(requesterId);
    return { available: false };
  }

  synchronize(resourceName: string, requesterId: string): SyncResult {
    const r = this.getResource(resourceName);
    if (r.type !== 'sync') throw new Error(`synchronize() not supported for "${r.type}"`);
    r.pendingSync.push(requesterId);
    if (r.pendingSync.length >= 2) {
      const first = r.pendingSync.shift()!;
      const second = r.pendingSync.shift()!;
      this.pendingGrants.push(first);
      this.pendingGrants.push(second);
      return { ready: true };
    }
    return { ready: false };
  }

  getSyncData(requesterId: string): string | undefined {
    return this.syncMatchedData.get(requesterId);
  }

  clearSyncData(requesterId: string): void {
    this.syncMatchedData.delete(requesterId);
  }

  flushGranted(): string[] {
    const result = [...this.pendingGrants];
    this.pendingGrants = [];
    return result;
  }

  releaseAll(ownerId: string): ReleaseAllResult {
    const released: string[] = [];
    const prefix = ownerId + ':';

    for (const [name, state] of this.resources) {
      if (state.type === 'binary exclusive use') {
        if (state.holder?.startsWith(prefix)) {
          released.push(name);
          state.holder = null;
          this.tryGrantBinaryExclusive(state);
        }
        state.queue = state.queue.filter(id => !id.startsWith(prefix));
      } else if (state.type === 'binary shared use with pool limits') {
        for (const holder of state.holders) {
          if (holder.startsWith(prefix)) {
            released.push(name);
            state.holders.delete(holder);
          }
        }
        state.queue = state.queue.filter(id => !id.startsWith(prefix));
        this.tryGrantBinaryShared(state);
      } else if (state.type === 'countable use with pool limits') {
        for (const [holder, amount] of state.heldAmounts) {
          if (holder.startsWith(prefix)) {
            released.push(name);
            state.inUse -= amount;
            state.heldAmounts.delete(holder);
          }
        }
        state.queue = state.queue.filter(q => !q.requesterId.startsWith(prefix));
        this.tryGrantCountable(state);
      } else if (state.type === 'named pool') {
        for (const [holder, assignedName] of state.assigned) {
          if (holder.startsWith(prefix)) {
            released.push(name);
            state.assigned.delete(holder);
            state.available.push(assignedName);
          }
        }
        state.queue = state.queue.filter(id => !id.startsWith(prefix));
        this.tryGrantNamed(state);
      } else if (state.type === 'sync') {
        state.sendQueue = state.sendQueue.filter(s => !s.requesterId.startsWith(prefix));
        state.receiveQueue = state.receiveQueue.filter(id => !id.startsWith(prefix));
        state.pendingSync = state.pendingSync.filter(id => !id.startsWith(prefix));
      }
    }

    return { released, warned: released.length > 0 };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /c/TrajectoryRuntime/engines/web && npx tsc && node --test dist/resource-manager.test.js`
Expected: All 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add engines/web/src/resource-manager.ts engines/web/src/resource-manager.test.ts
git commit -m "feat: implement InMemoryResourceManager with binary exclusive use"
```

---

### Task 4: InMemoryResourceManager — binary shared use with pool limits

**Files:**
- Modify: `engines/web/src/resource-manager.test.ts`

- [ ] **Step 1: Write failing tests for binary shared use**

Append to `engines/web/src/resource-manager.test.ts`:

```typescript
describe('InMemoryResourceManager — binary shared use with pool limits', () => {
  function makeManager() {
    const mgr = new InMemoryResourceManager();
    mgr.registerResource({ name: 'Pool', resource_type: 'binary shared use with pool limits', use_limit: 2 }, 'wf1');
    return mgr;
  }

  it('multiple acquires up to use_limit succeed', () => {
    const mgr = makeManager();
    assert.deepEqual(mgr.acquire('Pool', 'wf1:s1'), { granted: true });
    assert.deepEqual(mgr.acquire('Pool', 'wf1:s2'), { granted: true });
  });

  it('acquire beyond use_limit fails', () => {
    const mgr = makeManager();
    mgr.acquire('Pool', 'wf1:s1');
    mgr.acquire('Pool', 'wf1:s2');
    assert.deepEqual(mgr.acquire('Pool', 'wf1:s3'), { granted: false });
  });

  it('release opens slot for queued request', () => {
    const mgr = makeManager();
    mgr.acquire('Pool', 'wf1:s1');
    mgr.acquire('Pool', 'wf1:s2');
    mgr.acquire('Pool', 'wf1:s3'); // queued
    mgr.release('Pool', 'wf1:s1');
    assert.deepEqual(mgr.flushGranted(), ['wf1:s3']);
  });
});
```

- [ ] **Step 2: Run tests to verify they pass** (implementation already handles this)

Run: `cd /c/TrajectoryRuntime/engines/web && npx tsc && node --test dist/resource-manager.test.js`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add engines/web/src/resource-manager.test.ts
git commit -m "test: add binary shared use pool tests"
```

---

### Task 5: InMemoryResourceManager — countable use with pool limits

**Files:**
- Modify: `engines/web/src/resource-manager.test.ts`

- [ ] **Step 1: Write tests for countable pool**

Append to `engines/web/src/resource-manager.test.ts`:

```typescript
describe('InMemoryResourceManager — countable use with pool limits', () => {
  function makeManager() {
    const mgr = new InMemoryResourceManager();
    mgr.registerResource({ name: 'Slots', resource_type: 'countable use with pool limits', use_limit: 10 }, 'wf1');
    return mgr;
  }

  it('acquire amount within limit', () => {
    const mgr = makeManager();
    assert.deepEqual(mgr.acquireAmount('Slots', 'wf1:s1', 5), { granted: true });
    assert.deepEqual(mgr.acquireAmount('Slots', 'wf1:s2', 5), { granted: true });
  });

  it('acquire amount exceeding limit fails', () => {
    const mgr = makeManager();
    mgr.acquireAmount('Slots', 'wf1:s1', 8);
    assert.deepEqual(mgr.acquireAmount('Slots', 'wf1:s2', 5), { granted: false });
  });

  it('strict FIFO: large request at head blocks smaller request behind', () => {
    const mgr = makeManager();
    mgr.acquireAmount('Slots', 'wf1:s1', 8);
    mgr.acquireAmount('Slots', 'wf1:s2', 5); // queued (needs 5, only 2 free)
    mgr.acquireAmount('Slots', 'wf1:s3', 1); // queued behind s2
    mgr.releaseAmount('Slots', 'wf1:s1', 3); // now 5 free — s2 can be served
    assert.deepEqual(mgr.flushGranted(), ['wf1:s2']);
    // s3 still queued (s2 now holds 5, total 10)
    assert.deepEqual(mgr.flushGranted(), []);
  });

  it('releaseAmount with amount exceeding held is no-op', () => {
    const mgr = makeManager();
    mgr.acquireAmount('Slots', 'wf1:s1', 3);
    mgr.releaseAmount('Slots', 'wf1:s1', 5); // no-op
    // Still holding 3
    assert.deepEqual(mgr.acquireAmount('Slots', 'wf1:s2', 8), { granted: false });
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd /c/TrajectoryRuntime/engines/web && npx tsc && node --test dist/resource-manager.test.js`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add engines/web/src/resource-manager.test.ts
git commit -m "test: add countable pool tests with strict FIFO"
```

---

### Task 6: InMemoryResourceManager — named pool

**Files:**
- Modify: `engines/web/src/resource-manager.test.ts`

- [ ] **Step 1: Write tests for named pool**

Append to `engines/web/src/resource-manager.test.ts`:

```typescript
describe('InMemoryResourceManager — named pool', () => {
  function makeManager() {
    const mgr = new InMemoryResourceManager();
    mgr.registerResource({
      name: 'Docks',
      resource_type: 'named pool',
      names: ['Dock 1', 'Dock 2', 'Dock 3'],
    }, 'wf1');
    return mgr;
  }

  it('acquire assigns any available name', () => {
    const mgr = makeManager();
    const result = mgr.acquireNamed('Docks', 'wf1:s1');
    assert.equal(result.granted, true);
    assert.ok('name' in result && result.name);
  });

  it('exhaust pool then queue', () => {
    const mgr = makeManager();
    mgr.acquireNamed('Docks', 'wf1:s1');
    mgr.acquireNamed('Docks', 'wf1:s2');
    mgr.acquireNamed('Docks', 'wf1:s3');
    assert.deepEqual(mgr.acquireNamed('Docks', 'wf1:s4'), { granted: false });
  });

  it('release returns name to pool', () => {
    const mgr = makeManager();
    const r1 = mgr.acquireNamed('Docks', 'wf1:s1');
    assert.ok(r1.granted && r1.name);
    mgr.releaseNamed('Docks', 'wf1:s1', r1.name);
    const r2 = mgr.acquireNamed('Docks', 'wf1:s2');
    assert.equal(r2.granted, true);
  });

  it('release grants to queued request', () => {
    const mgr = makeManager();
    const r1 = mgr.acquireNamed('Docks', 'wf1:s1');
    mgr.acquireNamed('Docks', 'wf1:s2');
    mgr.acquireNamed('Docks', 'wf1:s3');
    mgr.acquireNamed('Docks', 'wf1:s4'); // queued
    assert.ok(r1.granted && r1.name);
    mgr.releaseNamed('Docks', 'wf1:s1', r1.name);
    const granted = mgr.flushGranted();
    assert.deepEqual(granted, ['wf1:s4']);
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd /c/TrajectoryRuntime/engines/web && npx tsc && node --test dist/resource-manager.test.js`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add engines/web/src/resource-manager.test.ts
git commit -m "test: add named pool tests"
```

---

### Task 7: InMemoryResourceManager — sync resources

**Files:**
- Modify: `engines/web/src/resource-manager.test.ts`

- [ ] **Step 1: Write tests for sync resources**

Append to `engines/web/src/resource-manager.test.ts`:

```typescript
describe('InMemoryResourceManager — sync', () => {
  function makeManager() {
    const mgr = new InMemoryResourceManager();
    mgr.registerResource({ name: 'Chan', resource_type: 'sync' }, 'wf1');
    return mgr;
  }

  it('send then receive: sender waits, receiver picks up data', () => {
    const mgr = makeManager();
    const sendResult = mgr.send('Chan', 'wf1:sender', 'hello');
    assert.deepEqual(sendResult, { ready: false }); // sender waits
    const recvResult = mgr.receive('Chan', 'wf1:receiver');
    assert.deepEqual(recvResult, { available: true, data: 'hello' });
    // sender should be granted
    const granted = mgr.flushGranted();
    assert.ok(granted.includes('wf1:sender'));
  });

  it('receive then send: receiver waits, sender delivers', () => {
    const mgr = makeManager();
    const recvResult = mgr.receive('Chan', 'wf1:receiver');
    assert.deepEqual(recvResult, { available: false }); // receiver waits
    const sendResult = mgr.send('Chan', 'wf1:sender', 'world');
    assert.deepEqual(sendResult, { ready: true }); // matched
    const granted = mgr.flushGranted();
    assert.ok(granted.includes('wf1:receiver'));
    assert.ok(granted.includes('wf1:sender'));
    // receiver should be able to get the data
    const data = mgr.getSyncData('wf1:receiver');
    assert.equal(data, 'world');
  });

  it('synchronize: both sides wait, then both released', () => {
    const mgr = makeManager();
    assert.deepEqual(mgr.synchronize('Chan', 'wf1:s1'), { ready: false });
    assert.deepEqual(mgr.synchronize('Chan', 'wf1:s2'), { ready: true });
    const granted = mgr.flushGranted();
    assert.ok(granted.includes('wf1:s1'));
    assert.ok(granted.includes('wf1:s2'));
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd /c/TrajectoryRuntime/engines/web && npx tsc && node --test dist/resource-manager.test.js`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add engines/web/src/resource-manager.test.ts
git commit -m "test: add sync resource tests (send/receive/synchronize)"
```

---

### Task 8: InMemoryResourceManager — releaseAll and cleanup

**Files:**
- Modify: `engines/web/src/resource-manager.test.ts`

- [ ] **Step 1: Write tests for releaseAll**

Append to `engines/web/src/resource-manager.test.ts`:

```typescript
describe('InMemoryResourceManager — releaseAll', () => {
  it('releases all held resources and warns', () => {
    const mgr = new InMemoryResourceManager();
    mgr.registerResource({ name: 'Lock', resource_type: 'binary exclusive use' }, 'wf1');
    mgr.registerResource({ name: 'Pool', resource_type: 'binary shared use with pool limits', use_limit: 5 }, 'wf1');
    mgr.acquire('Lock', 'wf1:s1');
    mgr.acquire('Pool', 'wf1:s2');
    const result = mgr.releaseAll('wf1');
    assert.equal(result.warned, true);
    assert.ok(result.released.includes('Lock'));
    assert.ok(result.released.includes('Pool'));
  });

  it('no warning when nothing held', () => {
    const mgr = new InMemoryResourceManager();
    mgr.registerResource({ name: 'Lock', resource_type: 'binary exclusive use' }, 'wf1');
    const result = mgr.releaseAll('wf1');
    assert.equal(result.warned, false);
    assert.deepEqual(result.released, []);
  });

  it('releaseAll unblocks waiters from other workflows', () => {
    const mgr = new InMemoryResourceManager();
    mgr.registerResource({ name: 'Lock', resource_type: 'binary exclusive use' }, 'env');
    mgr.acquire('Lock', 'wf1:s1');
    mgr.acquire('Lock', 'wf2:s1'); // queued
    mgr.releaseAll('wf1');
    const granted = mgr.flushGranted();
    assert.deepEqual(granted, ['wf2:s1']);
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd /c/TrajectoryRuntime/engines/web && npx tsc && node --test dist/resource-manager.test.js`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add engines/web/src/resource-manager.test.ts
git commit -m "test: add releaseAll tests with cross-workflow unblocking"
```

---

## Chunk 2: Resource Helpers and Validation

### Task 9: Resource command helpers

**Files:**
- Create: `engines/web/src/resource-helpers.ts`
- Create: `engines/web/src/resource-helpers.test.ts`

- [ ] **Step 1: Write failing tests for resource helpers**

Create `engines/web/src/resource-helpers.test.ts`:

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { splitResourceCommands, sortActivationCommands } from './resource-helpers.js';
import type { ResourceCommandSpecification } from './types.js';

describe('splitResourceCommands', () => {
  it('separates activation and completion commands', () => {
    const commands: ResourceCommandSpecification[] = [
      { command_type: 'Acquire', resource_name: 'Lock' },
      { command_type: 'Release', resource_name: 'Lock' },
      { command_type: 'Send', resource_name: 'Chan' },
      { command_type: 'Release Pool Amount', resource_name: 'Pool', amount: 5 },
    ];
    const { activation, completion } = splitResourceCommands(commands);
    assert.equal(activation.length, 2); // Acquire, Send
    assert.equal(completion.length, 2); // Release, Release Pool Amount
  });
});

describe('sortActivationCommands', () => {
  it('puts sync command first, then alphabetical by resource_name', () => {
    const commands: ResourceCommandSpecification[] = [
      { command_type: 'Acquire', resource_name: 'Zebra' },
      { command_type: 'Send', resource_name: 'Chan' },
      { command_type: 'Acquire', resource_name: 'Alpha' },
    ];
    const sorted = sortActivationCommands(commands);
    assert.equal(sorted[0].command_type, 'Send');     // sync first
    assert.equal(sorted[1].resource_name, 'Alpha');    // alphabetical
    assert.equal(sorted[2].resource_name, 'Zebra');
  });

  it('sorts completion commands alphabetically', () => {
    const commands: ResourceCommandSpecification[] = [
      { command_type: 'Release', resource_name: 'Zebra' },
      { command_type: 'Release', resource_name: 'Alpha' },
    ];
    const sorted = sortActivationCommands(commands);
    assert.equal(sorted[0].resource_name, 'Alpha');
    assert.equal(sorted[1].resource_name, 'Zebra');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /c/TrajectoryRuntime/engines/web && npx tsc && node --test dist/resource-helpers.test.js`
Expected: FAIL

- [ ] **Step 3: Implement resource-helpers.ts**

Create `engines/web/src/resource-helpers.ts`:

```typescript
import type { ResourceCommandSpecification } from './types.js';

const ACTIVATION_COMMANDS = new Set([
  'Acquire', 'Acquire Pool Amount', 'Send', 'Receive', 'Synchronize',
]);

const SYNC_COMMANDS = new Set(['Send', 'Receive', 'Synchronize']);

export function splitResourceCommands(
  commands: ResourceCommandSpecification[],
): { activation: ResourceCommandSpecification[]; completion: ResourceCommandSpecification[] } {
  const activation: ResourceCommandSpecification[] = [];
  const completion: ResourceCommandSpecification[] = [];
  for (const cmd of commands) {
    if (ACTIVATION_COMMANDS.has(cmd.command_type)) {
      activation.push(cmd);
    } else {
      completion.push(cmd);
    }
  }
  return { activation, completion };
}

export function sortActivationCommands(
  commands: ResourceCommandSpecification[],
): ResourceCommandSpecification[] {
  return [...commands].sort((a, b) => {
    const aIsSync = SYNC_COMMANDS.has(a.command_type) ? 0 : 1;
    const bIsSync = SYNC_COMMANDS.has(b.command_type) ? 0 : 1;
    if (aIsSync !== bIsSync) return aIsSync - bIsSync;
    return a.resource_name.localeCompare(b.resource_name);
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /c/TrajectoryRuntime/engines/web && npx tsc && node --test dist/resource-helpers.test.js`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add engines/web/src/resource-helpers.ts engines/web/src/resource-helpers.test.ts
git commit -m "feat: add resource command helpers (split, sort)"
```

---

### Task 10: Semantic validation for resource commands

**Files:**
- Modify: `engines/web/src/validator.ts:58-141` (semanticValidation function)

- [ ] **Step 1: Write failing conformance test fixtures for validation**

Create `spec/conformance/resources/res-validation-001-missing-resource.json`:

```json
{
  "test_id": "res-validation-001",
  "name": "Resource command references nonexistent resource",
  "category": "validation",
  "tags": ["resource", "validation"],
  "workflow": {
    "local_id": "wf", "oid": "wf", "version": "1.0.0", "last_modified_date": "2026-03-11",
    "steps": [
      { "local_id": "start", "oid": "start", "version": "1.0.0", "last_modified_date": "2026-03-11", "step_type": "START" },
      {
        "local_id": "step1", "oid": "step1", "version": "1.0.0", "last_modified_date": "2026-03-11",
        "step_type": "USER_INTERACTION",
        "resource_command_specifications": [
          { "command_type": "Acquire", "resource_name": "NoSuchResource" }
        ]
      },
      { "local_id": "end", "oid": "end", "version": "1.0.0", "last_modified_date": "2026-03-11", "step_type": "END" }
    ],
    "connections": [
      { "from_step_id": "start", "to_step_id": "step1" },
      { "from_step_id": "step1", "to_step_id": "end" }
    ]
  },
  "expected": {
    "valid": false,
    "error_code": "INVALID_RESOURCE_COMMAND"
  }
}
```

Create `spec/conformance/resources/res-validation-002-command-type-mismatch.json`:

```json
{
  "test_id": "res-validation-002",
  "name": "Acquire Pool Amount on a binary resource",
  "category": "validation",
  "tags": ["resource", "validation"],
  "workflow": {
    "local_id": "wf", "oid": "wf", "version": "1.0.0", "last_modified_date": "2026-03-11",
    "resource_property_specifications": [
      { "name": "Lock", "resource_type": "binary exclusive use" }
    ],
    "steps": [
      { "local_id": "start", "oid": "start", "version": "1.0.0", "last_modified_date": "2026-03-11", "step_type": "START" },
      {
        "local_id": "step1", "oid": "step1", "version": "1.0.0", "last_modified_date": "2026-03-11",
        "step_type": "USER_INTERACTION",
        "resource_command_specifications": [
          { "command_type": "Acquire Pool Amount", "resource_name": "Lock", "amount": 5 }
        ]
      },
      { "local_id": "end", "oid": "end", "version": "1.0.0", "last_modified_date": "2026-03-11", "step_type": "END" }
    ],
    "connections": [
      { "from_step_id": "start", "to_step_id": "step1" },
      { "from_step_id": "step1", "to_step_id": "end" }
    ]
  },
  "expected": {
    "valid": false,
    "error_code": "INVALID_RESOURCE_COMMAND"
  }
}
```

- [ ] **Step 2: Add 'resources' subdirectory to runner.ts fixture discovery**

In `engines/web/src/runner.ts`, update the `subdirs` array on line 36:

Change:
```typescript
const subdirs = ['validation', 'execution', 'parameters'];
```
To:
```typescript
const subdirs = ['validation', 'execution', 'parameters', 'resources'];
```

- [ ] **Step 3: Run conformance to verify new fixtures fail**

Run: `cd /c/TrajectoryRuntime/engines/web && npx tsc && node dist/runner.js`
Expected: The two new resource validation tests FAIL (no resource validation implemented yet)

- [ ] **Step 4: Implement resource semantic validation**

In `engines/web/src/validator.ts`, add a new function after `semanticValidation` (before `hasMatchingWaitAll`). Then call it from the `validate` function:

Add this function:

```typescript
function resourceValidation(workflow: Record<string, unknown>): ValidationResult | null {
  const steps = workflow['steps'] as Record<string, unknown>[];
  const resourceSpecs = workflow['resource_property_specifications'] as Record<string, unknown>[] | undefined;

  // Build map of known resource names → types
  const resourceTypes = new Map<string, string>();
  if (resourceSpecs) {
    for (const spec of resourceSpecs) {
      resourceTypes.set(spec.name as string, spec.resource_type as string);
    }
  }

  // Also gather resource specs from child workflows recursively
  const childWorkflows = workflow['child_workflows'] as Record<string, unknown>[] | undefined;
  if (childWorkflows) {
    for (const cw of childWorkflows) {
      const cwSpecs = cw['resource_property_specifications'] as Record<string, unknown>[] | undefined;
      if (cwSpecs) {
        for (const spec of cwSpecs) {
          if (!resourceTypes.has(spec.name as string)) {
            resourceTypes.set(spec.name as string, spec.resource_type as string);
          }
        }
      }
    }
  }

  // Check if any step has resource commands — if no resources are defined and commands exist, that's invalid
  const ACQUIRE_RELEASE_TYPES = new Set(['binary exclusive use', 'binary shared use with pool limits', 'named pool']);
  const COUNTABLE_TYPES = new Set(['countable use with pool limits']);
  const SYNC_TYPES = new Set(['sync']);
  const SYNC_COMMANDS = new Set(['Send', 'Receive', 'Synchronize']);

  for (const step of steps) {
    const cmds = step['resource_command_specifications'] as Record<string, unknown>[] | undefined;
    if (!cmds || cmds.length === 0) continue;

    let syncCount = 0;

    for (const cmd of cmds) {
      const commandType = cmd.command_type as string;
      const resourceName = cmd.resource_name as string;

      // Rule 1: Resource must exist
      const resType = resourceTypes.get(resourceName);
      if (!resType) {
        return { valid: false, error_code: 'INVALID_RESOURCE_COMMAND', error_message: `Resource command references unknown resource: "${resourceName}"` };
      }

      // Rule 2: Command/type compatibility
      if (commandType === 'Acquire' || commandType === 'Release') {
        if (!ACQUIRE_RELEASE_TYPES.has(resType)) {
          return { valid: false, error_code: 'INVALID_RESOURCE_COMMAND', error_message: `${commandType} not compatible with resource type "${resType}"` };
        }
      } else if (commandType === 'Acquire Pool Amount' || commandType === 'Release Pool Amount') {
        if (!COUNTABLE_TYPES.has(resType)) {
          return { valid: false, error_code: 'INVALID_RESOURCE_COMMAND', error_message: `${commandType} not compatible with resource type "${resType}"` };
        }
        // Rule 4: Amount required and > 0
        const amount = cmd.amount as number | undefined;
        if (!amount || amount <= 0) {
          return { valid: false, error_code: 'INVALID_RESOURCE_COMMAND', error_message: `${commandType} requires amount > 0` };
        }
      } else if (SYNC_COMMANDS.has(commandType)) {
        if (!SYNC_TYPES.has(resType)) {
          return { valid: false, error_code: 'INVALID_RESOURCE_COMMAND', error_message: `${commandType} not compatible with resource type "${resType}"` };
        }
        syncCount++;
      }
    }

    // Rule 3: At most one sync command per step
    if (syncCount > 1) {
      return { valid: false, error_code: 'INVALID_RESOURCE_COMMAND', error_message: `Step "${step.oid}" has ${syncCount} sync commands (max 1)` };
    }
  }

  // Rule 6: Named pool must have names
  if (resourceSpecs) {
    for (const spec of resourceSpecs) {
      if (spec.resource_type === 'named pool') {
        const names = spec.names as string[] | undefined;
        if (!names || names.length === 0) {
          return { valid: false, error_code: 'INVALID_RESOURCE_SPEC', error_message: `Named pool "${spec.name}" must have a non-empty names array` };
        }
      }
      // Rule 7: Pool types must have use_limit > 0
      if (spec.resource_type === 'binary shared use with pool limits' || spec.resource_type === 'countable use with pool limits') {
        const limit = spec.use_limit as number | undefined;
        if (!limit || limit <= 0) {
          return { valid: false, error_code: 'INVALID_RESOURCE_SPEC', error_message: `Resource "${spec.name}" requires use_limit > 0` };
        }
      }
    }
  }

  return null;
}
```

Then in the `validate` function (around line 280), add a call between semantic and structural validation:

```typescript
  // Phase A2: Resource validation
  const resourceError = resourceValidation(workflow);
  if (resourceError) return resourceError;
```

- [ ] **Step 5: Run conformance to verify resource validation tests pass**

Run: `cd /c/TrajectoryRuntime/engines/web && npx tsc && node dist/runner.js`
Expected: All tests PASS including the two new resource validation tests

- [ ] **Step 6: Commit**

```bash
git add engines/web/src/validator.ts engines/web/src/runner.ts spec/conformance/resources/
git commit -m "feat: add resource command semantic validation (6 rules in validator, 1 in engine.start)"
```

---

## Chunk 3: Engine Integration

### Task 11: Engine setup — accept ResourceManager, register workflow resources

**Files:**
- Modify: `engines/web/src/engine.ts:15-82` (constructor and fields)

- [ ] **Step 1: Add ResourceManager import and fields to engine**

At the top of `engines/web/src/engine.ts`, add imports:

```typescript
import type { ResourceManager } from './resource-manager.js';
import type { PendingResourceState } from './types.js';
```

Add new fields after `stepParameterSnapshots` (line 30):

```typescript
  private resourceManager?: ResourceManager;
  private pendingResources: Map<string, PendingResourceState>;
  private namedPoolTargets: Map<string, string>; // resource_name → property store key for assigned name
  private instanceId: string;
```

- [ ] **Step 2: Update constructor to accept resourceManager**

Change the constructor signature (line 32-34) to:

```typescript
  constructor(
    workflow: MasterWorkflowSpecification,
    setup?: { starting_parameters?: Record<string, string>; initial_properties?: Record<string, string>; resourceManager?: ResourceManager },
  ) {
```

In the constructor body, after `this.stepParameterSnapshots = new Map();` (line 50), add:

```typescript
    this.resourceManager = setup?.resourceManager;
    this.pendingResources = new Map();
    this.namedPoolTargets = new Map();
    this.instanceId = `wf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
```

- [ ] **Step 3: Register workflow-scoped resources in start()**

In `start()` (line 84), before finding the START step, add:

```typescript
    // Register workflow-scoped resources
    if (this.resourceManager && this.workflow.resource_property_specifications) {
      for (const spec of this.workflow.resource_property_specifications) {
        if (spec.scope !== 'environment') {
          this.resourceManager.registerResource(spec, this.instanceId);
        }
      }
    }

    // Validate: resource commands require a ResourceManager
    if (!this.resourceManager) {
      const hasResourceCmds = this.workflow.steps.some(s => s.resource_command_specifications?.length);
      if (hasResourceCmds) {
        throw new Error('Workflow has resource commands but no ResourceManager was provided');
      }
    }
```

- [ ] **Step 4: Verify existing tests still pass**

Run: `cd /c/TrajectoryRuntime/engines/web && npx tsc && node dist/runner.js`
Expected: All existing tests PASS (no ResourceManager = no change in behavior)

- [ ] **Step 5: Commit**

```bash
git add engines/web/src/engine.ts
git commit -m "feat: engine accepts ResourceManager, registers workflow resources on start"
```

---

### Task 12: Resource processing in activateStep

**Files:**
- Modify: `engines/web/src/engine.ts:347-412` (activateStep method)

- [ ] **Step 1: Add resource processing method to engine**

After `activateStep` (before `handleWaitAllArrival`), add a new method:

```typescript
  private processResourceCommands(target: StepInstance): boolean {
    const cmds = target.step.resource_command_specifications;
    if (!cmds || cmds.length === 0 || !this.resourceManager) return true; // no commands = proceed

    const { activation, completion } = splitResourceCommands(cmds);
    const sorted = sortActivationCommands(activation);
    const sortedCompletion = [...completion].sort((a, b) => a.resource_name.localeCompare(b.resource_name));

    return this.executeActivationCommands(target, sorted, sortedCompletion);
  }

  private executeActivationCommands(
    target: StepInstance,
    remaining: ResourceCommandSpecification[],
    completionCommands: ResourceCommandSpecification[],
  ): boolean {
    const mgr = this.resourceManager!;
    const requesterId = `${this.instanceId}:${target.oid}`;

    for (let i = 0; i < remaining.length; i++) {
      const cmd = remaining[i];
      let blocked = false;

      switch (cmd.command_type) {
        case 'Acquire': {
          const result = mgr.acquire(cmd.resource_name, requesterId);
          if (!result.granted) { blocked = true; break; }
          if (result.name && cmd.target) {
            this.propertyStore.set(cmd.target, result.name);
            // Store target mapping so Release on a different step can find the assigned name
            this.namedPoolTargets.set(cmd.resource_name, cmd.target);
          }
          break;
        }
        case 'Acquire Pool Amount': {
          const result = mgr.acquireAmount(cmd.resource_name, requesterId, cmd.amount!);
          if (!result.granted) { blocked = true; break; }
          break;
        }
        case 'Send': {
          const data = cmd.source ? (this.propertyStore.get(cmd.source) ?? '') : '';
          const result = mgr.send(cmd.resource_name, requesterId, data);
          if (!result.ready) { blocked = true; break; }
          break;
        }
        case 'Receive': {
          const result = mgr.receive(cmd.resource_name, requesterId);
          if (!result.available) { blocked = true; break; }
          if (cmd.target) {
            this.propertyStore.set(cmd.target, result.data);
          }
          break;
        }
        case 'Synchronize': {
          const result = mgr.synchronize(cmd.resource_name, requesterId);
          if (!result.ready) { blocked = true; break; }
          break;
        }
      }

      if (blocked) {
        // Save remaining commands and enter WAITING
        this.pendingResources.set(target.oid, {
          stepOid: target.oid,
          remainingCommands: remaining.slice(i + 1),
          completionCommands,
        });
        this.recordTrace(target.oid, 'WAITING');
        target.state = 'WAITING';
        return false;
      }
    }

    // All commands succeeded — store completion commands for later
    if (completionCommands.length > 0) {
      this.pendingResources.set(target.oid, {
        stepOid: target.oid,
        remainingCommands: [],
        completionCommands,
      });
    }
    return true;
  }
```

Add the import at the top of the file:

```typescript
import { splitResourceCommands, sortActivationCommands } from './resource-helpers.js';
```

- [ ] **Step 2: Wire resource processing into activateStep**

In `activateStep` (line 347), after `if (target.state !== 'IDLE') return;` and the input parameter resolution block (lines 348-360), but before the WORKFLOW PROXY check (line 362), insert:

```typescript
    // Process resource activation commands
    if (!this.processResourceCommands(target)) {
      return; // step is WAITING on resources
    }
```

- [ ] **Step 3: Verify existing tests still pass**

Run: `cd /c/TrajectoryRuntime/engines/web && npx tsc && node dist/runner.js`
Expected: All existing tests PASS

- [ ] **Step 4: Commit**

```bash
git add engines/web/src/engine.ts
git commit -m "feat: resource command processing in activateStep with WAITING state"
```

---

### Task 13: Release processing and flushGranted in drain loop

**Files:**
- Modify: `engines/web/src/engine.ts:324-345` (drainCompletionQueue)
- Modify: `engines/web/src/engine.ts:556-571` (checkWorkflowCompletion)

- [ ] **Step 1: Add release processing method**

Add a new method to the engine:

```typescript
  private processReleaseCommands(stepOid: string): void {
    const pending = this.pendingResources.get(stepOid);
    if (!pending || pending.completionCommands.length === 0 || !this.resourceManager) return;

    const requesterId = `${this.instanceId}:${stepOid}`;
    const sorted = [...pending.completionCommands].sort((a, b) => a.resource_name.localeCompare(b.resource_name));

    for (const cmd of sorted) {
      switch (cmd.command_type) {
        case 'Release': {
          // For named pool: look up the assigned name via the target stored at acquire time
          const target = this.namedPoolTargets.get(cmd.resource_name);
          if (target) {
            const name = this.propertyStore.get(target);
            if (name) {
              this.resourceManager.releaseNamed(cmd.resource_name, requesterId, name);
              this.namedPoolTargets.delete(cmd.resource_name);
              break;
            }
          }
          this.resourceManager.release(cmd.resource_name, requesterId);
          break;
        }
        case 'Release Pool Amount':
          this.resourceManager.releaseAmount(cmd.resource_name, requesterId, cmd.amount!);
          break;
      }
    }

    this.pendingResources.delete(stepOid);
  }

  private resumeGrantedSteps(): void {
    if (!this.resourceManager) return;
    const granted = this.resourceManager.flushGranted();

    for (const requesterId of granted) {
      // Extract stepOid from requesterId format "instanceId:stepOid"
      const colonIdx = requesterId.lastIndexOf(':');
      if (colonIdx < 0) continue;
      const stepOid = requesterId.slice(colonIdx + 1);

      const stepInstance = this.steps.get(stepOid);
      if (!stepInstance || stepInstance.state !== 'WAITING') continue;

      const pending = this.pendingResources.get(stepOid);
      if (!pending) {
        // No remaining commands — just resume the step
        stepInstance.state = 'IDLE';
        this.activateStep(stepInstance);
        continue;
      }

      // Check for sync data delivery
      const syncData = this.resourceManager.getSyncData(requesterId);
      if (syncData !== undefined) {
        const step = stepInstance.step;
        const receiveCmd = step.resource_command_specifications?.find(c => c.command_type === 'Receive');
        if (receiveCmd?.target) {
          this.propertyStore.set(receiveCmd.target, syncData);
        }
        this.resourceManager.clearSyncData(requesterId);
      }

      // Resume remaining activation commands
      if (pending.remainingCommands.length > 0) {
        const allGranted = this.executeActivationCommands(stepInstance, pending.remainingCommands, pending.completionCommands);
        if (!allGranted) continue; // still blocked on next command
      }

      // All activation commands done — resume normal activation
      stepInstance.state = 'IDLE';
      // Re-set completion commands
      if (pending.completionCommands.length > 0) {
        this.pendingResources.set(stepOid, {
          stepOid,
          remainingCommands: [],
          completionCommands: pending.completionCommands,
        });
      } else {
        this.pendingResources.delete(stepOid);
      }

      // Resume step activation (skip resource processing since already done)
      this.activateStepAfterResources(stepInstance);
    }
  }

  private activateStepAfterResources(target: StepInstance): void {
    if (target.stepType === 'WORKFLOW PROXY') {
      this.activateWorkflowProxy(target);
      return;
    }

    if (isAutoCompleting(target.stepType)) {
      if (target.stepType === 'SELECT 1' || target.stepType === 'SELECT_1') {
        const routing = handleSelect1(target.step, this.propertyStore);
        if (routing.connectionId) {
          this.routingContext.set(target.oid, routing);
        }
      }
      if (target.stepType === 'SCRIPT') {
        const inputParams = this.stepParameterSnapshots.get(target.oid)?.inputParameters ?? {};
        const result = executeScript(target.step, this.propertyStore, inputParams);
        if (!result.success) {
          this.recordTrace(target.oid, 'ERRORED', undefined, result.error);
          target.state = 'ERRORED';
          this.workflowState = 'ERRORED';
          return;
        }
        const snapshot = this.stepParameterSnapshots.get(target.oid);
        if (snapshot) {
          const outputSpecs = target.step.output_parameter_specifications;
          if (outputSpecs) {
            for (const spec of outputSpecs) {
              if (spec.target) {
                const val = this.propertyStore.get(spec.target);
                if (val !== undefined) {
                  snapshot.outputParameters[spec.id] = val;
                }
              }
            }
          }
        }
      }
      this.recordTrace(target.oid, 'COMPLETED');
      target.state = 'COMPLETED';
      this.completionQueue.push(target.oid);
    } else if (needsUserAction(target.stepType)) {
      this.recordTrace(target.oid, 'EXECUTING');
      target.state = 'EXECUTING';
      this.pendingUserSteps.add(target.oid);
    }
  }
```

- [ ] **Step 2: Update drainCompletionQueue to call release and flushGranted**

Replace the `drainCompletionQueue` method (lines 324-345) with:

```typescript
  private drainCompletionQueue(): void {
    while (this.completionQueue.length > 0) {
      const stepOid = this.completionQueue.shift()!;

      // Process release commands for completing step
      this.processReleaseCommands(stepOid);

      // Resume any steps unblocked by the releases
      this.resumeGrantedSteps();

      const outgoing = this.getRoutedConnections(stepOid);

      for (const conn of outgoing) {
        const targetOid = conn.to_step_id;
        const target = this.steps.get(targetOid);
        if (!target) continue;

        if (target.stepType === 'WAIT ALL') {
          this.handleWaitAllArrival(target, stepOid);
        } else {
          this.activateStep(target);
        }
      }
    }

    // Post-wave: pre-activate WAIT ALL steps still in IDLE
    this.activatePendingWaitAlls();
    this.checkWorkflowCompletion();
  }
```

- [ ] **Step 3: Update checkWorkflowCompletion to include WAITING state**

Replace `checkWorkflowCompletion` (lines 556-571) with:

```typescript
  private checkWorkflowCompletion(): void {
    const endCompleted = [...this.steps.values()].some(
      s => s.stepType === 'END' && s.state === 'COMPLETED',
    );

    if (endCompleted && this.pendingUserSteps.size === 0) {
      const anyBlocking = [...this.steps.values()].some(
        s => s.state === 'EXECUTING' || s.state === 'WAITING',
      );
      if (!anyBlocking) {
        // Cleanup: release all workflow-scoped resources
        if (this.resourceManager) {
          this.resourceManager.releaseAll(this.instanceId);
          // Note: releaseAll may add grants for steps in OTHER workflows.
          // Those grants remain in pendingGrants for the external coordinator
          // to flush via flushGranted(). This engine does NOT call
          // resumeGrantedSteps() here since the unblocked steps belong to
          // other workflow instances.
        }
        this.workflowState = 'COMPLETED';
      }
    }
  }
```

- [ ] **Step 4: Add releaseAll on ERRORED state transitions**

Find the two places where `this.workflowState = 'ERRORED'` is set (in `activateStep` SCRIPT error and `activateStepAfterResources` SCRIPT error) and add cleanup after each:

```typescript
        // After: this.workflowState = 'ERRORED';
        if (this.resourceManager) {
          this.resourceManager.releaseAll(this.instanceId);
          // Grants for other workflows remain in pendingGrants for external coordination
        }
```

- [ ] **Step 5: Update activateWorkflowProxy to pass ResourceManager to child**

In `activateWorkflowProxy` (around line 262), update the child engine creation:

```typescript
    const childEngine = new WorkflowEngine(childSpec, {
      starting_parameters: startingParams,
      initial_properties: initialProperties,
      resourceManager: this.resourceManager,
    });
```

- [ ] **Step 6: Refactor activateStep to use activateStepAfterResources**

Refactor `activateStep` to call `processResourceCommands` then `activateStepAfterResources`:

```typescript
  private activateStep(target: StepInstance): void {
    if (target.state !== 'IDLE') return;

    // Resolve step input parameters
    this.propertyStore.resolveInputParameters(target.step.input_parameter_specifications);

    // Snapshot input parameters
    this.stepParameterSnapshots.set(target.oid, {
      inputParameters: { ...this.propertyStore.getInputParameters() },
      outputParameters: {},
      description: target.step.description ?? target.stepType,
      label: target.step.local_id,
      stepType: target.stepType,
    });

    // Process resource activation commands
    if (!this.processResourceCommands(target)) {
      return; // step is WAITING on resources
    }

    this.activateStepAfterResources(target);
  }
```

- [ ] **Step 7: Verify existing tests still pass**

Run: `cd /c/TrajectoryRuntime/engines/web && npx tsc && node dist/runner.js`
Expected: All existing tests PASS

- [ ] **Step 8: Commit**

```bash
git add engines/web/src/engine.ts
git commit -m "feat: resource release processing, flushGranted in drain loop, WAITING in completion check"
```

---

### Task 14: Engine resource conformance tests

**Files:**
- Create: `spec/conformance/resources/*.json` (remaining fixtures)
- Modify: `engines/web/src/runner.ts` (support setup.resources)

- [ ] **Step 1: Update runner.ts to create ResourceManager for resource fixtures**

In `engines/web/src/runner.ts`, add import:

```typescript
import { InMemoryResourceManager } from './resource-manager.js';
import type { ResourcePropertySpecification } from './types.js';
```

In `runExecutionFixture` (line 127), after creating the workflow variable (line 134), before creating the engine (line 135), add resource setup:

```typescript
  // Set up ResourceManager if fixture has resources
  let setup = fixture.setup;
  if (fixture.setup?.resources) {
    const mgr = new InMemoryResourceManager();
    for (const spec of fixture.setup.resources as ResourcePropertySpecification[]) {
      mgr.registerResource(spec, 'test');
    }
    setup = { ...fixture.setup, resourceManager: mgr };
  }
```

And change `const engine = new WorkflowEngine(workflow, fixture.setup);` to:

```typescript
  const engine = new WorkflowEngine(workflow, setup);
```

- [ ] **Step 2: Create binary exclusive acquire/release fixture**

Create `spec/conformance/resources/res-binary-001-exclusive-acquire-release.json`:

```json
{
  "test_id": "res-binary-001",
  "name": "Single use resource: acquire on step A, release on step B",
  "category": "execution",
  "tags": ["resource", "binary"],
  "workflow": {
    "local_id": "wf", "oid": "wf", "version": "1.0.0", "last_modified_date": "2026-03-11",
    "resource_property_specifications": [
      { "name": "Lock", "resource_type": "binary exclusive use" }
    ],
    "steps": [
      { "local_id": "start", "oid": "start", "version": "1.0.0", "last_modified_date": "2026-03-11", "step_type": "START" },
      {
        "local_id": "acquire", "oid": "acquire", "version": "1.0.0", "last_modified_date": "2026-03-11",
        "step_type": "SCRIPT",
        "script_config": { "language": "javascript", "source": "output.status = 'acquired';" },
        "output_parameter_specifications": [{ "id": "status", "target": "Result.Status" }],
        "resource_command_specifications": [
          { "command_type": "Acquire", "resource_name": "Lock" }
        ]
      },
      {
        "local_id": "release", "oid": "release", "version": "1.0.0", "last_modified_date": "2026-03-11",
        "step_type": "SCRIPT",
        "script_config": { "language": "javascript", "source": "output.done = 'released';" },
        "output_parameter_specifications": [{ "id": "done", "target": "Result.Done" }],
        "resource_command_specifications": [
          { "command_type": "Release", "resource_name": "Lock" }
        ]
      },
      { "local_id": "end", "oid": "end", "version": "1.0.0", "last_modified_date": "2026-03-11", "step_type": "END" }
    ],
    "connections": [
      { "from_step_id": "start", "to_step_id": "acquire" },
      { "from_step_id": "acquire", "to_step_id": "release" },
      { "from_step_id": "release", "to_step_id": "end" }
    ]
  },
  "expected": {
    "valid": true,
    "workflow_state": "COMPLETED",
    "final_properties": {
      "Result.Status": "acquired",
      "Result.Done": "released"
    }
  }
}
```

- [ ] **Step 3: Create named pool fixture**

Create `spec/conformance/resources/res-named-001-assign.json`:

```json
{
  "test_id": "res-named-001",
  "name": "Named pool assigns available name, writes to target property",
  "category": "execution",
  "tags": ["resource", "named-pool"],
  "workflow": {
    "local_id": "wf", "oid": "wf", "version": "1.0.0", "last_modified_date": "2026-03-11",
    "resource_property_specifications": [
      { "name": "Docks", "resource_type": "named pool", "names": ["Dock 1", "Dock 2"] }
    ],
    "steps": [
      { "local_id": "start", "oid": "start", "version": "1.0.0", "last_modified_date": "2026-03-11", "step_type": "START" },
      {
        "local_id": "use-dock", "oid": "use-dock", "version": "1.0.0", "last_modified_date": "2026-03-11",
        "step_type": "SCRIPT",
        "script_config": { "language": "javascript", "source": ";" },
        "resource_command_specifications": [
          { "command_type": "Acquire", "resource_name": "Docks", "target": "Assigned.Dock" }
        ]
      },
      {
        "local_id": "release-dock", "oid": "release-dock", "version": "1.0.0", "last_modified_date": "2026-03-11",
        "step_type": "SCRIPT",
        "script_config": { "language": "javascript", "source": ";" },
        "resource_command_specifications": [
          { "command_type": "Release", "resource_name": "Docks" }
        ]
      },
      { "local_id": "end", "oid": "end", "version": "1.0.0", "last_modified_date": "2026-03-11", "step_type": "END" }
    ],
    "connections": [
      { "from_step_id": "start", "to_step_id": "use-dock" },
      { "from_step_id": "use-dock", "to_step_id": "release-dock" },
      { "from_step_id": "release-dock", "to_step_id": "end" }
    ]
  },
  "expected": {
    "valid": true,
    "workflow_state": "COMPLETED",
    "final_properties": {
      "Assigned.Dock": "Dock 1"
    }
  }
}
```

- [ ] **Step 4: Create ordering fixture (sync before acquire, alphabetical)**

Create `spec/conformance/resources/res-order-001-sync-before-acquire.json`:

```json
{
  "test_id": "res-order-001",
  "name": "Sync command processed before Acquire commands",
  "category": "execution",
  "tags": ["resource", "ordering"],
  "workflow": {
    "local_id": "wf", "oid": "wf", "version": "1.0.0", "last_modified_date": "2026-03-11",
    "resource_property_specifications": [
      { "name": "Chan", "resource_type": "sync" },
      { "name": "Lock", "resource_type": "binary exclusive use" }
    ],
    "value_property_specifications": [
      { "name": "Data", "entries": [{ "name": "Value", "value": "hello" }] }
    ],
    "steps": [
      { "local_id": "start", "oid": "start", "version": "1.0.0", "last_modified_date": "2026-03-11", "step_type": "START" },
      { "local_id": "parallel", "oid": "parallel", "version": "1.0.0", "last_modified_date": "2026-03-11", "step_type": "PARALLEL" },
      {
        "local_id": "sender", "oid": "sender", "version": "1.0.0", "last_modified_date": "2026-03-11",
        "step_type": "SCRIPT",
        "script_config": { "language": "javascript", "source": ";" },
        "resource_command_specifications": [
          { "command_type": "Send", "resource_name": "Chan", "source": "Data.Value" }
        ]
      },
      {
        "local_id": "receiver", "oid": "receiver", "version": "1.0.0", "last_modified_date": "2026-03-11",
        "step_type": "SCRIPT",
        "script_config": { "language": "javascript", "source": ";" },
        "resource_command_specifications": [
          { "command_type": "Receive", "resource_name": "Chan", "target": "Result.Received" },
          { "command_type": "Acquire", "resource_name": "Lock" }
        ]
      },
      {
        "local_id": "release", "oid": "release", "version": "1.0.0", "last_modified_date": "2026-03-11",
        "step_type": "SCRIPT",
        "script_config": { "language": "javascript", "source": ";" },
        "resource_command_specifications": [
          { "command_type": "Release", "resource_name": "Lock" }
        ]
      },
      { "local_id": "wait", "oid": "wait", "version": "1.0.0", "last_modified_date": "2026-03-11", "step_type": "WAIT ALL" },
      { "local_id": "end", "oid": "end", "version": "1.0.0", "last_modified_date": "2026-03-11", "step_type": "END" }
    ],
    "connections": [
      { "from_step_id": "start", "to_step_id": "parallel" },
      { "from_step_id": "parallel", "to_step_id": "sender" },
      { "from_step_id": "parallel", "to_step_id": "receiver" },
      { "from_step_id": "sender", "to_step_id": "wait" },
      { "from_step_id": "receiver", "to_step_id": "release" },
      { "from_step_id": "release", "to_step_id": "wait" },
      { "from_step_id": "wait", "to_step_id": "end" }
    ]
  },
  "expected": {
    "valid": true,
    "workflow_state": "COMPLETED",
    "final_properties": {
      "Result.Received": "hello"
    }
  }
}
```

- [ ] **Step 5: Run conformance tests**

Run: `cd /c/TrajectoryRuntime/engines/web && npx tsc && node dist/runner.js`
Expected: All tests PASS including new resource fixtures

- [ ] **Step 6: Commit**

```bash
git add engines/web/src/runner.ts spec/conformance/resources/
git commit -m "feat: resource conformance tests and runner support for setup.resources"
```

---

## Chunk 4: Environment Loading and Exports

### Task 15: Environment loader

**Files:**
- Create: `engines/web/src/environment-loader.ts`
- Create: `engines/web/src/environment-loader.test.ts`

- [ ] **Step 1: Write failing tests for environment loader**

Create `engines/web/src/environment-loader.test.ts`:

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadEnvironmentLibrary } from './environment-loader.js';
import { InMemoryResourceManager } from './resource-manager.js';

describe('loadEnvironmentLibrary', () => {
  it('registers resources from environment specifications', () => {
    const mgr = new InMemoryResourceManager();
    const lib = {
      local_id: 'env1', oid: 'env1', version: '1.0.0', last_modified_date: '2026-03-11',
      environment_specifications: [{
        local_id: 'spec1', oid: 'spec1', version: '1.0.0', last_modified_date: '2026-03-11',
        included_actions: [],
        resource_property_specifications: [
          { name: 'SharedLock', resource_type: 'binary exclusive use' as const },
        ],
      }],
    };
    const props = loadEnvironmentLibrary(lib, mgr);
    assert.ok(mgr.hasResource('SharedLock'));
    assert.deepEqual(props, {});
  });

  it('loads value properties from environment', () => {
    const mgr = new InMemoryResourceManager();
    const lib = {
      local_id: 'env1', oid: 'env1', version: '1.0.0', last_modified_date: '2026-03-11',
      environment_specifications: [{
        local_id: 'spec1', oid: 'spec1', version: '1.0.0', last_modified_date: '2026-03-11',
        included_actions: [],
        value_property_specifications: [
          { name: 'Config', entries: [{ name: 'Mode', value: 'production' }] },
        ],
      }],
    };
    const props = loadEnvironmentLibrary(lib, mgr);
    assert.equal(props['Config.Mode'], 'production');
  });

  it('walks child_libraries recursively', () => {
    const mgr = new InMemoryResourceManager();
    const lib = {
      local_id: 'root', oid: 'root', version: '1.0.0', last_modified_date: '2026-03-11',
      environment_specifications: [],
      child_libraries: [{
        local_id: 'child', oid: 'child', version: '1.0.0', last_modified_date: '2026-03-11',
        environment_specifications: [{
          local_id: 'spec1', oid: 'spec1', version: '1.0.0', last_modified_date: '2026-03-11',
          included_actions: [],
          resource_property_specifications: [
            { name: 'ChildLock', resource_type: 'binary exclusive use' as const },
          ],
        }],
      }],
    };
    loadEnvironmentLibrary(lib, mgr);
    assert.ok(mgr.hasResource('ChildLock'));
  });

  it('idempotent: does not re-register existing resources', () => {
    const mgr = new InMemoryResourceManager();
    mgr.registerResource({ name: 'Lock', resource_type: 'binary exclusive use' }, 'env');
    mgr.acquire('Lock', 'test:s1'); // hold it
    const lib = {
      local_id: 'env1', oid: 'env1', version: '1.0.0', last_modified_date: '2026-03-11',
      environment_specifications: [{
        local_id: 'spec1', oid: 'spec1', version: '1.0.0', last_modified_date: '2026-03-11',
        included_actions: [],
        resource_property_specifications: [
          { name: 'Lock', resource_type: 'binary exclusive use' as const },
        ],
      }],
    };
    loadEnvironmentLibrary(lib, mgr);
    // Original lock state preserved (still held by test:s1)
    const result = mgr.acquire('Lock', 'test:s2');
    assert.deepEqual(result, { granted: false });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /c/TrajectoryRuntime/engines/web && npx tsc && node --test dist/environment-loader.test.js`
Expected: FAIL

- [ ] **Step 3: Implement environment-loader.ts**

Create `engines/web/src/environment-loader.ts`:

```typescript
import type { MasterEnvironmentLibrary, MasterEnvironmentSpecification } from './types.js';
import type { ResourceManager } from './resource-manager.js';

export function loadEnvironmentLibrary(
  lib: MasterEnvironmentLibrary,
  resourceManager: ResourceManager,
): Record<string, string> {
  const properties: Record<string, string> = {};

  function processSpec(spec: MasterEnvironmentSpecification): void {
    // Register resources (idempotent — skip if already registered)
    if (spec.resource_property_specifications) {
      for (const res of spec.resource_property_specifications) {
        if (!resourceManager.hasResource(res.name)) {
          resourceManager.registerResource(res, 'environment');
        }
      }
    }

    // Load value properties
    if (spec.value_property_specifications) {
      for (const prop of spec.value_property_specifications) {
        for (const entry of prop.entries) {
          const key = `${prop.name}.${entry.name}`;
          if (!(key in properties)) {
            properties[key] = entry.value;
          }
        }
      }
    }
  }

  function processLibrary(library: MasterEnvironmentLibrary): void {
    for (const spec of library.environment_specifications) {
      processSpec(spec);
    }
    if (library.child_libraries) {
      for (const child of library.child_libraries) {
        processLibrary(child);
      }
    }
  }

  processLibrary(lib);
  return properties;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /c/TrajectoryRuntime/engines/web && npx tsc && node --test dist/environment-loader.test.js`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add engines/web/src/environment-loader.ts engines/web/src/environment-loader.test.ts
git commit -m "feat: environment library loader with recursive child_libraries support"
```

---

### Task 16: Update loader.ts for WFenvir in packages

**Files:**
- Modify: `engines/web/src/loader.ts`

- [ ] **Step 1: Add WFenvir loading to loader**

Update `engines/web/src/loader.ts` to also return environment libraries:

```typescript
import { readFileSync } from 'node:fs';
import AdmZip from 'adm-zip';
import type { MasterEnvironmentLibrary } from './types.js';

export interface LoadResult {
  workflow: Record<string, unknown>;
  environments: MasterEnvironmentLibrary[];
}

export function loadWorkflow(filePath: string): Record<string, unknown> {
  return loadWorkflowPackage(filePath).workflow;
}

export function loadWorkflowPackage(filePath: string): LoadResult {
  if (filePath.endsWith('.WFmasterX')) {
    const zip = new AdmZip(filePath);
    const entries = zip.getEntries();

    const wfEntry = entries.find(e => e.entryName.endsWith('.WFmaster'));
    if (!wfEntry) {
      throw new Error('No .WFmaster file found inside the .WFmasterX archive');
    }
    const workflow = JSON.parse(wfEntry.getData().toString('utf-8'));

    const environments: MasterEnvironmentLibrary[] = [];
    for (const entry of entries) {
      if (entry.entryName.startsWith('environments/') && entry.entryName.endsWith('.WFenvir')) {
        environments.push(JSON.parse(entry.getData().toString('utf-8')));
      }
    }

    return { workflow, environments };
  }

  return {
    workflow: JSON.parse(readFileSync(filePath, 'utf-8')),
    environments: [],
  };
}
```

- [ ] **Step 2: Verify build compiles**

Run: `cd /c/TrajectoryRuntime/engines/web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add engines/web/src/loader.ts
git commit -m "feat: loader extracts WFenvir files from WFmasterX packages"
```

---

### Task 17: Update exports

**Files:**
- Modify: `engines/web/src/index.ts`

- [ ] **Step 1: Add resource exports**

Update `engines/web/src/index.ts`:

```typescript
export { validate } from './validator.js';
export { WorkflowEngine } from './engine.js';
export { PropertyStore } from './properties.js';
export { InMemoryResourceManager } from './resource-manager.js';
export { loadEnvironmentLibrary } from './environment-loader.js';
export { loadWorkflow, loadWorkflowPackage } from './loader.js';
export type { ResourceManager, AcquireResult, ReceiveResult, SyncResult, ReleaseAllResult } from './resource-manager.js';
export type * from './types.js';
```

- [ ] **Step 2: Verify build compiles and all tests pass**

Run: `cd /c/TrajectoryRuntime/engines/web && npx tsc && node dist/runner.js && node --test dist/resource-manager.test.js && node --test dist/resource-helpers.test.js && node --test dist/environment-loader.test.js`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add engines/web/src/index.ts
git commit -m "feat: export ResourceManager, environment loader, and package loader"
```

---

## Chunk 5: Remaining Conformance Fixtures

### Task 18: Create remaining resource conformance test fixtures

**Files:**
- Create: `spec/conformance/resources/*.json` (remaining fixtures not yet created)

Note: Some fixtures were already created in earlier tasks. The implementer should create the remaining fixtures from the spec's testing strategy table. Each fixture follows the same JSON pattern as the examples in Task 14. The key additional fixtures needed:

- [ ] **Step 1: Create res-binary-002-exclusive-wait.json**

A workflow with PARALLEL → two branches that both Acquire the same single-use resource → WAIT ALL → END. The first branch acquires immediately, completes, and releases. The second branch enters WAITING, then is resumed after the release. Both branches complete and reach WAIT ALL.

```json
{
  "test_id": "res-binary-002",
  "name": "Two parallel steps compete for single use resource, second enters WAITING",
  "category": "execution",
  "tags": ["resource", "binary", "waiting"],
  "workflow": {
    "local_id": "wf", "oid": "wf", "version": "1.0.0", "last_modified_date": "2026-03-11",
    "resource_property_specifications": [
      { "name": "Lock", "resource_type": "binary exclusive use" }
    ],
    "steps": [
      { "local_id": "start", "oid": "start", "version": "1.0.0", "last_modified_date": "2026-03-11", "step_type": "START" },
      { "local_id": "parallel", "oid": "parallel", "version": "1.0.0", "last_modified_date": "2026-03-11", "step_type": "PARALLEL" },
      {
        "local_id": "branch-a", "oid": "branch-a", "version": "1.0.0", "last_modified_date": "2026-03-11",
        "step_type": "SCRIPT",
        "script_config": { "language": "javascript", "source": "output.a = 'done';" },
        "output_parameter_specifications": [{ "id": "a", "target": "Result.A" }],
        "resource_command_specifications": [
          { "command_type": "Acquire", "resource_name": "Lock" },
          { "command_type": "Release", "resource_name": "Lock" }
        ]
      },
      {
        "local_id": "branch-b", "oid": "branch-b", "version": "1.0.0", "last_modified_date": "2026-03-11",
        "step_type": "SCRIPT",
        "script_config": { "language": "javascript", "source": "output.b = 'done';" },
        "output_parameter_specifications": [{ "id": "b", "target": "Result.B" }],
        "resource_command_specifications": [
          { "command_type": "Acquire", "resource_name": "Lock" },
          { "command_type": "Release", "resource_name": "Lock" }
        ]
      },
      { "local_id": "wait", "oid": "wait", "version": "1.0.0", "last_modified_date": "2026-03-11", "step_type": "WAIT ALL" },
      { "local_id": "end", "oid": "end", "version": "1.0.0", "last_modified_date": "2026-03-11", "step_type": "END" }
    ],
    "connections": [
      { "from_step_id": "start", "to_step_id": "parallel" },
      { "from_step_id": "parallel", "to_step_id": "branch-a" },
      { "from_step_id": "parallel", "to_step_id": "branch-b" },
      { "from_step_id": "branch-a", "to_step_id": "wait" },
      { "from_step_id": "branch-b", "to_step_id": "wait" },
      { "from_step_id": "wait", "to_step_id": "end" }
    ]
  },
  "expected": {
    "valid": true,
    "workflow_state": "COMPLETED",
    "final_properties": {
      "Result.A": "done",
      "Result.B": "done"
    }
  }
}
```

- [ ] **Step 2: Create res-sync-001-send-receive.json**

A workflow with PARALLEL → sender branch (SEND) and receiver branch (RECEIVE) → WAIT ALL → END. Verify the received data appears in `final_properties`.

- [ ] **Step 2: Create res-sync-002-receive-first.json**

Same topology but ensure the receiver step is activated before the sender (by step definition order). Verify both complete and data is delivered.

- [ ] **Step 3: Create res-sync-003-synchronize.json**

Two parallel branches both SYNCHRONIZE on the same resource. Verify both complete.

- [ ] **Step 4: Create res-countable-001-amount.json**

Acquire Pool Amount of 5 from a pool of 10, then release. Verify workflow completes.

- [ ] **Step 5: Create res-order-002-alphabetical.json**

A step with Acquire commands on resources "Zebra" and "Alpha". Verify it works (alphabetical order enforced internally).

- [ ] **Step 6: Run all conformance tests**

Run: `cd /c/TrajectoryRuntime/engines/web && npx tsc && node dist/runner.js`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add spec/conformance/resources/
git commit -m "test: add remaining resource conformance fixtures"
```

---

### Task 19: Final integration verification

- [ ] **Step 1: Run full test suite**

Run: `cd /c/TrajectoryRuntime/engines/web && npx tsc && node dist/runner.js && node --test dist/resource-manager.test.js && node --test dist/resource-helpers.test.js && node --test dist/environment-loader.test.js && node --test dist/engine-script.test.js`
Expected: All PASS

- [ ] **Step 2: Verify no regressions in existing tests**

Run: `cd /c/TrajectoryRuntime/engines/web && node --test dist/**/*.test.js`
Expected: All PASS

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete resource management implementation"
```
