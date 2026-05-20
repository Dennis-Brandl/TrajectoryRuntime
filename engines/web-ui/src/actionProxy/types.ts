// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.

export type ServerState =
  | 'IDLE'
  | 'RUNNING'
  | 'PAUSED'
  | 'HELD'
  | 'COMPLETED'
  | 'ABORTED'
  | 'STOPPED'
  | 'ERRORED';

export type ActionCommand =
  | 'PAUSE'
  | 'RESUME'
  | 'HOLD'
  | 'UNHOLD'
  | 'ABORT'
  | 'STOP'
  | 'CLEAR';

export type Visibility = 'opaque' | 'observable';

export interface ActionCapability {
  action_oid: string;
  environment_oid: string;
  local_id: string;
  version: string;
  description: string | null;
  visibility: Visibility;
  supported_commands: ActionCommand[];
}

export interface ActionEventStateChange {
  kind: 'state_change';
  state: ServerState;
  previous_state: ServerState | null;
  ts: string;
  eventId: number;
}

export interface ActionEventOutput {
  kind: 'output';
  outputs: Array<{ name: string; value: string }>;
  ts: string;
  eventId: number;
}

export interface ActionEventLog {
  kind: 'log';
  stream: 'stdout' | 'stderr';
  message: string;
  ts: string;
  eventId: number;
}

export interface ActionEventHeartbeat {
  kind: 'heartbeat';
  ts: string;
}

export type ActionEvent =
  | ActionEventStateChange
  | ActionEventOutput
  | ActionEventLog
  | ActionEventHeartbeat;

export interface InstanceSnapshot {
  instance_id: string;
  action_oid: string;
  environment_oid: string;
  workflow_instance_id: string;
  step_instance_id: string;
  step_oid: string;
  visibility: Visibility;
  state: { current: ServerState; previous: ServerState | null; entered_at: string };
  inputs: Array<{ name: string; value: string }>;
  outputs: Array<{ name: string; value: string }>;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
}

export interface InvokeRequest {
  environment_oid: string;
  workflow_instance_id: string;
  step_instance_id: string;
  step_oid: string;
  input_parameters: Array<{ name: string; value: string }>;
  timeout_ms?: number;
}

export interface ActionApiError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;
}

export interface ActionInstanceObserver {
  subscribe(
    serverUri: string,
    instanceId: string,
    onEvent: (e: ActionEvent) => void,
    fromEventId?: number,
  ): () => void;
}
