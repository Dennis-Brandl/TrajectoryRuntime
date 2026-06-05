// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.

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

export type LifecycleState =
  | 'Draft'
  | 'InTest'
  | 'InReview'
  | 'Approved'
  | 'Effective'
  | 'Superseded'
  | 'Obsolete';

export interface NormalizedParameterSpec {
  name: string;
  type?: string;
  description?: string | null;
  required?: boolean;
}

export interface ActionCapability {
  action_oid: string;
  action_name: string;
  action_state: LifecycleState;
  local_id: string;
  version: string;
  description: string | null;
  visibility: Visibility;
  input_parameters: NormalizedParameterSpec[];
  output_parameters: NormalizedParameterSpec[];
  supported_commands: ActionCommand[];
}

export interface EnvironmentCapability {
  environment_oid: string;
  environment_name: string;
  environment_state: LifecycleState;
  action_properties: Array<{
    name: string;
    oid?: string;
    description?: string;
    entries: Array<{ name: string; value: string }>;
  }>;
  actions: ActionCapability[];
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
