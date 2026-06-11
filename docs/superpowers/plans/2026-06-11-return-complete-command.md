# RETURN `COMPLETE` Command — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fifth TRY-CATCH-RETURN command, `COMPLETE`, that marks the triggering step as if it had completed successfully and resumes that step's own successors (strictly branch-local).

**Architecture:** A workflow's `RETURN` step closes a CATCH network with a command. The command set is enumerated in a JSON schema (source of truth), two runtime engines kept in lock-step by a shared conformance suite (`engines/web` TypeScript, `engines/kmp-engine` Kotlin), a hand-maintained web-ui validation mirror, and the editor (dropdown + types + schema). `COMPLETE` is added to every surface. The runtime handler reuses the existing completion-queue drain (the same mechanism `RESTART` uses to re-fire `START`): set the trigger `COMPLETED`, push it on the queue, and the active drain loop advances to its successors. It is the mirror of `returnRetry` (which re-runs the trigger) — `COMPLETE` skips ahead instead.

**Tech Stack:** TypeScript (Node `node:test` runner, AJV), Kotlin Multiplatform (Gradle, JUnit5 `@TestFactory`), React + Vitest (editor), JSON Schema, JSON conformance fixtures.

**Design spec:** `TrajectoryRuntime/docs/superpowers/specs/2026-06-11-return-complete-command-design.md`. Canonical feature spec it extends: `Trajectory/docs/superpowers/specs/2026-05-31-try-catch-return-design.md`.

---

## Prerequisites — repos, branches, working directories

This change spans **three sibling git repos**. Create a `feat/return-complete-command` branch in each before committing into it.

| Repo | Path | Branch | Already exists? |
|---|---|---|---|
| Trajectory (canonical spec) | `C:\Trajectory\Trajectory` | `feat/return-complete-command` | create it |
| TrajectoryRuntime (schema, engines, conformance) | `C:\Trajectory\TrajectoryRuntime` | `feat/return-complete-command` | **already created** (holds the design + this plan) |
| TrajectoryEditor (UI) | `C:\Trajectory\TrajectoryEditor` | `feat/return-complete-command` | create it |

- [ ] **Create branches** (skip TrajectoryRuntime — already on `feat/return-complete-command`):

```bash
git -C C:/Trajectory/Trajectory rev-parse --abbrev-ref HEAD   # note current branch (likely main)
git -C C:/Trajectory/Trajectory checkout -b feat/return-complete-command
git -C C:/Trajectory/TrajectoryEditor checkout -b feat/return-complete-command
git -C C:/Trajectory/TrajectoryRuntime rev-parse --abbrev-ref HEAD   # expect: feat/return-complete-command
```

**Delivery order is runtime-first** (the runtime must accept `COMPLETE` before the editor emits it). Do the tasks in numerical order. Tasks 2–8 are TrajectoryRuntime, Task 1 is Trajectory (docs), Tasks 9–11 are TrajectoryEditor.

**Invariant to preserve (do not violate in any task):** `COMPLETE` writes only the triggering step's state and follows only the triggering step's own outgoing edges. It must never directly complete/abort/reset a concurrent (parallel-branch) step. There is intentionally **no** parallel/branch-local conformance fixture.

---

## Task 1: Amend the canonical TRY-CATCH-RETURN spec (Trajectory repo)

Pure documentation. No tests.

**Files:**
- Modify: `C:\Trajectory\Trajectory\docs\superpowers\specs\2026-05-31-try-catch-return-design.md`

- [ ] **Step 1: §0 — add `COMPLETE` to the branch-local decision and add a semantics row**

In the "## 0. Locked design decisions" table, replace this row:

```markdown
| Workflow-global vs branch-local | `ABANDON` and `RESTART` are workflow-global. `RETRY` and `GOTO` are branch-local (other parallel branches continue unaffected). |
```

with:

```markdown
| Workflow-global vs branch-local | `ABANDON` and `RESTART` are workflow-global. `RETRY`, `GOTO`, and `COMPLETE` are branch-local (other parallel branches continue unaffected). |
| COMPLETE semantics | Marks the triggering step `COMPLETED` and resumes its own successors as if it had succeeded. Strictly branch-local — never touches a parallel step. No sub-fields. Produces no action outputs (the action failed); the catch network sets Value Properties for any downstream data. |
```

- [ ] **Step 2: §1.3 — add `COMPLETE` to the command enum and the no-sub-fields note**

Replace:

```markdown
- `return_config.command ∈ {"ABANDON", "RESTART", "GOTO", "RETRY"}`. Required.
```

with:

```markdown
- `return_config.command ∈ {"ABANDON", "RESTART", "GOTO", "RETRY", "COMPLETE"}`. Required.
```

And replace:

```markdown
- `ABANDON` and `RETRY` use no sub-fields.
```

with:

```markdown
- `ABANDON`, `RETRY`, and `COMPLETE` use no sub-fields.
```

- [ ] **Step 3: §3.3 — add `COMPLETE` to the branch-local list**

Replace:

```markdown
  - `RETRY` and `GOTO` are **branch-local** — only the failed branch is touched; other branches continue.
```

with:

```markdown
  - `RETRY`, `GOTO`, and `COMPLETE` are **branch-local** — only the failed branch is touched; other branches continue.
```

- [ ] **Step 4: §5 — insert the COMPLETE dispatch subsection and renumber**

Find `### 5.6 Catch-network cleanup after any command` and insert this new subsection immediately **before** it:

```markdown
### 5.6 COMPLETE (branch-local)

1. Look up `CatchContext.trigger_step_oid` — the step that originally failed. It is currently `IDLE` (TRY deactivated it when the CATCH activated; see §5.4 step 2).
2. Mark the trigger step `COMPLETED` and append the trace entry. Its `EXECUTING → IDLE` caught-failure history remains.
3. Activate the trigger step's normal outgoing connection(s) — its success-path successors — as if it had completed. The trigger's completion-time **Release** `resource_command_specifications` run as part of normal completion; a `WAIT ALL` / `WAIT ANY` successor counts as one arrival at that join from this branch (identical to §5.4).
4. Other parallel branches keep running, untouched. `COMPLETE` never advances, completes, aborts, or resets a sibling step. (A shared `WAIT ALL` join still blocks until the siblings arrive on their own.)

No action outputs are produced (the action failed). `COMPLETE` carries no sub-fields. §5.6 cleanup (below) and §4.4 (the `CATCH_LATE_RETURN` no-op rule for non-`ABANDON` commands) apply unchanged.

```

Then renumber the two following headings: `### 5.6 Catch-network cleanup after any command` → `### 5.7 Catch-network cleanup after any command`, and `### 5.7 Summary` → `### 5.8 Summary`.

- [ ] **Step 5: §5.8 — add the summary-table row**

In the (now §5.8) summary table, after the `| RETRY |` row, add:

```markdown
| `COMPLETE` | running (past the trigger) | marked `COMPLETED`, successors activated | unaffected | trigger's Release commands run on completion | preserved |
```

- [ ] **Step 6: §6.1 — add `COMPLETE` to the validator enum**

Replace:

```markdown
| `INVALID_RETURN_COMMAND` | `return_config.command` ∉ `{ABANDON, RESTART, GOTO, RETRY}`. |
```

with:

```markdown
| `INVALID_RETURN_COMMAND` | `return_config.command` ∉ `{ABANDON, RESTART, GOTO, RETRY, COMPLETE}`. |
```

- [ ] **Step 7: Commit**

```bash
git -C C:/Trajectory/Trajectory add docs/superpowers/specs/2026-05-31-try-catch-return-design.md
git -C C:/Trajectory/Trajectory commit -m "docs(try-catch): add COMPLETE to the RETURN command spec" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

(If `add` reports the path is gitignored, re-run with `add -f`.)

---

## Task 2: JSON schema enum (TrajectoryRuntime)

Working dir: `C:\Trajectory\TrajectoryRuntime\engines\web`. The schema is read at test runtime, so each verification is `npm run build && node --test dist/<file>.test.js`.

**Files:**
- Modify: `C:\Trajectory\TrajectoryRuntime\spec\workflow-schema.json:404`
- Test: `C:\Trajectory\TrajectoryRuntime\engines\web\src\try-catch-schema.test.ts`

- [ ] **Step 1: Write the failing test**

Append this `it` inside the `describe('schema: try_specifications / return_config shape', …)` block (after the existing "rejects a return_config with an unknown command" test, before the block's closing `})`), in `engines/web/src/try-catch-schema.test.ts`:

```ts
  it('accepts a return_config with the COMPLETE command', () => {
    const validate = compile();
    const ok = validate(wfWithStep({
      local_id: 'R', oid: 'r1', step_type: 'RETURN', version: '1.0.0', last_modified_date: DATE,
      return_config: { command: 'COMPLETE' },
    }));
    const cmdErr = (validate.errors ?? []).some(e => e.keyword === 'enum' && (e.instancePath ?? '').includes('command'));
    assert.equal(cmdErr, false, `unexpected command enum error: ${JSON.stringify(validate.errors)}`);
    assert.equal(ok, true, `errors: ${JSON.stringify(validate.errors)}`);
  });
```

- [ ] **Step 2: Run it to confirm it fails**

Run (from `engines/web`): `npm run build && node --test dist/try-catch-schema.test.js`
Expected: FAIL — the new test reports a command enum error (the schema enum lacks `COMPLETE`).

- [ ] **Step 3: Add `COMPLETE` to the schema enum**

In `spec/workflow-schema.json`, in the `ReturnConfig` definition (line 404), change the `command` property line:

```json
        "command": { "type": "string", "enum": ["ABANDON", "RESTART", "GOTO", "RETRY"] },
```

to:

```json
        "command": { "type": "string", "enum": ["ABANDON", "RESTART", "GOTO", "RETRY", "COMPLETE"] },
```

- [ ] **Step 4: Run it to confirm it passes**

Run (from `engines/web`): `npm run build && node --test dist/try-catch-schema.test.js`
Expected: PASS (`# fail 0`).

- [ ] **Step 5: Commit**

```bash
git -C C:/Trajectory/TrajectoryRuntime add spec/workflow-schema.json engines/web/src/try-catch-schema.test.ts
git -C C:/Trajectory/TrajectoryRuntime commit -m "feat(return-complete): allow COMPLETE in the workflow JSON schema" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Web engine — validation accepts COMPLETE (TrajectoryRuntime)

Working dir: `C:\Trajectory\TrajectoryRuntime\engines\web`. Depends on Task 2 (the web validator runs the AJV schema after its structural checks, so the schema must already allow `COMPLETE`).

**Files:**
- Modify: `C:\Trajectory\TrajectoryRuntime\engines\web\src\validator.ts:192`
- Modify: `C:\Trajectory\TrajectoryRuntime\engines\web\src\types.ts:357`
- Test: `C:\Trajectory\TrajectoryRuntime\engines\web\src\try-catch-validator.test.ts`

- [ ] **Step 1: Write the failing test**

Append this `it` inside the `describe('validator: catch-network is not orphaned', …)` block in `engines/web/src/try-catch-validator.test.ts` (after the existing "accepts a minimal well-formed…" test, before the block's closing `})`):

```ts
  it('accepts a RETURN with the COMPLETE command', () => {
    const r = validate(baseWithCatch({ returnConfig: { command: 'COMPLETE' } }));
    assert.equal(r.valid, true, `expected valid, got ${r.error_code}: ${r.error_message}`);
  });
```

- [ ] **Step 2: Run it to confirm it fails**

Run (from `engines/web`): `npm run build && node --test dist/try-catch-validator.test.js`
Expected: FAIL — `r.error_code` is `INVALID_RETURN_COMMAND` (the structural `COMMANDS` set rejects `COMPLETE` before AJV runs).

- [ ] **Step 3: Add `COMPLETE` to the validator command set**

In `engines/web/src/validator.ts`, change:

```ts
  const COMMANDS = new Set(['ABANDON', 'RESTART', 'GOTO', 'RETRY']);
```

to:

```ts
  const COMMANDS = new Set(['ABANDON', 'RESTART', 'GOTO', 'RETRY', 'COMPLETE']);
```

- [ ] **Step 4: Add `COMPLETE` to the TypeScript type**

In `engines/web/src/types.ts`, change the `ReturnConfig` interface:

```ts
export interface ReturnConfig {
  command: 'ABANDON' | 'RESTART' | 'GOTO' | 'RETRY';
  restart_mode?: 'CLEAN' | 'KEEP';
  goto_step_oid?: string;
}
```

to:

```ts
export interface ReturnConfig {
  command: 'ABANDON' | 'RESTART' | 'GOTO' | 'RETRY' | 'COMPLETE';
  restart_mode?: 'CLEAN' | 'KEEP';
  goto_step_oid?: string;
}
```

- [ ] **Step 5: Run it to confirm it passes**

Run (from `engines/web`): `npm run build && node --test dist/try-catch-validator.test.js`
Expected: PASS (`# fail 0`). The `npm run build` (tsc) also confirms the type change compiles.

- [ ] **Step 6: Commit**

```bash
git -C C:/Trajectory/TrajectoryRuntime add engines/web/src/validator.ts engines/web/src/types.ts engines/web/src/try-catch-validator.test.ts
git -C C:/Trajectory/TrajectoryRuntime commit -m "feat(return-complete): accept COMPLETE in the web engine validator + type" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Web engine — execute COMPLETE (TrajectoryRuntime)

Working dir: `C:\Trajectory\TrajectoryRuntime\engines\web`. This is the core behavior.

**Files:**
- Modify: `C:\Trajectory\TrajectoryRuntime\engines\web\src\engine.ts:342` (VALID_COMMANDS), `:372` (switch), `:425` (new method)
- Test: `C:\Trajectory\TrajectoryRuntime\engines\web\src\try-catch-engine.test.ts`

- [ ] **Step 1: Write the failing test**

Append this `describe` block at the end of `engines/web/src/try-catch-engine.test.ts` (after the `RETURN RETRY` block, before EOF):

```ts
describe('engine: RETURN COMPLETE', () => {
  it('force-completes the triggering step and resumes its successors; workflow completes', () => {
    const engine = new WorkflowEngine(tryWorkflow({ returnConfig: { command: 'COMPLETE' } }));
    engine.start();
    engine.submitAction({ step_oid: 's2', action: 'fail', failure_mode: 'ERROR', error: 'x' }, 0);
    // Trigger s2 is marked COMPLETED and the flow advances to End (s3) → workflow COMPLETED.
    assert.equal(engine.getWorkflowState(), 'COMPLETED');
    assert.ok(traceStates(engine).includes('s2:COMPLETED'), 's2 was not force-completed');
    assert.equal(engine.activeCatchesSize(), 0); // catch context cleaned up when RETURN executes
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run (from `engines/web`): `npm run build && node --test dist/try-catch-engine.test.js`
Expected: FAIL — `getWorkflowState()` is `ERRORED` (the dispatcher's `VALID_COMMANDS` backstop rejects the unknown `COMPLETE` and errors the workflow).

- [ ] **Step 3: Add `COMPLETE` to the dispatcher's valid set**

In `engines/web/src/engine.ts` (inside `dispatchReturn`), change:

```ts
    const VALID_COMMANDS = new Set(['ABANDON', 'RESTART', 'GOTO', 'RETRY']);
```

to:

```ts
    const VALID_COMMANDS = new Set(['ABANDON', 'RESTART', 'GOTO', 'RETRY', 'COMPLETE']);
```

- [ ] **Step 4: Add the switch case**

In the same `dispatchReturn` `switch (rc.command)`, add the `COMPLETE` case after the `RETRY` case:

```ts
      case 'RETRY': this.returnRetry(ctx); break; // Task E4
      case 'COMPLETE': this.returnComplete(ctx); break;
```

- [ ] **Step 5: Add the `returnComplete` handler**

In `engine.ts`, immediately after the `returnRetry` method (which ends `…this.activateStep(trigger); // re-invoke the trigger ACTION PROXY → EXECUTING again` then `}`), add:

```ts
  /** COMPLETE (branch-local): mark the triggering step as if it had completed and resume its
   *  successors. The active drainCompletionQueue loop (dispatchReturn runs inside it) advances
   *  from the trigger's outgoing edges — the same mechanism RESTART uses to re-fire START.
   *  Unlike RESTART it does NOT clear completionQueue: sibling-branch activations already queued
   *  must keep their place. cleanupCatchNetwork (after the switch) leaves the trigger alone — it
   *  lives in the main flow, not the catch network. */
  private returnComplete(ctx?: CatchContext): void {
    if (!ctx) return;
    const trigger = this.steps.get(ctx.trigger_step_oid);
    if (!trigger) return;
    this.recordTrace(trigger.oid, 'COMPLETED');
    trigger.state = 'COMPLETED';
    this.completionQueue.push(trigger.oid);
  }
```

(`CatchContext` is already imported/used by `returnRetry` in this file — no new import.)

- [ ] **Step 6: Run it to confirm it passes**

Run (from `engines/web`): `npm run build && node --test dist/try-catch-engine.test.js`
Expected: PASS (`# fail 0`).

- [ ] **Step 7: Run the full web engine test suite (no regressions)**

Run (from `engines/web`): `npm run build && npm test`
Expected: PASS — all existing TRY-CATCH tests (ABANDON/RESTART/GOTO/RETRY) still pass.

- [ ] **Step 8: Commit**

```bash
git -C C:/Trajectory/TrajectoryRuntime add engines/web/src/engine.ts engines/web/src/try-catch-engine.test.ts
git -C C:/Trajectory/TrajectoryRuntime commit -m "feat(return-complete): execute COMPLETE in the web engine" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Web-ui validation mirror (TrajectoryRuntime)

Working dir: `C:\Trajectory\TrajectoryRuntime\engines\web-ui`. `validation.ts` is the hand-maintained mirror of `engines/web/src/validator.ts`; `workflow-validator.generated.cjs` is regenerated from the (Task-2-updated) schema by `npm run gen:validator`, which the test command runs first.

**Files:**
- Modify: `C:\Trajectory\TrajectoryRuntime\engines\web-ui\src\manager\validation.ts:438`
- Test: `C:\Trajectory\TrajectoryRuntime\engines\web-ui\src\manager\validation.test.ts`

- [ ] **Step 1: Write the failing test**

Append this test at the end of `engines/web-ui/src/manager/validation.test.ts` (it reuses the file's existing `catchIslandWf` helper):

```ts
test('accepts a RETURN with the COMPLETE command', () => {
  const result = validateWorkflow(catchIslandWf({ command: 'COMPLETE' }));
  assert.equal(result.valid, true, `expected valid; got ${result.error_code}: ${result.error_message}`);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run (from `engines/web-ui`): `npm run gen:validator && node --import tsx --test src/manager/validation.test.ts`
Expected: FAIL — `result.error_code` is `INVALID_RETURN_COMMAND` (the hand-maintained `COMMANDS` set still lacks `COMPLETE`).

- [ ] **Step 3: Add `COMPLETE` to the mirror command set**

In `engines/web-ui/src/manager/validation.ts` (inside `returnConfigValidation`), change:

```ts
  const COMMANDS = new Set(['ABANDON', 'RESTART', 'GOTO', 'RETRY']);
```

to:

```ts
  const COMMANDS = new Set(['ABANDON', 'RESTART', 'GOTO', 'RETRY', 'COMPLETE']);
```

- [ ] **Step 4: Run it to confirm it passes**

Run (from `engines/web-ui`): `npm run gen:validator && node --import tsx --test src/manager/validation.test.ts`
Expected: PASS. (`gen:validator` rebuilds the standalone schema validator from the updated `spec/workflow-schema.json`, so the schema layer also accepts `COMPLETE`.)

- [ ] **Step 5: Commit**

```bash
git -C C:/Trajectory/TrajectoryRuntime add engines/web-ui/src/manager/validation.ts engines/web-ui/src/manager/validation.test.ts
git -C C:/Trajectory/TrajectoryRuntime commit -m "feat(return-complete): accept COMPLETE in the web-ui validation mirror" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Kotlin engine — validation accepts COMPLETE (TrajectoryRuntime)

Working dir: `C:\Trajectory\TrajectoryRuntime\engines\kmp-engine`. Tests run via the module's own Gradle wrapper.

**Files:**
- Modify: `…\kmp-engine\src\commonMain\kotlin\com\trajectoryruntime\engine\Validator.kt:472`
- Modify: `…\kmp-engine\src\commonMain\kotlin\com\trajectoryruntime\engine\Types.kt:158` (comment only)
- Test: `…\kmp-engine\src\jvmTest\kotlin\com\trajectoryruntime\engine\TryCatchValidatorTest.kt`

- [ ] **Step 1: Write the failing test**

Add this `@Test` inside `class TryCatchValidatorTest` in `TryCatchValidatorTest.kt` (e.g. after the `accepts a minimal well-formed TRY CATCH RETURN workflow` test):

```kotlin
  @Test fun `accepts a RETURN with the COMPLETE command`() {
    val r = validate(wfMap(baseWithCatch(returnJson = """{"command":"COMPLETE"}""")))
    assertEquals(true, r.valid, "expected valid, got ${r.error_code}: ${r.error_message}")
  }
```

- [ ] **Step 2: Run it to confirm it fails**

Run (from `engines/kmp-engine`): `.\gradlew.bat jvmTest --tests "com.trajectoryruntime.engine.TryCatchValidatorTest"`
Expected: FAIL — the new test fails because `validate(...).valid` is `false` with `INVALID_RETURN_COMMAND` (the `commands` set lacks `COMPLETE`).

- [ ] **Step 3: Add `COMPLETE` to the Kotlin command set**

In `Validator.kt`, change:

```kotlin
    val commands = setOf("ABANDON", "RESTART", "GOTO", "RETRY")
```

to:

```kotlin
    val commands = setOf("ABANDON", "RESTART", "GOTO", "RETRY", "COMPLETE")
```

- [ ] **Step 4: Update the `ReturnConfig` comment**

In `Types.kt`, change:

```kotlin
    val command: String,         // ABANDON | RESTART | GOTO | RETRY
```

to:

```kotlin
    val command: String,         // ABANDON | RESTART | GOTO | RETRY | COMPLETE
```

- [ ] **Step 5: Run it to confirm it passes**

Run (from `engines/kmp-engine`): `.\gradlew.bat jvmTest --tests "com.trajectoryruntime.engine.TryCatchValidatorTest"`
Expected: PASS (`BUILD SUCCESSFUL`).

- [ ] **Step 6: Commit**

```bash
git -C C:/Trajectory/TrajectoryRuntime add engines/kmp-engine/src/commonMain/kotlin/com/trajectoryruntime/engine/Validator.kt engines/kmp-engine/src/commonMain/kotlin/com/trajectoryruntime/engine/Types.kt engines/kmp-engine/src/jvmTest/kotlin/com/trajectoryruntime/engine/TryCatchValidatorTest.kt
git -C C:/Trajectory/TrajectoryRuntime commit -m "feat(return-complete): accept COMPLETE in the Kotlin engine validator" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Kotlin engine — execute COMPLETE (TrajectoryRuntime)

Working dir: `C:\Trajectory\TrajectoryRuntime\engines\kmp-engine`. Mirror of the web engine handler.

**Files:**
- Modify: `…\kmp-engine\src\commonMain\kotlin\com\trajectoryruntime\engine\WorkflowEngine.kt:1239` (when), `:1304` (new fun)
- Test: `…\kmp-engine\src\jvmTest\kotlin\com\trajectoryruntime\engine\TryCatchEngineTest.kt`

- [ ] **Step 1: Write the failing test**

Add this `@Test` at the end of `class TryCatchEngineTest` in `TryCatchEngineTest.kt` (after the `RETURN RETRY …` test, before the class closing `}`):

```kotlin
  @Test fun `RETURN COMPLETE force-completes the trigger and the workflow completes`() {
    val engine = WorkflowEngine(wfSpec(tryWf(returnJson = """{"command":"COMPLETE"}""")))
    engine.start()
    engine.submitAction(UserAction(step_oid = "s2", action = "fail", failure_mode = "ERROR", error = "x"), 0)
    assertEquals(WorkflowState.COMPLETED, engine.getWorkflowState())
    assertTrue(engine.getTrace().any { it.step_oid == "s2" && it.state == "COMPLETED" }, "s2 was not force-completed")
  }
```

- [ ] **Step 2: Run it to confirm it fails**

Run (from `engines/kmp-engine`): `.\gradlew.bat jvmTest --tests "com.trajectoryruntime.engine.TryCatchEngineTest"`
Expected: FAIL — `getWorkflowState()` is `RUNNING`, not `COMPLETED` (the `when` has no `COMPLETE` branch, so dispatch no-ops and the trigger never advances).

- [ ] **Step 3: Add the `when` branch**

In `WorkflowEngine.kt`'s `dispatchReturn`, change:

```kotlin
            "RETRY" -> returnRetry(ctx)
        }
```

to:

```kotlin
            "RETRY" -> returnRetry(ctx)
            "COMPLETE" -> returnComplete(ctx)
        }
```

- [ ] **Step 4: Add the `returnComplete` function**

In `WorkflowEngine.kt`, immediately after the `returnRetry` function (which ends `…activateStep(trigger) // ACTION PROXY → EXECUTING again` then `}`), add:

```kotlin
    // COMPLETE (branch-local): mark the triggering step as if it had completed and resume its
    // successors. The active drainCompletionQueue loop advances from the trigger's outgoing edges
    // — the same mechanism RESTART uses for START. Unlike RESTART it does NOT clear completionQueue.
    private fun returnComplete(ctx: CatchContext?) {
        if (ctx == null) return
        val trigger = steps[ctx.trigger_step_oid] ?: return
        recordTrace(trigger.oid, "COMPLETED")
        trigger.state = StepState.COMPLETED
        completionQueue.addLast(trigger.oid)
    }
```

- [ ] **Step 5: Run it to confirm it passes**

Run (from `engines/kmp-engine`): `.\gradlew.bat jvmTest --tests "com.trajectoryruntime.engine.TryCatchEngineTest"`
Expected: PASS (`BUILD SUCCESSFUL`).

- [ ] **Step 6: Commit**

```bash
git -C C:/Trajectory/TrajectoryRuntime add engines/kmp-engine/src/commonMain/kotlin/com/trajectoryruntime/engine/WorkflowEngine.kt engines/kmp-engine/src/jvmTest/kotlin/com/trajectoryruntime/engine/TryCatchEngineTest.kt
git -C C:/Trajectory/TrajectoryRuntime commit -m "feat(return-complete): execute COMPLETE in the Kotlin engine" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Shared conformance fixture (TrajectoryRuntime)

A single execution fixture both engines run. No parallel/branch-local fixture (per the locked invariant).

**Files:**
- Create: `C:\Trajectory\TrajectoryRuntime\spec\conformance\execution\exec-try-catch-008-error-to-complete.json`

- [ ] **Step 1: Create the fixture**

Write `spec/conformance/execution/exec-try-catch-008-error-to-complete.json`:

```json
{
  "test_id": "exec-try-catch-008",
  "name": "ERROR routes to CATCH; RETURN COMPLETE force-completes the trigger and the workflow finishes",
  "category": "execution",
  "tags": ["try-catch", "complete"],
  "workflow": {
    "local_id": "wf",
    "oid": "wf-1",
    "version": "1.0.0",
    "last_modified_date": "2026-05-31T12:00:00.000Z",
    "schemaVersion": "4.0",
    "value_property_specifications": [
      { "name": "FailureContext", "entries": [{ "name": "Mode", "value": "" }] }
    ],
    "environment_specifications": [
      {
        "local_id": "env",
        "oid": "env-1",
        "version": "1.0.0",
        "last_modified_date": "2026-05-31T12:00:00.000Z",
        "included_actions": [{ "action_oid": "act-1", "action_name": "DoThing", "action_library": "lib-1" }]
      }
    ],
    "steps": [
      { "local_id": "Start", "oid": "s1", "version": "1.0.0", "last_modified_date": "2026-05-31T12:00:00.000Z", "step_type": "START" },
      { "local_id": "Action", "oid": "s2", "version": "1.0.0", "last_modified_date": "2026-05-31T12:00:00.000Z", "step_type": "ACTION PROXY", "action_proxy_config": { "action_oid": "act-1", "environment_oid": "env-1" }, "try_specifications": [{ "mode": "ERROR", "catch_id": "C1" }] },
      { "local_id": "End", "oid": "s3", "version": "1.0.0", "last_modified_date": "2026-05-31T12:00:00.000Z", "step_type": "END" },
      { "local_id": "Catch", "oid": "c1", "version": "1.0.0", "last_modified_date": "2026-05-31T12:00:00.000Z", "step_type": "CATCH", "catch_id": "C1", "output_parameter_specifications": [{ "id": "Reason", "target": "FailureContext.Mode" }] },
      { "local_id": "Ret", "oid": "r1", "version": "1.0.0", "last_modified_date": "2026-05-31T12:00:00.000Z", "step_type": "RETURN", "return_config": { "command": "COMPLETE" } }
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
    "workflow_state": "COMPLETED",
    "final_properties": { "FailureContext.Mode": "ERROR" }
  }
}
```

- [ ] **Step 2: Run the web-engine conformance suite**

Run (from `engines/web`): `npm run build && npm run conformance`
Expected: PASS — the runner auto-discovers the new fixture; `exec-try-catch-008` passes (workflow `COMPLETED`, `FailureContext.Mode == "ERROR"`), and all existing fixtures still pass.

- [ ] **Step 3: Run the Kotlin conformance suite**

Run (from `engines/kmp-engine`): `.\gradlew.bat jvmTest --tests "com.trajectoryruntime.engine.ConformanceRunner"`
Expected: PASS — the `@TestFactory` discovers `exec-try-catch-008` and it passes in the Kotlin engine too.

- [ ] **Step 4: Commit**

```bash
git -C C:/Trajectory/TrajectoryRuntime add spec/conformance/execution/exec-try-catch-008-error-to-complete.json
git -C C:/Trajectory/TrajectoryRuntime commit -m "test(return-complete): cross-engine conformance fixture for RETURN COMPLETE" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Editor — RETURN dropdown offers COMPLETE (TrajectoryEditor)

Working dir: `C:\Trajectory\TrajectoryEditor`. Tests via Vitest.

**Files:**
- Modify: `C:\Trajectory\TrajectoryEditor\src\components\properties\ReturnConfigEditor.tsx:5` (local union), `:48` (option)
- Test: `C:\Trajectory\TrajectoryEditor\src\components\properties\__tests__\ReturnConfigEditor.test.tsx`

- [ ] **Step 1: Write the failing test**

Add this `it` inside the `describe('ReturnConfigEditor', …)` block in `ReturnConfigEditor.test.tsx` (e.g. after the `'switching to RETRY shows no sub-fields'` test):

```tsx
  it('switching to COMPLETE shows no sub-fields and emits {command:"COMPLETE"}', () => {
    const onChange = vi.fn()
    const { getAllByRole } = render(<ReturnConfigEditor value={undefined} onChange={onChange} gotoTargets={targets} />)
    fireEvent.change(getAllByRole('combobox')[0], { target: { value: 'COMPLETE' } })
    expect(onChange).toHaveBeenCalledWith({ command: 'COMPLETE' })
  })
```

- [ ] **Step 2: Run it to confirm it fails**

Run (from repo root): `npx vitest run src/components/properties/__tests__/ReturnConfigEditor.test.tsx`
Expected: FAIL — there is no `COMPLETE` option, so the `<select>` value cannot become `COMPLETE`; `onChange` is called with `{ command: '' }` (or not as asserted).

- [ ] **Step 3: Add `COMPLETE` to the local type and the dropdown**

In `src/components/properties/ReturnConfigEditor.tsx`, change the interface:

```tsx
export interface ReturnConfig {
  command: 'ABANDON' | 'RESTART' | 'GOTO' | 'RETRY'
  restart_mode?: 'CLEAN' | 'KEEP'
  goto_step_oid?: string
}
```

to:

```tsx
export interface ReturnConfig {
  command: 'ABANDON' | 'RESTART' | 'GOTO' | 'RETRY' | 'COMPLETE'
  restart_mode?: 'CLEAN' | 'KEEP'
  goto_step_oid?: string
}
```

and add the option after the `RETRY` option:

```tsx
        <option value="RETRY">RETRY</option>
        <option value="COMPLETE">COMPLETE</option>
```

(No `pickCommand` change needed: `COMPLETE` has no sub-fields, so it falls through the existing `else` branch `onChange({ command: cmd })`.)

- [ ] **Step 4: Run it to confirm it passes**

Run (from repo root): `npx vitest run src/components/properties/__tests__/ReturnConfigEditor.test.tsx`
Expected: PASS — all `ReturnConfigEditor` tests green.

- [ ] **Step 5: Commit**

```bash
git -C C:/Trajectory/TrajectoryEditor add src/components/properties/ReturnConfigEditor.tsx src/components/properties/__tests__/ReturnConfigEditor.test.tsx
git -C C:/Trajectory/TrajectoryEditor commit -m "feat(return-complete): offer COMPLETE in the RETURN command dropdown" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Editor — node/export types, schema enum, round-trip & validation guards (TrajectoryEditor)

Working dir: `C:\Trajectory\TrajectoryEditor`.

**Files:**
- Modify: `C:\Trajectory\TrajectoryEditor\src\types\nodes.ts:397`
- Modify: `C:\Trajectory\TrajectoryEditor\src\lib\packageFormat\export-types.ts:305`
- Modify: `C:\Trajectory\TrajectoryEditor\src\lib\schemas\master-workflow-library.json:556`
- Test: `C:\Trajectory\TrajectoryEditor\src\lib\packageFormat\__tests__\try-catch-roundtrip.test.ts`
- Test: `C:\Trajectory\TrajectoryEditor\src\lib\export\__tests__\try-catch-validation.test.ts`

- [ ] **Step 1: Write the failing round-trip test**

Add this `it` inside the `describe('TRY/CATCH/RETURN export → import round-trip', …)` block in `try-catch-roundtrip.test.ts`:

```ts
  it('preserves a COMPLETE returnConfig', () => {
    const completeNodes = nodes.map((n) =>
      n.id === 'r1' ? { ...n, data: { ...(n as { data: object }).data, returnConfig: { command: 'COMPLETE' } } } : n,
    ) as unknown as WorkflowNode[]
    const exported = exportWorkflow(spec, completeNodes, edges)
    const result = importWorkflow(exported)
    if ('error' in result) throw new Error(result.error)
    const r1 = result.nodes.find((n) => n.id === 'r1')!
    expect((r1.data as { returnConfig?: unknown }).returnConfig).toEqual({ command: 'COMPLETE' })
  })
```

- [ ] **Step 2: Add a validation guard test**

Add this `it` inside the `describe('TRY/CATCH/RETURN validation', …)` block in `src/lib/export/__tests__/try-catch-validation.test.ts` (it mirrors the existing "passes a well-formed…" test):

```ts
  it('passes a COMPLETE return (no TC errors)', () => {
    const nodes = [
      N('s1', 'start'),
      N('s2', 'actionProxyWait', { trySpecifications: [{ mode: 'ERROR', catch_id: 'C1' }] }),
      N('s3', 'end'),
      N('c1', 'catch', { catchId: 'C1' }),
      N('r1', 'return', { returnConfig: { command: 'COMPLETE' } }),
    ]
    const tc = validateWorkflow(nodes, [E('s1', 's2'), E('s2', 's3'), E('c1', 'r1')]).filter(
      (x) => x.nodeType === 'catch' || x.nodeType === 'return' || /TRY|CATCH|RETURN/i.test(x.message),
    )
    expect(tc).toEqual([])
  })
```

- [ ] **Step 3: Run both tests to confirm status**

Run (from repo root): `npx vitest run src/lib/packageFormat/__tests__/try-catch-roundtrip.test.ts src/lib/export/__tests__/try-catch-validation.test.ts`
Expected: the round-trip test PASSES (export/import pass the command through verbatim) and the validation guard PASSES (`COMPLETE` needs no sub-fields, so no error). These are regression guards locking the behavior in. If either fails, stop and investigate before continuing.

- [ ] **Step 4: Add `COMPLETE` to the node data type**

In `src/types/nodes.ts`, change the `returnConfig` union:

```ts
  returnConfig?: {
    command: 'ABANDON' | 'RESTART' | 'GOTO' | 'RETRY'
    restart_mode?: 'CLEAN' | 'KEEP'
    goto_step_oid?: string
  }
```

to:

```ts
  returnConfig?: {
    command: 'ABANDON' | 'RESTART' | 'GOTO' | 'RETRY' | 'COMPLETE'
    restart_mode?: 'CLEAN' | 'KEEP'
    goto_step_oid?: string
  }
```

- [ ] **Step 5: Add `COMPLETE` to the export type**

In `src/lib/packageFormat/export-types.ts`, change:

```ts
  return_config?: {
    command: 'ABANDON' | 'RESTART' | 'GOTO' | 'RETRY'
    restart_mode?: 'CLEAN' | 'KEEP'
    goto_step_oid?: string
  }
```

to:

```ts
  return_config?: {
    command: 'ABANDON' | 'RESTART' | 'GOTO' | 'RETRY' | 'COMPLETE'
    restart_mode?: 'CLEAN' | 'KEEP'
    goto_step_oid?: string
  }
```

- [ ] **Step 6: Add `COMPLETE` to the editor's library JSON schema**

In `src/lib/schemas/master-workflow-library.json`, change the RETURN command enum:

```json
                      "enum": ["ABANDON", "RESTART", "GOTO", "RETRY"],
```

to:

```json
                      "enum": ["ABANDON", "RESTART", "GOTO", "RETRY", "COMPLETE"],
```

- [ ] **Step 7: Typecheck + re-run the two tests**

Run (from repo root): `npx tsc -b && npx vitest run src/lib/packageFormat/__tests__/try-catch-roundtrip.test.ts src/lib/export/__tests__/try-catch-validation.test.ts`
Expected: `tsc -b` succeeds (the union additions compile) and both test files PASS.

- [ ] **Step 8: Commit**

```bash
git -C C:/Trajectory/TrajectoryEditor add src/types/nodes.ts src/lib/packageFormat/export-types.ts src/lib/schemas/master-workflow-library.json src/lib/packageFormat/__tests__/try-catch-roundtrip.test.ts src/lib/export/__tests__/try-catch-validation.test.ts
git -C C:/Trajectory/TrajectoryEditor commit -m "feat(return-complete): editor types, schema, and round-trip for COMPLETE" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Editor — HELP docs (TrajectoryEditor)

Working dir: `C:\Trajectory\TrajectoryEditor`. Documentation.

**Files:**
- Modify: `C:\Trajectory\TrajectoryEditor\HELP.md` (the Return command table, ~line 567; and the one-line summary, ~line 172)

- [ ] **Step 1: Add the COMPLETE row to the RETURN command table**

In `HELP.md`, in the `### Return` section's command table, after the `RETRY` row, add:

```markdown
| **COMPLETE** | Treat the failed step as completed and continue with the steps that follow it                       | --            |
```

- [ ] **Step 2: Update the one-line Return summary**

In the node-types summary table near the top, change:

```markdown
| Return | Ends an error-handling path and tells the runtime how to proceed (abandon, restart, go to a step, or retry) |
```

to:

```markdown
| Return | Ends an error-handling path and tells the runtime how to proceed (abandon, restart, go to a step, retry, or complete) |
```

- [ ] **Step 3: Verify HELP builds**

Run (from repo root): `npm run build:help`
Expected: completes without error (the help markdown is compiled by `scripts/build-help.mjs`).

- [ ] **Step 4: Commit**

```bash
git -C C:/Trajectory/TrajectoryEditor add HELP.md
git -C C:/Trajectory/TrajectoryEditor commit -m "docs(return-complete): document the COMPLETE RETURN command in HELP" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final verification (all repos)

- [ ] **Web engine full suite** — from `engines/web`: `npm run build && npm test && npm run conformance` → all PASS.
- [ ] **Web-ui suite** — from `engines/web-ui`: `npm test` → all PASS.
- [ ] **Kotlin engine + conformance** — from `engines/kmp-engine`: `.\gradlew.bat jvmTest` → `BUILD SUCCESSFUL` (runs unit tests + `ConformanceRunner`).
- [ ] **Editor suite** — from `TrajectoryEditor`: `npm run test:run` → all PASS.
- [ ] **Manual smoke (optional but recommended):** in the editor, add a CATCH/RETURN, pick `COMPLETE`, export, and confirm the package validates and imports back with `returnConfig.command === 'COMPLETE'`.

## Notes for the executor

- **Strict-local invariant:** never add logic that, on `COMPLETE`, touches a step other than the trigger and its own successors. If a test or change seems to require mutating a sibling/parallel step, stop — that contradicts the design.
- **No parallel conformance fixture** by design; do not add one.
- **Resource release:** `COMPLETE` intentionally runs the trigger's completion-time Release commands (it goes through the normal completion path). A sibling blocked on such a resource resuming is correct, expected behavior — not a bug.
- **Gitignore:** `docs/superpowers/**` is force-added in TrajectoryRuntime; source/test/spec/schema files in the tasks above are normally tracked and need no `-f`.
- **Hooks:** the editor runs `prettier` via a pre-commit hook; let it run (do not `--no-verify`).
