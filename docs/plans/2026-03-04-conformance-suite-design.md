# Trajectory RT — Conformance Suite Design

**Date:** 2026-03-04
**Milestone:** Spec + Conformance Test Suite (Phase 1 — Core Flow)

## Goal

Create a language-agnostic conformance test suite that any engine implementation (TypeScript, Kotlin, Swift) can consume to verify correct behavior. Consists of:

1. A formal JSON Schema (`workflow-schema.json`) for structural validation of `.WFmaster` documents
2. JSON test fixtures organized by category, each self-contained

## Project Structure

```
C:\TrajectoryRuntime\
├── LICENSE
├── spec/
│   ├── docs/                    ← Existing specification documents
│   │   ├── SchemaSpec.md
│   │   ├── RuntimeSpecification.md
│   │   ├── PackageFormatSpec.md
│   │   ├── ParameterMappingSpec.md
│   │   ├── RESTProtocolSpec.md
│   │   ├── RichTextRenderingSpec.md
│   │   ├── TimerElementSpec.md
│   │   └── UISpec.md
│   ├── workflow-schema.json     ← Formal JSON Schema (draft 2020-12)
│   └── conformance/
│       ├── README.md            ← Fixture format docs
│       ├── validation/          ← Structural & semantic validation tests
│       ├── execution/           ← Execution trace tests
│       └── parameters/          ← Parameter resolution tests
├── docs/plans/                  ← Design & plan documents
├── engine-web/                  ← (future) TypeScript reference engine
├── engine-android/              ← (future) Kotlin engine
└── engine-ios/                  ← (future) Swift engine
```

## Test Fixture Format

```json
{
  "test_id": "exec-linear-001",
  "name": "Simple linear flow: START → USER_INTERACTION → END",
  "category": "execution",
  "tags": ["start", "end", "user_interaction", "connections"],
  "workflow": { },
  "setup": {
    "starting_parameters": {},
    "initial_properties": {}
  },
  "user_actions": [
    {
      "step_oid": "step-002",
      "action": "submit",
      "form_values": { "fieldName": "value" }
    }
  ],
  "expected": {
    "valid": true,
    "execution_trace": [
      { "step_oid": "step-001", "state": "COMPLETED", "order": 1 },
      { "step_oid": "step-002", "state": "EXECUTING", "order": 2 },
      { "step_oid": "step-002", "state": "COMPLETED", "order": 3, "after_action": 0 },
      { "step_oid": "step-003", "state": "COMPLETED", "order": 4 }
    ],
    "final_properties": {
      "SomeProperty.Value": "expected_value"
    },
    "workflow_state": "COMPLETED"
  }
}
```

### Field Definitions

- **test_id**: Unique identifier (`category-subcategory-NNN`)
- **name**: Human-readable description
- **category**: `validation`, `execution`, or `parameters`
- **tags**: Step types and features exercised
- **workflow**: Full `MasterWorkflowSpecification` JSON (self-contained)
- **setup**: Initial state before execution (starting parameters, pre-set properties)
- **user_actions**: Ordered list of simulated user inputs for interactive steps
  - `step_oid`: Which step receives the action
  - `action`: `submit`, `button_press`, `yes`, `no`
  - `form_values`: Key-value map of form field values (keyed by `fieldName`)
  - `button_output`: For button presses, the `outputValue` emitted
- **expected.valid**: Whether the workflow passes structural/semantic validation
- **expected.error_code**: For invalid workflows, which validation rule was violated
- **expected.execution_trace**: Ordered state transitions the engine must produce
- **expected.final_properties**: Value Properties that must match after execution
- **expected.workflow_state**: Final instance state (`COMPLETED`, `ABORTED`, etc.)

Validation-only tests omit `user_actions`, `execution_trace`, and `workflow_state`.

## JSON Schema Scope

**workflow-schema.json validates (structural):**
- Required fields on MasterWorkflowSpecification
- ManagedElement base fields (local_id, oid, version, last_modified_date)
- StepType enum (all 14 values)
- Connection structure (from_step_id, to_step_id)
- ParameterSpecification, OutputParameterSpecification, PropertySpecification shapes
- FormLayoutExportEntry structure and all 11 element types
- ResourcePropertySpecification and ResourceCommandSpecification
- Step-type configs (yes_no_config, script_config, select1_config)
- ParameterDefaultSource (mode: static | property)

**NOT validated by JSON Schema (semantic — tested via execution fixtures):**
- Exactly one START step
- At least one END step
- Every PARALLEL has a matching WAIT ALL
- All connection from_step_id/to_step_id reference valid step OIDs
- No orphaned steps (unreachable from START)
- SELECT 1 options match connection IDs

## Phase 1 Test Categories (~45 fixtures)

| Category | Count | What's Verified |
|----------|-------|----------------|
| validation/structural | ~10 | Schema compliance, required fields, enum values |
| validation/semantic | ~8 | START/END rules, connection integrity, PARALLEL/WAIT ALL pairing |
| execution/linear | ~5 | START→step→step→END, connection traversal |
| execution/branching | ~6 | YES_NO routing, SELECT 1 operator evaluation |
| execution/parallel | ~5 | PARALLEL fork, WAIT ALL join, concurrent states |
| execution/user-interaction | ~5 | Form display trigger, submit with values, button routing |
| parameters/resolution | ~6 | Literal defaults, property refs, dot-notation output |

## Step Types Covered in Phase 1

START, END, USER_INTERACTION, YES_NO, SELECT 1, PARALLEL, WAIT ALL

## Deferred to Phase 2+

- SCRIPT (JavaScript execution)
- ACTION PROXY / WAIT ACTION PROXY / NOWAIT ACTION PROXY (REST protocol)
- WORKFLOW PROXY (child workflow spawning)
- WAIT ANY
- MATH
- Resource management (acquire/release/pools/sync)
- Timer element behavior
- Rich text parameter chip substitution
- Package extraction (.WFmasterX ZIP handling)
- Schema migration (3.0 → 4.0)

## Key Decisions

- **Separate native engines** — Kotlin, Swift, TypeScript. Not cross-platform.
- **JSON Schema is the contract** — SchemaSpec.md v4.0 defines the format.
- **ISA-88 model** — Master recipe → Control recipe (instance copy).
- **JavaScript for scripting** — Replaces Python. JavaScriptCore (iOS), QuickJS/Hermes (Android), native (Web).
- **form_layout_config IS the UI** — Absolute positioning, 3 breakpoints.
- **Build order** — Conformance suite → Web engine → Android → iOS.
