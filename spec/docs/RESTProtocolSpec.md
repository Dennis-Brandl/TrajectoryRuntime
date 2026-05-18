# Trajectory Mobile — REST Action Protocol Specification

## Overview

This document specifies the complete REST-based protocol for communication between Trajectory Mobile (the client) and Environment Action Servers. The protocol follows ISA-88 batch control semantics and supports both opaque (fire-and-forget) and observable (full state visibility) action execution patterns.

---

## 1. Protocol Basics

### 1.1 Base URL

Each Environment Specification is bound to an action server at a specific base URL:

```
{action_server_base_url}/trajectory/v1/
```

Example: `https://factory-floor.example.com/trajectory/v1/`

### 1.2 Content Type

All requests and responses use JSON:
- Request: `Content-Type: application/json`
- Response: `Content-Type: application/json`
- SSE streams: `Content-Type: text/event-stream`

### 1.3 Authentication (Future)

v1.0 uses no authentication. Future versions will support:
- Bearer token authentication
- API key authentication
- OAuth2 client credentials flow

The protocol reserves the `Authorization` header for future use.

### 1.4 Error Response Format

All error responses follow this structure:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error description",
    "details": {}
  }
}
```

Standard error codes:
| HTTP Status | Error Code | Description |
|------------|-----------|-------------|
| 400 | `INVALID_REQUEST` | Malformed request body or missing required fields |
| 404 | `ACTION_NOT_FOUND` | Action OID not recognized by this server |
| 404 | `INSTANCE_NOT_FOUND` | Runtime action instance ID not found |
| 409 | `INVALID_STATE_TRANSITION` | Command not valid for current action state |
| 422 | `PARAMETER_VALIDATION_FAILED` | Input parameters failed validation |
| 503 | `SERVER_UNAVAILABLE` | Action server temporarily unavailable |

---

## 2. Endpoints

### 2.1 Health Check

Check if the action server is operational.

```
GET /trajectory/v1/health
```

**Response 200:**
```json
{
  "status": "healthy",
  "server_name": "Factory Floor Action Server",
  "server_version": "1.0.0",
  "protocol_version": "1.0",
  "timestamp": "2026-02-24T10:30:00Z"
}
```

---

### 2.2 Discover Capabilities

Discover which actions this server supports and their parameter schemas.

```
GET /trajectory/v1/capabilities
```

**Response 200:**
```json
{
  "actions": [
    {
      "action_oid": "act-001-snowflake",
      "action_name": "Heat Oven",
      "action_version": "1.0.0",
      "visibility_support": ["opaque", "observable"],
      "input_parameters": [
        {
          "name": "target_temperature",
          "type": "number",
          "required": true,
          "description": "Target temperature in Celsius"
        }
      ],
      "output_parameters": [
        {
          "name": "actual_temperature",
          "type": "number",
          "description": "Measured temperature after action completes"
        }
      ],
      "supported_commands": ["PAUSE", "RESUME", "HOLD", "UNHOLD", "ABORT", "STOP", "CLEAR"]
    }
  ],
  "max_concurrent_instances": 50,
  "sse_supported": true
}
```

---

### 2.3 Invoke Action

Start a new Runtime Action Instance on the action server.

```
POST /trajectory/v1/actions/{action_oid}/invoke
```

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `action_oid` | string | The Master Action Specification OID |

**Request Body:**
```json
{
  "workflow_instance_id": "wf-runtime-uuid",
  "step_instance_id": "step-runtime-uuid",
  "step_oid": "step-master-oid",
  "visibility": "observable",
  "input_parameters": [
    {
      "name": "target_temperature",
      "value": "200",
      "value_type": "literal"
    },
    {
      "name": "recipe_name",
      "value": "Bolognese Sauce",
      "value_type": "literal"
    }
  ],
  "resource_context": {
    "acquired_resources": [
      {
        "resource_name": "Oven",
        "resource_type": "binary exclusive use"
      }
    ]
  },
  "offline_queued_at": null
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `workflow_instance_id` | string | Yes | ID of the requesting Runtime Workflow |
| `step_instance_id` | string | Yes | ID of the requesting Runtime Workflow Step |
| `step_oid` | string | Yes | OID of the Master Workflow Step |
| `visibility` | string | Yes | `"opaque"` or `"observable"` |
| `input_parameters` | array | Yes | Resolved input parameters for the action |
| `resource_context` | object | No | Resources already acquired by the requesting step |
| `offline_queued_at` | string\|null | No | ISO 8601 timestamp if this request was queued offline. Null if sent in real-time. |

**Response 201 (Created):**
```json
{
  "runtime_action_instance_id": "rai-server-generated-uuid",
  "action_oid": "act-001-snowflake",
  "status": "STARTING",
  "created_at": "2026-02-24T10:31:00Z",
  "sse_endpoint": "/trajectory/v1/instances/rai-server-generated-uuid/events"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `runtime_action_instance_id` | string | Server-generated unique instance ID |
| `action_oid` | string | Echo of the action OID |
| `status` | string | Initial status: `"POSTED"` (opaque) or `"STARTING"` (observable) |
| `created_at` | string | ISO 8601 timestamp |
| `sse_endpoint` | string | Relative SSE endpoint path (observable only) |

---

### 2.4 Get Action Instance Status

Poll the current status of a Runtime Action Instance.

```
GET /trajectory/v1/instances/{runtime_action_instance_id}
```

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `runtime_action_instance_id` | string | Server-generated instance ID from invoke response |

**Response 200:**
```json
{
  "runtime_action_instance_id": "rai-server-generated-uuid",
  "action_oid": "act-001-snowflake",
  "workflow_instance_id": "wf-runtime-uuid",
  "step_instance_id": "step-runtime-uuid",
  "visibility": "observable",
  "status": "EXECUTING",
  "state_history": [
    {
      "from_state": null,
      "to_state": "STARTING",
      "timestamp": "2026-02-24T10:31:00Z",
      "triggered_by": "engine"
    },
    {
      "from_state": "STARTING",
      "to_state": "EXECUTING",
      "timestamp": "2026-02-24T10:31:02Z",
      "triggered_by": "engine"
    }
  ],
  "output_parameters": [],
  "created_at": "2026-02-24T10:31:00Z",
  "updated_at": "2026-02-24T10:31:02Z"
}
```

For completed actions, `output_parameters` is populated:
```json
{
  "status": "COMPLETED",
  "output_parameters": [
    {
      "name": "actual_temperature",
      "value": "198.5"
    }
  ],
  "completed_at": "2026-02-24T10:35:00Z"
}
```

---

### 2.5 Send State Command

Send a state transition command to a Runtime Action Instance.

```
POST /trajectory/v1/instances/{runtime_action_instance_id}/command
```

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `runtime_action_instance_id` | string | Server-generated instance ID |

**Request Body:**
```json
{
  "command": "PAUSE",
  "issued_by": "user",
  "reason": "Operator requested pause for inspection",
  "timestamp": "2026-02-24T10:33:00Z"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `command` | string | Yes | One of: `PAUSE`, `RESUME`, `HOLD`, `UNHOLD`, `ABORT`, `STOP`, `CLEAR` |
| `issued_by` | string | Yes | `"user"` or `"engine"` |
| `reason` | string | No | Human-readable reason for the command |
| `timestamp` | string | Yes | ISO 8601 timestamp when command was issued |

**Valid commands by current state:**

| Current State | Valid Commands |
|--------------|---------------|
| STARTING | ABORT, STOP |
| EXECUTING | PAUSE, HOLD, ABORT, STOP |
| COMPLETING | ABORT, STOP |
| PAUSED | RESUME, ABORT, STOP |
| HELD | UNHOLD, ABORT, STOP |
| ABORTED | CLEAR |
| POSTED | ABORT, STOP |
| RECEIVED | ABORT, STOP |
| IN_PROGRESS | ABORT, STOP |

**Response 200 (Command Accepted):**
```json
{
  "runtime_action_instance_id": "rai-server-generated-uuid",
  "command": "PAUSE",
  "accepted": true,
  "new_status": "PAUSING",
  "timestamp": "2026-02-24T10:33:01Z"
}
```

**Response 409 (Invalid Transition):**
```json
{
  "error": {
    "code": "INVALID_STATE_TRANSITION",
    "message": "Cannot PAUSE from state HELD",
    "details": {
      "current_state": "HELD",
      "requested_command": "PAUSE",
      "valid_commands": ["UNHOLD", "ABORT", "STOP"]
    }
  }
}
```

---

### 2.6 SSE Event Stream (Observable Actions)

Subscribe to real-time state change events for an observable action instance.

```
GET /trajectory/v1/instances/{runtime_action_instance_id}/events
```

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `runtime_action_instance_id` | string | Server-generated instance ID |

**Request Headers:**
| Header | Value | Description |
|--------|-------|-------------|
| `Accept` | `text/event-stream` | Required for SSE |
| `Last-Event-ID` | string | Optional. Resume from last received event (for reconnection) |

**Response 200 (SSE Stream):**

The server sends events as they occur. Each event has an `id` for reconnection support.

#### Event Types

**state_change** — A state transition occurred:
```
id: evt-001
event: state_change
data: {"runtime_action_instance_id":"rai-uuid","from_state":"STARTING","to_state":"EXECUTING","triggered_by":"engine","timestamp":"2026-02-24T10:31:02Z"}
```

**output** — Output parameters are available (partial or final):
```
id: evt-002
event: output
data: {"runtime_action_instance_id":"rai-uuid","parameters":[{"name":"actual_temperature","value":"198.5"}],"is_final":true,"timestamp":"2026-02-24T10:35:00Z"}
```

**hold_request** — Action server is requesting a hold:
```
id: evt-003
event: hold_request
data: {"runtime_action_instance_id":"rai-uuid","reason":"Waiting for external sensor calibration","timestamp":"2026-02-24T10:32:00Z"}
```

**progress** — Action execution progress update:
```
id: evt-004
event: progress
data: {"runtime_action_instance_id":"rai-uuid","percent_complete":75,"message":"Heating to target temperature...","timestamp":"2026-02-24T10:33:00Z"}
```

**error** — An error occurred during action execution:
```
id: evt-005
event: error
data: {"runtime_action_instance_id":"rai-uuid","error_code":"SENSOR_FAILURE","message":"Temperature sensor not responding","recoverable":true,"timestamp":"2026-02-24T10:34:00Z"}
```

**heartbeat** — Keep-alive (sent every 30 seconds if no other events):
```
id: evt-006
event: heartbeat
data: {"timestamp":"2026-02-24T10:35:30Z"}
```

---

### 2.7 List Active Instances

List all active Runtime Action Instances on this server (optionally filtered).

```
GET /trajectory/v1/instances?workflow_instance_id={id}&status={status}
```

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workflow_instance_id` | string | No | Filter by requesting workflow |
| `status` | string | No | Filter by current status |
| `action_oid` | string | No | Filter by action type |

**Response 200:**
```json
{
  "instances": [
    {
      "runtime_action_instance_id": "rai-uuid-1",
      "action_oid": "act-001",
      "status": "EXECUTING",
      "workflow_instance_id": "wf-uuid",
      "step_instance_id": "step-uuid",
      "created_at": "2026-02-24T10:31:00Z"
    }
  ],
  "total_count": 1
}
```

---

### 2.8 Cancel Action Instance

Forcefully terminate an action instance (used during workflow abort/stop or cleanup).

```
DELETE /trajectory/v1/instances/{runtime_action_instance_id}
```

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `reason` | string | No | Reason for cancellation |

**Response 200:**
```json
{
  "runtime_action_instance_id": "rai-uuid",
  "status": "ABORTED",
  "cancelled_at": "2026-02-24T10:36:00Z"
}
```

---

## 3. Opaque Action Flow

```
Mobile App                          Action Server
    │                                    │
    ├── POST /actions/{oid}/invoke ────► │
    │                                    ├── Creates Runtime Action Instance
    │ ◄── 201 { instance_id, "POSTED" }──┤
    │                                    │
    │── GET /instances/{id} ───────────► │
    │ ◄── 200 { status: "RECEIVED" } ───┤
    │                                    │
    │── GET /instances/{id} ───────────► │  (polling)
    │ ◄── 200 { status: "IN_PROGRESS" }─┤
    │                                    │
    │── GET /instances/{id} ───────────► │  (polling)
    │ ◄── 200 { status: "COMPLETED",  ──┤
    │         output_parameters: [...] } │
    │                                    │
```

**Polling interval**: Start at 1 second, increase with exponential backoff up to 30 seconds.

---

## 4. Observable Action Flow

```
Mobile App                          Action Server
    │                                    │
    ├── POST /actions/{oid}/invoke ────► │
    │                                    ├── Creates Runtime Action Instance
    │ ◄── 201 { instance_id,           ──┤
    │         "STARTING",                │
    │         sse_endpoint }             │
    │                                    │
    ├── GET /instances/{id}/events ────► │  (SSE connection opened)
    │                                    │
    │ ◄── event: state_change           ─┤  STARTING → EXECUTING
    │     data: { to: "EXECUTING" }      │
    │                                    │
    │ ◄── event: progress               ─┤
    │     data: { percent: 50 }          │
    │                                    │
    │ ◄── event: hold_request           ─┤  Action server needs hold
    │     data: { reason: "..." }        │
    │                                    │
    │ ◄── event: state_change           ─┤  EXECUTING → HOLDING → HELD
    │     data: { to: "HELD" }           │
    │                                    │
    │── POST /instances/{id}/command ──► │  User/engine sends UNHOLD
    │   { command: "UNHOLD" }            │
    │                                    │
    │ ◄── event: state_change           ─┤  HELD → UNHOLDING → EXECUTING
    │     data: { to: "EXECUTING" }      │
    │                                    │
    │ ◄── event: state_change           ─┤  EXECUTING → COMPLETING
    │     data: { to: "COMPLETING" }     │
    │                                    │
    │ ◄── event: output                 ─┤  Output parameters delivered
    │     data: { parameters: [...] }    │
    │                                    │
    │ ◄── event: state_change           ─┤  COMPLETING → COMPLETED
    │     data: { to: "COMPLETED" }      │
    │                                    │
    │   (SSE connection closed)          │
```

---

## 5. Offline Queue Protocol

When the mobile app is offline and an action needs to be invoked:

1. The invoke request is serialized and stored in the local `offline_action_queue` table
2. The step state is set to:
   - **POSTED** for opaque actions
   - **WAITING** for observable actions
3. When connectivity is restored:
   - Queue is replayed in FIFO order
   - Each request includes `offline_queued_at` with the original queue timestamp
   - Action server can use this for reconciliation (e.g., reject stale requests)
4. If replay fails:
   - Retry up to 3 times with exponential backoff
   - If still failing, step transitions to HELD with reason "Action server rejected offline request"
   - User is notified and can manually retry or abort

---

## 6. SSE Reconnection Protocol

When the SSE connection drops:

1. Client waits 1 second, then reconnects with `Last-Event-ID` header
2. Server replays all events after the last received event ID
3. If reconnection fails, exponential backoff up to 30 seconds
4. After 5 minutes of failed reconnection, fall back to polling mode
5. On reconnect success, switch back to SSE mode

---

## 7. Action Server Implementation Guide

Action servers must implement these minimum endpoints to be compatible:

### Required Endpoints
- `GET /trajectory/v1/health`
- `POST /trajectory/v1/actions/{action_oid}/invoke`
- `GET /trajectory/v1/instances/{runtime_action_instance_id}`

### Required for Observable Actions
- `GET /trajectory/v1/instances/{runtime_action_instance_id}/events` (SSE)
- `POST /trajectory/v1/instances/{runtime_action_instance_id}/command`

### Optional Endpoints
- `GET /trajectory/v1/capabilities`
- `GET /trajectory/v1/instances` (list)
- `DELETE /trajectory/v1/instances/{runtime_action_instance_id}` (cancel)

### Action Server State Machine

The action server MUST implement the same state machine as defined in `StateMachineSpec.md`. State transitions reported via SSE events must be valid according to the transition table.

### Concurrency Requirements

The action server MUST support multiple concurrent Runtime Action Instances. Each instance is independently managed with its own state machine. The `runtime_action_instance_id` is the primary key for all instance operations.

---

## 8. Protocol Versioning

The protocol version is included in the URL path (`/v1/`). Future versions will use `/v2/`, `/v3/`, etc.

The `GET /health` response includes `protocol_version` for client compatibility checking. Clients should verify the protocol version on first connection and warn if mismatched.
