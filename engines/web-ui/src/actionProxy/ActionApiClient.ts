// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
import type {
  ActionApiError,
  ActionCommand,
  EnvironmentCapability,
  InstanceSnapshot,
  InvokeRequest,
} from './types.js';
import { assertAllowedServerUri } from '@engine/lib/server-uri.js';
import { getServerAllowlist } from '../settings.js';

export type FetchLike = typeof fetch;

class ApiErrorImpl extends Error implements ActionApiError {
  status: number;
  code: string;
  details?: Record<string, unknown>;
  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function readJson(resp: Response): Promise<unknown> {
  const txt = await resp.text();
  if (!txt) return null;
  try { return JSON.parse(txt); } catch { return null; }
}

async function unwrapError(resp: Response): Promise<ApiErrorImpl> {
  const body = (await readJson(resp)) as { error?: { code?: string; message?: string; details?: Record<string, unknown> } } | null;
  const err = body?.error;
  return new ApiErrorImpl(
    resp.status,
    err?.code ?? `HTTP_${resp.status}`,
    err?.message ?? resp.statusText,
    err?.details,
  );
}

/**
 * Returns a callable that delegates to the global `fetch` with the correct
 * `this` binding. Some browsers (Firefox, recent Chromium) throw
 *
 *   TypeError: 'fetch' called on an object that does not implement interface Window.
 *
 * when fetch is invoked with `this` set to anything other than `Window` /
 * `WorkerGlobalScope`. That's exactly what happens when a bare `fetch`
 * reference is stored on a class field and later invoked via
 * `this.fetchImpl(...)` — the call site binds `this = the class instance`.
 *
 * Wrapping in an arrow keeps the inner call as a plain global invocation
 * (`fetch(...args)`), which JS evaluates with `this = globalThis`. Safer
 * than `fetch.bind(globalThis)` because it tolerates jsdom / Node setups
 * where `fetch` is patched after this module loads.
 */
function defaultFetch(): FetchLike {
  return ((...args: Parameters<typeof fetch>) => fetch(...args)) as FetchLike
}

export class ActionApiClient {
  private fetchImpl: FetchLike;
  constructor(fetchImpl: FetchLike = defaultFetch()) {
    // SSRF guard: reject disallowed action-server URIs before any request leaves
    // the browser (covers invoke / getInstance / sendCommand / deleteInstance /
    // getCapabilities — all go through fetchImpl).
    this.fetchImpl = ((...args: Parameters<FetchLike>) => {
      assertAllowedServerUri(String(args[0]), getServerAllowlist());
      return fetchImpl(...args);
    }) as FetchLike;
  }

  async invoke(serverUri: string, actionOid: string, body: InvokeRequest): Promise<{ instance_id: string }> {
    const resp = await this.fetchImpl(`${serverUri}/trajectory/v1/actions/${encodeURIComponent(actionOid)}/invoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (resp.status !== 201) throw await unwrapError(resp);
    const json = (await readJson(resp)) as { data: { instance_id: string } };
    return { instance_id: json.data.instance_id };
  }

  async getInstance(serverUri: string, instanceId: string): Promise<InstanceSnapshot> {
    const resp = await this.fetchImpl(`${serverUri}/trajectory/v1/instances/${encodeURIComponent(instanceId)}`);
    if (resp.status !== 200) throw await unwrapError(resp);
    const json = (await readJson(resp)) as { data: InstanceSnapshot };
    return json.data;
  }

  async sendCommand(serverUri: string, instanceId: string, command: ActionCommand): Promise<void> {
    const resp = await this.fetchImpl(`${serverUri}/trajectory/v1/instances/${encodeURIComponent(instanceId)}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command }),
    });
    if (resp.status !== 200) throw await unwrapError(resp);
  }

  async deleteInstance(serverUri: string, instanceId: string): Promise<void> {
    const resp = await this.fetchImpl(`${serverUri}/trajectory/v1/instances/${encodeURIComponent(instanceId)}`, { method: 'DELETE' });
    if (resp.status === 404 || resp.status === 200) return;
    throw await unwrapError(resp);
  }

  async getCapabilities(serverUri: string): Promise<EnvironmentCapability[]> {
    const resp = await this.fetchImpl(`${serverUri}/trajectory/v1/capabilities`);
    if (resp.status !== 200) throw await unwrapError(resp);
    const json = (await readJson(resp)) as { data: { environments: EnvironmentCapability[] } };
    return json.data.environments;
  }
}
