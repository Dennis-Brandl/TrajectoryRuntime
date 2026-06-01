// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Ajv from 'ajv';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Mirror validator.ts loadSchema()'s candidate resolution (from dist/).
function loadSchema(): Record<string, unknown> {
  const candidates = [
    resolve(__dirname, '../../../../spec/workflow-schema.json'),
    resolve(__dirname, '../../../../../spec/workflow-schema.json'),
    resolve(__dirname, '../../../spec/workflow-schema.json'),
    resolve(__dirname, '../../spec/workflow-schema.json'),
  ];
  for (const p of candidates) {
    try {
      const raw = JSON.parse(readFileSync(p, 'utf-8')) as Record<string, unknown>;
      delete raw['$schema'];
      return raw;
    } catch { /* next */ }
  }
  throw new Error('schema not found');
}

function compile() {
  const ajv = new (Ajv as unknown as typeof Ajv.default)({ allErrors: true, strict: false });
  return ajv.compile(loadSchema());
}

const DATE = '2026-05-31T12:00:00.000Z';
function wfWithStep(step: Record<string, unknown>) {
  return {
    local_id: 'wf', oid: 'wf-1', version: '1.0.0', last_modified_date: DATE,
    steps: [
      { local_id: 'Start', oid: 's1', step_type: 'START', version: '1.0.0', last_modified_date: DATE },
      { local_id: 'End', oid: 's2', step_type: 'END', version: '1.0.0', last_modified_date: DATE },
      step,
    ],
    connections: [{ from_step_id: 's1', to_step_id: 's2' }],
  };
}

describe('schema: CATCH/RETURN step types', () => {
  it('accepts a CATCH step type', () => {
    const validate = compile();
    const ok = validate(wfWithStep({
      local_id: 'C', oid: 'c1', step_type: 'CATCH', version: '1.0.0', last_modified_date: DATE, catch_id: 'X',
    }));
    const enumErr = (validate.errors ?? []).some(e => e.keyword === 'enum' && (e.instancePath ?? '').includes('step_type'));
    assert.equal(enumErr, false, `unexpected enum error: ${JSON.stringify(validate.errors)}`);
    assert.equal(ok, true);
  });

  it('accepts a RETURN step type', () => {
    const validate = compile();
    const ok = validate(wfWithStep({
      local_id: 'R', oid: 'r1', step_type: 'RETURN', version: '1.0.0', last_modified_date: DATE,
      return_config: { command: 'ABANDON' },
    }));
    assert.equal(ok, true, `errors: ${JSON.stringify(validate.errors)}`);
  });

  it('still rejects a genuinely unknown step type (control)', () => {
    const validate = compile();
    validate(wfWithStep({ local_id: 'B', oid: 'b1', step_type: 'BOGUS', version: '1.0.0', last_modified_date: DATE }));
    const enumErr = (validate.errors ?? []).some(e => e.keyword === 'enum' && (e.instancePath ?? '').includes('step_type'));
    assert.equal(enumErr, true);
  });
});

describe('schema: try_specifications / return_config shape', () => {
  it('accepts a well-formed try_specifications array on an action step', () => {
    const validate = compile();
    const ok = validate(wfWithStep({
      local_id: 'A', oid: 'a1', step_type: 'ACTION PROXY', version: '1.0.0', last_modified_date: DATE,
      try_specifications: [
        { mode: 'ERROR', catch_id: 'C1', release_on_catch: true },
        { mode: 'TIMEOUT', catch_id: 'C1' },
      ],
    }));
    assert.equal(ok, true, `errors: ${JSON.stringify(validate.errors)}`);
  });

  it('rejects a try_specifications entry with an unknown mode', () => {
    const validate = compile();
    validate(wfWithStep({
      local_id: 'A', oid: 'a1', step_type: 'ACTION PROXY', version: '1.0.0', last_modified_date: DATE,
      try_specifications: [{ mode: 'BOGUS', catch_id: 'C1' }],
    }));
    const modeErr = (validate.errors ?? []).some(e => e.keyword === 'enum' && (e.instancePath ?? '').includes('mode'));
    assert.equal(modeErr, true, `errors: ${JSON.stringify(validate.errors)}`);
  });

  it('rejects a return_config with an unknown command', () => {
    const validate = compile();
    validate(wfWithStep({
      local_id: 'R', oid: 'r1', step_type: 'RETURN', version: '1.0.0', last_modified_date: DATE,
      return_config: { command: 'NOPE' },
    }));
    const cmdErr = (validate.errors ?? []).some(e => e.keyword === 'enum' && (e.instancePath ?? '').includes('command'));
    assert.equal(cmdErr, true, `errors: ${JSON.stringify(validate.errors)}`);
  });
});
