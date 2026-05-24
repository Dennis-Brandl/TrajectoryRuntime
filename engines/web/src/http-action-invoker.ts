// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import type {
  ActionInvoker,
  ActionInvokerCallbacks,
  ActionServerCommand,
  InvokeRequest,
  ServerCapabilities,
} from './action-invoker.js';

export class HttpActionInvoker implements ActionInvoker {
  private active = new Map<string, {
    serverUri: string;
    instanceId: string;
    pollTimer: ReturnType<typeof setTimeout> | null;
    eventSource: any | null;
    lastStatus: string | null;
    cancelled: boolean;
  }>();

  normalizeUri(raw: string): string {
    const trimmed = raw.trim();
    return trimmed.endsWith('/') ? trimmed : trimmed + '/';
  }
  async probeCapabilities(serverUri: string): Promise<ServerCapabilities> {
    const url = this.normalizeUri(serverUri) + 'capabilities';
    try {
      const res = await fetch(url, { method: 'GET' });
      if (!res.ok) {
        return { sse_supported: false, actions: new Map() };
      }
      const body = await res.json() as {
        data?: {
          sse_supported?: boolean;
          actions?: Array<{ action_oid: string; visibility_support?: string[] }>;
        };
      };
      const data = body.data ?? {};
      const actions = new Map<string, { visibility: 'observable' | 'opaque' }>();
      for (const a of data.actions ?? []) {
        const vis = (a.visibility_support ?? []).includes('observable') ? 'observable' : 'opaque';
        actions.set(a.action_oid, { visibility: vis });
      }
      return { sse_supported: Boolean(data.sse_supported), actions };
    } catch {
      return { sse_supported: false, actions: new Map() };
    }
  }
  async invoke(req: InvokeRequest, callbacks: ActionInvokerCallbacks): Promise<string> {
    const base = this.normalizeUri(req.serverUri);
    const url = `${base}actions/${encodeURIComponent(req.action_oid)}/invoke`;
    const body = {
      workflow_instance_id: req.workflow_instance_id,
      input_parameters: req.inputs,
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      callbacks.onStateChange(req.stepOid, 'ERRORED' as any);
      throw new Error(`invoke failed with status ${res.status}`);
    }

    const parsed = await res.json() as {
      data?: { runtime_action_instance_id?: string; status?: string; sse_endpoint?: string };
    };
    const data = parsed.data ?? {};
    const instanceId = data.runtime_action_instance_id;
    if (!instanceId) throw new Error('invoke response missing runtime_action_instance_id');

    if (data.status) {
      callbacks.onStateChange(req.stepOid, data.status as any);
    }

    this.active.set(req.stepOid, {
      serverUri: base,
      instanceId,
      pollTimer: null,
      eventSource: null,
      lastStatus: data.status ?? null,
      cancelled: false,
    });

    // For now: always poll. SSE branch added in Task 23.
    this.startPolling(req.stepOid, base, instanceId, req.pollIntervalMs, callbacks);

    return instanceId;
  }

  private startPolling(
    stepOid: string,
    serverUri: string,
    instanceId: string,
    intervalMs: number,
    callbacks: ActionInvokerCallbacks,
  ): void {
    const state = this.active.get(stepOid);
    if (!state || state.cancelled) return;

    const tick = async () => {
      if (state.cancelled) return;
      try {
        const url = `${serverUri}instances/${encodeURIComponent(instanceId)}`;
        const res = await fetch(url, { method: 'GET' });
        if (res.status === 404) {
          callbacks.onStateChange(stepOid, 'ABORTED' as any);
          this.release(stepOid);
          return;
        }
        if (res.ok) {
          const parsed = await res.json() as {
            data?: { status?: string; output_parameters?: Record<string, string> };
          };
          const data = parsed.data ?? {};
          if (data.status && data.status !== state.lastStatus) {
            state.lastStatus = data.status;
            callbacks.onStateChange(stepOid, data.status as any, data.output_parameters);
          }
          const TERMINAL = ['COMPLETED', 'ABORTED', 'ERRORED'];
          if (data.status && TERMINAL.includes(data.status)) {
            this.release(stepOid);
            return;
          }
        }
        if (!state.cancelled) {
          state.pollTimer = setTimeout(tick, intervalMs);
        }
      } catch {
        if (!state.cancelled) {
          state.pollTimer = setTimeout(tick, intervalMs);
        }
      }
    };

    state.pollTimer = setTimeout(tick, intervalMs);
  }
  sendCommand(_uri: string, _id: string, _cmd: ActionServerCommand): Promise<void> {
    throw new Error('not implemented');
  }
  abort(_uri: string, _id: string): Promise<void> { throw new Error('not implemented'); }

  release(stepOid: string): void {
    const state = this.active.get(stepOid);
    if (!state) return;
    state.cancelled = true;
    if (state.pollTimer) clearTimeout(state.pollTimer);
    if (state.eventSource && typeof state.eventSource.close === 'function') {
      state.eventSource.close();
    }
    this.active.delete(stepOid);
  }
}
