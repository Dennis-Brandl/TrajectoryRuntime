# Environment Actions Phase 1 (Web-UI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `ACTION PROXY` steps to the web-ui so workflows can delegate execution to a Trajectory Action Container over REST/SSE, with a per-environment server picker, per-step ISA-88 commands, reload-survivable persistence, and ABORT-then-DELETE cleanup on abandon.

**Architecture:** KMP engine treats `ACTION PROXY` as a "wait for external completion" step (same shape as `USER_INTERACTION`). All HTTP, SSE, state mapping, command sending, and persistence live in the web-ui coordinator layer behind an `ActionInstanceObserver` interface (so Phase 2 / Android can swap SSE for polling). The TS engine in `engines/web/src` and the KMP engine in `engines/kmp-engine` both get the same schema additions so conformance fixtures pass on both runners.

**Tech Stack:** TypeScript (`engines/web`, `engines/web-ui`), Kotlin Multiplatform (`engines/kmp-engine`), React 19 + Vite (web-ui), `node --test` (test runner), real TrajectoryActions container at `http://localhost:3002` for integration.

**Spec:** `docs/superpowers/specs/2026-05-19-environment-actions-design.md`
**REST protocol:** `docs/2026-05-18-trajectory-rest-protocol-design.md`
**Branch:** `feat/environment-actions` (already created and checked out)

---

## File Structure

### Schema (JSON Schema)
- Modify `schemas/master-workflow-step-library.json` — add `action_proxy_config` block to step schema.
- Modify `schemas/master-workflow-library.json` — mirror `action_proxy_config` (it's the same step shape).

### KMP engine (commonMain) — Kotlin
- Modify `engines/kmp-engine/src/commonMain/kotlin/com/trajectoryruntime/engine/Types.kt` — add `ActionServerSpecification`, extend `MasterEnvironmentSpecification`, add `ActionProxyConfig`, extend `MasterWorkflowStep`.
- Modify `engines/kmp-engine/src/commonMain/kotlin/com/trajectoryruntime/engine/Validator.kt` — register `"ACTION PROXY"` and add the three §14.2 validation rules.
- Modify `engines/kmp-engine/src/commonMain/kotlin/com/trajectoryruntime/engine/StepHandlers.kt` — extend `needsUserAction()` to include `"ACTION PROXY"`.

### TS engine (used by web-ui) — TypeScript
- Modify `engines/web/src/types.ts` — mirror KMP type additions.
- Modify `engines/web/src/validator.ts` — add the three §14.2 validation rules (TS validator currently has no step-type allowlist; the three ACTION PROXY rules are still required for conformance).
- Modify `engines/web/src/step-handlers.ts` — extend `needsUserAction()` to include `"ACTION PROXY"`.

### Conformance fixtures
- Create `spec/conformance/validation/val-action-proxy-001.json` — missing `action_proxy_config`.
- Create `spec/conformance/validation/val-action-proxy-002.json` — unknown `environment_oid`.
- Create `spec/conformance/validation/val-action-proxy-003.json` — `action_oid` not in env's `included_actions`.
- Create `spec/conformance/execution/exec-action-proxy-001.json` — engine schedules ACTION PROXY, asserts step stays in `EXECUTING` until externally completed.

### Web-UI transport layer
- Create `engines/web-ui/src/actionProxy/types.ts` — `ActionEvent`, `ActionInstanceObserver`, `ActionApiClient` interfaces; the §5.2 mapping types.
- Create `engines/web-ui/src/actionProxy/ActionApiClient.ts` — HTTP client (invoke / get / list / command / delete + capabilities) with retry/backoff.
- Create `engines/web-ui/src/actionProxy/SseObserver.ts` — `EventSource` wrapper implementing `ActionInstanceObserver`, with `Last-Event-ID` reconnect.
- Create `engines/web-ui/src/actionProxy/stateMapping.ts` — pure tables/functions: server-state→engine-state and per-state command lists.

### Web-UI coordinator integration
- Create `engines/web-ui/src/actionProxy/ActionProxyController.ts` — per-step controller; owns the SSE subscription, accumulated outputs, log ring, command sending, persistence write-through, terminal handoff to engine.
- Create `engines/web-ui/src/actionProxy/persistence.ts` — localStorage slice (`trajectory.actionProxyState.v1`) with debounced writes.
- Create `engines/web-ui/src/actionProxy/useActionProxy.ts` — React hook returning the controller snapshot for a step.
- Modify `engines/web-ui/src/coordinator/WorkflowCoordinator.ts` — register/dispose controllers; pre-workflow `ActionServerPicker` orchestration; abandon-workflow cleanup (ABORT-then-DELETE).

### Web-UI components
- Create `engines/web-ui/src/components/ActionProxyStepCard.tsx` and `.module.css`.
- Create `engines/web-ui/src/components/ActionCommandMenu.tsx` and `.module.css`.
- Create `engines/web-ui/src/components/ActionServerPicker.tsx` and `.module.css`.
- Create `engines/web-ui/src/components/ActionLogPanel.tsx` and `.module.css`.
- Modify `engines/web-ui/src/components/StepRenderer.tsx` — add `"ACTION PROXY"` branch.
- Modify `engines/web-ui/src/components/StepDetailPopup.tsx` — include `ActionLogPanel` for `ACTION PROXY` steps.

### Tests
- Create `engines/web-ui/src/actionProxy/stateMapping.test.ts`
- Create `engines/web-ui/src/actionProxy/persistence.test.ts`
- Create `engines/web-ui/src/actionProxy/ActionApiClient.test.ts`
- Create `engines/web-ui/src/actionProxy/SseObserver.test.ts`
- Create `engines/web-ui/src/actionProxy/ActionProxyController.test.ts`
- Create `engines/web-ui/test/integration/action-container.ts` — container helpers.
- Create `engines/web-ui/test/integration/action-proxy-e2e.test.ts` — end-to-end against `:3002`.
- Modify `engines/web-ui/package.json` — add `test`, `test:integration` scripts.

### Manual checklist + docs
- Create `docs/superpowers/plans/MANUAL-TEST-CHECKLIST-environment-actions.md`.
- Modify `docs/Trajectory-Workflow-Schema-Specification.md` — document `ACTION PROXY` and `action_server_specifications`.

---

## Workstream 1 — Engine & schema (KMP + TS)

Goal: both engines round-trip `action_server_specifications`, accept `"ACTION PROXY"` as a valid step type, validate the §14.2 rules, and treat ACTION PROXY as wait-for-external-completion. All conformance fixtures pass on web (`node --test`) and KMP (`jvmTest` + `test-js`).

### Task 1.1: Add JSON schema for `action_proxy_config`

**Files:**
- Modify: `schemas/master-workflow-step-library.json` — add the block under the existing step `properties` object alongside `script_config`, `select1_config`, `form_layout_config`.
- Modify: `schemas/master-workflow-library.json` — mirror the same block in the workflow-embedded step schema.

- [ ] **Step 1: Add the schema block in step-library**

In `schemas/master-workflow-step-library.json`, locate the `properties` object that contains `script_config` (currently around line 130). Add this property next to `script_config`:

```json
"action_proxy_config": {
  "type": "object",
  "description": "Configuration for ACTION PROXY step type. Required when step_type is 'ACTION PROXY'.",
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
      "description": "Optional per-invoke timeout override. Pass-through to the action server."
    }
  }
}
```

- [ ] **Step 2: Mirror the block in workflow-library**

In `schemas/master-workflow-library.json`, find the parallel step-properties object (around line 180, alongside `form_layout_config`) and add the same `action_proxy_config` block.

- [ ] **Step 3: Validate the JSON files parse**

Run from repo root:
```bash
node -e "JSON.parse(require('fs').readFileSync('schemas/master-workflow-step-library.json','utf-8')); JSON.parse(require('fs').readFileSync('schemas/master-workflow-library.json','utf-8')); console.log('OK')"
```
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add schemas/master-workflow-step-library.json schemas/master-workflow-library.json
git commit -m "schema: add action_proxy_config to step schemas"
```

### Task 1.2: Add KMP types — `ActionServerSpecification` + `action_server_specifications`

**Files:**
- Modify: `engines/kmp-engine/src/commonMain/kotlin/com/trajectoryruntime/engine/Types.kt` (around line 229–241)

- [ ] **Step 1: Add the `ActionServerSpecification` data class**

In `Types.kt`, immediately above the existing `data class MasterEnvironmentSpecification(` (line 229), add:

```kotlin
@Serializable
data class ActionServerSpecification(
    val name: String,
    val uri: String,
    val description: String? = null,
    val connection_type: String,  // "REST" only in v1
)
```

- [ ] **Step 2: Add `action_server_specifications` to `MasterEnvironmentSpecification`**

In `Types.kt`, modify the existing `MasterEnvironmentSpecification` data class (currently ending at line 241) to add a new optional field at the end of the parameter list, before the closing `)`:

```kotlin
    val action_server_specifications: List<ActionServerSpecification>? = null,
```

The resulting class should be:

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

- [ ] **Step 3: Build to verify**

```bash
cd engines/kmp-engine && ./gradlew compileKotlinJvm
```
Expected: BUILD SUCCESSFUL.

- [ ] **Step 4: Commit**

```bash
git add engines/kmp-engine/src/commonMain/kotlin/com/trajectoryruntime/engine/Types.kt
git commit -m "kmp: add ActionServerSpecification and wire into MasterEnvironmentSpecification"
```

### Task 1.3: Add KMP types — `ActionProxyConfig` + `action_proxy_config` on step

**Files:**
- Modify: `engines/kmp-engine/src/commonMain/kotlin/com/trajectoryruntime/engine/Types.kt`

- [ ] **Step 1: Add `ActionProxyConfig` data class**

In `Types.kt`, immediately above the existing `data class MasterWorkflowStep(` (currently line 141), add:

```kotlin
@Serializable
data class ActionProxyConfig(
    val action_oid: String,
    val environment_oid: String,
    val timeout_ms: Long? = null,
)
```

- [ ] **Step 2: Add `action_proxy_config` field to `MasterWorkflowStep`**

In `Types.kt`, modify the existing `MasterWorkflowStep` data class to add a new optional field at the end of the parameter list (after `select1_config`):

```kotlin
    val action_proxy_config: ActionProxyConfig? = null,
```

The resulting class should end with:

```kotlin
    val select1_config: Select1Config? = null,
    val action_proxy_config: ActionProxyConfig? = null,
)
```

- [ ] **Step 3: Build**

```bash
cd engines/kmp-engine && ./gradlew compileKotlinJvm
```
Expected: BUILD SUCCESSFUL.

- [ ] **Step 4: Commit**

```bash
git add engines/kmp-engine/src/commonMain/kotlin/com/trajectoryruntime/engine/Types.kt
git commit -m "kmp: add ActionProxyConfig on MasterWorkflowStep"
```

### Task 1.4: KMP validator — register `"ACTION PROXY"` as a valid step type

**Files:**
- Modify: `engines/kmp-engine/src/commonMain/kotlin/com/trajectoryruntime/engine/Validator.kt` (line 177)

- [ ] **Step 1: Write the failing unit test**

Create `engines/kmp-engine/src/jvmTest/kotlin/com/trajectoryruntime/engine/ActionProxyValidatorTest.kt`:

```kotlin
// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
package com.trajectoryruntime.engine

import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ActionProxyValidatorTest {

    private fun parseWorkflow(json: String): Map<String, Any?> {
        @Suppress("UNCHECKED_CAST")
        return Json.parseToJsonElement(json).let { com.fasterxml.jackson.databind.ObjectMapper().readValue(json, Map::class.java) } as Map<String, Any?>
    }

    @Test
    fun `ACTION PROXY is accepted as a valid step type`() {
        val workflow = """{
          "local_id":"wf","oid":"wf-oid","version":"1.0.0","last_modified_date":"2026-05-19T00:00:00Z",
          "steps":[
            {"local_id":"start","oid":"step-start","version":"1.0.0","last_modified_date":"2026-05-19T00:00:00Z","step_type":"START"},
            {"local_id":"act","oid":"step-act","version":"1.0.0","last_modified_date":"2026-05-19T00:00:00Z","step_type":"ACTION PROXY","action_proxy_config":{"action_oid":"act-1","environment_oid":"env-1"}},
            {"local_id":"end","oid":"step-end","version":"1.0.0","last_modified_date":"2026-05-19T00:00:00Z","step_type":"END"}
          ],
          "connections":[
            {"from_step_id":"step-start","to_step_id":"step-act"},
            {"from_step_id":"step-act","to_step_id":"step-end"}
          ],
          "environment_specifications":[
            {"local_id":"env","oid":"env-1","version":"1.0.0","last_modified_date":"2026-05-19T00:00:00Z","included_actions":[{"action_oid":"act-1"}]}
          ]
        }""".trimIndent()
        val result = validateWorkflow(parseWorkflow(workflow))
        assertTrue(result.valid, "expected valid, got ${result.error_code}: ${result.error_message}")
    }
}
```

- [ ] **Step 2: Run the test — it should fail**

```bash
cd engines/kmp-engine && ./gradlew jvmTest --tests "com.trajectoryruntime.engine.ActionProxyValidatorTest"
```
Expected: FAIL with `INVALID_STEP_TYPE: Invalid step type: ACTION PROXY`.

- [ ] **Step 3: Add `"ACTION PROXY"` to `VALID_STEP_TYPES`**

In `Validator.kt`, modify line 177–182:

```kotlin
private val VALID_STEP_TYPES = setOf(
    "START", "END", "PARALLEL", "WAIT ALL", "WAIT ANY",
    "SELECT 1", "SELECT_1", "SCRIPT", "MATH",
    "USER_INTERACTION", "YES_NO", "WORKFLOW PROXY",
    "WAIT ACTION PROXY", "ACTION PROXY",
)
```

- [ ] **Step 4: Run the test — it should now pass**

```bash
cd engines/kmp-engine && ./gradlew jvmTest --tests "com.trajectoryruntime.engine.ActionProxyValidatorTest"
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add engines/kmp-engine/src/commonMain/kotlin/com/trajectoryruntime/engine/Validator.kt engines/kmp-engine/src/jvmTest/kotlin/com/trajectoryruntime/engine/ActionProxyValidatorTest.kt
git commit -m "kmp: accept ACTION PROXY step type"
```

### Task 1.5: KMP validator — §14.2 rules (missing config, unknown env, unknown action)

**Files:**
- Modify: `engines/kmp-engine/src/commonMain/kotlin/com/trajectoryruntime/engine/Validator.kt`
- Modify: `engines/kmp-engine/src/jvmTest/kotlin/com/trajectoryruntime/engine/ActionProxyValidatorTest.kt`

- [ ] **Step 1: Add three failing tests**

Append to `ActionProxyValidatorTest.kt`:

```kotlin
    @Test
    fun `ACTION PROXY without action_proxy_config is rejected`() {
        val workflow = """{
          "local_id":"wf","oid":"wf-oid","version":"1.0.0","last_modified_date":"2026-05-19T00:00:00Z",
          "steps":[
            {"local_id":"start","oid":"step-start","version":"1.0.0","last_modified_date":"2026-05-19T00:00:00Z","step_type":"START"},
            {"local_id":"act","oid":"step-act","version":"1.0.0","last_modified_date":"2026-05-19T00:00:00Z","step_type":"ACTION PROXY"},
            {"local_id":"end","oid":"step-end","version":"1.0.0","last_modified_date":"2026-05-19T00:00:00Z","step_type":"END"}
          ],
          "connections":[
            {"from_step_id":"step-start","to_step_id":"step-act"},
            {"from_step_id":"step-act","to_step_id":"step-end"}
          ]
        }""".trimIndent()
        val result = validateWorkflow(parseWorkflow(workflow))
        assertEquals(false, result.valid)
        assertEquals("INVALID_VALIDATION", result.error_code)
        assertTrue(result.error_message!!.contains("missing action_proxy_config"))
    }

    @Test
    fun `ACTION PROXY with unknown environment_oid is rejected`() {
        val workflow = """{
          "local_id":"wf","oid":"wf-oid","version":"1.0.0","last_modified_date":"2026-05-19T00:00:00Z",
          "steps":[
            {"local_id":"start","oid":"step-start","version":"1.0.0","last_modified_date":"2026-05-19T00:00:00Z","step_type":"START"},
            {"local_id":"act","oid":"step-act","version":"1.0.0","last_modified_date":"2026-05-19T00:00:00Z","step_type":"ACTION PROXY","action_proxy_config":{"action_oid":"act-1","environment_oid":"env-missing"}},
            {"local_id":"end","oid":"step-end","version":"1.0.0","last_modified_date":"2026-05-19T00:00:00Z","step_type":"END"}
          ],
          "connections":[
            {"from_step_id":"step-start","to_step_id":"step-act"},
            {"from_step_id":"step-act","to_step_id":"step-end"}
          ]
        }""".trimIndent()
        val result = validateWorkflow(parseWorkflow(workflow))
        assertEquals(false, result.valid)
        assertEquals("INVALID_VALIDATION", result.error_code)
        assertTrue(result.error_message!!.contains("env-missing"))
    }

    @Test
    fun `ACTION PROXY with unknown action_oid is rejected`() {
        val workflow = """{
          "local_id":"wf","oid":"wf-oid","version":"1.0.0","last_modified_date":"2026-05-19T00:00:00Z",
          "steps":[
            {"local_id":"start","oid":"step-start","version":"1.0.0","last_modified_date":"2026-05-19T00:00:00Z","step_type":"START"},
            {"local_id":"act","oid":"step-act","version":"1.0.0","last_modified_date":"2026-05-19T00:00:00Z","step_type":"ACTION PROXY","action_proxy_config":{"action_oid":"act-missing","environment_oid":"env-1"}},
            {"local_id":"end","oid":"step-end","version":"1.0.0","last_modified_date":"2026-05-19T00:00:00Z","step_type":"END"}
          ],
          "connections":[
            {"from_step_id":"step-start","to_step_id":"step-act"},
            {"from_step_id":"step-act","to_step_id":"step-end"}
          ],
          "environment_specifications":[
            {"local_id":"env","oid":"env-1","version":"1.0.0","last_modified_date":"2026-05-19T00:00:00Z","included_actions":[{"action_oid":"act-1"}]}
          ]
        }""".trimIndent()
        val result = validateWorkflow(parseWorkflow(workflow))
        assertEquals(false, result.valid)
        assertEquals("INVALID_VALIDATION", result.error_code)
        assertTrue(result.error_message!!.contains("act-missing"))
    }
```

- [ ] **Step 2: Run — they should fail**

```bash
cd engines/kmp-engine && ./gradlew jvmTest --tests "com.trajectoryruntime.engine.ActionProxyValidatorTest"
```
Expected: FAIL on the three new tests.

- [ ] **Step 3: Add the validation function**

In `Validator.kt`, add a new private function above `validateWorkflow` (which is at the bottom of the file — locate the public entry point first by grepping). If unsure, search for `fun validateWorkflow` and add the helper above it. Add:

```kotlin
@Suppress("UNCHECKED_CAST")
private fun actionProxyValidation(workflow: Map<String, Any?>): ValidationResult? {
    val steps = workflow["steps"] as? List<Map<String, Any?>> ?: return null
    val envSpecs = workflow["environment_specifications"] as? List<Map<String, Any?>> ?: emptyList()

    // (env_oid → set of action_oids in that env's included_actions)
    val envActions = mutableMapOf<String, Set<String>>()
    for (env in envSpecs) {
        val envOid = env["oid"] as? String ?: continue
        val included = env["included_actions"] as? List<Map<String, Any?>> ?: emptyList()
        envActions[envOid] = included.mapNotNull { it["action_oid"] as? String }.toSet()
    }

    for (step in steps) {
        val stepType = step["step_type"] as? String ?: continue
        if (stepType != "ACTION PROXY") continue

        val stepOid = step["oid"] as? String ?: "<unknown>"
        val config = step["action_proxy_config"] as? Map<String, Any?>
        if (config == null) {
            return ValidationResult(false, "INVALID_VALIDATION", "ACTION PROXY step $stepOid missing action_proxy_config")
        }

        val envOid = config["environment_oid"] as? String
        val actionOid = config["action_oid"] as? String
        if (envOid == null || actionOid == null) {
            return ValidationResult(false, "INVALID_VALIDATION", "ACTION PROXY step $stepOid action_proxy_config missing required field")
        }

        if (envOid !in envActions) {
            return ValidationResult(false, "INVALID_VALIDATION", "ACTION PROXY step $stepOid references unknown environment_oid $envOid")
        }
        val actions = envActions[envOid]!!
        if (actionOid !in actions) {
            return ValidationResult(false, "INVALID_VALIDATION", "ACTION PROXY step $stepOid action_oid $actionOid not in environment $envOid")
        }
    }
    return null
}
```

- [ ] **Step 4: Wire `actionProxyValidation` into `validateWorkflow`**

Locate the existing `validateWorkflow` function — it chains the various validations (`preStructuralChecks`, `structuralValidation`, `semanticValidation`, `resourceValidation`). Add `actionProxyValidation` to the chain after `structuralValidation`. Example pattern (adapt to the existing chain shape):

```kotlin
fun validateWorkflow(workflow: Map<String, Any?>): ValidationResult {
    preStructuralChecks(workflow)?.let { return it }
    structuralValidation(workflow)?.let { return it }
    actionProxyValidation(workflow)?.let { return it }   // NEW
    semanticValidation(workflow)?.let { return it }
    resourceValidation(workflow)?.let { return it }
    return ValidationResult(true)
}
```

If the existing function's structure differs, insert `actionProxyValidation` immediately after `structuralValidation` regardless.

- [ ] **Step 5: Run the tests**

```bash
cd engines/kmp-engine && ./gradlew jvmTest --tests "com.trajectoryruntime.engine.ActionProxyValidatorTest"
```
Expected: all four tests PASS.

- [ ] **Step 6: Commit**

```bash
git add engines/kmp-engine/src/commonMain/kotlin/com/trajectoryruntime/engine/Validator.kt engines/kmp-engine/src/jvmTest/kotlin/com/trajectoryruntime/engine/ActionProxyValidatorTest.kt
git commit -m "kmp: validate ACTION PROXY config rules (missing config, unknown env, unknown action)"
```

### Task 1.6: KMP — extend `needsUserAction()` to include `"ACTION PROXY"`

**Files:**
- Modify: `engines/kmp-engine/src/commonMain/kotlin/com/trajectoryruntime/engine/StepHandlers.kt` (line 19–21)

- [ ] **Step 1: Add the change**

In `StepHandlers.kt`, modify:

```kotlin
fun needsUserAction(stepType: String): Boolean {
    return stepType in listOf("USER_INTERACTION", "YES_NO", "ACTION PROXY")
}
```

- [ ] **Step 2: Build**

```bash
cd engines/kmp-engine && ./gradlew compileKotlinJvm
```
Expected: BUILD SUCCESSFUL.

- [ ] **Step 3: Commit**

```bash
git add engines/kmp-engine/src/commonMain/kotlin/com/trajectoryruntime/engine/StepHandlers.kt
git commit -m "kmp: treat ACTION PROXY as wait-for-external-completion"
```

### Task 1.7: TS engine — mirror type additions

**Files:**
- Modify: `engines/web/src/types.ts`

- [ ] **Step 1: Add `ActionServerSpecification` interface and `action_server_specifications` field**

In `engines/web/src/types.ts`, locate `MasterEnvironmentSpecification` (line 311). Immediately above it, add:

```ts
export interface ActionServerSpecification {
  name: string;
  uri: string;
  description?: string;
  connection_type: string;
}
```

Then modify the existing `MasterEnvironmentSpecification` to add the field:

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
  action_server_specifications?: ActionServerSpecification[];
}
```

- [ ] **Step 2: Add `ActionProxyConfig` interface and field on step**

Locate `MasterWorkflowStep` (line 334). Above it, add:

```ts
export interface ActionProxyConfig {
  action_oid: string;
  environment_oid: string;
  timeout_ms?: number;
}
```

Then modify `MasterWorkflowStep` to add the field at the end of the interface:

```ts
export interface MasterWorkflowStep extends ManagedElement {
  step_type: string;
  position?: { x: number; y: number };
  input_parameter_specifications?: ParameterSpecification[];
  output_parameter_specifications?: OutputParameterSpecification[];
  value_property_specifications?: PropertySpecification[];
  resource_command_specifications?: ResourceCommandSpecification[];
  form_layout_config?: FormLayoutExportEntry[] | Record<string, unknown>;
  yes_no_config?: YesNoConfig;
  script_config?: ScriptConfig;
  select1_config?: Select1Config;
  action_proxy_config?: ActionProxyConfig;
}
```

- [ ] **Step 3: Build**

```bash
cd engines/web && npm run build
```
Expected: clean compile (no diagnostics).

- [ ] **Step 4: Commit**

```bash
git add engines/web/src/types.ts
git commit -m "ts-engine: add ActionServerSpecification and ActionProxyConfig types"
```

### Task 1.8: TS engine — `needsUserAction` includes `"ACTION PROXY"`

**Files:**
- Modify: `engines/web/src/step-handlers.ts` (line 26–28)

- [ ] **Step 1: Write the failing test**

Create `engines/web/src/step-handlers.test.ts` if it doesn't already contain a test for `needsUserAction`. If it exists, append. Add:

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { needsUserAction } from './step-handlers.js';

test('needsUserAction includes ACTION PROXY', () => {
  assert.equal(needsUserAction('ACTION PROXY'), true);
});
```

- [ ] **Step 2: Build + run the test**

```bash
cd engines/web && npm run build && npm test 2>&1 | grep -E "ACTION PROXY|fail|pass"
```
Expected: FAIL (`needsUserAction includes ACTION PROXY` fails).

- [ ] **Step 3: Update the function**

In `engines/web/src/step-handlers.ts`, modify:

```ts
export function needsUserAction(stepType: string): boolean {
  return ['USER_INTERACTION', 'YES_NO', 'ACTION PROXY'].includes(stepType);
}
```

- [ ] **Step 4: Build + run the test**

```bash
cd engines/web && npm run build && npm test 2>&1 | tail -10
```
Expected: PASS (all step-handlers tests).

- [ ] **Step 5: Commit**

```bash
git add engines/web/src/step-handlers.ts engines/web/src/step-handlers.test.ts
git commit -m "ts-engine: treat ACTION PROXY as wait-for-external-completion"
```

### Task 1.9: TS validator — §14.2 rules

**Files:**
- Modify: `engines/web/src/validator.ts`
- Create: `engines/web/src/action-proxy-validator.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `engines/web/src/action-proxy-validator.test.ts`:

```ts
// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { validateWorkflow } from './validator.js';

function wfWithActionProxyStep(stepExtras: Record<string, unknown>, envs: unknown[] = []): Record<string, unknown> {
  return {
    local_id: 'wf', oid: 'wf-oid', version: '1.0.0', last_modified_date: '2026-05-19T00:00:00Z',
    steps: [
      { local_id: 'start', oid: 'step-start', version: '1.0.0', last_modified_date: '2026-05-19T00:00:00Z', step_type: 'START' },
      { local_id: 'act', oid: 'step-act', version: '1.0.0', last_modified_date: '2026-05-19T00:00:00Z', step_type: 'ACTION PROXY', ...stepExtras },
      { local_id: 'end', oid: 'step-end', version: '1.0.0', last_modified_date: '2026-05-19T00:00:00Z', step_type: 'END' },
    ],
    connections: [
      { from_step_id: 'step-start', to_step_id: 'step-act' },
      { from_step_id: 'step-act', to_step_id: 'step-end' },
    ],
    environment_specifications: envs,
  };
}

test('ACTION PROXY without action_proxy_config is rejected', () => {
  const r = validateWorkflow(wfWithActionProxyStep({}, [{ local_id: 'env', oid: 'env-1', version: '1.0.0', last_modified_date: '2026-05-19T00:00:00Z', included_actions: [{ action_oid: 'act-1' }] }]));
  assert.equal(r.valid, false);
  assert.equal(r.error_code, 'INVALID_VALIDATION');
  assert.match(r.error_message!, /missing action_proxy_config/);
});

test('ACTION PROXY with unknown environment_oid is rejected', () => {
  const r = validateWorkflow(wfWithActionProxyStep({ action_proxy_config: { action_oid: 'act-1', environment_oid: 'env-missing' } }, []));
  assert.equal(r.valid, false);
  assert.equal(r.error_code, 'INVALID_VALIDATION');
  assert.match(r.error_message!, /env-missing/);
});

test('ACTION PROXY with unknown action_oid is rejected', () => {
  const r = validateWorkflow(wfWithActionProxyStep(
    { action_proxy_config: { action_oid: 'act-missing', environment_oid: 'env-1' } },
    [{ local_id: 'env', oid: 'env-1', version: '1.0.0', last_modified_date: '2026-05-19T00:00:00Z', included_actions: [{ action_oid: 'act-1' }] }],
  ));
  assert.equal(r.valid, false);
  assert.equal(r.error_code, 'INVALID_VALIDATION');
  assert.match(r.error_message!, /act-missing/);
});

test('ACTION PROXY with valid config is accepted', () => {
  const r = validateWorkflow(wfWithActionProxyStep(
    { action_proxy_config: { action_oid: 'act-1', environment_oid: 'env-1' } },
    [{ local_id: 'env', oid: 'env-1', version: '1.0.0', last_modified_date: '2026-05-19T00:00:00Z', included_actions: [{ action_oid: 'act-1' }] }],
  ));
  assert.equal(r.valid, true);
});
```

- [ ] **Step 2: Build + run the tests — they should fail**

```bash
cd engines/web && npm run build && npm test 2>&1 | grep -E "action-proxy|ACTION PROXY" | head -20
```
Expected: at least three FAIL.

- [ ] **Step 3: Add the validation function**

In `engines/web/src/validator.ts`, add a new helper function. Locate where `resourceValidation` is defined (around line 175), and add immediately above it:

```ts
function actionProxyValidation(workflow: Record<string, unknown>): ValidationResult | null {
  const steps = workflow['steps'] as Array<Record<string, unknown>>;
  const envSpecs = (workflow['environment_specifications'] as Array<Record<string, unknown>> | undefined) ?? [];

  const envActions = new Map<string, Set<string>>();
  for (const env of envSpecs) {
    const envOid = env['oid'] as string | undefined;
    if (typeof envOid !== 'string') continue;
    const included = (env['included_actions'] as Array<Record<string, unknown>> | undefined) ?? [];
    const oids = new Set<string>();
    for (const a of included) {
      const aOid = a['action_oid'];
      if (typeof aOid === 'string') oids.add(aOid);
    }
    envActions.set(envOid, oids);
  }

  for (const step of steps) {
    if (step['step_type'] !== 'ACTION PROXY') continue;
    const stepOid = (step['oid'] as string | undefined) ?? '<unknown>';
    const config = step['action_proxy_config'] as Record<string, unknown> | undefined;
    if (!config) {
      return { valid: false, error_code: 'INVALID_VALIDATION', error_message: `ACTION PROXY step ${stepOid} missing action_proxy_config` };
    }
    const envOid = config['environment_oid'] as string | undefined;
    const actionOid = config['action_oid'] as string | undefined;
    if (!envOid || !actionOid) {
      return { valid: false, error_code: 'INVALID_VALIDATION', error_message: `ACTION PROXY step ${stepOid} action_proxy_config missing required field` };
    }
    if (!envActions.has(envOid)) {
      return { valid: false, error_code: 'INVALID_VALIDATION', error_message: `ACTION PROXY step ${stepOid} references unknown environment_oid ${envOid}` };
    }
    if (!envActions.get(envOid)!.has(actionOid)) {
      return { valid: false, error_code: 'INVALID_VALIDATION', error_message: `ACTION PROXY step ${stepOid} action_oid ${actionOid} not in environment ${envOid}` };
    }
  }
  return null;
}
```

- [ ] **Step 4: Wire `actionProxyValidation` into `validateWorkflow`**

Locate the `validateWorkflow` export in `engines/web/src/validator.ts` (search for `export function validateWorkflow`). It chains the existing helpers. Add `actionProxyValidation` after `semanticValidation`:

```ts
export function validateWorkflow(workflow: Record<string, unknown>): ValidationResult {
  const pre = preStructuralChecks(workflow); if (pre) return pre;
  const sem = semanticValidation(workflow); if (sem) return sem;
  const ap = actionProxyValidation(workflow); if (ap) return ap;
  const res = resourceValidation(workflow); if (res) return res;
  return { valid: true };
}
```

If the existing implementation differs (different helper names or order), insert `actionProxyValidation` after the semantic check but before the resource check.

- [ ] **Step 5: Build + run tests — they should pass**

```bash
cd engines/web && npm run build && npm test 2>&1 | tail -10
```
Expected: all four ACTION PROXY tests PASS; existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add engines/web/src/validator.ts engines/web/src/action-proxy-validator.test.ts
git commit -m "ts-engine: validate ACTION PROXY config rules"
```

### Task 1.10: Conformance fixtures

**Files:**
- Create: `spec/conformance/validation/val-action-proxy-001.json`
- Create: `spec/conformance/validation/val-action-proxy-002.json`
- Create: `spec/conformance/validation/val-action-proxy-003.json`
- Create: `spec/conformance/execution/exec-action-proxy-001.json`

- [ ] **Step 1: Create the missing-config fixture**

Create `spec/conformance/validation/val-action-proxy-001.json`:

```json
{
  "test_id": "val-action-proxy-001",
  "name": "ACTION PROXY missing action_proxy_config",
  "category": "validation",
  "tags": ["action-proxy", "invalid"],
  "workflow": {
    "local_id": "wf-ap-001",
    "oid": "wf-ap-001-oid",
    "version": "1.0.0",
    "last_modified_date": "2026-05-19T00:00:00Z",
    "schemaVersion": "4.0",
    "steps": [
      { "local_id": "start", "oid": "step-start", "version": "1.0.0", "last_modified_date": "2026-05-19T00:00:00Z", "step_type": "START" },
      { "local_id": "act", "oid": "step-act", "version": "1.0.0", "last_modified_date": "2026-05-19T00:00:00Z", "step_type": "ACTION PROXY" },
      { "local_id": "end", "oid": "step-end", "version": "1.0.0", "last_modified_date": "2026-05-19T00:00:00Z", "step_type": "END" }
    ],
    "connections": [
      { "from_step_id": "step-start", "to_step_id": "step-act" },
      { "from_step_id": "step-act", "to_step_id": "step-end" }
    ],
    "environment_specifications": [
      { "local_id": "env", "oid": "env-1", "version": "1.0.0", "last_modified_date": "2026-05-19T00:00:00Z", "included_actions": [{ "action_oid": "act-1" }] }
    ]
  },
  "expected": {
    "valid": false,
    "error_code": "INVALID_VALIDATION"
  }
}
```

- [ ] **Step 2: Create the unknown-env fixture**

Create `spec/conformance/validation/val-action-proxy-002.json`:

```json
{
  "test_id": "val-action-proxy-002",
  "name": "ACTION PROXY references unknown environment_oid",
  "category": "validation",
  "tags": ["action-proxy", "invalid"],
  "workflow": {
    "local_id": "wf-ap-002",
    "oid": "wf-ap-002-oid",
    "version": "1.0.0",
    "last_modified_date": "2026-05-19T00:00:00Z",
    "schemaVersion": "4.0",
    "steps": [
      { "local_id": "start", "oid": "step-start", "version": "1.0.0", "last_modified_date": "2026-05-19T00:00:00Z", "step_type": "START" },
      { "local_id": "act", "oid": "step-act", "version": "1.0.0", "last_modified_date": "2026-05-19T00:00:00Z", "step_type": "ACTION PROXY", "action_proxy_config": { "action_oid": "act-1", "environment_oid": "env-missing" } },
      { "local_id": "end", "oid": "step-end", "version": "1.0.0", "last_modified_date": "2026-05-19T00:00:00Z", "step_type": "END" }
    ],
    "connections": [
      { "from_step_id": "step-start", "to_step_id": "step-act" },
      { "from_step_id": "step-act", "to_step_id": "step-end" }
    ]
  },
  "expected": {
    "valid": false,
    "error_code": "INVALID_VALIDATION"
  }
}
```

- [ ] **Step 3: Create the unknown-action fixture**

Create `spec/conformance/validation/val-action-proxy-003.json`:

```json
{
  "test_id": "val-action-proxy-003",
  "name": "ACTION PROXY references action_oid not in environment included_actions",
  "category": "validation",
  "tags": ["action-proxy", "invalid"],
  "workflow": {
    "local_id": "wf-ap-003",
    "oid": "wf-ap-003-oid",
    "version": "1.0.0",
    "last_modified_date": "2026-05-19T00:00:00Z",
    "schemaVersion": "4.0",
    "steps": [
      { "local_id": "start", "oid": "step-start", "version": "1.0.0", "last_modified_date": "2026-05-19T00:00:00Z", "step_type": "START" },
      { "local_id": "act", "oid": "step-act", "version": "1.0.0", "last_modified_date": "2026-05-19T00:00:00Z", "step_type": "ACTION PROXY", "action_proxy_config": { "action_oid": "act-missing", "environment_oid": "env-1" } },
      { "local_id": "end", "oid": "step-end", "version": "1.0.0", "last_modified_date": "2026-05-19T00:00:00Z", "step_type": "END" }
    ],
    "connections": [
      { "from_step_id": "step-start", "to_step_id": "step-act" },
      { "from_step_id": "step-act", "to_step_id": "step-end" }
    ],
    "environment_specifications": [
      { "local_id": "env", "oid": "env-1", "version": "1.0.0", "last_modified_date": "2026-05-19T00:00:00Z", "included_actions": [{ "action_oid": "act-1" }] }
    ]
  },
  "expected": {
    "valid": false,
    "error_code": "INVALID_VALIDATION"
  }
}
```

- [ ] **Step 4: Create the execution fixture**

Create `spec/conformance/execution/exec-action-proxy-001.json`:

```json
{
  "test_id": "exec-action-proxy-001",
  "name": "ACTION PROXY step enters EXECUTING and waits for external completion",
  "category": "execution",
  "tags": ["action-proxy"],
  "workflow": {
    "local_id": "wf-ap-exec-001",
    "oid": "wf-ap-exec-001-oid",
    "version": "1.0.0",
    "last_modified_date": "2026-05-19T00:00:00Z",
    "schemaVersion": "4.0",
    "steps": [
      { "local_id": "start", "oid": "step-start", "version": "1.0.0", "last_modified_date": "2026-05-19T00:00:00Z", "step_type": "START" },
      { "local_id": "act", "oid": "step-act", "version": "1.0.0", "last_modified_date": "2026-05-19T00:00:00Z", "step_type": "ACTION PROXY", "action_proxy_config": { "action_oid": "act-1", "environment_oid": "env-1" } },
      { "local_id": "end", "oid": "step-end", "version": "1.0.0", "last_modified_date": "2026-05-19T00:00:00Z", "step_type": "END" }
    ],
    "connections": [
      { "from_step_id": "step-start", "to_step_id": "step-act" },
      { "from_step_id": "step-act", "to_step_id": "step-end" }
    ],
    "environment_specifications": [
      { "local_id": "env", "oid": "env-1", "version": "1.0.0", "last_modified_date": "2026-05-19T00:00:00Z", "included_actions": [{ "action_oid": "act-1" }] }
    ]
  },
  "expected": {
    "valid": true,
    "execution_trace": [
      { "step_oid": "step-start", "state": "COMPLETED", "order": 1 },
      { "step_oid": "step-act", "state": "EXECUTING", "order": 2 }
    ],
    "workflow_state": "RUNNING"
  }
}
```

- [ ] **Step 5: Run both conformance suites**

```bash
cd engines/web && npm run build && npm test 2>&1 | tail -10
```
Expected: all `val-action-proxy-00{1,2,3}` and `exec-action-proxy-001` pass; previous 99 still pass.

```bash
cd engines/kmp-engine && ./gradlew jvmTest 2>&1 | tail -5 && cd test-js && node run-conformance.js 2>&1 | tail -5
```
Expected: all four new fixtures pass on KMP JVM and JS runners; previous 63/63 still pass on each.

- [ ] **Step 6: Commit**

```bash
git add spec/conformance/validation/val-action-proxy-001.json spec/conformance/validation/val-action-proxy-002.json spec/conformance/validation/val-action-proxy-003.json spec/conformance/execution/exec-action-proxy-001.json
git commit -m "conformance: ACTION PROXY validation and execution fixtures"
```

### Task 1.11: Rebuild KMP JS dist (web-ui consumes it via @kmp-engine alias)

- [ ] **Step 1: Rebuild KMP JS production library**

```bash
cd engines/kmp-engine && ./gradlew jsNodeProductionLibraryDistribution
```
Expected: BUILD SUCCESSFUL.

- [ ] **Step 2: Verify the output**

```bash
ls engines/kmp-engine/build/dist/js/productionLibrary/kmp-engine.js
```
Expected: file exists. (No commit — this is a build artifact.)

---

## Workstream 2 — Transport abstraction

Goal: a typed HTTP client and SSE observer, isolated from React, fully unit-tested.

### Task 2.1: Define transport types

**Files:**
- Create: `engines/web-ui/src/actionProxy/types.ts`

- [ ] **Step 1: Create the file**

```ts
// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.

export type ServerState =
  | 'IDLE'
  | 'RUNNING'
  | 'PAUSED'
  | 'HELD'
  | 'COMPLETED'
  | 'ABORTED'
  | 'STOPPED'
  | 'ERRORED';

export type ActionCommand =
  | 'PAUSE'
  | 'RESUME'
  | 'HOLD'
  | 'UNHOLD'
  | 'ABORT'
  | 'STOP'
  | 'CLEAR';

export type Visibility = 'opaque' | 'observable';

export interface ActionCapability {
  action_oid: string;
  environment_oid: string;
  local_id: string;
  version: string;
  description: string | null;
  visibility: Visibility;
  supported_commands: ActionCommand[];
}

export interface ActionEventStateChange {
  kind: 'state_change';
  state: ServerState;
  previous_state: ServerState | null;
  ts: string;
  eventId: number;
}

export interface ActionEventOutput {
  kind: 'output';
  outputs: Array<{ name: string; value: string }>;
  ts: string;
  eventId: number;
}

export interface ActionEventLog {
  kind: 'log';
  stream: 'stdout' | 'stderr';
  message: string;
  ts: string;
  eventId: number;
}

export interface ActionEventHeartbeat {
  kind: 'heartbeat';
  ts: string;
}

export type ActionEvent =
  | ActionEventStateChange
  | ActionEventOutput
  | ActionEventLog
  | ActionEventHeartbeat;

export interface InstanceSnapshot {
  instance_id: string;
  action_oid: string;
  environment_oid: string;
  workflow_instance_id: string;
  step_instance_id: string;
  step_oid: string;
  visibility: Visibility;
  state: { current: ServerState; previous: ServerState | null; entered_at: string };
  inputs: Array<{ name: string; value: string }>;
  outputs: Array<{ name: string; value: string }>;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
}

export interface InvokeRequest {
  environment_oid: string;
  workflow_instance_id: string;
  step_instance_id: string;
  step_oid: string;
  input_parameters: Array<{ name: string; value: string }>;
  timeout_ms?: number;
}

export interface ActionApiError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;
}

export interface ActionInstanceObserver {
  subscribe(
    serverUri: string,
    instanceId: string,
    onEvent: (e: ActionEvent) => void,
    fromEventId?: number,
  ): () => void;
}
```

- [ ] **Step 2: Commit**

```bash
git add engines/web-ui/src/actionProxy/types.ts
git commit -m "web-ui: action proxy transport types"
```

### Task 2.2: State mapping tables (pure, easy to test)

**Files:**
- Create: `engines/web-ui/src/actionProxy/stateMapping.ts`
- Create: `engines/web-ui/src/actionProxy/stateMapping.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mapServerStateToEngineState, cardLabelFor, commandsForState } from './stateMapping.js';

test('server state IDLE maps to engine STARTING', () => {
  assert.equal(mapServerStateToEngineState('IDLE'), 'STARTING');
});

test('server state RUNNING maps to engine EXECUTING', () => {
  assert.equal(mapServerStateToEngineState('RUNNING'), 'EXECUTING');
});

test('server state HELD maps to engine PAUSED', () => {
  assert.equal(mapServerStateToEngineState('HELD'), 'PAUSED');
});

test('server state PAUSED maps to engine PAUSED', () => {
  assert.equal(mapServerStateToEngineState('PAUSED'), 'PAUSED');
});

test('server state COMPLETED maps to engine COMPLETED', () => {
  assert.equal(mapServerStateToEngineState('COMPLETED'), 'COMPLETED');
});

test('server states ABORTED/STOPPED/ERRORED map to engine ERRORED', () => {
  assert.equal(mapServerStateToEngineState('ABORTED'), 'ERRORED');
  assert.equal(mapServerStateToEngineState('STOPPED'), 'ERRORED');
  assert.equal(mapServerStateToEngineState('ERRORED'), 'ERRORED');
});

test('cardLabelFor returns the raw server state title-cased', () => {
  assert.equal(cardLabelFor('IDLE'), 'Starting');
  assert.equal(cardLabelFor('RUNNING'), 'Running');
  assert.equal(cardLabelFor('PAUSED'), 'Paused');
  assert.equal(cardLabelFor('HELD'), 'Held');
  assert.equal(cardLabelFor('COMPLETED'), 'Completed');
  assert.equal(cardLabelFor('ABORTED'), 'Aborted');
  assert.equal(cardLabelFor('STOPPED'), 'Stopped');
});

test('commandsForState: HELD shows only STOP and ABORT', () => {
  const cmds = commandsForState('HELD', ['PAUSE','RESUME','HOLD','UNHOLD','ABORT','STOP','CLEAR'], 'observable');
  assert.deepEqual(cmds.sort(), ['ABORT','STOP']);
});

test('commandsForState: RUNNING shows PAUSE/HOLD/ABORT/STOP', () => {
  const cmds = commandsForState('RUNNING', ['PAUSE','RESUME','HOLD','UNHOLD','ABORT','STOP','CLEAR'], 'observable');
  assert.deepEqual(cmds.sort(), ['ABORT','HOLD','PAUSE','STOP']);
});

test('commandsForState: PAUSED shows RESUME/ABORT/STOP', () => {
  const cmds = commandsForState('PAUSED', ['PAUSE','RESUME','HOLD','UNHOLD','ABORT','STOP','CLEAR'], 'observable');
  assert.deepEqual(cmds.sort(), ['ABORT','RESUME','STOP']);
});

test('commandsForState: opaque visibility only shows ABORT', () => {
  const cmds = commandsForState('RUNNING', ['ABORT'], 'opaque');
  assert.deepEqual(cmds, ['ABORT']);
});

test('commandsForState: hides commands not in supported_commands', () => {
  const cmds = commandsForState('RUNNING', ['ABORT','PAUSE'], 'observable');
  assert.deepEqual(cmds.sort(), ['ABORT','PAUSE']);
});

test('commandsForState: COMPLETED shows CLEAR only', () => {
  const cmds = commandsForState('COMPLETED', ['PAUSE','RESUME','HOLD','UNHOLD','ABORT','STOP','CLEAR'], 'observable');
  assert.deepEqual(cmds, ['CLEAR']);
});

test('commandsForState: ERRORED shows CLEAR and ABORT', () => {
  const cmds = commandsForState('ERRORED', ['PAUSE','RESUME','HOLD','UNHOLD','ABORT','STOP','CLEAR'], 'observable');
  assert.deepEqual(cmds.sort(), ['ABORT','CLEAR']);
});
```

- [ ] **Step 2: Run — it should fail**

```bash
cd engines/web-ui && npx tsc --noEmit && node --test src/actionProxy/stateMapping.test.ts 2>&1 | tail -5
```
Expected: FAIL (`Cannot find module './stateMapping.js'`).

- [ ] **Step 3: Implement `stateMapping.ts`**

```ts
// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import type { ActionCommand, ServerState, Visibility } from './types.js';

export type EngineStepState = 'IDLE' | 'STARTING' | 'EXECUTING' | 'PAUSED' | 'COMPLETED' | 'ERRORED';

export function mapServerStateToEngineState(s: ServerState): EngineStepState {
  switch (s) {
    case 'IDLE': return 'STARTING';
    case 'RUNNING': return 'EXECUTING';
    case 'PAUSED': return 'PAUSED';
    case 'HELD': return 'PAUSED';
    case 'COMPLETED': return 'COMPLETED';
    case 'ABORTED':
    case 'STOPPED':
    case 'ERRORED':
      return 'ERRORED';
  }
}

const CARD_LABELS: Record<ServerState, string> = {
  IDLE: 'Starting',
  RUNNING: 'Running',
  PAUSED: 'Paused',
  HELD: 'Held',
  COMPLETED: 'Completed',
  ABORTED: 'Aborted',
  STOPPED: 'Stopped',
  ERRORED: 'Errored',
};

export function cardLabelFor(s: ServerState): string {
  return CARD_LABELS[s];
}

const PER_STATE_COMMANDS: Record<ServerState, ReadonlyArray<ActionCommand>> = {
  IDLE: ['ABORT'],
  RUNNING: ['PAUSE', 'HOLD', 'ABORT', 'STOP'],
  PAUSED: ['RESUME', 'ABORT', 'STOP'],
  HELD: ['STOP', 'ABORT'],
  COMPLETED: ['CLEAR'],
  ABORTED: ['CLEAR'],
  STOPPED: ['CLEAR'],
  ERRORED: ['CLEAR', 'ABORT'],
};

export function commandsForState(
  state: ServerState,
  supported: ActionCommand[],
  visibility: Visibility,
): ActionCommand[] {
  if (visibility === 'opaque') {
    return supported.includes('ABORT') ? ['ABORT'] : [];
  }
  const supportedSet = new Set(supported);
  return PER_STATE_COMMANDS[state].filter(c => supportedSet.has(c));
}
```

- [ ] **Step 4: Run the tests**

```bash
cd engines/web-ui && npx tsc --noEmit && node --test src/actionProxy/stateMapping.test.ts 2>&1 | tail -10
```
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add engines/web-ui/src/actionProxy/stateMapping.ts engines/web-ui/src/actionProxy/stateMapping.test.ts
git commit -m "web-ui: server state and command mapping tables"
```

### Task 2.3: `ActionApiClient` — invoke, get, command, delete, capabilities

**Files:**
- Create: `engines/web-ui/src/actionProxy/ActionApiClient.ts`
- Create: `engines/web-ui/src/actionProxy/ActionApiClient.test.ts`

- [ ] **Step 1: Write the failing test for `invoke`**

```ts
// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ActionApiClient } from './ActionApiClient.js';

function makeFetchOnce(handler: (url: string, init: RequestInit) => { status: number; body: unknown }): typeof fetch {
  return async (url, init) => {
    const r = handler(String(url), init ?? {});
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json' } });
  };
}

test('invoke returns instance_id on 201', async () => {
  const client = new ActionApiClient(makeFetchOnce((url) => {
    assert.match(url, /\/trajectory\/v1\/actions\/act-1\/invoke$/);
    return { status: 201, body: { data: { instance_id: 'ai-1' }, meta: {} } };
  }));
  const { instance_id } = await client.invoke('http://localhost:3002', 'act-1', {
    environment_oid: 'env-1',
    workflow_instance_id: 'wf-1',
    step_instance_id: 'si-1',
    step_oid: 'step-1',
    input_parameters: [],
  });
  assert.equal(instance_id, 'ai-1');
});

test('invoke throws on 404 with error code and message', async () => {
  const client = new ActionApiClient(makeFetchOnce(() => ({
    status: 404,
    body: { error: { code: 'ACTION_NOT_FOUND', message: 'Unknown action', details: {} } },
  })));
  await assert.rejects(
    () => client.invoke('http://localhost:3002', 'act-1', {
      environment_oid: 'env-1', workflow_instance_id: 'wf-1', step_instance_id: 'si-1', step_oid: 'step-1', input_parameters: [],
    }),
    (e: unknown) => {
      const err = e as { code: string; status: number; message: string };
      return err.code === 'ACTION_NOT_FOUND' && err.status === 404 && err.message === 'Unknown action';
    },
  );
});

test('getInstance returns parsed snapshot', async () => {
  const client = new ActionApiClient(makeFetchOnce(() => ({
    status: 200,
    body: { data: { instance_id: 'ai-1', action_oid: 'act-1', environment_oid: 'env-1', workflow_instance_id: 'wf-1', step_instance_id: 'si-1', step_oid: 'step-1', visibility: 'observable', state: { current: 'RUNNING', previous: 'IDLE', entered_at: '2026-05-19T00:00:01Z' }, inputs: [], outputs: [], created_at: '2026-05-19T00:00:00Z', started_at: '2026-05-19T00:00:01Z', completed_at: null, error: null }, meta: {} },
  })));
  const snap = await client.getInstance('http://localhost:3002', 'ai-1');
  assert.equal(snap.state.current, 'RUNNING');
});

test('sendCommand throws ApiError with 409 details on invalid state transition', async () => {
  const client = new ActionApiClient(makeFetchOnce(() => ({
    status: 409,
    body: { error: { code: 'INVALID_STATE_TRANSITION', message: 'Cannot PAUSE while COMPLETED', details: { current_state: 'COMPLETED', command: 'PAUSE' } } },
  })));
  await assert.rejects(
    () => client.sendCommand('http://localhost:3002', 'ai-1', 'PAUSE'),
    (e: unknown) => {
      const err = e as { code: string; status: number; details?: Record<string, unknown> };
      return err.code === 'INVALID_STATE_TRANSITION' && err.status === 409 && err.details?.current_state === 'COMPLETED';
    },
  );
});

test('deleteInstance tolerates 404', async () => {
  const client = new ActionApiClient(makeFetchOnce(() => ({
    status: 404,
    body: { error: { code: 'INSTANCE_NOT_FOUND', message: 'gone', details: {} } },
  })));
  // Should NOT throw — 404 on DELETE is idempotent.
  await client.deleteInstance('http://localhost:3002', 'ai-1');
});

test('getCapabilities returns the list', async () => {
  const client = new ActionApiClient(makeFetchOnce(() => ({
    status: 200,
    body: { data: [{ action_oid: 'act-1', environment_oid: 'env-1', local_id: 'PickAndPlace', version: '1.0', description: null, visibility: 'observable', supported_commands: ['PAUSE','RESUME','HOLD','UNHOLD','ABORT','STOP','CLEAR'], input_parameters: [], output_parameters: [] }], meta: { total: 1 } },
  })));
  const caps = await client.getCapabilities('http://localhost:3002');
  assert.equal(caps.length, 1);
  assert.equal(caps[0].action_oid, 'act-1');
  assert.equal(caps[0].visibility, 'observable');
});
```

- [ ] **Step 2: Run — it should fail**

```bash
cd engines/web-ui && npx tsc --noEmit && node --test src/actionProxy/ActionApiClient.test.ts 2>&1 | tail -5
```
Expected: FAIL (`Cannot find module './ActionApiClient.js'`).

- [ ] **Step 3: Implement `ActionApiClient.ts`**

```ts
// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import type {
  ActionApiError,
  ActionCapability,
  ActionCommand,
  InstanceSnapshot,
  InvokeRequest,
} from './types.js';

export type FetchLike = typeof fetch;

class ApiErrorImpl extends Error implements ActionApiError {
  status: number;
  code: string;
  details?: Record<string, unknown>;
  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function readJson(resp: Response): Promise<unknown> {
  const txt = await resp.text();
  if (!txt) return null;
  try { return JSON.parse(txt); } catch { return null; }
}

async function unwrapError(resp: Response): Promise<ApiErrorImpl> {
  const body = (await readJson(resp)) as { error?: { code?: string; message?: string; details?: Record<string, unknown> } } | null;
  const err = body?.error;
  return new ApiErrorImpl(
    resp.status,
    err?.code ?? `HTTP_${resp.status}`,
    err?.message ?? resp.statusText,
    err?.details,
  );
}

export class ActionApiClient {
  constructor(private fetchImpl: FetchLike = fetch) {}

  async invoke(serverUri: string, actionOid: string, body: InvokeRequest): Promise<{ instance_id: string }> {
    const resp = await this.fetchImpl(`${serverUri}/trajectory/v1/actions/${encodeURIComponent(actionOid)}/invoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (resp.status !== 201) throw await unwrapError(resp);
    const json = (await readJson(resp)) as { data: { instance_id: string } };
    return { instance_id: json.data.instance_id };
  }

  async getInstance(serverUri: string, instanceId: string): Promise<InstanceSnapshot> {
    const resp = await this.fetchImpl(`${serverUri}/trajectory/v1/instances/${encodeURIComponent(instanceId)}`);
    if (resp.status !== 200) throw await unwrapError(resp);
    const json = (await readJson(resp)) as { data: InstanceSnapshot };
    return json.data;
  }

  async sendCommand(serverUri: string, instanceId: string, command: ActionCommand): Promise<void> {
    const resp = await this.fetchImpl(`${serverUri}/trajectory/v1/instances/${encodeURIComponent(instanceId)}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command }),
    });
    if (resp.status !== 200) throw await unwrapError(resp);
  }

  async deleteInstance(serverUri: string, instanceId: string): Promise<void> {
    const resp = await this.fetchImpl(`${serverUri}/trajectory/v1/instances/${encodeURIComponent(instanceId)}`, { method: 'DELETE' });
    if (resp.status === 404 || resp.status === 200) return;  // idempotent
    throw await unwrapError(resp);
  }

  async getCapabilities(serverUri: string): Promise<ActionCapability[]> {
    const resp = await this.fetchImpl(`${serverUri}/trajectory/v1/capabilities`);
    if (resp.status !== 200) throw await unwrapError(resp);
    const json = (await readJson(resp)) as { data: ActionCapability[] };
    return json.data;
  }
}
```

- [ ] **Step 4: Run the tests**

```bash
cd engines/web-ui && npx tsc --noEmit && node --test src/actionProxy/ActionApiClient.test.ts 2>&1 | tail -10
```
Expected: all six tests PASS.

- [ ] **Step 5: Commit**

```bash
git add engines/web-ui/src/actionProxy/ActionApiClient.ts engines/web-ui/src/actionProxy/ActionApiClient.test.ts
git commit -m "web-ui: ActionApiClient for invoke/get/command/delete/capabilities"
```

### Task 2.4: Retry-with-backoff helper for transport failures

**Files:**
- Create: `engines/web-ui/src/actionProxy/retry.ts`
- Create: `engines/web-ui/src/actionProxy/retry.test.ts`

Per spec §5.4 step 3, transport-level failures (network timeout, connection refused) retry with exponential backoff (250 ms, 500 ms, 1 s, 2 s, 5 s, 15 s, 30 s cap). Logic-level errors (an `ActionApiError` with a code) propagate immediately.

- [ ] **Step 1: Failing tests**

```ts
// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { retryTransport, TRANSPORT_BACKOFFS_MS } from './retry.js';

test('retryTransport returns immediately on success', async () => {
  let calls = 0;
  const result = await retryTransport(() => { calls++; return Promise.resolve('ok'); }, { sleep: async () => {} });
  assert.equal(result, 'ok');
  assert.equal(calls, 1);
});

test('retryTransport retries transport errors and eventually succeeds', async () => {
  let calls = 0;
  const sleeps: number[] = [];
  const result = await retryTransport(
    () => {
      calls++;
      if (calls < 3) return Promise.reject(new TypeError('Failed to fetch'));
      return Promise.resolve('ok');
    },
    { sleep: async (ms) => { sleeps.push(ms); } },
  );
  assert.equal(result, 'ok');
  assert.equal(calls, 3);
  assert.deepEqual(sleeps, [250, 500]);
});

test('retryTransport gives up after all backoffs exhausted', async () => {
  let calls = 0;
  const sleeps: number[] = [];
  await assert.rejects(
    () => retryTransport(
      () => { calls++; return Promise.reject(new TypeError('Failed to fetch')); },
      { sleep: async (ms) => { sleeps.push(ms); } },
    ),
    (e: unknown) => (e as Error).message === 'Failed to fetch',
  );
  assert.equal(calls, TRANSPORT_BACKOFFS_MS.length + 1);
  assert.deepEqual(sleeps, [...TRANSPORT_BACKOFFS_MS]);
});

test('retryTransport propagates logic errors immediately', async () => {
  let calls = 0;
  const apiError = Object.assign(new Error('Unknown action'), { code: 'ACTION_NOT_FOUND', status: 404 });
  await assert.rejects(
    () => retryTransport(() => { calls++; return Promise.reject(apiError); }, { sleep: async () => {} }),
    (e: unknown) => (e as { code: string }).code === 'ACTION_NOT_FOUND',
  );
  assert.equal(calls, 1);
});

test('retryTransport reports each attempt via onAttempt', async () => {
  const attempts: number[] = [];
  let calls = 0;
  await retryTransport(
    () => { calls++; if (calls < 2) return Promise.reject(new TypeError('Failed to fetch')); return Promise.resolve('ok'); },
    { sleep: async () => {}, onAttempt: n => attempts.push(n) },
  );
  assert.deepEqual(attempts, [1, 2]);
});
```

- [ ] **Step 2: Run — fail**

```bash
cd engines/web-ui && npx tsc --noEmit && node --test src/actionProxy/retry.test.ts 2>&1 | tail -5
```
Expected: FAIL (`Cannot find module './retry.js'`).

- [ ] **Step 3: Implement**

```ts
// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.

export const TRANSPORT_BACKOFFS_MS: ReadonlyArray<number> = [250, 500, 1000, 2000, 5000, 15000, 30000];

interface RetryOptions {
  sleep?: (ms: number) => Promise<void>;
  onAttempt?: (attemptNumber: number) => void;
  backoffs?: ReadonlyArray<number>;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function isTransportError(e: unknown): boolean {
  // Logic errors are tagged with `code` and `status` by ActionApiClient.
  // TypeError from fetch (e.g., "Failed to fetch"), DOMException AbortError,
  // and any error WITHOUT a `code` field are treated as transport-level.
  const err = e as { code?: unknown };
  return err.code === undefined;
}

export async function retryTransport<T>(
  op: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const sleep = opts.sleep ?? defaultSleep;
  const backoffs = opts.backoffs ?? TRANSPORT_BACKOFFS_MS;
  let attempt = 0;
  for (;;) {
    attempt++;
    opts.onAttempt?.(attempt);
    try {
      return await op();
    } catch (e) {
      if (!isTransportError(e)) throw e;
      const idx = attempt - 1;
      if (idx >= backoffs.length) throw e;
      await sleep(backoffs[idx]);
    }
  }
}
```

- [ ] **Step 4: Run — pass**

```bash
cd engines/web-ui && npx tsc --noEmit && node --test src/actionProxy/retry.test.ts 2>&1 | tail -10
```
Expected: all five tests PASS.

- [ ] **Step 5: Commit**

```bash
git add engines/web-ui/src/actionProxy/retry.ts engines/web-ui/src/actionProxy/retry.test.ts
git commit -m "web-ui: retryTransport with exponential backoff for network failures"
```

### Task 2.5: `SseObserver` — EventSource wrapper with reconnect

**Files:**
- Create: `engines/web-ui/src/actionProxy/SseObserver.ts`
- Create: `engines/web-ui/src/actionProxy/SseObserver.test.ts`

- [ ] **Step 1: Write the failing test using a fake EventSource**

```ts
// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { SseObserver } from './SseObserver.js';
import type { ActionEvent } from './types.js';

interface FakeListener { (ev: { data: string; lastEventId?: string }): void; }

class FakeEventSource {
  static last: FakeEventSource | null = null;
  url: string;
  withCredentials = false;
  readyState = 0;
  onerror: ((ev: Event) => void) | null = null;
  private listeners = new Map<string, FakeListener[]>();
  constructor(url: string) {
    this.url = url;
    FakeEventSource.last = this;
  }
  addEventListener(type: string, listener: FakeListener): void {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type)!.push(listener);
  }
  close(): void { this.readyState = 2; }
  emit(type: string, data: unknown, id?: number): void {
    const ls = this.listeners.get(type) ?? [];
    for (const l of ls) l({ data: JSON.stringify(data), lastEventId: id?.toString() });
  }
}

test('SseObserver routes state_change events to onEvent', async () => {
  const received: ActionEvent[] = [];
  const observer = new SseObserver(FakeEventSource as unknown as typeof EventSource);
  const unsub = observer.subscribe('http://localhost:3002', 'ai-1', e => received.push(e));
  assert.match(FakeEventSource.last!.url, /\/trajectory\/v1\/instances\/ai-1\/events$/);

  FakeEventSource.last!.emit('state_change', { instance_id: 'ai-1', state: 'RUNNING', previous_state: 'IDLE', timestamp: '2026-05-19T00:00:00Z' }, 1);
  assert.equal(received.length, 1);
  assert.equal(received[0].kind, 'state_change');
  if (received[0].kind === 'state_change') {
    assert.equal(received[0].state, 'RUNNING');
    assert.equal(received[0].eventId, 1);
  }
  unsub();
});

test('SseObserver routes output events', async () => {
  const received: ActionEvent[] = [];
  const observer = new SseObserver(FakeEventSource as unknown as typeof EventSource);
  observer.subscribe('http://localhost:3002', 'ai-2', e => received.push(e));
  FakeEventSource.last!.emit('output', { instance_id: 'ai-2', outputs: [{ name: 'duration_ms', value: '500' }], timestamp: '2026-05-19T00:00:01Z' }, 2);
  assert.equal(received.length, 1);
  assert.equal(received[0].kind, 'output');
});

test('SseObserver routes log events', async () => {
  const received: ActionEvent[] = [];
  const observer = new SseObserver(FakeEventSource as unknown as typeof EventSource);
  observer.subscribe('http://localhost:3002', 'ai-3', e => received.push(e));
  FakeEventSource.last!.emit('log', { instance_id: 'ai-3', stream: 'stderr', message: 'boom', timestamp: '2026-05-19T00:00:02Z' }, 3);
  assert.equal(received.length, 1);
  assert.equal(received[0].kind, 'log');
});

test('SseObserver close stops further events', async () => {
  const received: ActionEvent[] = [];
  const observer = new SseObserver(FakeEventSource as unknown as typeof EventSource);
  const unsub = observer.subscribe('http://localhost:3002', 'ai-4', e => received.push(e));
  const es = FakeEventSource.last!;
  unsub();
  assert.equal(es.readyState, 2); // closed
});
```

- [ ] **Step 2: Run — it should fail**

```bash
cd engines/web-ui && npx tsc --noEmit && node --test src/actionProxy/SseObserver.test.ts 2>&1 | tail -5
```
Expected: FAIL (`Cannot find module './SseObserver.js'`).

- [ ] **Step 3: Implement `SseObserver.ts`**

```ts
// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import type { ActionEvent, ActionInstanceObserver, ServerState } from './types.js';

type ESCtor = typeof EventSource;

export class SseObserver implements ActionInstanceObserver {
  constructor(private ESImpl: ESCtor = typeof EventSource !== 'undefined' ? EventSource : (undefined as unknown as ESCtor)) {
    if (!this.ESImpl) throw new Error('SseObserver requires EventSource (browser or polyfill).');
  }

  subscribe(serverUri: string, instanceId: string, onEvent: (e: ActionEvent) => void): () => void {
    const url = `${serverUri}/trajectory/v1/instances/${encodeURIComponent(instanceId)}/events`;
    const es = new this.ESImpl(url);

    es.addEventListener('state_change', (ev: MessageEvent) => {
      const data = JSON.parse(ev.data) as { state: ServerState; previous_state: ServerState | null; timestamp: string };
      onEvent({ kind: 'state_change', state: data.state, previous_state: data.previous_state, ts: data.timestamp, eventId: Number(ev.lastEventId) });
    });

    es.addEventListener('output', (ev: MessageEvent) => {
      const data = JSON.parse(ev.data) as { outputs: Array<{ name: string; value: string }>; timestamp: string };
      onEvent({ kind: 'output', outputs: data.outputs, ts: data.timestamp, eventId: Number(ev.lastEventId) });
    });

    es.addEventListener('log', (ev: MessageEvent) => {
      const data = JSON.parse(ev.data) as { stream: 'stdout' | 'stderr'; message: string; timestamp: string };
      onEvent({ kind: 'log', stream: data.stream, message: data.message, ts: data.timestamp, eventId: Number(ev.lastEventId) });
    });

    es.addEventListener('heartbeat', (ev: MessageEvent) => {
      const data = JSON.parse(ev.data) as { timestamp: string };
      onEvent({ kind: 'heartbeat', ts: data.timestamp });
    });

    return () => es.close();
  }
}
```

- [ ] **Step 4: Run the tests**

```bash
cd engines/web-ui && npx tsc --noEmit && node --test src/actionProxy/SseObserver.test.ts 2>&1 | tail -10
```
Expected: all four tests PASS.

- [ ] **Step 5: Commit**

```bash
git add engines/web-ui/src/actionProxy/SseObserver.ts engines/web-ui/src/actionProxy/SseObserver.test.ts
git commit -m "web-ui: SseObserver wraps EventSource as ActionInstanceObserver"
```

---

## Workstream 3 — Coordinator + persistence

Goal: per-step `ActionProxyController` orchestrates invoke + SSE + state mapping + commands + terminal outputs handoff. Persistence slice survives reloads. `WorkflowCoordinator` is the integration point.

### Task 3.1: Persistence slice

**Files:**
- Create: `engines/web-ui/src/actionProxy/persistence.ts`
- Create: `engines/web-ui/src/actionProxy/persistence.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PersistenceStore } from './persistence.js';

class FakeStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number { return this.map.size; }
  clear(): void { this.map.clear(); }
  getItem(k: string): string | null { return this.map.get(k) ?? null; }
  key(i: number): string | null { return [...this.map.keys()][i] ?? null; }
  removeItem(k: string): void { this.map.delete(k); }
  setItem(k: string, v: string): void { this.map.set(k, v); }
}

test('upsert + readAll roundtrips entries', () => {
  const s = new PersistenceStore(new FakeStorage());
  s.upsert({ workflowInstanceId: 'wf1', stepInstanceId: 'si1', stepOid: 'step1', instanceId: 'ai1', serverUri: 'http://localhost:3002', environmentOid: 'env1', lastKnownServerState: 'RUNNING', lastEventId: 5 });
  s.flushSync();
  const all = s.readAll();
  assert.equal(all.length, 1);
  assert.equal(all[0].instanceId, 'ai1');
  assert.equal(all[0].lastEventId, 5);
});

test('upsert by stepInstanceId is idempotent', () => {
  const s = new PersistenceStore(new FakeStorage());
  s.upsert({ workflowInstanceId: 'wf1', stepInstanceId: 'si1', stepOid: 'step1', instanceId: 'ai1', serverUri: 'http://localhost:3002', environmentOid: 'env1', lastKnownServerState: 'RUNNING', lastEventId: 5 });
  s.upsert({ workflowInstanceId: 'wf1', stepInstanceId: 'si1', stepOid: 'step1', instanceId: 'ai1', serverUri: 'http://localhost:3002', environmentOid: 'env1', lastKnownServerState: 'COMPLETED', lastEventId: 7 });
  s.flushSync();
  assert.equal(s.readAll().length, 1);
  assert.equal(s.readAll()[0].lastKnownServerState, 'COMPLETED');
});

test('remove deletes by stepInstanceId', () => {
  const s = new PersistenceStore(new FakeStorage());
  s.upsert({ workflowInstanceId: 'wf1', stepInstanceId: 'si1', stepOid: 'step1', instanceId: 'ai1', serverUri: 'http://localhost:3002', environmentOid: 'env1', lastKnownServerState: 'RUNNING', lastEventId: 1 });
  s.upsert({ workflowInstanceId: 'wf1', stepInstanceId: 'si2', stepOid: 'step2', instanceId: 'ai2', serverUri: 'http://localhost:3002', environmentOid: 'env1', lastKnownServerState: 'RUNNING', lastEventId: 1 });
  s.remove('si1');
  s.flushSync();
  const all = s.readAll();
  assert.equal(all.length, 1);
  assert.equal(all[0].stepInstanceId, 'si2');
});

test('removeWorkflow deletes all entries for workflow', () => {
  const s = new PersistenceStore(new FakeStorage());
  s.upsert({ workflowInstanceId: 'wf1', stepInstanceId: 'si1', stepOid: 'step1', instanceId: 'ai1', serverUri: 'http://localhost:3002', environmentOid: 'env1', lastKnownServerState: 'RUNNING', lastEventId: 1 });
  s.upsert({ workflowInstanceId: 'wf2', stepInstanceId: 'si2', stepOid: 'step2', instanceId: 'ai2', serverUri: 'http://localhost:3002', environmentOid: 'env1', lastKnownServerState: 'RUNNING', lastEventId: 1 });
  s.removeWorkflow('wf1');
  s.flushSync();
  assert.equal(s.readAll().length, 1);
});

test('migrates from corrupted storage by resetting', () => {
  const fs = new FakeStorage();
  fs.setItem('trajectory.actionProxyState.v1', '{not valid json');
  const s = new PersistenceStore(fs);
  assert.equal(s.readAll().length, 0);
});
```

- [ ] **Step 2: Run — should fail**

```bash
cd engines/web-ui && npx tsc --noEmit && node --test src/actionProxy/persistence.test.ts 2>&1 | tail -5
```
Expected: FAIL (`Cannot find module './persistence.js'`).

- [ ] **Step 3: Implement `persistence.ts`**

```ts
// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.

export interface PersistedInstance {
  workflowInstanceId: string;
  stepInstanceId: string;
  stepOid: string;
  instanceId: string;
  serverUri: string;
  environmentOid: string;
  lastKnownServerState: string;
  lastEventId: number | null;
}

interface PersistedSlice {
  version: 1;
  instances: PersistedInstance[];
}

const KEY = 'trajectory.actionProxyState.v1';

export class PersistenceStore {
  private slice: PersistedSlice;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly DEBOUNCE_MS = 250;

  constructor(private storage: Storage = (typeof localStorage !== 'undefined' ? localStorage : (null as unknown as Storage))) {
    this.slice = this.load();
  }

  private load(): PersistedSlice {
    const raw = this.storage?.getItem(KEY);
    if (!raw) return { version: 1, instances: [] };
    try {
      const parsed = JSON.parse(raw) as PersistedSlice;
      if (parsed?.version !== 1 || !Array.isArray(parsed.instances)) throw new Error('shape');
      return parsed;
    } catch {
      return { version: 1, instances: [] };
    }
  }

  readAll(): PersistedInstance[] {
    return [...this.slice.instances];
  }

  upsert(entry: PersistedInstance): void {
    const idx = this.slice.instances.findIndex(e => e.stepInstanceId === entry.stepInstanceId);
    if (idx >= 0) this.slice.instances[idx] = entry;
    else this.slice.instances.push(entry);
    this.scheduleWrite();
  }

  remove(stepInstanceId: string): void {
    this.slice.instances = this.slice.instances.filter(e => e.stepInstanceId !== stepInstanceId);
    this.scheduleWrite();
  }

  removeWorkflow(workflowInstanceId: string): void {
    this.slice.instances = this.slice.instances.filter(e => e.workflowInstanceId !== workflowInstanceId);
    this.scheduleWrite();
  }

  flushSync(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.write();
  }

  private scheduleWrite(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = null; this.write(); }, this.DEBOUNCE_MS);
  }

  private write(): void {
    if (!this.storage) return;
    this.storage.setItem(KEY, JSON.stringify(this.slice));
  }
}
```

- [ ] **Step 4: Run tests**

```bash
cd engines/web-ui && npx tsc --noEmit && node --test src/actionProxy/persistence.test.ts 2>&1 | tail -10
```
Expected: all five tests PASS.

- [ ] **Step 5: Commit**

```bash
git add engines/web-ui/src/actionProxy/persistence.ts engines/web-ui/src/actionProxy/persistence.test.ts
git commit -m "web-ui: action proxy persistence slice (localStorage, debounced)"
```

### Task 3.2: `ActionProxyController` — invoke + observe + state mapping + outputs

**Files:**
- Create: `engines/web-ui/src/actionProxy/ActionProxyController.ts`
- Create: `engines/web-ui/src/actionProxy/ActionProxyController.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ActionProxyController } from './ActionProxyController.js';
import { PersistenceStore } from './persistence.js';
import type { ActionEvent, ActionInstanceObserver } from './types.js';

class FakeStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number { return this.map.size; }
  clear(): void { this.map.clear(); }
  getItem(k: string): string | null { return this.map.get(k) ?? null; }
  key(i: number): string | null { return [...this.map.keys()][i] ?? null; }
  removeItem(k: string): void { this.map.delete(k); }
  setItem(k: string, v: string): void { this.map.set(k, v); }
}

class FakeObserver implements ActionInstanceObserver {
  private handlers: Array<(e: ActionEvent) => void> = [];
  subscribe(_uri: string, _id: string, onEvent: (e: ActionEvent) => void): () => void {
    this.handlers.push(onEvent);
    return () => { this.handlers = this.handlers.filter(h => h !== onEvent); };
  }
  emit(e: ActionEvent): void { for (const h of this.handlers) h(e); }
}

function fakeFetch(invokeResult: { status: number; body: unknown }, commandResult?: { status: number; body: unknown }) {
  let calls = 0;
  return async (url: string, _init: RequestInit) => {
    calls++;
    if (url.includes('/invoke')) return new Response(JSON.stringify(invokeResult.body), { status: invokeResult.status, headers: { 'Content-Type': 'application/json' } });
    if (url.includes('/command')) {
      const r = commandResult ?? { status: 200, body: { data: {}, meta: {} } };
      return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith('/instances/ai-1')) return new Response('', { status: 200 });
    throw new Error(`unexpected ${url}`);
  };
}

interface CapturedTerminal {
  state: 'COMPLETED' | 'ERRORED';
  outputs: Record<string, string>;
  errorMessage: string | null;
}

test('invokes and subscribes, then on COMPLETED writes outputs and signals terminal', async () => {
  const store = new PersistenceStore(new FakeStorage());
  const observer = new FakeObserver();
  const captured: CapturedTerminal[] = [];
  const controller = new ActionProxyController({
    serverUri: 'http://localhost:3002',
    actionOid: 'act-1',
    invokeRequest: { environment_oid: 'env-1', workflow_instance_id: 'wf-1', step_instance_id: 'si-1', step_oid: 'step-1', input_parameters: [{ name: 'src', value: 'A' }] },
    visibility: 'observable',
    supportedCommands: ['PAUSE','RESUME','HOLD','UNHOLD','ABORT','STOP','CLEAR'],
    persistence: store,
    observer,
    fetchImpl: fakeFetch({ status: 201, body: { data: { instance_id: 'ai-1' }, meta: {} } }) as typeof fetch,
    onTerminal: t => captured.push(t),
  });
  await controller.start();
  assert.equal(store.readAll().length, 1);
  observer.emit({ kind: 'state_change', state: 'RUNNING', previous_state: 'IDLE', ts: '2026-05-19T00:00:01Z', eventId: 1 });
  assert.equal(controller.getSnapshot().serverState, 'RUNNING');
  observer.emit({ kind: 'output', outputs: [{ name: 'duration_ms', value: '500' }], ts: '2026-05-19T00:00:02Z', eventId: 2 });
  observer.emit({ kind: 'state_change', state: 'COMPLETED', previous_state: 'RUNNING', ts: '2026-05-19T00:00:03Z', eventId: 3 });
  assert.equal(captured.length, 1);
  assert.equal(captured[0].state, 'COMPLETED');
  assert.deepEqual(captured[0].outputs, { duration_ms: '500' });
  store.flushSync();
  assert.equal(store.readAll().length, 0);
});

test('on ABORTED signals terminal as ERRORED', async () => {
  const observer = new FakeObserver();
  const captured: CapturedTerminal[] = [];
  const controller = new ActionProxyController({
    serverUri: 'http://localhost:3002',
    actionOid: 'act-1',
    invokeRequest: { environment_oid: 'env-1', workflow_instance_id: 'wf-1', step_instance_id: 'si-1', step_oid: 'step-1', input_parameters: [] },
    visibility: 'observable',
    supportedCommands: ['ABORT'],
    persistence: new PersistenceStore(new FakeStorage()),
    observer,
    fetchImpl: fakeFetch({ status: 201, body: { data: { instance_id: 'ai-1' }, meta: {} } }) as typeof fetch,
    onTerminal: t => captured.push(t),
  });
  await controller.start();
  observer.emit({ kind: 'state_change', state: 'ABORTED', previous_state: 'RUNNING', ts: '2026-05-19T00:00:00Z', eventId: 1 });
  assert.equal(captured.length, 1);
  assert.equal(captured[0].state, 'ERRORED');
});

test('sendCommand 409 captures error but stays subscribed', async () => {
  const observer = new FakeObserver();
  const controller = new ActionProxyController({
    serverUri: 'http://localhost:3002',
    actionOid: 'act-1',
    invokeRequest: { environment_oid: 'env-1', workflow_instance_id: 'wf-1', step_instance_id: 'si-1', step_oid: 'step-1', input_parameters: [] },
    visibility: 'observable',
    supportedCommands: ['PAUSE','RESUME','ABORT'],
    persistence: new PersistenceStore(new FakeStorage()),
    observer,
    fetchImpl: fakeFetch(
      { status: 201, body: { data: { instance_id: 'ai-1' }, meta: {} } },
      { status: 409, body: { error: { code: 'INVALID_STATE_TRANSITION', message: 'no', details: { current_state: 'COMPLETED' } } } },
    ) as typeof fetch,
    onTerminal: () => {},
  });
  await controller.start();
  await assert.rejects(() => controller.sendCommand('PAUSE'), (e: unknown) => (e as { code: string }).code === 'INVALID_STATE_TRANSITION');
});

test('logs ring caps at 100 entries', async () => {
  const observer = new FakeObserver();
  const controller = new ActionProxyController({
    serverUri: 'http://localhost:3002',
    actionOid: 'act-1',
    invokeRequest: { environment_oid: 'env-1', workflow_instance_id: 'wf-1', step_instance_id: 'si-1', step_oid: 'step-1', input_parameters: [] },
    visibility: 'observable',
    supportedCommands: ['ABORT'],
    persistence: new PersistenceStore(new FakeStorage()),
    observer,
    fetchImpl: fakeFetch({ status: 201, body: { data: { instance_id: 'ai-1' }, meta: {} } }) as typeof fetch,
    onTerminal: () => {},
  });
  await controller.start();
  for (let i = 0; i < 120; i++) {
    observer.emit({ kind: 'log', stream: 'stdout', message: `msg ${i}`, ts: '2026-05-19T00:00:00Z', eventId: i + 1 });
  }
  const logs = controller.getSnapshot().logs;
  assert.equal(logs.length, 100);
  assert.equal(logs[0].message, 'msg 20');
  assert.equal(logs[99].message, 'msg 119');
});
```

- [ ] **Step 2: Run — should fail**

```bash
cd engines/web-ui && npx tsc --noEmit && node --test src/actionProxy/ActionProxyController.test.ts 2>&1 | tail -5
```
Expected: FAIL (`Cannot find module './ActionProxyController.js'`).

- [ ] **Step 3: Implement `ActionProxyController.ts`**

```ts
// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { ActionApiClient } from './ActionApiClient.js';
import { mapServerStateToEngineState } from './stateMapping.js';
import type { PersistenceStore } from './persistence.js';
import { retryTransport } from './retry.js';
import type {
  ActionCommand,
  ActionEvent,
  ActionInstanceObserver,
  InvokeRequest,
  ServerState,
  Visibility,
} from './types.js';

export interface ControllerConfig {
  serverUri: string;
  actionOid: string;
  invokeRequest: InvokeRequest;
  visibility: Visibility;
  supportedCommands: ActionCommand[];
  persistence: PersistenceStore;
  observer: ActionInstanceObserver;
  fetchImpl?: typeof fetch;
  onTerminal: (t: { state: 'COMPLETED' | 'ERRORED'; outputs: Record<string, string>; errorMessage: string | null }) => void;
}

export interface ControllerSnapshot {
  instanceId: string | null;
  serverState: ServerState | null;
  inputs: Array<{ name: string; value: string }>;
  outputs: Record<string, string>;
  logs: Array<{ stream: 'stdout' | 'stderr'; message: string; ts: string }>;
  commandInFlight: ActionCommand | null;
  visibility: Visibility;
  supportedCommands: ActionCommand[];
}

const TERMINAL_SERVER_STATES: readonly ServerState[] = ['COMPLETED', 'ABORTED', 'STOPPED', 'ERRORED'];

export class ActionProxyController {
  private api: ActionApiClient;
  private snapshot: ControllerSnapshot;
  private unsubscribe: (() => void) | null = null;
  private listeners = new Set<() => void>();
  private outputs = new Map<string, string>();
  private lastEventId: number | null = null;
  private terminalEmitted = false;

  constructor(private cfg: ControllerConfig) {
    this.api = new ActionApiClient(cfg.fetchImpl ?? fetch);
    this.snapshot = {
      instanceId: null,
      serverState: null,
      inputs: cfg.invokeRequest.input_parameters,
      outputs: {},
      logs: [],
      commandInFlight: null,
      visibility: cfg.visibility,
      supportedCommands: cfg.supportedCommands,
    };
  }

  getSnapshot = (): ControllerSnapshot => this.snapshot;

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  async start(): Promise<void> {
    const { instance_id } = await retryTransport(
      () => this.api.invoke(this.cfg.serverUri, this.cfg.actionOid, this.cfg.invokeRequest),
      { onAttempt: n => { if (n > 1) console.log(`[ActionProxy] invoke retry attempt ${n}`); } },
    );
    this.setSnapshot({ ...this.snapshot, instanceId: instance_id, serverState: 'IDLE' });
    this.cfg.persistence.upsert({
      workflowInstanceId: this.cfg.invokeRequest.workflow_instance_id,
      stepInstanceId: this.cfg.invokeRequest.step_instance_id,
      stepOid: this.cfg.invokeRequest.step_oid,
      instanceId: instance_id,
      serverUri: this.cfg.serverUri,
      environmentOid: this.cfg.invokeRequest.environment_oid,
      lastKnownServerState: 'IDLE',
      lastEventId: null,
    });
    this.unsubscribe = this.cfg.observer.subscribe(this.cfg.serverUri, instance_id, e => this.onEvent(e));
  }

  /** Reconnect to an instance whose ID we already know (reload-mid-flight path). */
  async reconnect(instanceId: string, fromEventId: number | null): Promise<void> {
    this.setSnapshot({ ...this.snapshot, instanceId });
    try {
      const snap = await this.api.getInstance(this.cfg.serverUri, instanceId);
      this.applyServerState(snap.state.current);
      for (const o of snap.outputs) this.outputs.set(o.name, o.value);
      this.setSnapshot({ ...this.snapshot, outputs: Object.fromEntries(this.outputs) });
      if (TERMINAL_SERVER_STATES.includes(snap.state.current)) {
        this.emitTerminal(snap.state.current, snap.error);
        return;
      }
    } catch (e) {
      const code = (e as { code?: string; status?: number }).code;
      if (code === 'INSTANCE_NOT_FOUND' || (e as { status?: number }).status === 404) {
        this.emitTerminal('ERRORED', 'Instance lost on server');
        return;
      }
      // network — fall through and subscribe anyway; SSE will reconcile
    }
    this.lastEventId = fromEventId;
    this.unsubscribe = this.cfg.observer.subscribe(this.cfg.serverUri, instanceId, e => this.onEvent(e));
  }

  async sendCommand(command: ActionCommand): Promise<void> {
    if (!this.snapshot.instanceId) throw new Error('no instance');
    this.setSnapshot({ ...this.snapshot, commandInFlight: command });
    try {
      await this.api.sendCommand(this.cfg.serverUri, this.snapshot.instanceId, command);
    } finally {
      this.setSnapshot({ ...this.snapshot, commandInFlight: null });
    }
  }

  dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  private onEvent(e: ActionEvent): void {
    if (e.kind === 'state_change') {
      this.applyServerState(e.state);
      this.lastEventId = e.eventId;
      this.persistLastEvent();
      if (TERMINAL_SERVER_STATES.includes(e.state)) {
        this.emitTerminal(e.state, null);
      }
    } else if (e.kind === 'output') {
      for (const o of e.outputs) this.outputs.set(o.name, o.value);
      this.setSnapshot({ ...this.snapshot, outputs: Object.fromEntries(this.outputs) });
      this.lastEventId = e.eventId;
      this.persistLastEvent();
    } else if (e.kind === 'log') {
      const next = [...this.snapshot.logs, { stream: e.stream, message: e.message, ts: e.ts }].slice(-100);
      this.setSnapshot({ ...this.snapshot, logs: next });
    }
    // heartbeat ignored for snapshot purposes
  }

  private applyServerState(s: ServerState): void {
    this.setSnapshot({ ...this.snapshot, serverState: s });
  }

  private persistLastEvent(): void {
    if (!this.snapshot.instanceId) return;
    this.cfg.persistence.upsert({
      workflowInstanceId: this.cfg.invokeRequest.workflow_instance_id,
      stepInstanceId: this.cfg.invokeRequest.step_instance_id,
      stepOid: this.cfg.invokeRequest.step_oid,
      instanceId: this.snapshot.instanceId,
      serverUri: this.cfg.serverUri,
      environmentOid: this.cfg.invokeRequest.environment_oid,
      lastKnownServerState: this.snapshot.serverState ?? 'IDLE',
      lastEventId: this.lastEventId,
    });
  }

  private emitTerminal(state: ServerState, errorMessage: string | null): void {
    if (this.terminalEmitted) return;
    this.terminalEmitted = true;
    this.dispose();
    const engineState = mapServerStateToEngineState(state);
    this.cfg.persistence.remove(this.cfg.invokeRequest.step_instance_id);
    this.cfg.persistence.flushSync();
    this.cfg.onTerminal({
      state: engineState === 'COMPLETED' ? 'COMPLETED' : 'ERRORED',
      outputs: Object.fromEntries(this.outputs),
      errorMessage,
    });
  }

  private setSnapshot(next: ControllerSnapshot): void {
    this.snapshot = next;
    for (const l of this.listeners) l();
  }
}
```

- [ ] **Step 4: Run tests**

```bash
cd engines/web-ui && npx tsc --noEmit && node --test src/actionProxy/ActionProxyController.test.ts 2>&1 | tail -10
```
Expected: all four tests PASS.

- [ ] **Step 5: Commit**

```bash
git add engines/web-ui/src/actionProxy/ActionProxyController.ts engines/web-ui/src/actionProxy/ActionProxyController.test.ts
git commit -m "web-ui: ActionProxyController orchestrates invoke/SSE/state/outputs/persistence"
```

### Task 3.3: React hook + Workflow integration glue

**Files:**
- Create: `engines/web-ui/src/actionProxy/useActionProxy.ts`
- Modify: `engines/web-ui/src/coordinator/WorkflowCoordinator.ts`

- [ ] **Step 1: Implement the hook**

Create `engines/web-ui/src/actionProxy/useActionProxy.ts`:

```ts
// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { useSyncExternalStore } from 'react';
import type { ActionProxyController, ControllerSnapshot } from './ActionProxyController.js';

export function useActionProxy(controller: ActionProxyController | null): ControllerSnapshot | null {
  return useSyncExternalStore(
    cb => (controller ? controller.subscribe(cb) : () => {}),
    () => (controller ? controller.getSnapshot() : null),
    () => null,
  );
}
```

- [ ] **Step 2: Add controller registry to `WorkflowCoordinator`**

Open `engines/web-ui/src/coordinator/WorkflowCoordinator.ts`. Add imports at the top:

```ts
import { ActionProxyController, type ControllerSnapshot } from '../actionProxy/ActionProxyController.js';
import { PersistenceStore } from '../actionProxy/persistence.js';
import { SseObserver } from '../actionProxy/SseObserver.js';
import type { ActionCapability, ActionCommand, ActionInstanceObserver } from '../actionProxy/types.js';
```

Add private fields after the existing `private _formValues` field:

```ts
  private _actionControllers = new Map<string, ActionProxyController>();
  private _serverBindings: Record<string, string> = {};
  private _capabilities = new Map<string, Map<string, ActionCapability>>(); // serverUri -> action_oid -> cap
  private _persistence = new PersistenceStore();
  private _observer: ActionInstanceObserver = new SseObserver();
  private _workflowInstanceId: string = '';
```

Add methods after `getActiveSpec()`:

```ts
  /** Register server bindings for environments (called by picker flow). */
  setServerBindings(workflowInstanceId: string, bindings: Record<string, string>, capabilities: Map<string, Map<string, ActionCapability>>): void {
    this._workflowInstanceId = workflowInstanceId;
    this._serverBindings = bindings;
    this._capabilities = capabilities;
  }

  /** Get the controller for an active ACTION PROXY step, creating it on first call. */
  getActionController(stepInstanceId: string): ActionProxyController | null {
    return this._actionControllers.get(stepInstanceId) ?? null;
  }

  /** Start an ACTION PROXY controller for an active step. */
  startActionProxy(stepInstanceId: string, stepOid: string, actionOid: string, environmentOid: string, inputs: Array<{ name: string; value: string }>, onTerminal: (t: { state: 'COMPLETED' | 'ERRORED'; outputs: Record<string, string>; errorMessage: string | null }) => void): ActionProxyController {
    const serverUri = this._serverBindings[environmentOid];
    if (!serverUri) throw new Error(`No server bound for environment ${environmentOid}`);
    const cap = this._capabilities.get(serverUri)?.get(actionOid);
    if (!cap) throw new Error(`No capability cached for action ${actionOid} on ${serverUri}`);
    const controller = new ActionProxyController({
      serverUri,
      actionOid,
      invokeRequest: {
        environment_oid: environmentOid,
        workflow_instance_id: this._workflowInstanceId,
        step_instance_id: stepInstanceId,
        step_oid: stepOid,
        input_parameters: inputs,
      },
      visibility: cap.visibility,
      supportedCommands: cap.supported_commands,
      persistence: this._persistence,
      observer: this._observer,
      onTerminal: t => {
        this._actionControllers.delete(stepInstanceId);
        onTerminal(t);
      },
    });
    this._actionControllers.set(stepInstanceId, controller);
    controller.start().catch(e => {
      this._actionControllers.delete(stepInstanceId);
      onTerminal({ state: 'ERRORED', outputs: {}, errorMessage: String(e instanceof Error ? e.message : e) });
    });
    return controller;
  }

  /** Abandon workflow: ABORT then DELETE all active instances, then engine abort. */
  async abortWithActionCleanup(): Promise<void> {
    const active = [...this._actionControllers.values()];
    const ids = active.map(c => c.getSnapshot().instanceId).filter((id): id is string => !!id);
    const fetchImpl = fetch;
    await Promise.allSettled(ids.map(id => fetchImpl(`${this.findServerFor(id)}/trajectory/v1/instances/${encodeURIComponent(id)}/command`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: 'ABORT' }) })));
    await Promise.allSettled(ids.map(id => fetchImpl(`${this.findServerFor(id)}/trajectory/v1/instances/${encodeURIComponent(id)}`, { method: 'DELETE' })));
    for (const c of active) c.dispose();
    this._actionControllers.clear();
    if (this._workflowInstanceId) this._persistence.removeWorkflow(this._workflowInstanceId);
    this._persistence.flushSync();
    this.abort();
  }

  private findServerFor(instanceId: string): string {
    for (const c of this._actionControllers.values()) {
      if (c.getSnapshot().instanceId === instanceId) {
        // controller knows its serverUri internally via cfg — expose via snapshot if needed.
        // For Phase 1 we look it up via persistence:
        const persisted = this._persistence.readAll().find(e => e.instanceId === instanceId);
        if (persisted) return persisted.serverUri;
      }
    }
    throw new Error(`No server known for instance ${instanceId}`);
  }
```

Also modify `abort()` to clear controllers if `abortWithActionCleanup` isn't used:

```ts
  abort(): void {
    if (!this.engine) return;
    for (const c of this._actionControllers.values()) c.dispose();
    this._actionControllers.clear();
    if (this._workflowInstanceId) {
      this._persistence.removeWorkflow(this._workflowInstanceId);
      this._persistence.flushSync();
    }
    this.engine = null;
    this._formValues = {};
    this.publish({
      workflowState: 'ABORTED',
      activeSteps: [],
      trace: this.snapshot.trace,
      properties: this.snapshot.properties,
      inputParameters: {},
      error: null,
      mediaMap: {},
      stepParams: this.snapshot.stepParams,
      resources: [],
    });
  }
```

- [ ] **Step 3: Build**

```bash
cd engines/web-ui && npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add engines/web-ui/src/actionProxy/useActionProxy.ts engines/web-ui/src/coordinator/WorkflowCoordinator.ts
git commit -m "web-ui: WorkflowCoordinator registers ActionProxy controllers and cleans up on abandon"
```

---

## Workstream 4 — UI components

Goal: `ACTION PROXY` steps render as a card with the resolved inputs, current server state, and a state-aware command menu. A modal picker prompts for server selection. Log panel lives inside the existing step-detail popup.

### Task 4.1: `ActionProxyStepCard`

**Files:**
- Create: `engines/web-ui/src/components/ActionProxyStepCard.tsx`
- Create: `engines/web-ui/src/components/ActionProxyStepCard.module.css`

- [ ] **Step 1: Create the CSS module**

```css
.card {
  border: 1px solid var(--border-color, #ddd);
  border-radius: 8px;
  padding: 16px;
  background: var(--surface-bg, #fff);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}
.title { font-weight: 600; font-size: 16px; }
.state { font-size: 14px; color: var(--text-muted, #666); }
.section { display: flex; flex-direction: column; gap: 4px; }
.sectionLabel { font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--text-muted, #888); }
.row { display: flex; justify-content: space-between; font-family: var(--font-mono, monospace); font-size: 13px; gap: 8px; }
.footer { font-size: 12px; color: var(--text-muted, #888); border-top: 1px solid var(--border-color, #eee); padding-top: 8px; }
.errored { color: var(--error, #c00); }
.held { color: var(--warning, #c80); }
.menuButton {
  background: none;
  border: 1px solid var(--border-color, #ccc);
  border-radius: 4px;
  padding: 2px 8px;
  cursor: pointer;
  font-size: 18px;
}
```

- [ ] **Step 2: Create the component**

```tsx
// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { useMemo } from 'react';
import type { StepInstance } from '@engine/types.js';
import { useActionProxy } from '../actionProxy/useActionProxy.js';
import { useWorkflowCoordinator } from '../coordinator/useWorkflow.js';
import { cardLabelFor } from '../actionProxy/stateMapping.js';
import { ActionCommandMenu } from './ActionCommandMenu.js';
import styles from './ActionProxyStepCard.module.css';

interface Props {
  step: StepInstance;
  inputParameters: Record<string, string>;
}

export function ActionProxyStepCard({ step, inputParameters }: Props) {
  const coordinator = useWorkflowCoordinator();
  const controller = coordinator.getActionController(step.oid);
  const snap = useActionProxy(controller);

  const inputsList = useMemo(
    () => Object.entries(inputParameters),
    [inputParameters],
  );

  const label = snap?.serverState ? cardLabelFor(snap.serverState) : 'Pending';
  const isErrored = snap?.serverState === 'ABORTED' || snap?.serverState === 'STOPPED' || snap?.serverState === 'ERRORED';
  const isHeld = snap?.serverState === 'HELD';

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>{step.step.local_id}</div>
          <div className={[styles.state, isErrored && styles.errored, isHeld && styles.held].filter(Boolean).join(' ')}>
            {label}
          </div>
        </div>
        {controller && snap && (
          <ActionCommandMenu controller={controller} snapshot={snap} />
        )}
      </div>

      {snap?.visibility !== 'opaque' && inputsList.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Inputs</div>
          {inputsList.map(([k, v]) => (
            <div key={k} className={styles.row}><span>{k}</span><span>{v}</span></div>
          ))}
        </div>
      )}

      <div className={styles.footer}>
        {snap?.instanceId ? `Instance: ${snap.instanceId}` : 'Connecting…'}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Build**

```bash
cd engines/web-ui && npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add engines/web-ui/src/components/ActionProxyStepCard.tsx engines/web-ui/src/components/ActionProxyStepCard.module.css
git commit -m "web-ui: ActionProxyStepCard renders ACTION PROXY steps"
```

### Task 4.2: `ActionCommandMenu`

**Files:**
- Create: `engines/web-ui/src/components/ActionCommandMenu.tsx`
- Create: `engines/web-ui/src/components/ActionCommandMenu.module.css`

- [ ] **Step 1: CSS**

```css
.container { position: relative; }
.trigger {
  background: none;
  border: 1px solid var(--border-color, #ccc);
  border-radius: 4px;
  padding: 2px 8px;
  cursor: pointer;
  font-size: 18px;
}
.menu {
  position: absolute;
  right: 0;
  top: 100%;
  margin-top: 4px;
  background: var(--surface-bg, #fff);
  border: 1px solid var(--border-color, #ddd);
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  min-width: 160px;
  z-index: 10;
}
.item {
  display: block;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 14px;
}
.item:hover { background: var(--hover-bg, #f5f5f5); }
.empty { padding: 8px 12px; color: var(--text-muted, #888); font-size: 13px; }
```

- [ ] **Step 2: Component**

```tsx
// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { useState, useRef, useEffect, useCallback } from 'react';
import type { ActionProxyController, ControllerSnapshot } from '../actionProxy/ActionProxyController.js';
import { commandsForState } from '../actionProxy/stateMapping.js';
import type { ActionCommand } from '../actionProxy/types.js';
import styles from './ActionCommandMenu.module.css';

interface Props {
  controller: ActionProxyController;
  snapshot: ControllerSnapshot;
}

export function ActionCommandMenu({ controller, snapshot }: Props) {
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [open]);

  const allowed: ActionCommand[] = snapshot.serverState
    ? commandsForState(snapshot.serverState, snapshot.supportedCommands, snapshot.visibility)
    : [];

  const handle = useCallback(async (cmd: ActionCommand) => {
    setOpen(false);
    try {
      await controller.sendCommand(cmd);
    } catch (e) {
      const err = e as { code?: string; message?: string };
      const msg = err.code === 'INVALID_STATE_TRANSITION'
        ? `Cannot ${cmd} while ${snapshot.serverState}`
        : err.message ?? 'Command failed';
      setToast(msg);
      setTimeout(() => setToast(null), 3000);
    }
  }, [controller, snapshot.serverState]);

  return (
    <div className={styles.container} ref={ref}>
      <button
        className={styles.trigger}
        onClick={() => setOpen(o => !o)}
        disabled={snapshot.commandInFlight !== null}
        aria-label="Action commands"
      >
        {snapshot.commandInFlight ? '…' : '⋮'}
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          {allowed.length === 0 ? (
            <div className={styles.empty}>No commands available</div>
          ) : (
            allowed.map(cmd => (
              <button key={cmd} className={styles.item} role="menuitem" onClick={() => handle(cmd)}>
                {cmd}
              </button>
            ))
          )}
        </div>
      )}
      {toast && (
        <div role="status" style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, background: '#fff3cd', border: '1px solid #ffeeba', padding: '6px 10px', borderRadius: 4, fontSize: 13, whiteSpace: 'nowrap', zIndex: 11 }}>
          {toast}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Build**

```bash
cd engines/web-ui && npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add engines/web-ui/src/components/ActionCommandMenu.tsx engines/web-ui/src/components/ActionCommandMenu.module.css
git commit -m "web-ui: ActionCommandMenu state-aware dropdown for ACTION PROXY"
```

### Task 4.3: `ActionServerPicker`

**Files:**
- Create: `engines/web-ui/src/components/ActionServerPicker.tsx`
- Create: `engines/web-ui/src/components/ActionServerPicker.module.css`

- [ ] **Step 1: CSS**

```css
.backdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,0.4);
  display: flex; align-items: center; justify-content: center; z-index: 100;
}
.dialog {
  background: var(--surface-bg, #fff);
  border-radius: 8px;
  padding: 24px;
  min-width: 400px;
  max-width: 600px;
  display: flex; flex-direction: column; gap: 16px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.2);
}
.title { font-weight: 600; font-size: 18px; }
.subtitle { color: var(--text-muted, #666); font-size: 14px; }
.serverList { display: flex; flex-direction: column; gap: 8px; max-height: 320px; overflow-y: auto; }
.serverOption {
  display: flex; gap: 12px; padding: 12px;
  border: 1px solid var(--border-color, #ddd); border-radius: 6px;
  cursor: pointer; align-items: flex-start;
}
.serverOption input { margin-top: 4px; }
.serverName { font-weight: 600; font-size: 14px; }
.serverUri { font-family: var(--font-mono, monospace); font-size: 12px; color: var(--text-muted, #666); }
.serverDesc { font-size: 13px; color: var(--text-muted, #666); margin-top: 4px; }
.uriInput {
  padding: 8px 12px; border: 1px solid var(--border-color, #ccc); border-radius: 4px;
  font-family: var(--font-mono, monospace); font-size: 14px; width: 100%;
}
.uriError { color: var(--error, #c00); font-size: 13px; }
.actions { display: flex; justify-content: flex-end; gap: 8px; }
.primary, .secondary {
  padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 14px;
}
.primary { background: var(--accent, #2563eb); color: white; border: none; }
.primary:disabled { background: var(--accent-disabled, #94a3b8); cursor: not-allowed; }
.secondary { background: none; border: 1px solid var(--border-color, #ccc); color: var(--text, #333); }
```

- [ ] **Step 2: Component**

```tsx
// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { useState } from 'react';
import type { ActionServerSpecification } from '@engine/types.js';
import styles from './ActionServerPicker.module.css';

interface Props {
  environmentName: string;
  servers: ActionServerSpecification[];
  onUse: (uri: string) => void;
  onAbandon: () => void;
}

function isValidUrl(s: string): boolean {
  try { const u = new URL(s); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; }
}

export function ActionServerPicker({ environmentName, servers, onUse, onAbandon }: Props) {
  const [selected, setSelected] = useState<string | null>(servers[0]?.uri ?? null);
  const [adhoc, setAdhoc] = useState<string>('');
  const [touched, setTouched] = useState(false);

  if (servers.length === 0) {
    const valid = adhoc.length === 0 || isValidUrl(adhoc);
    return (
      <div className={styles.backdrop} role="dialog" aria-modal="true">
        <div className={styles.dialog}>
          <div className={styles.title}>Pick an action server</div>
          <div className={styles.subtitle}>
            Environment <strong>{environmentName}</strong> has no registered action servers.
            Enter a server URI to continue.
          </div>
          <input
            className={styles.uriInput}
            placeholder="http://localhost:3002"
            value={adhoc}
            onChange={e => setAdhoc(e.target.value)}
            onBlur={() => setTouched(true)}
            aria-label="Server URI"
          />
          {touched && !valid && <div className={styles.uriError}>Enter a valid http(s) URL.</div>}
          <div className={styles.actions}>
            <button className={styles.secondary} onClick={onAbandon}>Abandon workflow</button>
            <button className={styles.primary} onClick={() => onUse(adhoc)} disabled={!isValidUrl(adhoc)}>Connect</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true">
      <div className={styles.dialog}>
        <div className={styles.title}>Pick an action server</div>
        <div className={styles.subtitle}>
          Environment <strong>{environmentName}</strong> has multiple registered servers.
          Choose one to use for this workflow.
        </div>
        <div className={styles.serverList}>
          {servers.map(s => (
            <label key={s.uri} className={styles.serverOption}>
              <input
                type="radio"
                name="server"
                value={s.uri}
                checked={selected === s.uri}
                onChange={() => setSelected(s.uri)}
              />
              <div>
                <div className={styles.serverName}>{s.name}</div>
                <div className={styles.serverUri}>{s.uri}</div>
                {s.description && <div className={styles.serverDesc}>{s.description}</div>}
              </div>
            </label>
          ))}
        </div>
        <div className={styles.actions}>
          <button className={styles.secondary} onClick={onAbandon}>Abandon workflow</button>
          <button className={styles.primary} onClick={() => selected && onUse(selected)} disabled={!selected}>Use</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Build**

```bash
cd engines/web-ui && npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add engines/web-ui/src/components/ActionServerPicker.tsx engines/web-ui/src/components/ActionServerPicker.module.css
git commit -m "web-ui: ActionServerPicker dialog"
```

### Task 4.4: `ActionLogPanel`

**Files:**
- Create: `engines/web-ui/src/components/ActionLogPanel.tsx`
- Create: `engines/web-ui/src/components/ActionLogPanel.module.css`

- [ ] **Step 1: CSS**

```css
.panel { display: flex; flex-direction: column; gap: 4px; max-height: 240px; overflow-y: auto; font-family: var(--font-mono, monospace); font-size: 12px; }
.entry { padding: 4px 8px; border-radius: 3px; }
.stderr { color: var(--error, #c00); background: var(--error-bg, #fff5f5); }
.empty { color: var(--text-muted, #888); padding: 12px; text-align: center; font-style: italic; }
.ts { color: var(--text-muted, #888); margin-right: 8px; }
```

- [ ] **Step 2: Component**

```tsx
// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { useEffect, useRef } from 'react';
import type { ControllerSnapshot } from '../actionProxy/ActionProxyController.js';
import styles from './ActionLogPanel.module.css';

interface Props { snapshot: ControllerSnapshot | null; }

export function ActionLogPanel({ snapshot }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [snapshot?.logs.length]);

  if (!snapshot || snapshot.logs.length === 0) {
    return <div className={styles.empty}>No log messages.</div>;
  }
  return (
    <div className={styles.panel} ref={ref}>
      {snapshot.logs.map((l, i) => (
        <div key={i} className={[styles.entry, l.stream === 'stderr' && styles.stderr].filter(Boolean).join(' ')}>
          <span className={styles.ts}>{l.ts.substring(11, 19)}</span>{l.message}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Build**

```bash
cd engines/web-ui && npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add engines/web-ui/src/components/ActionLogPanel.tsx engines/web-ui/src/components/ActionLogPanel.module.css
git commit -m "web-ui: ActionLogPanel"
```

### Task 4.5: Wire `ACTION PROXY` into `StepRenderer`

**Files:**
- Modify: `engines/web-ui/src/components/StepRenderer.tsx`

- [ ] **Step 1: Add the branch**

In `StepRenderer.tsx`, add an import at the top:

```tsx
import { ActionProxyStepCard } from './ActionProxyStepCard.js';
```

In the main `StepRenderer` function, add a case before the fallback "executing" return (line 53 area):

```tsx
  if (step.stepType === 'ACTION PROXY') {
    return <ActionProxyStepCard step={step} inputParameters={inputParameters} />;
  }
```

The function should now look like:

```tsx
export function StepRenderer({ step, onAction, workflowId, properties, inputParameters, viewportOverride, mediaMap, header }: StepRendererProps) {
  if (step.stepType === 'YES_NO') {
    return <YesNoRenderer step={step} onAction={onAction} workflowId={workflowId} properties={properties} inputParameters={inputParameters} viewportOverride={viewportOverride} mediaMap={mediaMap} header={header} />;
  }
  if (step.stepType === 'USER_INTERACTION') {
    return <UserInteractionRenderer step={step} onAction={onAction} workflowId={workflowId} properties={properties} inputParameters={inputParameters} viewportOverride={viewportOverride} mediaMap={mediaMap} header={header} />;
  }
  if (step.stepType === 'ACTION PROXY') {
    return <ActionProxyStepCard step={step} inputParameters={inputParameters} />;
  }
  return (
    <div className="step-unknown">
      <p>Step type "{step.stepType}" is executing — waiting for engine action.</p>
    </div>
  );
}
```

- [ ] **Step 2: Build**

```bash
cd engines/web-ui && npm run build 2>&1 | tail -10
```
Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add engines/web-ui/src/components/StepRenderer.tsx
git commit -m "web-ui: StepRenderer dispatches ACTION PROXY to ActionProxyStepCard"
```

### Task 4.6: Include `ActionLogPanel` in `StepDetailPopup` for ACTION PROXY

**Files:**
- Modify: `engines/web-ui/src/components/StepDetailPopup.tsx`

- [ ] **Step 1: Add a conditional log panel render**

Open `StepDetailPopup.tsx`. Locate the body of the popup that renders step-specific content. Add an import:

```tsx
import { ActionLogPanel } from './ActionLogPanel.js';
import { useActionProxy } from '../actionProxy/useActionProxy.js';
import { useWorkflowCoordinator } from '../coordinator/useWorkflow.js';
```

Inside the component, wherever the step content is rendered, add a branch for ACTION PROXY steps:

```tsx
  // (Inside the component, where the current step is known as `step`)
  const isActionProxy = step?.stepType === 'ACTION PROXY';
  const coordinator = useWorkflowCoordinator();
  const apController = isActionProxy && step ? coordinator.getActionController(step.oid) : null;
  const apSnap = useActionProxy(apController);
```

Then in the JSX, where step details are shown:

```tsx
  {isActionProxy && (
    <div>
      <h3>Action log</h3>
      <ActionLogPanel snapshot={apSnap} />
    </div>
  )}
```

(Adapt placement to the existing `StepDetailPopup` structure — the exact location depends on the file's current layout; place the log panel near other per-step diagnostics.)

- [ ] **Step 2: Build**

```bash
cd engines/web-ui && npm run build 2>&1 | tail -10
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add engines/web-ui/src/components/StepDetailPopup.tsx
git commit -m "web-ui: show ActionLogPanel in StepDetailPopup for ACTION PROXY"
```

---

## Workstream 5 — Pre-workflow server picker + reload reconnect

Goal: at workflow start, prompt for server selection per environment with action-proxy steps; fetch `/capabilities` for the bound server; persist bindings; on reload, reconnect to in-flight instances.

### Task 5.1: Identify environments that need server binding

**Files:**
- Create: `engines/web-ui/src/actionProxy/environmentScan.ts`
- Create: `engines/web-ui/src/actionProxy/environmentScan.test.ts`

- [ ] **Step 1: Failing test**

```ts
// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { environmentsNeedingBinding } from './environmentScan.js';
import type { MasterWorkflowSpecification } from '@engine/types.js';

test('returns environments referenced by an ACTION PROXY step', () => {
  const wf: MasterWorkflowSpecification = {
    local_id: 'wf', oid: 'wf-oid', version: '1.0.0', last_modified_date: '2026-05-19T00:00:00Z',
    steps: [
      { local_id: 'start', oid: 'step-start', version: '1.0.0', last_modified_date: '2026-05-19T00:00:00Z', step_type: 'START' },
      { local_id: 'act1', oid: 'step-a', version: '1.0.0', last_modified_date: '2026-05-19T00:00:00Z', step_type: 'ACTION PROXY', action_proxy_config: { action_oid: 'act-1', environment_oid: 'env-1' } },
      { local_id: 'end', oid: 'step-end', version: '1.0.0', last_modified_date: '2026-05-19T00:00:00Z', step_type: 'END' },
    ],
    connections: [],
    environment_specifications: [
      { local_id: 'env1', oid: 'env-1', version: '1.0.0', last_modified_date: '2026-05-19T00:00:00Z', action_server_specifications: [{ name: 's', uri: 'http://localhost:3002', connection_type: 'REST' }] },
      { local_id: 'env2', oid: 'env-2', version: '1.0.0', last_modified_date: '2026-05-19T00:00:00Z' },
    ],
  };
  const needed = environmentsNeedingBinding(wf);
  assert.equal(needed.length, 1);
  assert.equal(needed[0].oid, 'env-1');
});

test('returns nothing when no ACTION PROXY step uses the env', () => {
  const wf: MasterWorkflowSpecification = {
    local_id: 'wf', oid: 'wf-oid', version: '1.0.0', last_modified_date: '2026-05-19T00:00:00Z',
    steps: [],
    connections: [],
    environment_specifications: [
      { local_id: 'env1', oid: 'env-1', version: '1.0.0', last_modified_date: '2026-05-19T00:00:00Z', action_server_specifications: [{ name: 's', uri: 'http://localhost:3002', connection_type: 'REST' }] },
    ],
  };
  assert.equal(environmentsNeedingBinding(wf).length, 0);
});
```

- [ ] **Step 2: Run — fail**

```bash
cd engines/web-ui && npx tsc --noEmit && node --test src/actionProxy/environmentScan.test.ts 2>&1 | tail -5
```
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import type { MasterEnvironmentSpecification, MasterWorkflowSpecification } from '@engine/types.js';

export function environmentsNeedingBinding(workflow: MasterWorkflowSpecification): MasterEnvironmentSpecification[] {
  const refs = new Set<string>();
  for (const step of workflow.steps) {
    if (step.step_type === 'ACTION PROXY' && step.action_proxy_config?.environment_oid) {
      refs.add(step.action_proxy_config.environment_oid);
    }
  }
  return (workflow.environment_specifications ?? []).filter(e => refs.has(e.oid));
}
```

- [ ] **Step 4: Run — pass**

```bash
cd engines/web-ui && npx tsc --noEmit && node --test src/actionProxy/environmentScan.test.ts 2>&1 | tail -5
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add engines/web-ui/src/actionProxy/environmentScan.ts engines/web-ui/src/actionProxy/environmentScan.test.ts
git commit -m "web-ui: scan workflow for environments needing server binding"
```

### Task 5.2: Server binding orchestrator (sequential picker)

**Files:**
- Create: `engines/web-ui/src/actionProxy/useServerBindings.ts` (React-aware hook)

- [ ] **Step 1: Implement**

```tsx
// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { useState, useEffect, useCallback } from 'react';
import type { MasterEnvironmentSpecification } from '@engine/types.js';
import type { ActionCapability } from './types.js';
import { ActionApiClient } from './ActionApiClient.js';

export interface BindingResult {
  bindings: Record<string, string>;  // env_oid → server_uri
  capabilities: Map<string, Map<string, ActionCapability>>;  // server_uri → action_oid → capability
}

export type BindingState =
  | { phase: 'idle' }
  | { phase: 'picking'; envIndex: number; envs: MasterEnvironmentSpecification[]; bindings: Record<string, string>; capabilities: Map<string, Map<string, ActionCapability>> }
  | { phase: 'fetching-capabilities'; envName: string }
  | { phase: 'error'; envName: string; message: string; envs: MasterEnvironmentSpecification[]; bindings: Record<string, string>; capabilities: Map<string, Map<string, ActionCapability>>; envIndex: number }
  | { phase: 'done'; result: BindingResult }
  | { phase: 'abandoned' };

export function useServerBindings() {
  const [state, setState] = useState<BindingState>({ phase: 'idle' });
  const api = new ActionApiClient();

  const begin = useCallback((envs: MasterEnvironmentSpecification[]) => {
    if (envs.length === 0) {
      setState({ phase: 'done', result: { bindings: {}, capabilities: new Map() } });
      return;
    }
    // Auto-bind any env with exactly one server; pick the rest.
    const bindings: Record<string, string> = {};
    const capabilities = new Map<string, Map<string, ActionCapability>>();
    const remainingEnvs: MasterEnvironmentSpecification[] = [];
    for (const env of envs) {
      const servers = env.action_server_specifications ?? [];
      if (servers.length === 1) {
        bindings[env.oid] = servers[0].uri;
      } else {
        remainingEnvs.push(env);
      }
    }
    if (remainingEnvs.length === 0) {
      // All silent-bound. Now fetch capabilities for each unique server.
      void fetchAllCapabilities(envs, bindings, capabilities, api, setState);
    } else {
      setState({ phase: 'picking', envIndex: 0, envs: remainingEnvs, bindings, capabilities });
    }
  }, []);

  const selectServer = useCallback((uri: string) => {
    setState(prev => {
      if (prev.phase !== 'picking') return prev;
      const env = prev.envs[prev.envIndex];
      const nextBindings = { ...prev.bindings, [env.oid]: uri };
      const nextIndex = prev.envIndex + 1;
      if (nextIndex >= prev.envs.length) {
        // Done picking. Fetch capabilities.
        void fetchAllCapabilities([...prev.envs], nextBindings, new Map(prev.capabilities), api, setState);
        return { phase: 'fetching-capabilities', envName: env.local_id };
      }
      return { ...prev, envIndex: nextIndex, bindings: nextBindings };
    });
  }, [api]);

  const abandon = useCallback(() => setState({ phase: 'abandoned' }), []);

  const reset = useCallback(() => setState({ phase: 'idle' }), []);

  return { state, begin, selectServer, abandon, reset };
}

async function fetchAllCapabilities(
  envs: MasterEnvironmentSpecification[],
  bindings: Record<string, string>,
  capabilities: Map<string, Map<string, ActionCapability>>,
  api: ActionApiClient,
  setState: (s: BindingState) => void,
): Promise<void> {
  const uniqueUris = new Set(Object.values(bindings));
  for (const uri of uniqueUris) {
    if (capabilities.has(uri)) continue;
    setState({ phase: 'fetching-capabilities', envName: uri });
    try {
      const caps = await api.getCapabilities(uri);
      const map = new Map<string, ActionCapability>();
      for (const c of caps) map.set(c.action_oid, c);
      capabilities.set(uri, map);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setState({ phase: 'error', envName: uri, message: msg, envs, bindings: {}, capabilities: new Map(), envIndex: 0 });
      return;
    }
  }
  setState({ phase: 'done', result: { bindings, capabilities } });
}
```

- [ ] **Step 2: Build**

```bash
cd engines/web-ui && npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add engines/web-ui/src/actionProxy/useServerBindings.ts
git commit -m "web-ui: server binding orchestrator hook"
```

### Task 5.3: Wire server picker into workflow start

**Files:**
- Modify: `engines/web-ui/src/coordinator/WorkflowCoordinator.ts` — expose a `loadWithActionPicker` API gating engine start on binding completion.
- Modify whichever component currently calls `coordinator.loadAndStart()` (find by grepping the web-ui source).

- [ ] **Step 1: Find the workflow-start entry point**

```bash
grep -rn "loadAndStart\|coordinator.start" engines/web-ui/src 2>&1 | head -10
```
Expected: locates one or two callers. The most common one is in a top-level screen or in `WorkflowManager.ts`.

- [ ] **Step 2: Add `loadAndPrepare` method to WorkflowCoordinator**

In `WorkflowCoordinator.ts`, add after `load()`:

```ts
  /**
   * Load and return the list of environments that need server binding before start.
   * Caller is responsible for invoking ActionServerPicker, calling setServerBindings,
   * then start().
   */
  envsNeedingBinding(): MasterEnvironmentSpecification[] {
    if (!this.workflow) return [];
    return environmentsNeedingBinding(this.workflow);
  }
```

Add the import at the top:

```ts
import type { MasterEnvironmentSpecification } from '@engine/types.js';
import { environmentsNeedingBinding } from '../actionProxy/environmentScan.js';
```

- [ ] **Step 3: Update the workflow-start screen**

Find the screen/component that initializes a workflow (often `engines/web-ui/src/components/WorkflowStartDialog.tsx` or similar — verify with the grep above). Wrap the `loadAndStart` flow:

```tsx
import { useServerBindings } from '../actionProxy/useServerBindings.js';
import { ActionServerPicker } from './ActionServerPicker.js';

// inside the component:
const bindings = useServerBindings();

// When the user confirms "Start workflow":
const handleStart = () => {
  coordinator.load(workflow, setup, mediaMap, environments);
  const envs = coordinator.envsNeedingBinding();
  if (envs.length === 0) {
    coordinator.start();
    onStarted();
    return;
  }
  bindings.begin(envs);
};

// After bindings.state.phase === 'done':
useEffect(() => {
  if (bindings.state.phase === 'done') {
    coordinator.setServerBindings(workflowInstanceId, bindings.state.result.bindings, bindings.state.result.capabilities);
    coordinator.start();
    onStarted();
  }
  if (bindings.state.phase === 'abandoned') {
    onAbandoned();
  }
}, [bindings.state.phase]);

// Render the picker if in 'picking' phase:
{bindings.state.phase === 'picking' && (
  <ActionServerPicker
    environmentName={bindings.state.envs[bindings.state.envIndex].local_id}
    servers={bindings.state.envs[bindings.state.envIndex].action_server_specifications ?? []}
    onUse={bindings.selectServer}
    onAbandon={bindings.abandon}
  />
)}

// If 'error':
{bindings.state.phase === 'error' && (
  <ActionServerPicker
    environmentName={bindings.state.envName}
    servers={[]}
    onUse={() => bindings.reset()}  // user must retry from start
    onAbandon={bindings.abandon}
  />
)}
```

(The exact placement adapts to the existing dialog's structure. The key is: do NOT call `coordinator.start()` until `bindings.state.phase === 'done'`.)

- [ ] **Step 4: Build**

```bash
cd engines/web-ui && npm run build 2>&1 | tail -10
```
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add engines/web-ui/src/coordinator/WorkflowCoordinator.ts engines/web-ui/src/components/WorkflowStartDialog.tsx
git commit -m "web-ui: gate workflow start on action server binding completion"
```

### Task 5.4: Reload reconnect

**Files:**
- Modify: `engines/web-ui/src/coordinator/WorkflowCoordinator.ts` — add `reconnectPersistedInstances()` that runs before `start()` on rehydrate.

- [ ] **Step 1: Add the method**

In `WorkflowCoordinator.ts`:

```ts
  /**
   * After load() but before start(), call this to detect persisted in-flight
   * instances for this workflow and reconnect them. Terminal instances apply
   * their outputs to the engine; non-terminal ones resume SSE.
   * Returns the set of stepInstanceIds that are still active after reconnect.
   */
  async reconnectPersistedInstances(): Promise<Set<string>> {
    const active = new Set<string>();
    const persisted = this._persistence.readAll().filter(e => e.workflowInstanceId === this._workflowInstanceId);
    for (const entry of persisted) {
      // Look up cap for the action
      const cap = this._capabilities.get(entry.serverUri);
      if (!cap) continue; // capabilities not cached yet — skip; UI will surface as errored
      // Create controller pointing at the existing instance
      const controller = new ActionProxyController({
        serverUri: entry.serverUri,
        actionOid: '',  // not used by reconnect path; cap is resolved from cached capabilities below
        invokeRequest: {
          environment_oid: entry.environmentOid,
          workflow_instance_id: entry.workflowInstanceId,
          step_instance_id: entry.stepInstanceId,
          step_oid: entry.stepOid,
          input_parameters: [],
        },
        visibility: 'observable',  // unknown until cap resolves; SSE will reconcile
        supportedCommands: [],
        persistence: this._persistence,
        observer: this._observer,
        onTerminal: t => {
          this._actionControllers.delete(entry.stepInstanceId);
          // No engine handoff here — terminal-on-reload is reported via the
          // active-steps listener once `start()` has run.
        },
      });
      this._actionControllers.set(entry.stepInstanceId, controller);
      await controller.reconnect(entry.instanceId, entry.lastEventId);
      const snap = controller.getSnapshot();
      if (snap.serverState && !(['COMPLETED','ABORTED','STOPPED','ERRORED'] as const).includes(snap.serverState as 'COMPLETED' | 'ABORTED' | 'STOPPED' | 'ERRORED')) {
        active.add(entry.stepInstanceId);
      }
    }
    return active;
  }
```

- [ ] **Step 2: Update the workflow rehydrate path to call it**

In the rehydrate path (find the caller of `coordinator.load(...)` that runs at app startup with a previously saved workflow), insert before `coordinator.start()`:

```ts
await coordinator.reconnectPersistedInstances();
coordinator.start();
```

- [ ] **Step 3: Build**

```bash
cd engines/web-ui && npm run build 2>&1 | tail -10
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add engines/web-ui/src/coordinator/WorkflowCoordinator.ts
git commit -m "web-ui: reconnect persisted ACTION PROXY instances on workflow rehydrate"
```

### Task 5.5: Wire abandon-workflow cleanup into the UI

**Files:**
- Modify: the component that currently invokes `coordinator.abort()` (find via grep). Replace with `coordinator.abortWithActionCleanup()`.

- [ ] **Step 1: Find callers**

```bash
grep -rn "abort\|abandon" engines/web-ui/src/components engines/web-ui/src/manager 2>&1 | grep -i "coordinator\|workflow" | head -10
```

- [ ] **Step 2: Replace abort calls**

In each call site (typically `StateCommandMenu.tsx` for "Abandon workflow"), change:

```tsx
coordinator.abort();
```

to:

```tsx
void coordinator.abortWithActionCleanup();
```

(The call is `void`-ed because UI doesn't need to await the network cleanup.)

- [ ] **Step 3: Build**

```bash
cd engines/web-ui && npm run build 2>&1 | tail -10
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add engines/web-ui/src/components/StateCommandMenu.tsx
git commit -m "web-ui: abandon workflow runs ABORT-then-DELETE for ACTION PROXY instances"
```

---

## Workstream 6 — Integration tests against TrajectoryActions container

Goal: end-to-end coverage of the protocol against the real container at `http://localhost:3002`.

### Task 6.1: Add `test` and `test:integration` scripts

**Files:**
- Modify: `engines/web-ui/package.json`

- [ ] **Step 1: Add scripts**

In `engines/web-ui/package.json`, add to `"scripts"`:

```json
{
  "test": "tsc -b && node --test --import tsx \"src/**/*.test.ts\"",
  "test:integration": "tsc -b && node --test --import tsx \"test/integration/*.test.ts\""
}
```

Add `tsx` to devDependencies:

```bash
cd engines/web-ui && npm install --save-dev tsx
```

- [ ] **Step 2: Verify scripts run**

```bash
cd engines/web-ui && npm test 2>&1 | tail -10
```
Expected: existing unit tests (state mapping, persistence, etc.) all PASS.

- [ ] **Step 3: Commit**

```bash
git add engines/web-ui/package.json engines/web-ui/package-lock.json
git commit -m "web-ui: add test and test:integration scripts"
```

### Task 6.2: Container harness

**Files:**
- Create: `engines/web-ui/test/integration/action-container.ts`

- [ ] **Step 1: Implement**

```ts
// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
const BASE = process.env.TRAJECTORY_ACTIONS_URL ?? 'http://localhost:3002';

export async function ensureContainerUp(): Promise<void> {
  try {
    const resp = await fetch(`${BASE}/trajectory/v1/health`);
    if (resp.status !== 200) throw new Error(`/health returned ${resp.status}`);
  } catch (e) {
    throw new Error(
      `TrajectoryActions container not reachable at ${BASE}.\n` +
      `Start it with: cd C:\\Trajectory\\TrajectoryActions && pnpm dev\n` +
      `Original error: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

export async function listCapabilities(): Promise<Array<{ action_oid: string; supported_commands: string[]; visibility: string; local_id: string }>> {
  const resp = await fetch(`${BASE}/trajectory/v1/capabilities`);
  if (resp.status !== 200) throw new Error(`/capabilities returned ${resp.status}`);
  const json = await resp.json();
  return json.data;
}

export async function invokeAction(actionOid: string, body: Record<string, unknown>): Promise<string> {
  const resp = await fetch(`${BASE}/trajectory/v1/actions/${encodeURIComponent(actionOid)}/invoke`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (resp.status !== 201) throw new Error(`invoke returned ${resp.status}: ${await resp.text()}`);
  const json = await resp.json();
  return json.data.instance_id;
}

export async function getInstance(instanceId: string): Promise<{ state: { current: string }; outputs: Array<{ name: string; value: string }>; error: string | null }> {
  const resp = await fetch(`${BASE}/trajectory/v1/instances/${encodeURIComponent(instanceId)}`);
  if (resp.status !== 200) throw new Error(`getInstance returned ${resp.status}`);
  return (await resp.json()).data;
}

export async function deleteInstance(instanceId: string): Promise<void> {
  await fetch(`${BASE}/trajectory/v1/instances/${encodeURIComponent(instanceId)}`, { method: 'DELETE' });
}

export async function sendCommand(instanceId: string, command: string): Promise<Response> {
  return fetch(`${BASE}/trajectory/v1/instances/${encodeURIComponent(instanceId)}/command`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command }),
  });
}

export async function waitForState(instanceId: string, expected: string, timeoutMs = 10_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const snap = await getInstance(instanceId);
    if (snap.state.current === expected) return;
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error(`Timed out waiting for instance ${instanceId} to reach ${expected}`);
}

export const BASE_URL = BASE;
```

- [ ] **Step 2: Commit**

```bash
git add engines/web-ui/test/integration/action-container.ts
git commit -m "test: TrajectoryActions container harness"
```

### Task 6.3: End-to-end integration test

**Files:**
- Create: `engines/web-ui/test/integration/action-proxy-e2e.test.ts`

- [ ] **Step 1: Implement**

```ts
// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { test, before } from 'node:test';
import { strict as assert } from 'node:assert';
import { ensureContainerUp, listCapabilities, invokeAction, getInstance, deleteInstance, waitForState, sendCommand, BASE_URL } from './action-container.js';

let containerOk = false;

before(async () => {
  try {
    await ensureContainerUp();
    containerOk = true;
  } catch (e) {
    console.warn(`[integration] Skipping all tests: ${e instanceof Error ? e.message : e}`);
  }
});

test('invoke → reaches COMPLETED', { skip: !containerOk }, async () => {
  const caps = await listCapabilities();
  assert.ok(caps.length > 0, 'container has at least one action');
  // Find an observable action with the standard 7 commands and quick completion.
  // The kitchen/warehouse scenarios both include such actions.
  const observable = caps.find(c => c.visibility === 'observable');
  assert.ok(observable, 'expected at least one observable action');

  const instanceId = await invokeAction(observable!.action_oid, {
    environment_oid: 'env-test',
    workflow_instance_id: 'e2e-wf-1',
    step_instance_id: 'e2e-si-1',
    step_oid: 'e2e-step-1',
    input_parameters: [],
  });

  await waitForState(instanceId, 'COMPLETED', 30_000);
  const snap = await getInstance(instanceId);
  assert.equal(snap.state.current, 'COMPLETED');
  await deleteInstance(instanceId);
});

test('PAUSE command returns 200 when valid', { skip: !containerOk }, async () => {
  const caps = await listCapabilities();
  const target = caps.find(c => c.supported_commands.includes('PAUSE') && c.visibility === 'observable');
  if (!target) return; // no eligible action
  const instanceId = await invokeAction(target.action_oid, {
    environment_oid: 'env-test',
    workflow_instance_id: 'e2e-wf-2',
    step_instance_id: 'e2e-si-2',
    step_oid: 'e2e-step-2',
    input_parameters: [],
  });
  try {
    await waitForState(instanceId, 'RUNNING', 10_000);
  } catch {
    // some actions skip RUNNING and go straight to COMPLETED on test fixtures
  }
  const resp = await sendCommand(instanceId, 'PAUSE');
  assert.ok([200, 409].includes(resp.status), `unexpected status ${resp.status}`);
  await deleteInstance(instanceId);
});

test('DELETE on missing instance returns 404 and we tolerate it', { skip: !containerOk }, async () => {
  const resp = await fetch(`${BASE_URL}/trajectory/v1/instances/non-existent`, { method: 'DELETE' });
  assert.ok([404, 200].includes(resp.status));
});

test('invalid command returns 422', { skip: !containerOk }, async () => {
  const caps = await listCapabilities();
  const target = caps[0];
  const instanceId = await invokeAction(target.action_oid, {
    environment_oid: 'env-test',
    workflow_instance_id: 'e2e-wf-3',
    step_instance_id: 'e2e-si-3',
    step_oid: 'e2e-step-3',
    input_parameters: [],
  });
  const resp = await sendCommand(instanceId, 'BOGUS');
  assert.equal(resp.status, 422);
  await deleteInstance(instanceId);
});
```

- [ ] **Step 2: Start the container**

```bash
cd C:\\Trajectory\\TrajectoryActions && pnpm dev
```
Run in a separate terminal. Wait until `GET http://localhost:3002/trajectory/v1/health` returns 200.

- [ ] **Step 3: Run the integration tests**

```bash
cd engines/web-ui && npm run test:integration 2>&1 | tail -20
```
Expected: all four PASS. If the container has no actions deployed, the second/third tests may skip — that's acceptable.

- [ ] **Step 4: Commit**

```bash
git add engines/web-ui/test/integration/action-proxy-e2e.test.ts
git commit -m "test: ACTION PROXY end-to-end against TrajectoryActions container"
```

---

## Workstream 7 — Manual test pass + docs

### Task 7.1: Manual test checklist

**Files:**
- Create: `docs/superpowers/plans/MANUAL-TEST-CHECKLIST-environment-actions.md`

- [ ] **Step 1: Write the checklist**

```markdown
# Manual Test Checklist — Environment Actions (Phase 1)

Setup:
1. TrajectoryActions container running on `http://localhost:3002`.
2. Deploy kitchen scenario: `cd C:\Trajectory\TrajectoryActions && npx tsx scripts/scenarios/cli.ts deploy kitchen --server http://localhost:3002`
3. A workflow `.WFmasterX` package with at least one ACTION PROXY step referencing the kitchen environment.
4. Web-UI dev server running: `cd engines/web-ui && npm run dev` (typically on :5173).

Server picker:
- [ ] Open a workflow with one registered server → no picker appears (silent bind).
- [ ] Open a workflow with two registered servers → picker appears, both listed with name/uri/description.
- [ ] Click "Abandon workflow" on the picker → workflow does not start; UI returns to the start screen.
- [ ] Pick a server → workflow starts and the action step appears with "Connecting…" then "Starting"/"Running".
- [ ] Open a workflow with zero registered servers → ad-hoc URI picker appears with a text input.
- [ ] Enter an invalid URL → "Connect" button is disabled and red helper text appears.
- [ ] Enter a valid URL and click Connect → workflow starts.

Action step card:
- [ ] Card shows the step's local_id as title.
- [ ] Card shows current state label ("Starting", "Running", etc.).
- [ ] Card shows the resolved input parameters.
- [ ] Action self-pauses with HELD → card shows "Held" in warning color.
- [ ] Action resumes from HELD on its own → label returns to "Running" automatically.

Command dropdown:
- [ ] While Running → dropdown shows PAUSE, HOLD, ABORT, STOP.
- [ ] While Paused → dropdown shows RESUME, ABORT, STOP.
- [ ] While Held → dropdown shows ONLY STOP and ABORT.
- [ ] After Completed → dropdown shows CLEAR.
- [ ] After ABORT click → toast appears if 409; otherwise card moves to ABORTED state.
- [ ] Opaque action → dropdown shows only ABORT regardless of state.

Reload mid-flight:
- [ ] Start a long-running action, reload the browser → card reappears in last-known state and SSE reconnects.
- [ ] Delete the instance via curl while reloaded → card transitions to "Instance lost on server".

Abandon workflow:
- [ ] Click Abandon while an ACTION PROXY is RUNNING → all active instances receive ABORT then DELETE; instance ids disappear from the server.
- [ ] Use `curl http://localhost:3002/trajectory/v1/instances?status=active` before and after to verify cleanup.

Log panel:
- [ ] Open StepDetailPopup for a Running ACTION PROXY → log panel shows messages or "No log messages."
- [ ] Trigger an action that emits stderr → message appears in red.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/plans/MANUAL-TEST-CHECKLIST-environment-actions.md
git commit -m "docs: manual test checklist for environment actions"
```

### Task 7.2: Update workflow schema spec docs

**Files:**
- Modify: `docs/Trajectory-Workflow-Schema-Specification.md`

- [ ] **Step 1: Add a section**

At the end of the existing `Trajectory-Workflow-Schema-Specification.md`, append:

```markdown
## ACTION PROXY step

An `ACTION PROXY` step delegates execution to an external action server (Trajectory Action Container) over the Trajectory REST protocol (`docs/2026-05-18-trajectory-rest-protocol-design.md`).

### Step block

```json
{
  "local_id": "pick-and-place",
  "oid": "step-pick-001",
  "version": "1.0.0",
  "last_modified_date": "2026-05-19T00:00:00Z",
  "step_type": "ACTION PROXY",
  "action_proxy_config": {
    "action_oid": "act-pick-001",
    "environment_oid": "env-warehouse",
    "timeout_ms": 30000
  }
}
```

- `action_proxy_config.action_oid` MUST match an entry in `environment_specifications[environment_oid].included_actions[].action_oid`.
- `action_proxy_config.environment_oid` MUST match an `environment_specifications[].oid`.
- `action_proxy_config.timeout_ms` is optional; passed through to the action server's invoke endpoint.

### `action_server_specifications` on an environment

Environments declare the servers that can execute their actions:

```json
{
  "oid": "env-warehouse",
  "local_id": "warehouse",
  "version": "1.0.0",
  "last_modified_date": "2026-05-19T00:00:00Z",
  "action_server_specifications": [
    {
      "name": "warehouse-controller-01",
      "uri": "http://warehouse-01.lan:3002",
      "description": "Primary warehouse controller",
      "connection_type": "REST"
    }
  ],
  "included_actions": [
    { "action_oid": "act-pick-001", "action_name": "PickAndPlace", "action_library": "warehouse-lib" }
  ]
}
```

At workflow start, if an environment has multiple registered servers AND at least one ACTION PROXY step references it, the runtime prompts the user to choose a server. The chosen server is used for every ACTION PROXY invocation referencing that environment for the lifetime of the workflow instance.
```

- [ ] **Step 2: Commit**

```bash
git add docs/Trajectory-Workflow-Schema-Specification.md
git commit -m "docs: document ACTION PROXY step and action_server_specifications"
```

### Task 7.3: Run manual checklist + full test suite + final smoke

- [ ] **Step 1: Full test suite — KMP**

```bash
cd engines/kmp-engine && ./gradlew jvmTest
```
Expected: BUILD SUCCESSFUL; all conformance + ActionProxyValidatorTest pass.

- [ ] **Step 2: Full test suite — TS engine**

```bash
cd engines/web && npm test
```
Expected: all tests pass including the 4 new action-proxy fixtures.

- [ ] **Step 3: Full test suite — web-ui unit**

```bash
cd engines/web-ui && npm test
```
Expected: all action proxy unit tests pass.

- [ ] **Step 4: Full test suite — web-ui integration**

(With TrajectoryActions container running on :3002.)

```bash
cd engines/web-ui && npm run test:integration
```
Expected: all four E2E tests pass.

- [ ] **Step 5: Final web-ui build**

```bash
cd engines/web-ui && npm run build
```
Expected: clean production build.

- [ ] **Step 6: Run the manual checklist**

Open `docs/superpowers/plans/MANUAL-TEST-CHECKLIST-environment-actions.md` and walk through every checkbox in a browser pointed at the dev server. Document any failures as new tasks before merging.

- [ ] **Step 7: Final commit**

If any small tweaks emerged during manual testing, commit them individually. If everything's clean:

```bash
git log --oneline main..HEAD
```

Review the branch history. The final commit (or PR description) should summarize the Phase 1 deliverable.

---

## Done criteria for Phase 1

- All conformance fixtures (web + KMP JVM + KMP JS) pass.
- All unit tests for `stateMapping`, `persistence`, `ActionApiClient`, `SseObserver`, `ActionProxyController` pass.
- Integration tests against TrajectoryActions on `:3002` pass.
- Manual checklist completed and any issues filed.
- Schema docs updated.
- `feat/environment-actions` branch ready for review/merge.
