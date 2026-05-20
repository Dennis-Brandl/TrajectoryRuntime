// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { validateWorkflow } from './validator.js';

function wfWithActionProxyStep(stepExtras: Record<string, unknown>, envs: unknown[] = []): Record<string, unknown> {
  return {
    local_id: 'wf', oid: 'wf-oid', version: '1.0.0', last_modified_date: '2026-05-19T00:00:00Z',
    steps: [
      { local_id: 'start', oid: 'step-start', version: '1.0.0', last_modified_date: '2026-05-19T00:00:00Z', step_type: 'START' },
      { local_id: 'act', oid: 'step-act', version: '1.0.0', last_modified_date: '2026-05-19T00:00:00Z', step_type: 'ACTION PROXY', ...stepExtras },
      { local_id: 'end', oid: 'step-end', version: '1.0.0', last_modified_date: '2026-05-19T00:00:00Z', step_type: 'END' },
    ],
    connections: [
      { from_step_id: 'step-start', to_step_id: 'step-act' },
      { from_step_id: 'step-act', to_step_id: 'step-end' },
    ],
    environment_specifications: envs,
  };
}

const ENV_WITH_ACT_1 = [{ local_id: 'env', oid: 'env-1', version: '1.0.0', last_modified_date: '2026-05-19T00:00:00Z', included_actions: [{ action_oid: 'act-1', action_name: 'Act One', action_library: 'lib' }] }];

test('ACTION PROXY without action_proxy_config is rejected', () => {
  const r = validateWorkflow(wfWithActionProxyStep({}, ENV_WITH_ACT_1));
  assert.equal(r.valid, false);
  assert.equal(r.error_code, 'INVALID_VALIDATION');
  assert.match(r.error_message!, /missing action_proxy_config/);
});

test('ACTION PROXY with unknown environment_oid is rejected', () => {
  const r = validateWorkflow(wfWithActionProxyStep({ action_proxy_config: { action_oid: 'act-1', environment_oid: 'env-missing' } }, []));
  assert.equal(r.valid, false);
  assert.equal(r.error_code, 'INVALID_VALIDATION');
  assert.match(r.error_message!, /env-missing/);
});

test('ACTION PROXY with unknown action_oid is rejected', () => {
  const r = validateWorkflow(wfWithActionProxyStep(
    { action_proxy_config: { action_oid: 'act-missing', environment_oid: 'env-1' } },
    ENV_WITH_ACT_1,
  ));
  assert.equal(r.valid, false);
  assert.equal(r.error_code, 'INVALID_VALIDATION');
  assert.match(r.error_message!, /act-missing/);
});

test('ACTION PROXY with valid config is accepted', () => {
  const r = validateWorkflow(wfWithActionProxyStep(
    { action_proxy_config: { action_oid: 'act-1', environment_oid: 'env-1' } },
    ENV_WITH_ACT_1,
  ));
  assert.equal(r.valid, true);
});
