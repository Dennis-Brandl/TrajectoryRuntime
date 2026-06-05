// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
const BASE = process.env.TRAJECTORY_ACTIONS_URL ?? 'http://localhost:3002';

export async function ensureContainerUp(): Promise<void> {
  try {
    const resp = await fetch(`${BASE}/trajectory/v1/health`);
    if (resp.status !== 200) throw new Error(`/health returned ${resp.status}`);
  } catch (e) {
    throw new Error(
      `TrajectoryActions container not reachable at ${BASE}.\n` +
      `Start it with: cd C:\\Trajectory\\TrajectoryActions && pnpm dev\n` +
      `Original error: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

export async function listCapabilities(): Promise<Array<{ action_oid: string; supported_commands: string[]; visibility: string; local_id: string }>> {
  const resp = await fetch(`${BASE}/trajectory/v1/capabilities`);
  if (resp.status !== 200) throw new Error(`/capabilities returned ${resp.status}`);
  const json = await resp.json();
  return json.data;
}

export async function invokeAction(actionOid: string, body: Record<string, unknown>): Promise<string> {
  const resp = await fetch(`${BASE}/trajectory/v1/actions/${encodeURIComponent(actionOid)}/invoke`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (resp.status !== 201) throw new Error(`invoke returned ${resp.status}: ${await resp.text()}`);
  const json = await resp.json();
  return json.data.instance_id;
}

export async function getInstance(instanceId: string): Promise<{ state: { current: string }; outputs: Array<{ name: string; value: string }>; error: string | null }> {
  const resp = await fetch(`${BASE}/trajectory/v1/instances/${encodeURIComponent(instanceId)}`);
  if (resp.status !== 200) throw new Error(`getInstance returned ${resp.status}`);
  return (await resp.json()).data;
}

export async function deleteInstance(instanceId: string): Promise<void> {
  await fetch(`${BASE}/trajectory/v1/instances/${encodeURIComponent(instanceId)}`, { method: 'DELETE' });
}

export async function sendCommand(instanceId: string, command: string): Promise<Response> {
  return fetch(`${BASE}/trajectory/v1/instances/${encodeURIComponent(instanceId)}/command`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command }),
  });
}

export async function waitForState(instanceId: string, expected: string, timeoutMs = 10_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const snap = await getInstance(instanceId);
    if (snap.state.current === expected) return;
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error(`Timed out waiting for instance ${instanceId} to reach ${expected}`);
}

export const BASE_URL = BASE;
