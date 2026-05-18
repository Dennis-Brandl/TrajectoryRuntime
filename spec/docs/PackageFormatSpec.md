# Trajectory Mobile — Package Format Specification

## Overview

Trajectory Mobile consumes workflow packages created by Trajectory MD. This document specifies the package formats, extraction logic, and storage mapping.

---

## 1. Package Types

### 1.1 Runtime Package (`.WFmasterX`)

A self-contained executable workflow package with all dependencies embedded.

**ZIP structure:**
```
MyWorkflow.WFmasterX
├── MyWorkflow.WFmaster              # Main workflow specification (JSON)
├── manifest.json                     # Package metadata
├── environments/
│   ├── KitchenEnv.WFenvir           # Environment library (JSON)
│   └── BakeryEnv.WFenvir            # Additional environments
├── actions/
│   ├── HeatOven.WFaction            # Action library (JSON)
│   └── MixIngredients.WFaction      # Additional actions
└── images/
    ├── step1-instructionImage.png    # Step images (stepOid-prefixed)
    ├── step2-diagram.png
    └── video-demo.mp4               # Video assets
```

### 1.2 Workflow Library Package (`.WFlibX`)

A collection of workflow specifications (for batch download).

**ZIP structure:**
```
CookingProcedures.WFlibX
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
    ├── ...
```

### 1.3 Individual Files

| Extension | Type | Content |
|-----------|------|---------|
| `.WFmaster` | Workflow Specification | JSON — MasterWorkflowSpecification |
| `.WFslibX` | Step Library | JSON — MasterWorkflowStepLibrary |
| `.WFenvir` | Environment Library | JSON — MasterEnvironmentLibrary |
| `.WFaction` | Action Library | JSON — MasterActionLibrary |

---

## 2. Manifest Structure

```json
{
  "packageVersion": "1.0",
  "packageType": "runtime",
  "workflowName": "Bolognese Recipe",
  "workflowOid": "wf-snowflake-oid",
  "workflowVersion": "1.2.0",
  "schemaVersion": "4.0",
  "createdAt": "2026-02-24T10:00:00Z",
  "createdBy": "Trajectory MD v3.0",
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

---

## 3. JSON Content Formats

### 3.1 Workflow Specification (.WFmaster)

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
      "position": { "x": 100, "y": 50 },
      "input_parameter_specifications": [],
      "output_parameter_specifications": [],
      "value_property_specifications": [],
      "resource_command_specifications": []
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
      "ui_parameter_specifications": [
        {
          "type": "textInput",
          "value": "How many cloves of garlic?"
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
              "content": { "content": "Add Garlic", "plainText": "Add Garlic" },
              "x": 20, "y": 20, "width": 350, "height": 40,
              "fontSize": 24, "fontWeight": "bold", "color": "#000000", "align": "center"
            },
            {
              "type": "image",
              "src": "step-002-garlic-photo.png",
              "objectFit": "contain",
              "x": 50, "y": 80, "width": 290, "height": 200
            },
            {
              "type": "text",
              "content": { "content": "Mince the garlic cloves finely", "plainText": "Mince the garlic cloves finely" },
              "x": 20, "y": 300, "width": 350, "height": 40,
              "fontSize": 16, "color": "#333333"
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
            },
            {
              "type": "checkbox",
              "label": "Preparation method",
              "fieldName": "prepMethod",
              "options": ["Minced", "Crushed", "Sliced"],
              "outputParameter": "GarlicResponse.Method",
              "x": 20, "y": 450, "width": 350, "height": 100
            }
          ]
        },
        {
          "deviceType": "tablet",
          "canvasWidth": 768,
          "canvasHeight": 1024,
          "elements": []
        },
        {
          "deviceType": "desktop",
          "canvasWidth": 1280,
          "canvasHeight": 800,
          "elements": []
        }
      ],
      "resource_command_specifications": [
        {
          "oid": "rc-001",
          "command_type": "Acquire",
          "resource_name": "CuttingBoard"
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
    }
  ],

  "connections": [
    {
      "from_step_id": "step-001",
      "to_step_id": "step-002",
      "connection_id": "conn-001"
    }
  ],

  "viewport": { "x": 0, "y": 0, "zoom": 1 },

  "starting_parameter_specifications": [],
  "output_parameter_specifications": [],

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
  ],

  "environment_specifications": [],
  "child_workflows": []
}
```

---

## 4. Package Extraction

### 4.1 Extraction Process

When a package is downloaded or imported:

```
1. Read ZIP file using JSZip
2. Parse manifest.json
3. Validate schemaVersion compatibility (must be "4.0" or migrateable)
4. Extract and store workflow JSON:
   a. Parse .WFmaster file
   b. Store in master_workflows table (oid, local_id, version, full JSON)
5. Extract environment libraries:
   a. Parse each .WFenvir file
   b. Store in master_environments table
6. Extract action libraries:
   a. Parse each .WFaction file
   b. Store in master_actions table
7. Extract images:
   a. For each file in images/ directory
   b. Determine MIME type from extension
   c. Store in package_images table (workflow_oid, filename, mime_type, data)
8. Record download metadata (source server, timestamp)
```

### 4.2 Image MIME Type Detection

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

### 4.3 Image Filename Convention

Images in the package use `{stepOid}-{filename}` namespacing to prevent collisions between steps that use the same image name. When loading images for a specific step:

1. Look up `package_images` where `workflow_oid` matches AND `filename` matches the `src` attribute from the form element
2. If not found, try with `{stepOid}-{src}` prefix

### 4.4 Package Version Upgrade

If a package with the same OID already exists in local storage:

```
1. Compare versions (semver)
2. If new version > existing version:
   a. Replace master_workflows record
   b. Replace associated environments, actions, images
   c. Active runtime workflows using the old version continue unchanged
3. If same version: skip (already downloaded)
4. If lower version: warn user, optionally replace
```

---

## 5. Schema Migration

### 5.1 Supported Migrations

| From | To | Migration |
|------|----|-----------|
| 3.0 | 4.0 | Convert INSTRUCTION/TEXT_INPUT/PICK_ONE/CHECKBOX step types to FORM_ENTRY; restructure form layouts |

The migration logic from Trajectory MD's `schema-migration.ts` should be ported to the mobile app to handle older packages.

### 5.2 Form Layout Import Migrations

When importing `form_layout_config` elements, apply these transformations:

#### `defaultSource.mode` Migration

Older exports may use `mode: 'parameter'` in `defaultSource` fields. Migrate to `mode: 'property'`:

```
Before: { "defaultSource": { "mode": "parameter", "value": "UserResponse.Value" } }
After:  { "defaultSource": { "mode": "property",  "value": "UserResponse.Value" } }
```

This applies to `textInput`, `textarea`, and `timer` elements.

#### RichTextContent Unwrapping

Text and header element `content` fields may arrive as either:

- **Object** `{ "content": "<b>Hello</b>", "plainText": "Hello" }` — Phase 15+ format
- **String** `"Hello"` — Phase 23+ format or legacy plain text

When content is an object, extract the `content` field (HTML) for display. Use `plainText` only as a fallback when the runtime doesn't support HTML rendering.

#### Image `src` Prefix Stripping

Image `src` values in the export use `{stepOid}-{filename}` namespacing:

```
Export:  "src": "step-002-garlic-photo.png"
Import:  "src": "garlic-photo.png"  (strip "step-002-" prefix using the step's oid)
```

The prefix is the step's `oid` value followed by a hyphen.

---

## 6. Package Download from Trajectory MD Server

### 6.1 Server API Usage

To browse and download workflows from a Trajectory MD server:

```
1. GET /api/libraries?entityType=workflow
   → List of workflow libraries

2. GET /api/libraries/{libId}
   → Library details with specification list

3. GET /api/specifications/{specId}
   → Full specification details

4. GET /api/workflows/{specId}
   → Full workflow with nodes, edges, parameters

5. Client-side: Package the specification into .WFmasterX format
   (or use a dedicated export endpoint if available)
```

### 6.2 Local File Import

Users can import `.WFmasterX` files from device storage:

- **Android**: File picker (DocumentPicker) or file manager share intent
- **iOS**: File picker (DocumentPicker) or Files app share
- **Web**: File input / drag-and-drop

The extraction process is the same regardless of source.
