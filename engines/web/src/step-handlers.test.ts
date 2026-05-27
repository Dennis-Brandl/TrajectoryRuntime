// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { handleUserAction, needsUserAction } from './step-handlers.js';
import { PropertyStore } from './properties.js';
import type { MasterWorkflowStep, UserAction } from './types.js';

describe('handleUserAction', () => {
  it('captures form outputs on button_press for USER_INTERACTION', () => {
    const step = {
      oid: 's1',
      step_type: 'USER_INTERACTION',
      description: 'Test',
      form_layout_config: [{
        deviceType: 'phone',
        canvasWidth: 390,
        canvasHeight: 844,
        elements: [
          {
            type: 'textInput',
            x: 0, y: 0, width: 300, height: 40,
            fieldName: 'name',
            label: 'Name',
            outputParameter: 'Response.Name',
          },
          {
            type: 'button',
            x: 0, y: 60, width: 300, height: 40,
            label: 'Continue',
            outputValue: 'continue',
          },
        ],
      }],
    } as unknown as MasterWorkflowStep;

    const store = new PropertyStore();
    const action: UserAction = {
      step_oid: 's1',
      action: 'button_press',
      button_output: 'continue',
      form_values: { name: 'Alice' },
    };

    const result = handleUserAction(step, action, store);
    assert.equal(store.get('Response.Name'), 'Alice');
    assert.deepEqual(result, { conditionValue: 'continue' });
  });

  it('YES_NO is routing-only: button_output never writes to output_parameter_specifications', () => {
    const step = {
      oid: 's1',
      step_type: 'YES_NO',
      description: 'Confirm?',
      yes_no_config: {
        yes_label: 'Yes', no_label: 'No',
        yes_value: 'true', no_value: 'false',
      },
      output_parameter_specifications: [
        { id: 'answer', target: 'Response.Answer' },
      ],
    } as unknown as MasterWorkflowStep;

    const store = new PropertyStore();
    const action: UserAction = {
      step_oid: 's1',
      action: 'button_press',
      button_output: 'true',
    };

    const result = handleUserAction(step, action, store);
    assert.equal(store.get('Response.Answer'), undefined);
    assert.deepEqual(result, { conditionValue: 'true', sourceHandleId: 'true', excludeUnconditional: true });
  });

  it('YES_NO "no" press returns sourceHandleId matching outputValue', () => {
    const step = {
      oid: 's1',
      step_type: 'YES_NO',
      description: 'Confirm?',
      yes_no_config: {
        yes_label: 'Yes', no_label: 'No',
        yes_value: 'true', no_value: 'false',
      },
    } as unknown as MasterWorkflowStep;

    const store = new PropertyStore();
    const action: UserAction = {
      step_oid: 's1',
      action: 'button_press',
      button_output: 'false',
    };

    const result = handleUserAction(step, action, store);
    assert.deepEqual(result, { conditionValue: 'false', sourceHandleId: 'false', excludeUnconditional: true });
  });

  it('YES_NO with custom values uses outputValue as sourceHandleId', () => {
    const step = {
      oid: 's1',
      step_type: 'YES_NO',
      description: 'Approve?',
      yes_no_config: {
        yes_label: 'Approve', no_label: 'Reject',
        yes_value: 'approved', no_value: 'rejected',
      },
    } as unknown as MasterWorkflowStep;

    const store = new PropertyStore();
    const yesResult = handleUserAction(step, { step_oid: 's1', action: 'button_press', button_output: 'approved' }, store);
    assert.equal(yesResult.sourceHandleId, 'approved');

    const noResult = handleUserAction(step, { step_oid: 's1', action: 'button_press', button_output: 'rejected' }, store);
    assert.equal(noResult.sourceHandleId, 'rejected');
  });

  it('YES_NO with form-bound outputs: form values land in their targets, button_output does not clobber them', () => {
    const step = {
      oid: 's1',
      step_type: 'YES_NO',
      description: 'Select Paths',
      yes_no_config: {
        yes_label: 'Yes', no_label: 'No',
        yes_value: 'true', no_value: 'false',
      },
      output_parameter_specifications: [
        { id: 'PathPicked', target: 'PathPicked' },
        { id: 'GlobalPathPicked', target: 'GlobalPathPicked.Value' },
      ],
      form_layout_config: [{
        deviceType: 'phone',
        canvasWidth: 360,
        canvasHeight: 850,
        elements: [
          {
            type: 'textInput',
            x: 0, y: 0, width: 300, height: 60,
            fieldName: 'Text_810880',
            label: 'Local Path',
            outputParameter: 'PathPicked',
          },
          {
            type: 'textInput',
            x: 0, y: 80, width: 300, height: 60,
            fieldName: 'Text_742912',
            label: 'Global Path',
            outputParameter: 'GlobalPathPicked',
          },
          { type: 'button', x: 0, y: 600, width: 120, height: 40, label: 'Yes', outputValue: 'true' },
          { type: 'button', x: 150, y: 600, width: 120, height: 40, label: 'No', outputValue: 'false' },
        ],
      }],
    } as unknown as MasterWorkflowStep;

    const store = new PropertyStore();
    const action: UserAction = {
      step_oid: 's1',
      action: 'button_press',
      button_output: 'true',
      form_values: { Text_810880: '0', Text_742912: '1' },
    };

    const result = handleUserAction(step, action, store);

    assert.equal(store.get('PathPicked'), '0');
    assert.equal(store.get('GlobalPathPicked.Value'), '1');
    assert.deepEqual(result, { conditionValue: 'true', sourceHandleId: 'true', excludeUnconditional: true });
  });

  it('needsUserAction includes ACTION PROXY', () => {
    assert.equal(needsUserAction('ACTION PROXY'), true);
  });

  it('YES_NO with bound + unbound specs: form value lands in its target, unbound specs stay untouched', () => {
    const step = {
      oid: 's1',
      step_type: 'YES_NO',
      description: 'Confirm with note',
      yes_no_config: { yes_label: 'Yes', no_label: 'No', yes_value: 'true', no_value: 'false' },
      output_parameter_specifications: [
        { id: 'Note', target: 'Response.Note' },
        { id: 'Answer', target: 'Response.Answer' },
      ],
      form_layout_config: [{
        deviceType: 'phone',
        canvasWidth: 360,
        canvasHeight: 850,
        elements: [
          {
            type: 'textInput',
            x: 0, y: 0, width: 300, height: 60,
            fieldName: 'note',
            label: 'Note',
            outputParameter: 'Note',
          },
        ],
      }],
    } as unknown as MasterWorkflowStep;

    const store = new PropertyStore();
    const action: UserAction = {
      step_oid: 's1',
      action: 'button_press',
      button_output: 'false',
      form_values: { note: 'looked fine' },
    };

    handleUserAction(step, action, store);

    assert.equal(store.get('Response.Note'), 'looked fine');
    assert.equal(store.get('Response.Answer'), undefined);
  });

  it('still captures form outputs on submit for USER_INTERACTION', () => {
    const step = {
      oid: 's1',
      step_type: 'USER_INTERACTION',
      description: 'Test',
      form_layout_config: [{
        deviceType: 'phone',
        canvasWidth: 390,
        canvasHeight: 844,
        elements: [
          {
            type: 'textInput',
            x: 0, y: 0, width: 300, height: 40,
            fieldName: 'email',
            label: 'Email',
            outputParameter: 'Contact.Email',
          },
        ],
      }],
    } as unknown as MasterWorkflowStep;

    const store = new PropertyStore();
    const action: UserAction = {
      step_oid: 's1',
      action: 'submit',
      form_values: { email: 'test@example.com' },
    };

    const result = handleUserAction(step, action, store);
    assert.equal(store.get('Contact.Email'), 'test@example.com');
    assert.deepEqual(result, {});
  });
});
