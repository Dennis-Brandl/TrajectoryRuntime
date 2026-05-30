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

test('getCapabilities returns env-grouped list', async () => {
  const client = new ActionApiClient(makeFetchOnce(() => ({
    status: 200,
    body: {
      data: {
        environments: [
          {
            environment_oid: 'env-1',
            environment_name: 'Production',
            environment_state: 'Effective',
            action_properties: [],
            actions: [
              {
                action_oid: 'act-1',
                action_name: 'PickAndPlace',
                action_state: 'Effective',
                local_id: 'PickAndPlace',
                version: '1.0',
                description: null,
                visibility: 'observable',
                input_parameters: [],
                output_parameters: [],
                supported_commands: ['PAUSE', 'RESUME', 'HOLD', 'UNHOLD', 'ABORT', 'STOP', 'CLEAR'],
              },
            ],
          },
        ],
      },
      meta: { total: 1 },
    },
  })));
  const envs = await client.getCapabilities('http://localhost:3002');
  assert.equal(envs.length, 1);
  assert.equal(envs[0].environment_oid, 'env-1');
  assert.equal(envs[0].actions.length, 1);
  assert.equal(envs[0].actions[0].action_oid, 'act-1');
  assert.equal(envs[0].actions[0].visibility, 'observable');
});

// ────────────────────────────────────────────────────────────────────────────
// Regression: default fetch must not throw "fetch called on an object that
// does not implement interface Window."
//
// Some browsers (Firefox, recent Chromium) reject native fetch when called
// with a `this` other than Window/WorkerGlobalScope. Storing a bare `fetch`
// reference on a class field and invoking via `this.fetchImpl(...)` triggers
// that error because the call site sets `this = the class instance`. The fix
// is to wrap fetch in an arrow so the inner call evaluates as a plain global
// invocation. This test pins that behavior by replacing `globalThis.fetch`
// with a strict implementation that asserts the binding on every call.
// ────────────────────────────────────────────────────────────────────────────
test('default fetch is invoked with global-style `this` (no Window binding error)', async () => {
  const originalFetch = globalThis.fetch
  let observedThisIsClient = false
  // Strict stand-in: throws if called as a method on the ActionApiClient
  // instance (mirroring what browsers do for the real fetch).
  const strictFetch = function (this: unknown, _url: RequestInfo | URL, _init?: RequestInit) {
    if (this !== undefined && this !== globalThis) {
      // If we get here with `this` being an ActionApiClient, the regression
      // is back. The original browser error wording is reproduced verbatim
      // so the failure mode is unambiguous.
      observedThisIsClient = true
      throw new TypeError(`'fetch' called on an object that does not implement interface Window.`)
    }
    return Promise.resolve(
      new Response(
        JSON.stringify({ data: { environments: [] }, meta: {} }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
  } as unknown as typeof fetch
  ;(globalThis as { fetch: typeof fetch }).fetch = strictFetch

  try {
    // Use the no-arg constructor so the class-default fetch wrapper runs.
    const client = new ActionApiClient()
    await client.getCapabilities('http://localhost:3002')
    assert.equal(observedThisIsClient, false, 'fetch was invoked with the wrong `this` — the Window-binding fix regressed')
  } finally {
    ;(globalThis as { fetch: typeof fetch }).fetch = originalFetch
  }
})
