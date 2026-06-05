// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WorkflowEngine } from './engine.js';
import type { MasterWorkflowSpecification } from './types.js';

const DATE = '2026-05-31T12:00:00.000Z';
function s(o: Record<string, unknown>) { return { version: '1.0.0', last_modified_date: DATE, ...o }; }

/** START→Action→END, with the Action's TRY (default ERROR→C1) and a CATCH→...→RETURN island. */
function tryWorkflow(opts: {
  trySpec?: unknown; catchOutputs?: unknown; returnConfig?: unknown; extraCatchSteps?: unknown[]; extraCatchConns?: unknown[];
  valueProps?: unknown;
} = {}): MasterWorkflowSpecification {
  return {
    local_id: 'wf', oid: 'wf-1', version: '1.0.0', last_modified_date: DATE, schemaVersion: '4.0',
    value_property_specifications: (opts.valueProps as never) ?? [
      { name: 'FailureContext', entries: [{ name: 'Mode', value: '' }, { name: 'Message', value: '' }] },
    ],
    steps: [
      s({ local_id: 'Start', oid: 's1', step_type: 'START' }),
      s({ local_id: 'Action', oid: 's2', step_type: 'ACTION PROXY',
          try_specifications: opts.trySpec ?? [{ mode: 'ERROR', catch_id: 'C1' }] }),
      s({ local_id: 'End', oid: 's3', step_type: 'END' }),
      s({ local_id: 'Catch', oid: 'c1', step_type: 'CATCH', catch_id: 'C1',
          output_parameter_specifications: opts.catchOutputs ?? [
            { id: 'Reason', target: 'FailureContext.Mode' },
            { id: 'Message', target: 'FailureContext.Message' },
          ] }),
      ...(opts.extraCatchSteps ?? []) as never[],
      s({ local_id: 'Ret', oid: 'r1', step_type: 'RETURN', return_config: opts.returnConfig ?? { command: 'ABANDON' } }),
    ] as never,
    connections: [
      { from_step_id: 's1', to_step_id: 's2' },
      { from_step_id: 's2', to_step_id: 's3' },
      ...(opts.extraCatchConns ?? [{ from_step_id: 'c1', to_step_id: 'r1' }]) as never[],
    ] as never,
    environment_specifications: [],
  } as MasterWorkflowSpecification;
}
function traceStates(engine: WorkflowEngine) {
  return engine.getTrace().map(t => `${t.step_oid}:${t.state}`);
}

describe('engine: fail signal (no matching TRY)', () => {
  it('errors the workflow when a failed action has no TRY', () => {
    const wf = tryWorkflow({ trySpec: [] }); // Action has no try_specifications
    const engine = new WorkflowEngine(wf);
    engine.start();
    engine.submitAction({ step_oid: 's2', action: 'fail', failure_mode: 'ERROR', error: 'boom' }, 0);
    assert.equal(engine.getWorkflowState(), 'ERRORED');
    assert.ok(traceStates(engine).includes('s2:ERRORED'));
  });
});

describe('engine: TRY routing to CATCH', () => {
  it('activates the CATCH network and writes trigger info on a matching failure', () => {
    const wf = tryWorkflow(); // Action TRY ERROR→C1; catch C1→Ret(ABANDON)
    const engine = new WorkflowEngine(wf);
    engine.start();
    engine.submitAction({ step_oid: 's2', action: 'fail', failure_mode: 'ERROR', error: 'thermocouple failure' }, 0);
    const states = traceStates(engine);
    assert.ok(states.includes('c1:COMPLETED'), `CATCH not activated: ${states.join(', ')}`);
    assert.ok(states.includes('r1:COMPLETED'), 'RETURN not reached');
    assert.equal(engine.getProperties()['FailureContext.Mode'], 'ERROR');
    assert.equal(engine.getProperties()['FailureContext.Message'], 'thermocouple failure');
    assert.notEqual(engine.getWorkflowState(), 'ERRORED'); // failure was caught
  });
});

describe('engine: RETURN ABANDON', () => {
  it('aborts the workflow and cleans up the catch context on RETURN ABANDON', () => {
    const engine = new WorkflowEngine(tryWorkflow({ returnConfig: { command: 'ABANDON' } }));
    engine.start();
    engine.submitAction({ step_oid: 's2', action: 'fail', failure_mode: 'ERROR', error: 'x' }, 0);
    assert.equal(engine.getWorkflowState(), 'ABORTED');
    assert.equal(engine.activeCatchesSize(), 0); // catch context removed when RETURN executes (spec §3.2)
  });
});

describe('engine: RETURN RESTART', () => {
  it('RESTART KEEP re-runs from START and preserves properties', () => {
    const wf = tryWorkflow({
      returnConfig: { command: 'RESTART', restart_mode: 'KEEP' },
      catchOutputs: [{ id: 'Reason', target: 'FailureContext.Mode' }],
    });
    const engine = new WorkflowEngine(wf);
    engine.start();
    engine.submitAction({ step_oid: 's2', action: 'fail', failure_mode: 'ERROR', error: 'x' }, 0);
    assert.equal(engine.getWorkflowState(), 'RUNNING');
    assert.equal(engine.getProperties()['FailureContext.Mode'], 'ERROR'); // preserved
    // Action s2 is active again after restart (re-run from START).
    assert.ok(engine.getActiveSteps().some(a => a.step.oid === 's2'));
  });

  it('RESTART CLEAN resets properties to defaults', () => {
    const wf = tryWorkflow({ returnConfig: { command: 'RESTART', restart_mode: 'CLEAN' } });
    const engine = new WorkflowEngine(wf);
    engine.start();
    engine.submitAction({ step_oid: 's2', action: 'fail', failure_mode: 'ERROR', error: 'x' }, 0);
    assert.equal(engine.getProperties()['FailureContext.Mode'], ''); // reset to declared default
  });
});

describe('engine: RETURN GOTO', () => {
  it('resumes the main flow at the GOTO target', () => {
    // main flow: Start→Action→Mid→End ; GOTO target = Mid (a USER_INTERACTION). Catch: c1→r1.
    const wf = tryWorkflow({
      returnConfig: { command: 'GOTO', goto_step_oid: 'm1' },
      extraCatchSteps: [s({ local_id: 'Mid', oid: 'm1', step_type: 'USER_INTERACTION' })],
      extraCatchConns: [{ from_step_id: 'c1', to_step_id: 'r1' }],
    });
    // rewire the connections so Mid is on the MAIN flow: Start→Action→Mid→End, plus catch c1→r1
    (wf.connections as unknown as Array<Record<string, string>>).length = 0;
    (wf.connections as unknown as Array<Record<string, string>>).push(
      { from_step_id: 's1', to_step_id: 's2' },
      { from_step_id: 's2', to_step_id: 'm1' },
      { from_step_id: 'm1', to_step_id: 's3' },
      { from_step_id: 'c1', to_step_id: 'r1' },
    );
    const engine = new WorkflowEngine(wf);
    engine.start();
    engine.submitAction({ step_oid: 's2', action: 'fail', failure_mode: 'ERROR', error: 'x' }, 0);
    assert.ok(engine.getActiveSteps().some(a => a.step.oid === 'm1'), 'GOTO target not active');
    assert.notEqual(engine.getWorkflowState(), 'ERRORED');
  });
});

describe('engine: RETURN RETRY', () => {
  it('re-invokes the trigger action; second attempt can succeed', () => {
    const engine = new WorkflowEngine(tryWorkflow({ returnConfig: { command: 'RETRY' } }));
    engine.start();
    engine.submitAction({ step_oid: 's2', action: 'fail', failure_mode: 'ERROR', error: 'x' }, 0);
    // After RETRY, s2 is EXECUTING again — supply a successful completion.
    assert.ok(engine.getActiveSteps().some(a => a.step.oid === 's2'), 's2 not re-activated');
    engine.submitAction({ step_oid: 's2', action: 'submit', form_values: {} }, 1);
    assert.equal(engine.getWorkflowState(), 'COMPLETED');
  });
});
