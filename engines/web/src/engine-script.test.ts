// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WorkflowEngine } from './engine.js';
import type { MasterWorkflowSpecification } from './types.js';

function makeScriptWorkflow(
  source: string | undefined,
  inputSpecs?: { id: string; default_value: string; value_type?: string }[],
  outputSpecs?: { id: string; target: string }[],
  valueProps?: { name: string; entries: { name: string; value: string }[] }[],
): MasterWorkflowSpecification {
  return {
    local_id: 'wf-script',
    oid: 'wf-script-oid',
    version: '1.0.0',
    last_modified_date: '2026-03-10',
    schemaVersion: '4.0',
    steps: [
      { local_id: 'start', oid: 'start', version: '1.0.0', last_modified_date: '2026-03-10', step_type: 'START' },
      {
        local_id: 'script', oid: 'script', version: '1.0.0', last_modified_date: '2026-03-10',
        step_type: 'SCRIPT',
        script_config: source !== undefined ? { language: 'javascript', source } : undefined,
        input_parameter_specifications: inputSpecs,
        output_parameter_specifications: outputSpecs,
      },
      { local_id: 'end', oid: 'end', version: '1.0.0', last_modified_date: '2026-03-10', step_type: 'END' },
    ],
    connections: [
      { from_step_id: 'start', to_step_id: 'script' },
      { from_step_id: 'script', to_step_id: 'end' },
    ],
    value_property_specifications: valueProps,
  } as unknown as MasterWorkflowSpecification;
}

describe('SCRIPT step execution', () => {
  it('no script_config — auto-completes as before (backward compat)', () => {
    const engine = new WorkflowEngine(makeScriptWorkflow(undefined));
    engine.start();
    assert.equal(engine.getWorkflowState(), 'COMPLETED');
  });

  it('empty source — auto-completes', () => {
    const engine = new WorkflowEngine(makeScriptWorkflow(''));
    engine.start();
    assert.equal(engine.getWorkflowState(), 'COMPLETED');
  });

  it('script sets output via output_parameter_specifications', () => {
    const wf = makeScriptWorkflow(
      'output.greeting = "Hello World";',
      undefined,
      [{ id: 'greeting', target: 'Result.Greeting' }],
    );
    const engine = new WorkflowEngine(wf);
    engine.start();

    assert.equal(engine.getWorkflowState(), 'COMPLETED');
    assert.equal(engine.getProperties()['Result.Greeting'], 'Hello World');
  });

  it('script reads input parameters as local variables', () => {
    const wf = makeScriptWorkflow(
      'output.result = name + " is " + age;',
      [
        { id: 'name', default_value: 'User.Name', value_type: 'property' },
        { id: 'age', default_value: '30' },
      ],
      [{ id: 'result', target: 'Result.Info' }],
      [{ name: 'User', entries: [{ name: 'Name', value: 'Alice' }] }],
    );
    const engine = new WorkflowEngine(wf);
    engine.start();

    assert.equal(engine.getWorkflowState(), 'COMPLETED');
    assert.equal(engine.getProperties()['Result.Info'], 'Alice is 30');
  });

  it('script error stops workflow with ERRORED state', () => {
    const wf = makeScriptWorkflow('throw new Error("bad input");');
    const engine = new WorkflowEngine(wf);
    engine.start();

    assert.equal(engine.getWorkflowState(), 'ERRORED');

    const trace = engine.getTrace();
    const errored = trace.find(t => t.step_oid === 'script' && t.state === 'ERRORED');
    assert.ok(errored, 'should have ERRORED trace entry');
    assert.equal(errored!.error, 'bad input');

    // END should NOT have executed
    assert.ok(!trace.some(t => t.step_oid === 'end'), 'end should not execute after error');
  });

  it('script syntax error stops workflow', () => {
    const wf = makeScriptWorkflow('this is not valid javascript!!!');
    const engine = new WorkflowEngine(wf);
    engine.start();

    assert.equal(engine.getWorkflowState(), 'ERRORED');
    const errored = engine.getTrace().find(t => t.state === 'ERRORED');
    assert.ok(errored);
    assert.ok(errored!.error!.length > 0);
  });

  it('script writes directly to property store when no output specs', () => {
    const wf = makeScriptWorkflow(
      'output["Calc.Sum"] = "42";',
    );
    const engine = new WorkflowEngine(wf);
    engine.start();

    assert.equal(engine.getWorkflowState(), 'COMPLETED');
    assert.equal(engine.getProperties()['Calc.Sum'], '42');
  });

  it('script output shows in parameter snapshot', () => {
    const wf = makeScriptWorkflow(
      'output.result = "computed";',
      undefined,
      [{ id: 'result', target: 'Out.Result' }],
    );
    const engine = new WorkflowEngine(wf);
    engine.start();

    const snapshots = engine.getStepParameterSnapshots();
    const scriptSnap = snapshots.get('script');
    assert.ok(scriptSnap, 'script step should have a parameter snapshot');
    assert.equal(scriptSnap.outputParameters['result'], 'computed');
  });

  it('script can do math and string operations', () => {
    const wf = makeScriptWorkflow(
      'var total = parseInt(a) + parseInt(b); output.sum = String(total); output.label = prefix + total;',
      [
        { id: 'a', default_value: '10' },
        { id: 'b', default_value: '25' },
        { id: 'prefix', default_value: 'Total: ' },
      ],
      [
        { id: 'sum', target: 'Calc.Sum' },
        { id: 'label', target: 'Calc.Label' },
      ],
    );
    const engine = new WorkflowEngine(wf);
    engine.start();

    assert.equal(engine.getWorkflowState(), 'COMPLETED');
    assert.equal(engine.getProperties()['Calc.Sum'], '35');
    assert.equal(engine.getProperties()['Calc.Label'], 'Total: 35');
  });
});
