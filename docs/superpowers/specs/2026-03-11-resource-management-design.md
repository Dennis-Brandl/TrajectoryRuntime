# Resource Management Design Specification

**Date:** 2026-03-11
**Status:** Approved
**Scope:** Runtime resource management for TrajectoryRuntime workflow engine

## Overview

Resources are managed properties in the runtime execution system that control access to limited-use capabilities. They may represent physical entities (bags, totes), virtual entities, or any other entity type. The resource system provides acquire/release semantics with queuing, deadlock prevention via alphabetical ordering, and cross-workflow coordination via environment-scoped resources.

## Resource Types

Five resource types, defined via `resource_property_specifications` on the workflow spec or environment library:

| Resource Type | Schema Value | Key Fields | Behavior |
|---|---|---|---|
| Single Use | `binary exclusive use` | `name` | One holder at a time |
| Multiple Use | `binary shared use with pool limits` | `name`, `use_limit` | Up to `use_limit` concurrent holders |
| Amount Pool | `countable use with pool limits` | `name`, `use_limit` | Numeric pool; acquire/release by amount |
| Named Pool | `named pool` | `name`, `names[]` | Pool of named strings; engine assigns any available name |
| Sync | `sync` | `name` | Rendezvous: SEND/RECEIVE (with data) or SYNCHRONIZE (barrier) |

### Scope

Each resource has a `scope` field (defaults to `"workflow"` when omitted):

- **`workflow`**: Created when the workflow starts, destroyed when it ends. Visible to the workflow and all child workflows (via WORKFLOW PROXY).
- **`environment`**: Shared across all workflows using the same ResourceManager. Persists independently of workflow lifecycle. Auto-loaded from `.WFenvir` files in the workflow package.

## Resource Commands

Commands are specified per step via `resource_command_specifications`. Each command references a resource by `resource_name`.

| Command | Used With | Key Fields | Phase |
|---|---|---|---|
| `Acquire` | binary exclusive, binary shared, named pool | `resource_name`, `target` (named pool: receives assigned name) | Activation |
| `Release` | binary exclusive, binary shared, named pool | `resource_name` | Completion |
| `Acquire Pool Amount` | countable | `resource_name`, `amount` | Activation |
| `Release Pool Amount` | countable | `resource_name`, `amount` | Completion |
| `Send` | sync | `resource_name`, `source` (property key to send) | Activation |
| `Receive` | sync | `resource_name`, `target` (property key to write received data) | Activation |
| `Synchronize` | sync | `resource_name` | Activation |

## Engine Integration

### Step-Level vs Workflow-Level Resource Commands

Resource commands (`resource_command_specifications`) exist at both the step level and the workflow level in the schema. **Only step-level resource commands are executed by the engine.** Workflow-level `resource_command_specifications` are reserved for future use and are ignored during execution. Resource definitions (`resource_property_specifications`) are processed at both levels.

### Step Lifecycle with Resources

Resource commands split into two phases: activation commands (Acquire, Acquire Pool Amount, Send, Receive, Synchronize) run at step activation; completion commands (Release, Release Pool Amount) run at step completion.

**On step activation:**

1. Separate the step's `resource_command_specifications` into activation and completion commands.
2. Process the Sync command first (at most one per step).
3. Process remaining acquire commands sequentially in alphabetical order by `resource_name`.
4. At each command: if the resource is available, grant it and continue to the next. If not, the step enters the `WAITING` state and stops. Remaining commands are deferred.
5. When a WAITING step is resumed (resource granted via callback), continue from where it left off in the command sequence.
6. Once all activation commands succeed, proceed with normal step behavior (auto-complete, user interaction, etc.).

**On step completion:**

1. Process Release / Release Pool Amount commands in alphabetical order by `resource_name`.
2. For named pool Release commands: the engine reads the assigned name from the property store using the `target` field of the corresponding Acquire command (matched by `resource_name`). This name is passed to `releaseNamed()`.
3. Each release may unblock a queued request on another step (see Callback Timing below).

**Cross-step acquire/release:** Acquire and Release commands for the same resource may appear on different steps. A step may have only Release commands (no Acquire) to release a resource acquired by an earlier step. This is the intended pattern for spanning resource holds across multiple steps or child workflows.

### State Transitions

```
IDLE -> [activation triggered]
     -> process resource commands
         -> all granted -> EXECUTING / COMPLETED (normal flow)
         -> blocked     -> WAITING
              -> [resource granted via flushGranted]
              -> resume remaining commands
              -> all granted -> EXECUTING / COMPLETED (normal flow)
```

### WAITING State and Workflow Completion

Steps in the `WAITING` state must prevent workflow completion, just like `EXECUTING` steps. The engine's `checkWorkflowCompletion()` must be updated to also check for WAITING steps. A workflow can only complete when the END step is COMPLETED and no steps are in EXECUTING or WAITING state.

### WAITING State in Trace

When a step enters the `WAITING` state (blocked on a resource), a trace entry with state `WAITING` is recorded. This aids debugging by showing when and where resource contention occurred.

### Callback Timing and Re-Entrancy

The engine is synchronous. The `onGranted` callback must not re-enter `drainCompletionQueue` or `activateStep`. Instead:

1. When a release call unblocks a queued request, the `InMemoryResourceManager` does **not** fire the callback inline. Instead, it collects granted requesterIds in an internal `pendingGrants` list.
2. The engine calls a `flushGranted(): string[]` method on the ResourceManager after processing all release commands for a completing step.
3. For each granted requesterId, the engine resumes the corresponding step's resource command sequence. If all remaining commands succeed, the step is added to the `completionQueue` (for auto-completing steps) or transitions to `EXECUTING` (for user-action steps).
4. This happens inside `drainCompletionQueue`, after processing a step's outgoing connections and before moving to the next queue entry. This preserves the synchronous, deterministic execution model.

The `ResourceManager` interface adds:

```typescript
flushGranted(): string[];  // Returns and clears pending granted requesterIds
```

**Modified drain loop pseudocode:**

```
drainCompletionQueue():
  while completionQueue is not empty:
    stepOid = completionQueue.shift()
    process release commands for stepOid
    grantedIds = resourceManager.flushGranted()
    for each grantedId:
      resume waiting step, process remaining resource commands
      if all granted: add to completionQueue or mark EXECUTING
    process outgoing connections (existing logic)
  activatePendingWaitAlls() (existing logic)
  checkWorkflowCompletion() (updated to include WAITING state)
```

### Pending Resource State

The engine tracks where a waiting step left off:

```typescript
interface PendingResourceState {
  stepOid: string;
  remainingCommands: ResourceCommandSpecification[];
  completionCommands: ResourceCommandSpecification[];
}
```

Stored in a `Map<string, PendingResourceState>` on the engine, keyed by step OID.

### Deadlock Prevention

All resource acquire requests are processed in alphabetical order by resource name. This is enforced by the engine when sorting the activation commands. Workflow authors must ensure that all steps follow this convention; the engine enforces it automatically.

### Queue Semantics

- Requests are served strictly FIFO (first come first served).
- For countable pools, the head of the queue is never skipped even if a smaller request behind it could be fulfilled. This prevents starvation.

## ResourceManager Interface

The engine interacts with resources through a `ResourceManager` interface, designed to be swappable (in-memory now, remote implementation possible later).

```typescript
interface ResourceManager {
  // Lifecycle
  registerResource(spec: ResourcePropertySpecification, ownerId: string): void;
  unregisterResources(ownerId: string): void;

  // Binary & shared acquire/release
  acquire(resourceName: string, requesterId: string): AcquireResult;
  release(resourceName: string, requesterId: string): void;

  // Countable pool
  acquireAmount(resourceName: string, requesterId: string, amount: number): AcquireResult;
  releaseAmount(resourceName: string, requesterId: string, amount: number): void;

  // Named pool
  acquireNamed(resourceName: string, requesterId: string): AcquireResult;
  releaseNamed(resourceName: string, requesterId: string, name: string): void;

  // Sync
  send(resourceName: string, requesterId: string, data: string): SyncResult;
  receive(resourceName: string, requesterId: string): ReceiveResult;
  synchronize(resourceName: string, requesterId: string): SyncResult;

  // Grant flush (see Callback Timing section)
  flushGranted(): string[];

  // Cleanup
  releaseAll(ownerId: string): ReleaseAllResult;
}

type AcquireResult = { granted: true; name?: string } | { granted: false };
type ReceiveResult = { available: true; data: string } | { available: false };
type SyncResult = { ready: true } | { ready: false };
type ReleaseAllResult = { released: string[]; warned: boolean };
// `released` contains the resource names that were still held (not explicitly released).
// `warned` is true when `released.length > 0`, indicating the workflow author missed Release steps.
```

**`command_type` TypeScript union:** The `ResourceCommandSpecification.command_type` field should use a union type for type safety:

```typescript
type ResourceCommandType =
  | 'Acquire' | 'Release'
  | 'Acquire Pool Amount' | 'Release Pool Amount'
  | 'Send' | 'Receive' | 'Synchronize';
```

### Identifier Conventions

- **requesterId**: `{workflowInstanceId}:{stepOid}` -- uniquely identifies who holds a resource.
- **ownerId**: `{workflowInstanceId}` for workflow-scoped resources, `"environment"` for environment-scoped.

### Internal State per Resource Type

| Type | Internal State |
|---|---|
| `binary exclusive use` | `holder: string \| null`, `queue: string[]` |
| `binary shared use with pool limits` | `holders: Set<string>`, `useLimit: number`, `queue: string[]` |
| `countable use with pool limits` | `inUse: number`, `useLimit: number`, `queue: {requesterId, amount}[]` |
| `named pool` | `available: string[]`, `assigned: Map<string, string>` (requesterId to name), `queue: string[]` |
| `sync` | `sendQueue: {requesterId, data}[]`, `receiveQueue: string[]`, `pendingSync: string[]` |

### Queue Processing

On every `release*` call, check the head of the queue. If the head request can now be fulfilled, grant it and add the requesterId to `pendingGrants` (to be returned by `flushGranted()`). Strict FIFO: never skip the head.

## Sync Resource Semantics

Sync resources use FIFO queues for both senders and receivers, supporting multiple concurrent SEND/RECEIVE pairs on the same sync resource.

- **SEND**: Push `{requesterId, data}` onto the `sendQueue`. If a receiver is waiting in the `receiveQueue`, match them: dequeue the receiver, deliver the data, and grant both (sender and receiver added to `pendingGrants`). If no receiver is waiting, step enters WAITING.
- **RECEIVE**: Check the `sendQueue`. If a sender is waiting, dequeue the sender, read the data, write to property store via `target`, and grant both. If no sender is waiting, push requesterId onto the `receiveQueue` and step enters WAITING.
- **SYNCHRONIZE**: Pairwise barrier (exactly 2 participants). Step pushes requesterId onto `pendingSync`. If `pendingSync` now has 2 entries, dequeue both and grant both. If only 1, step enters WAITING. For N-way synchronization, use multiple named sync resources.

**Data flow for SEND/RECEIVE:** The engine reads the value from `propertyStore[source]` for SEND commands and passes that string to `resourceManager.send()`. On RECEIVE, the engine writes the received data string to `propertyStore[target]`.

## Multi-Workflow Coordination

### Workflow-Scoped Resources

- Registered on the ResourceManager when `engine.start()` is called, with `ownerId = workflowInstanceId`.
- Visible to the workflow and all child workflows (WORKFLOW PROXY steps).
- Child workflows inherit the parent's ResourceManager instance.
- Child workflow `requesterId` uses the child's own instance ID, but resource lookup walks up to the parent's registrations.
- On workflow completion or error: `releaseAll(workflowInstanceId)` frees all held resources and logs warnings for any that were not explicitly released.

### Environment-Scoped Resources

- Auto-loaded from `.WFenvir` files in the workflow package's `environments/` directory.
- Registered with `ownerId = "environment"` on the ResourceManager, **only if not already registered** (idempotent, first-writer-wins).
- Shared across all workflow instances using the same ResourceManager.
- Never auto-cleaned by workflow completion; they persist until explicitly unregistered.
- The workflow spec declares environment resources so the engine can validate that commands reference valid resources.

### Environment Library Format

Environment libraries (`.WFenvir` files) follow the `MasterEnvironmentLibrary` schema (`spec/environment-schema.json`). Each file contains:

- `environment_specifications[]`: Array of `MasterEnvironmentSpecification`, each with:
  - `value_property_specifications[]`: Environment-level value properties
  - `resource_property_specifications[]`: Environment-level resource definitions
  - `included_actions[]`: Action definitions (future use)
- `child_libraries[]`: Nested child environment libraries (recursive)

### Package Loading Flow

1. `.WFmasterX` zip is loaded (existing loader).
2. Loader scans for `environments/*.WFenvir` files in the package.
3. For each WFenvir file, parse the `MasterEnvironmentLibrary`:
   - Walk `environment_specifications[]` and any nested `child_libraries[]`.
   - For each `MasterEnvironmentSpecification`:
     - `resource_property_specifications[]`: Register on ResourceManager if not already registered.
     - `value_property_specifications[]`: Load into property store as environment-level properties (same idempotent rule).
4. Load the workflow spec as normal.

### WorkflowEngine Constructor Change

The existing `setup` parameter name is preserved. The `resourceManager` field is added:

```typescript
constructor(spec: MasterWorkflowSpecification, setup?: {
  starting_parameters?: Record<string, string>;
  initial_properties?: Record<string, string>;
  resourceManager?: ResourceManager;
})
```

If no ResourceManager is provided and the workflow has no resource commands, everything works as before. If resource commands exist but no ResourceManager is provided, the engine throws a validation error at `start()`.

Child engines created for WORKFLOW PROXY steps receive the parent's ResourceManager instance.

## Validation

New semantic validations at `engine.start()`:

1. **Resource commands reference valid resources**: Every `resource_command_specifications[].resource_name` on a step must match a `resource_property_specifications[].name` on the workflow or an environment resource registered on the ResourceManager.
2. **Command/type compatibility**:
   - `Acquire` / `Release`: `binary exclusive use`, `binary shared use with pool limits`, or `named pool`
   - `Acquire Pool Amount` / `Release Pool Amount`: `countable use with pool limits`
   - `Send` / `Receive` / `Synchronize`: `sync`
3. **At most one Sync command per step**: Error if a step has multiple Send/Receive/Synchronize commands.
4. **Amount required**: `Acquire Pool Amount` / `Release Pool Amount` must have `amount > 0`.
5. **ResourceManager required**: If any resource commands exist in the workflow, a ResourceManager must be provided in options.
6. **Named pool has names**: `named pool` resources must have a non-empty `names[]` array.
7. **Pool types have use_limit**: `binary shared use with pool limits` and `countable use with pool limits` must have `use_limit > 0`.

## Error Handling for Invalid Release Calls

- **Release of unowned resource** (step releases a resource it does not hold): No-op. The ResourceManager logs a warning but does not throw. This prevents cascading errors during cleanup.
- **Double release**: Same as unowned -- no-op with warning.
- **`releaseAmount` with amount exceeding held amount**: No-op with warning. The resource state is not modified.
- **Acquire/release on unregistered resource**: Throws an error. This indicates a validation gap and should be caught during semantic validation.

## Cleanup on Workflow Completion/Error

When a workflow completes or enters ERRORED state:

1. Call `releaseAll(workflowInstanceId)` on the ResourceManager.
2. All held resources are freed; queued requests from this workflow are removed.
3. If any resources were still held (not explicitly released), log a warning. This indicates the workflow author missed a Release step.
4. Freed resources may unblock waiting steps in other workflows. The caller must call `flushGranted()` after `releaseAll()` to process any unblocked requests.

## Testing Strategy

### Conformance Test Fixtures

New fixtures in `spec/conformance/resources/`:

| Test ID | Description |
|---|---|
| `res-binary-001-exclusive-acquire-release` | Single use resource: acquire on step A, release on step B, verify exclusive access |
| `res-binary-002-exclusive-wait` | Two steps compete for single use resource, second enters WAITING, resumes after release |
| `res-shared-001-pool-limit` | Shared resource with `use_limit: 2`, two steps acquire, third waits |
| `res-shared-002-fifo-order` | Verify strict FIFO queue ordering on shared resource |
| `res-countable-001-amount` | Acquire/release amounts from countable pool |
| `res-countable-002-strict-fifo` | Large request at head blocks smaller request behind it |
| `res-named-001-assign` | Named pool assigns available name, writes to `target` property |
| `res-named-002-exhaust-pool` | All names taken, next request waits, release returns name to pool |
| `res-sync-001-send-receive` | SEND queues data, RECEIVE picks it up, both complete |
| `res-sync-002-receive-first` | RECEIVE arrives before SEND, enters WAITING, resumes when data sent |
| `res-sync-003-synchronize` | Two steps barrier-sync, both wait then both proceed |
| `res-cleanup-001-auto-release` | Workflow completes with held resources, verify auto-release with warning |
| `res-validation-001-missing-resource` | Command references nonexistent resource, expect validation error |
| `res-validation-002-command-type-mismatch` | Acquire Pool Amount on a binary resource, expect validation error |
| `res-scope-001-child-workflow` | Child workflow acquires parent's workflow-scoped resource |
| `res-order-001-sync-before-acquire` | Step with both Sync and Acquire commands, verify Sync processed first |
| `res-order-002-alphabetical` | Step with multiple acquires, verify alphabetical processing order |

### Unit Tests

Direct tests for `ResourceManager` class (not through engine):

- Each resource type: register, acquire, release, queue behavior
- Edge cases: double release, release unowned, acquire after unregister
- `releaseAll` with warning detection

### Test Fixture Format Extension

```typescript
setup?: {
  starting_parameters?: Record<string, string>;
  initial_properties?: Record<string, string>;
  resources?: ResourcePropertySpecification[];
};
```

The test runner creates an `InMemoryResourceManager`, registers the `setup.resources` entries, and passes it to the engine via the `setup.resourceManager` option.

## File Structure

### New Files

| File | Purpose |
|---|---|
| `engines/web/src/resource-manager.ts` | `ResourceManager` interface + `InMemoryResourceManager` implementation |
| `engines/web/src/resource-manager.test.ts` | Unit tests for ResourceManager directly |
| `engines/web/src/environment-loader.ts` | Parse WFenvir files, register environment resources/properties |
| `engines/web/src/environment-loader.test.ts` | Unit tests for environment loading |
| `spec/conformance/resources/*.json` | ~17 conformance test fixtures |
| `spec/environment-schema.json` | Environment library schema (already created) |

### Modified Files

| File | Change |
|---|---|
| `engines/web/src/types.ts` | `scope` field (done), add `MasterEnvironmentLibrary` types, `PendingResourceState` interface, `resourceManager` option on setup, update `ResourceCommandSpecification.command_type` from `string` to `ResourceCommandType` union |
| `engines/web/src/engine.ts` | Resource command processing in activation/completion, WAITING state handling, resume logic, `onGranted` callback, `releaseAll` on workflow end, pass ResourceManager to child engines |
| `engines/web/src/step-handlers.ts` | Helpers to split/sort resource commands, extract sync command |
| `engines/web/src/validator.ts` | New semantic validations (7 rules above) |
| `engines/web/src/loader.ts` | Load WFenvir files from `.WFmasterX` zip packages |
| `engines/web/src/index.ts` | Export ResourceManager interface and InMemoryResourceManager |
| `engines/web/src/runner.ts` | Support `setup.resources` in test fixtures |
| `spec/workflow-schema.json` | `scope` field (done) |

## Out of Scope

- Remote/distributed ResourceManager implementation
- UI for resource status visualization
- Resource timeout/expiry
- Priority-based queue ordering
