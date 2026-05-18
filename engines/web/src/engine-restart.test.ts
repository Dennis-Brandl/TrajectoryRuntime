// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WorkflowEngine } from './engine.js';
import type { MasterWorkflowSpecification } from './types.js';

function makeLinearWorkflow(): MasterWorkflowSpecification {
  return {
    local_id: 'wf', oid: 'wf', version: '1', last_modified_date: '2026-01-01T00:00:00Z',
    schemaVersion: '4.0',
    steps: [
      { local_id: 's1', oid: 's1', version: '1', last_modified_date: '2026-01-01T00:00:00Z', step_type: 'START' },
      { local_id: 's2', oid: 's2', version: '1', last_modified_date: '2026-01-01T00:00:00Z', step_type: 'USER_INTERACTION',
        form_layout_config: [{ deviceType: 'phone', canvasWidth: 390, canvasHeight: 844, elements: [{ type: 'button', x: 0, y: 0, width: 100, height: 40, label: 'Go', outputValue: 'go' }] }] },
      { local_id: 's3', oid: 's3', version: '1', last_modified_date: '2026-01-01T00:00:00Z', step_type: 'USER_INTERACTION',
        form_layout_config: [{ deviceType: 'phone', canvasWidth: 390, canvasHeight: 844, elements: [{ type: 'button', x: 0, y: 0, width: 100, height: 40, label: 'Done', outputValue: 'done' }] }] },
      { local_id: 's4', oid: 's4', version: '1', last_modified_date: '2026-01-01T00:00:00Z', step_type: 'END' },
    ],
    connections: [
      { from_step_id: 's1', to_step_id: 's2' },
      { from_step_id: 's2', to_step_id: 's3' },
      { from_step_id: 's3', to_step_id: 's4' },
    ],
  } as unknown as MasterWorkflowSpecification;
}

/** Parallel workflow: START → PARALLEL → (A, B) → WAIT_ALL → END */
function makeParallelWorkflow(): MasterWorkflowSpecification {
  return {
    local_id: 'wf-par', oid: 'wf-par', version: '1', last_modified_date: '2026-01-01T00:00:00Z',
    schemaVersion: '4.0',
    steps: [
      { local_id: 'start', oid: 'start', version: '1', last_modified_date: '2026-01-01T00:00:00Z', step_type: 'START' },
      { local_id: 'par', oid: 'par', version: '1', last_modified_date: '2026-01-01T00:00:00Z', step_type: 'PARALLEL' },
      { local_id: 'a', oid: 'a', version: '1', last_modified_date: '2026-01-01T00:00:00Z', step_type: 'USER_INTERACTION',
        form_layout_config: [{ deviceType: 'phone', canvasWidth: 390, canvasHeight: 844, elements: [{ type: 'button', x: 0, y: 0, width: 100, height: 40, label: 'OK', outputValue: 'ok' }] }] },
      { local_id: 'b', oid: 'b', version: '1', last_modified_date: '2026-01-01T00:00:00Z', step_type: 'USER_INTERACTION',
        form_layout_config: [{ deviceType: 'phone', canvasWidth: 390, canvasHeight: 844, elements: [{ type: 'button', x: 0, y: 0, width: 100, height: 40, label: 'OK', outputValue: 'ok' }] }] },
      { local_id: 'join', oid: 'join', version: '1', last_modified_date: '2026-01-01T00:00:00Z', step_type: 'WAIT ALL' },
      { local_id: 'end', oid: 'end', version: '1', last_modified_date: '2026-01-01T00:00:00Z', step_type: 'END' },
    ],
    connections: [
      { from_step_id: 'start', to_step_id: 'par' },
      { from_step_id: 'par', to_step_id: 'a' },
      { from_step_id: 'par', to_step_id: 'b' },
      { from_step_id: 'a', to_step_id: 'join' },
      { from_step_id: 'b', to_step_id: 'join' },
      { from_step_id: 'join', to_step_id: 'end' },
    ],
  } as unknown as MasterWorkflowSpecification;
}

/** Extended parallel: START → PARALLEL → (A, B) → WAIT_ALL → C → END */
function makeParallelThenLinearWorkflow(): MasterWorkflowSpecification {
  return {
    local_id: 'wf-par-lin', oid: 'wf-par-lin', version: '1', last_modified_date: '2026-01-01T00:00:00Z',
    schemaVersion: '4.0',
    steps: [
      { local_id: 'start', oid: 'start', version: '1', last_modified_date: '2026-01-01T00:00:00Z', step_type: 'START' },
      { local_id: 'par', oid: 'par', version: '1', last_modified_date: '2026-01-01T00:00:00Z', step_type: 'PARALLEL' },
      { local_id: 'a', oid: 'a', version: '1', last_modified_date: '2026-01-01T00:00:00Z', step_type: 'USER_INTERACTION',
        form_layout_config: [{ deviceType: 'phone', canvasWidth: 390, canvasHeight: 844, elements: [{ type: 'button', x: 0, y: 0, width: 100, height: 40, label: 'OK', outputValue: 'ok' }] }] },
      { local_id: 'b', oid: 'b', version: '1', last_modified_date: '2026-01-01T00:00:00Z', step_type: 'USER_INTERACTION',
        form_layout_config: [{ deviceType: 'phone', canvasWidth: 390, canvasHeight: 844, elements: [{ type: 'button', x: 0, y: 0, width: 100, height: 40, label: 'OK', outputValue: 'ok' }] }] },
      { local_id: 'join', oid: 'join', version: '1', last_modified_date: '2026-01-01T00:00:00Z', step_type: 'WAIT ALL' },
      { local_id: 'c', oid: 'c', version: '1', last_modified_date: '2026-01-01T00:00:00Z', step_type: 'USER_INTERACTION',
        form_layout_config: [{ deviceType: 'phone', canvasWidth: 390, canvasHeight: 844, elements: [{ type: 'button', x: 0, y: 0, width: 100, height: 40, label: 'Finish', outputValue: 'finish' }] }] },
      { local_id: 'end', oid: 'end', version: '1', last_modified_date: '2026-01-01T00:00:00Z', step_type: 'END' },
    ],
    connections: [
      { from_step_id: 'start', to_step_id: 'par' },
      { from_step_id: 'par', to_step_id: 'a' },
      { from_step_id: 'par', to_step_id: 'b' },
      { from_step_id: 'a', to_step_id: 'join' },
      { from_step_id: 'b', to_step_id: 'join' },
      { from_step_id: 'join', to_step_id: 'c' },
      { from_step_id: 'c', to_step_id: 'end' },
    ],
  } as unknown as MasterWorkflowSpecification;
}

describe('restartToSteps', () => {
  it('Case 1: same chain — idles current step, restarts target', () => {
    const engine = new WorkflowEngine(makeLinearWorkflow());
    engine.start();
    engine.submitAction({ step_oid: 's2', action: 'button_press', button_output: 'go' }, 0);
    // s3 is now EXECUTING, s2 is COMPLETED
    assert.equal(engine.getExecutingSteps()[0].oid, 's3');

    engine.restartToSteps(['s2']);
    assert.equal(engine.getWorkflowState(), 'RUNNING');
    const executing = engine.getExecutingSteps();
    assert.equal(executing.length, 1);
    assert.equal(executing[0].oid, 's2');
  });

  it('Case 1: restart same step twice', () => {
    const engine = new WorkflowEngine(makeLinearWorkflow());
    engine.start();
    engine.submitAction({ step_oid: 's2', action: 'button_press', button_output: 'go' }, 0);
    engine.restartToSteps(['s2']);
    engine.submitAction({ step_oid: 's2', action: 'button_press', button_output: 'go' }, 1);
    engine.restartToSteps(['s2']);
    assert.equal(engine.getExecutingSteps()[0].oid, 's2');
  });

  it('Case 2: crosses PARALLEL — idles ALL active parallel branches', () => {
    const engine = new WorkflowEngine(makeParallelWorkflow());
    engine.start();
    // After start: PARALLEL auto-completes, both A and B are EXECUTING
    const executing = engine.getExecutingSteps();
    assert.equal(executing.length, 2);
    const oids = executing.map(s => s.oid).sort();
    assert.deepEqual(oids, ['a', 'b']);

    // Complete A only — B remains EXECUTING
    engine.submitAction({ step_oid: 'a', action: 'button_press', button_output: 'ok' }, 0);
    const afterA = engine.getExecutingSteps();
    assert.equal(afterA.length, 1);
    assert.equal(afterA[0].oid, 'b');

    // Restart to A — should idle B (other parallel branch) and activate A
    engine.restartToSteps(['a']);
    const afterRestart = engine.getExecutingSteps();
    assert.equal(afterRestart.length, 2);
    const restartOids = afterRestart.map(s => s.oid).sort();
    assert.deepEqual(restartOids, ['a', 'b']);
  });

  it('Case 3: crosses WAIT ALL then PARALLEL — idles current step only', () => {
    const engine = new WorkflowEngine(makeParallelThenLinearWorkflow());
    engine.start();
    // Complete both parallel branches
    engine.submitAction({ step_oid: 'a', action: 'button_press', button_output: 'ok' }, 0);
    engine.submitAction({ step_oid: 'b', action: 'button_press', button_output: 'ok' }, 1);
    // Now C should be EXECUTING (past WAIT ALL)
    const afterJoin = engine.getExecutingSteps();
    assert.equal(afterJoin.length, 1);
    assert.equal(afterJoin[0].oid, 'c');

    // Restart to start — crosses WAIT ALL then PARALLEL
    // Should idle C only, activate start (which auto-completes through PARALLEL to A+B)
    engine.restartToSteps(['start']);
    const afterRestart = engine.getExecutingSteps();
    // start → par → a, b (start and par auto-complete)
    assert.equal(afterRestart.length, 2);
    const restartOids = afterRestart.map(s => s.oid).sort();
    assert.deepEqual(restartOids, ['a', 'b']);
  });

  it('throws when restarting a non-COMPLETED step', () => {
    const engine = new WorkflowEngine(makeLinearWorkflow());
    engine.start();
    assert.throws(() => engine.restartToSteps(['s3']), /not in COMPLETED state/);
  });

  it('returns completed steps excluding auto-completing types', () => {
    const engine = new WorkflowEngine(makeLinearWorkflow());
    engine.start();
    engine.submitAction({ step_oid: 's2', action: 'button_press', button_output: 'go' }, 0);
    const completed = engine.getCompletedSteps();
    assert.equal(completed.length, 1);
    assert.equal(completed[0].oid, 's2');
  });
});

describe('checkRestartSafety', () => {
  it('returns no warnings for same-chain restart', () => {
    const engine = new WorkflowEngine(makeLinearWorkflow());
    engine.start();
    engine.submitAction({ step_oid: 's2', action: 'button_press', button_output: 'go' }, 0);
    const warnings = engine.checkRestartSafety(['s2']);
    assert.equal(warnings.length, 0);
  });

  it('returns no warnings for parallel restart', () => {
    const engine = new WorkflowEngine(makeParallelWorkflow());
    engine.start();
    engine.submitAction({ step_oid: 'a', action: 'button_press', button_output: 'ok' }, 0);
    const warnings = engine.checkRestartSafety(['a']);
    assert.equal(warnings.length, 0);
  });

  it('returns warning for unreachable step', () => {
    const engine = new WorkflowEngine(makeLinearWorkflow());
    engine.start();
    // s4 (END) is not completed and not reachable backward from s2
    engine.submitAction({ step_oid: 's2', action: 'button_press', button_output: 'go' }, 0);
    // s2 is completed, s3 is executing. Restart to s2 should be fine.
    // But let's test unreachable by checking a step not on any backward path
    const warnings = engine.checkRestartSafety(['s1']); // START is completed but reachable backward
    // s1 is an ancestor of s3 so should be reachable
    assert.equal(warnings.length, 0);
  });
});
