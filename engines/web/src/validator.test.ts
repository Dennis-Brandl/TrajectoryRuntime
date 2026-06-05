// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from './validator.js';

const DATE = '2026-04-24';

// Minimal valid START→END workflow. Shared builder so tests only set the
// fields they care about.
function baseWorkflow(): Record<string, unknown> {
  return {
    local_id: 'root-wf',
    oid: 'root-oid',
    version: '1.0.0',
    last_modified_date: DATE,
    steps: [
      { local_id: 'start', oid: 'step-1', version: '1.0.0', last_modified_date: DATE, step_type: 'START' },
      { local_id: 'end', oid: 'step-2', version: '1.0.0', last_modified_date: DATE, step_type: 'END' },
    ],
    connections: [
      { from_step_id: 'step-1', to_step_id: 'step-2' },
    ],
  };
}

function minimalChildSteps() {
  return {
    steps: [
      { local_id: 'c-start', oid: 'cs-1', version: '1.0.0', last_modified_date: DATE, step_type: 'START' },
      { local_id: 'c-end', oid: 'cs-2', version: '1.0.0', last_modified_date: DATE, step_type: 'END' },
    ],
    connections: [{ from_step_id: 'cs-1', to_step_id: 'cs-2' }],
  };
}

describe('validator — v7.0 package format', () => {
  it('accepts schemaVersion "4.0" with children array (ChildWorkflowExport)', () => {
    const wf = {
      ...baseWorkflow(),
      schemaVersion: '4.0',
      state: 'Effective',
      children: [
        {
          local_id: 'child-1',
          oid: 'child-oid-1',
          version: '1.0.0',
          last_modified_date: DATE,
          schemaVersion: '4.0',
          state: 'Draft',
          parentChildSpecId: null,
          ...minimalChildSteps(),
        },
      ],
    };
    const result = validate(wf);
    assert.equal(result.valid, true, `expected valid, got ${result.error_code}: ${result.error_message}`);
  });

  it('accepts a workflow with no schemaVersion (older export paths)', () => {
    const result = validate(baseWorkflow());
    assert.equal(result.valid, true);
  });

  it('rejects schemaVersion "2.0" (incompatible pre-v6.0 format)', () => {
    const wf = { ...baseWorkflow(), schemaVersion: '2.0' };
    const result = validate(wf);
    assert.equal(result.valid, false);
  });

  it('accepts nested grandchildren with non-null parentChildSpecId', () => {
    const wf = {
      ...baseWorkflow(),
      schemaVersion: '4.0',
      children: [
        {
          local_id: 'c1', oid: 'c1-oid', version: '1.0.0', last_modified_date: DATE,
          state: 'Draft', parentChildSpecId: null,
          ...minimalChildSteps(),
          children: [
            {
              local_id: 'gc1', oid: 'gc1-oid', version: '1.0.0', last_modified_date: DATE,
              state: 'Draft', parentChildSpecId: 'c1-oid',
              ...minimalChildSteps(),
            },
          ],
        },
      ],
    };
    const result = validate(wf);
    assert.equal(result.valid, true, `expected valid, got ${result.error_code}: ${result.error_message}`);
  });

  it('rejects a child missing required parentChildSpecId', () => {
    const wf = {
      ...baseWorkflow(),
      schemaVersion: '4.0',
      children: [
        {
          local_id: 'c1', oid: 'c1-oid', version: '1.0.0', last_modified_date: DATE,
          state: 'Draft',
          // parentChildSpecId missing
          ...minimalChildSteps(),
        },
      ],
    };
    const result = validate(wf);
    assert.equal(result.valid, false);
    assert.equal(result.error_code, 'MISSING_REQUIRED_FIELD');
  });

  it('rejects a child missing required state field', () => {
    const wf = {
      ...baseWorkflow(),
      schemaVersion: '4.0',
      children: [
        {
          local_id: 'c1', oid: 'c1-oid', version: '1.0.0', last_modified_date: DATE,
          parentChildSpecId: null,
          // state missing
          ...minimalChildSteps(),
        },
      ],
    };
    const result = validate(wf);
    assert.equal(result.valid, false);
    assert.equal(result.error_code, 'MISSING_REQUIRED_FIELD');
  });

  it('accepts arbitrary state string values (no enum enforcement)', () => {
    const wf = {
      ...baseWorkflow(),
      schemaVersion: '4.0',
      state: 'CustomCorporateState',
      children: [
        {
          local_id: 'c1', oid: 'c1-oid', version: '1.0.0', last_modified_date: DATE,
          state: 'AnotherCustom', parentChildSpecId: null,
          ...minimalChildSteps(),
        },
      ],
    };
    const result = validate(wf);
    assert.equal(result.valid, true, `expected valid, got ${result.error_code}: ${result.error_message}`);
  });
});
