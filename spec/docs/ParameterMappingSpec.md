# Trajectory Mobile — Parameter Mapping Specification

## Overview

This specification describes how Trajectory Mobile captures output parameters from TextInput and Textarea form elements, and resolves input parameter defaults at runtime when a form step is rendered. It covers the export JSON schema, the default resolution algorithm on form load, and the output capture algorithm on form submission.

---

## 1. Export Schema

### 1.1 TextInput Element with Parameter Binding

TextInput and Textarea elements in `form_layout_config.elements[]` may carry two optional parameter-binding fields: `outputParameter` and `defaultSource`.

```json
{
  "type": "textInput",
  "label": "Blood Pressure",
  "placeholder": "e.g. 120/80",
  "fieldName": "bloodPressure",
  "required": true,
  "x": 20,
  "y": 100,
  "width": 335,
  "height": 50,
  "outputParameter": "patient.bloodPressure",
  "defaultSource": {
    "mode": "parameter",
    "value": "intake.lastBloodPressure"
  }
}
```

### 1.2 Field Reference

| Field                 | Type                      | Presence                            | Semantics                                                                                                                                                                      |
| --------------------- | ------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `outputParameter`     | `string`                  | optional                            | `name.key` format. On form submission, write the field's current text value to this parameter path in the workflow's parameter map. Absent = no output capture for this field. |
| `defaultSource`       | `object \| undefined`     | optional                            | When absent: field starts empty (no default). When present: one of two shapes (see section 1.3).                                                                               |
| `defaultSource.mode`  | `"static" \| "parameter"` | required if `defaultSource` present | `"static"` = the value is a literal string. `"parameter"` = the value is a `name.key` reference to resolve from the input parameter map at runtime.                            |
| `defaultSource.value` | `string`                  | required if `defaultSource` present | The literal string (for static mode) or the `name.key` reference to look up (for parameter mode).                                                                              |

### 1.3 ParameterDefaultSource Shapes

Two mutually exclusive shapes are used as the `defaultSource` value:

```json
// Static default — pre-fill with a literal string
{ "mode": "static", "value": "120/80" }
```

```json
// Parameter reference default — resolve name.key from the input parameter map at runtime
{ "mode": "parameter", "value": "intake.lastBloodPressure" }
```

### 1.4 Textarea Element

The `textarea` element has the identical `outputParameter` and `defaultSource` schema as `textInput`. The only structural difference is the `type` discriminant and the optional `rows` field:

```json
{
  "type": "textarea",
  "label": "Clinical Notes",
  "placeholder": "Enter observations...",
  "fieldName": "notes",
  "rows": 4,
  "outputParameter": "patient.clinicalNotes",
  "defaultSource": {
    "mode": "static",
    "value": ""
  },
  "x": 20,
  "y": 160,
  "width": 335,
  "height": 100
}
```

All parameter mapping behavior described in this specification applies equally to both `textInput` and `textarea` elements.

---

## 2. Runtime Default Resolution

### 2.1 Algorithm

When a USER_INTERACTION step enters EXECUTING state and the form is rendered, the runtime resolves default values for all text input fields before displaying them to the user.

```
function resolveFormDefaults(elements, resolvedInputParameters):
  for each element in elements:
    if element.type is not "textInput" and element.type is not "textarea":
      continue

    if element.defaultSource is undefined:
      // No default configured — field starts empty
      setFieldValue(element.fieldName, "")
      continue

    if element.defaultSource.mode === "static":
      // Pre-fill with the literal string value
      setFieldValue(element.fieldName, element.defaultSource.value)
      continue

    if element.defaultSource.mode === "parameter":
      // Resolve the name.key reference from the workflow's input parameter map
      // See ExecutionEngineSpec.md section 6.1 for the full Parameter Resolver algorithm
      value = resolvedInputParameters.lookup(element.defaultSource.value)

      if value is not null and value is not undefined:
        setFieldValue(element.fieldName, value)
      else:
        // Parameter not found or has no value — field starts empty
        setFieldValue(element.fieldName, "")
```

### 2.2 Resolution Timing

Default resolution occurs once, immediately before the form is presented to the user. After the user begins editing a field, its value is no longer affected by the default source — the user's input takes precedence.

If the user navigates away from a step in the carousel and returns, the field shows the user's current input value (not the original default). The default is only applied on first render.

### 2.3 Parameter Lookup

The `element.defaultSource.value` string (when mode is `"parameter"`) is in `name.key` format — the same format used by Value Properties in the execution engine. For the complete lookup algorithm including scope resolution (workflow scope, parent workflow chain, environment scope), see **ExecutionEngineSpec.md section 6.1 (Input Resolution)**.

---

## 3. Runtime Output Capture

### 3.1 Algorithm

When the user submits a USER_INTERACTION step (taps the Done/Submit button or taps a button element), the runtime captures output values from all text input fields that have an `outputParameter` binding.

```
function captureFormOutputs(elements, currentFieldValues, parameterMap):
  for each element in elements:
    if element.type is not "textInput" and element.type is not "textarea":
      continue

    if element.outputParameter is undefined:
      // No output parameter binding — skip this field
      continue

    // Write the field's current text value to the parameter map
    textValue = currentFieldValues.get(element.fieldName)
    parameterMap.write(element.outputParameter, textValue)
    // element.outputParameter is in name.key format
    // See ExecutionEngineSpec.md section 6.2 for the write mechanism
```

### 3.2 Write Mechanism

The `element.outputParameter` value is a `name.key` string (e.g., `"patient.bloodPressure"`). The runtime writes the field's current text value to this path in the workflow's parameter map using the same Value Property upsert mechanism used by step-level output parameter specifications. For the complete write algorithm including scope determination, see **ExecutionEngineSpec.md section 6.2 (Output Writing)**.

### 3.3 Capture Timing

Output capture from `outputParameter` bindings occurs at the same time as standard step output parameter writing — when the step transitions from EXECUTING to COMPLETING. The captured values are available to downstream steps that reference these parameters.

---

## 4. Relationship to Step-Level Parameters

### 4.1 Two Separate Concepts

Trajectory's export schema contains two distinct output parameter mechanisms. Implementers must not conflate them:

| Concept                                      | Location in JSON                                | Format                | Purpose                                                                                       |
| -------------------------------------------- | ----------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------- |
| Form element `outputParameter`               | `form_layout_config.elements[].outputParameter` | `string` (`name.key`) | WYSIWYG-level binding: captures a specific field's text value directly into the parameter map |
| Step-level `output_parameter_specifications` | `steps[].output_parameter_specifications[]`     | array of objects      | Engine-level construct: maps step output values to named parameters via the execution engine  |

### 4.2 Interaction

A step may have both `output_parameter_specifications` on the step level AND `outputParameter` bindings on individual form elements. These operate independently:

- Form element `outputParameter` bindings are resolved and written by the form renderer at submit time, directly from the current field values.
- Step-level `output_parameter_specifications` are resolved by the execution engine using `step.resolved_outputs` — these are not affected by form element bindings.

Both mechanisms write to the same underlying Value Property store using the same `name.key` path format, so they can reference and overwrite the same parameters if configured to do so.

### 4.3 No Dependency

Form element `outputParameter` capture does NOT require corresponding entries in `output_parameter_specifications`. A field with an `outputParameter` binding will capture its value independently of any step-level parameter configuration.
