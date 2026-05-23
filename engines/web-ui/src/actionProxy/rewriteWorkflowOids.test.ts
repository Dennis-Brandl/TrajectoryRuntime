// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { rewriteWorkflowOids } from './rewriteWorkflowOids.js';

test('replaces env and action oids in environment_specifications and action_proxy_config', () => {
  const wf = {
    local_id: 'wf', oid: 'wf-oid', version: '1.0.0', last_modified_date: '2026-05-19T00:00:00Z',
    steps: [
      {
        local_id: 'step1', oid: 'step-oid', version: '1.0.0', last_modified_date: '2026-05-19T00:00:00Z',
        step_type: 'ACTION PROXY',
        action_proxy_config: { environment_oid: 'env-old', action_oid: 'act-old' },
      },
    ],
    connections: [],
    environment_specifications: [
      {
        local_id: 'env1', oid: 'env-old', version: '1.0.0', last_modified_date: '2026-05-19T00:00:00Z',
        included_actions: [{ action_name: 'A', oid: 'act-old' }],
      },
    ],
  };
  const rewrites = new Map([['env-old', 'env-new'], ['act-old', 'act-new']]);
  const out = rewriteWorkflowOids(wf as any, rewrites);
  assert.equal(out.environment_specifications![0].oid, 'env-new');
  assert.equal((out.environment_specifications![0].included_actions![0] as any).oid, 'act-new');
  assert.equal(out.steps[0].action_proxy_config!.environment_oid, 'env-new');
  assert.equal(out.steps[0].action_proxy_config!.action_oid, 'act-new');
});

test('rewrites included_actions with action_oid field (not oid)', () => {
  const wf = {
    local_id: 'wf', oid: 'wf-oid', version: '1.0.0', last_modified_date: '2026-05-19T00:00:00Z',
    steps: [],
    connections: [],
    environment_specifications: [
      {
        local_id: 'env1', oid: 'env-old', version: '1.0.0', last_modified_date: '2026-05-19T00:00:00Z',
        included_actions: [{ action_name: 'A', action_oid: 'act-old' }],
      },
    ],
  };
  const rewrites = new Map([['act-old', 'act-new']]);
  const out = rewriteWorkflowOids(wf as any, rewrites);
  assert.equal((out.environment_specifications![0].included_actions![0] as any).action_oid, 'act-new');
});

test('preserves source object (no mutation) and returns a clone', () => {
  const wf = {
    local_id: 'wf', oid: 'wf-oid', version: '1.0.0', last_modified_date: '2026-05-19T00:00:00Z',
    steps: [],
    connections: [],
    environment_specifications: [{ local_id: 'env1', oid: 'env-old', version: '1.0.0', last_modified_date: '2026-05-19T00:00:00Z', included_actions: [] }],
  };
  const out = rewriteWorkflowOids(wf as any, new Map([['env-old', 'env-new']]));
  assert.equal((wf as any).environment_specifications[0].oid, 'env-old');
  assert.equal(out.environment_specifications![0].oid, 'env-new');
});

test('returns input unchanged (same reference) when rewrites is empty', () => {
  const wf = {
    local_id: 'wf', oid: 'wf-oid', version: '1.0.0', last_modified_date: '2026-05-19T00:00:00Z',
    steps: [],
    connections: [],
    environment_specifications: [{ local_id: 'env1', oid: 'env-1', version: '1.0.0', last_modified_date: '2026-05-19T00:00:00Z', included_actions: [] }],
  };
  const out = rewriteWorkflowOids(wf as any, new Map());
  assert.equal(out, wf);
});

test('rewrites oids in nested children (v7.0+)', () => {
  const child = {
    local_id: 'child', oid: 'child-oid', version: '1.0.0', last_modified_date: '2026-05-19T00:00:00Z',
    parentChildSpecId: null,
    steps: [
      {
        local_id: 'cs', oid: 'cs-oid', version: '1.0.0', last_modified_date: '2026-05-19T00:00:00Z',
        step_type: 'ACTION PROXY',
        action_proxy_config: { environment_oid: 'env-old', action_oid: 'act-old' },
      },
    ],
    connections: [],
    environment_specifications: [
      {
        local_id: 'cenv', oid: 'env-old', version: '1.0.0', last_modified_date: '2026-05-19T00:00:00Z',
        included_actions: [],
      },
    ],
  };
  const wf = {
    local_id: 'wf', oid: 'wf-oid', version: '1.0.0', last_modified_date: '2026-05-19T00:00:00Z',
    steps: [],
    connections: [],
    children: [child],
  };
  const rewrites = new Map([['env-old', 'env-new'], ['act-old', 'act-new']]);
  const out = rewriteWorkflowOids(wf as any, rewrites);
  assert.equal(out.children![0].environment_specifications![0].oid, 'env-new');
  assert.equal(out.children![0].steps[0].action_proxy_config!.environment_oid, 'env-new');
  assert.equal(out.children![0].steps[0].action_proxy_config!.action_oid, 'act-new');
});
