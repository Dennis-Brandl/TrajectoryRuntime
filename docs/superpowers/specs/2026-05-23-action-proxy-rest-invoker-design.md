# ACTION PROXY — REST Invoker Design

**Date:** 2026-05-23
**Status:** Draft (awaiting review)
**Scope:** `engines/web` (TS), `engines/kmp-engine` (Kotlin), `engines/web-ui` (React). iOS Swift and Android execution deferred (validators only this round).

---

## 1. Goal

Implement execution of `ACTION PROXY` step type by invoking actions on a registered REST Action Container that conforms to `spec/docs/RESTProtocolSpec.md`. Mirror the Action Container's ISA-88 lifecycle into the step state, support both SSE and polling transports, and forward UI commands (PAUSE / RESUME / STOP / ABANDON) to the running action instance.

Drop `WAIT ACTION PROXY` and `NOWAIT ACTION PROXY` from the schema and all validators — they are no longer valid step types.

## 2. Why this exists

The TS engine and KMP engine recognize `ACTION PROXY` as a valid step type but have no execution branch for it in `activateStepAfterResources`. A workflow that reaches an ACTION PROXY step today silently stalls: the step remains `IDLE`, never appears in `getActiveSteps()`, and no HTTP request is ever made to the Action Container. There is no HTTP client code anywhere in the Runtime today.

This design adds the missing execution path.

## 3. Out of scope

- iOS Swift execution path (validator removal of `WAIT/NOWAIT ACTION PROXY` only).
- Android Kotlin execution path beyond what the shared KMP core provides.
- `HOLD` / `UNHOLD` / `CLEAR` commands in the Runtime UI (engine plumbing supports them but no UI buttons).
- Multi-server failover within a single environment (we pick one server per environment and stay on it).
- Reusing `runtime_action_instance_id` across browser reloads.
- Authenticated Action Containers (v1.0 spec has none; CORS is `*`).

---

## 4. Architecture

### 4.1 Dependency graph

```
┌─────────────────────────────────────────────────┐
│ web-ui (React)                                  │
│   SettingsScreen      — action-proxy settings   │
│   WorkflowStartDialog — server picker (new)     │
│   ActiveStepCard      — "Reconnecting…" badge   │
│   StateCommandMenu    — adds STOP command       │
└──────────────┬──────────────────────────────────┘
               │ uses
               ▼
┌─────────────────────────────────────────────────┐
│ WorkflowCoordinator  (TS)                       │
│   - constructs invoker per workflow             │
│   - probes /capabilities at start               │
│   - holds session map of action-server choices  │
│   - forwards UI commands → engine → invoker     │
└──────────────┬──────────────────────────────────┘
               │ injects ActionInvoker
               ▼
┌─────────────────────────────────────────────────┐
│ engines/web (TS) + engines/kmp-engine (Kotlin)  │
│   activateStepAfterResources():                 │
│     + branch: "ACTION PROXY" → invoker.invoke   │
│   onExternalStateChange(oid, state, outputs)    │
│     + new public callback the invoker calls     │
│   pauseStep / resumeStep / stopStep / abortStep │
│     + extended to forward via invoker           │
└──────────────┬──────────────────────────────────┘
               │ interface
               ▼
┌─────────────────────────────────────────────────┐
│ ActionInvoker  (interface)                      │
│   invoke(serverUri, action_oid, inputs, opts)   │
│   sendCommand(instanceId, command)              │
│   abort(instanceId)                             │
│   probeCapabilities(serverUri) → SeverCaps      │
│   onStateChange / onComplete / onError callbacks│
└──────────────┬──────────────────────────────────┘
               │ implementations
       ┌───────┴────────┐
       ▼                ▼
HttpActionInvoker   KtorActionInvoker
(TS, web-ui:        (KMP, Android/iOS/KMP-JS:
 fetch +             ktor HTTP client,
 EventSource)        polling only)
```

### 4.2 Why this shape

- **Engine owns step lifecycle.** Matches the existing pattern for `SCRIPT` (calls `platformEvalScript`) and `WORKFLOW PROXY` (calls `activateWorkflowProxy`).
- **`ActionInvoker` is a platform-abstracted dispatcher.** Same interface in TS and KMP, different implementations behind it. Engine stays pure of HTTP code.
- **Coordinator owns user-facing orchestration**: server selection at start, retry status surfaced to the UI snapshot, lifetime of the invoker tied to the workflow.

## 5. Components

| Component | Location | Purpose |
|---|---|---|
| `ActionInvoker` interface | `engines/web/src/action-invoker.ts`, `engines/kmp-engine/.../ActionInvoker.kt` | Defines invoke / sendCommand / abort / probeCapabilities and callback shape |
| `HttpActionInvoker` | `engines/web-ui/src/action-invoker/HttpActionInvoker.ts` | TS impl: fetch + EventSource; supports SSE and polling |
| `KtorActionInvoker` | `engines/kmp-engine/.../KtorActionInvoker.kt` | KMP impl: ktor HTTP; polling only (ignores `mode` setting) |
| Engine branch | `engines/web/src/engine.ts:activateStepAfterResources`, `engines/kmp-engine/.../WorkflowEngine.kt` | New `"ACTION PROXY"` branch |
| `onExternalStateChange` | engine public API | Invoker callback that pushes state updates into the engine |
| `stopStep` | engine public API | New method paralleling pauseStep / resumeStep |
| `WorkflowStartServerPickerDialog` | `engines/web-ui/src/components/` | Modal shown when an env has 2+ REST servers |
| Settings entries | `engines/web-ui/src/components/screens/SettingsScreen.tsx` | `actionProxy.mode` toggle, `actionProxy.pollIntervalMs` numeric input |

## 6. Data flow

### 6.1 Workflow start

```
WorkflowCoordinator.start()
  ├─ scan workflow.environment_specifications referenced by ACTION PROXY steps
  ├─ for each env with 2+ REST servers:
  │    → show WorkflowStartServerPickerDialog
  │    → record choice in Map<environmentOid, ActionServerSpecification>
  ├─ for each env with 1 REST server: auto-select
  ├─ for each env with 0 REST servers: block start with error
  ├─ for each unique chosen server:
  │    → invoker.probeCapabilities(serverUri)
  │    → cache { sse_supported, actions: Map<action_oid, {visibility}> }
  └─ engine.start()  (passing invoker + serverByEnv map)
```

If the workflow has no ACTION PROXY steps, none of this runs.

### 6.2 Step activation

```
engine.activateStepAfterResources(actionProxyStep):
  resolve environment for step → chosen server uri
  resolve action_oid via env.included_actions[].local_id == step.local_id → oid
  read inputs from stepParameterSnapshots[oid].inputParameters (already populated)
  recordTrace(stepOid, "STARTING")
  step.state = "STARTING"
  invoker.invoke({
    stepOid,
    workflow_instance_id,
    serverUri,
    action_oid,
    inputs,
    ssePreferred,     // from settings
    pollIntervalMs,   // from settings
  })
```

**Step → environment resolution.** The step itself does not name an environment. Resolution rule: search every environment's `included_actions[]` for an entry with `local_id == step.local_id`. The action_local_id MUST be unique across all environments in the workflow; if two environments contain an action with the same local_id, workflow validation fails at load time with a clear error message. (The current schema permits the ambiguity; the validator change to enforce uniqueness is part of this work.)

### 6.3 Invoker → engine state callbacks

```
HttpActionInvoker on receiving a state event:
  invoker.onStateChange(stepOid, newState, outputs?)
    →
engine.onExternalStateChange(stepOid, newState, outputs?):
  recordTrace(stepOid, newState)
  step.state = newState
  if outputs: write to PropertyStore via output_parameter_specifications[].target
  if newState is terminal (COMPLETED | ABORTED | ERRORED):
    snapshot output parameters
    if ERRORED: workflowState = ERRORED
    else:       completionQueue.push(stepOid); drainCompletionQueue()
  notify subscribers
```

### 6.4 State mapping (Action Container → engine StepState)

| Action Container `data.status` | engine `StepState` | UI render |
|---|---|---|
| `STARTING` | `STARTING` | "Processing…" |
| `EXECUTING` | `EXECUTING` | "Processing…" |
| `COMPLETING` | `COMPLETING` | "Processing…" |
| `COMPLETED` | `COMPLETED` | (transition to next step) |
| `POSTED` | `POSTED` | info-card "POSTED" |
| `RECEIVED` | `RECEIVED` | info-card "RECEIVED" |
| `IN_PROGRESS` | `IN_PROGRESS` | info-card "IN PROGRESS" |
| `HELD` | `HELD` | info-card "HELD" |
| `PAUSED` | `PAUSED` | "Paused" badge |
| `ABORTED` | `ABORTED` | info-card "ABORTED", terminates step |
| `STOPPED` | `ABORTED` | defensive mapping — engine `StepState` has no `STOPPED`; if the Action Container emits it, treat as terminal ABORTED |
| `ERRORED` | `ERRORED` | error overlay, workflow ERRORED |

Two additions needed:
- Extend `ACTIVE_STEP_STATES` to include `STARTING` and `COMPLETING` so those phases render via the "Processing…" branch.
- Engine's existing state machine does not assign `STARTING` or `COMPLETING` for any other step type, so adding them is non-interfering.

### 6.5 Parameter flow

- **Inputs:** engine's existing `resolveInputParameters()` populates `stepParameterSnapshots[oid].inputParameters`. The invoker reads this snapshot and POSTs as `{ id: value }`.
- **Outputs:** when a terminal state arrives with `output_parameters`, engine writes each value to `step.output_parameter_specifications[].target`. Mirrors how SCRIPT writes outputs today.

### 6.6 Opaque action path

Opaque actions never emit STARTING / EXECUTING / COMPLETING. Sequence: invoke → POSTED → COMPLETED. Polling sees only two state values. PAUSE / RESUME / STOP commands to opaque actions return 409 `INVALID_STATE_TRANSITION` from the Action Container; the invoker swallows these silently.

## 7. Server selection

### 7.1 Data source

Each environment in the workflow's `environment_specifications` carries an `action_server_specifications` array:

```json
"action_server_specifications": [
  {
    "name": "Production",
    "uri": "http://localhost:3002/trajectory/v1/",
    "description": "Local Action Container",
    "connection_type": "REST"
  }
]
```

The `uri` is trimmed of leading/trailing whitespace at the boundary (defensive — your test file has a leading space).

### 7.2 Selection rules

| `action_server_specifications` (REST only) | Behavior |
|---|---|
| 0 entries | Block workflow start with inline error: *"Environment '{local_id}' has no REST action servers registered."* |
| 1 entry | Auto-select, no dialog |
| 2+ entries | Show `WorkflowStartServerPickerDialog` — user picks one per environment |

The Coordinator stores `Map<environmentOid, ActionServerSpecification>` for the workflow's lifetime. RESTART of a workflow re-triggers selection.

## 8. Capabilities probe

After server selection and before `engine.start()`, the Coordinator calls `invoker.probeCapabilities(uri)` for each unique chosen server:

```
GET {serverUri}/capabilities → ServerCapabilities {
  sse_supported: boolean,
  actions: Map<action_oid, { visibility: 'observable' | 'opaque' }>
}
```

Cached on the invoker for the session. **Never re-tried**. On failure (network or non-2xx): warn, set `sse_supported = false`, leave `actions` empty. Workflow continues; everything just polls.

## 9. SSE vs polling

### 9.1 Settings (web-ui)

```
Action Servers
  Connection mode
    ○ Use SSE when available  (default)
    ● Always poll

  Poll interval (seconds)
    [  4 ]
    Used for opaque actions or when SSE is unavailable.
    Min 1, max 300.
```

Persisted in localStorage as `actionProxy.mode` (`'sse-preferred' | 'poll-only'`) and `actionProxy.pollIntervalMs` (number). Read once per workflow at start — mid-workflow changes don't affect running workflows.

### 9.2 Decision table

| Setting mode | `sse_supported` | Action `visibility` | Per-invoke `sse_endpoint` | Strategy |
|---|---|---|---|---|
| `sse-preferred` | true | observable | present | **SSE** |
| `sse-preferred` | true | opaque | absent | poll |
| `sse-preferred` | false | * | * | poll |
| `sse-preferred` | * | * | * (SSE connect fails) | poll (auto-fallback) |
| `poll-only` | * | * | * | poll |
| (KMP engine, any setting) | * | * | * | poll |

### 9.3 SSE specifics

- Open `GET {sse_endpoint}` with `Last-Event-ID` header on reconnect.
- Each event is one of the spec's `state_change`, `output`, `progress`, `error` events.
- Close cleanly on terminal state.
- On unexpected drop: reconnect with `Last-Event-ID`. After 3 consecutive reconnect failures within a 10s window, fall back to polling for the rest of this invocation.

### 9.4 Polling specifics

- `GET {serverUri}/instances/{instance_id}` every `pollIntervalMs`.
- Detect state changes by diffing against last-known status. Don't push duplicate events.
- 404 `INSTANCE_NOT_FOUND` is treated as a terminal ABORTED (server cleaned up the instance).

## 10. Command forwarding

| Runtime UI command | Engine method | Sent to Action Container |
|---|---|---|
| **PAUSE** | `pauseStep(oid)` | `POST /command {command:"PAUSE"}` |
| **RESUME** | `resumeStep(oid)` | `POST /command {command:"RESUME"}` |
| **STOP** *(new)* | `stopStep(oid)` | `POST /command {command:"STOP"}` |
| **ABANDON** (workflow-level) | `abortStep(oid)` for each active ACTION PROXY | `DELETE /instances/{id}` |
| RESTART (workflow-level) | re-activate target step | If a prior invocation exists: `DELETE` it first, then re-invoke on activation |

- 409 `INVALID_STATE_TRANSITION` is logged but never surfaced (opaque actions reject PAUSE/RESUME/STOP).
- The engine's local state for `PAUSED` only transitions when the Action Container confirms back via `onExternalStateChange`. This keeps engine state truthful to server state. For opaque actions where the command is rejected, the step stays in its prior state — correct behavior.
- STOP only appears in `StateCommandMenu.tsx` when the focused step is an ACTION PROXY in a non-terminal state.

## 11. Retry & error handling

Per design intent: **retry forever** on network and 5xx failures. Surface status in the UI.

| Failure during | Behavior |
|---|---|
| Initial `POST /invoke` | Exponential backoff (1s, 2s, 4s, 8s, 16s, capped at 30s). Step stays `STARTING`. UI shows "Reconnecting…" pill. |
| `GET /instances/{id}` poll tick | Skip tick, retry next interval. No state change. After 3 consecutive failures, UI shows "Reconnecting…". |
| SSE stream drop | Reconnect with `Last-Event-ID`. Backoff between reconnects. After 3 fails in 10s, fall back to polling for the rest of this invocation. |
| `DELETE` / `POST /command` | Backoff up to ~30s total. If still failing, log and give up — these are best-effort and the local engine state has already advanced. |
| Any 4xx response | **Never retried**, logged. See per-code handling below. |

| 4xx code | Handling |
|---|---|
| 400 `INVALID_REQUEST` | Step → ERRORED, workflow → ERRORED |
| 404 `ACTION_NOT_FOUND` | Step → ERRORED, workflow → ERRORED, log the action_oid |
| 404 `INSTANCE_NOT_FOUND` mid-poll | Treat as terminal ABORTED |
| 409 `INVALID_STATE_TRANSITION` | Silent-ignore (command was rejected) |
| 422 `PARAMETER_VALIDATION_FAILED` | Step → ERRORED, workflow → ERRORED, log the validation details |

### Connectivity status in UI

Each active ACTION PROXY step exposes `connectivityStatus: 'ok' | 'reconnecting' | 'never_connected'` in the coordinator snapshot. `ActiveStepCard` renders an amber pill when not `ok`.

## 12. Step lifecycle

```
IDLE
 │ activateStepAfterResources sees ACTION PROXY
 ▼
STARTING ─────► (POST /invoke; retries forever on net errors)
 │ invoke 201
 ▼
POSTED  (opaque actions stay here briefly)
 │
 ▼
EXECUTING ◄─────► PAUSED / HELD  (server-driven via PAUSE/RESUME/HOLD)
 │
 ▼
COMPLETING
 │
 ▼
COMPLETED ─► engine.completionQueue.push() ─► drainCompletionQueue()

Any state ─► ERRORED  (4xx server response, ERRORED status, validation failures)
Any state ─► ABORTED  (DELETE called, server-confirmed ABORT, or INSTANCE_NOT_FOUND mid-poll)
```

Workflow ABANDON path:
1. `workflowState = ABORTED`
2. For every active ACTION PROXY step: `invoker.abort(instanceId)` (fire-and-forget)
3. Engine stops accepting `onExternalStateChange` callbacks for those steps

Late callbacks for already-terminated steps are silently dropped.

## 13. Schema and validator changes

### 13.1 JSON schemas

Remove `"WAIT ACTION PROXY"` and `"NOWAIT ACTION PROXY"` from the StepType enum in:

| File | Lines |
|---|---|
| `TrajectoryRuntime/spec/workflow-schema.json` | enum at `~22-25` |
| `TrajectoryRuntime/schemas/master-workflow-step-library.json` | the corresponding enum |
| `TrajectoryRuntime/schemas/master-workflow-library.json` | the corresponding enum |

Add `action_server_specifications` to the `MasterEnvironmentSpecification` definition as an optional array of `{ name, uri, description?, connection_type }` (verify whether already present; data shows it but schema may not).

### 13.2 Code-based validators

| File | Change |
|---|---|
| `engines/kmp-engine/.../Validator.kt:177-182` | Replace `"WAIT ACTION PROXY"` with `"ACTION PROXY"` in `VALID_STEP_TYPES` |
| `engines/ios/.../Validator.swift:8-13` | Remove `"WAIT ACTION PROXY"` and `"NOWAIT ACTION PROXY"`; keep `"ACTION PROXY"` |
| `engines/web/src/validator.ts` | No change — Ajv-driven from JSON schema |
| `engines/web-ui/src/manager/validation.ts` | No change — Ajv-driven |

### 13.3 Type additions

`engines/web/src/types.ts` and `engines/kmp-engine/.../Types.kt`:

```ts
interface ActionServerSpecification {
  name: string;
  uri: string;
  description?: string;
  connection_type: string; // "REST" for now
}

interface MasterEnvironmentSpecification {
  // ... existing fields
  action_server_specifications?: ActionServerSpecification[];
}

// Extend ACTIVE_STEP_STATES
export const ACTIVE_STEP_STATES: ReadonlySet<StepState> = new Set([
  'EXECUTING', 'WAITING', 'PAUSED',
  'STARTING', 'COMPLETING',            // ← added
  'HELD', 'POSTED', 'RECEIVED', 'IN_PROGRESS', 'ABORTED',
]);
```

The `StepState` union already includes everything we need — no enum changes.

## 14. Backward compatibility

- Existing workflow files using `WAIT ACTION PROXY` or `NOWAIT ACTION PROXY` will fail validation with `INVALID_STEP_TYPE` per user direction (no migration shim).
- No existing conformance fixtures reference those step types (verified by grep).
- The test workflow `ExportImportWorkflowTest.WFmasterX` uses `ACTION PROXY` already — nothing breaks.

## 15. Testing strategy

### 15.1 Engine unit tests

`engines/web/src/engine-action-proxy.test.ts` (new), using a `MockActionInvoker`:

- Happy path: STARTING → EXECUTING → COMPLETED, outputs written to PropertyStore via `output_parameter_specifications[].target`.
- Opaque path: STARTING → POSTED → COMPLETED.
- Forwarding: `engine.pauseStep` → `invoker.sendCommand("PAUSE")`; same for RESUME, STOP.
- Workflow ABANDON: `invoker.abort` called for each in-flight ACTION PROXY step.
- 4xx error mid-poll: step → ERRORED, workflow → ERRORED.
- RESTART: aborts current invocation, re-invokes on re-activation.

### 15.2 HttpActionInvoker unit tests

`engines/web-ui/src/action-invoker/HttpActionInvoker.test.ts` (new), mocking `fetch` + `EventSource`:

- Capabilities probe parses `sse_supported` and per-action visibility.
- `sse-preferred` + observable + `sse_supported` + `sse_endpoint` → EventSource opened; events fire callbacks.
- `sse-preferred` + opaque → polling started.
- `poll-only` → polling regardless of capabilities.
- SSE drop → reconnect with `Last-Event-ID`; after 3 fails in 10s, transparent fallback to polling.
- Retry-forever with exponential backoff on network errors.
- 422 on invoke → callback fires with ERRORED, no retry.
- Whitespace trimmed from `uri` at boundary.

### 15.3 Integration smoke test

`engines/web-ui/test-action-proxy-integration.mjs` (new, manual):

- Boots a Node fixture posing as an Action Container against the `ExportImportLibrary` action.
- Loads `ExportImportWorkflowTest.WFmasterX`.
- Drives one full workflow execution end-to-end.
- Asserts final property `SomeResult` matches expected.
- Run manually (not in CI) since it needs a real Action Container.

## 16. Open items (none blocking)

- Authentication: deferred until the v1.0 Action Container spec gains auth.
- Multiple connection types beyond REST: schema supports it (`connection_type` field) but only REST is implemented.
- Cross-workflow Action Container sharing: invoker is per-workflow; no shared connection pool across concurrent workflows. Future optimization.

---

## Appendix A — File touch list (rough)

**New files:**
- `engines/web/src/action-invoker.ts` (interface + types)
- `engines/web-ui/src/action-invoker/HttpActionInvoker.ts`
- `engines/web-ui/src/action-invoker/HttpActionInvoker.test.ts`
- `engines/web/src/engine-action-proxy.test.ts`
- `engines/web-ui/src/components/WorkflowStartServerPickerDialog.tsx`
- `engines/web-ui/test-action-proxy-integration.mjs`
- `engines/kmp-engine/src/commonMain/kotlin/.../ActionInvoker.kt`
- `engines/kmp-engine/src/commonMain/kotlin/.../KtorActionInvoker.kt`

**Modified files:**
- `engines/web/src/engine.ts` — ACTION PROXY branch, `onExternalStateChange`, `stopStep`, abort plumbing
- `engines/web/src/types.ts` — `ActionServerSpecification`, extend `ACTIVE_STEP_STATES`
- `engines/kmp-engine/.../WorkflowEngine.kt` — parallel changes
- `engines/kmp-engine/.../Types.kt` — parallel changes
- `engines/kmp-engine/.../Validator.kt` — remove WAIT/NOWAIT, add ACTION PROXY
- `engines/ios/.../Validator.swift` — remove WAIT/NOWAIT
- `engines/web-ui/src/coordinator/WorkflowCoordinator.ts` — server selection, capabilities probe, invoker lifecycle
- `engines/web-ui/src/components/screens/SettingsScreen.tsx` — settings UI
- `engines/web-ui/src/components/StateCommandMenu.tsx` — STOP button
- `engines/web-ui/src/components/ActiveStepCard.tsx` — connectivity status pill
- `spec/workflow-schema.json` — drop WAIT/NOWAIT, add `action_server_specifications` definition
- `schemas/master-workflow-step-library.json` — drop WAIT/NOWAIT
- `schemas/master-workflow-library.json` — drop WAIT/NOWAIT
