# ACTION PROXY REST Invoker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `ACTION PROXY` step execution by invoking actions on a REST Action Container, mirroring its state into the engine, supporting SSE/polling transports, forwarding state commands, and dropping `WAIT/NOWAIT ACTION PROXY` from schemas and validators.

**Architecture:** Engine owns step lifecycle and calls a platform-abstracted `ActionInvoker` interface; `HttpActionInvoker` (TS, fetch+EventSource) supports SSE and polling, `KtorActionInvoker` (KMP, polling only). Server selection happens at workflow start via a picker dialog reading `action_server_specifications` from each environment.

**Tech Stack:** TypeScript (engines/web), Kotlin Multiplatform (engines/kmp-engine), Swift (engines/ios validator only), React 19 + Vite (engines/web-ui), JSON Schema + Ajv (validation), `node:test` (engine tests), Vitest (KMP test fixtures).

**Spec:** [`docs/superpowers/specs/2026-05-23-action-proxy-rest-invoker-design.md`](../specs/2026-05-23-action-proxy-rest-invoker-design.md)

---

## Layout

All new TS code (interface + concrete invoker) lives in `engines/web/src/` so it shares the existing `node:test` runner with the engine. The web-ui imports it through the `@engine` alias. KMP code lives in `engines/kmp-engine/src/commonMain/kotlin/com/trajectoryruntime/engine/`.

### New files (TS)
- `engines/web/src/action-invoker.ts` — interface + types + state mapping
- `engines/web/src/action-invoker.test.ts` — interface + state mapping tests
- `engines/web/src/mock-action-invoker.ts` — test double used by engine tests
- `engines/web/src/http-action-invoker.ts` — concrete HTTP implementation
- `engines/web/src/http-action-invoker.test.ts` — fetch/EventSource mock tests
- `engines/web/src/engine-action-proxy.test.ts` — engine integration tests with MockActionInvoker
- `engines/web-ui/src/components/WorkflowStartServerPickerDialog.tsx` — server-picker modal
- `engines/web-ui/test-action-proxy-integration.mjs` — manual end-to-end smoke test

### New files (KMP)
- `engines/kmp-engine/src/commonMain/kotlin/com/trajectoryruntime/engine/ActionInvoker.kt`
- `engines/kmp-engine/src/commonMain/kotlin/com/trajectoryruntime/engine/KtorActionInvoker.kt`

### Modified files
- `engines/web/src/types.ts` — `ActionServerSpecification`, extend `ACTIVE_STEP_STATES`, add `action_server_specifications` to `MasterEnvironmentSpecification`
- `engines/web/src/engine.ts` — ACTION PROXY branch, `onExternalStateChange`, `stopStep`, abort plumbing, env-resolution helper
- `engines/web/src/validator.ts` — no code change (Ajv-driven), but spec_test updates
- `engines/kmp-engine/src/commonMain/kotlin/.../Types.kt` — parallel TS changes
- `engines/kmp-engine/src/commonMain/kotlin/.../WorkflowEngine.kt` — parallel TS changes
- `engines/kmp-engine/src/commonMain/kotlin/.../Validator.kt` — replace `WAIT ACTION PROXY` with `ACTION PROXY`
- `engines/ios/Sources/TrajectoryRuntimeEngine/Validator.swift` — drop WAIT/NOWAIT
- `engines/web-ui/src/coordinator/WorkflowCoordinator.ts` — server selection, capabilities probe, invoker lifecycle, `stopStep`
- `engines/web-ui/src/components/screens/SettingsScreen.tsx` — connection mode + poll interval
- `engines/web-ui/src/components/StateCommandMenu.tsx` — STOP button
- `engines/web-ui/src/components/ActiveStepCard.tsx` — connectivity pill
- `engines/web-ui/src/manager/WorkflowManager.ts` — store per-workflow server selections
- `spec/workflow-schema.json` — drop WAIT/NOWAIT, add `action_server_specifications` + `ActionServerSpecification` definition
- `schemas/master-workflow-step-library.json` — drop WAIT/NOWAIT
- `schemas/master-workflow-library.json` — drop WAIT/NOWAIT

---

## Pre-flight

- [ ] **Pre-1: Install dependencies if not already**

Run from `C:\Trajectory\Trajectory\TrajectoryRuntime`:

```bash
cd engines/web && npm install
cd ../web-ui && npm install
```

Expected: both `node_modules/` populated. Skip per-directory if already installed.

- [ ] **Pre-2: Verify the test runner works on current code**

Run from `engines/web`:

```bash
npm run build && npm test 2>&1 | tail -20
```

Expected: `tests N`, `pass N`, `fail 0` (existing tests pass).

- [ ] **Pre-3: Verify the dev server boots**

In separate terminal from `engines/web-ui`:

```bash
npm run dev
```

Expected: `Local: http://localhost:5173/`. Leave running for manual verification later.

---

# Phase 1 — Schema and validator cleanup

Drop `WAIT ACTION PROXY` and `NOWAIT ACTION PROXY` from JSON schemas and code-based validators. Add `action_server_specifications` to the schema. This phase produces a working build with the right step-type enum; nothing executes yet.

### Task 1: Remove WAIT/NOWAIT from `spec/workflow-schema.json`

**Files:**
- Modify: `spec/workflow-schema.json` — StepType enum

- [ ] **Step 1: Read current enum**

```bash
grep -n -A 5 '"\$defs"' spec/workflow-schema.json | head -15
```

Locate the `StepType` definition; it lives near the top of the file. The current enum lines (approximately 20-25):

```json
"StepType": {
  "type": "string",
  "enum": [
    "START", "END", "ACTION PROXY", "WAIT ACTION PROXY",
    "NOWAIT ACTION PROXY", "WORKFLOW PROXY", "SELECT 1",
    "WAIT ANY", "PARALLEL", "WAIT ALL", "MATH", "SCRIPT",
    "YES_NO", "USER_INTERACTION"
  ]
}
```

- [ ] **Step 2: Edit enum to remove WAIT/NOWAIT**

Use Edit to change those lines to:

```json
"StepType": {
  "type": "string",
  "enum": [
    "START", "END", "ACTION PROXY", "WORKFLOW PROXY", "SELECT 1",
    "WAIT ANY", "PARALLEL", "WAIT ALL", "MATH", "SCRIPT",
    "YES_NO", "USER_INTERACTION"
  ]
}
```

- [ ] **Step 3: Validate the JSON parses**

```bash
node -e "JSON.parse(require('fs').readFileSync('spec/workflow-schema.json','utf-8')); console.log('ok')"
```

Expected: `ok`.

- [ ] **Step 4: Commit**

```bash
git add spec/workflow-schema.json
git commit -m "schema: remove WAIT ACTION PROXY and NOWAIT ACTION PROXY from StepType enum"
```

### Task 2: Add `ActionServerSpecification` to schema

**Files:**
- Modify: `spec/workflow-schema.json` — add definition + reference

- [ ] **Step 1: Add the definition**

Locate the `$defs` section. Add a new entry alongside `StepType`:

```json
"ActionServerSpecification": {
  "type": "object",
  "required": ["name", "uri", "connection_type"],
  "properties": {
    "name": { "type": "string" },
    "uri": { "type": "string" },
    "description": { "type": "string" },
    "connection_type": { "type": "string", "enum": ["REST"] }
  }
}
```

- [ ] **Step 2: Reference it from `MasterEnvironmentSpecification`**

Find the `MasterEnvironmentSpecification` object definition. In its `properties` block (next to `included_actions`, `value_property_specifications`, etc.), add:

```json
"action_server_specifications": {
  "type": "array",
  "items": { "$ref": "#/$defs/ActionServerSpecification" }
}
```

Do **not** add it to `required` — it stays optional.

- [ ] **Step 3: Validate JSON parses**

```bash
node -e "JSON.parse(require('fs').readFileSync('spec/workflow-schema.json','utf-8')); console.log('ok')"
```

Expected: `ok`.

- [ ] **Step 4: Validate the test workflow against updated schema**

```bash
node -e "
const Ajv = require('engines/web/node_modules/ajv').default;
const schema = JSON.parse(require('fs').readFileSync('spec/workflow-schema.json','utf-8'));
const env = JSON.parse(require('fs').readFileSync('C:/Users/dnbra/AppData/Local/Temp/wfmasterx_extract/environments/ExportImportEnvLibrary.WFenvir','utf-8'));
console.log('env action_server_specs:', env.environment_specifications[0].action_server_specifications);
console.log('schema parsed OK');
"
```

Expected: prints the action_server_specifications array from the test env file, confirming structure matches.

- [ ] **Step 5: Commit**

```bash
git add spec/workflow-schema.json
git commit -m "schema: add ActionServerSpecification to environment spec"
```

### Task 3: Mirror changes in `schemas/master-workflow-*.json`

**Files:**
- Modify: `schemas/master-workflow-step-library.json:23` — drop WAIT/NOWAIT
- Modify: `schemas/master-workflow-library.json:44` — drop WAIT/NOWAIT

- [ ] **Step 1: Read both files to find the enums**

```bash
grep -n -A 6 '"ACTION PROXY"' schemas/master-workflow-step-library.json schemas/master-workflow-library.json
```

- [ ] **Step 2: Edit each file**

In each, remove the two enum entries `"WAIT ACTION PROXY"` and `"NOWAIT ACTION PROXY"` from the StepType enum. Keep `"ACTION PROXY"`.

- [ ] **Step 3: Validate both files parse**

```bash
node -e "
JSON.parse(require('fs').readFileSync('schemas/master-workflow-step-library.json','utf-8'));
JSON.parse(require('fs').readFileSync('schemas/master-workflow-library.json','utf-8'));
console.log('ok');
"
```

Expected: `ok`.

- [ ] **Step 4: Commit**

```bash
git add schemas/master-workflow-step-library.json schemas/master-workflow-library.json
git commit -m "schema: remove WAIT/NOWAIT ACTION PROXY from library schemas"
```

### Task 4: Update KMP validator (`Validator.kt`)

**Files:**
- Modify: `engines/kmp-engine/src/commonMain/kotlin/com/trajectoryruntime/engine/Validator.kt:177-182`

- [ ] **Step 1: Read current `VALID_STEP_TYPES`**

```bash
sed -n '177,185p' engines/kmp-engine/src/commonMain/kotlin/com/trajectoryruntime/engine/Validator.kt
```

Current (note: `ACTION PROXY` is missing, `WAIT ACTION PROXY` is present — both wrong post-design):

```kotlin
private val VALID_STEP_TYPES = setOf(
    "START", "END", "PARALLEL", "WAIT ALL", "WAIT ANY",
    "SELECT 1", "SELECT_1", "SCRIPT", "MATH",
    "USER_INTERACTION", "YES_NO", "WORKFLOW PROXY",
    "WAIT ACTION PROXY",
)
```

- [ ] **Step 2: Replace with corrected set**

Replace `"WAIT ACTION PROXY",` with `"ACTION PROXY",`:

```kotlin
private val VALID_STEP_TYPES = setOf(
    "START", "END", "PARALLEL", "WAIT ALL", "WAIT ANY",
    "SELECT 1", "SELECT_1", "SCRIPT", "MATH",
    "USER_INTERACTION", "YES_NO", "WORKFLOW PROXY",
    "ACTION PROXY",
)
```

- [ ] **Step 3: Commit**

```bash
git add engines/kmp-engine/src/commonMain/kotlin/com/trajectoryruntime/engine/Validator.kt
git commit -m "kmp: replace WAIT ACTION PROXY with ACTION PROXY in valid step types"
```

### Task 5: Update iOS Swift validator

**Files:**
- Modify: `engines/ios/Sources/TrajectoryRuntimeEngine/Validator.swift:8-13`

- [ ] **Step 1: Read current `validStepTypes`**

```bash
sed -n '8,14p' engines/ios/Sources/TrajectoryRuntimeEngine/Validator.swift
```

Current:

```swift
private let validStepTypes: Set<String> = [
    "START", "END", "ACTION PROXY", "WAIT ACTION PROXY",
    "NOWAIT ACTION PROXY", "WORKFLOW PROXY", "SELECT 1", "SELECT_1",
    "WAIT ANY", "PARALLEL", "WAIT ALL", "MATH", "SCRIPT",
    "YES_NO", "USER_INTERACTION"
]
```

- [ ] **Step 2: Drop WAIT/NOWAIT entries**

Replace with:

```swift
private let validStepTypes: Set<String> = [
    "START", "END", "ACTION PROXY", "WORKFLOW PROXY", "SELECT 1", "SELECT_1",
    "WAIT ANY", "PARALLEL", "WAIT ALL", "MATH", "SCRIPT",
    "YES_NO", "USER_INTERACTION"
]
```

- [ ] **Step 3: Commit**

```bash
git add engines/ios/Sources/TrajectoryRuntimeEngine/Validator.swift
git commit -m "ios: remove WAIT/NOWAIT ACTION PROXY from valid step types"
```

### Task 6: Phase-1 verification

- [ ] **Step 1: TS engine still builds and existing tests pass**

```bash
cd engines/web && npm run build && npm test 2>&1 | tail -5
```

Expected: all existing tests pass, no compilation errors.

- [ ] **Step 2: Re-validate the user's test workflow loads**

```bash
cd engines/web && node -e "
const Ajv = require('ajv').default;
const schema = JSON.parse(require('fs').readFileSync('../../spec/workflow-schema.json','utf-8'));
const wf = JSON.parse(require('fs').readFileSync('C:/Users/dnbra/AppData/Local/Temp/wfmasterx_extract/ExportImportWorkflowTest.WFmaster','utf-8'));
const ajv = new Ajv({strict:false});
const valid = ajv.validate(schema, wf);
console.log('valid:', valid, 'errors:', ajv.errors);
"
```

Expected: `valid: true errors: null` (the workflow uses `ACTION PROXY` only).

---

# Phase 2 — Types and ActionInvoker interface

Add `ActionServerSpecification`, extend `ACTIVE_STEP_STATES`, and define the `ActionInvoker` interface. No behavior yet — pure compile-time scaffolding.

### Task 7: Add `ActionServerSpecification` and extend env type (TS)

**Files:**
- Modify: `engines/web/src/types.ts:230-241` (MasterEnvironmentSpecification block) and `types.ts:378-381` (ACTIVE_STEP_STATES)

- [ ] **Step 1: Add the type near other spec types**

Add this block above `MasterEnvironmentSpecification`:

```ts
export interface ActionServerSpecification {
  name: string;
  uri: string;
  description?: string;
  connection_type: string; // "REST" for now
}
```

- [ ] **Step 2: Extend MasterEnvironmentSpecification**

Find `MasterEnvironmentSpecification` and add the new optional field next to `resource_property_specifications`:

```ts
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
  action_server_specifications?: ActionServerSpecification[];   // ← added
}
```

(Use the actual existing field set; this is illustrative.)

- [ ] **Step 3: Extend ACTIVE_STEP_STATES**

Find:

```ts
export const ACTIVE_STEP_STATES: ReadonlySet<StepState> = new Set<StepState>([
  'EXECUTING', 'WAITING', 'PAUSED',
  'HELD', 'POSTED', 'RECEIVED', 'IN_PROGRESS', 'ABORTED',
]);
```

Replace with:

```ts
export const ACTIVE_STEP_STATES: ReadonlySet<StepState> = new Set<StepState>([
  'EXECUTING', 'WAITING', 'PAUSED',
  'STARTING', 'COMPLETING',
  'HELD', 'POSTED', 'RECEIVED', 'IN_PROGRESS', 'ABORTED',
]);
```

- [ ] **Step 4: Build to verify**

```bash
cd engines/web && npm run build 2>&1 | tail -5
```

Expected: no errors. (`STARTING` and `COMPLETING` already exist in the `StepState` union.)

- [ ] **Step 5: Commit**

```bash
git add engines/web/src/types.ts
git commit -m "types(web): add ActionServerSpecification; extend ACTIVE_STEP_STATES with STARTING/COMPLETING"
```

### Task 8: Define `ActionInvoker` interface (TS)

**Files:**
- Create: `engines/web/src/action-invoker.ts`

- [ ] **Step 1: Create the interface file**

```ts
// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import type { StepState } from './types.js';

export type ActionServerCommand = 'PAUSE' | 'RESUME' | 'HOLD' | 'UNHOLD' | 'STOP' | 'ABORT' | 'CLEAR';
export type ConnectionMode = 'sse-preferred' | 'poll-only';

export interface ServerCapabilities {
  sse_supported: boolean;
  actions: Map<string, { visibility: 'observable' | 'opaque' }>;
}

export interface InvokeRequest {
  stepOid: string;
  workflow_instance_id: string;
  serverUri: string;
  action_oid: string;
  inputs: Record<string, string>;
  mode: ConnectionMode;
  pollIntervalMs: number;
}

export interface ActionInvokerCallbacks {
  /** Called whenever the Action Container reports a state change. */
  onStateChange: (stepOid: string, newState: StepState, outputs?: Record<string, string>) => void;
  /** Called when connectivity status changes (network up/down). */
  onConnectivityChange: (stepOid: string, status: 'ok' | 'reconnecting' | 'never_connected') => void;
}

export interface ActionInvoker {
  /** GET /capabilities. Called once per server at workflow start. */
  probeCapabilities(serverUri: string): Promise<ServerCapabilities>;

  /** Start a new action invocation. Resolves to the runtime_action_instance_id from the 201 response. */
  invoke(req: InvokeRequest, callbacks: ActionInvokerCallbacks): Promise<string>;

  /** POST /command. Best-effort, retries on net errors, ignores 409. */
  sendCommand(serverUri: string, instanceId: string, command: ActionServerCommand): Promise<void>;

  /** DELETE /instances/{id}. Best-effort. */
  abort(serverUri: string, instanceId: string): Promise<void>;

  /** Stop polling/SSE for a step. Used when the engine is shutting down a step locally. */
  release(stepOid: string): void;
}
```

- [ ] **Step 2: Build**

```bash
cd engines/web && npm run build 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add engines/web/src/action-invoker.ts
git commit -m "engine: define ActionInvoker interface for ACTION PROXY execution"
```

### Task 9: Create `MockActionInvoker` test helper

**Files:**
- Create: `engines/web/src/mock-action-invoker.ts`

- [ ] **Step 1: Write the mock**

```ts
// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import type {
  ActionInvoker,
  ActionInvokerCallbacks,
  ActionServerCommand,
  InvokeRequest,
  ServerCapabilities,
} from './action-invoker.js';
import type { StepState } from './types.js';

interface RecordedInvoke {
  req: InvokeRequest;
  callbacks: ActionInvokerCallbacks;
  instanceId: string;
  released: boolean;
}

/**
 * Manually-driven mock invoker used by engine tests.
 * Tests call .emitStateChange(stepOid, state, outputs?) to drive lifecycle.
 */
export class MockActionInvoker implements ActionInvoker {
  capabilities: Map<string, ServerCapabilities> = new Map();
  invocations: RecordedInvoke[] = [];
  commandsSent: { serverUri: string; instanceId: string; command: ActionServerCommand }[] = [];
  aborts: { serverUri: string; instanceId: string }[] = [];
  releases: string[] = [];
  private nextInstanceCounter = 1;

  setCapabilities(uri: string, caps: ServerCapabilities): void {
    this.capabilities.set(uri, caps);
  }

  async probeCapabilities(serverUri: string): Promise<ServerCapabilities> {
    return this.capabilities.get(serverUri) ?? { sse_supported: false, actions: new Map() };
  }

  async invoke(req: InvokeRequest, callbacks: ActionInvokerCallbacks): Promise<string> {
    const instanceId = `mock-instance-${this.nextInstanceCounter++}`;
    this.invocations.push({ req, callbacks, instanceId, released: false });
    return instanceId;
  }

  async sendCommand(serverUri: string, instanceId: string, command: ActionServerCommand): Promise<void> {
    this.commandsSent.push({ serverUri, instanceId, command });
  }

  async abort(serverUri: string, instanceId: string): Promise<void> {
    this.aborts.push({ serverUri, instanceId });
  }

  release(stepOid: string): void {
    this.releases.push(stepOid);
    for (const inv of this.invocations) {
      if (inv.req.stepOid === stepOid) inv.released = true;
    }
  }

  // ── Test helpers ──

  /** Drive a state change to the engine for a given step. */
  emitStateChange(stepOid: string, state: StepState, outputs?: Record<string, string>): void {
    const inv = this.invocations.find(i => i.req.stepOid === stepOid && !i.released);
    if (!inv) throw new Error(`No active invocation for stepOid=${stepOid}`);
    inv.callbacks.onStateChange(stepOid, state, outputs);
  }

  emitConnectivity(stepOid: string, status: 'ok' | 'reconnecting' | 'never_connected'): void {
    const inv = this.invocations.find(i => i.req.stepOid === stepOid && !i.released);
    if (!inv) throw new Error(`No active invocation for stepOid=${stepOid}`);
    inv.callbacks.onConnectivityChange(stepOid, status);
  }

  /** Most-recent invocation for assertions. */
  lastInvocation(): RecordedInvoke {
    if (this.invocations.length === 0) throw new Error('No invocations recorded');
    return this.invocations[this.invocations.length - 1];
  }
}
```

- [ ] **Step 2: Build**

```bash
cd engines/web && npm run build 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add engines/web/src/mock-action-invoker.ts
git commit -m "engine: add MockActionInvoker test helper"
```

### Task 10: KMP — mirror types

**Files:**
- Modify: `engines/kmp-engine/src/commonMain/kotlin/com/trajectoryruntime/engine/Types.kt`

- [ ] **Step 1: Add ActionServerSpecification class**

Add near other `@Serializable data class` definitions:

```kotlin
@Serializable
data class ActionServerSpecification(
    val name: String,
    val uri: String,
    val description: String? = null,
    val connection_type: String,
)
```

- [ ] **Step 2: Extend MasterEnvironmentSpecification**

Locate `MasterEnvironmentSpecification` and add the field:

```kotlin
@Serializable
data class MasterEnvironmentSpecification(
    val local_id: String,
    val oid: String,
    val description: String? = null,
    val version: String,
    val last_modified_date: String,
    val library_name: String? = null,
    val included_actions: List<JsonElement>? = null,
    val value_property_specifications: List<PropertySpecification>? = null,
    val action_property_specifications: List<PropertySpecification>? = null,
    val resource_property_specifications: List<ResourcePropertySpecification>? = null,
    val action_server_specifications: List<ActionServerSpecification>? = null,
)
```

- [ ] **Step 3: Extend ACTIVE_STEP_STATES**

Find `val ACTIVE_STEP_STATES` near the bottom of Types.kt. Currently:

```kotlin
val ACTIVE_STEP_STATES = setOf(StepState.EXECUTING, StepState.WAITING, StepState.PAUSED)
```

Replace with:

```kotlin
val ACTIVE_STEP_STATES = setOf(
    StepState.EXECUTING, StepState.WAITING, StepState.PAUSED,
    StepState.STARTING, StepState.COMPLETING,
)
```

(Note: KMP `StepState` enum lacks `HELD`, `POSTED`, `RECEIVED`, `IN_PROGRESS`, `ABORTED` — those exist only in the TS union. KMP polling-only path uses `STARTING/EXECUTING/COMPLETING/COMPLETED/ABORTED` from the Action Container directly. **If the KMP enum is missing any of these states required to mirror the Action Container, extend the enum here.** Check Types.kt line 245 — currently `IDLE, WAITING, STARTING, EXECUTING, COMPLETING, COMPLETED, ERRORED, PAUSED`. Add the rest:)

```kotlin
enum class StepState {
    IDLE, WAITING, STARTING, EXECUTING, COMPLETING, COMPLETED, ERRORED, PAUSED,
    HELD, POSTED, RECEIVED, IN_PROGRESS, ABORTED,
}
```

- [ ] **Step 4: Build KMP common module**

```bash
cd engines/kmp-engine && ./gradlew :compileKotlinJs 2>&1 | tail -10
```

(Or `gradlew.bat` on Windows.) Expected: BUILD SUCCESSFUL.

- [ ] **Step 5: Commit**

```bash
git add engines/kmp-engine/src/commonMain/kotlin/com/trajectoryruntime/engine/Types.kt
git commit -m "kmp(types): add ActionServerSpecification; extend StepState and ACTIVE_STEP_STATES"
```

---

# Phase 3 — TS engine ACTION PROXY branch (TDD with MockActionInvoker)

Each task here is test-first. Write the test, run to see it fail, implement, run to see it pass, commit.

### Task 11: Engine accepts an injected `ActionInvoker`

**Files:**
- Modify: `engines/web/src/engine.ts` (constructor + class fields)
- Create: `engines/web/src/engine-action-proxy.test.ts`

- [ ] **Step 1: Write failing test**

Create `engines/web/src/engine-action-proxy.test.ts`:

```ts
// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WorkflowEngine } from './engine.js';
import { MockActionInvoker } from './mock-action-invoker.js';
import type { MasterWorkflowSpecification, ActionServerSpecification } from './types.js';

const SERVER: ActionServerSpecification = {
  name: 'Test', uri: 'http://localhost:9999/trajectory/v1/', connection_type: 'REST',
};

function makeActionProxyWorkflow(): MasterWorkflowSpecification {
  return {
    local_id: 'wf', oid: 'wf-oid', version: '1.0.0', last_modified_date: '2026-05-23',
    steps: [
      { local_id: 'start', oid: 'start', version: '1.0.0', last_modified_date: '2026-05-23', step_type: 'START' },
      { local_id: 'A1', oid: 'ap-oid', version: '1.0.0', last_modified_date: '2026-05-23', step_type: 'ACTION PROXY' },
      { local_id: 'end', oid: 'end', version: '1.0.0', last_modified_date: '2026-05-23', step_type: 'END' },
    ],
    connections: [
      { from_step_id: 'start', to_step_id: 'ap-oid' },
      { from_step_id: 'ap-oid', to_step_id: 'end' },
    ],
    environment_specifications: [{
      local_id: 'env1', oid: 'env1-oid', version: '1.0.0', last_modified_date: '2026-05-23',
      included_actions: [{ local_id: 'A1', oid: 'action-oid-1' }],
      action_server_specifications: [SERVER],
    } as any],
  };
}

describe('engine ACTION PROXY — invoker injection', () => {
  it('accepts an ActionInvoker via setActionInvoker', () => {
    const invoker = new MockActionInvoker();
    const engine = new WorkflowEngine(makeActionProxyWorkflow());
    engine.setActionInvoker(invoker, new Map([['env1-oid', SERVER]]));
    // Constructor + setter accept the args without throwing
    assert.ok(true);
  });
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
cd engines/web && npm run build 2>&1 | tail -3
```

Expected: TS error — `setActionInvoker` does not exist on `WorkflowEngine`.

- [ ] **Step 3: Add `setActionInvoker` to WorkflowEngine**

In `engines/web/src/engine.ts`, near the other class fields (around line 30-60), add:

```ts
private actionInvoker: ActionInvoker | null = null;
private serverByEnvOid: Map<string, ActionServerSpecification> = new Map();
```

Import at the top:

```ts
import type { ActionInvoker } from './action-invoker.js';
import type { ActionServerSpecification } from './types.js';
```

Add the setter method:

```ts
setActionInvoker(
  invoker: ActionInvoker,
  serverByEnvOid: Map<string, ActionServerSpecification>,
): void {
  this.actionInvoker = invoker;
  this.serverByEnvOid = serverByEnvOid;
}
```

- [ ] **Step 4: Build and run test**

```bash
cd engines/web && npm run build && node --test dist/engine-action-proxy.test.js 2>&1 | tail -5
```

Expected: `tests 1`, `pass 1`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add engines/web/src/engine.ts engines/web/src/engine-action-proxy.test.ts
git commit -m "engine: accept injected ActionInvoker and server-by-env map"
```

### Task 12: Engine activates ACTION PROXY → STARTING and calls `invoker.invoke`

**Files:**
- Modify: `engines/web/src/engine.ts` — `activateStepAfterResources`

- [ ] **Step 1: Append failing test to `engine-action-proxy.test.ts`**

Inside the same `describe(...)` block:

```ts
  it('on activation, sets state STARTING and calls invoker.invoke with action_oid + inputs', async () => {
    const invoker = new MockActionInvoker();
    const engine = new WorkflowEngine(makeActionProxyWorkflow());
    engine.setActionInvoker(invoker, new Map([['env1-oid', SERVER]]));
    engine.start();

    // Wait one microtask for the async invoke to be recorded
    await Promise.resolve();

    assert.equal(invoker.invocations.length, 1);
    const inv = invoker.lastInvocation();
    assert.equal(inv.req.serverUri, SERVER.uri);
    assert.equal(inv.req.action_oid, 'action-oid-1');
    assert.equal(inv.req.stepOid, 'ap-oid');

    const active = engine.getActiveSteps();
    const proxyStep = active.find(s => s.step.oid === 'ap-oid');
    assert.ok(proxyStep, 'ACTION PROXY step should be active');
    assert.equal(proxyStep!.step.state, 'STARTING');
  });
```

- [ ] **Step 2: Run, expect failure**

```bash
cd engines/web && npm run build && node --test dist/engine-action-proxy.test.js 2>&1 | tail -10
```

Expected: fail — step state is `IDLE`, no invocation recorded.

- [ ] **Step 3: Implement ACTION PROXY branch**

In `engine.ts`, locate `activateStepAfterResources` (around line 868). After the `WORKFLOW PROXY` branch and before `isAutoCompleting`, add:

```ts
if (target.stepType === 'ACTION PROXY') {
  this.activateActionProxy(target);
  return;
}
```

Then add the new private method:

```ts
private activateActionProxy(target: StepInstance): void {
  if (!this.actionInvoker) {
    this.recordTrace(target.oid, 'ERRORED', undefined, 'No ActionInvoker configured');
    target.state = 'ERRORED';
    this.workflowState = 'ERRORED';
    return;
  }

  // Find the environment for this step by matching action local_id
  const env = this.findEnvironmentForActionLocalId(target.step.local_id);
  if (!env) {
    this.recordTrace(target.oid, 'ERRORED', undefined,
      `No environment contains action local_id "${target.step.local_id}"`);
    target.state = 'ERRORED';
    this.workflowState = 'ERRORED';
    return;
  }

  const server = this.serverByEnvOid.get(env.oid);
  if (!server) {
    this.recordTrace(target.oid, 'ERRORED', undefined,
      `No action server selected for environment "${env.local_id}"`);
    target.state = 'ERRORED';
    this.workflowState = 'ERRORED';
    return;
  }

  // Resolve action_oid via env.included_actions[].local_id == step.local_id
  const includedActions = (env.included_actions ?? []) as Array<{ local_id: string; oid: string }>;
  const match = includedActions.find(a => a.local_id === target.step.local_id);
  if (!match) {
    this.recordTrace(target.oid, 'ERRORED', undefined,
      `Environment "${env.local_id}" does not include action "${target.step.local_id}"`);
    target.state = 'ERRORED';
    this.workflowState = 'ERRORED';
    return;
  }

  const inputs = this.stepParameterSnapshots.get(target.oid)?.inputParameters ?? {};

  this.recordTrace(target.oid, 'STARTING');
  target.state = 'STARTING';
  this.activeActionProxyServers.set(target.oid, server.uri);

  void this.actionInvoker.invoke({
    stepOid: target.oid,
    workflow_instance_id: this.instanceId,
    serverUri: server.uri.trim(),
    action_oid: match.oid,
    inputs,
    mode: this.actionInvokerMode,
    pollIntervalMs: this.actionInvokerPollMs,
  }, {
    onStateChange: (oid, state, outputs) => this.onExternalStateChange(oid, state, outputs),
    onConnectivityChange: (oid, status) => this.onConnectivityChange(oid, status),
  }).then(instanceId => {
    this.actionInstanceIdByStep.set(target.oid, instanceId);
  }).catch(err => {
    this.recordTrace(target.oid, 'ERRORED', undefined, String(err));
    const step = this.steps.get(target.oid);
    if (step) step.state = 'ERRORED';
    this.workflowState = 'ERRORED';
  });
}

private findEnvironmentForActionLocalId(localId: string):
  import('./types.js').MasterEnvironmentSpecification | undefined {
  const envs = this.workflow.environment_specifications ?? [];
  return envs.find(e =>
    ((e.included_actions ?? []) as Array<{ local_id: string }>).some(a => a.local_id === localId)
  );
}
```

Add the new fields at the top of the class:

```ts
private actionInstanceIdByStep: Map<string, string> = new Map();
private activeActionProxyServers: Map<string, string> = new Map();
private actionInvokerMode: import('./action-invoker.js').ConnectionMode = 'sse-preferred';
private actionInvokerPollMs = 4000;
```

Add a method to configure them:

```ts
setActionInvokerOptions(mode: import('./action-invoker.js').ConnectionMode, pollIntervalMs: number): void {
  this.actionInvokerMode = mode;
  this.actionInvokerPollMs = pollIntervalMs;
}
```

Add stub methods (will be implemented in later tasks):

```ts
private onExternalStateChange(stepOid: string, newState: StepState, outputs?: Record<string, string>): void {
  // Implemented in Task 13
  void stepOid; void newState; void outputs;
}

private onConnectivityChange(stepOid: string, status: 'ok' | 'reconnecting' | 'never_connected'): void {
  // Implemented in later task
  void stepOid; void status;
}
```

- [ ] **Step 4: Build and test**

```bash
cd engines/web && npm run build && node --test dist/engine-action-proxy.test.js 2>&1 | tail -10
```

Expected: `pass 2`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add engines/web/src/engine.ts engines/web/src/engine-action-proxy.test.ts
git commit -m "engine: ACTION PROXY branch sets STARTING and calls invoker.invoke"
```

### Task 13: Engine `onExternalStateChange` mirrors state, captures outputs, terminates on COMPLETED

**Files:**
- Modify: `engines/web/src/engine.ts` — replace `onExternalStateChange` stub

- [ ] **Step 1: Append failing test**

In `engine-action-proxy.test.ts`:

```ts
  it('mirrors invoker state changes onto the step; COMPLETED queues downstream activation', async () => {
    const invoker = new MockActionInvoker();
    const wf = makeActionProxyWorkflow();
    // Give the action proxy step output_parameter_specifications so outputs land in PropertyStore
    (wf.steps[1] as any).output_parameter_specifications = [
      { id: 'received_count', target: 'SomeResult' },
    ];
    const engine = new WorkflowEngine(wf);
    engine.setActionInvoker(invoker, new Map([['env1-oid', SERVER]]));
    engine.start();
    await Promise.resolve();

    invoker.emitStateChange('ap-oid', 'EXECUTING');
    let active = engine.getActiveSteps();
    assert.equal(active.find(s => s.step.oid === 'ap-oid')!.step.state, 'EXECUTING');

    invoker.emitStateChange('ap-oid', 'COMPLETED', { received_count: '42' });

    // After COMPLETED: workflow should advance, END should auto-complete, workflow COMPLETED
    assert.equal(engine.getWorkflowState(), 'COMPLETED');
    assert.equal(engine.getProperties()['SomeResult'], '42');
  });
```

- [ ] **Step 2: Run, expect failure**

```bash
cd engines/web && npm run build && node --test dist/engine-action-proxy.test.js 2>&1 | tail -10
```

Expected: fails — step stays `STARTING`.

- [ ] **Step 3: Implement `onExternalStateChange`**

Replace the stub:

```ts
private onExternalStateChange(
  stepOid: string,
  newState: StepState,
  outputs?: Record<string, string>,
): void {
  const step = this.steps.get(stepOid) ?? this.findStepInTree(stepOid);
  if (!step) return;
  if (this.workflowState === 'ABORTED' || this.workflowState === 'COMPLETED') return;

  // Normalize STOPPED → ABORTED (engine has no STOPPED state)
  const mapped: StepState = (newState as string) === 'STOPPED' ? 'ABORTED' : newState;

  this.recordTrace(stepOid, mapped);
  step.state = mapped;

  // Write outputs to PropertyStore via output_parameter_specifications[].target
  if (outputs && step.step.output_parameter_specifications) {
    for (const spec of step.step.output_parameter_specifications) {
      const val = outputs[spec.id];
      if (val !== undefined && spec.target) {
        this.propertyStore.set(spec.target, val);
      }
    }
    // Also snapshot into stepParameterSnapshots
    const snap = this.stepParameterSnapshots.get(stepOid);
    if (snap) {
      for (const spec of step.step.output_parameter_specifications) {
        const val = outputs[spec.id];
        if (val !== undefined) snap.outputParameters[spec.id] = val;
      }
    }
  }

  const TERMINAL: Array<StepState> = ['COMPLETED', 'ABORTED', 'ERRORED'];
  if (TERMINAL.includes(mapped)) {
    // Release invoker resources for this step
    this.actionInvoker?.release(stepOid);
    this.actionInstanceIdByStep.delete(stepOid);
    this.activeActionProxyServers.delete(stepOid);

    if (mapped === 'COMPLETED') {
      this.completionQueue.push(stepOid);
      this.drainCompletionQueue();
    } else if (mapped === 'ERRORED') {
      this.workflowState = 'ERRORED';
    }
    // ABORTED: terminal, but don't propagate beyond the step itself
  }
}
```

- [ ] **Step 4: Build and test**

```bash
cd engines/web && npm run build && node --test dist/engine-action-proxy.test.js 2>&1 | tail -10
```

Expected: `pass 3`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add engines/web/src/engine.ts engines/web/src/engine-action-proxy.test.ts
git commit -m "engine: onExternalStateChange mirrors state, writes outputs, queues completion"
```

### Task 14: Engine forwards PAUSE / RESUME to invoker

**Files:**
- Modify: `engines/web/src/engine.ts` — `pauseStep`, `resumeStep`

- [ ] **Step 1: Append failing test**

```ts
  it('pauseStep on ACTION PROXY forwards PAUSE command via invoker', async () => {
    const invoker = new MockActionInvoker();
    const engine = new WorkflowEngine(makeActionProxyWorkflow());
    engine.setActionInvoker(invoker, new Map([['env1-oid', SERVER]]));
    engine.start();
    await Promise.resolve();
    invoker.emitStateChange('ap-oid', 'EXECUTING');

    engine.pauseStep('ap-oid');

    assert.equal(invoker.commandsSent.length, 1);
    assert.equal(invoker.commandsSent[0].command, 'PAUSE');
    assert.equal(invoker.commandsSent[0].instanceId, invoker.lastInvocation().instanceId);
  });

  it('resumeStep on ACTION PROXY forwards RESUME command via invoker', async () => {
    const invoker = new MockActionInvoker();
    const engine = new WorkflowEngine(makeActionProxyWorkflow());
    engine.setActionInvoker(invoker, new Map([['env1-oid', SERVER]]));
    engine.start();
    await Promise.resolve();
    invoker.emitStateChange('ap-oid', 'PAUSED');

    engine.resumeStep('ap-oid');

    assert.equal(invoker.commandsSent.length, 1);
    assert.equal(invoker.commandsSent[0].command, 'RESUME');
  });
```

- [ ] **Step 2: Run, expect failure** (commands not forwarded)

```bash
cd engines/web && npm run build && node --test dist/engine-action-proxy.test.js 2>&1 | tail -10
```

- [ ] **Step 3: Extend pauseStep and resumeStep**

In `engine.ts`, find `pauseStep` (around line 349-358). Replace with:

```ts
pauseStep(stepOid: string): void {
  const step = this.steps.get(stepOid);
  if (!step) {
    for (const child of this.activeChildEngines.values()) child.pauseStep(stepOid);
    return;
  }
  if (step.stepType === 'ACTION PROXY') {
    const serverUri = this.activeActionProxyServers.get(stepOid);
    const instanceId = this.actionInstanceIdByStep.get(stepOid);
    if (serverUri && instanceId && this.actionInvoker) {
      void this.actionInvoker.sendCommand(serverUri, instanceId, 'PAUSE');
    }
    return;
  }
  if (step.state === 'EXECUTING') {
    step.state = 'PAUSED';
    this.recordTrace(stepOid, 'PAUSED');
  }
}

resumeStep(stepOid: string): void {
  const step = this.steps.get(stepOid);
  if (!step) {
    for (const child of this.activeChildEngines.values()) child.resumeStep(stepOid);
    return;
  }
  if (step.stepType === 'ACTION PROXY') {
    const serverUri = this.activeActionProxyServers.get(stepOid);
    const instanceId = this.actionInstanceIdByStep.get(stepOid);
    if (serverUri && instanceId && this.actionInvoker) {
      void this.actionInvoker.sendCommand(serverUri, instanceId, 'RESUME');
    }
    return;
  }
  if (step && step.state === 'PAUSED') {
    step.state = 'EXECUTING';
    this.recordTrace(stepOid, 'EXECUTING');
  }
}
```

- [ ] **Step 4: Build and test**

```bash
cd engines/web && npm run build && node --test dist/engine-action-proxy.test.js 2>&1 | tail -10
```

Expected: `pass 5`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add engines/web/src/engine.ts engines/web/src/engine-action-proxy.test.ts
git commit -m "engine: forward PAUSE/RESUME from pauseStep/resumeStep to invoker for ACTION PROXY"
```

### Task 15: Engine `stopStep` method forwards STOP

**Files:**
- Modify: `engines/web/src/engine.ts` — new `stopStep` method

- [ ] **Step 1: Append failing test**

```ts
  it('stopStep on ACTION PROXY forwards STOP command via invoker', async () => {
    const invoker = new MockActionInvoker();
    const engine = new WorkflowEngine(makeActionProxyWorkflow());
    engine.setActionInvoker(invoker, new Map([['env1-oid', SERVER]]));
    engine.start();
    await Promise.resolve();
    invoker.emitStateChange('ap-oid', 'EXECUTING');

    engine.stopStep('ap-oid');

    assert.equal(invoker.commandsSent.length, 1);
    assert.equal(invoker.commandsSent[0].command, 'STOP');
  });
```

- [ ] **Step 2: Run, expect failure** (method doesn't exist)

```bash
cd engines/web && npm run build 2>&1 | tail -5
```

- [ ] **Step 3: Add stopStep method**

Below `resumeStep`:

```ts
stopStep(stepOid: string): void {
  const step = this.steps.get(stepOid);
  if (!step) {
    for (const child of this.activeChildEngines.values()) child.stopStep(stepOid);
    return;
  }
  if (step.stepType !== 'ACTION PROXY') return;
  const serverUri = this.activeActionProxyServers.get(stepOid);
  const instanceId = this.actionInstanceIdByStep.get(stepOid);
  if (serverUri && instanceId && this.actionInvoker) {
    void this.actionInvoker.sendCommand(serverUri, instanceId, 'STOP');
  }
}
```

- [ ] **Step 4: Build and test**

```bash
cd engines/web && npm run build && node --test dist/engine-action-proxy.test.js 2>&1 | tail -10
```

Expected: `pass 6`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add engines/web/src/engine.ts engines/web/src/engine-action-proxy.test.ts
git commit -m "engine: add stopStep method that forwards STOP to invoker"
```

### Task 16: Workflow ABANDON aborts active ACTION PROXY instances

**Files:**
- Modify: `engines/web/src/engine.ts` — `abort()` method (locate or add)

- [ ] **Step 1: Find current abort logic**

```bash
grep -n "abort\|ABORTED\|workflowState =" engines/web/src/engine.ts | head -20
```

Identify whatever method puts `workflowState = 'ABORTED'`. (Often called `abort()` or similar from the coordinator.)

- [ ] **Step 2: Append failing test**

```ts
  it('workflow abort calls invoker.abort for each active ACTION PROXY instance', async () => {
    const invoker = new MockActionInvoker();
    const engine = new WorkflowEngine(makeActionProxyWorkflow());
    engine.setActionInvoker(invoker, new Map([['env1-oid', SERVER]]));
    engine.start();
    await Promise.resolve();
    invoker.emitStateChange('ap-oid', 'EXECUTING');

    engine.abortWorkflow();

    assert.equal(invoker.aborts.length, 1);
    assert.equal(invoker.aborts[0].instanceId, invoker.lastInvocation().instanceId);
    assert.equal(engine.getWorkflowState(), 'ABORTED');
  });
```

- [ ] **Step 3: Run, expect failure**

```bash
cd engines/web && npm run build && node --test dist/engine-action-proxy.test.js 2>&1 | tail -10
```

- [ ] **Step 4: Add or extend `abortWorkflow`**

Add this method to the class:

```ts
abortWorkflow(): void {
  // Abort every in-flight ACTION PROXY instance
  for (const [stepOid, serverUri] of this.activeActionProxyServers) {
    const instanceId = this.actionInstanceIdByStep.get(stepOid);
    if (instanceId && this.actionInvoker) {
      void this.actionInvoker.abort(serverUri, instanceId);
    }
    this.actionInvoker?.release(stepOid);
  }
  this.actionInstanceIdByStep.clear();
  this.activeActionProxyServers.clear();

  // Cascade to child engines
  for (const child of this.activeChildEngines.values()) {
    child.abortWorkflow();
  }

  this.workflowState = 'ABORTED';
}
```

- [ ] **Step 5: Build and test**

```bash
cd engines/web && npm run build && node --test dist/engine-action-proxy.test.js 2>&1 | tail -10
```

Expected: `pass 7`, `fail 0`.

- [ ] **Step 6: Commit**

```bash
git add engines/web/src/engine.ts engines/web/src/engine-action-proxy.test.ts
git commit -m "engine: abortWorkflow releases invoker and DELETEs each active action instance"
```

### Task 17: Step→environment resolution requires uniqueness

**Files:**
- Modify: `engines/web/src/validator.ts` (add a check) OR `engines/web/src/engine.ts` (fail at load)

- [ ] **Step 1: Append failing test**

```ts
  it('throws at engine construction if two environments contain the same action local_id', () => {
    const wf = makeActionProxyWorkflow();
    // Add a second env with a duplicate action local_id
    (wf.environment_specifications ?? []).push({
      local_id: 'env2', oid: 'env2-oid', version: '1.0.0', last_modified_date: '2026-05-23',
      included_actions: [{ local_id: 'A1', oid: 'other-oid' }],
    } as any);

    assert.throws(() => new WorkflowEngine(wf), /duplicate action local_id "A1"/);
  });
```

- [ ] **Step 2: Run, expect failure**

```bash
cd engines/web && npm run build && node --test dist/engine-action-proxy.test.js 2>&1 | tail -10
```

- [ ] **Step 3: Add uniqueness check in constructor**

In `WorkflowEngine` constructor (after step indexing), add:

```ts
// Validate: action local_ids are unique across all environments
const envs = this.workflow.environment_specifications ?? [];
const seenLocalIds = new Map<string, string>(); // localId → env.local_id
for (const env of envs) {
  const actions = (env.included_actions ?? []) as Array<{ local_id: string }>;
  for (const a of actions) {
    const prior = seenLocalIds.get(a.local_id);
    if (prior !== undefined) {
      throw new Error(
        `Workflow has duplicate action local_id "${a.local_id}" in environments ` +
        `"${prior}" and "${env.local_id}". Action local_ids must be unique across environments.`
      );
    }
    seenLocalIds.set(a.local_id, env.local_id);
  }
}
```

- [ ] **Step 4: Build and test**

```bash
cd engines/web && npm run build && node --test dist/engine-action-proxy.test.js 2>&1 | tail -10
```

Expected: `pass 8`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add engines/web/src/engine.ts engines/web/src/engine-action-proxy.test.ts
git commit -m "engine: reject workflows with duplicate action local_ids across environments"
```

### Task 18: Phase-3 verification

- [ ] **Step 1: Full TS test suite passes**

```bash
cd engines/web && npm run build && npm test 2>&1 | tail -10
```

Expected: every previous test still passes; new ACTION PROXY tests pass.

- [ ] **Step 2: Sanity check engine.ts diff for stray TODOs**

```bash
grep -n "TODO\|FIXME\|XXX" engines/web/src/engine.ts engines/web/src/action-invoker.ts engines/web/src/mock-action-invoker.ts
```

Expected: no output (no TODOs introduced).

---

# Phase 4 — HttpActionInvoker

Build the concrete HTTP/SSE invoker with full unit tests. fetch and EventSource are mocked. Tests run via `node:test` from `engines/web/src/`.

### Task 19: Skeleton + URI normalization

**Files:**
- Create: `engines/web/src/http-action-invoker.ts`
- Create: `engines/web/src/http-action-invoker.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// engines/web/src/http-action-invoker.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HttpActionInvoker } from './http-action-invoker.js';

describe('HttpActionInvoker', () => {
  it('trims whitespace from server URIs and ensures trailing slash', () => {
    const inv = new HttpActionInvoker();
    assert.equal(inv.normalizeUri('  http://x/y/  '), 'http://x/y/');
    assert.equal(inv.normalizeUri('http://x/y'), 'http://x/y/');
    assert.equal(inv.normalizeUri('http://x/y/'), 'http://x/y/');
  });
});
```

- [ ] **Step 2: Run, expect failure** (file doesn't exist)

```bash
cd engines/web && npm run build 2>&1 | tail -3
```

- [ ] **Step 3: Implement minimal class**

```ts
// engines/web/src/http-action-invoker.ts
// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import type {
  ActionInvoker,
  ActionInvokerCallbacks,
  ActionServerCommand,
  InvokeRequest,
  ServerCapabilities,
} from './action-invoker.js';

export class HttpActionInvoker implements ActionInvoker {
  normalizeUri(raw: string): string {
    const trimmed = raw.trim();
    return trimmed.endsWith('/') ? trimmed : trimmed + '/';
  }
  probeCapabilities(_serverUri: string): Promise<ServerCapabilities> {
    throw new Error('not implemented');
  }
  invoke(_req: InvokeRequest, _cb: ActionInvokerCallbacks): Promise<string> {
    throw new Error('not implemented');
  }
  sendCommand(_uri: string, _id: string, _cmd: ActionServerCommand): Promise<void> {
    throw new Error('not implemented');
  }
  abort(_uri: string, _id: string): Promise<void> { throw new Error('not implemented'); }
  release(_oid: string): void { /* no-op for now */ }
}
```

- [ ] **Step 4: Build and run**

```bash
cd engines/web && npm run build && node --test dist/http-action-invoker.test.js 2>&1 | tail -5
```

Expected: `pass 1`.

- [ ] **Step 5: Commit**

```bash
git add engines/web/src/http-action-invoker.ts engines/web/src/http-action-invoker.test.ts
git commit -m "http-invoker: skeleton class with URI normalization"
```

### Task 20: probeCapabilities

**Files:**
- Modify: `engines/web/src/http-action-invoker.ts` — implement `probeCapabilities`
- Modify: `engines/web/src/http-action-invoker.test.ts`

- [ ] **Step 1: Append failing test**

```ts
  it('probeCapabilities parses sse_supported and per-action visibility', async () => {
    const responseBody = {
      data: {
        sse_supported: true,
        actions: [
          { action_oid: 'a1', visibility_support: ['observable'] },
          { action_oid: 'a2', visibility_support: ['opaque'] },
        ],
      },
    };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: any) => ({
      ok: true,
      status: 200,
      json: async () => responseBody,
      url: String(input),
    } as any);

    try {
      const inv = new HttpActionInvoker();
      const caps = await inv.probeCapabilities('http://server/trajectory/v1/');
      assert.equal(caps.sse_supported, true);
      assert.equal(caps.actions.get('a1')?.visibility, 'observable');
      assert.equal(caps.actions.get('a2')?.visibility, 'opaque');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('probeCapabilities returns safe defaults on network error', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error('connection refused'); };
    try {
      const inv = new HttpActionInvoker();
      const caps = await inv.probeCapabilities('http://server/trajectory/v1/');
      assert.equal(caps.sse_supported, false);
      assert.equal(caps.actions.size, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
```

- [ ] **Step 2: Run, expect failure**

```bash
cd engines/web && npm run build && node --test dist/http-action-invoker.test.js 2>&1 | tail -10
```

- [ ] **Step 3: Implement probeCapabilities**

Replace the stub with:

```ts
async probeCapabilities(serverUri: string): Promise<ServerCapabilities> {
  const url = this.normalizeUri(serverUri) + 'capabilities';
  try {
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) {
      return { sse_supported: false, actions: new Map() };
    }
    const body = await res.json() as { data?: { sse_supported?: boolean; actions?: Array<{ action_oid: string; visibility_support?: string[] }> } };
    const data = body.data ?? {};
    const actions = new Map<string, { visibility: 'observable' | 'opaque' }>();
    for (const a of data.actions ?? []) {
      const vis = (a.visibility_support ?? []).includes('observable') ? 'observable' : 'opaque';
      actions.set(a.action_oid, { visibility: vis });
    }
    return { sse_supported: Boolean(data.sse_supported), actions };
  } catch {
    return { sse_supported: false, actions: new Map() };
  }
}
```

- [ ] **Step 4: Build and test**

```bash
cd engines/web && npm run build && node --test dist/http-action-invoker.test.js 2>&1 | tail -10
```

Expected: `pass 3`.

- [ ] **Step 5: Commit**

```bash
git add engines/web/src/http-action-invoker.ts engines/web/src/http-action-invoker.test.ts
git commit -m "http-invoker: implement probeCapabilities with safe fallback on failure"
```

### Task 21: invoke() POSTs to /invoke and parses response

**Files:**
- Modify: `engines/web/src/http-action-invoker.ts` and its test

- [ ] **Step 1: Append failing test**

```ts
  it('invoke POSTs to /actions/{oid}/invoke with inputs, returns instance_id', async () => {
    const originalFetch = globalThis.fetch;
    let capturedUrl = '';
    let capturedBody: any = null;
    globalThis.fetch = async (input: any, init?: any) => {
      capturedUrl = String(input);
      capturedBody = init?.body ? JSON.parse(init.body) : null;
      return {
        ok: true, status: 201,
        json: async () => ({ data: { runtime_action_instance_id: 'rai-123', status: 'POSTED' } }),
      } as any;
    };

    try {
      const inv = new HttpActionInvoker();
      const id = await inv.invoke({
        stepOid: 'step-1', workflow_instance_id: 'wf-1',
        serverUri: 'http://server/trajectory/v1/', action_oid: 'a1',
        inputs: { foo: 'bar' }, mode: 'poll-only', pollIntervalMs: 4000,
      }, {
        onStateChange: () => {}, onConnectivityChange: () => {},
      });

      assert.equal(id, 'rai-123');
      assert.match(capturedUrl, /\/actions\/a1\/invoke$/);
      assert.equal(capturedBody.workflow_instance_id, 'wf-1');
      assert.deepEqual(capturedBody.input_parameters, { foo: 'bar' });
    } finally {
      globalThis.fetch = originalFetch;
      // Release any polling started
    }
  });
```

- [ ] **Step 2: Run, expect failure**

```bash
cd engines/web && npm run build && node --test dist/http-action-invoker.test.js 2>&1 | tail -10
```

- [ ] **Step 3: Implement invoke()**

Add private state for tracking active invocations:

```ts
private active = new Map<string, {
  serverUri: string;
  instanceId: string;
  pollTimer: ReturnType<typeof setTimeout> | null;
  eventSource: any | null;
  lastStatus: string | null;
  cancelled: boolean;
}>();
```

Replace the `invoke` stub with:

```ts
async invoke(req: InvokeRequest, callbacks: ActionInvokerCallbacks): Promise<string> {
  const base = this.normalizeUri(req.serverUri);
  const url = `${base}actions/${encodeURIComponent(req.action_oid)}/invoke`;
  const body = {
    workflow_instance_id: req.workflow_instance_id,
    input_parameters: req.inputs,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    callbacks.onStateChange(req.stepOid, 'ERRORED');
    throw new Error(`invoke failed with status ${res.status}`);
  }

  const parsed = await res.json() as { data?: { runtime_action_instance_id?: string; status?: string; sse_endpoint?: string } };
  const data = parsed.data ?? {};
  const instanceId = data.runtime_action_instance_id;
  if (!instanceId) throw new Error('invoke response missing runtime_action_instance_id');

  // Initial state from the 201 response
  if (data.status) {
    callbacks.onStateChange(req.stepOid, data.status as any);
  }

  this.active.set(req.stepOid, {
    serverUri: base,
    instanceId,
    pollTimer: null,
    eventSource: null,
    lastStatus: data.status ?? null,
    cancelled: false,
  });

  // Strategy decision (full implementation in next task)
  // For now: always poll. SSE wired up later.
  this.startPolling(req.stepOid, base, instanceId, req.pollIntervalMs, callbacks);

  return instanceId;
}

private startPolling(
  stepOid: string,
  serverUri: string,
  instanceId: string,
  intervalMs: number,
  callbacks: ActionInvokerCallbacks,
): void {
  const state = this.active.get(stepOid);
  if (!state || state.cancelled) return;

  const tick = async () => {
    if (state.cancelled) return;
    try {
      const url = `${serverUri}instances/${encodeURIComponent(instanceId)}`;
      const res = await fetch(url, { method: 'GET' });
      if (res.status === 404) {
        // Server cleaned up — treat as terminal ABORTED
        callbacks.onStateChange(stepOid, 'ABORTED');
        this.release(stepOid);
        return;
      }
      if (res.ok) {
        const parsed = await res.json() as { data?: { status?: string; output_parameters?: Record<string, string> } };
        const data = parsed.data ?? {};
        if (data.status && data.status !== state.lastStatus) {
          state.lastStatus = data.status;
          callbacks.onStateChange(stepOid, data.status as any, data.output_parameters);
        }
        const TERMINAL = ['COMPLETED', 'ABORTED', 'ERRORED'];
        if (data.status && TERMINAL.includes(data.status)) {
          this.release(stepOid);
          return;
        }
      }
      // Schedule next tick
      if (!state.cancelled) {
        state.pollTimer = setTimeout(tick, intervalMs);
      }
    } catch {
      // Network error — retry next tick without state change
      if (!state.cancelled) {
        state.pollTimer = setTimeout(tick, intervalMs);
      }
    }
  };

  // First tick after one interval (allow time for STARTING/POSTED to be observed)
  state.pollTimer = setTimeout(tick, intervalMs);
}

release(stepOid: string): void {
  const state = this.active.get(stepOid);
  if (!state) return;
  state.cancelled = true;
  if (state.pollTimer) clearTimeout(state.pollTimer);
  if (state.eventSource && typeof state.eventSource.close === 'function') {
    state.eventSource.close();
  }
  this.active.delete(stepOid);
}
```

- [ ] **Step 4: Build and test**

```bash
cd engines/web && npm run build && node --test dist/http-action-invoker.test.js 2>&1 | tail -10
```

Expected: `pass 4`.

- [ ] **Step 5: Commit**

```bash
git add engines/web/src/http-action-invoker.ts engines/web/src/http-action-invoker.test.ts
git commit -m "http-invoker: implement invoke() with polling fallback and release()"
```

### Task 22: Polling delivers state transitions

**Files:**
- Modify: `engines/web/src/http-action-invoker.test.ts`

- [ ] **Step 1: Append failing test using fake timers**

```ts
import { mock } from 'node:test';

  it('polling delivers state changes when status changes between ticks', async () => {
    const originalFetch = globalThis.fetch;
    const statusSeq = ['POSTED', 'EXECUTING', 'COMPLETED'];
    let i = 0;
    globalThis.fetch = async (input: any, init?: any) => {
      const url = String(input);
      if (url.endsWith('/invoke')) {
        return { ok: true, status: 201, json: async () => ({ data: { runtime_action_instance_id: 'rai-9', status: 'POSTED' } }) } as any;
      }
      // poll
      const status = statusSeq[Math.min(i++, statusSeq.length - 1)];
      const body = status === 'COMPLETED'
        ? { data: { status, output_parameters: { x: '1' } } }
        : { data: { status } };
      return { ok: true, status: 200, json: async () => body } as any;
    };

    const seen: Array<{ s: string; o?: any }> = [];
    const inv = new HttpActionInvoker();
    await inv.invoke({
      stepOid: 'sx', workflow_instance_id: 'wf', serverUri: 'http://s/', action_oid: 'a',
      inputs: {}, mode: 'poll-only', pollIntervalMs: 5,
    }, { onStateChange: (_oid, s, o) => seen.push({ s, o }), onConnectivityChange: () => {} });

    // Wait long enough for ~3 poll cycles
    await new Promise(r => setTimeout(r, 80));
    inv.release('sx');
    globalThis.fetch = originalFetch;

    const states = seen.map(e => e.s);
    assert.ok(states.includes('POSTED'));
    assert.ok(states.includes('EXECUTING'));
    assert.ok(states.includes('COMPLETED'));
    const completed = seen.find(e => e.s === 'COMPLETED');
    assert.deepEqual(completed?.o, { x: '1' });
  });
```

- [ ] **Step 2: Run and verify it passes** (implementation from Task 21 already supports this)

```bash
cd engines/web && npm run build && node --test dist/http-action-invoker.test.js 2>&1 | tail -10
```

Expected: `pass 5`.

- [ ] **Step 3: Commit**

```bash
git add engines/web/src/http-action-invoker.test.ts
git commit -m "http-invoker: add polling integration test covering state transitions and outputs"
```

### Task 23: SSE strategy chooser

**Files:**
- Modify: `engines/web/src/http-action-invoker.ts` — wire SSE branch
- Modify: `engines/web/src/http-action-invoker.test.ts`

- [ ] **Step 1: Add capabilities-aware setter on the invoker**

Add a method to remember capabilities per server:

```ts
private capsByServer = new Map<string, ServerCapabilities>();

setCapabilities(serverUri: string, caps: ServerCapabilities): void {
  this.capsByServer.set(this.normalizeUri(serverUri), caps);
}
```

- [ ] **Step 2: Update invoke() to choose SSE when conditions match**

In `invoke()`, replace the polling call with:

```ts
const caps = this.capsByServer.get(base);
const actionVisibility = caps?.actions.get(req.action_oid)?.visibility;
const canSse = req.mode === 'sse-preferred'
  && caps?.sse_supported === true
  && actionVisibility === 'observable'
  && typeof data.sse_endpoint === 'string';

if (canSse) {
  this.startSse(req.stepOid, base, instanceId, data.sse_endpoint!, req.pollIntervalMs, callbacks);
} else {
  this.startPolling(req.stepOid, base, instanceId, req.pollIntervalMs, callbacks);
}
```

- [ ] **Step 3: Implement startSse**

```ts
private startSse(
  stepOid: string,
  serverUri: string,
  instanceId: string,
  ssePath: string,
  fallbackPollMs: number,
  callbacks: ActionInvokerCallbacks,
): void {
  const state = this.active.get(stepOid);
  if (!state || state.cancelled) return;

  // EventSource is browser-native; in tests it's mocked
  const url = ssePath.startsWith('http') ? ssePath : serverUri.replace(/\/$/, '') + ssePath;
  const EventSourceCtor = (globalThis as any).EventSource;
  if (!EventSourceCtor) {
    // No EventSource in env — fall back to polling
    this.startPolling(stepOid, serverUri, instanceId, fallbackPollMs, callbacks);
    return;
  }
  const es = new EventSourceCtor(url);
  state.eventSource = es;

  es.addEventListener('state_change', (ev: MessageEvent) => {
    try {
      const data = JSON.parse(ev.data);
      callbacks.onStateChange(stepOid, data.status, data.output_parameters);
      const TERMINAL = ['COMPLETED', 'ABORTED', 'ERRORED'];
      if (TERMINAL.includes(data.status)) this.release(stepOid);
    } catch { /* ignore malformed */ }
  });

  es.addEventListener('output', (ev: MessageEvent) => {
    try {
      const data = JSON.parse(ev.data);
      callbacks.onStateChange(stepOid, state.lastStatus as any, data);
    } catch {}
  });

  es.addEventListener('error', () => {
    // SSE failed — fall back to polling for this invocation
    es.close();
    state.eventSource = null;
    if (!state.cancelled) {
      callbacks.onConnectivityChange(stepOid, 'reconnecting');
      this.startPolling(stepOid, serverUri, instanceId, fallbackPollMs, callbacks);
    }
  });
}
```

- [ ] **Step 4: Append SSE test**

```ts
  it('uses SSE when mode=sse-preferred + sse_supported + observable + sse_endpoint', async () => {
    // Mock EventSource
    const listeners: Record<string, Function[]> = {};
    const closeSpy = mock.fn();
    (globalThis as any).EventSource = class {
      url: string;
      constructor(url: string) { this.url = url; (globalThis as any).__lastES = this; }
      addEventListener(name: string, fn: Function) { (listeners[name] ??= []).push(fn); }
      close() { closeSpy(); }
    };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: any) => {
      if (String(input).endsWith('/invoke')) {
        return { ok: true, status: 201, json: async () => ({ data: { runtime_action_instance_id: 'rai-7', status: 'STARTING', sse_endpoint: '/instances/rai-7/events' } }) } as any;
      }
      return { ok: true, status: 200, json: async () => ({ data: { status: 'STARTING' } }) } as any;
    };

    const seen: string[] = [];
    const inv = new HttpActionInvoker();
    inv.setCapabilities('http://s/', { sse_supported: true, actions: new Map([['a', { visibility: 'observable' }]]) });

    await inv.invoke({
      stepOid: 'sx', workflow_instance_id: 'wf', serverUri: 'http://s/', action_oid: 'a',
      inputs: {}, mode: 'sse-preferred', pollIntervalMs: 4000,
    }, { onStateChange: (_oid, s) => seen.push(s), onConnectivityChange: () => {} });

    // Fire a state_change event manually
    const fn = listeners['state_change']?.[0];
    assert.ok(fn, 'state_change listener registered');
    fn({ data: JSON.stringify({ status: 'COMPLETED', output_parameters: { y: '2' } }) });

    inv.release('sx');
    delete (globalThis as any).EventSource;
    globalThis.fetch = originalFetch;

    assert.ok(seen.includes('STARTING'));
    assert.ok(seen.includes('COMPLETED'));
  });
```

- [ ] **Step 5: Build and test**

```bash
cd engines/web && npm run build && node --test dist/http-action-invoker.test.js 2>&1 | tail -10
```

Expected: `pass 6`.

- [ ] **Step 6: Commit**

```bash
git add engines/web/src/http-action-invoker.ts engines/web/src/http-action-invoker.test.ts
git commit -m "http-invoker: choose SSE when capabilities permit; fall back to polling on SSE error"
```

### Task 24: invoke() retries forever with backoff on network errors

**Files:**
- Modify: `engines/web/src/http-action-invoker.ts` and its test

- [ ] **Step 1: Append failing test**

```ts
  it('invoke retries on network error and eventually succeeds', async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async (input: any) => {
      calls++;
      if (String(input).endsWith('/invoke') && calls < 3) {
        throw new Error('econnrefused');
      }
      return { ok: true, status: 201, json: async () => ({ data: { runtime_action_instance_id: 'rai-r', status: 'POSTED' } }) } as any;
    };

    try {
      const inv = new HttpActionInvoker();
      const id = await inv.invoke({
        stepOid: 'sr', workflow_instance_id: 'w', serverUri: 'http://s/', action_oid: 'a',
        inputs: {}, mode: 'poll-only', pollIntervalMs: 1000,
      }, { onStateChange: () => {}, onConnectivityChange: () => {} });
      assert.equal(id, 'rai-r');
      assert.ok(calls >= 3);
      inv.release('sr');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
```

- [ ] **Step 2: Run, expect failure**

```bash
cd engines/web && npm run build && node --test dist/http-action-invoker.test.js 2>&1 | tail -10
```

- [ ] **Step 3: Wrap fetch in invoke() with retry helper**

Add a private helper:

```ts
private async fetchWithRetry(
  url: string,
  init: RequestInit,
  onAttemptFail?: () => void,
): Promise<Response> {
  const delays = [100, 200, 400, 800, 1600, 3200, 6400, 12800, 25600, 30000]; // ms, capped at 30s
  let attempt = 0;
  for (;;) {
    try {
      const res = await fetch(url, init);
      // Retry on 5xx only; 4xx are caller's problem
      if (res.status >= 500 && res.status < 600) {
        onAttemptFail?.();
      } else {
        return res;
      }
    } catch {
      onAttemptFail?.();
    }
    const wait = delays[Math.min(attempt, delays.length - 1)];
    attempt++;
    await new Promise(r => setTimeout(r, wait));
  }
}
```

Replace the bare `fetch(url, init)` inside `invoke()` for the POST with `this.fetchWithRetry(url, init)`.

- [ ] **Step 4: Build and test**

```bash
cd engines/web && npm run build && node --test dist/http-action-invoker.test.js 2>&1 | tail -10
```

Expected: `pass 7`.

- [ ] **Step 5: Commit**

```bash
git add engines/web/src/http-action-invoker.ts engines/web/src/http-action-invoker.test.ts
git commit -m "http-invoker: retry invoke POST with capped exponential backoff on net/5xx"
```

### Task 25: sendCommand and abort

**Files:**
- Modify: `engines/web/src/http-action-invoker.ts` and its test

- [ ] **Step 1: Append failing tests**

```ts
  it('sendCommand POSTs to /command and ignores 409', async () => {
    const originalFetch = globalThis.fetch;
    let url = '';
    let body: any = null;
    globalThis.fetch = async (input: any, init?: any) => {
      url = String(input);
      body = init?.body ? JSON.parse(init.body) : null;
      return { ok: false, status: 409, json: async () => ({ error: { code: 'INVALID_STATE_TRANSITION' } }) } as any;
    };
    try {
      const inv = new HttpActionInvoker();
      await inv.sendCommand('http://s/', 'rai-1', 'PAUSE'); // does not throw
      assert.match(url, /\/instances\/rai-1\/command$/);
      assert.equal(body.command, 'PAUSE');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('abort DELETEs /instances/{id}', async () => {
    const originalFetch = globalThis.fetch;
    let url = '', method = '';
    globalThis.fetch = async (input: any, init?: any) => {
      url = String(input); method = init?.method ?? 'GET';
      return { ok: true, status: 200, json: async () => ({}) } as any;
    };
    try {
      const inv = new HttpActionInvoker();
      await inv.abort('http://s/', 'rai-2');
      assert.match(url, /\/instances\/rai-2$/);
      assert.equal(method, 'DELETE');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
```

- [ ] **Step 2: Run, expect failure**

```bash
cd engines/web && npm run build && node --test dist/http-action-invoker.test.js 2>&1 | tail -10
```

- [ ] **Step 3: Implement sendCommand and abort**

```ts
async sendCommand(serverUri: string, instanceId: string, command: ActionServerCommand): Promise<void> {
  const url = this.normalizeUri(serverUri) + `instances/${encodeURIComponent(instanceId)}/command`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command }),
    });
    if (res.status === 409) return; // silent-ignore INVALID_STATE_TRANSITION
    // Other errors: log and give up (best-effort)
  } catch {
    // network error: best-effort, give up
  }
}

async abort(serverUri: string, instanceId: string): Promise<void> {
  const url = this.normalizeUri(serverUri) + `instances/${encodeURIComponent(instanceId)}`;
  try {
    await fetch(url, { method: 'DELETE' });
  } catch {
    // best-effort
  }
}
```

- [ ] **Step 4: Build and test**

```bash
cd engines/web && npm run build && node --test dist/http-action-invoker.test.js 2>&1 | tail -10
```

Expected: `pass 9`.

- [ ] **Step 5: Commit**

```bash
git add engines/web/src/http-action-invoker.ts engines/web/src/http-action-invoker.test.ts
git commit -m "http-invoker: implement sendCommand and abort with silent-ignore 409"
```

### Task 26: Connectivity status callback

**Files:**
- Modify: `engines/web/src/http-action-invoker.ts` — emit `reconnecting` and `ok`

- [ ] **Step 1: Append failing test**

```ts
  it('emits reconnecting after 3 consecutive poll failures then ok on recovery', async () => {
    const originalFetch = globalThis.fetch;
    let pollCalls = 0;
    let invokeReturned = false;
    globalThis.fetch = async (input: any) => {
      const url = String(input);
      if (url.endsWith('/invoke')) {
        invokeReturned = true;
        return { ok: true, status: 201, json: async () => ({ data: { runtime_action_instance_id: 'rai-c', status: 'POSTED' } }) } as any;
      }
      pollCalls++;
      if (pollCalls <= 3) throw new Error('net');
      return { ok: true, status: 200, json: async () => ({ data: { status: 'EXECUTING' } }) } as any;
    };
    const events: string[] = [];
    const inv = new HttpActionInvoker();
    await inv.invoke({
      stepOid: 'sc', workflow_instance_id: 'w', serverUri: 'http://s/', action_oid: 'a',
      inputs: {}, mode: 'poll-only', pollIntervalMs: 5,
    }, { onStateChange: () => {}, onConnectivityChange: (_oid, s) => events.push(s) });

    await new Promise(r => setTimeout(r, 80));
    inv.release('sc');
    globalThis.fetch = originalFetch;
    assert.ok(invokeReturned);
    assert.ok(events.includes('reconnecting'));
    assert.ok(events.includes('ok'));
  });
```

- [ ] **Step 2: Run, expect failure**

- [ ] **Step 3: Add failure counter in startPolling**

In the polling tick, track consecutive failures:

```ts
let consecutiveFailures = 0;
let connectivityState: 'ok' | 'reconnecting' = 'ok';

const tick = async () => {
  if (state.cancelled) return;
  try {
    const url = `${serverUri}instances/${encodeURIComponent(instanceId)}`;
    const res = await fetch(url, { method: 'GET' });
    if (res.status === 404) {
      callbacks.onStateChange(stepOid, 'ABORTED');
      this.release(stepOid);
      return;
    }
    if (res.ok) {
      consecutiveFailures = 0;
      if (connectivityState !== 'ok') {
        connectivityState = 'ok';
        callbacks.onConnectivityChange(stepOid, 'ok');
      }
      const parsed = await res.json() as { data?: { status?: string; output_parameters?: Record<string, string> } };
      const data = parsed.data ?? {};
      if (data.status && data.status !== state.lastStatus) {
        state.lastStatus = data.status;
        callbacks.onStateChange(stepOid, data.status as any, data.output_parameters);
      }
      const TERMINAL = ['COMPLETED', 'ABORTED', 'ERRORED'];
      if (data.status && TERMINAL.includes(data.status)) {
        this.release(stepOid);
        return;
      }
    } else if (res.status >= 500) {
      throw new Error(`server ${res.status}`);
    }
    if (!state.cancelled) state.pollTimer = setTimeout(tick, intervalMs);
  } catch {
    consecutiveFailures++;
    if (consecutiveFailures >= 3 && connectivityState === 'ok') {
      connectivityState = 'reconnecting';
      callbacks.onConnectivityChange(stepOid, 'reconnecting');
    }
    if (!state.cancelled) state.pollTimer = setTimeout(tick, intervalMs);
  }
};
```

- [ ] **Step 4: Build and test**

```bash
cd engines/web && npm run build && node --test dist/http-action-invoker.test.js 2>&1 | tail -10
```

Expected: `pass 10`.

- [ ] **Step 5: Commit**

```bash
git add engines/web/src/http-action-invoker.ts engines/web/src/http-action-invoker.test.ts
git commit -m "http-invoker: emit reconnecting after 3 consecutive failures, ok on recovery"
```

### Task 27: Phase-4 verification

- [ ] **Step 1: Run full test suite**

```bash
cd engines/web && npm run build && npm test 2>&1 | tail -10
```

Expected: every engine + invoker test passes.

- [ ] **Step 2: Diff to make sure no TODOs**

```bash
grep -n "TODO\|FIXME\|XXX" engines/web/src/http-action-invoker.ts
```

Expected: no output.

---

# Phase 5 — WorkflowCoordinator + UI wiring

Wire the invoker into the coordinator, surface server selection, capabilities probe, settings UI, picker dialog, STOP button, and connectivity badge.

### Task 28: Coordinator owns invoker and settings

**Files:**
- Modify: `engines/web-ui/src/coordinator/WorkflowCoordinator.ts`

- [ ] **Step 1: Read current `start()` signature**

```bash
grep -n "start()\|load(" engines/web-ui/src/coordinator/WorkflowCoordinator.ts | head -10
```

- [ ] **Step 2: Add invoker field and configuration**

Top of the class, add:

```ts
import { HttpActionInvoker } from '@engine/http-action-invoker.js';
import type { ActionServerSpecification, ConnectionMode } from '@engine/types.js';
import type { ActionInvoker } from '@engine/action-invoker.js';

private invoker: ActionInvoker | null = null;
private serverByEnvOid: Map<string, ActionServerSpecification> = new Map();
private actionProxyMode: ConnectionMode = 'sse-preferred';
private actionProxyPollMs = 4000;

setActionProxyOptions(mode: ConnectionMode, pollIntervalMs: number): void {
  this.actionProxyMode = mode;
  this.actionProxyPollMs = pollIntervalMs;
}

setServerSelections(map: Map<string, ActionServerSpecification>): void {
  this.serverByEnvOid = map;
}
```

- [ ] **Step 3: Inject into engine on start**

In `start()`, after constructing the `WorkflowEngine`, before calling `engine.start()`:

```ts
this.invoker = new HttpActionInvoker();

// Probe capabilities for each unique chosen server (best-effort)
const uniqueUris = new Set<string>();
for (const server of this.serverByEnvOid.values()) uniqueUris.add(server.uri.trim());
for (const uri of uniqueUris) {
  void (this.invoker as HttpActionInvoker).probeCapabilities(uri).then(caps => {
    (this.invoker as HttpActionInvoker).setCapabilities(uri, caps);
  });
}

engine.setActionInvoker(this.invoker, this.serverByEnvOid);
engine.setActionInvokerOptions(this.actionProxyMode, this.actionProxyPollMs);
```

- [ ] **Step 4: Build the whole project**

```bash
cd engines/web && npm run build && cd ../web-ui && npm run build 2>&1 | tail -10
```

Expected: both build without errors.

- [ ] **Step 5: Commit**

```bash
git add engines/web-ui/src/coordinator/WorkflowCoordinator.ts
git commit -m "coordinator: wire HttpActionInvoker into engine; expose mode/poll setters"
```

### Task 29: Coordinator exposes `stopStep` and connectivity status

**Files:**
- Modify: `engines/web-ui/src/coordinator/WorkflowCoordinator.ts`

- [ ] **Step 1: Add stopStep + connectivityStatus to snapshot**

Extend `CoordinatorSnapshot`:

```ts
export interface CoordinatorSnapshot {
  // ... existing fields
  connectivityByStep: Record<string, 'ok' | 'reconnecting' | 'never_connected'>;
}
```

Add to constructor's default snapshot: `connectivityByStep: {}`.

Add stopStep method:

```ts
stopStep(stepOid: string): void {
  this.engine?.stopStep(stepOid);
  this.sync();
}
```

- [ ] **Step 2: Hook engine's connectivity callback to snapshot**

The engine's `onConnectivityChange` is wired to the invoker. The engine needs to expose this so the coordinator can subscribe. Add an `onConnectivityChange` listener to the engine.

In `engines/web/src/engine.ts`:

```ts
private connectivityListeners: Array<(stepOid: string, status: 'ok' | 'reconnecting' | 'never_connected') => void> = [];

subscribeConnectivity(fn: (stepOid: string, status: 'ok' | 'reconnecting' | 'never_connected') => void): () => void {
  this.connectivityListeners.push(fn);
  return () => {
    const idx = this.connectivityListeners.indexOf(fn);
    if (idx >= 0) this.connectivityListeners.splice(idx, 1);
  };
}

private onConnectivityChange(stepOid: string, status: 'ok' | 'reconnecting' | 'never_connected'): void {
  for (const fn of this.connectivityListeners) fn(stepOid, status);
}
```

In `WorkflowCoordinator`, after constructing the engine:

```ts
engine.subscribeConnectivity((stepOid, status) => {
  this.snapshot = {
    ...this.snapshot,
    connectivityByStep: { ...this.snapshot.connectivityByStep, [stepOid]: status },
  };
  this.notify();
});
```

- [ ] **Step 3: Build**

```bash
cd engines/web && npm run build && cd ../web-ui && npm run build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add engines/web/src/engine.ts engines/web-ui/src/coordinator/WorkflowCoordinator.ts
git commit -m "coordinator: expose stopStep + connectivityByStep snapshot field"
```

### Task 30: Server picker dialog

**Files:**
- Create: `engines/web-ui/src/components/WorkflowStartServerPickerDialog.tsx`

- [ ] **Step 1: Write the component**

```tsx
// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { useState } from 'react';
import type { ActionServerSpecification } from '@engine/types.js';

interface EnvPick {
  envLocalId: string;
  envOid: string;
  servers: ActionServerSpecification[];
}

export interface WorkflowStartServerPickerDialogProps {
  picks: EnvPick[]; // one entry per env with 2+ REST servers
  onResolved: (choices: Map<string, ActionServerSpecification>) => void;
  onCancel: () => void;
}

export function WorkflowStartServerPickerDialog({ picks, onResolved, onCancel }: WorkflowStartServerPickerDialogProps) {
  const [selections, setSelections] = useState<Record<string, number>>(
    Object.fromEntries(picks.map(p => [p.envOid, 0])),
  );

  const submit = () => {
    const map = new Map<string, ActionServerSpecification>();
    for (const p of picks) {
      const idx = selections[p.envOid] ?? 0;
      map.set(p.envOid, p.servers[idx]);
    }
    onResolved(map);
  };

  return (
    <div role="dialog" aria-modal="true" style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{ background: 'white', padding: 24, borderRadius: 8, minWidth: 400, maxWidth: 600 }}>
        <h2 style={{ marginTop: 0 }}>Choose Action Server</h2>
        {picks.map(p => (
          <div key={p.envOid} style={{ marginBottom: 16 }}>
            <p style={{ fontWeight: 'bold', marginBottom: 8 }}>Environment: {p.envLocalId}</p>
            {p.servers.map((s, i) => (
              <label key={i} style={{ display: 'block', marginBottom: 4 }}>
                <input type="radio" name={p.envOid}
                  checked={selections[p.envOid] === i}
                  onChange={() => setSelections({ ...selections, [p.envOid]: i })} />
                {' '}{s.name} — <code>{s.uri.trim()}</code>
                {s.description && <span style={{ color: '#666' }}> · {s.description}</span>}
              </label>
            ))}
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onCancel}>Cancel</button>
          <button onClick={submit} style={{ background: '#1976d2', color: 'white' }}>Start</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build**

```bash
cd engines/web-ui && npm run build 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add engines/web-ui/src/components/WorkflowStartServerPickerDialog.tsx
git commit -m "ui: add WorkflowStartServerPickerDialog component"
```

### Task 31: WorkflowManager resolves server selections before start

**Files:**
- Modify: `engines/web-ui/src/manager/WorkflowManager.ts`

- [ ] **Step 1: Add selection resolver helper**

At the top of WorkflowManager class, add a method:

```ts
/**
 * Inspect the workflow for ACTION PROXY steps and return per-environment
 * server picks. Returns:
 *   - autoSelected: envOid → server (single REST server, no UI needed)
 *   - needsPick: envOid + servers list (2+ REST servers, prompt user)
 *   - missing: envOid + envLocalId (zero REST servers — block start)
 */
resolveServerSelections(workflow: MasterWorkflowSpecification): {
  autoSelected: Map<string, ActionServerSpecification>;
  needsPick: Array<{ envOid: string; envLocalId: string; servers: ActionServerSpecification[] }>;
  missing: Array<{ envOid: string; envLocalId: string }>;
} {
  const proxySteps = workflow.steps.filter(s => s.step_type === 'ACTION PROXY');
  if (proxySteps.length === 0) {
    return { autoSelected: new Map(), needsPick: [], missing: [] };
  }

  // Find envs referenced by any proxy step
  const refEnvs = new Set<string>();
  for (const s of proxySteps) {
    for (const env of workflow.environment_specifications ?? []) {
      const has = (env.included_actions ?? []).some((a: any) => a.local_id === s.local_id);
      if (has) refEnvs.add(env.oid);
    }
  }

  const autoSelected = new Map<string, ActionServerSpecification>();
  const needsPick: any[] = [];
  const missing: any[] = [];

  for (const env of workflow.environment_specifications ?? []) {
    if (!refEnvs.has(env.oid)) continue;
    const rest = (env.action_server_specifications ?? []).filter(s => s.connection_type === 'REST');
    if (rest.length === 0) {
      missing.push({ envOid: env.oid, envLocalId: env.local_id });
    } else if (rest.length === 1) {
      autoSelected.set(env.oid, rest[0]);
    } else {
      needsPick.push({ envOid: env.oid, envLocalId: env.local_id, servers: rest });
    }
  }

  return { autoSelected, needsPick, missing };
}
```

- [ ] **Step 2: Build**

```bash
cd engines/web-ui && npm run build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add engines/web-ui/src/manager/WorkflowManager.ts
git commit -m "manager: add resolveServerSelections helper for ACTION PROXY workflows"
```

### Task 32: Settings — connection mode + poll interval

**Files:**
- Modify: `engines/web-ui/src/components/screens/SettingsScreen.tsx`

- [ ] **Step 1: Read current SettingsScreen**

```bash
sed -n '1,40p' engines/web-ui/src/components/screens/SettingsScreen.tsx
```

- [ ] **Step 2: Add Action Servers section**

Add inside the screen body (using whatever existing pattern the file uses for sections — see useLocalStorage):

```tsx
import { useLocalStorage } from '../../hooks/useLocalStorage';

// Inside the component:
const [mode, setMode] = useLocalStorage<'sse-preferred' | 'poll-only'>('actionProxy.mode', 'sse-preferred');
const [pollSec, setPollSec] = useLocalStorage<number>('actionProxy.pollSec', 4);

// In the JSX, add a new section:
<section>
  <h3>Action Servers</h3>
  <div>
    <p>Connection mode</p>
    <label>
      <input type="radio" checked={mode === 'sse-preferred'} onChange={() => setMode('sse-preferred')} />
      Use SSE when available
    </label>
    <label>
      <input type="radio" checked={mode === 'poll-only'} onChange={() => setMode('poll-only')} />
      Always poll
    </label>
  </div>
  <div>
    <label>
      Poll interval (seconds):{' '}
      <input
        type="number" min={1} max={300} value={pollSec}
        onChange={e => setPollSec(Math.max(1, Math.min(300, Number(e.target.value) || 4)))}
      />
    </label>
    <p style={{ fontSize: 12, color: '#666' }}>
      Used for opaque actions or when SSE is unavailable.
    </p>
  </div>
</section>
```

- [ ] **Step 3: Build**

```bash
cd engines/web-ui && npm run build 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 4: Manual verify in dev server**

With `npm run dev` running, open `http://localhost:5173/`, navigate to Settings, confirm the new section renders and choices persist on reload.

- [ ] **Step 5: Commit**

```bash
git add engines/web-ui/src/components/screens/SettingsScreen.tsx
git commit -m "ui(settings): add connection mode and poll interval for ACTION PROXY"
```

### Task 33: Coordinator reads settings on start

**Files:**
- Modify: `engines/web-ui/src/coordinator/WorkflowCoordinator.ts` or its caller in `WorkflowManager`

- [ ] **Step 1: Read settings before start**

Where `coordinator.start()` is called in WorkflowManager (or App.tsx), first read settings from localStorage:

```ts
const mode = (localStorage.getItem('actionProxy.mode') ?? 'sse-preferred') as ConnectionMode;
const pollSec = Number(localStorage.getItem('actionProxy.pollSec') ?? '4');
coordinator.setActionProxyOptions(mode, Math.max(1000, pollSec * 1000));
```

Add this right before the existing `coordinator.start()` call.

- [ ] **Step 2: Build**

```bash
cd engines/web-ui && npm run build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add engines/web-ui/src/manager/WorkflowManager.ts engines/web-ui/src/coordinator/WorkflowCoordinator.ts
git commit -m "coordinator: read action-proxy settings before starting workflow"
```

### Task 34: StateCommandMenu — STOP button

**Files:**
- Modify: `engines/web-ui/src/components/StateCommandMenu.tsx`

- [ ] **Step 1: Read the menu**

```bash
sed -n '1,80p' engines/web-ui/src/components/StateCommandMenu.tsx
```

- [ ] **Step 2: Add STOP button conditional on ACTION PROXY focus**

Inside the menu component, find where PAUSE / RESUME buttons render. Add:

```tsx
// Find the focused step
const focusedStep = snapshot?.activeSteps.find(s => s.step.oid === focusedStepOid);
const isActionProxy = focusedStep?.step.stepType === 'ACTION PROXY';
const isStoppable = isActionProxy && focusedStep && ['STARTING', 'EXECUTING', 'POSTED', 'IN_PROGRESS'].includes(focusedStep.step.state);

{isStoppable && (
  <button onClick={() => { coordinator.stopStep(focusedStepOid); onClose(); }}>
    Stop
  </button>
)}
```

The exact structure depends on how the file already renders commands; integrate inline with existing buttons.

- [ ] **Step 3: Build**

```bash
cd engines/web-ui && npm run build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add engines/web-ui/src/components/StateCommandMenu.tsx
git commit -m "ui(commands): add Stop button for active ACTION PROXY steps"
```

### Task 35: ActiveStepCard — connectivity badge

**Files:**
- Modify: `engines/web-ui/src/components/ActiveStepCard.tsx`

- [ ] **Step 1: Pass connectivityStatus prop**

Extend `ActiveStepCardProps`:

```tsx
connectivityStatus?: 'ok' | 'reconnecting' | 'never_connected';
```

In ActiveScreen.tsx, when rendering ActiveStepCard, pass:

```tsx
connectivityStatus={managerSnap.coordinatorSnapshots[flat.workflowId]?.connectivityByStep[flat.stepInfo.step.oid]}
```

(adjust to the actual structure of managerSnap).

- [ ] **Step 2: Render the pill**

In ActiveStepCard, just under the state display in the "Processing…" branch and any other branch where it's relevant:

```tsx
{connectivityStatus && connectivityStatus !== 'ok' && (
  <div style={{
    display: 'inline-block', padding: '2px 8px', borderRadius: 12,
    background: '#f0ad4e', color: 'white', fontSize: 11, marginTop: 4,
  }}>
    {connectivityStatus === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'}
  </div>
)}
```

- [ ] **Step 3: Build**

```bash
cd engines/web-ui && npm run build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add engines/web-ui/src/components/ActiveStepCard.tsx engines/web-ui/src/components/screens/ActiveScreen.tsx
git commit -m "ui(active-step): show Reconnecting/Connecting pill from coordinator snapshot"
```

### Task 36: Wire server picker dialog into workflow start flow

**Files:**
- Modify: `engines/web-ui/src/components/screens/HomeScreen.tsx` (or wherever workflow start is initiated)

- [ ] **Step 1: Identify the workflow start handler**

```bash
grep -n "loadAndStart\|coordinator.start\|startWorkflow" engines/web-ui/src/components/screens/HomeScreen.tsx engines/web-ui/src/manager/useWorkflowManager.ts | head -10
```

- [ ] **Step 2: Replace direct start with two-phase: resolve servers → maybe show dialog → start**

In the handler that starts a workflow, before calling coordinator.load/start:

```tsx
const { autoSelected, needsPick, missing } = manager.resolveServerSelections(workflow);
if (missing.length > 0) {
  alert(`Environment "${missing[0].envLocalId}" has no REST action servers registered.`);
  return;
}
if (needsPick.length > 0) {
  setPendingStart({ workflow, autoSelected, needsPick });
  return;
}
// All auto-selected → start immediately
coordinator.setServerSelections(autoSelected);
coordinator.start();
```

Add state and the dialog at the screen level:

```tsx
// Near the top of the screen component, with other useState declarations:
const [pendingStart, setPendingStart] = useState<{ workflow: any; autoSelected: Map<string, any>; needsPick: any[] } | null>(null);

// In the JSX return, rendered alongside the screen's other content:
{pendingStart && (
  <WorkflowStartServerPickerDialog
    picks={pendingStart.needsPick}
    onCancel={() => setPendingStart(null)}
    onResolved={(picked) => {
      const merged = new Map([...pendingStart.autoSelected, ...picked]);
      coordinator.setServerSelections(merged);
      coordinator.start();
      setPendingStart(null);
    }}
  />
)}
```

- [ ] **Step 3: Build**

```bash
cd engines/web-ui && npm run build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add engines/web-ui/src/components/screens/HomeScreen.tsx
git commit -m "ui(home): integrate server picker into workflow start flow"
```

### Task 37: Phase-5 manual verification

- [ ] **Step 1: Start the Action Container if not running**

Confirm it's up:

```bash
curl -s http://localhost:3002/trajectory/v1/health
```

Expected: `{"data":{"status":"ok",...}}`.

- [ ] **Step 2: Fix the URI in the test env file**

The user's env file has ` http://localhost:3000/trajectory/v1/` (leading space, wrong port). For the manual test, fix the env's `action_server_specifications[0].uri` to `http://localhost:3002/trajectory/v1/` and re-zip into a new `.WFmasterX`, **or** rely on the trim-and-go behavior (port still wrong — need to fix). For now, do the manual edit:

```bash
# Use the editor or a one-off node script to update the env in the WFmasterX
```

Document the corrected URI clearly in the test workflow before proceeding.

- [ ] **Step 3: Start dev server, load workflow, run it**

In `engines/web-ui`, ensure `npm run dev` is running. In browser at `http://localhost:5173/`:

1. Go to Home, load the fixed `ExportImportWorkflowTest.WFmasterX`.
2. Since the env has one REST server, no picker should appear.
3. Workflow runs, completes the first USER_INTERACTION.
4. ACTION PROXY step appears with state badge transitioning POSTED → COMPLETED.
5. Property `SomeResult` is set; next USER_INTERACTION enabled.

- [ ] **Step 4: Verify Action Container log shows the request**

In the Action Container's console output, confirm `POST /trajectory/v1/actions/.../invoke` was logged.

- [ ] **Step 5: Commit any test-data fixes**

```bash
# only if test data was modified
git status -s
```

---

# Phase 6 — KMP engine parity

Mirror the TS engine behavior in Kotlin so Android/iOS-via-KMP and any KMP-JS path can execute ACTION PROXY (polling only).

### Task 38: KMP ActionInvoker interface

**Files:**
- Create: `engines/kmp-engine/src/commonMain/kotlin/com/trajectoryruntime/engine/ActionInvoker.kt`

- [ ] **Step 1: Write the interface**

```kotlin
// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
package com.trajectoryruntime.engine

enum class ActionServerCommand { PAUSE, RESUME, HOLD, UNHOLD, STOP, ABORT, CLEAR }

data class InvokeRequestKmp(
    val stepOid: String,
    val workflowInstanceId: String,
    val serverUri: String,
    val actionOid: String,
    val inputs: Map<String, String>,
    val pollIntervalMs: Long,
)

interface ActionInvokerCallbacks {
    fun onStateChange(stepOid: String, newState: StepState, outputs: Map<String, String>?)
    fun onConnectivityChange(stepOid: String, status: String) // "ok" | "reconnecting" | "never_connected"
}

interface ActionInvoker {
    suspend fun invoke(req: InvokeRequestKmp, callbacks: ActionInvokerCallbacks): String
    suspend fun sendCommand(serverUri: String, instanceId: String, command: ActionServerCommand)
    suspend fun abort(serverUri: String, instanceId: String)
    fun release(stepOid: String)
}
```

(KMP intentionally has no `probeCapabilities` because it only polls — no capability decisions needed.)

- [ ] **Step 2: Build**

```bash
cd engines/kmp-engine && ./gradlew :compileKotlinJs 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add engines/kmp-engine/src/commonMain/kotlin/com/trajectoryruntime/engine/ActionInvoker.kt
git commit -m "kmp: define ActionInvoker interface (polling-only)"
```

### Task 39: KMP engine ACTION PROXY branch (mirror of TS)

**Files:**
- Modify: `engines/kmp-engine/src/commonMain/kotlin/com/trajectoryruntime/engine/WorkflowEngine.kt`

- [ ] **Step 1: Add fields**

In the class definition, near the top:

```kotlin
private var actionInvoker: ActionInvoker? = null
private var serverByEnvOid: Map<String, ActionServerSpecification> = emptyMap()
private var pollIntervalMs: Long = 4000
private val actionInstanceIdByStep = mutableMapOf<String, String>()
private val activeActionProxyServers = mutableMapOf<String, String>()
private val connectivityListeners = mutableListOf<(String, String) -> Unit>()
```

- [ ] **Step 2: Add setters**

```kotlin
fun setActionInvoker(invoker: ActionInvoker, servers: Map<String, ActionServerSpecification>) {
    actionInvoker = invoker
    serverByEnvOid = servers
}

fun setActionInvokerOptions(pollMs: Long) {
    pollIntervalMs = pollMs
}

fun subscribeConnectivity(fn: (String, String) -> Unit): () -> Unit {
    connectivityListeners.add(fn)
    return { connectivityListeners.remove(fn) }
}
```

- [ ] **Step 3: Add the activateActionProxy method and wire it into activateStepAfterResources**

After the WORKFLOW PROXY branch (line ~386):

```kotlin
if (target.stepType == "ACTION PROXY") {
    activateActionProxy(target)
    return
}
```

Add the method:

```kotlin
private fun activateActionProxy(target: StepInstance) {
    val invoker = actionInvoker
    if (invoker == null) {
        recordTrace(target.oid, "ERRORED", error = "No ActionInvoker configured")
        target.state = StepState.ERRORED
        workflowState = WorkflowState.ERRORED
        return
    }

    val env = findEnvForActionLocalId(target.step.local_id)
    if (env == null) {
        recordTrace(target.oid, "ERRORED",
            error = "No environment contains action local_id \"${target.step.local_id}\"")
        target.state = StepState.ERRORED
        workflowState = WorkflowState.ERRORED
        return
    }

    val server = serverByEnvOid[env.oid]
    if (server == null) {
        recordTrace(target.oid, "ERRORED",
            error = "No action server selected for environment \"${env.local_id}\"")
        target.state = StepState.ERRORED
        workflowState = WorkflowState.ERRORED
        return
    }

    // Resolve action_oid via included_actions[].local_id matching
    val included = env.included_actions ?: emptyList()
    val match = included.firstOrNull {
        (it as? JsonObject)?.get("local_id")?.jsonPrimitive?.content == target.step.local_id
    } as? JsonObject
    val actionOid = match?.get("oid")?.jsonPrimitive?.content
    if (actionOid == null) {
        recordTrace(target.oid, "ERRORED",
            error = "Environment \"${env.local_id}\" does not include action \"${target.step.local_id}\"")
        target.state = StepState.ERRORED
        workflowState = WorkflowState.ERRORED
        return
    }

    val inputs = stepParameterSnapshots[target.oid]?.inputParameters ?: emptyMap()

    recordTrace(target.oid, "STARTING")
    target.state = StepState.STARTING
    activeActionProxyServers[target.oid] = server.uri.trim()

    // Fire-and-forget invocation (KMP coroutine scope managed by host)
    GlobalScope.launch {
        try {
            val instanceId = invoker.invoke(
                InvokeRequestKmp(
                    stepOid = target.oid,
                    workflowInstanceId = instanceId,
                    serverUri = server.uri.trim(),
                    actionOid = actionOid,
                    inputs = inputs,
                    pollIntervalMs = pollIntervalMs,
                ),
                object : ActionInvokerCallbacks {
                    override fun onStateChange(stepOid: String, newState: StepState, outputs: Map<String, String>?) {
                        onExternalStateChange(stepOid, newState, outputs)
                    }
                    override fun onConnectivityChange(stepOid: String, status: String) {
                        connectivityListeners.forEach { it(stepOid, status) }
                    }
                },
            )
            actionInstanceIdByStep[target.oid] = instanceId
        } catch (e: Throwable) {
            recordTrace(target.oid, "ERRORED", error = e.message ?: "invoke failed")
            steps[target.oid]?.state = StepState.ERRORED
            workflowState = WorkflowState.ERRORED
        }
    }
}

private fun findEnvForActionLocalId(localId: String): MasterEnvironmentSpecification? {
    val envs = workflow.environment_specifications ?: return null
    return envs.firstOrNull { env ->
        (env.included_actions ?: emptyList()).any {
            (it as? JsonObject)?.get("local_id")?.jsonPrimitive?.content == localId
        }
    }
}
```

- [ ] **Step 4: Add onExternalStateChange (mirror TS)**

```kotlin
fun onExternalStateChange(
    stepOid: String,
    newState: StepState,
    outputs: Map<String, String>?,
) {
    val step = steps[stepOid] ?: return
    if (workflowState == WorkflowState.ABORTED || workflowState == WorkflowState.COMPLETED) return

    recordTrace(stepOid, newState.name)
    step.state = newState

    if (outputs != null) {
        for (spec in step.step.output_parameter_specifications ?: emptyList()) {
            val v = outputs[spec.id]
            if (v != null && spec.target != null) propertyStore.set(spec.target!!, v)
        }
    }

    when (newState) {
        StepState.COMPLETED -> {
            actionInvoker?.release(stepOid)
            actionInstanceIdByStep.remove(stepOid)
            activeActionProxyServers.remove(stepOid)
            completionQueue.addLast(stepOid)
            drainCompletionQueue()
        }
        StepState.ABORTED -> {
            actionInvoker?.release(stepOid)
            actionInstanceIdByStep.remove(stepOid)
            activeActionProxyServers.remove(stepOid)
        }
        StepState.ERRORED -> {
            actionInvoker?.release(stepOid)
            workflowState = WorkflowState.ERRORED
        }
        else -> { /* intermediate state, no terminal handling */ }
    }
}
```

- [ ] **Step 5: Forward PAUSE/RESUME/STOP and abortWorkflow**

Find existing `pauseStep`, `resumeStep`. Modify each to forward when stepType == ACTION PROXY:

```kotlin
fun pauseStep(stepOid: String) {
    val step = steps[stepOid]
    if (step != null && step.stepType == "ACTION PROXY") {
        val uri = activeActionProxyServers[stepOid] ?: return
        val id = actionInstanceIdByStep[stepOid] ?: return
        GlobalScope.launch {
            try { actionInvoker?.sendCommand(uri, id, ActionServerCommand.PAUSE) } catch (_: Throwable) {}
        }
        return
    }
    if (step != null && step.state == StepState.EXECUTING) {
        step.state = StepState.PAUSED
        recordTrace(stepOid, "PAUSED")
    } else {
        for (child in activeChildEngines.values) child.pauseStep(stepOid)
    }
}

fun resumeStep(stepOid: String) {
    val step = steps[stepOid]
    if (step != null && step.stepType == "ACTION PROXY") {
        val uri = activeActionProxyServers[stepOid] ?: return
        val id = actionInstanceIdByStep[stepOid] ?: return
        GlobalScope.launch {
            try { actionInvoker?.sendCommand(uri, id, ActionServerCommand.RESUME) } catch (_: Throwable) {}
        }
        return
    }
    if (step != null && step.state == StepState.PAUSED) {
        step.state = StepState.EXECUTING
        recordTrace(stepOid, "EXECUTING")
    } else {
        for (child in activeChildEngines.values) child.resumeStep(stepOid)
    }
}

fun stopStep(stepOid: String) {
    val step = steps[stepOid] ?: return
    if (step.stepType != "ACTION PROXY") return
    val uri = activeActionProxyServers[stepOid] ?: return
    val id = actionInstanceIdByStep[stepOid] ?: return
    GlobalScope.launch {
        try { actionInvoker?.sendCommand(uri, id, ActionServerCommand.STOP) } catch (_: Throwable) {}
    }
}

fun abortWorkflow() {
    for ((stepOid, uri) in activeActionProxyServers) {
        val id = actionInstanceIdByStep[stepOid]
        if (id != null) {
            GlobalScope.launch { try { actionInvoker?.abort(uri, id) } catch (_: Throwable) {} }
        }
        actionInvoker?.release(stepOid)
    }
    actionInstanceIdByStep.clear()
    activeActionProxyServers.clear()
    for (child in activeChildEngines.values) child.abortWorkflow()
    workflowState = WorkflowState.ABORTED
}
```

- [ ] **Step 6: Add duplicate-action-local_id check to init block**

In the `init` block at the top of the class:

```kotlin
// Validate: action local_ids unique across environments
val seen = mutableMapOf<String, String>()
for (env in workflow.environment_specifications ?: emptyList()) {
    for (a in env.included_actions ?: emptyList()) {
        val lid = (a as? JsonObject)?.get("local_id")?.jsonPrimitive?.content ?: continue
        val prior = seen[lid]
        if (prior != null) {
            throw IllegalStateException(
                "Workflow has duplicate action local_id \"$lid\" in environments \"$prior\" and \"${env.local_id}\""
            )
        }
        seen[lid] = env.local_id
    }
}
```

- [ ] **Step 7: Build KMP**

```bash
cd engines/kmp-engine && ./gradlew :compileKotlinJs 2>&1 | tail -10
```

Expected: BUILD SUCCESSFUL.

- [ ] **Step 8: Commit**

```bash
git add engines/kmp-engine/src/commonMain/kotlin/com/trajectoryruntime/engine/WorkflowEngine.kt
git commit -m "kmp(engine): implement ACTION PROXY branch, command forwarding, abortWorkflow"
```

### Task 40: KMP KtorActionInvoker (polling only)

**Files:**
- Create: `engines/kmp-engine/src/commonMain/kotlin/com/trajectoryruntime/engine/KtorActionInvoker.kt`

- [ ] **Step 1: Add ktor dependency**

In `engines/kmp-engine/build.gradle.kts`, in the `commonMain` source set dependencies:

```kotlin
implementation("io.ktor:ktor-client-core:2.3.12")
implementation("io.ktor:ktor-client-content-negotiation:2.3.12")
implementation("io.ktor:ktor-serialization-kotlinx-json:2.3.12")
```

Per-target HTTP engine (in the relevant target source sets):

```kotlin
// jvmMain (or androidMain): implementation("io.ktor:ktor-client-okhttp:2.3.12")
// iosMain:                  implementation("io.ktor:ktor-client-darwin:2.3.12")
// jsMain:                   implementation("io.ktor:ktor-client-js:2.3.12")
```

- [ ] **Step 2: Write the implementation**

```kotlin
// engines/kmp-engine/src/commonMain/kotlin/com/trajectoryruntime/engine/KtorActionInvoker.kt
// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
package com.trajectoryruntime.engine

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.*
import kotlinx.serialization.json.*

class KtorActionInvoker : ActionInvoker {
    private val client = HttpClient {
        install(ContentNegotiation) { json() }
    }
    private val active = mutableMapOf<String, Job>()

    private fun normalize(uri: String): String {
        val t = uri.trim()
        return if (t.endsWith("/")) t else "$t/"
    }

    override suspend fun invoke(req: InvokeRequestKmp, callbacks: ActionInvokerCallbacks): String {
        val base = normalize(req.serverUri)
        val invokeUrl = "${base}actions/${req.actionOid}/invoke"
        val body = buildJsonObject {
            put("workflow_instance_id", req.workflowInstanceId)
            put("input_parameters", buildJsonObject {
                for ((k, v) in req.inputs) put(k, v)
            })
        }
        val res = retryForever {
            client.post(invokeUrl) {
                contentType(ContentType.Application.Json)
                setBody(body.toString())
            }
        }
        val parsed = Json.parseToJsonElement(res.bodyAsText()).jsonObject
        val data = parsed["data"]?.jsonObject ?: error("invoke missing data")
        val instanceId = data["runtime_action_instance_id"]?.jsonPrimitive?.content
            ?: error("missing runtime_action_instance_id")
        val initial = data["status"]?.jsonPrimitive?.content
        if (initial != null) {
            callbacks.onStateChange(req.stepOid, mapStateToEnum(initial), null)
        }

        active[req.stepOid] = GlobalScope.launch {
            pollLoop(req.stepOid, base, instanceId, req.pollIntervalMs, callbacks, initial)
        }
        return instanceId
    }

    private suspend fun pollLoop(
        stepOid: String,
        base: String,
        instanceId: String,
        intervalMs: Long,
        callbacks: ActionInvokerCallbacks,
        initialStatus: String?,
    ) {
        var lastStatus = initialStatus
        var consecutiveFailures = 0
        var connectivity = "ok"
        while (currentCoroutineContext().isActive) {
            delay(intervalMs)
            try {
                val r = client.get("${base}instances/$instanceId")
                if (r.status.value == 404) {
                    callbacks.onStateChange(stepOid, StepState.ABORTED, null)
                    release(stepOid)
                    return
                }
                if (r.status.isSuccess()) {
                    if (connectivity != "ok") {
                        connectivity = "ok"
                        callbacks.onConnectivityChange(stepOid, "ok")
                    }
                    consecutiveFailures = 0
                    val txt = r.bodyAsText()
                    val data = Json.parseToJsonElement(txt).jsonObject["data"]?.jsonObject ?: continue
                    val status = data["status"]?.jsonPrimitive?.content ?: continue
                    val outputs = data["output_parameters"]?.jsonObject?.entries
                        ?.associate { (k, v) -> k to v.jsonPrimitive.content }
                    if (status != lastStatus) {
                        lastStatus = status
                        callbacks.onStateChange(stepOid, mapStateToEnum(status), outputs)
                    }
                    if (status in setOf("COMPLETED", "ABORTED", "ERRORED")) {
                        release(stepOid)
                        return
                    }
                } else if (r.status.value >= 500) {
                    consecutiveFailures++
                    if (consecutiveFailures >= 3 && connectivity == "ok") {
                        connectivity = "reconnecting"
                        callbacks.onConnectivityChange(stepOid, "reconnecting")
                    }
                }
            } catch (_: Throwable) {
                consecutiveFailures++
                if (consecutiveFailures >= 3 && connectivity == "ok") {
                    connectivity = "reconnecting"
                    callbacks.onConnectivityChange(stepOid, "reconnecting")
                }
            }
        }
    }

    private fun mapStateToEnum(s: String): StepState = when (s) {
        "STARTING" -> StepState.STARTING
        "EXECUTING" -> StepState.EXECUTING
        "COMPLETING" -> StepState.COMPLETING
        "COMPLETED" -> StepState.COMPLETED
        "POSTED" -> StepState.POSTED
        "RECEIVED" -> StepState.RECEIVED
        "IN_PROGRESS" -> StepState.IN_PROGRESS
        "HELD" -> StepState.HELD
        "PAUSED" -> StepState.PAUSED
        "ABORTED", "STOPPED" -> StepState.ABORTED
        "ERRORED" -> StepState.ERRORED
        else -> StepState.EXECUTING
    }

    override suspend fun sendCommand(serverUri: String, instanceId: String, command: ActionServerCommand) {
        val url = "${normalize(serverUri)}instances/$instanceId/command"
        try {
            val res = client.post(url) {
                contentType(ContentType.Application.Json)
                setBody(buildJsonObject { put("command", command.name) }.toString())
            }
            if (res.status.value == 409) return // silent-ignore
        } catch (_: Throwable) {
            // best-effort
        }
    }

    override suspend fun abort(serverUri: String, instanceId: String) {
        try {
            client.delete("${normalize(serverUri)}instances/$instanceId")
        } catch (_: Throwable) {
            // best-effort
        }
    }

    override fun release(stepOid: String) {
        active[stepOid]?.cancel()
        active.remove(stepOid)
    }

    private suspend fun <T> retryForever(block: suspend () -> T): T {
        val delays = longArrayOf(100, 200, 400, 800, 1600, 3200, 6400, 12800, 25600, 30000)
        var attempt = 0
        while (true) {
            try { return block() } catch (_: Throwable) { /* fall through */ }
            delay(delays[minOf(attempt, delays.lastIndex)])
            attempt++
        }
    }
}
```

- [ ] **Step 3: Build KMP**

```bash
cd engines/kmp-engine && ./gradlew :compileKotlinJs 2>&1 | tail -10
```

Expected: BUILD SUCCESSFUL.

- [ ] **Step 4: Commit**

```bash
git add engines/kmp-engine/build.gradle.kts engines/kmp-engine/src/commonMain/kotlin/com/trajectoryruntime/engine/KtorActionInvoker.kt
git commit -m "kmp: add KtorActionInvoker (polling-only) using ktor multi-platform client"
```

### Task 41: KMP integration smoke test (vitest)

**Files:**
- Create: `engines/kmp-engine/src/jsTest/kotlin/com/trajectoryruntime/engine/ActionProxyKmpTest.kt`

- [ ] **Step 1: Write the smoke test**

```kotlin
// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
package com.trajectoryruntime.engine

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json

class ActionProxyKmpTest {
    @Test fun engineThrowsOnDuplicateActionLocalId() {
        val wfJson = """
        {
          "local_id":"wf","oid":"o","version":"1.0","last_modified_date":"2026-05-23",
          "steps":[{"local_id":"s","oid":"so","version":"1.0","last_modified_date":"2026-05-23","step_type":"START"}],
          "connections":[],
          "environment_specifications":[
            {"local_id":"e1","oid":"e1o","version":"1.0","last_modified_date":"2026-05-23",
             "included_actions":[{"local_id":"A","oid":"a1"}]},
            {"local_id":"e2","oid":"e2o","version":"1.0","last_modified_date":"2026-05-23",
             "included_actions":[{"local_id":"A","oid":"a2"}]}
          ]
        }
        """.trimIndent()
        val wf = Json { ignoreUnknownKeys = true }.decodeFromString<MasterWorkflowSpecification>(wfJson)
        try {
            WorkflowEngine(wf)
            error("expected exception")
        } catch (e: IllegalStateException) {
            assertEquals(true, e.message?.contains("duplicate action local_id \"A\""))
        }
    }
}
```

- [ ] **Step 2: Run KMP tests**

```bash
cd engines/kmp-engine && ./gradlew :jsTest 2>&1 | tail -10
```

Expected: BUILD SUCCESSFUL, the test passes.

- [ ] **Step 3: Commit**

```bash
git add engines/kmp-engine/src/jsTest/kotlin/com/trajectoryruntime/engine/ActionProxyKmpTest.kt
git commit -m "kmp(test): verify duplicate action local_id is rejected at engine construction"
```

---

# Phase 7 — End-to-end manual smoke test

The TS unit tests cover the engine + invoker. This phase exercises the real wire format against the running Action Container.

### Task 42: Test fixture script

**Files:**
- Create: `engines/web-ui/test-action-proxy-integration.mjs`

- [ ] **Step 1: Write the integration runner**

```js
// engines/web-ui/test-action-proxy-integration.mjs
// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
//
// Manual smoke test. Run with:
//   node test-action-proxy-integration.mjs
//
// Requires: a running Action Container at ACTION_CONTAINER_URL (defaults
// to http://localhost:3002/trajectory/v1/) with the ExportImportLibrary
// action loaded.

import { readFileSync } from 'node:fs';
import { HttpActionInvoker } from '../web/dist/http-action-invoker.js';

const BASE = process.env.ACTION_CONTAINER_URL ?? 'http://localhost:3002/trajectory/v1/';

const env = JSON.parse(readFileSync(
  'C:/Users/dnbra/AppData/Local/Temp/wfmasterx_extract/environments/ExportImportEnvLibrary.WFenvir',
  'utf-8',
));
const action = env.environment_specifications[0].included_actions[0];
console.log('Testing action:', action.local_id, 'oid:', action.oid);

const invoker = new HttpActionInvoker();
const caps = await invoker.probeCapabilities(BASE);
console.log('Capabilities:', caps);

let lastState = '';
let receivedOutputs = null;

const instanceId = await invoker.invoke({
  stepOid: 'step-test',
  workflow_instance_id: 'wf-test-' + Date.now(),
  serverUri: BASE,
  action_oid: action.oid,
  inputs: { expected_count: '22' },
  mode: 'poll-only',
  pollIntervalMs: 2000,
}, {
  onStateChange: (oid, state, outputs) => {
    console.log(`[state] ${oid} → ${state}`, outputs ?? '');
    lastState = state;
    if (outputs) receivedOutputs = outputs;
  },
  onConnectivityChange: (oid, status) => {
    console.log(`[conn] ${oid} → ${status}`);
  },
});

console.log('Instance:', instanceId);

// Wait for terminal state
const TERMINAL = ['COMPLETED', 'ABORTED', 'ERRORED'];
while (!TERMINAL.includes(lastState)) {
  await new Promise(r => setTimeout(r, 500));
}

console.log('Final state:', lastState, 'Outputs:', receivedOutputs);
invoker.release('step-test');
process.exit(lastState === 'COMPLETED' ? 0 : 1);
```

- [ ] **Step 2: Build the engine package so `dist/` exists**

```bash
cd engines/web && npm run build
```

- [ ] **Step 3: Run the smoke test**

```bash
cd engines/web-ui && node test-action-proxy-integration.mjs
```

Expected output (timing/values may vary):

```
Testing action: ExportImportAction1 oid: e7ae32b8-afb5-4a9b-96db-20260b126105
Capabilities: { sse_supported: true, actions: Map(...) }
Instance: rai-xxxxx
[state] step-test → POSTED
[state] step-test → COMPLETED { received_count: '22', status: '...' }
Final state: COMPLETED Outputs: { ... }
```

Exit code: 0.

- [ ] **Step 4: Inspect Action Container log**

Confirm the Action Container console shows:

```
POST /trajectory/v1/actions/.../invoke → 201
GET  /trajectory/v1/instances/rai-xxxxx → 200
```

- [ ] **Step 5: Commit**

```bash
git add engines/web-ui/test-action-proxy-integration.mjs
git commit -m "test: add manual integration smoke test for ACTION PROXY against real container"
```

### Task 43: Full workflow run from web-ui

- [ ] **Step 1: Ensure dev server + Action Container are running**

```bash
curl -s http://localhost:3002/trajectory/v1/health
# In another terminal: cd engines/web-ui && npm run dev
```

- [ ] **Step 2: Update the env file URI in your test workflow**

The shipped test workflow has the URL ` http://localhost:3000/trajectory/v1/` (leading space, wrong port). Fix to `http://localhost:3002/trajectory/v1/` and re-zip:

```bash
# Use a one-off node script or manually unzip/edit/zip
# Resulting file: ExportImportWorkflowTest.WFmasterX with corrected URI
```

- [ ] **Step 3: Load and run the workflow**

At `http://localhost:5173/`:
1. Home → load the fixed `.WFmasterX`.
2. Enter `22` (or another number) for ValueToSend.
3. Submit.
4. Observe ACTION PROXY step appears with state badge (POSTED → COMPLETED).
5. Confirm the property `SomeResult` is populated (visible in the next user-interaction step).
6. Workflow completes.

- [ ] **Step 4: Verify in Action Container log**

Confirm a POST → invoke and 200 polls (or SSE events if SSE-preferred mode).

- [ ] **Step 5: Test ABANDON path**

1. Load workflow, start, hit the ACTION PROXY step.
2. Before it completes, click ABANDON in the state command menu.
3. Confirm Action Container log shows `DELETE /instances/rai-...`.
4. Workflow state is ABORTED.

- [ ] **Step 6: Test STOP path**

1. Load workflow, start, hit the ACTION PROXY step.
2. Click STOP (newly added).
3. Confirm Action Container log shows `POST /instances/rai-.../command` with `command: STOP`.

- [ ] **Step 7: Test poll-only mode**

1. Settings → switch to "Always poll" + 2-second interval.
2. Reload page, re-run the workflow.
3. Confirm Action Container shows polling GETs at ~2s cadence.

- [ ] **Step 8: Final commit (any docs updates made)**

```bash
git status
# commit any changes
```

---

# Final verification

- [ ] **All TS tests pass**

```bash
cd engines/web && npm run build && npm test 2>&1 | tail -10
```

- [ ] **All KMP tests pass**

```bash
cd engines/kmp-engine && ./gradlew :jsTest 2>&1 | tail -10
```

- [ ] **Both UIs build**

```bash
cd engines/web && npm run build
cd ../web-ui && npm run build
```

- [ ] **Spec requirements coverage** — verify each section of the design doc is touched by at least one task:

| Spec § | Implementing tasks |
|---|---|
| §4 architecture | Tasks 7–10 (interfaces, types), 11–17 (engine wiring) |
| §5 components | Tasks 7, 8, 9, 19, 28–30 |
| §6 data flow + state mapping | Tasks 12, 13 (engine), 21, 22, 23 (invoker) |
| §7 server selection | Tasks 31, 36 (resolveServerSelections + dialog wiring) |
| §8 capabilities probe | Tasks 20, 28 |
| §9 SSE vs polling + settings | Tasks 23, 32, 33 |
| §10 command forwarding | Tasks 14, 15, 16 (engine), 25 (invoker), 34 (UI) |
| §11 retry & error | Tasks 24 (invoke retry), 26 (connectivity), 35 (UI badge) |
| §12 step lifecycle | Tasks 12, 13 |
| §13 schema/validator changes | Tasks 1–5 |
| §14 backward compatibility | Task 6 (verifies test workflow still validates) |
| §15 testing strategy | Tasks 9 (mock), 12–17 (engine tests), 19–26 (invoker tests), 41 (KMP), 42–43 (manual) |
