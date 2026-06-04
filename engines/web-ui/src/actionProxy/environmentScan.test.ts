// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { environmentsNeedingBinding } from './environmentScan.js';
import type { MasterWorkflowSpecification } from '@engine/types.js';

test('returns environments referenced by an ACTION PROXY step', () => {
  const wf: MasterWorkflowSpecification = {
    local_id: 'wf', oid: 'wf-oid', version: '1.0.0', last_modified_date: '2026-05-19T00:00:00Z',
    steps: [
      { local_id: 'start', oid: 'step-start', version: '1.0.0', last_modified_date: '2026-05-19T00:00:00Z', step_type: 'START' },
      { local_id: 'act1', oid: 'step-a', version: '1.0.0', last_modified_date: '2026-05-19T00:00:00Z', step_type: 'ACTION PROXY', action_proxy_config: { action_oid: 'act-1', environment_oid: 'env-1' } },
      { local_id: 'end', oid: 'step-end', version: '1.0.0', last_modified_date: '2026-05-19T00:00:00Z', step_type: 'END' },
    ],
    connections: [],
    environment_specifications: [
      { local_id: 'env1', oid: 'env-1', version: '1.0.0', last_modified_date: '2026-05-19T00:00:00Z', action_server_specifications: [{ name: 's', uri: 'http://localhost:3002', connection_type: 'REST' }] },
      { local_id: 'env2', oid: 'env-2', version: '1.0.0', last_modified_date: '2026-05-19T00:00:00Z' },
    ],
  };
  const needed = environmentsNeedingBinding(wf);
  assert.equal(needed.length, 1);
  assert.equal(needed[0].oid, 'env-1');
});

test('returns nothing when no ACTION PROXY step uses the env', () => {
  const wf: MasterWorkflowSpecification = {
    local_id: 'wf', oid: 'wf-oid', version: '1.0.0', last_modified_date: '2026-05-19T00:00:00Z',
    steps: [],
    connections: [],
    environment_specifications: [
      { local_id: 'env1', oid: 'env-1', version: '1.0.0', last_modified_date: '2026-05-19T00:00:00Z', action_server_specifications: [{ name: 's', uri: 'http://localhost:3002', connection_type: 'REST' }] },
    ],
  };
  assert.equal(environmentsNeedingBinding(wf).length, 0);
});
