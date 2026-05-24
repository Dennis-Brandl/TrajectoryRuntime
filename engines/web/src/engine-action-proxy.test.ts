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

  it('on activation, sets state STARTING and calls invoker.invoke with action_oid + inputs', async () => {
    const invoker = new MockActionInvoker();
    const engine = new WorkflowEngine(makeActionProxyWorkflow());
    engine.setActionInvoker(invoker, new Map([['env1-oid', SERVER]]));
    engine.start();

    // Wait one microtask for the async invoke to be recorded
    await Promise.resolve();

    assert.equal(invoker.invocations.length, 1);
    const inv = invoker.lastInvocation();
    assert.equal(inv.req.serverUri, SERVER.uri);
    assert.equal(inv.req.action_oid, 'action-oid-1');
    assert.equal(inv.req.stepOid, 'ap-oid');

    const active = engine.getActiveSteps();
    const proxyStep = active.find(s => s.step.oid === 'ap-oid');
    assert.ok(proxyStep, 'ACTION PROXY step should be active');
    assert.equal(proxyStep!.step.state, 'STARTING');
  });

  it('mirrors invoker state changes onto the step; COMPLETED queues downstream activation', async () => {
    const invoker = new MockActionInvoker();
    const wf = makeActionProxyWorkflow();
    (wf.steps[1] as any).output_parameter_specifications = [
      { id: 'received_count', target: 'SomeResult' },
    ];
    const engine = new WorkflowEngine(wf);
    engine.setActionInvoker(invoker, new Map([['env1-oid', SERVER]]));
    engine.start();
    await Promise.resolve();

    invoker.emitStateChange('ap-oid', 'EXECUTING');
    let active = engine.getActiveSteps();
    assert.equal(active.find(s => s.step.oid === 'ap-oid')!.step.state, 'EXECUTING');

    invoker.emitStateChange('ap-oid', 'COMPLETED', { received_count: '42' });

    assert.equal(engine.getWorkflowState(), 'COMPLETED');
    assert.equal(engine.getProperties()['SomeResult'], '42');
  });

  it('pauseStep on ACTION PROXY forwards PAUSE command via invoker', async () => {
    const invoker = new MockActionInvoker();
    const engine = new WorkflowEngine(makeActionProxyWorkflow());
    engine.setActionInvoker(invoker, new Map([['env1-oid', SERVER]]));
    engine.start();
    await Promise.resolve();
    invoker.emitStateChange('ap-oid', 'EXECUTING');

    engine.pauseStep('ap-oid');

    assert.equal(invoker.commandsSent.length, 1);
    assert.equal(invoker.commandsSent[0].command, 'PAUSE');
    assert.equal(invoker.commandsSent[0].instanceId, invoker.lastInvocation().instanceId);
  });

  it('resumeStep on ACTION PROXY forwards RESUME command via invoker', async () => {
    const invoker = new MockActionInvoker();
    const engine = new WorkflowEngine(makeActionProxyWorkflow());
    engine.setActionInvoker(invoker, new Map([['env1-oid', SERVER]]));
    engine.start();
    await Promise.resolve();
    invoker.emitStateChange('ap-oid', 'PAUSED');

    engine.resumeStep('ap-oid');

    assert.equal(invoker.commandsSent.length, 1);
    assert.equal(invoker.commandsSent[0].command, 'RESUME');
  });

  it('stopStep on ACTION PROXY forwards STOP command via invoker', async () => {
    const invoker = new MockActionInvoker();
    const engine = new WorkflowEngine(makeActionProxyWorkflow());
    engine.setActionInvoker(invoker, new Map([['env1-oid', SERVER]]));
    engine.start();
    await Promise.resolve();
    invoker.emitStateChange('ap-oid', 'EXECUTING');

    engine.stopStep('ap-oid');

    assert.equal(invoker.commandsSent.length, 1);
    assert.equal(invoker.commandsSent[0].command, 'STOP');
  });

  it('workflow abort calls invoker.abort for each active ACTION PROXY instance', async () => {
    const invoker = new MockActionInvoker();
    const engine = new WorkflowEngine(makeActionProxyWorkflow());
    engine.setActionInvoker(invoker, new Map([['env1-oid', SERVER]]));
    engine.start();
    await Promise.resolve();
    invoker.emitStateChange('ap-oid', 'EXECUTING');
    // Wait for instanceId to be recorded (from the async invoke promise)
    await new Promise(r => setTimeout(r, 10));

    engine.abortWorkflow();

    assert.equal(invoker.aborts.length, 1);
    assert.equal(invoker.aborts[0].instanceId, invoker.lastInvocation().instanceId);
    assert.equal(engine.getWorkflowState(), 'ABORTED');
  });

  it('throws at engine construction if two environments contain the same action local_id', () => {
    const wf = makeActionProxyWorkflow();
    (wf.environment_specifications ?? []).push({
      local_id: 'env2', oid: 'env2-oid', version: '1.0.0', last_modified_date: '2026-05-23',
      included_actions: [{ local_id: 'A1', oid: 'other-oid' }],
    } as any);

    assert.throws(() => new WorkflowEngine(wf), /duplicate action local_id "A1"/);
  });
});
