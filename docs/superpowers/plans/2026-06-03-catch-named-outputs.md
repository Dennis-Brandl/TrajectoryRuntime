# CATCH Default Named Outputs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every CATCH step four ready-made, friendly-named outputs — `Message`, `Reason`, `Step`, `StepID` — that the runtime recognizes, replacing the old snake_case ids.

**Architecture:** The Editor exports an output's `name` as the package `id`; both engines key `KNOWN_CATCH_FIELDS` on that `id`. So: (Phase A) rename the four recognized keys in both engines + fixtures to the friendly names; (Phase B) seed the four named outputs on new CATCH nodes and lock their names in the Editor.

**Tech Stack:** TS web engine (`node:test`, build via `tsc` to `dist/`), Kotlin kmp-engine (`gradlew jvmTest`), shared JSON conformance fixtures; React/TS Editor (Vitest).

**Spec:** `TrajectoryRuntime/docs/superpowers/specs/2026-06-03-catch-named-outputs-design.md`

**Delivery:** two PRs — **Phase A first** (`TrajectoryRuntime`), then **Phase B** (`TrajectoryEditor`). Branch each repo before starting (do not work on `main`).

**Field mapping (canonical):** `Message`→`c.error_message ?? ''`, `Reason`→`c.trigger_reason`, `Step`→`c.trigger_step_name`, `StepID`→`c.trigger_step_oid`. The internal `CatchContext` field names and `engine.ts` population are **unchanged** — only the public output `id` keys change.

**Breaking change (intended):** old ids (`trigger_reason`/`error_message`/`trigger_step`/`trigger_step_oid`) are no longer recognized.

---

## Phase A — Runtime (`TrajectoryRuntime`, both engines + fixtures)

Work from `C:\Trajectory\TrajectoryRuntime`. Branch: `feat/catch-named-outputs`.
Build/test commands:
- TS unit: `cd engines/web && npm run build && npm test`
- TS single file: `cd engines/web && npm run build && node --test dist/<name>.test.js`
- TS conformance: `cd engines/web && npm run build && npm run conformance`
- Kotlin: `cd engines/kmp-engine && ./gradlew jvmTest` (Windows: `.\gradlew.bat jvmTest`)

### Task A1: TS engine — rename `KNOWN_CATCH_FIELDS` keys

**Files:**
- Modify: `engines/web/src/step-handlers.ts:197-202`
- Modify (test): `engines/web/src/try-catch-handlers.test.ts:18-33`

- [ ] **Step 1: Update the test to the four friendly names + assert all four**

Replace the `it('writes trigger info ...')` block (lines ~18-33) of `engines/web/src/try-catch-handlers.test.ts` with:

```ts
  it('writes trigger info to declared output_parameter_specifications targets', () => {
    const store = new PropertyStore();
    store.set('FailureContext.Mode', '');
    store.set('FailureContext.Message', '');
    store.set('FailureContext.Step', '');
    store.set('FailureContext.StepID', '');
    const step = {
      oid: 'c1', step_type: 'CATCH', local_id: 'Catch', catch_id: 'C1',
      output_parameter_specifications: [
        { id: 'Reason', target: 'FailureContext.Mode' },
        { id: 'Message', target: 'FailureContext.Message' },
        { id: 'Step', target: 'FailureContext.Step' },
        { id: 'StepID', target: 'FailureContext.StepID' },
      ],
    } as unknown as MasterWorkflowStep;
    const ctx: CatchContext = {
      catch_oid: 'c1', trigger_step_oid: 'a1', trigger_step_name: 'Heat Oven',
      trigger_reason: 'ERROR', error_message: 'thermocouple failure', activated_at: '2026-05-31T12:00:00Z',
    };
    activateCatchStep(step, ctx, store);
    assert.equal(store.get('FailureContext.Mode'), 'ERROR');
    assert.equal(store.get('FailureContext.Message'), 'thermocouple failure');
    assert.equal(store.get('FailureContext.Step'), 'Heat Oven');
    assert.equal(store.get('FailureContext.StepID'), 'a1');
  });
```

(Leave the `isAutoCompleting` and `ignores unknown output ids` tests unchanged — note `not_a_field` is still unknown after the rename.)

- [ ] **Step 2: Run the test — expect FAIL**

Run: `cd engines/web && npm run build && node --test dist/try-catch-handlers.test.js`
Expected: FAIL — `FailureContext.Mode` etc. stay `''` because the map still keys on `trigger_reason`/`error_message`, not `Reason`/`Message`.

- [ ] **Step 3: Rename the map keys**

In `engines/web/src/step-handlers.ts`, replace lines 197-202:

```ts
const KNOWN_CATCH_FIELDS: Record<string, (c: CatchContext) => string> = {
  Message: c => c.error_message ?? '',
  Reason: c => c.trigger_reason,
  Step: c => c.trigger_step_name,
  StepID: c => c.trigger_step_oid,
};
```

- [ ] **Step 4: Run the test — expect PASS**

Run: `cd engines/web && npm run build && node --test dist/try-catch-handlers.test.js`
Expected: PASS (all 3 tests).

- [ ] **Step 5: Commit**

```bash
git add engines/web/src/step-handlers.ts engines/web/src/try-catch-handlers.test.ts
git commit -m "feat(engine-web): CATCH outputs keyed by Message/Reason/Step/StepID"
```
(Append the trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` to every commit in this plan.)

---

### Task A2: TS engine — update inline engine-test workflows

The engine-level tests build CATCH workflows inline with the old ids; update them so they keep exercising trigger-info writing under the new keys.

**Files:** Modify `engines/web/src/try-catch-engine.test.ts:27-29` and `:86`

- [ ] **Step 1: Update the id strings**

Replace lines 27-30 (the default `catchOutputs`):

```ts
          output_parameter_specifications: opts.catchOutputs ?? [
            { id: 'Reason', target: 'FailureContext.Mode' },
            { id: 'Message', target: 'FailureContext.Message' },
          ] }),
```

Replace line 86 (`catchOutputs` override in the RESTART KEEP test):

```ts
      catchOutputs: [{ id: 'Reason', target: 'FailureContext.Mode' }],
```

- [ ] **Step 2: Run the engine test suite — expect PASS**

Run: `cd engines/web && npm run build && node --test dist/try-catch-engine.test.js`
Expected: PASS — the assertions on `FailureContext.Mode` / `FailureContext.Message` now resolve via the renamed keys.

- [ ] **Step 3: Commit**

```bash
git add engines/web/src/try-catch-engine.test.ts
git commit -m "test(engine-web): use new CATCH output names in engine tests"
```

---

### Task A3: Conformance fixtures — rename + add full-coverage fixture

**Files:**
- Modify: `spec/conformance/execution/exec-try-catch-001-error-to-abandon.json`, `-002-timeout-to-retry.json`, `-003-abort-to-goto.json`, `-004-restart-keep.json`, `-005-restart-clean.json` (each has one `{ "id": "trigger_reason", "target": "FailureContext.Mode" }`)
- Create: `spec/conformance/execution/exec-try-catch-007-all-trigger-fields.json`
- (006 has no CATCH — leave it.)

- [ ] **Step 1: Rename `trigger_reason` → `Reason` in fixtures 001–005**

In each of the five files, change the CATCH step's `output_parameter_specifications` entry from:
`{ "id": "trigger_reason", "target": "FailureContext.Mode" }`
to:
`{ "id": "Reason", "target": "FailureContext.Mode" }`
(Only that `"id"` value changes; targets and everything else stay.)

- [ ] **Step 2: Create the all-fields fixture**

Create `spec/conformance/execution/exec-try-catch-007-all-trigger-fields.json`:

```json
{
  "test_id": "exec-try-catch-007",
  "name": "CATCH writes all four trigger fields (Message/Reason/Step/StepID) to targets",
  "category": "execution",
  "tags": ["try-catch", "outputs"],
  "workflow": {
    "local_id": "wf",
    "oid": "wf-1",
    "version": "1.0.0",
    "last_modified_date": "2026-06-03T12:00:00.000Z",
    "schemaVersion": "4.0",
    "value_property_specifications": [
      { "name": "FailureContext", "entries": [
        { "name": "Mode", "value": "" },
        { "name": "Message", "value": "" },
        { "name": "Step", "value": "" },
        { "name": "StepID", "value": "" }
      ] }
    ],
    "environment_specifications": [
      {
        "local_id": "env", "oid": "env-1", "version": "1.0.0", "last_modified_date": "2026-06-03T12:00:00.000Z",
        "included_actions": [{ "action_oid": "act-1", "action_name": "DoThing", "action_library": "lib-1" }]
      }
    ],
    "steps": [
      { "local_id": "Start", "oid": "s1", "version": "1.0.0", "last_modified_date": "2026-06-03T12:00:00.000Z", "step_type": "START" },
      { "local_id": "Action", "oid": "s2", "version": "1.0.0", "last_modified_date": "2026-06-03T12:00:00.000Z", "step_type": "ACTION PROXY", "action_proxy_config": { "action_oid": "act-1", "environment_oid": "env-1" }, "try_specifications": [{ "mode": "ERROR", "catch_id": "C1" }] },
      { "local_id": "End", "oid": "s3", "version": "1.0.0", "last_modified_date": "2026-06-03T12:00:00.000Z", "step_type": "END" },
      { "local_id": "Catch", "oid": "c1", "version": "1.0.0", "last_modified_date": "2026-06-03T12:00:00.000Z", "step_type": "CATCH", "catch_id": "C1", "output_parameter_specifications": [
        { "id": "Reason", "target": "FailureContext.Mode" },
        { "id": "Message", "target": "FailureContext.Message" },
        { "id": "Step", "target": "FailureContext.Step" },
        { "id": "StepID", "target": "FailureContext.StepID" }
      ] },
      { "local_id": "Ret", "oid": "r1", "version": "1.0.0", "last_modified_date": "2026-06-03T12:00:00.000Z", "step_type": "RETURN", "return_config": { "command": "ABANDON" } }
    ],
    "connections": [
      { "from_step_id": "s1", "to_step_id": "s2" },
      { "from_step_id": "s2", "to_step_id": "s3" },
      { "from_step_id": "c1", "to_step_id": "r1" }
    ]
  },
  "user_actions": [
    { "step_oid": "s2", "action": "fail", "failure_mode": "ERROR", "error": "thermocouple failure" }
  ],
  "expected": {
    "valid": true,
    "workflow_state": "ABORTED",
    "final_properties": {
      "FailureContext.Mode": "ERROR",
      "FailureContext.Message": "thermocouple failure",
      "FailureContext.Step": "Action",
      "FailureContext.StepID": "s2"
    }
  }
}
```

- [ ] **Step 3: Run TS conformance — expect PASS**

Run: `cd engines/web && npm run build && npm run conformance`
Expected: PASS, including the 6 `exec-try-catch-*` fixtures and the new `exec-try-catch-007`. (If the runner prints per-fixture results, confirm 007 passes with all four `FailureContext.*` properties.)

- [ ] **Step 4: Commit**

```bash
git add spec/conformance/execution/exec-try-catch-001-error-to-abandon.json spec/conformance/execution/exec-try-catch-002-timeout-to-retry.json spec/conformance/execution/exec-try-catch-003-abort-to-goto.json spec/conformance/execution/exec-try-catch-004-restart-keep.json spec/conformance/execution/exec-try-catch-005-restart-clean.json spec/conformance/execution/exec-try-catch-007-all-trigger-fields.json
git commit -m "test(conformance): CATCH outputs use Message/Reason/Step/StepID + full-field fixture"
```

---

### Task A4: Kotlin engine — rename keys + update tests

**Files:**
- Modify: `engines/kmp-engine/src/commonMain/kotlin/com/trajectoryruntime/engine/StepHandlers.kt:139-151`
- Modify: `engines/kmp-engine/src/jvmTest/kotlin/com/trajectoryruntime/engine/TryCatchHandlersTest.kt`
- Modify: `engines/kmp-engine/src/jvmTest/kotlin/com/trajectoryruntime/engine/TryCatchEngineTest.kt:16`

- [ ] **Step 1: Update `TryCatchHandlersTest.kt` to the four names + assert all four**

Replace the `activateCatchStep ...` test body with:

```kotlin
  @Test fun `activateCatchStep writes trigger info to declared targets`() {
    val store = PropertyStore()
    store.set("FailureContext.Mode", "")
    store.set("FailureContext.Message", "")
    store.set("FailureContext.Step", "")
    store.set("FailureContext.StepID", "")
    val step = MasterWorkflowStep(
      local_id = "Catch", oid = "c1", version = "1.0.0", last_modified_date = "d", step_type = "CATCH", catch_id = "C1",
      output_parameter_specifications = listOf(
        OutputParameterSpecification(id = "Reason", target = "FailureContext.Mode"),
        OutputParameterSpecification(id = "Message", target = "FailureContext.Message"),
        OutputParameterSpecification(id = "Step", target = "FailureContext.Step"),
        OutputParameterSpecification(id = "StepID", target = "FailureContext.StepID"),
      ),
    )
    val ctx = CatchContext("c1", "a1", "Heat Oven", "ERROR", "thermocouple failure", "d")
    activateCatchStep(step, ctx, store)
    assertEquals("ERROR", store.get("FailureContext.Mode"))
    assertEquals("thermocouple failure", store.get("FailureContext.Message"))
    assertEquals("Heat Oven", store.get("FailureContext.Step"))
    assertEquals("a1", store.get("FailureContext.StepID"))
  }
```

- [ ] **Step 2: Update `TryCatchEngineTest.kt` default catch outputs (line 16)**

Change the `catchOutputs` default parameter from:
`catchOutputs: String = """[{"id":"trigger_reason","target":"FailureContext.Mode"}]""",`
to:
`catchOutputs: String = """[{"id":"Reason","target":"FailureContext.Mode"}]""",`

- [ ] **Step 3: Run Kotlin tests — expect FAIL first, then implement**

Run: `cd engines/kmp-engine && ./gradlew jvmTest --tests "*TryCatchHandlersTest*"` (Windows: `.\gradlew.bat jvmTest --tests "*TryCatchHandlersTest*"`)
Expected: FAIL — the `fields` map still keys on the old names.

- [ ] **Step 4: Rename the keys in `StepHandlers.kt`**

Replace the `fields` map (lines 141-146) with:

```kotlin
    val fields: Map<String, (CatchContext) -> String> = mapOf(
        "Message" to { c -> c.error_message ?: "" },
        "Reason" to { c -> c.trigger_reason },
        "Step" to { c -> c.trigger_step_name },
        "StepID" to { c -> c.trigger_step_oid },
    )
```

- [ ] **Step 5: Run full Kotlin JVM tests — expect PASS**

Run: `cd engines/kmp-engine && ./gradlew jvmTest` (Windows: `.\gradlew.bat jvmTest`)
Expected: PASS — `TryCatchHandlersTest`, `TryCatchEngineTest`, and the `ConformanceRunner` (which auto-discovers the shared `../../spec/conformance` dir, so it runs the updated 001–005 and the new 007).

- [ ] **Step 6: Commit**

```bash
git add engines/kmp-engine/src/commonMain/kotlin/com/trajectoryruntime/engine/StepHandlers.kt engines/kmp-engine/src/jvmTest/kotlin/com/trajectoryruntime/engine/TryCatchHandlersTest.kt engines/kmp-engine/src/jvmTest/kotlin/com/trajectoryruntime/engine/TryCatchEngineTest.kt
git commit -m "feat(engine-kmp): CATCH outputs keyed by Message/Reason/Step/StepID (parity)"
```

---

### Task A5: Add the design doc to the PR

**Files:** already created `docs/superpowers/specs/2026-06-03-catch-named-outputs-design.md` and this plan.

- [ ] **Step 1: Commit the design + plan docs**

```bash
git add docs/superpowers/specs/2026-06-03-catch-named-outputs-design.md docs/superpowers/plans/2026-06-03-catch-named-outputs.md
git commit -m "docs(catch-outputs): design + plan for default named CATCH outputs"
```

- [ ] **Step 2: Final Phase-A verification**

Run both engines' full suites:
- `cd engines/web && npm run build && npm test && npm run conformance`
- `cd engines/kmp-engine && ./gradlew jvmTest`
Expected: all green in both engines. Phase A done → open the `TrajectoryRuntime` PR.

> **Note:** the canonical TRY/CATCH spec `Trajectory/docs/superpowers/specs/2026-05-31-try-catch-return-design.md` §1.2 lives in the umbrella super-repo (a third repo). The 2026-06-03 design doc records the amendment; updating the umbrella file is a separate follow-up, out of scope for these two PRs.

---

## Phase B — Editor (`TrajectoryEditor`)

Work from `C:\Trajectory\TrajectoryEditor`. Branch: `feat/catch-default-outputs`. Test: `npm run test:run -- <path>`. **Do not merge Phase B until Phase A is merged** (the Editor will emit names the runtime must already recognize).

### Task B1: `defaultCatchOutputs()` helper

**Files:**
- Create: `src/lib/catch-outputs.ts`
- Test: `src/lib/__tests__/catch-outputs.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/catch-outputs.test.ts`:

```ts
// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.

import { describe, it, expect } from 'vitest'
import { defaultCatchOutputs, CATCH_OUTPUT_NAMES } from '../catch-outputs'

describe('defaultCatchOutputs', () => {
  it('returns the four canonical CATCH outputs in order with unique ids', () => {
    const outs = defaultCatchOutputs()
    expect(outs.map((o) => o.name)).toEqual(['Message', 'Reason', 'Step', 'StepID'])
    expect(CATCH_OUTPUT_NAMES).toEqual(['Message', 'Reason', 'Step', 'StepID'])
    expect(new Set(outs.map((o) => o.id)).size).toBe(4)
    expect(outs.every((o) => typeof o.id === 'string' && o.id.length > 0)).toBe(true)
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm run test:run -- src/lib/__tests__/catch-outputs.test.ts`
Expected: FAIL — cannot resolve `../catch-outputs`.

- [ ] **Step 3: Create the helper**

Create `src/lib/catch-outputs.ts`:

```ts
// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.

import type { ParameterSpec } from '@/types/nodes'
import { generateOID, WORKER_INTERNAL } from '@/lib/snowflake'

/** The four runtime-supplied CATCH trigger-info outputs (order shown in the panel). */
export const CATCH_OUTPUT_NAMES = ['Message', 'Reason', 'Step', 'StepID'] as const

const DESCRIPTIONS: Record<string, string> = {
  Message: 'Error message from the failed action (empty if none)',
  Reason: 'Failure mode that fired: ERROR, ABORT, or TIMEOUT',
  Step: 'Label of the step whose TRY fired',
  StepID: 'OID of the step whose TRY fired',
}

/** Build the four default outputs for a freshly-created CATCH node. */
export function defaultCatchOutputs(): ParameterSpec[] {
  return CATCH_OUTPUT_NAMES.map((name) => ({
    id: generateOID(WORKER_INTERNAL),
    name,
    description: DESCRIPTIONS[name],
  }))
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npm run test:run -- src/lib/__tests__/catch-outputs.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/catch-outputs.ts src/lib/__tests__/catch-outputs.test.ts
git commit -m "feat(properties): defaultCatchOutputs helper (Message/Reason/Step/StepID)"
```

---

### Task B2: Seed defaults in `flowStore.addNode`

**Files:**
- Modify: `src/stores/flowStore.ts:295-298` (the `addNode` action) + imports
- Test: `src/stores/__tests__/addNode-catch.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/stores/__tests__/addNode-catch.test.ts`:

```ts
// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.

// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from 'vitest'
import { useFlowStore } from '@/stores/flowStore'
import type { WorkflowNode } from '@/types/nodes'

beforeEach(() => {
  useFlowStore.setState({ nodes: [], edges: [] })
})

function add(node: Partial<WorkflowNode> & { id: string; type: string }) {
  useFlowStore.getState().addNode({ position: { x: 0, y: 0 }, data: { label: 'X', stepType: node.type }, ...node } as WorkflowNode)
}

describe('addNode CATCH default outputs', () => {
  it('seeds the four named outputs on a new catch node', () => {
    add({ id: 'c1', type: 'catch' })
    const n = useFlowStore.getState().nodes.find((x) => x.id === 'c1')!
    const outs = (n.data as { outputs?: { name: string }[] }).outputs ?? []
    expect(outs.map((o) => o.name)).toEqual(['Message', 'Reason', 'Step', 'StepID'])
  })

  it('does not add outputs to non-catch nodes', () => {
    add({ id: 's1', type: 'actionProxyWait' })
    const n = useFlowStore.getState().nodes.find((x) => x.id === 's1')!
    expect((n.data as { outputs?: unknown[] }).outputs ?? []).toEqual([])
  })

  it('does not overwrite outputs a catch node already has', () => {
    add({ id: 'c2', type: 'catch', data: { label: 'C', stepType: 'catch', outputs: [{ id: 'x', name: 'Custom' }] } } as never)
    const n = useFlowStore.getState().nodes.find((x) => x.id === 'c2')!
    expect((n.data as { outputs: { name: string }[] }).outputs.map((o) => o.name)).toEqual(['Custom'])
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm run test:run -- src/stores/__tests__/addNode-catch.test.ts`
Expected: FAIL — the first test gets `[]` (no seeding yet).

- [ ] **Step 3: Implement seeding in `addNode`**

In `src/stores/flowStore.ts`, add the import near the other lib imports:

```ts
import { defaultCatchOutputs } from '@/lib/catch-outputs'
```

Replace the `addNode` action (lines 295-298) with:

```ts
        addNode: (node) => {
          // Seed the four runtime-supplied trigger-info outputs on a fresh CATCH
          // (covers click-to-add and both drop paths, which all route through here).
          let toAdd = node
          if (
            node.type === 'catch' &&
            !((node.data as { outputs?: unknown[] }).outputs?.length)
          ) {
            toAdd = { ...node, data: { ...node.data, outputs: defaultCatchOutputs() } }
          }
          set({ nodes: [...get().nodes, toAdd] })
          writeThroughToSpec()
        },
```

- [ ] **Step 4: Run — expect PASS**

Run: `npm run test:run -- src/stores/__tests__/addNode-catch.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/stores/flowStore.ts src/stores/__tests__/addNode-catch.test.ts
git commit -m "feat(canvas): seed default named outputs on new CATCH nodes"
```

---

### Task B3: `OutputsEditor` — read-only names + add-from-list

**Files:**
- Modify: `src/components/properties/OutputsEditor.tsx`
- Test: `src/components/properties/__tests__/OutputsEditor.lockedNames.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/properties/__tests__/OutputsEditor.lockedNames.test.tsx`:

```tsx
// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.

// @vitest-environment jsdom

import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { OutputsEditor } from '../OutputsEditor'
import type { ParameterSpec } from '@/types/nodes'

const four: ParameterSpec[] = [
  { id: '1', name: 'Message' },
  { id: '2', name: 'Reason' },
  { id: '3', name: 'Step' },
  { id: '4', name: 'StepID' },
]

describe('OutputsEditor readOnlyNames + addableNames', () => {
  it('renders names as read-only (no editable name input) when readOnlyNames is set', () => {
    render(<OutputsEditor outputs={four} onChange={vi.fn()} readOnlyNames />)
    // The name is shown as static text, not as an input with that value.
    expect(screen.getByText('Message')).toBeTruthy()
    const nameInputs = screen.queryAllByDisplayValue('Message')
    expect(nameInputs.length).toBe(0)
  })

  it('the add button inserts the next missing canonical name', () => {
    const onChange = vi.fn()
    render(
      <OutputsEditor
        outputs={[{ id: '2', name: 'Reason' }]}
        onChange={onChange}
        readOnlyNames
        addableNames={['Message', 'Reason', 'Step', 'StepID']}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Add output parameter/i }))
    const next = onChange.mock.calls[0][0] as ParameterSpec[]
    expect(next.map((o) => o.name)).toEqual(['Reason', 'Message'])
  })

  it('disables add when all addable names are present', () => {
    render(<OutputsEditor outputs={four} onChange={vi.fn()} readOnlyNames addableNames={['Message', 'Reason', 'Step', 'StepID']} />)
    const btn = screen.getByRole('button', { name: /Add output parameter/i }) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm run test:run -- src/components/properties/__tests__/OutputsEditor.lockedNames.test.tsx`
Expected: FAIL — `readOnlyNames`/`addableNames` props don't exist; names still render as inputs and add inserts a blank.

- [ ] **Step 3: Implement the two props**

In `src/components/properties/OutputsEditor.tsx`:

Add to `OutputsEditorProps` (after `hideHeading`, ~line 21):

```tsx
  /** When true, output names render read-only (the runtime keys on them) */
  readOnlyNames?: boolean
  /** When set, the Add button inserts the next name from this list not yet present (instead of a blank output) */
  addableNames?: string[]
```

Update the destructure (line 24-30):

```tsx
function OutputsEditorComponent({
  outputs,
  onChange,
  readOnly = false,
  nameOnly = false,
  hideHeading = false,
  readOnlyNames = false,
  addableNames,
}: OutputsEditorProps) {
```

Replace `addOutput` (lines 31-33):

```tsx
  const missingName = addableNames?.find((n) => !outputs.some((o) => o.name === n))
  const addOutput = useCallback(() => {
    const name = addableNames ? missingName : ''
    if (addableNames && !name) return
    onChange([...outputs, { id: generateOID(WORKER_INTERNAL), name: name ?? '', description: '' }])
  }, [outputs, onChange, addableNames, missingName])
```

Update the Add button to disable when an `addableNames` list is exhausted (line 53-63):

```tsx
        {!readOnly && !nameOnly && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={addOutput}
            disabled={!!addableNames && !missingName}
            aria-label="Add output parameter"
          >
            <Plus className="h-3 w-3" />
          </Button>
        )}
```

Replace the name field (lines 71-77) so it renders read-only text when `readOnlyNames` is set:

```tsx
            {readOnlyNames ? (
              <div className="h-7 flex items-center text-sm font-medium px-1">{output.name}</div>
            ) : (
              <Input
                placeholder="Parameter name"
                value={output.name}
                onChange={(e) => updateOutput(output.id, { name: e.target.value.replace(/\s/g, '') })}
                className="h-7 text-sm"
                disabled={readOnly}
              />
            )}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npm run test:run -- src/components/properties/__tests__/OutputsEditor.lockedNames.test.tsx`
Expected: PASS (3 tests). Also re-run the existing `OutputsEditor.hideHeading.test.tsx` to confirm no regression: `npm run test:run -- src/components/properties/__tests__/OutputsEditor.hideHeading.test.tsx`.

- [ ] **Step 5: Commit**

```bash
git add src/components/properties/OutputsEditor.tsx src/components/properties/__tests__/OutputsEditor.lockedNames.test.tsx
git commit -m "feat(properties): OutputsEditor read-only names + add-from-list mode"
```

---

### Task B4: Wire the CATCH outputs to locked-name mode

**Files:** Modify `src/components/properties/NodeInlineEditor.tsx` (the Outputs `CollapsibleSection`, ~lines 297-310 in the current accordion layout)

- [ ] **Step 1: Add the import**

Near the other property imports in `NodeInlineEditor.tsx`:

```tsx
import { CATCH_OUTPUT_NAMES } from '@/lib/catch-outputs'
```

- [ ] **Step 2: Pass the props for catch**

In the Outputs `CollapsibleSection`, pass `readOnlyNames` + `addableNames` only for catch nodes. Update the `OutputsEditor` usage inside the outputs section to:

```tsx
            <OutputsEditor
              outputs={isEmbeddedSubWorkflow ? (childDraft?.outputs ?? []) : draft.outputs || []}
              onChange={(outputs) => {
                if (isEmbeddedSubWorkflow && childDraft) {
                  setChildDraft({ ...childDraft, outputs })
                } else {
                  updateDraft({ outputs })
                }
              }}
              readOnly={showActionSelector || isReferencedSubWorkflow}
              hideHeading
              readOnlyNames={nodeType === 'catch'}
              addableNames={nodeType === 'catch' ? [...CATCH_OUTPUT_NAMES] : undefined}
            />
```

- [ ] **Step 3: Verify the step panel renders for catch**

Run the existing catch panel test (it exercises NodeInlineEditor for a catch node):
`npm run test:run -- src/components/properties/__tests__/NodeInlineEditor.catch.test.tsx`
Expected: PASS (no regression — the CATCH section still renders; outputs now render with read-only names).

- [ ] **Step 4: Commit**

```bash
git add src/components/properties/NodeInlineEditor.tsx
git commit -m "feat(properties): CATCH outputs use locked names + canonical add list"
```

---

### Task B5: Export/import round-trip test

**Files:** Test only — `src/lib/packageFormat/__tests__/catch-outputs-roundtrip.test.ts`

- [ ] **Step 1: Write the test**

Create `src/lib/packageFormat/__tests__/catch-outputs-roundtrip.test.ts`:

```ts
// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.

import { describe, it, expect } from 'vitest'
import { extractOutputParams } from '@/lib/packageFormat/parameter-extractors'
import { transformOutputParams } from '@/lib/import/transformers'
import { defaultCatchOutputs } from '@/lib/catch-outputs'

describe('CATCH default outputs export/import round-trip', () => {
  it('exports the four names as output_parameter_specifications ids and imports them back', () => {
    const outputs = defaultCatchOutputs().map((o) => ({ ...o, target: `FailureContext.${o.name}` }))
    const specs = extractOutputParams({ outputs })!
    expect(specs.map((s) => s.id)).toEqual(['Message', 'Reason', 'Step', 'StepID'])
    expect(specs.map((s) => s.target)).toEqual([
      'FailureContext.Message', 'FailureContext.Reason', 'FailureContext.Step', 'FailureContext.StepID',
    ])
    const back = transformOutputParams(specs)!
    expect(back.map((p) => p.name)).toEqual(['Message', 'Reason', 'Step', 'StepID'])
  })
})
```

- [ ] **Step 2: Run — expect PASS** (no code change; `extractOutputParams`/`transformOutputParams` already map `name↔id`)

Run: `npm run test:run -- src/lib/packageFormat/__tests__/catch-outputs-roundtrip.test.ts`
Expected: PASS. (If the import path/name differs, adjust the import to the actual exported symbol — confirm `transformOutputParams` is exported from `src/lib/import/transformers.ts`.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/packageFormat/__tests__/catch-outputs-roundtrip.test.ts
git commit -m "test(packageFormat): CATCH named outputs survive export/import round-trip"
```

---

### Task B6: Document in HELP.md

**Files:** Modify `HELP.md` (the CATCH section, ~lines 545-552)

- [ ] **Step 1: Add the outputs subsection**

In the `### Catch` section of `HELP.md`, after the existing description, add:

```markdown

**CATCH outputs.** Every CATCH starts with four read-only outputs the runtime fills when the catch fires. Set each one's **target** to a Value Property to use it downstream:

| Output | Value |
|---|---|
| `Message` | the failed action's error message (empty if none) |
| `Reason` | the failure mode: `ERROR`, `ABORT`, or `TIMEOUT` |
| `Step` | the label of the step whose TRY fired |
| `StepID` | the OID of that step |

The names are fixed (the runtime keys on them); you can remove ones you don't need and re-add them with the **+** button.
```

- [ ] **Step 2: Build help + sanity check**

Run: `npm run build:help` (regenerates the bundled help) and confirm it completes without error.

- [ ] **Step 3: Commit**

```bash
git add HELP.md
git commit -m "docs(help): document the four default CATCH outputs"
```

---

### Task B7: Final Phase-B verification

- [ ] **Step 1: Typecheck + full editor suite + lint**

Run:
- `npx tsc -b` → expect exit 0
- `npm run test:run` → expect green (no regressions; new tests pass)
- `npm run lint` → expect 0 errors on touched files

- [ ] **Step 2: Manual check (dev server)**

`npm run dev` (or it's already running on :5174). Add a CATCH node → its Output Parameters show four read-only rows `Message`/`Reason`/`Step`/`StepID`; set a target on one; remove one and re-add via **+**; confirm export contains `output_parameter_specifications` with those ids. Then open PR #2 (`TrajectoryEditor`).

---

## Self-Review

**Spec coverage:**
- Field contract (Message/Reason/Step/StepID) → A1/A4 (engines), A3 (fixtures), B1 (names). ✓
- Replace old ids → A1–A4 rename every occurrence; enumerated change list below. ✓
- Both engines + fixtures (parity) → A1 (TS), A4 (Kotlin), A3 (shared fixtures, auto-discovered by both runners). ✓
- Editor seed on new nodes only → B2 (`addNode`, guarded; import path untouched). ✓
- Names locked / targets editable / deletable / re-addable → B3 (`readOnlyNames` + `addableNames`) + B4 (wired for catch). ✓
- Export/import unchanged → B5 round-trip test. ✓
- HELP docs → B6. ✓
- Breaking-change note → plan header + design doc. ✓

**Enumerated id-rename sites (so none are missed):** `step-handlers.ts:198-201` (keys), `try-catch-handlers.test.ts:22-23` (ids), `try-catch-engine.test.ts:28-29,86` (ids), 5 fixtures `exec-try-catch-001..005` (`trigger_reason`→`Reason`), `StepHandlers.kt:141-146` (keys), `TryCatchHandlersTest.kt` (ids), `TryCatchEngineTest.kt:16` (default id). **Do NOT touch:** `engine.ts:271-276`/`394`/`396` (CatchContext population/access), `KNOWN_CATCH_FIELDS`/`fields` getter bodies (`c.trigger_reason` etc.), `CatchContext` type fields, and all `error_message` in `validator.ts`/`*-validator.test.ts`/`validate-file.ts` (that is the validator's `ValidationResult.error_message`, unrelated).

**Placeholder scan:** none — every step has exact code/commands.

**Type consistency:** `defaultCatchOutputs()`/`CATCH_OUTPUT_NAMES` defined in B1 and consumed in B2/B4; `readOnlyNames`/`addableNames` defined in B3 and passed in B4; output `name` ↔ package `id` mapping relied on consistently (B5 confirms).
