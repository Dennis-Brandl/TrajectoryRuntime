// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
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
            { id: 'trigger_reason', target: 'FailureContext.Mode' },
            { id: 'error_message', target: 'FailureContext.Message' },
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
