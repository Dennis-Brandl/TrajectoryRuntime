// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isAutoCompleting, activateCatchStep } from './step-handlers.js';
import { PropertyStore } from './properties.js';
import type { CatchContext, MasterWorkflowStep } from './types.js';

describe('CATCH/RETURN handlers', () => {
  it('recognises CATCH and RETURN as auto-completing', () => {
    assert.equal(isAutoCompleting('CATCH'), true);
    assert.equal(isAutoCompleting('RETURN'), true);
  });

  it('writes trigger info to declared output_parameter_specifications targets', () => {
    const store = new PropertyStore();
    store.set('FailureContext.Mode', '');
    store.set('FailureContext.Message', '');
    store.set('FailureContext.Step', '');
    store.set('FailureContext.StepID', '');
    const step = {
      oid: 'c1', step_type: 'CATCH', local_id: 'Catch', catch_id: 'C1',
      output_parameter_specifications: [
        { id: 'Reason', target: 'FailureContext.Mode' },
        { id: 'Message', target: 'FailureContext.Message' },
        { id: 'Step', target: 'FailureContext.Step' },
        { id: 'StepID', target: 'FailureContext.StepID' },
      ],
    } as unknown as MasterWorkflowStep;
    const ctx: CatchContext = {
      catch_oid: 'c1', trigger_step_oid: 'a1', trigger_step_name: 'Heat Oven',
      trigger_reason: 'ERROR', error_message: 'thermocouple failure', activated_at: '2026-05-31T12:00:00Z',
    };
    activateCatchStep(step, ctx, store);
    assert.equal(store.get('FailureContext.Mode'), 'ERROR');
    assert.equal(store.get('FailureContext.Message'), 'thermocouple failure');
    assert.equal(store.get('FailureContext.Step'), 'Heat Oven');
    assert.equal(store.get('FailureContext.StepID'), 'a1');
  });

  it('ignores unknown output ids without throwing', () => {
    const store = new PropertyStore();
    const step = { oid: 'c1', step_type: 'CATCH', local_id: 'C', catch_id: 'C1',
      output_parameter_specifications: [{ id: 'not_a_field', target: 'X.Y' }] } as unknown as MasterWorkflowStep;
    const ctx: CatchContext = { catch_oid: 'c1', trigger_step_oid: 'a1', trigger_step_name: 'X',
      trigger_reason: 'ABORT', error_message: null, activated_at: '2026-05-31T12:00:00Z' };
    assert.doesNotThrow(() => activateCatchStep(step, ctx, store));
  });
});
