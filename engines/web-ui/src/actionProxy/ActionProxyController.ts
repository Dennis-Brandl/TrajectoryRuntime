// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { ActionApiClient } from './ActionApiClient.js';
import { mapServerStateToEngineState } from './stateMapping.js';
import type { PersistenceStore } from './persistence.js';
import { retryTransport } from './retry.js';
import type {
  ActionCommand,
  ActionEvent,
  ActionInstanceObserver,
  InvokeRequest,
  ServerState,
  Visibility,
} from './types.js';

export interface ControllerConfig {
  serverUri: string;
  actionOid: string;
  invokeRequest: InvokeRequest;
  visibility: Visibility;
  supportedCommands: ActionCommand[];
  persistence: PersistenceStore;
  observer: ActionInstanceObserver;
  fetchImpl?: typeof fetch;
  onTerminal: (t: { state: 'COMPLETED' | 'ERRORED'; outputs: Record<string, string>; errorMessage: string | null }) => void;
}

export interface ControllerSnapshot {
  instanceId: string | null;
  serverState: ServerState | null;
  inputs: Array<{ name: string; value: string }>;
  outputs: Record<string, string>;
  logs: Array<{ stream: 'stdout' | 'stderr'; message: string; ts: string }>;
  commandInFlight: ActionCommand | null;
  visibility: Visibility;
  supportedCommands: ActionCommand[];
}

const TERMINAL_SERVER_STATES: readonly ServerState[] = ['COMPLETED', 'ABORTED', 'STOPPED', 'ERRORED'];

export class ActionProxyController {
  private api: ActionApiClient;
  private snapshot: ControllerSnapshot;
  private unsubscribe: (() => void) | null = null;
  private listeners = new Set<() => void>();
  private outputs = new Map<string, string>();
  private lastEventId: number | null = null;
  private terminalEmitted = false;

  constructor(private cfg: ControllerConfig) {
    this.api = new ActionApiClient(cfg.fetchImpl ?? fetch);
    this.snapshot = {
      instanceId: null,
      serverState: null,
      inputs: cfg.invokeRequest.input_parameters,
      outputs: {},
      logs: [],
      commandInFlight: null,
      visibility: cfg.visibility,
      supportedCommands: cfg.supportedCommands,
    };
  }

  getSnapshot = (): ControllerSnapshot => this.snapshot;

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  async start(): Promise<void> {
    const { instance_id } = await retryTransport(
      () => this.api.invoke(this.cfg.serverUri, this.cfg.actionOid, this.cfg.invokeRequest),
      { onAttempt: n => { if (n > 1) console.log(`[ActionProxy] invoke retry attempt ${n}`); } },
    );
    this.setSnapshot({ ...this.snapshot, instanceId: instance_id, serverState: 'IDLE' });
    this.cfg.persistence.upsert({
      workflowInstanceId: this.cfg.invokeRequest.workflow_instance_id,
      stepInstanceId: this.cfg.invokeRequest.step_instance_id,
      stepOid: this.cfg.invokeRequest.step_oid,
      instanceId: instance_id,
      serverUri: this.cfg.serverUri,
      environmentOid: this.cfg.invokeRequest.environment_oid,
      lastKnownServerState: 'IDLE',
      lastEventId: null,
    });
    this.unsubscribe = this.cfg.observer.subscribe(this.cfg.serverUri, instance_id, e => this.onEvent(e));
  }

  async reconnect(instanceId: string, fromEventId: number | null): Promise<void> {
    this.setSnapshot({ ...this.snapshot, instanceId });
    try {
      const snap = await this.api.getInstance(this.cfg.serverUri, instanceId);
      this.applyServerState(snap.state.current);
      for (const o of snap.outputs) this.outputs.set(o.name, o.value);
      this.setSnapshot({ ...this.snapshot, outputs: Object.fromEntries(this.outputs) });
      if (TERMINAL_SERVER_STATES.includes(snap.state.current)) {
        this.emitTerminal(snap.state.current, snap.error);
        return;
      }
    } catch (e) {
      const code = (e as { code?: string; status?: number }).code;
      if (code === 'INSTANCE_NOT_FOUND' || (e as { status?: number }).status === 404) {
        this.emitTerminal('ERRORED', 'Instance lost on server');
        return;
      }
    }
    this.lastEventId = fromEventId;
    this.unsubscribe = this.cfg.observer.subscribe(this.cfg.serverUri, instanceId, e => this.onEvent(e));
  }

  async sendCommand(command: ActionCommand): Promise<void> {
    if (!this.snapshot.instanceId) throw new Error('no instance');
    this.setSnapshot({ ...this.snapshot, commandInFlight: command });
    try {
      await this.api.sendCommand(this.cfg.serverUri, this.snapshot.instanceId, command);
    } finally {
      this.setSnapshot({ ...this.snapshot, commandInFlight: null });
    }
  }

  dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  private onEvent(e: ActionEvent): void {
    if (e.kind === 'state_change') {
      this.applyServerState(e.state);
      this.lastEventId = e.eventId;
      this.persistLastEvent();
      if (TERMINAL_SERVER_STATES.includes(e.state)) {
        this.emitTerminal(e.state, null);
      }
    } else if (e.kind === 'output') {
      for (const o of e.outputs) this.outputs.set(o.name, o.value);
      this.setSnapshot({ ...this.snapshot, outputs: Object.fromEntries(this.outputs) });
      this.lastEventId = e.eventId;
      this.persistLastEvent();
    } else if (e.kind === 'log') {
      const next = [...this.snapshot.logs, { stream: e.stream, message: e.message, ts: e.ts }].slice(-100);
      this.setSnapshot({ ...this.snapshot, logs: next });
    }
  }

  private applyServerState(s: ServerState): void {
    this.setSnapshot({ ...this.snapshot, serverState: s });
  }

  private persistLastEvent(): void {
    if (!this.snapshot.instanceId) return;
    this.cfg.persistence.upsert({
      workflowInstanceId: this.cfg.invokeRequest.workflow_instance_id,
      stepInstanceId: this.cfg.invokeRequest.step_instance_id,
      stepOid: this.cfg.invokeRequest.step_oid,
      instanceId: this.snapshot.instanceId,
      serverUri: this.cfg.serverUri,
      environmentOid: this.cfg.invokeRequest.environment_oid,
      lastKnownServerState: this.snapshot.serverState ?? 'IDLE',
      lastEventId: this.lastEventId,
    });
  }

  private emitTerminal(state: ServerState, errorMessage: string | null): void {
    if (this.terminalEmitted) return;
    this.terminalEmitted = true;
    this.dispose();
    const engineState = mapServerStateToEngineState(state);
    this.cfg.persistence.remove(this.cfg.invokeRequest.step_instance_id);
    this.cfg.persistence.flushSync();
    this.cfg.onTerminal({
      state: engineState === 'COMPLETED' ? 'COMPLETED' : 'ERRORED',
      outputs: Object.fromEntries(this.outputs),
      errorMessage,
    });
  }

  private setSnapshot(next: ControllerSnapshot): void {
    this.snapshot = next;
    for (const l of this.listeners) l();
  }
}
