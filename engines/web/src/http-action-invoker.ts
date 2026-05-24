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
  probeCapabilities(_serverUri: string): Promise<ServerCapabilities> {
    throw new Error('not implemented');
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
