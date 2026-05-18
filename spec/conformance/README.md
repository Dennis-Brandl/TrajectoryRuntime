# Trajectory RT Conformance Test Suite

## Purpose

This suite provides language-agnostic conformance tests for Trajectory workflow engines. Any engine implementation (TypeScript, Kotlin, Swift) can consume these JSON fixtures to verify correct parsing, validation, and execution of `.WFmaster` workflow documents.

## Directory Structure

```
spec/conformance/
├── README.md                    # This file
├── test-fixture-schema.json     # JSON Schema for test fixture files
├── validation/                  # Structural and semantic validation tests
│   ├── val-struct-*.json        # JSON Schema compliance tests
│   └── val-sem-*.json           # Runtime validation rule tests
├── execution/                   # Workflow execution tests
│   ├── exec-linear-*.json       # Linear flow tests
│   ├── exec-branch-*.json       # YES_NO and SELECT 1 branching tests
│   ├── exec-parallel-*.json     # PARALLEL / WAIT ALL tests
│   └── exec-ui-*.json           # User interaction form tests
└── parameters/                  # Parameter resolution tests
    └── param-*.json             # Default resolution, output capture, chaining
```

## Test Fixture Format

Each `.json` file conforms to `test-fixture-schema.json` and contains:

| Field | Required | Description |
|-------|----------|-------------|
| `test_id` | yes | Unique ID with prefix: `val-`, `exec-`, or `param-` |
| `name` | yes | Human-readable test name |
| `category` | yes | `validation`, `execution`, or `parameters` |
| `tags` | yes | Filtering tags (e.g., `structural`, `branching`) |
| `workflow` | yes | Embedded MasterWorkflowSpecification document |
| `setup` | no | Initial starting parameters and properties |
| `user_actions` | no | Ordered list of simulated user interactions |
| `expected` | yes | Expected outcomes (see below) |

### Expected Outcomes

- **Validation tests**: `expected.valid` (boolean) and optional `expected.error_code`
- **Execution tests**: `expected.execution_trace` (step state sequence), `expected.workflow_state`
- **Parameter tests**: `expected.final_properties` (Value Property store after execution)

## Test Categories

### Validation (`val-*`)

Tests that a workflow document is correctly validated before execution.

- **Structural** (`val-struct-*`): JSON Schema compliance — required fields, enum values, type shapes.
- **Semantic** (`val-sem-*`): Runtime validation rules — START/END presence, connection integrity, duplicate OIDs.

### Execution (`exec-*`)

Tests that the engine correctly executes workflows and produces the right state transitions.

- **Linear** (`exec-linear-*`): Sequential step activation via connection traversal.
- **Branching** (`exec-branch-*`): YES_NO routing and SELECT 1 condition evaluation.
- **Parallel** (`exec-parallel-*`): PARALLEL fork and WAIT ALL join behavior.
- **UI** (`exec-ui-*`): USER_INTERACTION form element output capture.

### Parameters (`param-*`)

Tests that parameter defaults are resolved and outputs are captured correctly.

## Step State Machine

The simplified step lifecycle used in conformance tests:

```
IDLE → WAITING → STARTING → EXECUTING → COMPLETING → COMPLETED
```

- **IDLE**: Step not yet activated
- **WAITING**: Activation requested, waiting for preconditions
- **STARTING**: Preconditions met, step initializing
- **EXECUTING**: Step running (user interaction steps wait for user input here)
- **COMPLETING**: Step finishing, writing outputs
- **COMPLETED**: Step done, outgoing connections traversed

Workflow instance states: `IDLE`, `RUNNING`, `COMPLETED`, `ABORTED`, `STOPPED`

## How Engines Consume Fixtures

```pseudocode
for each fixture_file in conformance/**/*.json:
    fixture = JSON.parse(fixture_file)
    validate fixture against test-fixture-schema.json

    if fixture.category == "validation":
        result = engine.validate(fixture.workflow)
        assert result.valid == fixture.expected.valid
        if not fixture.expected.valid:
            assert result.error_code == fixture.expected.error_code

    if fixture.category == "execution":
        instance = engine.createInstance(fixture.workflow)
        if fixture.setup:
            instance.loadParameters(fixture.setup.starting_parameters)
            instance.loadProperties(fixture.setup.initial_properties)
        instance.start()
        for action in fixture.user_actions:
            instance.submitAction(action)
        assert instance.trace == fixture.expected.execution_trace
        assert instance.state == fixture.expected.workflow_state

    if fixture.category == "parameters":
        // Same as execution, plus:
        assert instance.properties == fixture.expected.final_properties
```

## Adding New Tests

1. Create a new `.json` file in the appropriate subdirectory
2. Follow the naming convention: `{category}-{subcategory}-{number}-{description}.json`
3. Validate your fixture against `test-fixture-schema.json`
4. Validate any `expected.valid: true` workflow against `../workflow-schema.json`
5. Include meaningful tags for test filtering
