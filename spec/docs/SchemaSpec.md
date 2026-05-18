# Trajectory Mobile — v4.0 JSON Schema Reference

## Overview

This document is the complete reference for the JSON format TrajectoryMobile must parse when loading `.WFmasterX` packages exported by Trajectory MD. All types correspond to the Trajectory MD export types defined in `src/lib/export/export-types.ts`.

---

## 1. Top-Level Document (`.WFmaster`)

The root JSON object in a `.WFmaster` file:

```typescript
interface MasterWorkflowSpecification extends ManagedElement {
  schemaVersion?: '4.0';

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
  child_workflows?: MasterWorkflowSpecification[];  // For workflow proxy steps

  // Editor viewport (informational)
  viewport?: { x: number; y: number; zoom: number };
}
```

---

## 2. ManagedElement (Base Type)

All top-level entities (workflows, steps, environments, actions) inherit from:

```typescript
interface ManagedElement {
  local_id: string;              // Human-readable identifier
  oid: string;                   // Snowflake OID — globally unique
  description?: string;          // Optional description
  version: string;               // Semantic version (e.g., "1.0.0")
  last_modified_date: string;    // ISO 8601 timestamp
}
```

> **Note:** `schemaVersion` is NOT part of ManagedElement — it appears only on the root `MasterWorkflowSpecification`.

---

## 3. Step Object (`MasterWorkflowStep`)

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

  // UI content (legacy flat format — parallel to form_layout_config)
  ui_parameter_specifications?: UIParameterSpecification[];

  // WYSIWYG form layout (3 device breakpoints)
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

### 3.1 StepType Enum

```typescript
type StepType =
  | 'START'
  | 'END'
  | 'ACTION PROXY'
  | 'WAIT ACTION PROXY'
  | 'NOWAIT ACTION PROXY'
  | 'WORKFLOW PROXY'
  | 'SELECT 1'
  | 'WAIT ANY'
  | 'PARALLEL'
  | 'WAIT ALL'
  | 'MATH'
  | 'SCRIPT'
  | 'YES_NO'
  | 'USER_INTERACTION';
```

### 3.2 Node Type to Step Type Mapping

| Internal Node Type | Export Step Type |
|---|---|
| `start` | `START` |
| `end` | `END` |
| `actionProxyWait` | `ACTION PROXY` |
| `yesNoStep` | `YES_NO` |
| `userInteractionStep` | `USER_INTERACTION` |
| `scriptStep` | `SCRIPT` |
| `workflowProxy` | `WORKFLOW PROXY` |
| `select1` | `SELECT 1` |
| `waitAny` | `WAIT ANY` |
| `parallel` | `PARALLEL` |
| `waitAll` | `WAIT ALL` |

---

## 4. Connection Object (`WorkflowConnection`)

```typescript
interface WorkflowConnection {
  from_step_id: string;          // Source step OID
  to_step_id: string;            // Target step OID
  condition?: string;            // Display label for conditional branches
  connection_id?: string;        // Stable ID (matches Select1 option.id)
  source_handle_id?: string;     // Source handle identifier
  waypoints?: Array<{ x: number; y: number }>;  // Custom routing offsets
}
```

---

## 5. Parameter Specifications

### 5.1 ParameterSpecification (Input Parameters)

```typescript
interface ParameterSpecification {
  id: string;                    // Parameter identifier
  oid?: string;                  // Optional snowflake OID
  description?: string;          // Optional description
  default_value: string;         // Default value (or property reference)
  value_type?: 'literal' | 'property';  // How to interpret default_value
  json_schema?: string;          // Optional JSON schema for validation
  entries?: PropertyEntrySpecification[];  // Structured data shape
}
```

### 5.2 OutputParameterSpecification

```typescript
interface OutputParameterSpecification {
  id: string;                    // Parameter identifier
  oid?: string;                  // Optional snowflake OID
  description?: string;          // Optional description
  target?: string;               // Value Property target using dot notation: "Property.Entry"
  entries?: PropertyEntrySpecification[];  // Structured data shape
}
```

> **IMPORTANT:** The `target` field uses **dot notation** (`"PropertyName.EntryName"`) as a single string. There are NOT separate `target_property_name` and `target_entry_name` fields. The mobile app must split on `.` to extract the property name and entry name.

### 5.3 PropertySpecification (Value Properties)

```typescript
interface PropertySpecification {
  name: string;                  // Property name (e.g., "UserResponse")
  oid?: string;                  // Optional snowflake OID
  entries: PropertyEntrySpecification[];
}

interface PropertyEntrySpecification {
  name: string;                  // Entry key (e.g., "Value", "Description")
  value: string;                 // Entry value
}
```

---

## 6. ParameterDefaultSource

Used by form elements (`textInput`, `textarea`, `timer`) to specify where default values and placeholders come from at runtime.

```typescript
type ParameterDefaultSource =
  | { mode: 'static'; value: string }    // Fixed literal string
  | { mode: 'property'; value: string }  // Value Property reference (Property.Entry dot notation)
```

**Resolution at runtime:**
- `mode: 'static'` — use `value` directly as the default/placeholder text
- `mode: 'property'` — look up the Value Property named `value` (dot notation: `"PropertyName.EntryName"`) from the workflow's value property hierarchy and use the entry's current value

**Legacy migration:** Older exports may contain `mode: 'parameter'` — this must be migrated to `mode: 'property'` on import (see Section 12).

---

## 7. Form Layout Config

### 7.1 Container Structure

```typescript
interface FormLayoutExportEntry {
  deviceType: 'phone' | 'tablet' | 'desktop';
  canvasWidth: number;           // Reference width (phone=390, tablet=768, desktop=1280)
  canvasHeight: number;          // Reference height (phone=844, tablet=1024, desktop=800)
  elements: FormElementExport[]; // Array of form elements (IDs stripped on export)
}
```

A step's `form_layout_config` is an array of up to 3 `FormLayoutExportEntry` objects, one per device breakpoint.

### 7.2 Form Element Base Fields

All form elements share these positioning fields (note: element `id` is **stripped** during export and **regenerated** during import):

| Field | Type | Description |
|-------|------|-------------|
| `type` | `string` | Discriminant tag — one of the 11 types below |
| `x` | `number` | Horizontal position in logical pixels from left edge |
| `y` | `number` | Vertical position in logical pixels from top edge |
| `width` | `number` | Element width in logical pixels |
| `height` | `number` | Element height in logical pixels |
| `zIndex` | `number?` | Stacking order (default 0) |

### 7.3 All 11 Form Element Types

#### `button`

A tappable button that emits a value for edge routing.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `'button'` | yes | Discriminant |
| `label` | `string` | yes | Text displayed on the button |
| `outputValue` | `string` | yes | Value emitted when tapped (e.g., `"true"`, `"false"`) |
| `deletable` | `boolean?` | no | `false` for Yes/No required buttons; default `true` |

#### `text`

A static text label.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `'text'` | yes | Discriminant |
| `content` | `RichTextContent` | yes | `{ content: string, plainText: string }` — HTML + plain text fallback |
| `fontSize` | `number?` | no | Font size in logical pixels (default 16) |
| `fontWeight` | `'normal' \| 'bold'?` | no | Default `'normal'` |
| `color` | `string?` | no | CSS color string |
| `align` | `'left' \| 'center' \| 'right'?` | no | Default `'left'` |

#### `header`

A large title element. Same fields as `text` but with different defaults.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `'header'` | yes | Discriminant |
| `content` | `RichTextContent` | yes | `{ content: string, plainText: string }` — HTML + plain text fallback |
| `fontSize` | `number?` | no | Font size in logical pixels (default 24) |
| `fontWeight` | `'normal' \| 'bold'?` | no | Default `'bold'` |
| `color` | `string?` | no | CSS color string |
| `align` | `'left' \| 'center' \| 'right'?` | no | Default `'left'` |

#### `textInput`

A single-line text input field with parameter binding.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `'textInput'` | yes | Discriminant |
| `label` | `string?` | no | Label displayed above the input |
| `placeholder` | `string?` | no | Static placeholder text |
| `fieldName` | `string` | yes | JSON key for step output object |
| `required` | `boolean?` | no | Whether input is required (default `false`) |
| `outputParameter` | `string?` | no | Value Property target (dot notation: `"Property.Entry"`) |
| `defaultSource` | `ParameterDefaultSource?` | no | Default value source (`static` or `property`) |
| `placeholderSource` | `ParameterDefaultSource?` | no | Runtime placeholder source |

#### `textarea`

A multi-line text input field with parameter binding.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `'textarea'` | yes | Discriminant |
| `label` | `string?` | no | Label displayed above the textarea |
| `placeholder` | `string?` | no | Static placeholder text |
| `fieldName` | `string` | yes | JSON key for step output object |
| `required` | `boolean?` | no | Whether input is required (default `false`) |
| `rows` | `number?` | no | Visible text rows (default 4) |
| `outputParameter` | `string?` | no | Value Property target (dot notation) |
| `defaultSource` | `ParameterDefaultSource?` | no | Default value source |
| `placeholderSource` | `ParameterDefaultSource?` | no | Runtime placeholder source |

#### `image`

An image element.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `'image'` | yes | Discriminant |
| `src` | `string` | yes | Filename key (from `images/` ZIP folder) or `https://` URL |
| `objectFit` | `'contain' \| 'cover' \| 'fill'?` | no | CSS object-fit semantics (default `'contain'`) |

> **Note:** In the ZIP export, image filenames use `{stepOid}-{filename}` namespacing. On import, the `{stepOid}-` prefix is stripped.

#### `video`

An embedded video player.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `'video'` | yes | Discriminant |
| `src` | `string` | yes | HTTPS URL to video source |
| `posterUrl` | `string?` | no | HTTPS URL to thumbnail image |

#### `checkbox`

A multi-select checkbox group with parameter binding.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `'checkbox'` | yes | Discriminant |
| `label` | `string?` | no | Group label above checkboxes |
| `fieldName` | `string` | yes | JSON key for step output (stores `string[]`) |
| `options` | `string[]` | yes | Checkbox option labels |
| `fontSize` | `number?` | no | Option label font size (default 13) |
| `required` | `boolean?` | no | Must select at least one (default `false`) |
| `outputParameter` | `string?` | no | Value Property target (dot notation) |

#### `radio`

A single-select radio button group with parameter binding.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `'radio'` | yes | Discriminant |
| `label` | `string?` | no | Group label above radio buttons |
| `fieldName` | `string` | yes | JSON key for step output (stores `string`) |
| `options` | `string[]` | yes | Radio option labels |
| `fontSize` | `number?` | no | Option label font size (default 13) |
| `required` | `boolean?` | no | Must select one (default `false`) |
| `outputParameter` | `string?` | no | Value Property target (dot notation) |

#### `divider`

A horizontal line separator.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `'divider'` | yes | Discriminant |
| `thickness` | `number?` | no | Line thickness in logical pixels (default 1) |
| `color` | `string?` | no | CSS color string (default `'#e2e8f0'`) |

#### `timer`

A countdown/countup timer with parameter binding.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `'timer'` | yes | Discriminant |
| `label` | `string` | yes | Label displayed above timer |
| `fieldName` | `string` | yes | JSON key for step output (stores elapsed/remaining time as string) |
| `durationSeconds` | `number` | yes | Timer duration in whole seconds (min 1, default 300) |
| `direction` | `'countdown' \| 'countup'` | yes | Timer counting direction |
| `blockDone` | `boolean?` | no | Disable Done button until timer expires (default `false`) |
| `outputParameter` | `string?` | no | Value Property target (dot notation) |
| `defaultSource` | `ParameterDefaultSource?` | no | Default value for timer duration |

### 7.4 Parameter Binding Summary

| Element Type | `outputParameter` | `defaultSource` | `placeholderSource` | Output Shape |
|---|---|---|---|---|
| `textInput` | yes | yes | yes | `string` |
| `textarea` | yes | yes | yes | `string` |
| `timer` | yes | yes | no | `string` |
| `checkbox` | yes | no | no | `string[]` (selected values) |
| `radio` | yes | no | no | `string` (selected value) |
| `button` | no | no | no | emits `outputValue` for routing |
| `text` | no | no | no | non-interactive |
| `header` | no | no | no | non-interactive |
| `image` | no | no | no | non-interactive |
| `video` | no | no | no | non-interactive |
| `divider` | no | no | no | non-interactive |

### 7.5 RichTextContent

Text and header elements store content as a `RichTextContent` wrapper in export:

```typescript
interface RichTextContent {
  content: string;     // HTML string with formatting and parameter placeholder chips
  plainText: string;   // Stripped plain-text fallback
}
```

**Parameter chips in HTML:** Parameter references appear in the `content` HTML as `<span data-param-chip="PropertyName.EntryName"></span>`.

---

## 8. Step-Type Configurations

### 8.1 YesNoConfig

Present on `YES_NO` steps:

```typescript
interface YesNoConfig {
  yes_label?: string;            // Button label (default: "Yes")
  no_label?: string;             // Button label (default: "No")
  yes_value?: string;            // Output value when Yes selected (default: "true")
  no_value?: string;             // Output value when No selected (default: "false")
  default_selection?: 'yes' | 'no' | 'none';  // Pre-selected button
}
```

### 8.2 ScriptConfig

Present on `SCRIPT` steps:

```typescript
interface ScriptConfig {
  language?: string;             // Currently only 'python'
  source?: string;               // Python source code
}
```

### 8.3 Select1Config

Present on `SELECT 1` steps:

```typescript
interface Select1Config {
  input_name?: string;           // Parameter name to evaluate
  input_value_type?: 'literal' | 'property';  // How to resolve input
  options?: Select1Option[];
}

interface Select1Option {
  id: string;                    // Stable ID — matches WorkflowConnection.connection_id
  label: string;                 // Display label
  operator: string;              // Comparison operator (see below)
  value: string;                 // Comparison value
  value_type: 'literal' | 'property';  // How to resolve comparison value
  is_default: boolean;           // Whether this is the default branch
}
```

**Comparison operators:** `==`, `!=`, `<`, `>`, `<=`, `>=`, `Contains`, `Not Contains`

---

## 9. UI Parameter Specifications (Legacy Format)

A flat-list format for user interaction content, parallel to `form_layout_config`. Present for backward compatibility:

```typescript
interface UIParameterSpecification {
  oid?: string;
  type: string;       // Element type (e.g., 'text', 'image', 'textInput')
  value: string;      // Primary content value
  font_size?: number;
  color?: string;
  lines?: number;     // Number of text lines
  align?: string;     // Text alignment
  value2?: string;    // Secondary value (e.g., image alt text)
}
```

> **Implementation note:** When both `form_layout_config` and `ui_parameter_specifications` are present, `form_layout_config` takes precedence. The `ui_parameter_specifications` field is maintained for older consumers that do not support WYSIWYG layouts.

---

## 10. Resource Specifications

### 10.1 ResourcePropertySpecification

Defines a resource pool available in a workflow or environment:

```typescript
interface ResourcePropertySpecification {
  name: string;
  resource_type:
    | 'binary exclusive use'
    | 'binary shared use with pool limits'
    | 'countable use with pool limits'
    | 'named pool'
    | 'sync';
  use_limit?: number;            // Max concurrent users (for pool types)
  description?: string;
  names?: string[];              // Named instances (for 'named pool' type)
}
```

### 10.2 ResourceCommandSpecification

Commands issued by steps to acquire/release/sync resources:

```typescript
interface ResourceCommandSpecification {
  oid?: string;
  command_type:
    | 'Acquire'
    | 'Release'
    | 'Acquire Pool Amount'
    | 'Release Pool Amount'
    | 'Send'
    | 'Receive'
    | 'Synchronize';
  resource_name: string;         // Target resource name
  amount?: number;               // For countable/pool resources
  target?: string;               // For Send commands
  source?: string;               // For Receive commands
}
```

---

## 11. Environment & Action Specifications

### 11.1 MasterEnvironmentSpecification

```typescript
interface MasterEnvironmentSpecification extends ManagedElement {
  library_name?: string;
  included_actions: IncludedAction[];
  value_property_specifications?: PropertySpecification[];
  action_property_specifications?: PropertySpecification[];
  resource_property_specifications?: ResourcePropertySpecification[];
}
```

### 11.2 IncludedAction

```typescript
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

### 11.3 MasterActionSpecification

```typescript
interface MasterActionSpecification extends ManagedElement {
  input_parameter_specifications?: ParameterSpecification[];
  output_parameter_specifications?: OutputParameterSpecification[];
  property_specifications?: PropertySpecification[];
  action_visibility?: 'opaque' | 'observable';
}
```

---

## 12. Import Rules

When TrajectoryMobile imports a `.WFmasterX` package, these transformations must be applied:

### 12.1 Element ID Regeneration

Form element `id` fields are **stripped** during Trajectory MD export. On import, fresh snowflake OIDs must be generated for each element. Do NOT rely on element IDs being present in the JSON.

### 12.2 RichTextContent Unwrapping

Text and header element `content` fields may be:
- An object `{ content: string, plainText: string }` (Phase 15+ export format)
- A plain string (Phase 23+ format or legacy)

On import, if `content` is an object:
- Use the `content` field (HTML) for rich text rendering
- Use the `plainText` field as a fallback for runtimes without HTML support

### 12.3 Image Src Prefix Stripping

Image elements in the export JSON use `{stepOid}-{filename}` namespacing for their `src` field to avoid collisions across steps. On import, strip the `{stepOid}-` prefix to get the plain filename for local storage lookup.

### 12.4 Legacy Migration: `defaultSource.mode`

Older exports may contain `defaultSource.mode = 'parameter'`. This must be migrated to `mode: 'property'` on import. The `value` field remains unchanged.

```
Before: { mode: 'parameter', value: 'UserResponse.Value' }
After:  { mode: 'property',  value: 'UserResponse.Value' }
```

### 12.5 Schema Version Check

If `schemaVersion` is missing or less than `'4.0'`, the package was exported from an older Trajectory MD version. Apply schema migration (3.0 → 4.0) as described in `PackageFormatSpec.md` Section 5.

### 12.6 Canvas Dimension Defaults

If a device breakpoint entry is missing from `form_layout_config`, use these defaults:

| Device | canvasWidth | canvasHeight |
|--------|------------|-------------|
| phone | 390 | 844 |
| tablet | 768 | 1024 |
| desktop | 1280 | 800 |
