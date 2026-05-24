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
});
