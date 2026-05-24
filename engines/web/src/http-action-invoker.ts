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
  invoke(_req: InvokeRequest, _cb: ActionInvokerCallbacks): Promise<string> {
    throw new Error('not implemented');
  }
  sendCommand(_uri: string, _id: string, _cmd: ActionServerCommand): Promise<void> {
    throw new Error('not implemented');
  }
  abort(_uri: string, _id: string): Promise<void> { throw new Error('not implemented'); }
  release(_oid: string): void { /* no-op for now */ }
}
