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
});
