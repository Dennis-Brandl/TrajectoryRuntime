// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ActionApiClient } from './ActionApiClient.js';

function makeFetchOnce(handler: (url: string, init: RequestInit) => { status: number; body: unknown }): typeof fetch {
  return async (url, init) => {
    const r = handler(String(url), init ?? {});
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json' } });
  };
}

test('invoke returns instance_id on 201', async () => {
  const client = new ActionApiClient(makeFetchOnce((url) => {
    assert.match(url, /\/trajectory\/v1\/actions\/act-1\/invoke$/);
    return { status: 201, body: { data: { instance_id: 'ai-1' }, meta: {} } };
  }));
  const { instance_id } = await client.invoke('http://localhost:3002', 'act-1', {
    environment_oid: 'env-1',
    workflow_instance_id: 'wf-1',
    step_instance_id: 'si-1',
    step_oid: 'step-1',
    input_parameters: [],
  });
  assert.equal(instance_id, 'ai-1');
});

test('invoke throws on 404 with error code and message', async () => {
  const client = new ActionApiClient(makeFetchOnce(() => ({
    status: 404,
    body: { error: { code: 'ACTION_NOT_FOUND', message: 'Unknown action', details: {} } },
  })));
  await assert.rejects(
    () => client.invoke('http://localhost:3002', 'act-1', {
      environment_oid: 'env-1', workflow_instance_id: 'wf-1', step_instance_id: 'si-1', step_oid: 'step-1', input_parameters: [],
    }),
    (e: unknown) => {
      const err = e as { code: string; status: number; message: string };
      return err.code === 'ACTION_NOT_FOUND' && err.status === 404 && err.message === 'Unknown action';
    },
  );
});

test('getInstance returns parsed snapshot', async () => {
  const client = new ActionApiClient(makeFetchOnce(() => ({
    status: 200,
    body: { data: { instance_id: 'ai-1', action_oid: 'act-1', environment_oid: 'env-1', workflow_instance_id: 'wf-1', step_instance_id: 'si-1', step_oid: 'step-1', visibility: 'observable', state: { current: 'RUNNING', previous: 'IDLE', entered_at: '2026-05-19T00:00:01Z' }, inputs: [], outputs: [], created_at: '2026-05-19T00:00:00Z', started_at: '2026-05-19T00:00:01Z', completed_at: null, error: null }, meta: {} },
  })));
  const snap = await client.getInstance('http://localhost:3002', 'ai-1');
  assert.equal(snap.state.current, 'RUNNING');
});

test('sendCommand throws ApiError with 409 details on invalid state transition', async () => {
  const client = new ActionApiClient(makeFetchOnce(() => ({
    status: 409,
    body: { error: { code: 'INVALID_STATE_TRANSITION', message: 'Cannot PAUSE while COMPLETED', details: { current_state: 'COMPLETED', command: 'PAUSE' } } },
  })));
  await assert.rejects(
    () => client.sendCommand('http://localhost:3002', 'ai-1', 'PAUSE'),
    (e: unknown) => {
      const err = e as { code: string; status: number; details?: Record<string, unknown> };
      return err.code === 'INVALID_STATE_TRANSITION' && err.status === 409 && err.details?.current_state === 'COMPLETED';
    },
  );
});

test('deleteInstance tolerates 404', async () => {
  const client = new ActionApiClient(makeFetchOnce(() => ({
    status: 404,
    body: { error: { code: 'INSTANCE_NOT_FOUND', message: 'gone', details: {} } },
  })));
  await client.deleteInstance('http://localhost:3002', 'ai-1');
});

test('getCapabilities returns the list', async () => {
  const client = new ActionApiClient(makeFetchOnce(() => ({
    status: 200,
    body: { data: [{ action_oid: 'act-1', environment_oid: 'env-1', local_id: 'PickAndPlace', version: '1.0', description: null, visibility: 'observable', supported_commands: ['PAUSE','RESUME','HOLD','UNHOLD','ABORT','STOP','CLEAR'], input_parameters: [], output_parameters: [] }], meta: { total: 1 } },
  })));
  const caps = await client.getCapabilities('http://localhost:3002');
  assert.equal(caps.length, 1);
  assert.equal(caps[0].action_oid, 'act-1');
  assert.equal(caps[0].visibility, 'observable');
});
