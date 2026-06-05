// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { substituteChips } from './richText.js';

describe('substituteChips', () => {
  it('escapes HTML in mustache-substituted property values (XSS)', () => {
    const out = substituteChips('Hello {{Name}}', { Name: '<img src=x onerror=alert(1)>' });
    assert.ok(!out.includes('<img'), 'raw <img must not appear in output');
    assert.ok(out.includes('&lt;img'), 'substituted value should be HTML-escaped');
  });

  it('escapes HTML in chip-substituted property values (regression)', () => {
    const out = substituteChips('<span data-param-chip="Name">x</span>', { Name: '<b>x</b>' });
    assert.ok(out.includes('&lt;b&gt;'), 'chip value should be HTML-escaped');
  });

  it('leaves unmatched placeholders as-is', () => {
    assert.equal(substituteChips('{{Missing}}', {}), '{{Missing}}');
  });
});
