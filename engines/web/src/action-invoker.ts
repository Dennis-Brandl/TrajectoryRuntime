// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import type { StepState } from './types.js';

export type ActionServerCommand = 'PAUSE' | 'RESUME' | 'HOLD' | 'UNHOLD' | 'STOP' | 'ABORT' | 'CLEAR';
export type ConnectionMode = 'sse-preferred' | 'poll-only';

export interface ServerCapabilities {
  sse_supported: boolean;
  actions: Map<string, { visibility: 'observable' | 'opaque' }>;
}

export interface InvokeRequest {
  stepOid: string;
  workflow_instance_id: string;
  environment_oid: string;
  step_instance_id: string;
  step_oid: string;
  serverUri: string;
  action_oid: string;
  inputs: Record<string, string>;
  mode: ConnectionMode;
  pollIntervalMs: number;
}

export interface ActionInvokerCallbacks {
  /** Called whenever the Action Container reports a state change. */
  onStateChange: (stepOid: string, newState: StepState, outputs?: Record<string, string>) => void;
  /** Called when connectivity status changes (network up/down). */
  onConnectivityChange: (stepOid: string, status: 'ok' | 'reconnecting' | 'never_connected') => void;
}

export interface ActionInvoker {
  /** GET /capabilities. Called once per server at workflow start. */
  probeCapabilities(serverUri: string): Promise<ServerCapabilities>;

  /** Start a new action invocation. Resolves to the runtime_action_instance_id from the 201 response. */
  invoke(req: InvokeRequest, callbacks: ActionInvokerCallbacks): Promise<string>;

  /** POST /command. Best-effort, retries on net errors, ignores 409. */
  sendCommand(serverUri: string, instanceId: string, command: ActionServerCommand): Promise<void>;

  /** DELETE /instances/{id}. Best-effort. */
  abort(serverUri: string, instanceId: string): Promise<void>;

  /** Stop polling/SSE for a step. Used when the engine is shutting down a step locally. */
  release(stepOid: string): void;
}
