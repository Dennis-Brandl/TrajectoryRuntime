# Design: `COMPLETE` command on the RETURN step

**Date:** 2026-06-11
**Status:** Approved design, pending implementation plan
**Author:** Claude (brainstormed with user)
**Extends:** `Trajectory/docs/superpowers/specs/2026-05-31-try-catch-return-design.md` (adds a fifth RETURN command — additive, non-breaking)

## Problem

The RETURN step closes a CATCH network with one of four commands: `ABANDON` (abort the whole workflow), `RESTART` (tear down and relaunch from START), `GOTO` (jump to a main-flow step), `RETRY` (re-invoke the failed step). None of them expresses the most ordinary recovery outcome — *"the catch network handled it; treat the failed step as done and carry on with the rest of the flow."* Today an author who wants that has to fake it with a `GOTO` to whatever step happens to follow the trigger, which breaks the moment the graph changes and can't express "continue from a fan-out."

Add a fifth command, **`COMPLETE`**: mark the triggering step as if it had completed successfully and resume its normal successors.

## Decisions (locked with user)

- **Semantics:** `COMPLETE` marks the triggering step `COMPLETED` and activates that step's normal (success-path) outgoing connections. The action itself is **not** re-run.
- **Branch-local**, like `GOTO`/`RETRY`: only the failed branch advances; other parallel branches keep running. (Contrast `ABANDON`/`RESTART`, which are workflow-global.)
- **No new step-state; failure stays on the record.** The trigger's trace is `EXECUTING → IDLE (caught) → COMPLETED` — the same `IDLE` the engine already records for *any* caught step, plus a final `COMPLETED`. The failure detail is preserved the way it always is: the catch activation and the `CatchContext` (Reason / Message / Step / StepID) captured it. No `FORCE_COMPLETED`-style state is added.
- **No synthesized outputs.** A failed action produced no outputs, so `COMPLETE` maps none. Authors who need downstream data write Value Properties from the catch network (CATCH named outputs, or a SCRIPT/USER step) before the RETURN.
- **Full parity:** the TS `web` engine, the Kotlin `kmp-engine`, the `web-ui` validation mirror, the canonical spec, the JSON schema, the shared conformance suite, **and** the Editor — all updated together so nothing diverges and the conformance suite stays green.
- **Default unchanged:** the Editor's default RETURN command stays `ABANDON`.

## Behavior — dispatch spec

Extends `2026-05-31-try-catch-return-design.md` §5 (RETURN command dispatch) with a new branch-local command. Drafted in that document's style so it can be lifted in verbatim (insert as §5.6; renumber current §5.6 *Catch-network cleanup* → §5.7 and §5.7 *Summary* → §5.8).

> ### 5.6 COMPLETE (branch-local)
>
> 1. Look up `CatchContext.trigger_step_oid` — the step that originally failed. It is currently `IDLE` (TRY deactivated it when the CATCH activated; see §5.4 step 2).
> 2. Mark the trigger step `COMPLETED` and append the trace entry. Its `EXECUTING → IDLE` caught-failure history remains.
> 3. Activate the trigger step's normal outgoing connection(s) — its success-path successors — as if it had completed. The trigger's completion-time **Release** `resource_command_specifications` run as part of normal completion; a `WAIT ALL` / `WAIT ANY` successor counts as one arrival at that join from this branch (identical to §5.4).
> 4. Other parallel branches keep running.
>
> No action outputs are produced (the action failed). `COMPLETE` carries no sub-fields.

`COMPLETE` inherits, unchanged:
- **§5.6→§5.7 cleanup:** the catch network resets to `IDLE` and `active_catches[catch_oid]` is removed (the engine runs this after every command).
- **§4.4 late-return rule:** `COMPLETE` is a non-`ABANDON` command, so under a racing user-abort the first RETURN wins and a late `COMPLETE` becomes a no-op with a `CATCH_LATE_RETURN` log entry.

**§5.7→§5.8 summary table — new row:**

| Command | Workflow state after | Trigger step | Other branches | Resources | Properties |
|---|---|---|---|---|---|
| `COMPLETE` | running (past the trigger) | marked `COMPLETED`, successors activated | unaffected | trigger's Release commands run on completion | preserved |

## Runtime (`TrajectoryRuntime` — both engines, parity)

The mechanism already exists: `RESTART` marks a step `COMPLETED`, pushes it onto the completion queue, and lets the **active** `drainCompletionQueue` loop carry the flow forward (`dispatchReturn` runs inside that loop — it's invoked during successor activation, `engine.ts:1087`). `COMPLETE` reuses that path verbatim, pushing the *trigger* instead of `START`. It is the mirror image of `returnRetry`: both resolve `CatchContext.trigger_step_oid`; `RETRY` resets + re-activates (re-run), `COMPLETE` marks completed + queues (skip ahead).

**TS web engine** — `engines/web/src/engine.ts`:

1. `VALID_COMMANDS` set (`~line 342`) and the `dispatchReturn` switch (`~line 368`):

```ts
const VALID_COMMANDS = new Set(['ABANDON', 'RESTART', 'GOTO', 'RETRY', 'COMPLETE']);
// ...
case 'COMPLETE': this.returnComplete(ctx); break;
```

2. New method, sibling to `returnRetry` (`~line 425`):

```ts
/** COMPLETE (branch-local): mark the triggering step as if it had completed and resume
 *  its successors. The active drainCompletionQueue loop (dispatchReturn runs inside it)
 *  advances from the trigger's outgoing edges — the same mechanism RESTART uses for START.
 *  Other branches are untouched; cleanupCatchNetwork (after the switch) leaves the trigger
 *  alone because it lives in the main flow, not the catch network. */
private returnComplete(ctx?: CatchContext): void {
  if (!ctx) return;
  const trigger = this.steps.get(ctx.trigger_step_oid);
  if (!trigger) return;
  this.recordTrace(trigger.oid, 'COMPLETED');
  trigger.state = 'COMPLETED';
  this.completionQueue.push(trigger.oid);
}
```

Note the deliberate contrast with `returnRestart`: `COMPLETE` does **not** `completionQueue.length = 0`. `RESTART` clears the queue because it is a workflow-global teardown; `COMPLETE` is branch-local, so any sibling-branch activations already queued must keep their place and proceed.

3. `engines/web/src/types.ts` (`~line 357`) — `ReturnConfig.command` union `+= 'COMPLETE'`.
4. `engines/web/src/validator.ts` (`~line 192`) — `COMMANDS` set `+= 'COMPLETE'`.

**Kotlin engine** — `engines/kmp-engine/src/commonMain/kotlin/com/trajectoryruntime/engine/`:

- `WorkflowEngine.kt` (`when (rc.command)`, `~line 1235`) — add `"COMPLETE" -> returnComplete(ctx)`, plus the mirror handler:

```kotlin
private fun returnComplete(ctx: CatchContext?) {
    if (ctx == null) return
    val trigger = steps[ctx.trigger_step_oid] ?: return
    recordTrace(trigger.oid, "COMPLETED")
    trigger.state = "COMPLETED"
    completionQueue.add(trigger.oid)
}
```

- `Validator.kt` (`~line 472`) — `commands` set `+= "COMPLETE"`.
- `Types.kt` (`~line 158`) — update the `// ABANDON | RESTART | GOTO | RETRY` comment to include `COMPLETE` (`command` is a `String`; no type change).

**web-ui fork** — `engines/web-ui/src/manager/validation.ts` (`~line 438`) — add `'COMPLETE'` to the `COMMANDS` mirror (the file's own comment marks it a "Mirror of … engines/web/src/validator.ts — keep the two in sync"). **No `WorkflowCoordinator` change:** its `abort()` is invoked only by teardown/`dispose` and the "decline a prepared workflow" path, never by RETURN dispatch; `COMPLETE` keeps the workflow running, so it surfaces through the coordinator's normal engine-state reflection (verified — `WorkflowCoordinator.ts:301`, `HomeScreen.tsx:150`).

Both engines run the shared conformance fixtures; both must pass.

## Spec & schema additions

**Canonical spec** — `Trajectory/docs/superpowers/specs/2026-05-31-try-catch-return-design.md`:
- §0 decisions table: add `COMPLETE` to the "Workflow-global vs branch-local" row (→ "`RETRY`, `GOTO`, and `COMPLETE` are branch-local"); add a one-line "COMPLETE semantics" row.
- §1.3 RETURN step: command enum `→ {"ABANDON", "RESTART", "GOTO", "RETRY", "COMPLETE"}`; amend "`ABANDON` and `RETRY` use no sub-fields" → "`ABANDON`, `RETRY`, and `COMPLETE` use no sub-fields".
- §3.3 concurrency: add `COMPLETE` to the branch-local list.
- §5: insert §5.6 above; renumber cleanup/summary; add the summary row.
- §6.1 validator table: `INVALID_RETURN_COMMAND` set `→ {ABANDON, RESTART, GOTO, RETRY, COMPLETE}`.

**JSON schema** — `TrajectoryRuntime/spec/workflow-schema.json` (`line 404`): `ReturnConfig.command` enum `+= "COMPLETE"`.

**Conformance** — `TrajectoryRuntime/spec/conformance/execution/` (next free id is `008`):
- `exec-try-catch-008-error-to-complete.json` (new): an `ACTION PROXY` with `try ON ERROR → CATCH → RETURN COMPLETE`, followed by an `END`. A `fail` user-action fires `ERROR`; expect `workflow_state: COMPLETED` (the trigger is force-completed, its successor `END` runs). Assert the CATCH's bound `final_properties` to prove the failure was still captured.
- `exec-try-catch-009-complete-branch-local.json` (new, recommended): a `PARALLEL` fan-out where one branch's action fails and `COMPLETE`s while a sibling branch is mid-flight; assert both branches finish and the workflow completes — pins the branch-local guarantee in both engines.

## Editor (`TrajectoryEditor`)

1. **Type unions** — add `'COMPLETE'`: `src/types/nodes.ts` (`~line 397`, the `returnConfig.command` union) and `src/lib/packageFormat/export-types.ts` (`~line 305`, the export-schema union).
2. **Dropdown** — `src/components/properties/ReturnConfigEditor.tsx`: add `'COMPLETE'` to the local `ReturnConfig` union (line 5) and an `<option value="COMPLETE">COMPLETE</option>` after `RETRY` (line 48). No sub-config UI — `COMPLETE` has no `restart_mode`/`goto_step_oid`, and `pickCommand`'s existing `else` branch (`onChange({ command: cmd })`) already handles commands without sub-fields.
3. **Editor schema copy** — `src/lib/schemas/master-workflow-library.json`: add `"COMPLETE"` to the `command` enum.
4. **HELP.md** — document `COMPLETE` in the RETURN section ("marks the failed step as completed and continues with the following steps; use it when the catch network has fully handled the problem").

**Verified non-changes** (these already pass the command through and hard-code nothing):
- `src/components/nodes/renderers/unified/ReturnNode.tsx` — renders `data.returnConfig.command` as a label string verbatim (`:44-49`).
- `src/lib/packageFormat/step-extractors.ts` — `extractReturnConfig` returns `returnConfig` as-is (defaults to `ABANDON` only when absent; no command whitelist) (`:310-313`).
- `src/lib/default-step-data.ts` — default RETURN stays `ABANDON`.

## Out of scope

- No new `StepState` / no `FORCE_COMPLETED` marker (per the locked audit decision).
- No synthesized action outputs for the force-completed step.
- No change to `CatchContext`, catch-network partitioning, TRY dispatch, or `release_on_catch` handling.
- No change to `ABANDON`/`RESTART`/`GOTO`/`RETRY` behavior or to the Editor's default command.
- No backfill/migration: existing workflows are untouched; `COMPLETE` is opt-in per RETURN.

## Testing

- **TS engine** — `engines/web/src/try-catch-engine.test.ts`: `ERROR → CATCH → COMPLETE` marks the trigger `COMPLETED`, runs its successor, and the workflow reaches `COMPLETED`; a parallel case asserts the sibling branch is unaffected. `try-catch-validator.test.ts` / `try-catch-schema.test.ts`: `COMPLETE` is accepted (and needs no sub-fields).
- **Kotlin engine** — equivalent `:jvmTest` cases in `TryCatchEngineTest.kt` and `TryCatchValidatorTest.kt`.
- **Conformance** — `exec-try-catch-008` (+ `009`) pass in **both** engines.
- **Editor** — `ReturnConfigEditor.test.tsx`: the dropdown offers `COMPLETE` and selecting it yields `{ command: 'COMPLETE' }` with no sub-fields. `try-catch-roundtrip.test.ts`: a `COMPLETE` RETURN survives export → import. `ReturnNode.test.tsx`: the node renders the `COMPLETE` label.

## Delivery

**Runtime first** — the runtime must accept `COMPLETE` before the Editor can emit it; otherwise an authored workflow fails package-load with `INVALID_RETURN_COMMAND`.

1. `Trajectory` + `TrajectoryRuntime`: spec amendment + JSON schema + both engines + web-ui mirror + conformance fixtures + this design doc.
2. `TrajectoryEditor`: type unions + dropdown + schema copy + round-trip test + HELP.md.

## Key file touchpoints (verified)

- **Spec:** `Trajectory/docs/superpowers/specs/2026-05-31-try-catch-return-design.md` (§0, §1.3, §3.3, §5, §6.1).
- **Schema / conformance:** `TrajectoryRuntime/spec/workflow-schema.json:404`; `TrajectoryRuntime/spec/conformance/execution/exec-try-catch-008-*.json` (+ `009`).
- **Runtime TS:** `engines/web/src/engine.ts` (`:342` set, `:368` switch, `~:425` new `returnComplete`), `engines/web/src/types.ts:357`, `engines/web/src/validator.ts:192`; tests `engines/web/src/try-catch-engine.test.ts`, `try-catch-validator.test.ts`, `try-catch-schema.test.ts`.
- **Runtime Kotlin:** `engines/kmp-engine/src/commonMain/kotlin/com/trajectoryruntime/engine/WorkflowEngine.kt:1235`, `Validator.kt:472`, `Types.kt:158`; jvm tests `TryCatchEngineTest.kt`, `TryCatchValidatorTest.kt`.
- **Runtime web-ui:** `engines/web-ui/src/manager/validation.ts:438` (coordinator unchanged).
- **Editor:** `src/types/nodes.ts:397`, `src/lib/packageFormat/export-types.ts:~305`, `src/components/properties/ReturnConfigEditor.tsx:5,48`, `src/lib/schemas/master-workflow-library.json` (command enum), `HELP.md`. Pass-through (no edit): `ReturnNode.tsx`, `step-extractors.ts`, `default-step-data.ts`.
