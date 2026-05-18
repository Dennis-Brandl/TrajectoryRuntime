// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WorkflowEngine } from './engine.js';
import { InMemoryResourceManager } from './resource-manager.js';
import type { MasterWorkflowSpecification } from './types.js';

/**
 * Two parallel USER_INTERACTION steps both try to Acquire the same exclusive
 * resource. One gets it (EXECUTING), the other enters WAITING.
 */
function makeWaitingWorkflow(): MasterWorkflowSpecification {
  return {
    local_id: 'wf-waiting-ui',
    oid: 'wf-waiting-oid',
    version: '1.0.0',
    last_modified_date: '2026-03-12',
    schemaVersion: '4.0',
    resource_property_specifications: [
      { name: 'Printer', resource_type: 'binary exclusive use' },
    ],
    steps: [
      { local_id: 'start', oid: 'start', version: '1.0.0', last_modified_date: '2026-03-12', step_type: 'START' },
      { local_id: 'parallel', oid: 'parallel', version: '1.0.0', last_modified_date: '2026-03-12', step_type: 'PARALLEL' },
      {
        local_id: 'step-a', oid: 'step-a', version: '1.0.0', last_modified_date: '2026-03-12',
        step_type: 'USER_INTERACTION', description: 'Use Printer A',
        resource_command_specifications: [
          { command_type: 'Acquire', resource_name: 'Printer' },
          { command_type: 'Release', resource_name: 'Printer' },
        ],
      },
      {
        local_id: 'step-b', oid: 'step-b', version: '1.0.0', last_modified_date: '2026-03-12',
        step_type: 'USER_INTERACTION', description: 'Use Printer B',
        resource_command_specifications: [
          { command_type: 'Acquire', resource_name: 'Printer' },
          { command_type: 'Release', resource_name: 'Printer' },
        ],
      },
      { local_id: 'wait', oid: 'wait', version: '1.0.0', last_modified_date: '2026-03-12', step_type: 'WAIT ALL' },
      { local_id: 'end', oid: 'end', version: '1.0.0', last_modified_date: '2026-03-12', step_type: 'END' },
    ],
    connections: [
      { from_step_id: 'start', to_step_id: 'parallel' },
      { from_step_id: 'parallel', to_step_id: 'step-a' },
      { from_step_id: 'parallel', to_step_id: 'step-b' },
      { from_step_id: 'step-a', to_step_id: 'wait' },
      { from_step_id: 'step-b', to_step_id: 'wait' },
      { from_step_id: 'wait', to_step_id: 'end' },
    ],
  } as unknown as MasterWorkflowSpecification;
}

/** Simple linear workflow: START → USER_INTERACTION → END */
function makeSimpleWorkflow(): MasterWorkflowSpecification {
  return {
    local_id: 'wf-simple', oid: 'wf-simple', version: '1.0.0', last_modified_date: '2026-03-12',
    schemaVersion: '4.0',
    steps: [
      { local_id: 'start', oid: 'start', version: '1.0.0', last_modified_date: '2026-03-12', step_type: 'START' },
      { local_id: 'ui', oid: 'ui', version: '1.0.0', last_modified_date: '2026-03-12', step_type: 'USER_INTERACTION', description: 'Do something' },
      { local_id: 'end', oid: 'end', version: '1.0.0', last_modified_date: '2026-03-12', step_type: 'END' },
    ],
    connections: [
      { from_step_id: 'start', to_step_id: 'ui' },
      { from_step_id: 'ui', to_step_id: 'end' },
    ],
  } as unknown as MasterWorkflowSpecification;
}

describe('getWaitingSteps', () => {
  it('returns WAITING step with resource info after parallel acquire contention', () => {
    const mgr = new InMemoryResourceManager();
    const engine = new WorkflowEngine(makeWaitingWorkflow(), { resourceManager: mgr });
    engine.start();

    const executing = engine.getExecutingSteps();
    const waiting = engine.getWaitingSteps();

    assert.equal(executing.length, 1, 'one step executing');
    assert.equal(waiting.length, 1, 'one step waiting');

    const w = waiting[0];
    assert.equal(w.workflowName, 'wf-waiting-ui');
    assert.equal(w.resourceName, 'Printer');
    assert.equal(w.commandType, 'Acquire');
    assert.equal(w.step.state, 'WAITING');
  });

  it('returns empty array when no steps are waiting', () => {
    const engine = new WorkflowEngine(makeSimpleWorkflow());
    engine.start();
    assert.deepEqual(engine.getWaitingSteps(), []);
  });
});

describe('getActiveSteps', () => {
  it('returns both EXECUTING and WAITING steps', () => {
    const mgr = new InMemoryResourceManager();
    const engine = new WorkflowEngine(makeWaitingWorkflow(), { resourceManager: mgr });
    engine.start();

    const active = engine.getActiveSteps();
    assert.equal(active.length, 2, 'two active steps (1 executing + 1 waiting)');

    const states = active.map(a => a.step.state).sort();
    assert.deepEqual(states, ['EXECUTING', 'WAITING']);

    const waitingInfo = active.find(a => a.step.state === 'WAITING')!;
    assert.equal(waitingInfo.waitingOn?.resourceName, 'Printer');
    assert.equal(waitingInfo.waitingOn?.commandType, 'Acquire');
    assert.equal(waitingInfo.workflowName, 'wf-waiting-ui');

    const executingInfo = active.find(a => a.step.state === 'EXECUTING')!;
    assert.equal(executingInfo.waitingOn, undefined);
  });

  it('includes PAUSED steps', () => {
    const engine = new WorkflowEngine(makeSimpleWorkflow());
    engine.start();

    assert.equal(engine.getActiveSteps().length, 1);
    assert.equal(engine.getActiveSteps()[0].step.state, 'EXECUTING');

    // Pause the step
    engine.submitAction({ step_oid: 'ui', action: 'pause' }, 0);
    const active = engine.getActiveSteps();
    assert.equal(active.length, 1);
    assert.equal(active[0].step.state, 'PAUSED');
  });
});

describe('pause and resume', () => {
  it('pause transitions EXECUTING → PAUSED', () => {
    const engine = new WorkflowEngine(makeSimpleWorkflow());
    engine.start();

    const before = engine.getExecutingSteps();
    assert.equal(before.length, 1);
    assert.equal(before[0].oid, 'ui');

    engine.submitAction({ step_oid: 'ui', action: 'pause' }, 0);

    // No longer in executing steps
    assert.equal(engine.getExecutingSteps().length, 0);
    // But still in active steps as PAUSED
    const active = engine.getActiveSteps();
    assert.equal(active.length, 1);
    assert.equal(active[0].step.state, 'PAUSED');
  });

  it('resume transitions PAUSED → EXECUTING', () => {
    const engine = new WorkflowEngine(makeSimpleWorkflow());
    engine.start();

    engine.submitAction({ step_oid: 'ui', action: 'pause' }, 0);
    assert.equal(engine.getActiveSteps()[0].step.state, 'PAUSED');

    engine.submitAction({ step_oid: 'ui', action: 'resume' }, 1);
    assert.equal(engine.getActiveSteps()[0].step.state, 'EXECUTING');
    assert.equal(engine.getExecutingSteps().length, 1);
  });

  it('pause on non-EXECUTING step is a no-op', () => {
    const engine = new WorkflowEngine(makeSimpleWorkflow());
    engine.start();

    // Pause, then try to pause again
    engine.submitAction({ step_oid: 'ui', action: 'pause' }, 0);
    engine.submitAction({ step_oid: 'ui', action: 'pause' }, 1); // no-op
    assert.equal(engine.getActiveSteps()[0].step.state, 'PAUSED');
  });

  it('resume on non-PAUSED step is a no-op', () => {
    const engine = new WorkflowEngine(makeSimpleWorkflow());
    engine.start();

    engine.submitAction({ step_oid: 'ui', action: 'resume' }, 0); // no-op, it's EXECUTING
    assert.equal(engine.getActiveSteps()[0].step.state, 'EXECUTING');
  });

  it('trace records PAUSED and EXECUTING transitions', () => {
    const engine = new WorkflowEngine(makeSimpleWorkflow());
    engine.start();

    engine.submitAction({ step_oid: 'ui', action: 'pause' }, 0);
    engine.submitAction({ step_oid: 'ui', action: 'resume' }, 1);

    const trace = engine.getTrace();
    const uiStates = trace.filter(t => t.step_oid === 'ui').map(t => t.state);
    assert.ok(uiStates.includes('PAUSED'), 'trace includes PAUSED');
    assert.ok(uiStates.filter(s => s === 'EXECUTING').length >= 1, 'trace includes EXECUTING after resume');
  });
});
