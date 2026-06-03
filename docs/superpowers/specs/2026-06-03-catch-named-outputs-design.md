# Design: Default named outputs on the CATCH step

**Date:** 2026-06-03
**Status:** Approved design, pending implementation plan
**Author:** Claude (brainstormed with user)
**Amends:** `Trajectory/docs/superpowers/specs/2026-05-31-try-catch-return-design.md` §1.2 (renames the CATCH trigger-info fields — see "Breaking change" below)

## Problem

A CATCH step exposes runtime trigger-info (the error message, the failure mode, and the step that failed). Today the author must *know* four snake_case field ids (`trigger_step`, `trigger_step_oid`, `trigger_reason`, `error_message`) and hand-add an `output_parameter_specifications` entry for each — the Editor offers no discovery, so users don't realize the outputs exist. Goal: give every CATCH four ready-made, friendly-named outputs out of the box, and make the runtime recognize them.

## Decisions (locked with user)

- **Field names → friendly:** `Message`, `Reason`, `Step`, `StepID`.
- **Replace, not additive:** the old snake_case ids are dropped; only the four new names are recognized. (Breaking — see below.)
- **Editor: names locked, targets editable, deletable.** The four are seeded on a new CATCH; names are read-only, each `target` is editable, each can be removed and re-added.
- **New nodes only:** seed on canvas creation; existing saved CATCH nodes are untouched (no backfill/migration of loaded data).
- **Both engines + fixtures:** update the TS web engine and the Kotlin kmp-engine, plus shared conformance fixtures, keeping full parity.
- **Default `target` is empty:** the author wires each output to a Value Property. No auto-creation of Value Properties.

## Field contract (new)

A CATCH exposes exactly these four outputs, keyed by **name** (the Editor exports an output's `name` as the package `id`, and both engines key `KNOWN_CATCH_FIELDS` on that `id`). Each output's value is written to its `target` Value Property when the catch activates; downstream steps read that property (the mechanism the conformance fixtures already use).

| Output name (`id`) | `CatchContext` source | Value at activation |
|---|---|---|
| `Message` | `error_message ?? ''` | the Action's `error.message`, or empty string |
| `Reason` | `trigger_reason` | `ERROR` / `ABORT` / `TIMEOUT` |
| `Step` | `trigger_step_name` | `local_id` (label) of the step whose TRY fired |
| `StepID` | `trigger_step_oid` | OID of that step |

Package `id` casing is the literal name (PascalCase): `Message`, `Reason`, `Step`, `StepID`. Unknown `id`s are still ignored silently; entries without a `target` are still skipped (unchanged semantics).

## Runtime (`TrajectoryRuntime` — both engines, parity)

**TS web engine** — `engines/web/src/step-handlers.ts`, replace the `KNOWN_CATCH_FIELDS` map:

```ts
const KNOWN_CATCH_FIELDS: Record<string, (c: CatchContext) => string> = {
  Message: c => c.error_message ?? '',
  Reason: c => c.trigger_reason,
  Step: c => c.trigger_step_name,
  StepID: c => c.trigger_step_oid,
}
```

`activateCatchStep`, `CatchContext`, and `engine.ts` population are otherwise unchanged.

**Kotlin engine** — `engines/kmp-engine/src/commonMain/kotlin/com/trajectoryruntime/engine/StepHandlers.kt`, replace the `fields` map with the same four keys (`Message`/`Reason`/`Step`/`StepID`) mapped to the same `CatchContext` getters. `CatchContext` (`Types.kt`) unchanged.

**Conformance fixtures** — `spec/conformance/execution/exec-try-catch-*.json`:
- Change every CATCH `output_parameter_specifications` entry `{ "id": "trigger_reason", ... }` → `{ "id": "Reason", ... }` (targets and `final_properties` assertions stay).
- Add coverage for the other three names: at least one fixture binding `Message`, `Step`, and `StepID` to Value Property targets and asserting the resulting `final_properties` (e.g. `Message` → the submitted error text, `Step`/`StepID` → the failing step's `local_id`/`oid`).

Both engines run the shared fixtures; both must pass.

## Editor (`TrajectoryEditor`)

1. **Seed on creation.** Where a CATCH node's initial `data` is built (the palette/drag path, `StepPalette.tsx`; and any context-menu/add path that routes through `flowStore.addNode`), set `data.outputs` to the four canonical `ParameterSpec`s — names `Message`/`Reason`/`Step`/`StepID`, fresh OIDs, empty `target`, short descriptions. Centralize this in one helper (e.g. `defaultCatchOutputs()`), used by every CATCH-creation path. New nodes only.
2. **CATCH outputs UI.** In the Output Parameters section for a `catch` node, render the four with **read-only names**, an **editable target** (the existing Value Property target selector), a description, and a **×** to remove. The add control offers only canonical names not currently present (disabled when all four exist); arbitrary-named outputs cannot be added to a CATCH. Implement as a mode/prop on the existing `OutputsEditor` (e.g. `lockedNames`/`fixedNameSet`) rather than a parallel component, to stay within the existing hierarchy.
3. **Export/import:** no change needed — `extractOutputParams` (`name → id`) and `transformOutputParams` (`id → name`) already round-trip arbitrary outputs; a round-trip test confirms the four survive.
4. **HELP.md:** in the CATCH section, document the four default outputs and that you set each one's target to a Value Property to consume it downstream.

## Breaking change & migration

Recognizing only the new names means any CATCH authored against the old ids (`trigger_reason`, `error_message`, `trigger_step`, `trigger_step_oid`) will **stop populating** after this change — including earlier TRY/CATCH test workflows. New CATCH nodes get the four named outputs automatically; existing CATCH nodes must have their output names switched to the new ones (or be re-created). The 2026-05-31 spec §1.2 field table is amended to the four names above. This is intentional per the "replace" decision; the feature shipped only days earlier, so real exposure is limited to test workflows.

## Out of scope

- No auto-creation of Value Properties for default targets (targets start empty).
- No backfill of already-saved CATCH nodes (new nodes only).
- No change to `CatchContext` population, catch-network partitioning, or the "Triggered by" panel.
- android-app coordinator wiring is unaffected by this change.

## Testing

- **TS:** `step-handlers` unit tests updated to the four names; assert each of `Message`/`Reason`/`Step`/`StepID` writes the correct value to its target, and that an unknown id is still ignored.
- **Kotlin:** equivalent `:jvmTest` cases.
- **Conformance:** updated + new `exec-try-catch-*` fixtures pass in **both** engines.
- **Editor:** (a) adding a CATCH seeds exactly the four named outputs; (b) the CATCH outputs UI renders names read-only and supports remove/re-add; (c) export→import round-trip preserves the four names and targets.

## Delivery

Two coordinated PRs, **runtime first** (so the Editor emits names a runtime already recognizes):
1. `TrajectoryRuntime`: both engines + conformance fixtures + this design doc + spec §1.2 amendment.
2. `TrajectoryEditor`: seeding helper + CATCH outputs UI + round-trip test + HELP.md.

## Key file touchpoints (from codebase audit)

- Runtime TS: `engines/web/src/step-handlers.ts` (`KNOWN_CATCH_FIELDS`), tests `engines/web/src/try-catch-handlers.test.ts`, `try-catch-engine.test.ts`.
- Runtime Kotlin: `engines/kmp-engine/src/commonMain/kotlin/com/trajectoryruntime/engine/StepHandlers.kt`; jvm tests alongside.
- Fixtures: `spec/conformance/execution/exec-try-catch-*.json`.
- Editor: `src/components/palette/StepPalette.tsx` (node creation), `src/stores/flowStore.ts` (`addNode`), `src/types/nodes.ts` (`ParameterSpec`), `src/components/properties/OutputsEditor.tsx` (locked-name mode), `src/lib/packageFormat/parameter-extractors.ts` + `src/lib/import/transformers.ts` (round-trip, unchanged), `HELP.md`.
