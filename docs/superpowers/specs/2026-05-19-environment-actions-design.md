# Environment Actions — Design Spec

**Status:** Approved (2026-05-19)
**Branch:** `feat/environment-actions`
**Related:** `docs/2026-05-18-trajectory-rest-protocol-design.md`, `schemas/master-environment-library.json`

---

## 1. Overview

Environment Actions are workflow steps that delegate execution to an external Action Container over the Trajectory REST protocol. A workflow package declares one or more environments; each environment names a set of registered action servers. Steps of type `ACTION PROXY` reference an environment; at runtime, the Trajectory Runtime invokes the referenced action on the user-selected server, observes its ISA-88 state machine, and surfaces controls so the user can pause / hold / abort the action.

This document is the design spec for **Phase 1 (Web-UI)**. Phase 2 (Android) reuses the engine and persistence changes but re-implements the coordinator and UI in Kotlin/Compose.

---

## 2. Scope

### In scope (Phase 1)

- `ACTION PROXY` step type in the KMP engine (validation + treated as "wait for external completion").
- `action_server_specifications` parsed into the KMP `MasterEnvironmentSpecification`.
- Web-UI coordinator (`ActionProxyController`) that owns invoke, transport, command sending, state mapping, and persistence.
- New UI components: `ActionProxyStepCard`, `ActionCommandMenu`, `ActionServerPicker`, `ActionLogPanel`.
- Per-environment server picker at workflow start, with abandon-workflow as a first-class option.
- SSE-based transport via `EventSource`, behind an `ActionInstanceObserver` interface so Phase 2 can plug in polling.
- localStorage persistence of in-flight instance IDs; reconnect on reload.
- ABORT-then-DELETE cleanup on workflow abandon.
- Integration tests against the TrajectoryActions container on `http://localhost:3002`.

### Out of scope (deferred to later phases / projects)

- Android implementation (Phase 2).
- iOS implementation.
- API-key authentication UX. Phase 1 supports only open servers; a 401 surfaces as a clear error.
- Action **browsing** UI (catalog views of `/capabilities`) — the workflow editor handles that. The runtime still **fetches** `/capabilities` once per server-bind for the metadata it needs (`supported_commands`, `visibility`); see §3.4.
- Server registration UI inside Trajectory Runtime (servers come from the workflow package).
- Reusing the coordinator HTTP/SSE logic in KMP `commonMain` (per architectural choice — engine stays unaware).

---

## 3. Architecture

### 3.1 Layer ownership

| Layer | Responsibility |
|---|---|
| KMP engine (`commonMain`) | Validate `"ACTION PROXY"` as a step type. Treat it like `USER_INTERACTION`: a step that does not auto-complete and waits for an external completion signal. Round-trip `action_server_specifications` on `MasterEnvironmentSpecification`. No HTTP, no state mapping, no command logic. |
| Web-UI Coordinator (TS) | `ActionProxyController` (one per active action-proxy step) owns: invoke, server-state tracking, transport (SSE), command sending, state→engine mapping, outputs propagation. Uses `WorkflowCoordinator` to write outputs into the engine value-property store and signal step completion. |
| Web-UI components | `ActionProxyStepCard`, `ActionCommandMenu`, `ActionServerPicker`, `ActionLogPanel`. Integrated inline within the existing `StepRenderer` switch (matches project convention — no separate container). |
| Persistence | New `trajectory.actionProxyState.v1` localStorage slice for in-flight instance IDs. Server bindings (env_oid → uri) persist with the workflow instance. |
| Tests | Integration tests against the real TrajectoryActions container on `:3002`. KMP-level unit tests for new step-type validation. Web-UI unit tests for the controller. |

### 3.2 Transport abstraction

A single TS interface lets Phase 1 (SSE) and Phase 2 (polling) coexist behind the same coordinator code:

```ts
interface ActionInstanceObserver {
  subscribe(
    serverUri: string,
    instanceId: string,
    onEvent: (e: ActionEvent) => void,
  ): () => void; // returns unsubscribe
}

type ActionEvent =
  | { kind: 'state_change'; state: string; previous_state: string | null; ts: string; eventId: number }
  | { kind: 'output'; outputs: Array<{ name: string; value: string }>; ts: string; eventId: number }
  | { kind: 'log'; stream: 'stdout' | 'stderr'; message: string; ts: string; eventId: number }
  | { kind: 'heartbeat'; ts: string };
```

Phase 1 ships `SseObserver` (uses `EventSource` + `Last-Event-ID` for replay on reconnect). Phase 2 will ship a `PollingObserver` (Android-friendly, cadence 1 s focused / 5 s backgrounded).

### 3.3 Engine changes

The engine remains unaware of HTTP or ISA-88 semantics. Required changes:

1. `Types.kt: MasterEnvironmentSpecification` — add field:
   ```kotlin
   val action_server_specifications: List<ActionServerSpecification>? = null
   ```
   and a new data class:
   ```kotlin
   @Serializable
   data class ActionServerSpecification(
       val name: String,
       val uri: String,
       val description: String? = null,
       val connection_type: String,  // "REST" only in v1
   )
   ```
2. `Validator.kt: VALID_STEP_TYPES` — add `"ACTION PROXY"`. Add validation: an `ACTION PROXY` step's `environment_oid` (resolved from the step's enclosing env binding) must reference an environment present in `environment_specifications`.
3. `StepHandlers.kt: needsUserAction()` — extend to include `"ACTION PROXY"`. The engine then treats the step the same way it treats `USER_INTERACTION`: does not auto-complete, waits for the coordinator to signal completion.

No new step state. No HTTP. No command handling.

### 3.4 Capabilities fetch and cache

The runtime needs per-action `supported_commands` and `visibility` to filter the command dropdown (§5.3) and to hide inputs for opaque actions (§8.1). These come from `GET {serverUri}/trajectory/v1/capabilities`, which returns the catalog of every action the container knows about.

- Fetched **once per server bind** at workflow start, immediately after `ActionServerPicker` resolves a server URI for an environment (or, in the 1-server silent-bind path, before the engine schedules any steps).
- Cached in memory for the lifetime of the workflow instance, keyed by `(serverUri, action_oid) → { supported_commands, visibility }`.
- Persisted alongside the workflow's server bindings so reload after the workflow has already started does not need to re-fetch.
- On fetch failure: workflow start fails with `"Cannot reach action server: {error}"` and the user is returned to the picker. (Not "abandon" — the picker re-appears so they can choose a different server or retry.)

This is a runtime metadata fetch, not an action-browsing UX. Browsing/catalog views remain in the workflow editor (out of scope for this spec).

---

## 4. Server picker

### 4.1 When

After workflow rehydration but before the engine schedules the first step. The coordinator scans `workflow.environment_specifications` for environments that (a) have ≥ 1 `action_server_specifications` AND (b) have ≥ 1 `ACTION PROXY` step that references the environment. For each such environment, a picker dialog is shown sequentially.

### 4.2 How

| Env's registered servers | Picker behavior |
|---|---|
| ≥ 2 | Modal with radio list `{name, uri, description}`, primary "Use", secondary "Abandon workflow". |
| 1 | Silent bind — no dialog. |
| 0 | Modal with text field for an ad-hoc URI (placeholder `http://host:3002`), URL-validated on blur, primary "Connect", secondary "Abandon workflow". |

Connectivity is **not** pre-tested. First failure surfaces at invoke time with the network-error UX described in §6.

### 4.3 Persistence of bindings

Bindings persist with the workflow instance (existing persistence layer, new field `serverBindings: Record<environment_oid, serverUri>`). On reload, bindings are restored — the picker does not reappear.

"Once per env per workflow start" is the chosen scope: bindings are scoped to the workflow instance, not the app session. Starting a second workflow instance triggers the picker again.

### 4.4 Abandon from picker

"Abandon workflow" before any instance is invoked is trivial: no server-side cleanup needed. The workflow is not started.

---

## 5. Action lifecycle

### 5.1 Engine view

```
IDLE → STARTING → EXECUTING → COMPLETED | ERRORED
                       ↑↓
                    PAUSED
```

The engine's `StepState` enum gains no new states. The coordinator drives transitions based on server signals.

### 5.2 Server state → engine state mapping

| Server state | Engine `StepState` | Card label | Notes |
|---|---|---|---|
| `IDLE` (pre-start) | `STARTING` | "Starting" | |
| `RUNNING` | `EXECUTING` | "Running" | |
| `PAUSED` | `PAUSED` | "Paused" | User-issued PAUSE |
| `HELD` | `PAUSED` | "Held" | Action self-initiated; action self-exits |
| `COMPLETED` | `COMPLETED` | "Completed" | |
| `ABORTED` / `STOPPED` | `ERRORED` | "Aborted" / "Stopped" | |
| `ERRORED` | `ERRORED` | "Error: \<message\>" | |

The card always shows the raw server state name; the engine mapping is internal. `PAUSED` and `HELD` collapse to the same engine state but render differently and gate different commands.

### 5.3 Per-state command rules

The dropdown shows the intersection of `action.supported_commands` AND the per-state commands below:

| Server state | Commands shown |
|---|---|
| `IDLE` (pre-start) | ABORT |
| `RUNNING` | PAUSE, HOLD, ABORT, STOP |
| `PAUSED` (user) | RESUME, ABORT, STOP |
| `HELD` (action) | STOP, ABORT only |
| `COMPLETED` | CLEAR |
| `ABORTED` / `STOPPED` | CLEAR |
| `ERRORED` | CLEAR, ABORT |
| `opaque` visibility, any state | ABORT only |

If the server's `supported_commands` set doesn't include a state-valid command, the command is hidden. If the server still rejects with 409 (state changed between read and click), a toast surfaces "Cannot {command} while {server_state}" — defensive safety net only; this should be rare.

### 5.4 End-to-end sequence (single step)

1. **Engine schedules the step.** Coordinator sees the step transition to a non-auto-completing state.
2. **Resolve invoke body.** `environment_oid`, `workflow_instance_id`, `step_instance_id`, `step_oid` come from the engine. `input_parameters` come from the engine's existing parameter resolution path, then are formatted as `Array<{name, value}>`. `serverUri` is pulled from `workflowInstance.serverBindings[environment_oid]`.
3. **POST invoke.** `POST {serverUri}/trajectory/v1/actions/{action_oid}/invoke`.
   - **201** → store `instance_id`; persist `{workflowInstanceId, stepInstanceId, instanceId, serverUri, environmentOid, lastKnownServerState: 'IDLE'}`.
   - **4xx with logic error** → step → ERRORED, server message surfaced.
   - **Network failure** → exponential backoff retry (250 ms, 500 ms, 1 s, 2 s, 5 s, 15 s, 30 s cap), card label `"Starting (retrying network: Ns)"`. Persistence entry is **not** written until the first 201.
4. **Open SSE.** `GET {serverUri}/trajectory/v1/instances/{instance_id}/events`. Subscribe via `EventSource`. On each event:
   - `state_change` → update card label and engine state via the §5.2 mapping.
   - `output` → merge into accumulated outputs; on terminal, write outputs into the engine value-property store.
   - `log` → append to the per-instance log ring (size 100), visible in `ActionLogPanel`.
   - `heartbeat` → reset the connection watchdog.
5. **Command sends.** `POST {serverUri}/trajectory/v1/instances/{instance_id}/command` with `{command}`. 200 is a noop (the state update arrives via SSE). 409 → toast. 422 → toast (defensive).
6. **Terminal state.**
   - `COMPLETED` — write outputs into the engine value-property store keyed by the step's `output_parameter_specifications` (name match), then signal step completion.
   - `ABORTED` / `STOPPED` / `ERRORED` — signal step ERRORED with the server's final error message. Workflow's existing ERRORED handling takes over.
   - SSE is closed (server tears down the bus after a 7 s linger). Persistence entry is removed.

### 5.5 Reload mid-flight

On app load, hydrate the persistence slice **before** rendering the workflow. For each persisted entry:

1. `GET {serverUri}/trajectory/v1/instances/{instance_id}`.
2. **200 + non-terminal** → restore card state, resume SSE (use `Last-Event-ID` if tracked; otherwise no replay needed — the next `state_change` reconciles).
3. **200 + terminal** → apply final state, propagate outputs, complete or error the step.
4. **404** → mark step ERRORED, label `"Instance lost on server"` with the instance_id for diagnostics.
5. **Network error** → keep the persisted state on screen; retry in the background. The card shows a small `"⚠ reconnecting"` badge.

---

## 6. Error handling

| Failure | Surface | Behavior |
|---|---|---|
| Picker: invalid URL typed | Inline in `ActionServerPicker` | Red text under field, "Connect" disabled |
| Invoke: network failure | Card label | `"Starting (retrying network: Ns)"` + spinner, exponential backoff 250 ms → 30 s cap |
| Invoke: 404 ACTION_NOT_FOUND | Card label + toast | Step → ERRORED with server message |
| Invoke: 400 PARAMETER_VALIDATION_FAILED | Card label + toast | Same as 404; toast includes the offending field name |
| Invoke: 401 UNAUTHORIZED | Card label + toast | `"Authentication required — server requires an API key. Phase 1 supports only open servers."` Step → ERRORED |
| Invoke: 500 EXECUTION_ERROR | Card label + toast | Step → ERRORED with server message |
| SSE: connect failure | Card stays in last-known state | Auto-reconnect with exponential backoff. After 30 s sustained failure: `"⚠ reconnecting"` badge, card stays in last-known state |
| SSE: reconnect after drop | Transparent | `Last-Event-ID` (tracked per instance) on reconnect; server replays from its 256-event ring |
| SSE: 7 s-linger window missed | Reconciled via GET | Coordinator reconciles via `GET /instances/:id` on tab visibility change to "visible" or on a 30 s reconciliation timer |
| Command: 409 INVALID_STATE_TRANSITION | Toast | `"Cannot {command} while {server_state}"` |
| Command: 422 INVALID_COMMAND | Toast (defensive) | Should not happen with the state-filtered dropdown |
| Reload: instance 404 | Card → ERRORED | `"Instance lost on server"` with the instance_id |
| Reload: instance terminal | Card → final state | Outputs propagate; step completes/errors per terminal kind |

**Retry scope.** Transport-level failures only (network timeout, connection refused, SSE disconnect). Logic-level errors (4xx/5xx with an error envelope) surface immediately as a step ERRORED state with the server's message — no retry.

---

## 7. Abandon workflow

When the user invokes "Abandon workflow" while one or more action instances are in-flight:

```
1. Collect the set A = all action instances for this workflow that are
   non-terminal (not in {COMPLETED, STOPPED, ABORTED, ERRORED}).

2. In parallel, for each instance in A:
     POST {serverUri}/trajectory/v1/instances/{instance_id}/command
       body: {"command": "ABORT"}
   Per-call timeout 5 s. Tolerate 409 (instance reached terminal between read and send).
   Await all responses.

3. In parallel, for each instance in A:
     DELETE {serverUri}/trajectory/v1/instances/{instance_id}
   Per-call timeout 5 s. Tolerate 404 (server reaped already).
   Await all responses.

4. Clear all persistence entries for this workflow.
5. Engine's existing abandon path runs (terminate workflow, clear coordinator).
```

The two phases are sequential (ABORT-then-DELETE) so the server has a chance to run ISA-88 abort cleanup before the instance record is removed.

---

## 8. UI components

### 8.1 `ActionProxyStepCard`

Rendered inline within `StepRenderer`'s switch when `step.stepType === "ACTION PROXY"`. Layout:

```
┌──────────────────────────────────────────────┐
│ Pick and Place                          [⋮]  │
│ Running                                       │
├──────────────────────────────────────────────┤
│ Inputs                                        │
│   source        = A1                          │
│   destination   = B2                          │
├──────────────────────────────────────────────┤
│ Server: warehouse-controller-01               │
└──────────────────────────────────────────────┘
```

- Title: `step.local_id`.
- State line: raw server state from `lastKnownServerState` (`"Running"`, `"Held"`, etc.).
- Inputs section: the resolved `input_parameters` actually sent in the invoke body. Hidden for `opaque` visibility actions.
- Footer: environment name and bound server name.
- `[⋮]` opens the per-step command dropdown.

While a command is in flight: dropdown disabled, `[⋮]` shows a spinner.

Clicking the card opens the existing `StepDetailPopup`, which now includes the new `ActionLogPanel` for this step type.

### 8.2 `ActionCommandMenu`

Per-step dropdown — separate component from the existing workflow-level `StateCommandMenu`. Menu items computed from the §5.3 table. On click: `POST .../command`, optimistic disable until response, toast on 409/422.

### 8.3 `ActionServerPicker`

Modal dialog. Three layouts per §4.2. Sequential when multiple environments need binding.

### 8.4 `ActionLogPanel`

Rendered inside the existing `StepDetailPopup` when the step is an action proxy. Shows the per-instance log ring (up to 100 entries). Auto-scrolls. Empty state: `"No log messages."`.

### 8.5 Hook: `useActionProxy(stepInstanceId)`

Subscribes to the controller's state snapshot. Returns `{ serverState, label, inputs, outputs, commandInFlight, logs, sendCommand, availableCommands }`.

---

## 9. Persistence

### 9.1 Schema

localStorage key: `trajectory.actionProxyState.v1`

```ts
type PersistedInstance = {
  workflowInstanceId: string;
  stepInstanceId: string;
  stepOid: string;
  instanceId: string;
  serverUri: string;
  environmentOid: string;
  lastKnownServerState: string;
  lastEventId: number | null;
};

type PersistedSlice = {
  version: 1;
  instances: PersistedInstance[];
};
```

Server bindings (`Record<environment_oid, serverUri>`) persist with the workflow instance in the existing persistence layer — not in this slice.

### 9.2 Write policy

- Debounced 250 ms on `state_change` or `lastEventId` advance.
- Immediate write on terminal (before clearing the entry).
- Immediate write on first successful invoke 201.

### 9.3 Read policy

- Read once on app load.
- Hydration runs **before** the engine schedules any steps, so terminal entries can be applied to the engine value-property store before the workflow advances past those steps.

---

## 10. Observability

- Coordinator logs each state transition: `[ActionProxy {instanceId}] {prev} → {next}`.
- SSE reconnect attempts: `[ActionProxy {instanceId}] reconnect attempt N (backoff Xms)`.
- Command sends: `[ActionProxy {instanceId}] command {name} → 200|409|...`.
- No new `TraceEntry` fields. The existing engine trace already records step state transitions, which is sufficient.

---

## 11. Conformance fixtures

Three new JSON fixtures in `spec/conformance/`:

- `validation/val-action-proxy-001.json` — `ACTION PROXY` step references unknown `environment_oid` → INVALID_VALIDATION.
- `validation/val-action-proxy-002.json` — `ACTION PROXY` step in a workflow with no `environment_specifications` → INVALID_VALIDATION.
- `execution/exec-action-proxy-001.json` — engine schedules an `ACTION PROXY` step, asserts the step enters EXECUTING and stays there until externally completed.

These run in the web `node --test` suite and in the KMP JVM and JS test runners.

---

## 12. Testing strategy

### 12.1 Integration target

All integration tests run against a real TrajectoryActions container at `http://localhost:3002/trajectory/v1`. The container's existing `kitchen` and `warehouse` scenarios (`C:\Trajectory\TrajectoryActions\scripts\scenarios\`) provide real action OIDs.

### 12.2 Test layout

| Layer | Tooling | What it covers |
|---|---|---|
| KMP common (engine) | `kotlin.test` | New step-type validation, env spec round-trip, `needsUserAction("ACTION PROXY")` |
| Web TS conformance | `node --test` | Conformance fixtures from §11 |
| Web-UI unit | `node --test` against `ActionProxyController` | State mapping, command filtering table, persistence read/write, dropdown rules |
| Web-UI integration | `node --test` against `localhost:3002` | Invoke → SSE → state transitions → outputs in property store; command → state change; abort → DELETE cleanup; reload mid-flight → reconnect |
| Web-UI manual checklist | Browser against `localhost:3002` | Picker dialog flows (0/1/2+ servers), abandon-workflow cleanup, HELD label, opaque action ABORT-only |

### 12.3 Integration test harness

New file `engines/web-ui/test/integration/action-container.ts`:

- `ensureContainerUp()` — `GET /health`, throws a clear message if `:3002` is unreachable: `"TrajectoryActions container not running on :3002. Start it with: cd C:\\Trajectory\\TrajectoryActions && pnpm dev"`.
- `deployScenario(name: 'kitchen' | 'warehouse')` — invokes the container's management API to deploy the fixture set; returns action OIDs and a teardown function.
- `waitForState(instanceId, expected, timeoutMs)` — polls `GET /instances/:id` until match.
- `invokeAndWait(actionOid, inputs, terminal)` — convenience for fire-and-forget tests.

### 12.4 Gates

- **Pre-merge:** KMP common, web conformance, and `ActionProxyController` unit tests must pass.
- **Integration:** `npm run test:integration` in `engines/web-ui`. Skipped (with a console notice) if `:3002` is unreachable.
- **Manual:** `MANUAL-TEST-CHECKLIST.md` on the feature branch covers picker UX flows that aren't reasonable to assert in code.

---

## 13. Phase breakdown

### Phase 1 — Web-UI (this branch: `feat/environment-actions`)

| # | Workstream | Description |
|---|---|---|
| 1 | Engine spec + types | Add `ActionServerSpecification` data class; extend `MasterEnvironmentSpecification`; add `action_proxy_config` to step schema and `ActionProxyConfig` to KMP (§14.1); register `"ACTION PROXY"` in validator with the rules in §14.2 and in `needsUserAction`; reconcile with TrajectoryEditor (§14.3). New conformance fixtures. |
| 2 | Transport abstraction | `ActionInstanceObserver` interface, `SseObserver` implementation, `ActionApiClient` (HTTP for invoke/get/list/command/delete with retry + backoff). |
| 3 | Coordinator | `ActionProxyController`, state mapping, command-filtering table, persistence slice, reload/reconnect logic. Wired into `WorkflowCoordinator`. |
| 4 | UI components | `ActionProxyStepCard`, `ActionCommandMenu`, `ActionServerPicker`, `ActionLogPanel`. Integrated into `StepRenderer` and existing `StepDetailPopup`. |
| 5 | Persistence | localStorage slice, hydrate-before-engine-start sequencing. Abandon-workflow cleanup (ABORT-then-DELETE) wired into existing abandon path. |
| 6 | Integration tests | Container harness; the invoke / SSE / command / reload / abandon scenarios. |
| 7 | Manual test pass + docs | Run the manual checklist; update `docs/Trajectory-Workflow-Schema-Specification.md` to document `ACTION PROXY` and `action_server_specifications`. |

Each item becomes its own GSD phase. Atomic commits per project convention.

### Phase 2 — Android (later milestone, separate branch)

Re-implement the coordinator/controller/UI in Kotlin/Compose. The transport abstraction is what gets the second implementation (`PollingObserver`, cadence 1 s focused / 5 s backgrounded). Engine changes from Phase 1 are reused unchanged.

---

## 14. Schema additions

### 14.1 `action_proxy_config` on a workflow step

The `master-workflow-step-library.json` schema currently lists `"ACTION PROXY"` in the `step_type` enum but defines no config block for it. Phase 1 step 1 adds:

```jsonc
{
  "action_proxy_config": {
    "type": "object",
    "description": "Configuration for ACTION PROXY step type.",
    "required": ["action_oid", "environment_oid"],
    "properties": {
      "action_oid": {
        "type": "string",
        "description": "OID of the action to invoke. Must appear in the workflow's environment_specifications[environment_oid].included_actions."
      },
      "environment_oid": {
        "type": "string",
        "description": "OID of the environment whose registered action server runs this action."
      },
      "timeout_ms": {
        "type": "number",
        "description": "Optional per-invoke timeout override. If omitted, the action server's default applies."
      }
    }
  }
}
```

The corresponding KMP type:

```kotlin
@Serializable
data class ActionProxyConfig(
    val action_oid: String,
    val environment_oid: String,
    val timeout_ms: Long? = null,
)
```

added to `MasterWorkflowStep` as `val action_proxy_config: ActionProxyConfig? = null`.

### 14.2 Validation rules added in `Validator.kt`

For every step where `step_type == "ACTION PROXY"`:

1. `action_proxy_config` must be present. Otherwise `INVALID_VALIDATION: "ACTION PROXY step {oid} missing action_proxy_config"`.
2. `action_proxy_config.environment_oid` must match an entry in the workflow's `environment_specifications[].oid`. Otherwise `INVALID_VALIDATION: "ACTION PROXY step {oid} references unknown environment_oid {value}"`.
3. `action_proxy_config.action_oid` must match an entry in that environment's `included_actions[].action_oid`. Otherwise `INVALID_VALIDATION: "ACTION PROXY step {oid} action_oid {value} not in environment {env_oid}"`.

### 14.3 Reconciliation with TrajectoryEditor

The TrajectoryEditor is the upstream producer of these step JSON blocks. Phase 1 step 1 will check what the editor currently emits for `"ACTION PROXY"` steps (if anything) and reconcile field names. If the editor's format diverges from §14.1, the spec is the canonical target and the editor is updated to match.

---

## 15. Open questions

None blocking. Items to confirm during Phase 1 step 1:

- Whether to add `local_id` and `oid` to `ActionServerSpecification` (not currently in the schema). Useful for stable references; will decide and update the schema if added.
- TrajectoryEditor's current emission for `"ACTION PROXY"` steps (see §14.3).
