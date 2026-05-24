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

  private capsByServer = new Map<string, ServerCapabilities>();

  setCapabilities(serverUri: string, caps: ServerCapabilities): void {
    this.capsByServer.set(this.normalizeUri(serverUri), caps);
  }

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

    const res = await this.fetchWithRetry(url, {
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

    const caps = this.capsByServer.get(base);
    const actionVisibility = caps?.actions.get(req.action_oid)?.visibility;
    const canSse =
      req.mode === 'sse-preferred'
      && caps?.sse_supported === true
      && actionVisibility === 'observable'
      && typeof data.sse_endpoint === 'string';

    if (canSse) {
      this.startSse(req.stepOid, base, instanceId, data.sse_endpoint!, req.pollIntervalMs, callbacks);
    } else {
      this.startPolling(req.stepOid, base, instanceId, req.pollIntervalMs, callbacks);
    }

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
  private async fetchWithRetry(
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    const delays = [100, 200, 400, 800, 1600, 3200, 6400, 12800, 25600, 30000];
    let attempt = 0;
    for (;;) {
      try {
        const res = await fetch(url, init);
        if (res.status >= 500 && res.status < 600) {
          // retry
        } else {
          return res;
        }
      } catch {
        // retry
      }
      const wait = delays[Math.min(attempt, delays.length - 1)];
      attempt++;
      await new Promise(r => setTimeout(r, wait));
    }
  }

  private startSse(
    stepOid: string,
    serverUri: string,
    instanceId: string,
    ssePath: string,
    fallbackPollMs: number,
    callbacks: ActionInvokerCallbacks,
  ): void {
    const state = this.active.get(stepOid);
    if (!state || state.cancelled) return;

    const url = ssePath.startsWith('http') ? ssePath : serverUri.replace(/\/$/, '') + ssePath;
    const EventSourceCtor = (globalThis as any).EventSource;
    if (!EventSourceCtor) {
      this.startPolling(stepOid, serverUri, instanceId, fallbackPollMs, callbacks);
      return;
    }
    const es = new EventSourceCtor(url);
    state.eventSource = es;

    es.addEventListener('state_change', (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data);
        callbacks.onStateChange(stepOid, data.status, data.output_parameters);
        const TERMINAL = ['COMPLETED', 'ABORTED', 'ERRORED'];
        if (TERMINAL.includes(data.status)) this.release(stepOid);
      } catch { /* ignore malformed */ }
    });

    es.addEventListener('output', (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data);
        callbacks.onStateChange(stepOid, state.lastStatus as any, data);
      } catch {}
    });

    es.addEventListener('error', () => {
      es.close();
      state.eventSource = null;
      if (!state.cancelled) {
        callbacks.onConnectivityChange(stepOid, 'reconnecting');
        this.startPolling(stepOid, serverUri, instanceId, fallbackPollMs, callbacks);
      }
    });
  }

  async sendCommand(serverUri: string, instanceId: string, command: ActionServerCommand): Promise<void> {
    const url = this.normalizeUri(serverUri) + `instances/${encodeURIComponent(instanceId)}/command`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command }),
      });
      if (res.status === 409) return;
    } catch {
      // best-effort
    }
  }

  async abort(serverUri: string, instanceId: string): Promise<void> {
    const url = this.normalizeUri(serverUri) + `instances/${encodeURIComponent(instanceId)}`;
    try {
      await fetch(url, { method: 'DELETE' });
    } catch {
      // best-effort
    }
  }

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
