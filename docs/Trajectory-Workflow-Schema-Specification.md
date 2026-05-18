<!-- Copyright (c) 2026 Saturnis.io. All rights reserved. -->
<!-- Licensed under the GNU AGPL v3. See LICENSE.md for details. -->

# DRAFT Distributed Workflow Integration — Schema Specification

**Version:** 4.0
**Date:** 2026-03-20

This document is a complete specification of the DRAFT Distributed Workflow Integration JSON schemas and the `.WFmasterX` package format. It provides all information needed to build a system that can import, validate, report on, or execute workflows defined in these schemas.

---

## Table of Contents

1. [Package Format (.WFmasterX)](#1-package-format-wfmasterx)
2. [Manifest Structure](#2-manifest-structure)
3. [Master Workflow Specification (.WFmaster)](#3-master-workflow-specification-wfmaster)
4. [Base Type: ManagedElement](#4-base-type-managedelement)
5. [Steps](#5-steps)
6. [Step Types](#6-step-types)
7. [Connections](#7-connections)
8. [Form Layout Configuration](#8-form-layout-configuration)
9. [Form Element Types](#9-form-element-types)
10. [Rich Text Content](#10-rich-text-content)
11. [Parameter Specifications](#11-parameter-specifications)
12. [Value Properties](#12-value-properties)
13. [Parameter Default Sources](#13-parameter-default-sources)
14. [Parameter Mapping (Input/Output)](#14-parameter-mapping-inputoutput)
15. [Step-Type Specific Configurations](#15-step-type-specific-configurations)
16. [Resource Specifications](#16-resource-specifications)
17. [Environment Specifications](#17-environment-specifications)
18. [Action Specifications](#18-action-specifications)
19. [Child Workflows](#19-child-workflows)
20. [Runtime State Model](#20-runtime-state-model)
21. [Execution Semantics](#21-execution-semantics)
22. [Image Handling](#22-image-handling)

---

## 1. Package Format (.WFmasterX)

A `.WFmasterX` file is a **ZIP archive** containing a self-contained executable workflow package with all dependencies embedded.

### 1.1 Directory Structure

```
MyWorkflow.WFmasterX (ZIP file)
├── MyWorkflow.WFmaster              # Main workflow specification (JSON)
├── manifest.json                     # Package metadata
├── environments/
│   ├── KitchenEnv.WFenvir           # Environment library (JSON)
│   └── BakeryEnv.WFenvir            # Additional environments
├── actions/
│   ├── HeatOven.WFaction            # Action library (JSON)
│   └── MixIngredients.WFaction      # Additional actions
└── images/
    ├── step1-instructionImage.png    # Step images (imageOid-prefixed naming)
    ├── step2-diagram.png
    └── video-demo.mp4               # Video assets
```

### 1.2 Package Types

| Extension | Type | Description |
|-----------|------|-------------|
| `.WFmasterX` | Runtime Package | Self-contained executable workflow + all dependencies |
| `.WFlibX` | Workflow Library | Collection of multiple workflows for batch download |
| `.WFmaster` | Workflow Specification | Single JSON workflow definition |
| `.WFslibX` | Step Library | Reusable step definitions |
| `.WFenvir` | Environment Library | Environment specification (JSON) |
| `.WFaction` | Action Library | Action specification (JSON) |

### 1.3 Workflow Library Package (.WFlibX)

```
CookingProcedures.WFlibX (ZIP file)
├── manifest.json
├── workflows/
│   ├── Bolognese.WFmaster
│   ├── ChickenParm.WFmaster
│   └── Risotto.WFmaster
├── environments/
│   └── KitchenEnv.WFenvir
├── actions/
│   └── CookingActions.WFaction
└── images/
    └── ...
```

---

## 2. Manifest Structure

Every package contains a `manifest.json` at the root:

```json
{
  "packageVersion": "1.0",
  "packageType": "runtime",
  "workflowName": "Bolognese Recipe",
  "workflowOid": "wf-snowflake-oid",
  "workflowVersion": "1.2.0",
  "schemaVersion": "4.0",
  "createdAt": "2026-02-24T10:00:00Z",
  "createdBy": "DRAFT MD v3.0",
  "files": [
    {
      "path": "Bolognese.WFmaster",
      "type": "workflow",
      "oid": "wf-snowflake-oid"
    },
    {
      "path": "environments/KitchenEnv.WFenvir",
      "type": "environment",
      "oid": "env-snowflake-oid"
    },
    {
      "path": "actions/CookingActions.WFaction",
      "type": "action",
      "oid": "act-snowflake-oid"
    },
    {
      "path": "images/step1-photo.png",
      "type": "image"
    }
  ],
  "environmentLibraries": ["KitchenEnv.WFenvir"],
  "actionLibraries": ["CookingActions.WFaction"]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `packageVersion` | string | yes | Package format version (`"1.0"`) |
| `packageType` | string | yes | `"runtime"` for `.WFmasterX` |
| `workflowName` | string | yes | Human-readable workflow name |
| `workflowOid` | string | yes | Globally unique snowflake OID |
| `workflowVersion` | string | yes | Semantic version (e.g., `"1.2.0"`) |
| `schemaVersion` | string | yes | Schema version (`"4.0"`) |
| `createdAt` | string | yes | ISO 8601 creation timestamp |
| `createdBy` | string | yes | Authoring tool identifier |
| `files` | array | yes | Array of file entries (see below) |
| `environmentLibraries` | string[] | no | Filenames of environment libraries |
| `actionLibraries` | string[] | no | Filenames of action libraries |

**File entry:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | string | yes | Relative path within the ZIP |
| `type` | string | yes | `"workflow"`, `"environment"`, `"action"`, or `"image"` |
| `oid` | string | no | Snowflake OID (for non-image files) |

---

## 3. Master Workflow Specification (.WFmaster)

The root JSON object in a `.WFmaster` file defines a complete workflow:

```typescript
interface MasterWorkflowSpecification extends ManagedElement {
  schemaVersion?: string;               // "4.0"

  // Workflow graph
  steps: MasterWorkflowStep[];
  connections: WorkflowConnection[];

  // Workflow-level parameters
  starting_parameter_specifications?: ParameterSpecification[];
  output_parameter_specifications?: OutputParameterSpecification[];
  value_property_specifications?: PropertySpecification[];

  // Resources
  resource_command_specifications?: ResourceCommandSpecification[];
  resource_property_specifications?: ResourcePropertySpecification[];

  // Embedded dependencies
  environment_specifications?: MasterEnvironmentSpecification[];
  child_workflows?: MasterWorkflowSpecification[];

  // Editor viewport (informational, not used at runtime)
  viewport?: { x: number; y: number; zoom: number };
}
```

---

## 4. Base Type: ManagedElement

All top-level entities (workflows, steps, environments, actions) inherit from `ManagedElement`:

```typescript
interface ManagedElement {
  local_id: string;              // Human-readable identifier (e.g., "Bolognese Recipe")
  oid: string;                   // Snowflake OID — globally unique identifier
  description?: string;          // Optional description
  version: string;               // Semantic version (e.g., "1.0.0")
  last_modified_date: string;    // ISO 8601 timestamp
}
```

> **Note:** `schemaVersion` is NOT part of ManagedElement — it appears only on the root `MasterWorkflowSpecification`.

---

## 5. Steps

Each step in the workflow is a `MasterWorkflowStep`:

```typescript
interface MasterWorkflowStep extends ManagedElement {
  step_type: StepType;
  position?: { x: number; y: number };

  // Parameters
  input_parameter_specifications?: ParameterSpecification[];
  output_parameter_specifications?: OutputParameterSpecification[];
  value_property_specifications?: PropertySpecification[];

  // Resources
  resource_command_specifications?: ResourceCommandSpecification[];

  // WYSIWYG form layout (up to 3 device breakpoints)
  form_layout_config?: FormLayoutExportEntry[];

  // Step-type specific configurations
  yes_no_config?: YesNoConfig;
  script_config?: ScriptConfig;
  select1_config?: Select1Config;

  // Action proxy
  action_visibility?: 'opaque' | 'observable';
  connection_references?: string[];
}
```

---

## 6. Step Types

### 6.1 Complete Step Type Enumeration

```typescript
type StepType =
  | 'START'                  // Workflow start marker
  | 'END'                    // Workflow end marker
  | 'USER_INTERACTION'       // User form entry step
  | 'YES_NO'                 // Binary branching decision
  | 'SELECT 1'              // Multi-branch conditional routing
  | 'PARALLEL'               // Fork point for parallel execution
  | 'WAIT ALL'              // Join: all incoming branches must complete
  | 'WAIT ANY'              // Join: any single incoming branch triggers exit
  | 'ACTION PROXY'          // Environment action invocation
  | 'WORKFLOW PROXY'        // Child workflow execution
  | 'SCRIPT'                // Code execution step
  | 'MATH';                 // Mathematical calculation
```

### 6.2 Auto-Completing Step Types

These steps complete immediately without user interaction. The engine transitions them through STARTING → COMPLETING → COMPLETED automatically:

- `START`
- `END`
- `PARALLEL`
- `WAIT ALL` (when all incoming branches have completed)
- `WAIT ANY` (when any incoming branch has completed)
- `SELECT 1` (after evaluating the routing condition)
- `SCRIPT` (after execution)
- `MATH` (after calculation)

### 6.3 Interactive Step Types

These steps require user input or external events before completing:

- `USER_INTERACTION` — Displays a form; user must submit
- `YES_NO` — Displays a binary choice; user must select
- `ACTION PROXY` — Waits for external action to complete
- `WORKFLOW PROXY` — Waits for child workflow to complete

---

## 7. Connections

Connections define the directed edges between steps in the workflow graph:

```typescript
interface WorkflowConnection {
  from_step_id: string;          // Source step OID
  to_step_id: string;            // Target step OID
  condition?: string;            // Display label for conditional branches
  connection_id?: string;        // Stable ID (matches Select1 option.id)
  source_handle_id?: string;     // Source handle identifier (used by YES_NO)
  waypoints?: Array<{ x: number; y: number }>;  // Visual edge routing points
}
```

### 7.1 Routing Rules by Step Type

| Source Step Type | Routing Behavior |
|---|---|
| Linear steps (START, USER_INTERACTION, etc.) | All outgoing connections fire (unconditional) |
| `YES_NO` | Two outgoing connections: one with `condition: "True"`, one with `condition: "False"` (or custom values from `yes_no_config`) |
| `SELECT 1` | Each option's outgoing connection has `connection_id` matching the option `id`. Only the matched connection fires. If no match, the default option's connection fires. |
| `PARALLEL` | All outgoing connections fire simultaneously (fork) |
| `WAIT ALL` | Single outgoing connection fires when ALL incoming branches complete |
| `WAIT ANY` | Single outgoing connection fires when ANY incoming branch completes |

### 7.2 Cycles

Cycles are explicitly allowed in the workflow graph. A common pattern is a retry loop where a `WAIT ANY` step serves as a re-entry point. The engine clears `firedConnections` on step completion to ensure safe cycle traversal.

---

## 8. Form Layout Configuration

The `form_layout_config` field on `USER_INTERACTION` and `YES_NO` steps defines the visual layout of the step's user interface using absolute-positioned form elements.

### 8.1 Container Structure

```typescript
interface FormLayoutExportEntry {
  deviceType: 'phone' | 'tablet' | 'desktop';
  canvasWidth: number;           // Reference width in logical pixels
  canvasHeight: number;          // Reference height in logical pixels
  elements: FormElement[];       // Array of positioned form elements
}
```

A step's `form_layout_config` is an array of up to 3 entries, one per device breakpoint.

### 8.2 Default Canvas Dimensions

| Device | canvasWidth | canvasHeight |
|--------|------------|-------------|
| phone | 390 | 844 |
| tablet | 768 | 1024 |
| desktop | 1280 | 800 |

### 8.3 Breakpoint Selection

At runtime, the renderer selects the `FormLayoutExportEntry` whose `deviceType` matches the current screen category, then scales from logical pixel canvas dimensions to actual screen dimensions.

### 8.4 Element Base Fields

All form elements share these positioning fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | yes | Element type discriminant (one of 11 types) |
| `x` | number | yes | Horizontal position from left edge (logical pixels) |
| `y` | number | yes | Vertical position from top edge (logical pixels) |
| `width` | number | yes | Element width (logical pixels) |
| `height` | number | yes | Element height (logical pixels) |
| `zIndex` | number | no | Stacking order (default 0) |

---

## 9. Form Element Types

There are 11 form element types. Each is identified by the `type` discriminant field.

### 9.1 `button`

A tappable button that emits a value for edge routing.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"button"` | yes | Discriminant |
| `label` | string | yes | Text displayed on the button |
| `outputValue` | string | yes | Value emitted when tapped (e.g., `"true"`, `"false"`) |
| `deletable` | boolean | no | `false` for required buttons; default `true` |

### 9.2 `textInput`

A single-line text input field with parameter binding.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"textInput"` | yes | Discriminant |
| `label` | string | no | Label displayed above the input |
| `placeholder` | string | no | Static placeholder text |
| `fieldName` | string | yes | JSON key in step output object |
| `required` | boolean | no | Whether input is required (default `false`) |
| `outputParameter` | string | no | Value Property target (`"Property.Entry"` dot notation) |
| `defaultSource` | ParameterDefaultSource | no | Default value source |
| `placeholderSource` | ParameterDefaultSource | no | Runtime placeholder source |
| `inputMode` | TextInputMode | no | Input keyboard/behavior mode (default `"text"`) |
| `listItems` | ListItem[] | no | Static list items for dropdown/combobox |
| `listSource` | ListItemSource | no | Dynamic list source |

**TextInputMode values:**

| Mode | Behavior |
|------|----------|
| `"text"` | Free-form text input (default) |
| `"number"` | Digits, +, -, . only |
| `"phone"` | Digits, +, (), space |
| `"password"` | Masked input |
| `"dropdown"` | Read-only pick list (uses `listItems`) |
| `"combobox"` | Editable pick list (uses `listItems`) |

**ListItem:**
```typescript
interface ListItem {
  label: string;  // Display text
  value: string;  // Stored value
}
```

**ListItemSource:**
```typescript
interface ListItemSource {
  mode: 'static' | 'input';
  value?: string;  // Input parameter name when mode="input"
}
```

### 9.3 `textarea`

A multi-line text input field with parameter binding.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"textarea"` | yes | Discriminant |
| `label` | string | no | Label displayed above the textarea |
| `placeholder` | string | no | Static placeholder text |
| `fieldName` | string | yes | JSON key in step output object |
| `required` | boolean | no | Whether input is required (default `false`) |
| `rows` | number | no | Visible text rows (default 4) |
| `outputParameter` | string | no | Value Property target (dot notation) |
| `defaultSource` | ParameterDefaultSource | no | Default value source |
| `placeholderSource` | ParameterDefaultSource | no | Runtime placeholder source |

### 9.4 `header`

A large title/heading element.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"header"` | yes | Discriminant |
| `content` | RichTextContent | yes | `{ content, plainText }` — see [Rich Text Content](#10-rich-text-content) |
| `fontSize` | number | no | Font size in logical pixels (default 24) |
| `fontWeight` | `"normal"` \| `"bold"` | no | Default `"bold"` |
| `color` | string | no | CSS color string |
| `align` | `"left"` \| `"center"` \| `"right"` | no | Default `"left"` |

### 9.5 `text`

A static text label. Same structure as `header` but with different defaults.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"text"` | yes | Discriminant |
| `content` | RichTextContent | yes | `{ content, plainText }` — see [Rich Text Content](#10-rich-text-content) |
| `fontSize` | number | no | Font size in logical pixels (default 16) |
| `fontWeight` | `"normal"` \| `"bold"` | no | Default `"normal"` |
| `color` | string | no | CSS color string |
| `align` | `"left"` \| `"center"` \| `"right"` | no | Default `"left"` |

### 9.6 `image`

An image element.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"image"` | yes | Discriminant |
| `src` | string | yes | Filename (from `images/` ZIP folder) or `https://` URL |
| `imageOid` | string | no | Stable OID used as namespace prefix in ZIP exports |
| `objectFit` | `"contain"` \| `"cover"` \| `"fill"` | no | Scaling behavior (default `"contain"`) |

> **Image filename convention:** In the ZIP export, filenames use `{imageOid}-{filename}` namespacing. See [Image Handling](#22-image-handling).

### 9.7 `video`

An embedded video player.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"video"` | yes | Discriminant |
| `src` | string | yes | HTTPS URL to video source |
| `posterUrl` | string | no | HTTPS URL to thumbnail image |

### 9.8 `checkbox`

A multi-select checkbox group.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"checkbox"` | yes | Discriminant |
| `label` | string | no | Group label above checkboxes |
| `fieldName` | string | yes | JSON key for step output (stores `string[]`) |
| `options` | OptionEntry[] | yes | Checkbox option labels |
| `fontSize` | number | no | Option label font size (default 13) |
| `required` | boolean | no | Must select at least one (default `false`) |
| `outputParameter` | string | no | Value Property target (dot notation) |

**OptionEntry** may be either a plain string or an object `{ label: string, value: string }`.

### 9.9 `radio`

A single-select radio button group.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"radio"` | yes | Discriminant |
| `label` | string | no | Group label above radio buttons |
| `fieldName` | string | yes | JSON key for step output (stores `string`) |
| `options` | OptionEntry[] | yes | Radio option labels |
| `fontSize` | number | no | Option label font size (default 13) |
| `required` | boolean | no | Must select one (default `false`) |
| `outputParameter` | string | no | Value Property target (dot notation) |

### 9.10 `divider`

A horizontal line separator.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"divider"` | yes | Discriminant |
| `thickness` | number | no | Line thickness in logical pixels (default 1) |
| `color` | string | no | CSS color string (default `"#e2e8f0"`) |

### 9.11 `timer`

A countdown/countup timer with parameter binding.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"timer"` | yes | Discriminant |
| `label` | string | yes | Label displayed above the timer |
| `fieldName` | string | yes | JSON key for step output (stores elapsed seconds as integer string) |
| `durationSeconds` | number | yes | Timer duration in whole seconds (min 1, default 300) |
| `direction` | `"countdown"` \| `"countup"` | yes | Timer counting direction |
| `blockDone` | boolean | no | Disable Done button until timer expires or is stopped (default `false`) |
| `outputParameter` | string | no | Value Property target (dot notation) |
| `defaultSource` | ParameterDefaultSource | no | Default value for timer duration |

**Timer behavior:**
- Starts automatically when the step enters EXECUTING state
- Display format: `HH:MM:SS` (always zero-padded, always shows hours)
- User controls: Pause/Resume, Restart, Stop
- Captured value: total elapsed seconds as integer
- `blockDone: true` disables the Done button until the timer expires naturally or the user presses Stop
- If multiple timers have `blockDone: true`, Done is disabled until ALL such timers are expired or stopped

### 9.12 Parameter Binding Summary

| Element Type | `outputParameter` | `defaultSource` | `placeholderSource` | Output Shape |
|---|---|---|---|---|
| `textInput` | yes | yes | yes | `string` |
| `textarea` | yes | yes | yes | `string` |
| `timer` | yes | yes | no | `string` (integer seconds) |
| `checkbox` | yes | no | no | `string[]` (selected values) |
| `radio` | yes | no | no | `string` (selected value) |
| `button` | no | no | no | emits `outputValue` for routing |
| `text` | no | no | no | display only |
| `header` | no | no | no | display only |
| `image` | no | no | no | display only |
| `video` | no | no | no | display only |
| `divider` | no | no | no | display only |

---

## 10. Rich Text Content

Text and header elements use a `RichTextContent` wrapper for their content:

```typescript
interface RichTextContent {
  content: string;     // HTML string with formatting and parameter chips
  plainText: string;   // Stripped plain-text fallback
}
```

### 10.1 Supported HTML Tags

| HTML | Semantics |
|------|-----------|
| `<p>` | Paragraph block (all text is wrapped in `<p>` tags) |
| `<strong>` | Bold text |
| `<em>` | Italic text |
| `<u>` | Underline text |
| `<span style="font-family: ...">` | Custom font family |
| `<span style="font-size: ...pt">` | Custom font size (in points) |
| `<span style="color: ...">` | Custom text color |
| `<span data-param-chip="name.key"></span>` | Parameter placeholder (empty span) |

Multiple inline styles and parameter chips may be nested. The runtime must apply all applicable styles from the nesting context when rendering resolved parameter values.

### 10.2 Parameter Chips

Parameter references appear as empty `<span>` elements with a `data-param-chip` attribute:

```html
<span data-param-chip="patient.name"></span>
```

**Replacement algorithm:**
1. Parse the HTML content
2. Find all `span[data-param-chip]` elements
3. Resolve the `data-param-chip` value from the Value Property store
4. Replace the empty span with the resolved value (preserving surrounding styles)
5. If unresolved, display `<name.key>` as fallback

### 10.3 Plain Text Fallback

The `plainText` field uses `<name.key>` angle-bracket syntax for parameter placeholders:

```
Patient <patient.name>, please confirm your blood pressure reading of <patient.bloodPressure>.
```

Use `plainText` only when HTML rendering is unavailable. Replace `<name.key>` patterns using the regex `<([a-zA-Z][a-zA-Z0-9_]*\.[a-zA-Z][a-zA-Z0-9_]*)>`.

### 10.4 Style Priority

Inline HTML styles within `content` override container-level element styles:

- Container `fontSize` / `fontWeight` / `color` / `align` apply as defaults
- `<span style="...">` overrides for the spanned text
- `<strong>` overrides `fontWeight` to bold
- Container `align` applies to the entire element (not overridable by inline HTML)

---

## 11. Parameter Specifications

### 11.1 Input Parameters (ParameterSpecification)

```typescript
interface ParameterSpecification {
  id: string;                    // Parameter identifier
  oid?: string;                  // Optional snowflake OID
  description?: string;          // Optional description
  default_value: string;         // Default value (literal or property reference)
  value_type?: 'literal' | 'property';  // How to interpret default_value
  json_schema?: string;          // Optional JSON schema for validation
  entries?: PropertyEntrySpecification[];  // Structured data shape
}
```

- `value_type: "literal"` — `default_value` is used directly
- `value_type: "property"` — `default_value` is a `Property.Entry` reference resolved from the Value Property store

### 11.2 Output Parameters (OutputParameterSpecification)

```typescript
interface OutputParameterSpecification {
  id: string;                    // Parameter identifier
  oid?: string;                  // Optional snowflake OID
  description?: string;          // Optional description
  target?: string;               // Value Property target: "Property.Entry" dot notation
  entries?: PropertyEntrySpecification[];
}
```

> **Important:** The `target` field uses dot notation as a single string (e.g., `"UserResponse.Value"`). Split on `.` to extract the property name and entry name.

---

## 12. Value Properties

Value Properties are the workflow's key-value data store, organized as named property groups with key-value entries:

```typescript
interface PropertySpecification {
  name: string;                  // Property group name (e.g., "Patient")
  oid?: string;                  // Optional snowflake OID
  entries: PropertyEntrySpecification[];
}

interface PropertyEntrySpecification {
  name: string;                  // Entry key (e.g., "Name", "BloodPressure")
  value: string;                 // Entry value
}
```

### 12.1 Dot Notation

Value Properties are referenced throughout the schema using `Name.Key` dot notation:

- `"Patient.Name"` → property group `"Patient"`, entry `"Name"`
- `"UserResponse.Value"` → property group `"UserResponse"`, entry `"Value"`

### 12.2 Scope Hierarchy

Value Properties can be defined at multiple levels. Resolution walks up the scope chain:

1. Step-level value properties
2. Workflow-level value properties
3. Parent workflow chain (for child workflows)
4. Environment-level value properties

---

## 13. Parameter Default Sources

Form elements (`textInput`, `textarea`, `timer`) use `ParameterDefaultSource` to specify where default values come from at runtime:

```typescript
type ParameterDefaultSource =
  | { mode: 'static'; value: string }     // Fixed literal string
  | { mode: 'property'; value: string }   // Value Property reference (dot notation)
  | { mode: 'input'; value: string }      // Input parameter reference
```

| Mode | Behavior |
|------|----------|
| `"static"` | Use `value` directly as the default text |
| `"property"` | Look up `value` as a `Property.Entry` path in the Value Property store |
| `"input"` | Resolve from the step's input parameters |

### 13.1 Resolution Timing

Default resolution occurs **once**, immediately before the form is presented to the user (when the step enters EXECUTING state). After the user begins editing, the default no longer applies.

---

## 14. Parameter Mapping (Input/Output)

### 14.1 Two Output Mechanisms

There are two distinct output parameter mechanisms that operate independently:

| Mechanism | Location | Purpose |
|-----------|----------|---------|
| Form element `outputParameter` | `form_layout_config.elements[].outputParameter` | Captures a specific field's value directly to the Value Property store |
| Step-level `output_parameter_specifications` | `steps[].output_parameter_specifications[]` | Engine-level parameter mapping |

Both write to the same underlying Value Property store using `Name.Key` dot notation. A field with an `outputParameter` binding captures its value independently of any step-level parameter configuration.

### 14.2 Output Capture Algorithm

When the user submits a `USER_INTERACTION` step:

1. For each form element with an `outputParameter` binding
2. Read the element's current value
3. Write to the Value Property store at the specified `Name.Key` path

### 14.3 Input Resolution Algorithm

When a `USER_INTERACTION` step enters EXECUTING state:

1. For each form element with a `defaultSource` binding
2. Resolve the value based on `mode` (static, property, or input)
3. Pre-fill the field with the resolved value

---

## 15. Step-Type Specific Configurations

### 15.1 YES_NO Configuration

Present on `YES_NO` steps:

```typescript
interface YesNoConfig {
  yes_label?: string;            // Button text (default: "Yes")
  no_label?: string;             // Button text (default: "No")
  yes_value?: string;            // Output value for Yes (default: "true")
  no_value?: string;             // Output value for No (default: "false")
  default_selection?: 'yes' | 'no' | 'none';  // Pre-selected button
}
```

**Connection routing:** The selected value is matched against the `condition` field on outgoing connections. `"True"` routes to the Yes branch, `"False"` routes to the No branch (or custom values if configured).

### 15.2 SELECT 1 Configuration

Present on `SELECT 1` steps:

```typescript
interface Select1Config {
  input_name?: string;           // Property name to evaluate
  input_value_type?: 'literal' | 'property';  // How to resolve the input
  options?: Select1Option[];
}

interface Select1Option {
  id: string;                    // Stable ID — matches WorkflowConnection.connection_id
  label: string;                 // Display label
  operator: string;              // Comparison operator
  value: string;                 // Comparison value
  value_type: 'literal' | 'property';  // How to resolve comparison value
  is_default: boolean;           // True = fallback when no other option matches
}
```

**Comparison operators:** `==`, `!=`, `<`, `>`, `<=`, `>=`, `Contains`, `Not Contains`

**Routing algorithm:**
1. Resolve `input_name` to get the current value
2. Evaluate each option's comparison (`value operator resolvedInput`)
3. Fire the connection whose `connection_id` matches the first matched option's `id`
4. If no match, fire the connection for the option with `is_default: true`

### 15.3 SCRIPT Configuration

Present on `SCRIPT` steps:

```typescript
interface ScriptConfig {
  language?: string;             // Script language (e.g., "javascript", "python")
  source?: string;               // Source code to execute
}
```

---

## 16. Resource Specifications

### 16.1 Resource Property Definitions

Define resource pools available in a workflow or environment:

```typescript
interface ResourcePropertySpecification {
  name: string;
  resource_type:
    | 'binary exclusive use'                    // One owner at a time
    | 'binary shared use with pool limits'      // Multiple owners with limits
    | 'countable use with pool limits'          // Quantity-based with limits
    | 'named pool'                              // Named resource instances
    | 'sync';                                   // Synchronization primitive
  use_limit?: number;            // Max concurrent users (for pool types)
  description?: string;
  names?: string[];              // Named instances (for 'named pool' type only)
}
```

### 16.2 Resource Commands

Commands issued by steps to acquire, release, or synchronize resources:

```typescript
interface ResourceCommandSpecification {
  oid?: string;
  command_type:
    | 'Acquire'                  // Acquire exclusive or shared resource
    | 'Release'                  // Release acquired resource
    | 'Acquire Pool Amount'      // Acquire N units from countable pool
    | 'Release Pool Amount'      // Release N units to countable pool
    | 'Send'                     // Send value (sync primitive)
    | 'Receive'                  // Receive value (sync primitive)
    | 'Synchronize';             // Send and receive (sync primitive)
  resource_name: string;         // Target resource name
  amount?: number;               // For countable/pool operations
  target?: string;               // "Property.Key" to store handle/value
  source?: string;               // "Property.Key" to send from (sync)
}
```

### 16.3 Resource Lifecycle

- Resources are **acquired** when a step starts (enters STARTING/WAITING)
- If a resource is unavailable, the step enters `WAITING` state
- Resources are **released** when the step completes (enters COMPLETING)
- For `Acquire`: step blocks until the resource is available
- For `binary exclusive use`: only one step can hold the resource at a time

---

## 17. Environment Specifications

Environments define execution contexts with associated actions, properties, and resources:

```typescript
interface MasterEnvironmentSpecification extends ManagedElement {
  library_name?: string;
  included_actions: IncludedAction[];
  value_property_specifications?: PropertySpecification[];
  action_property_specifications?: PropertySpecification[];
  resource_property_specifications?: ResourcePropertySpecification[];
}

interface IncludedAction {
  action_name: string;
  action_library: string;
  action_oid?: string;
  action_version?: string;
  action_last_modified_date?: string;
  input_parameter_specifications?: ParameterSpecification[];
  output_parameter_specifications?: OutputParameterSpecification[];
  property_specifications?: PropertySpecification[];
}
```

### 17.1 Environment Library

Environment specifications are grouped into libraries:

```typescript
interface MasterEnvironmentLibrary extends ManagedElement {
  environment_specifications: MasterEnvironmentSpecification[];
  child_libraries?: MasterEnvironmentLibrary[];
}
```

---

## 18. Action Specifications

Actions define external operations that can be invoked by `ACTION PROXY` steps:

```typescript
interface MasterActionSpecification extends ManagedElement {
  input_parameter_specifications?: ParameterSpecification[];
  output_parameter_specifications?: OutputParameterSpecification[];
  property_specifications?: PropertySpecification[];
  action_visibility?: 'opaque' | 'observable';
}
```

- **Opaque** actions: internal state is not visible; may not respond to control commands
- **Observable** actions: internal state is visible; respond to HOLD, PAUSE, RESUME, ABORT, STOP

### 18.1 Action Library

```typescript
interface MasterActionLibrary extends ManagedElement {
  action_specifications: MasterActionSpecification[];
  child_libraries?: MasterActionLibrary[];
}
```

---

## 19. Child Workflows

Workflows can contain embedded child workflows, invoked via `WORKFLOW PROXY` steps:

```typescript
child_workflows: MasterWorkflowSpecification[]
```

Each child workflow has the same complete structure as the root workflow (steps, connections, parameters, resources, etc.). Child workflows can be nested recursively.

---

## 20. Runtime State Model

### 20.1 Workflow States

```typescript
type WorkflowState =
  | 'IDLE'        // All steps are IDLE — workflow not started
  | 'RUNNING'     // At least one step is in an active state
  | 'COMPLETED'   // An END step has reached COMPLETED
  | 'ABORTED'     // User aborted — all active steps are ABORTED
  | 'STOPPED'     // User stopped — all active steps are STOPPED/COMPLETED
  | 'ERRORED';    // An error occurred during execution
```

### 20.2 Step States

```typescript
type StepState =
  | 'IDLE'           // Initial state — waiting for prerequisites
  | 'STARTING'       // Transitioning into execution
  | 'EXECUTING'      // Active — waiting for user input or processing
  | 'WAITING'        // Blocked on resource acquisition or sync
  | 'PAUSED'         // User paused execution
  | 'HELD'           // Held for external reason
  | 'POSTED'         // Action posted to external environment
  | 'RECEIVED'       // Response received from external environment
  | 'IN_PROGRESS'    // Internal processing underway
  | 'COMPLETING'     // Transitioning to completion
  | 'COMPLETED'      // Finished (terminal state)
  | 'ERRORED'        // Error occurred (terminal state)
  | 'ABORTED';       // User aborted (terminal state)
```

### 20.3 Active Step States

Steps visible in the UI (not auto-completing, not finished):

`EXECUTING`, `WAITING`, `PAUSED`, `HELD`, `POSTED`, `RECEIVED`, `IN_PROGRESS`, `ABORTED`

### 20.4 State Transition Diagram

```
IDLE
 ├──[start]──► STARTING
 │              ├──[resources needed]──► WAITING
 │              │                         ├──[resources acquired]──► EXECUTING
 │              │                         ├──[pause]──► PAUSED ──[resume]──► WAITING
 │              │                         └──[abort]──► ABORTED
 │              ├──[auto-complete type]──► COMPLETING ──► COMPLETED
 │              └──[user interaction]──► EXECUTING
 │                                        ├──[user submits]──► COMPLETING ──► COMPLETED
 │                                        ├──[pause]──► PAUSED ──[resume]──► EXECUTING
 │                                        ├──[abort]──► ABORTED
 │                                        └──[error]──► ERRORED
 └──[abort]──► ABORTED
```

---

## 21. Execution Semantics

### 21.1 Starting a Workflow

1. Create a Runtime Workflow instance by copying the Master Workflow Specification
2. Generate new OIDs for the runtime instance and all step instances
3. Initialize Value Properties from all `value_property_specifications`
4. Resolve `starting_parameter_specifications` and apply defaults
5. Find all `START` steps and transition them to STARTING
6. START steps auto-complete, firing their outgoing connections

### 21.2 Step Execution Flow

1. **Step activation:** When an incoming connection fires, transition step from IDLE → STARTING
2. **Resource acquisition:** Execute `resource_command_specifications` (Acquire commands). If resources unavailable, transition to WAITING
3. **Input resolution:** Resolve `input_parameter_specifications` from Value Property store
4. **Execution:**
   - Auto-complete types: immediately transition to COMPLETING
   - `USER_INTERACTION`: render form, wait for user submission
   - `YES_NO`: render choice, wait for user selection
   - `ACTION PROXY`: post to external action, wait for completion
5. **Completion:** When step completes:
   - Capture `output_parameter_specifications` and form `outputParameter` bindings
   - Execute resource release commands
   - Transition to COMPLETED
   - Fire outgoing connections based on routing rules

### 21.3 Parallel Execution

- `PARALLEL` step: fires ALL outgoing connections simultaneously, creating parallel branches
- `WAIT ALL` step: collects incoming connections; completes when ALL incoming branches have completed
- `WAIT ANY` step: completes when ANY single incoming branch completes; remaining branches continue but their completion does not re-trigger the WAIT ANY

### 21.4 Conditional Routing

- `YES_NO`: routes based on user selection (True/False branch)
- `SELECT 1`: evaluates input value against option conditions, routes to matching branch (or default)
- `button` elements in forms: their `outputValue` can be used for routing via connection conditions

### 21.5 Persistence

Workflow state is recoverable after app restart. The engine resumes from the last persisted state for all active workflows. Running instances use their version of the workflow specification — they are not affected by master workflow updates (ISA-88 master recipe/control recipe model).

### 21.6 Package Version Upgrade

When importing a package whose OID already exists locally:
1. Compare versions (semver)
2. If new > existing: replace stored specification and assets
3. If same: skip (already downloaded)
4. If lower: warn user, optionally replace
5. Active runtime workflow instances using the old version continue unchanged

---

## 22. Image Handling

### 22.1 Filename Convention

Images in the ZIP use namespaced filenames to prevent collisions:

```
In ZIP:     {imageOid}-{filename}.png    (e.g., "img-001-garlic-photo.png")
In JSON:    {filename}.png               (e.g., "garlic-photo.png")
```

The `imageOid` is a stable OID assigned to the image element when it is created and never changed, ensuring references remain valid across exports and imports.

### 22.2 Resolution at Runtime

1. Look up image by matching `src` attribute from the form element
2. If not found, try with `{imageOid}-{src}` prefix
3. Images may also be `https://` URLs — load directly

### 22.3 Supported MIME Types

| Extension | MIME Type |
|-----------|----------|
| `.png` | `image/png` |
| `.jpg`, `.jpeg` | `image/jpeg` |
| `.gif` | `image/gif` |
| `.webp` | `image/webp` |
| `.svg` | `image/svg+xml` |
| `.bmp` | `image/bmp` |
| `.ico` | `image/x-icon` |
| `.mp4` | `video/mp4` |
| `.webm` | `video/webm` |

---

## Appendix A: Complete Workflow Example

```json
{
  "schemaVersion": "4.0",
  "local_id": "Bolognese Recipe",
  "oid": "wf-001-snowflake",
  "version": "1.2.0",
  "last_modified_date": "2026-02-24T10:00:00Z",
  "description": "Classic Bolognese sauce recipe",

  "steps": [
    {
      "local_id": "Start",
      "oid": "step-001",
      "version": "1.0.0",
      "last_modified_date": "2026-02-24T10:00:00Z",
      "step_type": "START",
      "position": { "x": 100, "y": 50 }
    },
    {
      "local_id": "Add Garlic",
      "oid": "step-002",
      "version": "1.0.0",
      "last_modified_date": "2026-02-24T10:00:00Z",
      "step_type": "USER_INTERACTION",
      "position": { "x": 100, "y": 200 },
      "input_parameter_specifications": [
        {
          "id": "suggested_cloves",
          "default_value": "4",
          "value_type": "literal"
        }
      ],
      "output_parameter_specifications": [
        {
          "id": "actual_cloves",
          "target": "GarlicResponse.Value"
        }
      ],
      "form_layout_config": [
        {
          "deviceType": "phone",
          "canvasWidth": 390,
          "canvasHeight": 844,
          "elements": [
            {
              "type": "header",
              "content": { "content": "<p>Add Garlic</p>", "plainText": "Add Garlic" },
              "x": 20, "y": 20, "width": 350, "height": 40,
              "fontSize": 24, "fontWeight": "bold", "align": "center"
            },
            {
              "type": "image",
              "src": "garlic-photo.png",
              "objectFit": "contain",
              "x": 50, "y": 80, "width": 290, "height": 200
            },
            {
              "type": "text",
              "content": {
                "content": "<p>Mince the garlic cloves finely</p>",
                "plainText": "Mince the garlic cloves finely"
              },
              "x": 20, "y": 300, "width": 350, "height": 40,
              "fontSize": 16
            },
            {
              "type": "textInput",
              "label": "How many cloves?",
              "placeholder": "Enter number of cloves",
              "fieldName": "cloveCount",
              "required": true,
              "outputParameter": "GarlicResponse.Value",
              "defaultSource": { "mode": "static", "value": "4" },
              "x": 20, "y": 360, "width": 350, "height": 70
            }
          ]
        }
      ],
      "value_property_specifications": [
        {
          "name": "GarlicResponse",
          "entries": [
            { "name": "Value", "value": "" },
            { "name": "Description", "value": "Number of garlic cloves used" }
          ]
        }
      ]
    },
    {
      "local_id": "End",
      "oid": "step-003",
      "version": "1.0.0",
      "last_modified_date": "2026-02-24T10:00:00Z",
      "step_type": "END",
      "position": { "x": 100, "y": 400 }
    }
  ],

  "connections": [
    {
      "from_step_id": "step-001",
      "to_step_id": "step-002",
      "connection_id": "conn-001"
    },
    {
      "from_step_id": "step-002",
      "to_step_id": "step-003",
      "connection_id": "conn-002"
    }
  ],

  "value_property_specifications": [
    {
      "name": "GarlicResponse",
      "entries": [
        { "name": "Value", "value": "" },
        { "name": "Description", "value": "Number of garlic cloves used" }
      ]
    }
  ],

  "resource_property_specifications": [
    {
      "name": "CuttingBoard",
      "resource_type": "binary exclusive use"
    }
  ]
}
```

---

## Appendix B: Platform Rendering Guide

The `form_layout_config` is a declarative UI specification. Each platform implements a single form renderer component:

| JSON Element | Android (Compose) | iOS (SwiftUI) | Web (HTML) |
|---|---|---|---|
| `text` | `Text()` | `Text` | `<p>` |
| `header` | `Text()` bold | `Text` bold | `<h1>` |
| `button` | `Button()` | `Button` | `<button>` |
| `textInput` | `TextField()` | `TextField` | `<input>` |
| `textarea` | `TextField()` multiline | `TextEditor` | `<textarea>` |
| `checkbox` | `Checkbox()` group | `Toggle` group | `<input type="checkbox">` |
| `radio` | `RadioButton()` group | `Picker` | `<input type="radio">` |
| `image` | `AsyncImage()` | `AsyncImage` | `<img>` |
| `video` | `ExoPlayer` | `AVPlayer` | `<video>` |
| `divider` | `Divider()` | `Divider` | `<hr>` |
| `timer` | Custom composable | Custom view | Custom component |

**Rendering algorithm:**
1. Select the `FormLayoutExportEntry` matching the device breakpoint (phone/tablet/desktop)
2. Scale the logical pixel canvas to actual screen dimensions
3. For each element: switch on `type`, emit a native widget at `(x, y)` with `(width, height)`
4. Apply `zIndex` for element overlap ordering
