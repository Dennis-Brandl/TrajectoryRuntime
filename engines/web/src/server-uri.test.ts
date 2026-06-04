// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  isAllowedServerUri,
  assertAllowedServerUri,
  DisallowedServerUriError,
  hasValidServerUriScheme,
} from './lib/server-uri.js';

describe('isAllowedServerUri (SSRF guard)', () => {
  it('allows loopback http(s) by default', () => {
    assert.equal(isAllowedServerUri('http://localhost:3002'), true);
    assert.equal(isAllowedServerUri('http://127.0.0.1:3002/trajectory/v1'), true);
    assert.equal(isAllowedServerUri('https://localhost'), true);
  });

  it('rejects external and private hosts by default', () => {
    assert.equal(isAllowedServerUri('https://evil.example'), false);
    assert.equal(isAllowedServerUri('http://192.168.1.5:3002'), false);
    assert.equal(isAllowedServerUri('http://10.0.0.1'), false);
    assert.equal(isAllowedServerUri('http://169.254.169.254/latest/meta-data'), false);
  });

  it('rejects non-http schemes and garbage', () => {
    assert.equal(isAllowedServerUri('file:///etc/passwd'), false);
    assert.equal(isAllowedServerUri('javascript:alert(1)'), false);
    assert.equal(isAllowedServerUri('not a url'), false);
  });

  it('honors an explicit allow-list', () => {
    assert.equal(isAllowedServerUri('https://ac.example.com', ['https://ac.example.com']), true);
    assert.equal(isAllowedServerUri('https://other.example', ['https://ac.example.com']), false);
  });

  it('assertAllowedServerUri throws DisallowedServerUriError for disallowed URIs', () => {
    assert.throws(() => assertAllowedServerUri('https://evil.example'), DisallowedServerUriError);
    assert.doesNotThrow(() => assertAllowedServerUri('http://localhost:3002'));
  });

  it('hasValidServerUriScheme checks scheme', () => {
    assert.equal(hasValidServerUriScheme('http://x:1'), true);
    assert.equal(hasValidServerUriScheme('https://x'), true);
    assert.equal(hasValidServerUriScheme('file:///x'), false);
    assert.equal(hasValidServerUriScheme('nope'), false);
  });
});
