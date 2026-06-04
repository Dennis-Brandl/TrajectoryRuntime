// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WorkflowEngine } from './engine.js';
import type { MasterWorkflowSpecification } from './types.js';

/**
 * Integration tests for YES/NO routing with source_handle_id connections
 * and WAIT ANY step behavior — the patterns used in real Trajectory workflows.
 */

function makeYesNoBranchWorkflow(useSourceHandleId: boolean): MasterWorkflowSpecification {
  // YES_NO → yes → extra step → WAIT ANY → END
  //        → no  ──────────────→ WAIT ANY
  return {
    local_id: 'wf-yesno',
    oid: 'wf-yesno-oid',
    version: '1.0.0',
    last_modified_date: '2026-03-09T00:00:00Z',
    schemaVersion: '4.0',
    steps: [
      { local_id: 'start', oid: 'start', version: '1.0.0', last_modified_date: '2026-03-09', step_type: 'START' },
      {
        local_id: 'yesno', oid: 'yesno', version: '1.0.0', last_modified_date: '2026-03-09',
        step_type: 'YES_NO',
        yes_no_config: { yes_label: 'Yes', no_label: 'No', yes_value: 'true', no_value: 'false' },
      },
      {
        local_id: 'extra-work', oid: 'extra-work', version: '1.0.0', last_modified_date: '2026-03-09',
        step_type: 'USER_INTERACTION',
        description: 'Extra work on yes path',
        form_layout_config: [{
          deviceType: 'phone' as const, canvasWidth: 390, canvasHeight: 844,
          elements: [{ type: 'button' as const, x: 0, y: 0, width: 100, height: 40, label: 'Done', outputValue: 'done' }],
        }],
      },
      { local_id: 'rejoin', oid: 'rejoin', version: '1.0.0', last_modified_date: '2026-03-09', step_type: 'WAIT ANY' },
      { local_id: 'end', oid: 'end', version: '1.0.0', last_modified_date: '2026-03-09', step_type: 'END' },
    ],
    connections: useSourceHandleId
      ? [
          { from_step_id: 'start', to_step_id: 'yesno' },
          { from_step_id: 'yesno', to_step_id: 'extra-work', source_handle_id: 'yes' },
          { from_step_id: 'yesno', to_step_id: 'rejoin', source_handle_id: 'no' },
          { from_step_id: 'extra-work', to_step_id: 'rejoin' },
          { from_step_id: 'rejoin', to_step_id: 'end' },
        ]
      : [
          { from_step_id: 'start', to_step_id: 'yesno' },
          { from_step_id: 'yesno', to_step_id: 'extra-work', condition: 'True' },
          { from_step_id: 'yesno', to_step_id: 'rejoin', condition: 'False' },
          { from_step_id: 'extra-work', to_step_id: 'rejoin' },
          { from_step_id: 'rejoin', to_step_id: 'end' },
        ],
  } as unknown as MasterWorkflowSpecification;
}

describe('YES/NO routing with source_handle_id', () => {
  it('YES press activates yes-path step (source_handle_id)', () => {
    const engine = new WorkflowEngine(makeYesNoBranchWorkflow(true));
    engine.start();

    // YES_NO should be executing
    const executing = engine.getExecutingSteps();
    assert.equal(executing.length, 1);
    assert.equal(executing[0].oid, 'yesno');

    // Press YES
    engine.submitAction({ step_oid: 'yesno', action: 'button_press', button_output: 'true' }, 0);

    // extra-work should now be executing (yes path)
    const after = engine.getExecutingSteps();
    assert.equal(after.length, 1);
    assert.equal(after[0].oid, 'extra-work');
    assert.equal(engine.getWorkflowState(), 'RUNNING');

    // Complete extra-work → rejoin (WAIT ANY) → END
    engine.submitAction({ step_oid: 'extra-work', action: 'button_press', button_output: 'done' }, 1);
    assert.equal(engine.getWorkflowState(), 'COMPLETED');
  });

  it('NO press skips yes-path and goes through WAIT ANY to END (source_handle_id)', () => {
    const engine = new WorkflowEngine(makeYesNoBranchWorkflow(true));
    engine.start();

    // Press NO
    engine.submitAction({ step_oid: 'yesno', action: 'button_press', button_output: 'false' }, 0);

    // Should go directly through WAIT ANY → END
    assert.equal(engine.getWorkflowState(), 'COMPLETED');

    // Verify trace: start → yesno(executing) → yesno(completed) → rejoin(completed) → end(completed)
    const trace = engine.getTrace();
    const traceSteps = trace.map(t => `${t.step_oid}:${t.state}`);
    assert.ok(traceSteps.includes('rejoin:COMPLETED'), 'WAIT ANY should complete');
    assert.ok(traceSteps.includes('end:COMPLETED'), 'END should complete');
    assert.ok(!traceSteps.includes('extra-work:EXECUTING'), 'extra-work should NOT execute on NO path');
  });

  it('YES press works with condition-based connections (backward compat)', () => {
    const engine = new WorkflowEngine(makeYesNoBranchWorkflow(false));
    engine.start();

    engine.submitAction({ step_oid: 'yesno', action: 'button_press', button_output: 'true' }, 0);

    const after = engine.getExecutingSteps();
    assert.equal(after.length, 1);
    assert.equal(after[0].oid, 'extra-work');
  });

  it('NO press works with condition-based connections (backward compat)', () => {
    const engine = new WorkflowEngine(makeYesNoBranchWorkflow(false));
    engine.start();

    engine.submitAction({ step_oid: 'yesno', action: 'button_press', button_output: 'false' }, 0);
    assert.equal(engine.getWorkflowState(), 'COMPLETED');
  });
});

describe('YES/NO routing with outputValue-based source_handle_id', () => {
  function makeOutputValueWorkflow(): MasterWorkflowSpecification {
    return {
      local_id: 'wf-ov', oid: 'wf-ov-oid', version: '1.0.0', last_modified_date: '2026-03-10', schemaVersion: '4.0',
      steps: [
        { local_id: 'start', oid: 'start', version: '1.0.0', last_modified_date: '2026-03-10', step_type: 'START' },
        {
          local_id: 'yesno', oid: 'yesno', version: '1.0.0', last_modified_date: '2026-03-10',
          step_type: 'YES_NO',
          yes_no_config: { yes_label: 'Approve', no_label: 'Reject', yes_value: 'approved', no_value: 'rejected' },
        },
        { local_id: 'end-yes', oid: 'end-yes', version: '1.0.0', last_modified_date: '2026-03-10', step_type: 'END' },
        { local_id: 'end-no', oid: 'end-no', version: '1.0.0', last_modified_date: '2026-03-10', step_type: 'END' },
      ],
      connections: [
        { from_step_id: 'start', to_step_id: 'yesno' },
        { from_step_id: 'yesno', to_step_id: 'end-yes', source_handle_id: 'approved' },
        { from_step_id: 'yesno', to_step_id: 'end-no', source_handle_id: 'rejected' },
      ],
    } as unknown as MasterWorkflowSpecification;
  }

  it('routes to approved path when outputValue matches source_handle_id', () => {
    const engine = new WorkflowEngine(makeOutputValueWorkflow());
    engine.start();
    engine.submitAction({ step_oid: 'yesno', action: 'button_press', button_output: 'approved' }, 0);
    assert.equal(engine.getWorkflowState(), 'COMPLETED');
    const trace = engine.getTrace();
    assert.ok(trace.some(t => t.step_oid === 'end-yes' && t.state === 'COMPLETED'));
    assert.ok(!trace.some(t => t.step_oid === 'end-no'));
  });

  it('routes to rejected path when outputValue matches source_handle_id', () => {
    const engine = new WorkflowEngine(makeOutputValueWorkflow());
    engine.start();
    engine.submitAction({ step_oid: 'yesno', action: 'button_press', button_output: 'rejected' }, 0);
    assert.equal(engine.getWorkflowState(), 'COMPLETED');
    const trace = engine.getTrace();
    assert.ok(trace.some(t => t.step_oid === 'end-no' && t.state === 'COMPLETED'));
    assert.ok(!trace.some(t => t.step_oid === 'end-yes'));
  });
});

describe('WAIT ANY step behavior', () => {
  it('WAIT ANY auto-completes when reached by any path', () => {
    const engine = new WorkflowEngine(makeYesNoBranchWorkflow(true));
    engine.start();

    // NO path goes directly to WAIT ANY
    engine.submitAction({ step_oid: 'yesno', action: 'button_press', button_output: 'false' }, 0);

    const trace = engine.getTrace();
    const rejoinTrace = trace.filter(t => t.step_oid === 'rejoin');
    assert.equal(rejoinTrace.length, 1);
    assert.equal(rejoinTrace[0].state, 'COMPLETED');
  });

  it('WAIT ANY does not block when only one branch fires', () => {
    // This verifies WAIT ANY doesn't act like WAIT ALL
    const engine = new WorkflowEngine(makeYesNoBranchWorkflow(true));
    engine.start();

    // NO path: only the no-connection fires, the yes-path doesn't
    engine.submitAction({ step_oid: 'yesno', action: 'button_press', button_output: 'false' }, 0);

    // Should complete, not be stuck waiting for the yes-path
    assert.equal(engine.getWorkflowState(), 'COMPLETED');
  });
});
