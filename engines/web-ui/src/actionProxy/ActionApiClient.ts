// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import type {
  ActionApiError,
  ActionCommand,
  EnvironmentCapability,
  InstanceSnapshot,
  InvokeRequest,
} from './types.js';

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

export class ActionApiClient {
  constructor(private fetchImpl: FetchLike = fetch) {}

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
