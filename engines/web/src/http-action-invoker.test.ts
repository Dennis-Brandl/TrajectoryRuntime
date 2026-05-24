// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { describe, it, mock } from 'node:test';
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

  it('uses SSE when mode=sse-preferred + sse_supported + observable + sse_endpoint', async () => {
    const listeners: Record<string, Function[]> = {};
    const closeSpy = mock.fn();
    (globalThis as any).EventSource = class {
      url: string;
      constructor(url: string) { this.url = url; (globalThis as any).__lastES = this; }
      addEventListener(name: string, fn: Function) { (listeners[name] ??= []).push(fn); }
      close() { closeSpy(); }
    };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: any) => {
      if (String(input).endsWith('/invoke')) {
        return { ok: true, status: 201, json: async () => ({ data: { runtime_action_instance_id: 'rai-7', status: 'STARTING', sse_endpoint: '/instances/rai-7/events' } }) } as any;
      }
      return { ok: true, status: 200, json: async () => ({ data: { status: 'STARTING' } }) } as any;
    }) as typeof fetch;

    const seen: string[] = [];
    const inv = new HttpActionInvoker();
    inv.setCapabilities('http://s/', { sse_supported: true, actions: new Map([['a', { visibility: 'observable' }]]) });

    await inv.invoke({
      stepOid: 'sx', workflow_instance_id: 'wf', serverUri: 'http://s/', action_oid: 'a',
      inputs: {}, mode: 'sse-preferred', pollIntervalMs: 4000,
    }, { onStateChange: (_oid, s) => seen.push(s), onConnectivityChange: () => {} });

    const fn = listeners['state_change']?.[0];
    assert.ok(fn, 'state_change listener registered');
    fn({ data: JSON.stringify({ status: 'COMPLETED', output_parameters: { y: '2' } }) });

    inv.release('sx');
    delete (globalThis as any).EventSource;
    globalThis.fetch = originalFetch;

    assert.ok(seen.includes('STARTING'));
    assert.ok(seen.includes('COMPLETED'));
  });

  it('invoke retries on network error and eventually succeeds', async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async (input: any) => {
      calls++;
      if (String(input).endsWith('/invoke') && calls < 3) {
        throw new Error('econnrefused');
      }
      return { ok: true, status: 201, json: async () => ({ data: { runtime_action_instance_id: 'rai-r', status: 'POSTED' } }) } as any;
    }) as typeof fetch;

    try {
      const inv = new HttpActionInvoker();
      const id = await inv.invoke({
        stepOid: 'sr', workflow_instance_id: 'w', serverUri: 'http://s/', action_oid: 'a',
        inputs: {}, mode: 'poll-only', pollIntervalMs: 1000,
      }, { onStateChange: () => {}, onConnectivityChange: () => {} });
      assert.equal(id, 'rai-r');
      assert.ok(calls >= 3);
      inv.release('sr');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('sendCommand POSTs to /command and ignores 409', async () => {
    const originalFetch = globalThis.fetch;
    let url = '';
    let body: any = null;
    globalThis.fetch = (async (input: any, init?: any) => {
      url = String(input);
      body = init?.body ? JSON.parse(init.body) : null;
      return { ok: false, status: 409, json: async () => ({ error: { code: 'INVALID_STATE_TRANSITION' } }) } as any;
    }) as typeof fetch;
    try {
      const inv = new HttpActionInvoker();
      await inv.sendCommand('http://s/', 'rai-1', 'PAUSE');
      assert.match(url, /\/instances\/rai-1\/command$/);
      assert.equal(body.command, 'PAUSE');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('abort DELETEs /instances/{id}', async () => {
    const originalFetch = globalThis.fetch;
    let url = '', method = '';
    globalThis.fetch = (async (input: any, init?: any) => {
      url = String(input); method = init?.method ?? 'GET';
      return { ok: true, status: 200, json: async () => ({}) } as any;
    }) as typeof fetch;
    try {
      const inv = new HttpActionInvoker();
      await inv.abort('http://s/', 'rai-2');
      assert.match(url, /\/instances\/rai-2$/);
      assert.equal(method, 'DELETE');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('emits reconnecting after 3 consecutive poll failures then ok on recovery', async () => {
    const originalFetch = globalThis.fetch;
    let pollCalls = 0;
    let invokeReturned = false;
    globalThis.fetch = (async (input: any) => {
      const url = String(input);
      if (url.endsWith('/invoke')) {
        invokeReturned = true;
        return { ok: true, status: 201, json: async () => ({ data: { runtime_action_instance_id: 'rai-c', status: 'POSTED' } }) } as any;
      }
      pollCalls++;
      if (pollCalls <= 3) throw new Error('net');
      return { ok: true, status: 200, json: async () => ({ data: { status: 'EXECUTING' } }) } as any;
    }) as typeof fetch;
    const events: string[] = [];
    const inv = new HttpActionInvoker();
    await inv.invoke({
      stepOid: 'sc', workflow_instance_id: 'w', serverUri: 'http://s/', action_oid: 'a',
      inputs: {}, mode: 'poll-only', pollIntervalMs: 5,
    }, { onStateChange: () => {}, onConnectivityChange: (_oid, s) => events.push(s) });

    await new Promise(r => setTimeout(r, 100));
    inv.release('sc');
    globalThis.fetch = originalFetch;
    assert.ok(invokeReturned);
    assert.ok(events.includes('reconnecting'), 'should report reconnecting');
    assert.ok(events.includes('ok'), 'should report ok on recovery');
  });
});
