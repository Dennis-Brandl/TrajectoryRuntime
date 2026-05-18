# Trajectory-Editor JSON Schema Specification

**Copyright:** 2026 BR&L Consulting, Inc. All rights reserved.  
**Version:** 1.1  
**Date:** 2026-04-24  
**Schema Version:** 4.0 (Trajectory Workflow Schema — backward-compatible with 3.0)

---

## Overview

This document contains the complete JSON Schema definitions used to validate import/export files in the Trajectory-Editor system. These schemas are used by both the client-side AJV validator, the server-side import pipeline, and the Runtime Engine.

All schemas use JSON Schema Draft-07. All `$ref` references are relative (e.g., `managed-element.json`). All entity IDs (`oid` fields) are Snowflake IDs stored as strings.

**Schema version 4.0** was introduced with the v7.0 package format (see `docs/v7.0-package-format-changes.md`). It is a strict superset of 3.0: new optional `version`/`state` fields on root specs and a new `children` array (v7.0+) alongside the deprecated `child_workflows`. Packages carrying `schemaVersion: "3.0"` remain valid; packages carrying `schemaVersion: "4.0"` MUST be accepted. Packages with `schemaVersion: "2.0"` or below are rejected.

---

## Schema Registry

| Schema              | File                                | Purpose                                                   |
| ------------------- | ----------------------------------- | --------------------------------------------------------- |
| Managed Element     | `managed-element.json`              | Base type for all exportable entities                     |
| Workflow Library    | `master-workflow-library.json`      | Workflow library with specs, steps, connections, children |
| Action Library      | `master-action-library.json`        | Action library with input/output parameters               |
| Environment Library | `master-environment-library.json`   | Environment library with actions, resources, servers      |
| Step Library        | `master-workflow-step-library.json` | Step (reusable sub-workflow) library                      |

---

## 1. Managed Element (Base Schema)

All exportable entities (libraries, specifications, steps, parameters) extend this base type.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://saturnis.io/schemas/managed-element.json",
  "title": "Managed Workflow Element",
  "type": "object",
  "properties": {
    "schemaVersion": {
      "type": "string",
      "enum": ["3.0", "4.0"],
      "description": "Trajectory workflow schema version. '4.0' is the current format (v7.0 packages); '3.0' is accepted for backward compatibility. Required on root exports."
    },
    "local_id": { "type": "string", "description": "Human-readable name (e.g., 'Check Pressure')." },
    "oid": { "type": "string", "description": "Snowflake ID. Stable across export/import." },
    "description": { "type": "string" },
    "version": { "type": "string", "description": "Semantic version string (e.g., '1.0.0')." },
    "last_modified_date": { "type": "string", "format": "date-time" }
  },
  "required": ["local_id", "oid", "version", "last_modified_date"]
}
```

---

## 2. Master Workflow Library

Contains workflow specifications with steps, connections, parameters, resources, environment references, and child workflows.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://saturnis.io/schemas/master-workflow-library.json",
  "title": "Master Workflow Library",
  "description": "A collection of Master Workflow Specifications.",
  "allOf": [{ "$ref": "managed-element.json" }],
  "type": "object",
  "required": ["workflow_specifications"],
  "properties": {
    "workflow_specifications": {
      "type": "array",
      "description": "The list of Master Workflow Specifications within this library.",
      "items": {
        "type": "object",
        "allOf": [{ "$ref": "managed-element.json" }],
        "required": ["steps", "connections"],
        "properties": {
          "version": {
            "type": "string",
            "description": "Semver version string for the root spec (e.g. '1.0.0'). Optional on root exports — runtime defaults to '1.0.0' when absent."
          },
          "state": {
            "type": "string",
            "description": "Lifecycle state: Draft | InTest | InReview | Approved | Effective | Superseded | Obsolete. Optional on root exports — runtime defaults to 'Draft' when absent."
          },
          "display_style": {
            "type": "string",
            "enum": ["flowchart", "bpmn", "isa88"],
            "description": "Diagram notation: Flowchart (top-to-bottom), BPMN (left-to-right), ISA-88 PFC (top-to-bottom)."
          },
          "steps": {
            "type": "array",
            "description": "The workflow steps in this specification.",
            "items": {
              "$ref": "#/definitions/step"
            }
          },
          "connections": {
            "type": "array",
            "description": "Execution order connections between steps.",
            "items": {
              "$ref": "#/definitions/connection"
            }
          },
          "viewport": {
            "$ref": "#/definitions/viewport"
          },
          "starting_parameter_specifications": {
            "type": "array",
            "description": "Input parameters for the workflow.",
            "items": { "$ref": "#/definitions/input_parameter" }
          },
          "output_parameter_specifications": {
            "type": "array",
            "description": "Output parameters produced by the workflow.",
            "items": { "$ref": "#/definitions/output_parameter" }
          },
          "value_property_specifications": {
            "type": "array",
            "description": "Workflow-level named values.",
            "items": { "$ref": "#/definitions/value_property" }
          },
          "resource_property_specifications": {
            "type": "array",
            "description": "Workflow-level resource definitions.",
            "items": { "$ref": "#/definitions/resource_property" }
          },
          "resource_command_specifications": {
            "type": "array",
            "description": "Workflow-level resource commands.",
            "items": { "$ref": "#/definitions/resource_command" }
          },
          "environment_specifications": {
            "type": "array",
            "description": "Embedded environment specifications referenced by this workflow.",
            "items": { "$ref": "#/definitions/environment_specification" }
          },
          "children": {
            "type": "array",
            "description": "Nested child workflow specifications (v7.0+). Preferred over 'child_workflows'. Entries are ChildWorkflowExport (see #/definitions/child_workflow) with required parentChildSpecId/version/state.",
            "items": { "$ref": "#/definitions/child_workflow" }
          },
          "child_workflows": {
            "type": "array",
            "description": "DEPRECATED — retained for pre-v7.0 package compatibility. When both 'children' and 'child_workflows' are present the Runtime Engine MUST prefer 'children'. Entries are plain MasterWorkflowSpecification (no parentChildSpecId/version/state requirement).",
            "items": { "type": "object" }
          }
        }
      }
    },
    "child_libraries": {
      "type": "array",
      "description": "Nested child libraries.",
      "items": { "$ref": "#" }
    }
  },
  "definitions": {
    "child_workflow": {
      "type": "object",
      "allOf": [{ "$ref": "managed-element.json" }],
      "required": ["parentChildSpecId", "version", "state", "steps", "connections"],
      "description": "ChildWorkflowExport (v7.0+): a child workflow with explicit parent linkage and REQUIRED lifecycle fields. parentChildSpecId = null for a direct child of the root workflow; otherwise equals the 'oid' of the parent ChildWorkflowExport in the same tree.",
      "properties": {
        "parentChildSpecId": {
          "type": ["string", "null"],
          "description": "Snowflake OID of the parent child spec in the same 'children' tree. null = direct child of root."
        },
        "version": { "type": "string", "description": "Semver version string. REQUIRED on child exports." },
        "state": { "type": "string", "description": "Lifecycle state. REQUIRED on child exports." },
        "display_style": { "type": "string", "enum": ["flowchart", "bpmn", "isa88"] },
        "steps": { "type": "array", "items": { "$ref": "#/definitions/step" } },
        "connections": { "type": "array", "items": { "$ref": "#/definitions/connection" } },
        "viewport": { "$ref": "#/definitions/viewport" },
        "starting_parameter_specifications": { "type": "array", "items": { "$ref": "#/definitions/input_parameter" } },
        "output_parameter_specifications": { "type": "array", "items": { "$ref": "#/definitions/output_parameter" } },
        "value_property_specifications": { "type": "array", "items": { "$ref": "#/definitions/value_property" } },
        "resource_property_specifications": { "type": "array", "items": { "$ref": "#/definitions/resource_property" } },
        "resource_command_specifications": { "type": "array", "items": { "$ref": "#/definitions/resource_command" } },
        "environment_specifications": { "type": "array", "items": { "$ref": "#/definitions/environment_specification" } },
        "children": {
          "type": "array",
          "description": "Recursive grandchildren. parentChildSpecId of each entry points to the OID of its parent ChildWorkflowExport.",
          "items": { "$ref": "#/definitions/child_workflow" }
        }
      }
    },
    "step": {
      "type": "object",
      "allOf": [{ "$ref": "managed-element.json" }],
      "required": ["step_type"],
      "properties": {
        "step_type": {
          "type": "string",
          "enum": [
            "START",
            "END",
            "ACTION PROXY",
            "WORKFLOW PROXY",
            "SELECT 1",
            "WAIT ANY",
            "PARALLEL",
            "WAIT ALL",
            "SCRIPT",
            "YES_NO",
            "USER_INTERACTION"
          ],
          "description": "The functional type of the workflow step."
        },
        "position": {
          "type": "object",
          "description": "Canvas position of this step.",
          "properties": {
            "x": { "type": "number" },
            "y": { "type": "number" }
          }
        },
        "output_parameter_name": {
          "type": "string",
          "description": "Output parameter name for UI steps that capture user input."
        },
        "action_visibility": {
          "type": "string",
          "enum": ["opaque", "observable"],
          "description": "Visibility of environment action."
        },
        "connection_references": {
          "type": "array",
          "items": { "type": "string" }
        },
        "input_parameter_specifications": {
          "type": "array",
          "items": { "$ref": "#/definitions/input_parameter" }
        },
        "output_parameter_specifications": {
          "type": "array",
          "items": { "$ref": "#/definitions/output_parameter" }
        },
        "value_property_specifications": {
          "type": "array",
          "items": { "$ref": "#/definitions/value_property" }
        },
        "resource_command_specifications": {
          "type": "array",
          "items": { "$ref": "#/definitions/resource_command" }
        },
        "ui_parameter_specifications": {
          "type": "array",
          "description": "UI parameters for user interaction steps.",
          "items": {
            "type": "object",
            "required": ["type", "value"],
            "properties": {
              "oid": { "type": "string" },
              "type": {
                "type": "string",
                "enum": [
                  "Button",
                  "Header",
                  "Text",
                  "SmallText",
                  "Image",
                  "Video",
                  "TextInput",
                  "YesNoButtons",
                  "PickList",
                  "CheckboxList",
                  "FormField",
                  "FormFieldMultiline",
                  "FormFieldNumeric",
                  "FormFieldPhone",
                  "FormFieldEmail",
                  "Divider"
                ]
              },
              "value": { "type": "string" },
              "font_size": { "type": "number" },
              "color": { "type": "string" },
              "lines": { "type": "integer" },
              "align": { "type": "string", "enum": ["left", "center", "right"] },
              "value2": { "type": "string", "description": "Secondary value (e.g., No label for YesNoButtons)." }
            }
          }
        },
        "yes_no_config": {
          "type": "object",
          "description": "Configuration for YES_NO step type.",
          "properties": {
            "yes_label": { "type": "string" },
            "no_label": { "type": "string" },
            "yes_value": { "type": "string", "description": "Output value when Yes selected (default: 'true')." },
            "no_value": { "type": "string", "description": "Output value when No selected (default: 'false')." },
            "default_selection": { "type": "string", "enum": ["yes", "no", "none"] }
          }
        },
        "script_config": {
          "type": "object",
          "description": "Configuration for SCRIPT step type.",
          "properties": {
            "language": { "type": "string", "description": "Script language (e.g., 'python')." },
            "source": { "type": "string", "description": "Script source code." }
          }
        },
        "select1_config": {
          "type": "object",
          "description": "Configuration for SELECT 1 step type.",
          "properties": {
            "input_name": { "type": "string" },
            "input_value_type": { "type": "string", "enum": ["literal", "property"] },
            "options": {
              "type": "array",
              "items": {
                "type": "object",
                "required": ["id", "label", "operator", "value", "value_type", "is_default"],
                "properties": {
                  "id": { "type": "string" },
                  "label": { "type": "string" },
                  "operator": { "type": "string" },
                  "value": { "type": "string" },
                  "value_type": { "type": "string", "enum": ["literal", "property"] },
                  "is_default": { "type": "boolean" }
                }
              }
            }
          }
        },
        "form_layout_config": {
          "type": "array",
          "description": "WYSIWYG form layout for USER_INTERACTION and YES_NO steps.",
          "items": { "$ref": "#/definitions/form_layout_entry" }
        },
        "form_element_images": {
          "type": "array",
          "description": "Stable image references for form elements.",
          "items": {
            "type": "object",
            "required": ["image_oid", "filename"],
            "properties": {
              "image_oid": { "type": "string", "description": "Snowflake OID for this image element." },
              "filename": { "type": "string", "description": "Image filename within images/ folder of ZIP." }
            }
          }
        }
      }
    },
    "connection": {
      "type": "object",
      "required": ["from_step_id", "to_step_id"],
      "properties": {
        "from_step_id": { "type": "string" },
        "to_step_id": { "type": "string" },
        "connection_id": { "type": "string" },
        "source_handle_id": { "type": "string", "description": "Source handle for SELECT 1 routing." },
        "condition": { "type": "string", "description": "Condition expression for SELECT 1 connections." },
        "waypoints": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "x": { "type": "number" },
              "y": { "type": "number" }
            }
          }
        }
      }
    },
    "viewport": {
      "type": "object",
      "description": "Canvas viewport state (pan and zoom).",
      "properties": {
        "x": { "type": "number" },
        "y": { "type": "number" },
        "zoom": { "type": "number" }
      }
    },
    "input_parameter": {
      "type": "object",
      "required": ["id", "default_value"],
      "properties": {
        "id": { "type": "string" },
        "oid": { "type": "string" },
        "description": { "type": "string" },
        "default_value": { "type": "string" },
        "json_schema": { "type": "string" },
        "value_type": { "type": "string", "enum": ["literal", "property"] },
        "entries": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["name", "value"],
            "properties": {
              "name": { "type": "string" },
              "value": { "type": "string" }
            }
          }
        }
      }
    },
    "output_parameter": {
      "type": "object",
      "required": ["id"],
      "properties": {
        "id": { "type": "string" },
        "oid": { "type": "string" },
        "description": { "type": "string" },
        "target": { "type": "string", "description": "Value property name where output is stored." },
        "entries": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["name", "value"],
            "properties": {
              "name": { "type": "string" },
              "value": { "type": "string" }
            }
          }
        }
      }
    },
    "value_property": {
      "type": "object",
      "required": ["name"],
      "properties": {
        "name": { "type": "string" },
        "oid": { "type": "string" },
        "entries": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["name", "value"],
            "properties": {
              "name": { "type": "string" },
              "value": { "type": "string" }
            }
          }
        }
      }
    },
    "resource_property": {
      "type": "object",
      "required": ["name", "resource_type"],
      "properties": {
        "name": { "type": "string" },
        "resource_type": {
          "type": "string",
          "enum": [
            "binary exclusive use",
            "binary shared use with pool limits",
            "countable use with pool limits",
            "named pool",
            "sync"
          ]
        },
        "use_limit": { "type": "integer" },
        "description": { "type": "string" },
        "names": {
          "type": "array",
          "description": "Named identifiers for named pool resources.",
          "items": { "type": "string" }
        }
      }
    },
    "resource_command": {
      "type": "object",
      "required": ["command_type", "resource_name"],
      "properties": {
        "oid": { "type": "string" },
        "command_type": {
          "type": "string",
          "enum": ["Acquire", "Release", "Acquire Pool Amount", "Release Pool Amount", "Send", "Receive", "Synchronize"]
        },
        "resource_name": { "type": "string" },
        "resource_source_type": { "type": "string", "enum": ["workflow", "environment"] },
        "resource_source_oid": { "type": "string" },
        "amount": { "type": "integer" },
        "target": { "type": "string" },
        "source": { "type": "string" }
      }
    },
    "form_layout_entry": {
      "type": "object",
      "required": ["deviceType", "canvasWidth", "canvasHeight", "elements"],
      "properties": {
        "deviceType": { "type": "string", "enum": ["phone", "tablet", "desktop"] },
        "canvasWidth": { "type": "number" },
        "canvasHeight": { "type": "number" },
        "elements": {
          "type": "array",
          "description": "Form elements placed on this device layout canvas.",
          "items": { "$ref": "#/definitions/form_element" }
        }
      }
    },
    "form_element": {
      "type": "object",
      "required": ["type", "x", "y", "width", "height"],
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "button",
            "text",
            "textInput",
            "image",
            "header",
            "textarea",
            "checkbox",
            "radio",
            "video",
            "divider",
            "timer"
          ]
        },
        "x": { "type": "number" },
        "y": { "type": "number" },
        "width": { "type": "number" },
        "height": { "type": "number" },
        "zIndex": { "type": "number" },
        "label": { "type": "string" },
        "placeholder": { "type": "string" },
        "fieldName": { "type": "string", "description": "JSON key for captured value in step output." },
        "required": { "type": "boolean" },
        "outputParameter": { "type": "string", "description": "Value Property reference for runtime capture." },
        "fontSize": { "type": "number" },
        "content": {
          "description": "Text/header content as HTML string.",
          "type": "string"
        },
        "fontWeight": { "type": "string", "enum": ["normal", "bold"] },
        "color": { "type": "string" },
        "align": { "type": "string", "enum": ["left", "center", "right"] },
        "src": { "type": "string", "description": "Image filename or https URL (image), or video URL (video)." },
        "imageOid": { "type": "string", "description": "Stable Snowflake OID for ZIP namespace prefix." },
        "objectFit": { "type": "string", "enum": ["contain", "cover", "fill"] },
        "posterUrl": { "type": "string" },
        "outputValue": { "type": "string", "description": "Value emitted when button is tapped." },
        "deletable": { "type": "boolean" },
        "thickness": { "type": "number" },
        "rows": { "type": "integer" },
        "options": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["label", "value"],
            "properties": {
              "label": { "type": "string" },
              "value": { "type": "string" }
            }
          }
        },
        "defaultSource": {
          "type": "object",
          "required": ["mode", "value"],
          "properties": {
            "mode": { "type": "string", "enum": ["static", "property", "input"] },
            "value": { "type": "string" }
          }
        },
        "placeholderSource": {
          "type": "object",
          "required": ["mode", "value"],
          "properties": {
            "mode": { "type": "string", "enum": ["static", "property", "input"] },
            "value": { "type": "string" }
          }
        },
        "durationSeconds": { "type": "integer" },
        "direction": { "type": "string", "enum": ["countdown", "countup"] },
        "blockDone": { "type": "boolean" },
        "inputMode": {
          "type": "string",
          "enum": ["text", "number", "phone", "password", "dropdown", "combobox"]
        },
        "listItems": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["label", "value"],
            "properties": {
              "label": { "type": "string" },
              "value": { "type": "string" }
            }
          }
        },
        "listSource": {
          "type": "object",
          "required": ["mode"],
          "properties": {
            "mode": { "type": "string", "enum": ["static", "input"] },
            "value": { "type": "string" }
          }
        }
      }
    },
    "environment_specification": {
      "type": "object",
      "allOf": [{ "$ref": "managed-element.json" }],
      "required": ["included_actions"],
      "properties": {
        "library_name": { "type": "string", "description": "Environment library name for weak matching on import." },
        "included_actions": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["action_name", "action_library"],
            "properties": {
              "action_name": { "type": "string" },
              "action_library": { "type": "string" },
              "action_oid": { "type": "string" },
              "action_version": { "type": "string" },
              "action_last_modified_date": { "type": "string", "format": "date-time" },
              "input_parameter_specifications": {
                "type": "array",
                "items": { "$ref": "#/definitions/input_parameter" }
              },
              "output_parameter_specifications": {
                "type": "array",
                "items": { "$ref": "#/definitions/output_parameter" }
              },
              "property_specifications": { "type": "array", "items": { "$ref": "#/definitions/value_property" } }
            }
          }
        },
        "value_property_specifications": { "type": "array", "items": { "$ref": "#/definitions/value_property" } },
        "action_property_specifications": { "type": "array", "items": { "$ref": "#/definitions/value_property" } },
        "resource_property_specifications": { "type": "array", "items": { "$ref": "#/definitions/resource_property" } },
        "action_server_specifications": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["name", "uri", "connection_type"],
            "properties": {
              "name": { "type": "string" },
              "uri": { "type": "string" },
              "description": { "type": "string" },
              "connection_type": { "type": "string", "enum": ["REST"] }
            }
          }
        }
      }
    }
  }
}
```

---

## 3. Master Action Library

Contains action specifications with input/output parameters and property definitions.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://saturnis.io/schemas/master-action-library.json",
  "title": "Master Action Library",
  "description": "A collection of Master Action Specifications.",
  "allOf": [{ "$ref": "managed-element.json" }],
  "type": "object",
  "required": ["action_specifications"],
  "properties": {
    "action_specifications": {
      "type": "array",
      "description": "List of action specifications contained in the library.",
      "items": {
        "type": "object",
        "allOf": [{ "$ref": "managed-element.json" }],
        "properties": {
          "input_parameter_specifications": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["id", "default_value"],
              "properties": {
                "id": { "type": "string" },
                "oid": { "type": "string" },
                "description": { "type": "string" },
                "default_value": { "type": "string" },
                "json_schema": { "type": "string" },
                "value_type": { "type": "string", "enum": ["literal", "property"] },
                "entries": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "required": ["name", "value"],
                    "properties": {
                      "name": { "type": "string" },
                      "value": { "type": "string" }
                    }
                  }
                }
              }
            }
          },
          "output_parameter_specifications": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["id"],
              "properties": {
                "id": { "type": "string" },
                "oid": { "type": "string" },
                "description": { "type": "string" },
                "target": { "type": "string" },
                "entries": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "required": ["name", "value"],
                    "properties": {
                      "name": { "type": "string" },
                      "value": { "type": "string" }
                    }
                  }
                }
              }
            }
          },
          "action_visibility": {
            "type": "string",
            "enum": ["opaque", "observable"]
          },
          "property_specifications": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["name"],
              "properties": {
                "name": { "type": "string" },
                "oid": { "type": "string" },
                "entries": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "required": ["name", "value"],
                    "properties": {
                      "name": { "type": "string" },
                      "value": { "type": "string" }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "child_libraries": {
      "type": "array",
      "description": "Nested child libraries.",
      "items": { "$ref": "#" }
    }
  }
}
```

---

## 4. Master Environment Library

Contains environment specifications with included actions, values, resources, and action servers.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://saturnis.io/schemas/master-environment-library.json",
  "title": "Master Environment Library",
  "description": "A collection of Master Environment Specifications.",
  "allOf": [{ "$ref": "managed-element.json" }],
  "type": "object",
  "required": ["environment_specifications"],
  "properties": {
    "environment_specifications": {
      "type": "array",
      "items": {
        "type": "object",
        "allOf": [{ "$ref": "managed-element.json" }],
        "required": ["included_actions"],
        "properties": {
          "included_actions": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["action_name", "action_library"],
              "properties": {
                "action_name": { "type": "string" },
                "action_library": { "type": "string" },
                "action_oid": { "type": "string" },
                "action_version": { "type": "string" },
                "action_last_modified_date": { "type": "string", "format": "date-time" },
                "input_parameter_specifications": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "required": ["id", "default_value"],
                    "properties": {
                      "id": { "type": "string" },
                      "oid": { "type": "string" },
                      "description": { "type": "string" },
                      "default_value": { "type": "string" },
                      "json_schema": { "type": "string" },
                      "value_type": { "type": "string", "enum": ["literal", "property"] },
                      "entries": {
                        "type": "array",
                        "items": {
                          "type": "object",
                          "required": ["name", "value"],
                          "properties": {
                            "name": { "type": "string" },
                            "value": { "type": "string" }
                          }
                        }
                      }
                    }
                  }
                },
                "output_parameter_specifications": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "required": ["id"],
                    "properties": {
                      "id": { "type": "string" },
                      "oid": { "type": "string" },
                      "description": { "type": "string" },
                      "target": { "type": "string" },
                      "entries": {
                        "type": "array",
                        "items": {
                          "type": "object",
                          "required": ["name", "value"],
                          "properties": {
                            "name": { "type": "string" },
                            "value": { "type": "string" }
                          }
                        }
                      }
                    }
                  }
                },
                "property_specifications": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "required": ["name"],
                    "properties": {
                      "name": { "type": "string" },
                      "oid": { "type": "string" },
                      "entries": {
                        "type": "array",
                        "items": {
                          "type": "object",
                          "required": ["name", "value"],
                          "properties": {
                            "name": { "type": "string" },
                            "value": { "type": "string" }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          "value_property_specifications": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["name"],
              "properties": {
                "name": { "type": "string" },
                "oid": { "type": "string" },
                "entries": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "required": ["name", "value"],
                    "properties": {
                      "name": { "type": "string" },
                      "value": { "type": "string" }
                    }
                  }
                }
              }
            }
          },
          "action_property_specifications": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["name"],
              "properties": {
                "name": { "type": "string" },
                "oid": { "type": "string" },
                "entries": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "required": ["name", "value"],
                    "properties": {
                      "name": { "type": "string" },
                      "value": { "type": "string" }
                    }
                  }
                }
              }
            }
          },
          "resource_property_specifications": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["name", "resource_type"],
              "properties": {
                "name": { "type": "string" },
                "resource_type": {
                  "type": "string",
                  "enum": [
                    "binary exclusive use",
                    "binary shared use with pool limits",
                    "countable use with pool limits",
                    "named pool",
                    "sync"
                  ]
                },
                "use_limit": { "type": "integer" },
                "description": { "type": "string" },
                "names": { "type": "array", "items": { "type": "string" } }
              }
            }
          },
          "action_server_specifications": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["name", "uri", "connection_type"],
              "properties": {
                "name": { "type": "string" },
                "uri": { "type": "string" },
                "description": { "type": "string" },
                "connection_type": { "type": "string", "enum": ["REST"] }
              }
            }
          }
        }
      }
    },
    "child_libraries": {
      "type": "array",
      "description": "Nested child libraries.",
      "items": { "$ref": "#" }
    }
  }
}
```

---

## 5. Master Workflow Step Library

Contains reusable sub-workflow specifications. Uses the same `workflow_specifications` format as the Workflow Library.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://saturnis.io/schemas/master-workflow-step-library.json",
  "title": "Master Workflow Step Library",
  "description": "A collection of workflow specifications in a step library.",
  "allOf": [{ "$ref": "managed-element.json" }],
  "type": "object",
  "required": ["workflow_specifications"],
  "properties": {
    "workflow_specifications": {
      "type": "array",
      "description": "The list of workflow specifications within this step library.",
      "items": {
        "type": "object",
        "allOf": [{ "$ref": "managed-element.json" }],
        "required": ["steps", "connections"]
      }
    },
    "child_libraries": {
      "type": "array",
      "description": "Nested child step libraries.",
      "items": { "$ref": "#" }
    }
  }
}
```

---

## Schema Relationships

```
managed-element.json (base)
  ├── master-workflow-library.json
  │     └── workflow_specifications[].steps[]        → step definition
  │     └── workflow_specifications[].connections[]  → connection definition
  │     └── workflow_specifications[].children[]     → ChildWorkflowExport (v7.0+, preferred)
  │     └── workflow_specifications[].child_workflows[] → DEPRECATED, pre-v7.0 fallback
  │     └── workflow_specifications[].environment_specifications[] → embedded environments
  ├── master-action-library.json
  │     └── action_specifications[] → inputs, outputs, properties
  ├── master-environment-library.json
  │     └── environment_specifications[] → actions, values, resources, servers
  └── master-workflow-step-library.json
        └── workflow_specifications[] → same format as workflow library
```

---

## Validation Notes

1. **Schema version**: Root exports must include `"schemaVersion"`. Accepted values are `"3.0"` and `"4.0"`; `"4.0"` is the current format (v7.0 packages). Packages with `"2.0"` or below are rejected; see `src/server/packageFormat/parseEnvelope.ts`.
2. **Required fields**: `managed-element` requires `local_id`, `oid`, `version`, `last_modified_date` on all entities.
3. **Snowflake IDs**: All `oid`, `id`, and `image_oid` fields contain Snowflake IDs (64-bit numeric strings).
4. **Form element types**: The `type` discriminant on form elements is a permanent key — never rename after deployment.
5. **Step types**: The `step_type` enum uses UPPER_CASE with spaces (export format). Internal representation uses camelCase node types.
6. **`children` vs `child_workflows` (v7.0 rule)**: When both arrays are present on a workflow spec, the Runtime Engine MUST use `children` (v7.0+ `ChildWorkflowExport` entries with `parentChildSpecId`/`version`/`state`) and ignore `child_workflows` (retained only for pre-v7.0 package compatibility). See `docs/v7.0-package-format-changes.md` for full migration details.
7. **Root `version`/`state` defaults**: Optional on root specs. Runtime MUST default missing `version` to `"1.0.0"` and missing `state` to `"Draft"`. On child exports (`#/definitions/child_workflow`) both fields are REQUIRED.
