# Editor → Runtime Export Format Specification

**Audience:** Trajectory Editor implementation team
**Purpose:** Define the exact file format the runtime (`Trajectory Desktop` / `Trajectory Mobile`) expects when it opens a `.WFmasterX` package, and the concrete transformation required from the editor's internal React Flow state to that format.
**Status:** Authoritative. The runtime's AJV schema (`spec/workflow-schema.json`) is the machine-checkable source of truth; this document is the human-readable specification.
**Date:** 2026-04-24
**Runtime schema version:** 4.0 (v7.0 package format)

---

## 0. Current problem (why this document exists)

Inspection of `Test_Workflow_library.WFmasterX` and `Test_Loops_and_Scripts.WFmasterX` shows the editor currently writes its raw internal state (a library wrapper around React Flow `nodes` / `edges`) into the `.WFmasterX` file. The runtime cannot read this — it expects a single `MasterWorkflowSpecification` with top-level `steps` / `connections`. The two formats do not overlap on a single field name.

**What the editor is producing today:**

```json
{
  "schemaVersion": "3.0",
  "library":        { "id": "...", "userId": "...", "name": "...", "entityType": "workflow", ... },
  "specifications": [{
    "id": "...", "libraryId": "...", "name": "...", "version": "...", "state": "Draft",
    "dataSchemaVersion": 3, "parentSpecificationId": null, "rootSpecificationId": "...",
    "data": { "nodes": [...], "edges": [...], "viewport": {...},
              "workflowInputs": [...], "workflowOutputs": [...],
              "workflowValues": [...], "workflowResources": [...], "images": [...] },
    "children": []
  }],
  "specEnvs":     [],
  "imageManifest": {}
}
```

**What the runtime expects:**

```json
{
  "schemaVersion": "4.0",
  "local_id": "...", "oid": "...", "version": "...", "state": "Draft",
  "last_modified_date": "2026-04-24T...Z",
  "steps":       [ /* MasterWorkflowStep[] with UPPER_CASE step_type */ ],
  "connections": [ /* from_step_id / to_step_id */ ],
  "children":    [ /* ChildWorkflowExport[] with parentChildSpecId */ ]
}
```

The editor must run a transformation step on save/export that maps its internal library + React Flow shape to this runtime shape. The rest of this document defines that target shape in full, plus the exact mapping.

---

## 1. Package file extensions and ZIP layout

| Extension    | Contents                                       | Runtime accepts?           |
|--------------|------------------------------------------------|----------------------------|
| `.WFmaster`  | Bare JSON (one root `MasterWorkflowSpecification`) | Yes — direct JSON file |
| `.WFmasterX` | ZIP containing one `.WFmaster` plus assets     | Yes — primary runtime package |
| `.WFlibX`    | Library bundle (multiple roots)                | **No.** Not consumed by runtime. Editor-only. |
| `.WFslibX`   | Step-library bundle                            | **No.** Editor-only. |

The editor MUST produce `.WFmasterX` for runtime consumption. If the source document is a library, split each root workflow into its own `.WFmasterX`.

### 1.1 ZIP layout for `.WFmasterX`

```
MyWorkflow.WFmasterX  (ZIP)
├── MyWorkflow.WFmaster            ← JSON: the MasterWorkflowSpecification (§2)
├── manifest.json                  ← OPTIONAL: package metadata (§1.2)
├── environments/                  ← OPTIONAL: one .WFenvir per embedded library
│     └── Kitchen Library.WFenvir  ← JSON: a MasterEnvironmentLibrary document (§6)
├── actions/                       ← OPTIONAL: one .WFaction per action library
│     └── My Actions.WFaction
└── images/                        ← OPTIONAL: media referenced by form elements / UI params
      ├── 7000000123456-photo.jpg  ← {imageOid}-{filename} for form-element images
      └── engine-closeup.jpg       ← bare filename for ui_parameter_specifications images
```

Rules:
- Exactly one file ending in `.WFmaster` at the ZIP root. Other file extensions or nested `.WFmaster` files are ignored by the runtime loader (`engines/web/src/loader.ts`).
- Filenames inside `environments/`, `actions/`, and `images/` are free-form. The runtime resolves them by directory prefix.
- Form element images MUST be keyed by `{imageOid}-{filename}` so the runtime can fall back to the bare filename if the per-device image is missing.

### 1.2 `manifest.json` (optional)

```json
{
  "packageVersion": "1.0",
  "workflowName": "My Workflow",
  "environmentLibraries": ["Kitchen Library"],
  "actionLibraries": ["My Action Library"],
  "createdAt": "2026-04-24T12:00:00.000Z",
  "files": [
    { "path": "My Workflow.WFmaster", "type": "workflow" },
    { "path": "environments/Kitchen Library.WFenvir", "type": "environment" },
    { "path": "actions/My Action Library.WFaction", "type": "action" },
    { "path": "images/7000000123456-photo.jpg", "type": "image" }
  ]
}
```

The runtime does not currently require `manifest.json`. Include it for forward compatibility and human debugging.

---

## 2. Root workflow (`MasterWorkflowSpecification`)

The top level of every `.WFmaster` file. One root per package.

```json
{
  "schemaVersion": "4.0",
  "local_id": "Test Loops and Scripts",
  "oid": "454cf22190644b5f8bd1c68f825cfd0c",
  "description": "Demo workflow with loops and SCRIPT steps.",
  "version": "1.0.0",
  "state": "Draft",
  "last_modified_date": "2026-04-24T12:34:56.789Z",
  "display_style": "flowchart",
  "viewport": { "x": 0, "y": 0, "zoom": 1 },

  "steps":       [ /* §3 */ ],
  "connections": [ /* §4 */ ],

  "starting_parameter_specifications": [ /* §5.1 */ ],
  "output_parameter_specifications":   [ /* §5.2 */ ],
  "value_property_specifications":     [ /* §5.3 */ ],
  "resource_property_specifications":  [ /* §5.4 */ ],
  "resource_command_specifications":   [ /* §5.5 */ ],
  "environment_specifications":        [ /* §6 */ ],

  "children":        [ /* §8 — v7.0 preferred */ ],
  "child_workflows": [ /* §8 — deprecated, omit for new exports */ ]
}
```

### 2.1 Required fields (root)

| Field                 | Type         | Notes |
|-----------------------|--------------|-------|
| `local_id`            | string       | Human-readable name. Non-empty. |
| `oid`                 | string       | Snowflake-style ID as a string (64-bit numeric or UUID without dashes — the runtime does not parse it, just tracks it). |
| `version`             | string       | Semver, e.g. `"1.0.0"`. |
| `last_modified_date`  | string       | ISO 8601 UTC, e.g. `"2026-04-24T12:00:00Z"`. |
| `steps`               | array        | See §3. May be empty only if the workflow has no execution body (rare). |
| `connections`         | array        | See §4. |

### 2.2 Optional fields (root)

| Field                 | Type                           | Notes |
|-----------------------|--------------------------------|-------|
| `schemaVersion`       | `"4.0"` (preferred) or `"3.0"` | Omit = treated as valid. Runtime rejects `"2.0"` and below. |
| `description`         | string                         | |
| `state`               | string                         | Informational only. Runtime does **not** filter on this value. Convention: `Draft` / `InTest` / `InReview` / `Approved` / `Effective` / `Superseded` / `Obsolete`. Free-form accepted. |
| `display_style`       | `"flowchart"` \| `"bpmn"` \| `"isa88"` | Authoring diagram notation; runtime ignores. |
| `viewport`            | `{ x: number, y: number, zoom: number }` | Editor viewport state; runtime stores but ignores. |

### 2.3 Semantic rules (graph-level, all enforced by runtime validator)

1. Exactly one step with `step_type: "START"`.
2. At least one step with `step_type: "END"`.
3. All step `oid` values unique.
4. All `connections[*].from_step_id` and `to_step_id` reference an existing step `oid`.
5. No self-referencing connections (`from_step_id === to_step_id`).
6. Every step reachable from the START step via BFS on `connections`.
7. Every `PARALLEL` step has a matching `WAIT ALL` on every downstream path.
8. Cycles ARE allowed (retry loops via `WAIT ANY`).

---

## 3. Step (`MasterWorkflowStep`)

Every step in `steps[]` inherits `ManagedElement` (requires `local_id`, `oid`, `version`, `last_modified_date`) plus `step_type`.

### 3.1 Required on every step

```json
{
  "local_id": "Check Pressure",
  "oid": "7000000000011",
  "version": "1.0.0",
  "last_modified_date": "2026-04-24T12:00:00Z",
  "step_type": "USER_INTERACTION",
  "position": { "x": 100, "y": 250 }
}
```

`position` is optional but recommended — the editor reads it back to restore layout.

### 3.2 `step_type` enum (EXACT strings, case- and space-sensitive)

| Value                    | Semantics                                    | Auto-completes? |
|--------------------------|----------------------------------------------|-----------------|
| `"START"`                | Entry point. Exactly one per workflow.       | Yes             |
| `"END"`                  | Terminal. At least one.                      | Yes             |
| `"PARALLEL"`             | Fan-out to all successors.                   | Yes             |
| `"WAIT ALL"`             | Fan-in; completes when all predecessors done. | Yes            |
| `"WAIT ANY"`             | Fan-in; completes when any predecessor done. | Yes             |
| `"SELECT 1"`             | Routed choice; emits one successor by condition. See §3.3.4. | No |
| `"YES_NO"`               | Binary user choice. See §3.3.5.              | No              |
| `"USER_INTERACTION"`     | Generic form screen. See §3.3.6 / §7.        | No              |
| `"SCRIPT"`               | Runs a script snippet. See §3.3.3.           | Yes             |
| `"ACTION PROXY"`         | Invokes an environment action.               | No              |
| `"WAIT ACTION PROXY"`    | ACTION PROXY that blocks until action resolves. | No           |
| `"WORKFLOW PROXY"`       | Invokes a child workflow. See §8.            | No              |

Important:
- Underscores in `"YES_NO"` and `"USER_INTERACTION"` are literal — do not change to spaces.
- Spaces in `"SELECT 1"`, `"WAIT ALL"`, `"WAIT ANY"`, `"ACTION PROXY"`, `"WAIT ACTION PROXY"`, `"WORKFLOW PROXY"` are literal — do not change to underscores.
- Editor uses lowercase internal types like `"start"`, `"select1"`, `"userInteraction"` — the export MUST translate these. See §9.

### 3.3 Optional step fields (per step type)

#### 3.3.1 Parameters on any step

```json
{
  "input_parameter_specifications": [
    { "id": "threshold", "default_value": "10",
      "value_type": "literal" }
  ],
  "output_parameter_specifications": [
    { "id": "result",
      "target": "Response.Value" }
  ],
  "value_property_specifications": [
    { "name": "LocalCounter",
      "entries": [{ "name": "Value", "value": "0" }] }
  ]
}
```

See §5 for field definitions.

#### 3.3.2 `connection_references`

Optional string array used by `SELECT 1` and `YES_NO` to enumerate which outgoing `connection_id`s this step owns. The runtime infers from `connections[]` if absent; include for round-trip fidelity with the editor.

#### 3.3.3 `SCRIPT` → `script_config`

```json
{
  "step_type": "SCRIPT",
  "script_config": {
    "language": "python",
    "source": "output.result = input.threshold * 2"
  }
}
```

Supported `language`: see runtime `ScriptExecutor` (`python` on web via Pyodide; JS regex-based fallback on KMP iOS target).

#### 3.3.4 `SELECT 1` → `select1_config` + routed connections

The step config enumerates options. The connections from this step each carry a `connection_id` matching an option `id`:

```json
{
  "step_type": "SELECT 1",
  "select1_config": {
    "input_name": "Status.Value",
    "input_value_type": "property",
    "options": [
      { "id": "opt-open",    "label": "Open",    "operator": "==", "value": "open",    "value_type": "literal", "is_default": false },
      { "id": "opt-closed",  "label": "Closed",  "operator": "==", "value": "closed",  "value_type": "literal", "is_default": false },
      { "id": "opt-pending", "label": "Pending", "operator": "!=", "value": "open",    "value_type": "literal", "is_default": true  }
    ]
  }
}
```

```json
// connections array:
{ "from_step_id": "step-sel", "to_step_id": "step-end-open",    "connection_id": "opt-open" }
{ "from_step_id": "step-sel", "to_step_id": "step-end-closed",  "connection_id": "opt-closed" }
{ "from_step_id": "step-sel", "to_step_id": "step-end-pending", "connection_id": "opt-pending" }
```

Runtime rule: `connection_id` on a `SELECT 1` outgoing connection MUST equal one of the `options[*].id`. Editor `edge.sourceHandle` maps to `connection_id` here.

Supported `operator` values: `"=="`, `"!="`, `"<"`, `"<="`, `">"`, `">="`, `"contains"`, `"startsWith"`, `"endsWith"`, `"matches"` (regex).

#### 3.3.5 `YES_NO` → `yes_no_config` + two outgoing connections

```json
{
  "step_type": "YES_NO",
  "yes_no_config": {
    "yes_label": "Yes",
    "no_label":  "No",
    "yes_value": "true",
    "no_value":  "false",
    "default_selection": "none"
  }
}
```

```json
// connections:
{ "from_step_id": "yn", "to_step_id": "next-yes", "source_handle_id": "yes" }
{ "from_step_id": "yn", "to_step_id": "next-no",  "source_handle_id": "no"  }
```

Runtime reads `source_handle_id ∈ {"yes","no"}` to pick the branch. `default_selection` ∈ `{"yes","no","none"}`.

#### 3.3.6 `USER_INTERACTION` → `ui_parameter_specifications` and/or `form_layout_config`

Two formats coexist:

1. **Legacy vertical stack** — `ui_parameter_specifications` is an ordered list rendered top-down.
2. **WYSIWYG form** — `form_layout_config` is per-device (`phone` / `tablet` / `desktop`) absolute-positioned layouts.

If both are present, the runtime uses `form_layout_config` when available for the active device type and falls back to `ui_parameter_specifications` otherwise.

See §7 for full form layout details.

---

## 4. Connections

```json
{
  "from_step_id":    "7000000000001",
  "to_step_id":      "7000000000011",
  "connection_id":   "7000000000012",
  "source_handle_id":"yes",
  "condition":       "Response.Value == 'approved'",
  "waypoints":       [ { "x": 150, "y": 200 } ]
}
```

| Field              | Required | Meaning |
|--------------------|----------|---------|
| `from_step_id`     | Yes      | Step `oid`. |
| `to_step_id`       | Yes      | Step `oid`. Must differ from `from_step_id`. |
| `connection_id`    | No       | Unique ID for this edge. Used by `SELECT 1` to match option IDs. |
| `source_handle_id` | No       | For `YES_NO` (`"yes"` / `"no"`) and for future named outputs on proxy steps. |
| `condition`        | No       | Free-form condition string on `SELECT 1` edges (informational; authoritative routing is `select1_config`). |
| `waypoints`        | No       | Editor bend points. `waypoints[0] = { x, y }` is an **offset (delta)** from the default midpoint that the editor's orthogonal router computes from source/target node positions, not an absolute canvas point. Only `waypoints[0]` is read; longer arrays are reserved for forward compatibility. The runtime ports the editor's `calculatePathPoints` algorithm verbatim (constants: OFFSET=5, TURN=20, NODE_CLEARANCE_V=30, NODE_CLEARANCE_H=50; see `TrajectoryEditor/docs/specs/07-connection-waypoint-routing.md` for the full algorithm). Active component depends on flow direction × forward/backward: vertical-forward uses `wpY` as Y of the horizontal crossover; vertical-backward (loop) uses `wpX` as X of the vertical bypass lane to the right of both nodes; horizontal cases are mirrored. Source/target handles are computed from editor node sizes (rect 120×50, gateway 60×60, circle 30×30); YES_NO source uses left=40 for `'yes'` and left=80 for `'no'`. |

---

## 5. Parameter and resource specifications

### 5.1 `starting_parameter_specifications` (workflow inputs)

```json
{
  "id":            "greeting",
  "oid":           "param-oid-1",
  "description":   "Greeting text shown on first screen",
  "default_value": "Welcome",
  "value_type":    "literal",
  "json_schema":   "{\"type\":\"string\"}",
  "entries":       [ { "name": "subkey", "value": "default" } ]
}
```

Required: `id`, `default_value`. `value_type` ∈ `{"literal","property"}`; omit = `"literal"`.

### 5.2 `output_parameter_specifications` (workflow outputs)

```json
{
  "id":          "result",
  "oid":         "param-oid-2",
  "description": "Final result value",
  "target":      "Response.Value",
  "entries":     [ ]
}
```

Required: `id`. `target` is a dotted Value Property reference (`Property.Entry`).

### 5.3 `value_property_specifications` (workflow- or step-scoped values)

```json
{
  "name":    "Response",
  "oid":     "vp-oid-1",
  "entries": [
    { "name": "Value",  "value": ""        },
    { "name": "Status", "value": "pending" }
  ]
}
```

Required: `name`. Value Properties are addressed as `Name.EntryName` in parameter defaults and conditions.

### 5.4 `resource_property_specifications` (workflow- or env-scoped resources)

```json
{
  "name":          "Printer",
  "resource_type": "binary exclusive use",
  "use_limit":     1,
  "description":   "Shared printer",
  "names":         [ "HP-001", "HP-002" ]
}
```

Required: `name`, `resource_type`. `resource_type` ∈ exactly one of:

| Value                              | Purpose |
|------------------------------------|---------|
| `"binary exclusive use"`           | Mutex — one holder at a time. |
| `"binary shared use with pool limits"` | Semaphore up to `use_limit`. |
| `"countable use with pool limits"` | Quantified pool; steps `Acquire Pool Amount N`. `use_limit` required. |
| `"named pool"`                     | Named-slot pool; `names[]` required non-empty. |
| `"sync"`                           | Rendezvous channel; used via `Send`/`Receive`/`Synchronize`. |

### 5.5 `resource_command_specifications` (on a step OR workflow root)

```json
{
  "oid":                  "rc-oid-1",
  "command_type":         "Acquire",
  "resource_name":        "Printer",
  "resource_source_type": "workflow",
  "resource_source_oid":  "7000000000001",
  "amount":               1,
  "target":               "PrinterHandle",
  "source":               "MessagePayload"
}
```

Required: `command_type`, `resource_name`.

| `command_type`               | Compatible resource_types                                        | Required extras |
|------------------------------|------------------------------------------------------------------|-----------------|
| `"Acquire"` / `"Release"`    | binary exclusive / binary shared / named pool                    | —               |
| `"Acquire Pool Amount"` / `"Release Pool Amount"` | countable                                  | `amount` > 0    |
| `"Send"` / `"Receive"` / `"Synchronize"`          | sync                                       | At most one sync command per step. |

`resource_source_type` ∈ `{"workflow","environment"}`; `resource_source_oid` = owning workflow/environment `oid`.

---

## 6. Environment specifications

Embedded under the root workflow's `environment_specifications` and/or packaged as separate `.WFenvir` files under `environments/` in the ZIP.

```json
{
  "local_id":     "Kitchen Library",
  "oid":          "env-oid-1",
  "version":      "1.0.0",
  "last_modified_date": "2026-04-24T00:00:00Z",
  "library_name": "Kitchen Library",
  "included_actions": [
    {
      "action_name":    "preheatOven",
      "action_library": "Oven Controls",
      "action_oid":     "act-oid-1",
      "action_version": "1.0.0",
      "action_last_modified_date": "2026-04-24T00:00:00Z",
      "input_parameter_specifications":  [ /* §5.1 */ ],
      "output_parameter_specifications": [ /* §5.2 */ ],
      "property_specifications":         [ /* §5.3 */ ]
    }
  ],
  "value_property_specifications":    [ /* §5.3 */ ],
  "action_property_specifications":   [ /* §5.3 */ ],
  "resource_property_specifications": [ /* §5.4 */ ],
  "action_server_specifications": [
    { "name": "primary", "uri": "https://api.example.com", "connection_type": "REST" }
  ]
}
```

Required: `local_id`, `oid`, `version`, `last_modified_date`, `included_actions`.

---

## 7. Form layout for `USER_INTERACTION` / `YES_NO`

```json
"form_layout_config": [
  {
    "deviceType":   "phone",
    "canvasWidth":  390,
    "canvasHeight": 844,
    "elements":     [ /* FormElement[] */ ]
  },
  {
    "deviceType":   "tablet",
    "canvasWidth":  820,
    "canvasHeight": 1180,
    "elements":     [ /* ... */ ]
  }
]
```

Each `FormElement` has `type`, absolute `x/y/width/height`, and `type`-specific props.

### 7.1 Element types

`type ∈ { "button", "text", "textInput", "image", "header", "textarea", "checkbox", "radio", "video", "divider", "timer" }`

Universal: `x`, `y`, `width`, `height` (numbers, required); `zIndex` optional.

Type-specific (only the common ones — the full list is in `spec/docs/06-json-schemas.md` §2):

- **button** — `label`, `outputValue`, `deletable?`
- **text / header** — `content` (string OR `{content: "...", plainText: "..."}` for rich text), `fontSize`, `fontWeight`, `color`, `align`
- **textInput** — `fieldName`, `label`, `placeholder`, `required`, `inputMode ∈ {text,number,phone,password,dropdown,combobox}`, `listItems[]`, `listSource`, `outputParameter`, `defaultSource`, `placeholderSource`
- **textarea** — like textInput + `rows`
- **image** — `src` (filename in `images/` or https URL), `imageOid` (stable key), `objectFit ∈ {contain,cover,fill}`
- **video** — `src`, `posterUrl`
- **checkbox / radio** — `label`, `fieldName`, `options[]` = `[{label,value}]`, `outputParameter`
- **divider** — `thickness`, `color`
- **timer** — `durationSeconds`, `direction ∈ {countdown,countup}`, `blockDone`, `fieldName`

### 7.2 Form element images

When an image element is used, also register it at the step level so the runtime can resolve by stable OID:

```json
"form_element_images": [
  { "image_oid": "7000000123456", "filename": "engine-closeup.jpg" }
]
```

ZIP path: `images/7000000123456-engine-closeup.jpg`. Runtime also accepts bare `images/engine-closeup.jpg` as a fallback.

---

## 8. Children (v7.0 — preferred) and `child_workflows` (deprecated)

### 8.1 `children[]` — new format

Each entry is a `ChildWorkflowExport` — identical to `MasterWorkflowSpecification` **plus** required `parentChildSpecId` and `state`; every managed-element field (`local_id`, `oid`, `version`, `last_modified_date`) remains required.

```json
"children": [
  {
    "local_id":          "Safety Check Sub-Workflow",
    "oid":               "298928815449600000",
    "version":           "1.0.0",
    "state":             "Draft",
    "last_modified_date":"2026-04-24T12:00:00Z",
    "schemaVersion":     "4.0",
    "parentChildSpecId": null,
    "steps":             [ /* ... */ ],
    "connections":       [ /* ... */ ],
    "children": [
      {
        "local_id":          "Detailed Inspection",
        "oid":               "298928815663509504",
        "version":           "1.0.0",
        "state":             "Draft",
        "last_modified_date":"2026-04-24T12:00:00Z",
        "schemaVersion":     "4.0",
        "parentChildSpecId": "298928815449600000",
        "steps":             [ /* ... */ ],
        "connections":       [ /* ... */ ]
      }
    ]
  }
]
```

Rules:
- `parentChildSpecId: null` = direct child of the root workflow.
- `parentChildSpecId: "<oid>"` = grandchild / deeper; the OID MUST match a `ChildWorkflowExport.oid` at the level above in the same `children` tree.
- `state` on a child is **required** (unlike on the root). Free-form string; runtime does not validate the value.
- `version` on a child is required via `ManagedElement` inheritance.
- `schemaVersion` on a child is optional; when present, same enum `["3.0","4.0"]`.

### 8.2 `WORKFLOW PROXY` → child linkage

A step of type `WORKFLOW PROXY` invokes a child by its `local_id`:

```json
{
  "local_id":  "Safety Check Sub-Workflow",
  "oid":       "100000000000000002",
  "step_type": "WORKFLOW PROXY",
  "version":   "1.0.0",
  "last_modified_date": "2026-04-24T00:00:00Z",
  "position":  { "x": 100, "y": 250 }
}
```

The runtime indexes children by `local_id` and binds the proxy step to the matching child. Names MUST match exactly. If multiple children share a `local_id`, behavior is undefined — keep names unique.

### 8.3 `child_workflows[]` — deprecated fallback

The old (v6.0) format used `child_workflows: MasterWorkflowSpecification[]` with no `parentChildSpecId`, `state`, or `schemaVersion`. The runtime still accepts it for backward compatibility:

- If both `children` and `child_workflows` are present, the runtime **uses `children` and ignores `child_workflows`**.
- New exports SHOULD NOT emit `child_workflows` unless you need to target a pre-v7.0 runtime. Emitting both for a migration period is safe.

---

## 9. Transformation from editor state to runtime format

### 9.1 Envelope flattening (library → workflow)

The editor saves a library envelope. For each root workflow the user asks to export:

1. Pick `spec ∈ specifications[]` where `spec.parentSpecificationId === null` AND `spec.rootSpecificationId === spec.id` — that's the root.
2. Emit one `.WFmasterX` per root.
3. Every other `spec` in `specifications[]` that shares the same `rootSpecificationId` becomes an entry in the root's `children[]` tree (see §9.4).
4. Copy `library.environmentLibraryIds` → package `environments/` folder (one `.WFenvir` each), and populate root `environment_specifications[]` with matching references if the library metadata is embedded.

### 9.2 Spec-level field map

| Editor (`specifications[i]`)                 | Runtime (root or `ChildWorkflowExport`) |
|----------------------------------------------|------------------------------------------|
| `id`                                         | `oid` |
| `name`                                       | `local_id` |
| `description` (may be null)                  | `description` (omit if null) |
| `version`                                    | `version` |
| `state`                                      | `state` |
| `updatedAt` (epoch ms)                       | `last_modified_date` (ISO 8601 string) |
| `createdAt`                                  | *(not mapped — use if `updatedAt` absent)* |
| `parentSpecificationId`                      | `parentChildSpecId` (null for root) |
| `rootSpecificationId`                        | *(not mapped — used only for grouping)* |
| `dataSchemaVersion`                          | *(not mapped — derive `schemaVersion: "4.0"`)* |
| `data.nodes[]`                               | `steps[]` (see §9.3) |
| `data.edges[]`                               | `connections[]` (see §9.3) |
| `data.viewport`                              | `viewport` (pass through) |
| `data.workflowInputs[]`                      | `starting_parameter_specifications[]` |
| `data.workflowOutputs[]`                     | `output_parameter_specifications[]` |
| `data.workflowValues[]`                      | `value_property_specifications[]` |
| `data.workflowResources[]`                   | `resource_property_specifications[]` |
| `data.images[]`                              | `form_element_images[]` on the appropriate step + ZIP entries under `images/` |
| `children[]` (of editor spec, if any)        | *(unused — use `parentSpecificationId` grouping instead)* |

### 9.3 Node / edge mapping

Every node (step) MUST have the four `ManagedElement` fields (`local_id`, `oid`, `version`, `last_modified_date`) on emission, even if the editor does not track them internally. Use the spec-level `updatedAt` as a default `last_modified_date` and `"1.0.0"` as a default `version` for steps.

| Editor node                                 | Runtime step                          |
|---------------------------------------------|---------------------------------------|
| `node.id`                                   | `oid` |
| `node.data.label`                           | `local_id` |
| `node.data.stepType` (lowercase/camelCase)  | `step_type` (UPPER-CASE with spaces — use the table below) |
| `node.position`                             | `position` (pass through) |
| `node.data.scriptConfig`                    | `script_config` |
| `node.data.select1Config`                   | `select1_config` |
| `node.data.yesNoConfig`                     | `yes_no_config` |
| `node.data.uiParameterSpecifications`       | `ui_parameter_specifications` |
| `node.data.formLayoutConfig`                | `form_layout_config` |
| `node.data.inputParameterSpecifications`    | `input_parameter_specifications` |
| `node.data.outputParameterSpecifications`   | `output_parameter_specifications` |
| `node.data.valuePropertySpecifications`     | `value_property_specifications` |
| `node.data.resourceCommandSpecifications`   | `resource_command_specifications` |
| `node.data.actionVisibility`                | `action_visibility` |
| `node.measured`                             | *(discarded)* |

#### Step-type normalization table

| Editor `node.type` / `stepType` | Runtime `step_type`     |
|---------------------------------|-------------------------|
| `start`                         | `START`                 |
| `end`                           | `END`                   |
| `parallel`                      | `PARALLEL`              |
| `waitAll`                       | `WAIT ALL`              |
| `waitAny`                       | `WAIT ANY`              |
| `select1`                       | `SELECT 1`              |
| `yesNo`                         | `YES_NO`                |
| `userInteraction`               | `USER_INTERACTION`      |
| `script`                        | `SCRIPT`                |
| `actionProxy`                   | `ACTION PROXY`          |
| `waitActionProxy`               | `WAIT ACTION PROXY`     |
| `workflowProxy`                 | `WORKFLOW PROXY`        |

| Editor edge                    | Runtime connection                            |
|--------------------------------|-----------------------------------------------|
| `edge.source`                  | `from_step_id`                                |
| `edge.target`                  | `to_step_id`                                  |
| `edge.id`                      | `connection_id`                               |
| `edge.sourceHandle`            | `source_handle_id` (for YES_NO: `"yes"`/`"no"`) <br> **AND** `connection_id` (for SELECT 1 options) |
| `edge.data.condition`          | `condition` |
| `edge.type`, `markerEnd`, `style`, `animated` | *(discarded — presentation only)* |

### 9.4 Building the `children` tree

Input: a flat list of `specifications[]` sharing one `rootSpecificationId`.

```
root = spec where parentSpecificationId === null
rest = all other specs

function buildChildren(parentId):
  entries = rest filter where parentSpecificationId === parentId
  return entries.map(e => ({
    ...childWorkflowExportFrom(e),            // §9.2 field map
    parentChildSpecId: (e.parentSpecificationId === root.id ? null : e.parentSpecificationId),
    children: buildChildren(e.id)             // recurse
  }))

root_output.children = buildChildren(root.id)
```

**Important:** in the editor's model, direct children of the root have `parentSpecificationId === root.id`, but in the runtime's model the same node has `parentChildSpecId === null`. Translate exactly. For grandchildren and deeper, `parentChildSpecId` MUST equal the runtime `oid` of the parent `ChildWorkflowExport` (which equals the editor `id` of the parent spec, per §9.2).

---

## 10. Worked example — end-to-end

### 10.1 Input (editor's `Test_Loops_and_Scripts.WFmasterX` unwrapped)

```json
{
  "schemaVersion": "3.0",
  "library": { "id": "cb95ed7f-...", "name": "Test Workflow Library", "entityType": "workflow",
                "version": "1.0.0", "createdAt": 1776796113598, "updatedAt": 1776796113598 },
  "specifications": [{
    "id": "454cf221-9064-4b5f-8bd1-c68f825cfd0c",
    "libraryId": "cb95ed7f-...",
    "name": "Test Loops and Scripts",
    "description": null,
    "version": "1.0.0",
    "state": "Draft",
    "dataSchemaVersion": 3,
    "parentSpecificationId": null,
    "rootSpecificationId": "454cf221-9064-4b5f-8bd1-c68f825cfd0c",
    "createdAt": 1777065896423,
    "updatedAt": 1777066021125,
    "data": {
      "nodes": [
        { "id": "305074740597379072", "type": "start",
          "position": { "x": 190, "y": 25 },
          "data": { "label": "START", "stepType": "start" } },
        { "id": "305074781001109504", "type": "yesNo",
          "position": { "x": 190, "y": 120 },
          "data": { "label": "Continue?", "stepType": "yesNo",
                    "yesNoConfig": { "yes_label": "Yes", "no_label": "No",
                                     "yes_value": "true", "no_value": "false" } } },
        { "id": "305074822906400768", "type": "end",
          "position": { "x": 100, "y": 260 },
          "data": { "label": "END", "stepType": "end" } }
      ],
      "edges": [
        { "source": "305074740597379072", "target": "305074781001109504",
          "id": "xy-edge__1" },
        { "source": "305074781001109504", "sourceHandle": "yes",
          "target": "305074822906400768",
          "id": "xy-edge__305074781001109504yes-305074822906400768" },
        { "source": "305074781001109504", "sourceHandle": "no",
          "target": "305074822906400768",
          "id": "xy-edge__305074781001109504no-305074822906400768" }
      ],
      "viewport":          { "x": 0, "y": 0, "zoom": 1 },
      "workflowInputs":    [],
      "workflowOutputs":   [],
      "workflowValues":    [],
      "workflowResources": []
    },
    "children": []
  }],
  "specEnvs":      [],
  "imageManifest": {}
}
```

### 10.2 Output (runtime `Test_Loops_and_Scripts.WFmasterX/Test_Loops_and_Scripts.WFmaster`)

```json
{
  "schemaVersion": "4.0",
  "local_id": "Test Loops and Scripts",
  "oid": "454cf22190644b5f8bd1c68f825cfd0c",
  "description": null,
  "version": "1.0.0",
  "state": "Draft",
  "last_modified_date": "2026-03-24T18:33:41.125Z",
  "display_style": "flowchart",
  "viewport": { "x": 0, "y": 0, "zoom": 1 },

  "steps": [
    {
      "local_id": "START",
      "oid":      "305074740597379072",
      "version":  "1.0.0",
      "last_modified_date": "2026-03-24T18:33:41.125Z",
      "step_type": "START",
      "position":  { "x": 190, "y": 25 }
    },
    {
      "local_id": "Continue?",
      "oid":      "305074781001109504",
      "version":  "1.0.0",
      "last_modified_date": "2026-03-24T18:33:41.125Z",
      "step_type": "YES_NO",
      "position":  { "x": 190, "y": 120 },
      "yes_no_config": {
        "yes_label": "Yes", "no_label": "No",
        "yes_value": "true", "no_value": "false"
      }
    },
    {
      "local_id": "END",
      "oid":      "305074822906400768",
      "version":  "1.0.0",
      "last_modified_date": "2026-03-24T18:33:41.125Z",
      "step_type": "END",
      "position":  { "x": 100, "y": 260 }
    }
  ],

  "connections": [
    { "from_step_id": "305074740597379072", "to_step_id": "305074781001109504",
      "connection_id": "xy-edge__1" },
    { "from_step_id": "305074781001109504", "to_step_id": "305074822906400768",
      "connection_id": "xy-edge__305074781001109504yes-305074822906400768",
      "source_handle_id": "yes" },
    { "from_step_id": "305074781001109504", "to_step_id": "305074822906400768",
      "connection_id": "xy-edge__305074781001109504no-305074822906400768",
      "source_handle_id": "no" }
  ],

  "starting_parameter_specifications": [],
  "output_parameter_specifications":   [],
  "value_property_specifications":     [],
  "resource_property_specifications":  []
}
```

Note: `oid` strings were stripped of dashes in this example for compactness — dashes are accepted; the runtime treats `oid` as opaque.

### 10.3 ZIP layout

```
Test_Loops_and_Scripts.WFmasterX
└── Test_Loops_and_Scripts.WFmaster   (the JSON above)
```

No environments, actions, or images are needed here.

---

## 11. Implementation checklist for the editor export pipeline

When the user clicks **Export Runtime Package** on a spec:

- [ ] Locate the root spec (`parentSpecificationId === null`) and all its descendants sharing `rootSpecificationId`.
- [ ] Build the `ChildWorkflowExport` tree from `parentSpecificationId` linkage (§9.4). Remap root-direct children's `parentChildSpecId` to `null`.
- [ ] For each spec in the tree, map spec-level metadata (§9.2).
- [ ] For each spec's `data.nodes[]`, emit a `steps[]` entry with:
  - `oid = node.id`
  - `local_id = node.data.label`
  - `step_type` = normalized (§9.3 table)
  - `version`, `last_modified_date` defaulted from the enclosing spec
  - `position` copied
  - type-specific config (`script_config`, `select1_config`, `yes_no_config`, `ui_parameter_specifications`, `form_layout_config`, etc.) copied from `node.data.*`
- [ ] For each spec's `data.edges[]`, emit a `connections[]` entry with `from_step_id`, `to_step_id`, `connection_id = edge.id`, `source_handle_id = edge.sourceHandle` (preserve for both SELECT 1 routing and YES_NO branches — set `connection_id = edge.sourceHandle` too when the `from` step is `SELECT 1`).
- [ ] Map `data.workflowInputs` / `workflowOutputs` / `workflowValues` / `workflowResources` to the four runtime spec arrays (§5).
- [ ] Emit `environment_specifications` from referenced environment libraries; write matching `.WFenvir` files under `environments/` in the ZIP.
- [ ] For every form element image and UI-parameter image used, write the file into `images/` in the ZIP (use `{imageOid}-{filename}` naming for form elements; bare filename for UI params).
- [ ] Emit `manifest.json` (optional but recommended) alongside the root `.WFmaster`.
- [ ] Set `schemaVersion: "4.0"` on the root. Do NOT set `dataSchemaVersion`.
- [ ] Do NOT include the `library` / `specifications` / `specEnvs` / `imageManifest` wrapper in the runtime file.
- [ ] If you must support v6.0 runtimes in parallel, ALSO emit `child_workflows[]` in flat (plain `MasterWorkflowSpecification`) form alongside `children[]`. Otherwise omit `child_workflows`.

### 11.1 Self-check before writing the file

- [ ] Exactly one step has `step_type === "START"`.
- [ ] At least one step has `step_type === "END"`.
- [ ] All step `oid` values unique within the spec.
- [ ] Every connection references existing step `oid` values on both ends.
- [ ] No connection has `from_step_id === to_step_id`.
- [ ] Every step is reachable from the START step via `connections`.
- [ ] Every `PARALLEL` step has a matching `WAIT ALL` on every downstream path.
- [ ] Every `SELECT 1` step has at least one outgoing connection, and each such connection has a `connection_id` matching one of `select1_config.options[].id`.
- [ ] Every `YES_NO` step has at most two outgoing connections with `source_handle_id ∈ {"yes","no"}`.
- [ ] Every `ChildWorkflowExport` in `children[]` has non-null `parentChildSpecId` pointing at its parent's `oid`, or `null` for direct children of the root.
- [ ] Every managed element (root, every child, every step) has all four of `local_id`, `oid`, `version`, `last_modified_date`.

If any of these fail, the runtime will reject the package with the corresponding error code (`NO_START_STEP`, `DUPLICATE_STEP_OID`, `DANGLING_CONNECTION`, `ORPHANED_STEP`, `UNMATCHED_PARALLEL`, `MISSING_REQUIRED_FIELD`, `INVALID_STEP_TYPE`, `INVALID_RESOURCE_COMMAND`, `INVALID_RESOURCE_SPEC`, `SELF_REFERENCING_CONNECTION`).

---

## 12. Validation reference

The authoritative machine-checkable schema lives at `spec/workflow-schema.json` (JSON Schema Draft 2020-12). The runtime's AJV validator (web: `engines/web/src/validator.ts`, web-ui: `engines/web-ui/src/manager/validation.ts`) runs this schema plus the semantic checks in §2.3 and §5.4–§5.5 on every import.

The reference doc schemas live in `schemas/*.json` and describe the five package families (managed-element, master-workflow-library, master-action-library, master-environment-library, master-workflow-step-library). They are not loaded by the runtime code, but they are kept in lockstep with the live schema.

For test cases the editor team can feed back: `spec/conformance/` contains ~60 JSON fixtures covering validation and execution paths — useful as regression inputs for the export pipeline.
