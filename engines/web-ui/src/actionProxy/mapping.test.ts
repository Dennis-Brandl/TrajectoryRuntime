// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { mapWorkflowEnvActions } from './mapping.js';

describe('mapWorkflowEnvActions', () => {
  it('Exact mode: returns no rewrites when oids match', () => {
    const result = mapWorkflowEnvActions({
      mode: 'Exact',
      workflowEnvs: [{ oid: 'env-1', local_id: 'E1', requiredActionOids: ['act-1'] }],
      capabilitiesByServer: new Map([
        ['http://s1', [{ environment_oid: 'env-1', environment_name: 'E1', actions: [{ action_oid: 'act-1', action_name: 'A1' }] }] as any],
      ]),
    });
    assert.equal(result.kind, 'ok');
    if (result.kind === 'ok') assert.equal(result.rewrittenOids.size, 0);
  });

  it('Exact mode: returns oid_mismatch when env oid differs', () => {
    const result = mapWorkflowEnvActions({
      mode: 'Exact',
      workflowEnvs: [{ oid: 'env-1', local_id: 'E1', requiredActionOids: ['act-1'] }],
      capabilitiesByServer: new Map([
        ['http://s1', [{ environment_oid: 'env-2', environment_name: 'E1', actions: [{ action_oid: 'act-1', action_name: 'A1' }] }] as any],
      ]),
    });
    assert.equal(result.kind, 'oid_mismatch');
  });

  it('Name mode: unique match across servers rewrites oids', () => {
    const result = mapWorkflowEnvActions({
      mode: 'Name',
      workflowEnvs: [{ oid: 'wf-env', local_id: 'Conveyor', requiredActionOids: ['wf-act'], requiredActionNames: ['Pick'] }],
      capabilitiesByServer: new Map([
        ['http://s1', [{ environment_oid: 'srv-env', environment_name: 'Conveyor', actions: [{ action_oid: 'srv-act', action_name: 'Pick' }] }] as any],
      ]),
    });
    assert.equal(result.kind, 'ok');
    if (result.kind === 'ok') {
      assert.equal(result.rewrittenOids.get('wf-env'), 'srv-env');
      assert.equal(result.rewrittenOids.get('wf-act'), 'srv-act');
    }
  });

  it('Name mode: multi-server match returns needs_resolution', () => {
    const result = mapWorkflowEnvActions({
      mode: 'Name',
      workflowEnvs: [{ oid: 'wf-env', local_id: 'Conveyor', requiredActionOids: ['wf-act'], requiredActionNames: ['Pick'] }],
      capabilitiesByServer: new Map([
        ['http://s1', [{ environment_oid: 'srv1-env', environment_name: 'Conveyor', actions: [{ action_oid: 's1-act', action_name: 'Pick' }] }] as any],
        ['http://s2', [{ environment_oid: 'srv2-env', environment_name: 'Conveyor', actions: [{ action_oid: 's2-act', action_name: 'Pick' }] }] as any],
      ]),
    });
    assert.equal(result.kind, 'needs_resolution');
    if (result.kind === 'needs_resolution') {
      assert.equal(result.conflicts.length, 1);
      assert.equal(result.conflicts[0].candidates.length, 2);
    }
  });

  it('Name mode: zero matches returns name_not_found', () => {
    const result = mapWorkflowEnvActions({
      mode: 'Name',
      workflowEnvs: [{ oid: 'wf-env', local_id: 'Conveyor', requiredActionOids: ['wf-act'], requiredActionNames: ['Pick'] }],
      capabilitiesByServer: new Map([
        ['http://s1', [{ environment_oid: 'srv1-env', environment_name: 'Other', actions: [] }] as any],
      ]),
    });
    assert.equal(result.kind, 'name_not_found');
  });
});
