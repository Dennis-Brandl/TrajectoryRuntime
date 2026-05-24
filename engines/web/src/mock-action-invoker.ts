// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import type {
  ActionInvoker,
  ActionInvokerCallbacks,
  ActionServerCommand,
  InvokeRequest,
  ServerCapabilities,
} from './action-invoker.js';
import type { StepState } from './types.js';

interface RecordedInvoke {
  req: InvokeRequest;
  callbacks: ActionInvokerCallbacks;
  instanceId: string;
  released: boolean;
}

/**
 * Manually-driven mock invoker used by engine tests.
 * Tests call .emitStateChange(stepOid, state, outputs?) to drive lifecycle.
 */
export class MockActionInvoker implements ActionInvoker {
  capabilities: Map<string, ServerCapabilities> = new Map();
  invocations: RecordedInvoke[] = [];
  commandsSent: { serverUri: string; instanceId: string; command: ActionServerCommand }[] = [];
  aborts: { serverUri: string; instanceId: string }[] = [];
  releases: string[] = [];
  private nextInstanceCounter = 1;

  setCapabilities(uri: string, caps: ServerCapabilities): void {
    this.capabilities.set(uri, caps);
  }

  async probeCapabilities(serverUri: string): Promise<ServerCapabilities> {
    return this.capabilities.get(serverUri) ?? { sse_supported: false, actions: new Map() };
  }

  async invoke(req: InvokeRequest, callbacks: ActionInvokerCallbacks): Promise<string> {
    const instanceId = `mock-instance-${this.nextInstanceCounter++}`;
    this.invocations.push({ req, callbacks, instanceId, released: false });
    return instanceId;
  }

  async sendCommand(serverUri: string, instanceId: string, command: ActionServerCommand): Promise<void> {
    this.commandsSent.push({ serverUri, instanceId, command });
  }

  async abort(serverUri: string, instanceId: string): Promise<void> {
    this.aborts.push({ serverUri, instanceId });
  }

  release(stepOid: string): void {
    this.releases.push(stepOid);
    for (const inv of this.invocations) {
      if (inv.req.stepOid === stepOid) inv.released = true;
    }
  }

  // ── Test helpers ──

  /** Drive a state change to the engine for a given step. */
  emitStateChange(stepOid: string, state: StepState, outputs?: Record<string, string>): void {
    const inv = this.invocations.find(i => i.req.stepOid === stepOid && !i.released);
    if (!inv) throw new Error(`No active invocation for stepOid=${stepOid}`);
    inv.callbacks.onStateChange(stepOid, state, outputs);
  }

  emitConnectivity(stepOid: string, status: 'ok' | 'reconnecting' | 'never_connected'): void {
    const inv = this.invocations.find(i => i.req.stepOid === stepOid && !i.released);
    if (!inv) throw new Error(`No active invocation for stepOid=${stepOid}`);
    inv.callbacks.onConnectivityChange(stepOid, status);
  }

  /** Most-recent invocation for assertions. */
  lastInvocation(): RecordedInvoke {
    if (this.invocations.length === 0) throw new Error('No invocations recorded');
    return this.invocations[this.invocations.length - 1];
  }
}
