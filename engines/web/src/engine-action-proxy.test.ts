// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WorkflowEngine } from './engine.js';
import { MockActionInvoker } from './mock-action-invoker.js';
import type { MasterWorkflowSpecification, ActionServerSpecification } from './types.js';

const SERVER: ActionServerSpecification = {
  name: 'Test', uri: 'http://localhost:9999/trajectory/v1/', connection_type: 'REST',
};

function makeActionProxyWorkflow(): MasterWorkflowSpecification {
  return {
    local_id: 'wf', oid: 'wf-oid', version: '1.0.0', last_modified_date: '2026-05-23',
    steps: [
      { local_id: 'start', oid: 'start', version: '1.0.0', last_modified_date: '2026-05-23', step_type: 'START' },
      { local_id: 'A1', oid: 'ap-oid', version: '1.0.0', last_modified_date: '2026-05-23', step_type: 'ACTION PROXY' },
      { local_id: 'end', oid: 'end', version: '1.0.0', last_modified_date: '2026-05-23', step_type: 'END' },
    ],
    connections: [
      { from_step_id: 'start', to_step_id: 'ap-oid' },
      { from_step_id: 'ap-oid', to_step_id: 'end' },
    ],
    environment_specifications: [{
      local_id: 'env1', oid: 'env1-oid', version: '1.0.0', last_modified_date: '2026-05-23',
      included_actions: [{ local_id: 'A1', oid: 'action-oid-1' }],
      action_server_specifications: [SERVER],
    } as any],
  } as MasterWorkflowSpecification;
}

describe('engine ACTION PROXY — invoker injection', () => {
  it('accepts an ActionInvoker via setActionInvoker', () => {
    const invoker = new MockActionInvoker();
    const engine = new WorkflowEngine(makeActionProxyWorkflow());
    engine.setActionInvoker(invoker, new Map([['env1-oid', SERVER]]));
    assert.ok(true);
  });
});
