// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HttpActionInvoker } from './http-action-invoker.js';

describe('HttpActionInvoker', () => {
  it('trims whitespace from server URIs and ensures trailing slash', () => {
    const inv = new HttpActionInvoker();
    assert.equal(inv.normalizeUri('  http://x/y/  '), 'http://x/y/');
    assert.equal(inv.normalizeUri('http://x/y'), 'http://x/y/');
    assert.equal(inv.normalizeUri('http://x/y/'), 'http://x/y/');
  });

  it('probeCapabilities parses sse_supported and per-action visibility', async () => {
    const responseBody = {
      data: {
        sse_supported: true,
        actions: [
          { action_oid: 'a1', visibility_support: ['observable'] },
          { action_oid: 'a2', visibility_support: ['opaque'] },
        ],
      },
    };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: any) => ({
      ok: true,
      status: 200,
      json: async () => responseBody,
      url: String(input),
    } as any)) as typeof fetch;

    try {
      const inv = new HttpActionInvoker();
      const caps = await inv.probeCapabilities('http://server/trajectory/v1/');
      assert.equal(caps.sse_supported, true);
      assert.equal(caps.actions.get('a1')?.visibility, 'observable');
      assert.equal(caps.actions.get('a2')?.visibility, 'opaque');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('probeCapabilities returns safe defaults on network error', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => { throw new Error('connection refused'); }) as typeof fetch;
    try {
      const inv = new HttpActionInvoker();
      const caps = await inv.probeCapabilities('http://server/trajectory/v1/');
      assert.equal(caps.sse_supported, false);
      assert.equal(caps.actions.size, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('invoke POSTs to /actions/{oid}/invoke with inputs, returns instance_id', async () => {
    const originalFetch = globalThis.fetch;
    let capturedUrl = '';
    let capturedBody: any = null;
    globalThis.fetch = (async (input: any, init?: any) => {
      capturedUrl = String(input);
      capturedBody = init?.body ? JSON.parse(init.body) : null;
      // Polling GETs will return EXECUTING then we release before COMPLETED
      if (capturedUrl.endsWith('/invoke')) {
        return {
          ok: true, status: 201,
          json: async () => ({ data: { runtime_action_instance_id: 'rai-123', status: 'POSTED' } }),
        } as any;
      }
      return { ok: true, status: 200, json: async () => ({ data: { status: 'EXECUTING' } }) } as any;
    }) as typeof fetch;

    try {
      const inv = new HttpActionInvoker();
      const id = await inv.invoke({
        stepOid: 'step-1', workflow_instance_id: 'wf-1',
        serverUri: 'http://server/trajectory/v1/', action_oid: 'a1',
        inputs: { foo: 'bar' }, mode: 'poll-only', pollIntervalMs: 4000,
      }, {
        onStateChange: () => {}, onConnectivityChange: () => {},
      });

      assert.equal(id, 'rai-123');
      assert.match(capturedUrl, /\/actions\/a1\/invoke$/);
      assert.equal(capturedBody.workflow_instance_id, 'wf-1');
      assert.deepEqual(capturedBody.input_parameters, { foo: 'bar' });
      inv.release('step-1'); // stop background polling
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('polling delivers state changes when status changes between ticks', async () => {
    const originalFetch = globalThis.fetch;
    const statusSeq = ['POSTED', 'EXECUTING', 'COMPLETED'];
    let i = 0;
    globalThis.fetch = (async (input: any) => {
      const url = String(input);
      if (url.endsWith('/invoke')) {
        return {
          ok: true, status: 201,
          json: async () => ({ data: { runtime_action_instance_id: 'rai-9', status: 'POSTED' } }),
        } as any;
      }
      const status = statusSeq[Math.min(i++, statusSeq.length - 1)];
      const body = status === 'COMPLETED'
        ? { data: { status, output_parameters: { x: '1' } } }
        : { data: { status } };
      return { ok: true, status: 200, json: async () => body } as any;
    }) as typeof fetch;

    const seen: Array<{ s: string; o?: any }> = [];
    const inv = new HttpActionInvoker();
    await inv.invoke({
      stepOid: 'sx', workflow_instance_id: 'wf', serverUri: 'http://s/', action_oid: 'a',
      inputs: {}, mode: 'poll-only', pollIntervalMs: 5,
    }, { onStateChange: (_oid, s, o) => seen.push({ s, o }), onConnectivityChange: () => {} });

    await new Promise(r => setTimeout(r, 100));
    inv.release('sx');
    globalThis.fetch = originalFetch;

    const states = seen.map(e => e.s);
    assert.ok(states.includes('POSTED'), 'should see POSTED');
    assert.ok(states.includes('EXECUTING'), 'should see EXECUTING');
    assert.ok(states.includes('COMPLETED'), 'should see COMPLETED');
    const completed = seen.find(e => e.s === 'COMPLETED');
    assert.deepEqual(completed?.o, { x: '1' });
  });
});
