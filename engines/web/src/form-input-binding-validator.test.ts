// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
//
// Regression coverage for form input binding validation.
//
// Without this validation, a form element whose author forgot to set
// `outputParameter` silently has its captured value discarded by
// captureFormOutputs at submit time. The downstream step that reads the
// property the author *thought* the field wrote to gets an empty string —
// which is how the Kitchen workflow's BakeItem hit `int('')` and stalled at
// ABORTING. These tests pin the fail-fast behavior at file load time so the
// author sees the binding gap before any runtime tries to invoke an action.

import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { validateWorkflow } from './validator.js'

function uiStep(extras: Record<string, unknown>): Record<string, unknown> {
  return {
    local_id: 'Get Test Info',
    oid: 'step-ui',
    version: '1.0.0',
    last_modified_date: '2026-05-30T00:00:00Z',
    step_type: 'USER_INTERACTION',
    ...extras,
  }
}

function wfWithUiStep(uiExtras: Record<string, unknown>): Record<string, unknown> {
  return {
    local_id: 'wf',
    oid: 'wf-oid',
    version: '1.0.0',
    last_modified_date: '2026-05-30T00:00:00Z',
    steps: [
      { local_id: 'start', oid: 'step-start', version: '1.0.0', last_modified_date: '2026-05-30T00:00:00Z', step_type: 'START' },
      uiStep(uiExtras),
      { local_id: 'end', oid: 'step-end', version: '1.0.0', last_modified_date: '2026-05-30T00:00:00Z', step_type: 'END' },
    ],
    connections: [
      { from_step_id: 'step-start', to_step_id: 'step-ui' },
      { from_step_id: 'step-ui', to_step_id: 'step-end' },
    ],
    environment_specifications: [],
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Rejection cases — one per input-bearing element type
// ────────────────────────────────────────────────────────────────────────────

test('textInput without outputParameter is rejected (reproduces the BakeItem stall)', () => {
  const wf = wfWithUiStep({
    form_layout_config: [
      {
        deviceType: 'phone',
        canvasWidth: 390,
        canvasHeight: 844,
        elements: [
          { type: 'textInput', label: 'Time to Bake', fieldName: 'Text_127680' },
        ],
      },
    ],
  })
  const r = validateWorkflow(wf)
  assert.equal(r.valid, false)
  assert.equal(r.error_code, 'UNBOUND_FORM_INPUT')
  assert.match(r.error_message!, /textInput/)
  assert.match(r.error_message!, /Time to Bake/)
  assert.match(r.error_message!, /phone/)
  // The remediation hint must point the author at outputParameter — the actual
  // fix in their workflow is to bind this textInput to an output spec id.
  assert.match(r.error_message!, /outputParameter/)
})

test('textarea (multi-line text) without outputParameter is rejected', () => {
  const wf = wfWithUiStep({
    form_layout_config: [
      {
        deviceType: 'desktop',
        elements: [{ type: 'textarea', label: 'Notes', fieldName: 'Text_999' }],
      },
    ],
  })
  const r = validateWorkflow(wf)
  assert.equal(r.valid, false)
  assert.equal(r.error_code, 'UNBOUND_FORM_INPUT')
  assert.match(r.error_message!, /textarea/)
  assert.match(r.error_message!, /Notes/)
  assert.match(r.error_message!, /desktop/)
})

test('checkbox (checkbox group) without outputParameter is rejected', () => {
  const wf = wfWithUiStep({
    form_layout_config: [
      {
        deviceType: 'tablet',
        elements: [
          { type: 'checkbox', label: 'Toppings', fieldName: 'Box_1', options: ['cheese', 'pepperoni'] },
        ],
      },
    ],
  })
  const r = validateWorkflow(wf)
  assert.equal(r.valid, false)
  assert.equal(r.error_code, 'UNBOUND_FORM_INPUT')
  assert.match(r.error_message!, /checkbox/)
  assert.match(r.error_message!, /Toppings/)
})

test('radio (radio group) without outputParameter is rejected', () => {
  const wf = wfWithUiStep({
    form_layout_config: [
      {
        deviceType: 'phone',
        elements: [{ type: 'radio', label: 'Oven', fieldName: 'Radio_x' }],
      },
    ],
  })
  const r = validateWorkflow(wf)
  assert.equal(r.valid, false)
  assert.equal(r.error_code, 'UNBOUND_FORM_INPUT')
  assert.match(r.error_message!, /radio/)
})

test('empty string outputParameter is treated as unset (captureFormOutputs skips falsy values too)', () => {
  const wf = wfWithUiStep({
    form_layout_config: [
      {
        deviceType: 'phone',
        elements: [{ type: 'textInput', label: 'X', fieldName: 'Text_x', outputParameter: '' }],
      },
    ],
  })
  const r = validateWorkflow(wf)
  assert.equal(r.valid, false)
  assert.equal(r.error_code, 'UNBOUND_FORM_INPUT')
})

// ────────────────────────────────────────────────────────────────────────────
// Acceptance cases
// ────────────────────────────────────────────────────────────────────────────

test('input elements WITH outputParameter pass', () => {
  const wf = wfWithUiStep({
    form_layout_config: [
      {
        deviceType: 'phone',
        elements: [
          { type: 'textInput', label: 'Item', fieldName: 'ItemName', outputParameter: 'ItemName' },
          { type: 'textarea', label: 'Notes', fieldName: 'Notes', outputParameter: 'Notes' },
          { type: 'checkbox', label: 'Tags', fieldName: 'Tags', outputParameter: 'Tags', options: ['a', 'b'] },
          { type: 'radio', label: 'Oven', fieldName: 'OvenID', outputParameter: 'OvenID' },
        ],
      },
    ],
  })
  const r = validateWorkflow(wf)
  assert.equal(r.valid, true, `expected valid; got error_message=${r.error_message}`)
})

test('non-input elements without outputParameter pass (button/header/text/divider/image/video)', () => {
  // These elements never capture input, so they don't need an outputParameter.
  // The validation must only flag the four input-bearing types.
  const wf = wfWithUiStep({
    form_layout_config: [
      {
        deviceType: 'phone',
        elements: [
          { type: 'header', content: { content: 'Title', plainText: 'Title' } },
          { type: 'text', content: { content: 'Body', plainText: 'Body' } },
          { type: 'divider', thickness: 1 },
          { type: 'button', label: 'Submit', outputValue: 'continue' },
          { type: 'image', src: 'foo.jpg' },
          { type: 'video', src: 'foo.mp4' },
        ],
      },
    ],
  })
  const r = validateWorkflow(wf)
  assert.equal(r.valid, true, `expected valid; got error_message=${r.error_message}`)
})

test('multi-layout step: any layout with an unbound input is enough to reject', () => {
  // Reasoning: if the same conceptual field exists in phone but not in tablet,
  // a tablet user would lose the input. Catching it on any layout is correct.
  const wf = wfWithUiStep({
    form_layout_config: [
      {
        deviceType: 'phone',
        elements: [{ type: 'textInput', label: 'OK', fieldName: 'ok', outputParameter: 'OK' }],
      },
      {
        deviceType: 'tablet',
        elements: [{ type: 'textInput', label: 'NotOK', fieldName: 'broken' }],
      },
    ],
  })
  const r = validateWorkflow(wf)
  assert.equal(r.valid, false)
  assert.equal(r.error_code, 'UNBOUND_FORM_INPUT')
  assert.match(r.error_message!, /tablet/)
})

test('USER_INTERACTION step without form_layout_config passes (legacy ui_parameter_specifications path)', () => {
  // Older workflows authored before the WYSIWYG form designer use
  // ui_parameter_specifications instead of form_layout_config. The binding
  // model there is different and out of scope for this validation — we must
  // not regress those workflows.
  const wf = wfWithUiStep({
    ui_parameter_specifications: [
      { oid: 'p1', type: 'TextInput', value: 'placeholder' },
    ],
  })
  const r = validateWorkflow(wf)
  assert.equal(r.valid, true, `expected valid; got error_message=${r.error_message}`)
})

test('children: unbound input in a nested child workflow is also rejected', () => {
  const wf = wfWithUiStep({})
  ;(wf as { children: unknown[] }).children = [
    {
      local_id: 'child',
      oid: 'child-oid',
      version: '1.0.0',
      last_modified_date: '2026-05-30T00:00:00Z',
      steps: [
        { local_id: 'cs', oid: 'cs', version: '1.0.0', last_modified_date: '2026-05-30T00:00:00Z', step_type: 'START' },
        {
          local_id: 'ce',
          oid: 'ce',
          version: '1.0.0',
          last_modified_date: '2026-05-30T00:00:00Z',
          step_type: 'USER_INTERACTION',
          form_layout_config: [
            { deviceType: 'phone', elements: [{ type: 'radio', label: 'Choose', fieldName: 'r' }] },
          ],
        },
        { local_id: 'cend', oid: 'cend', version: '1.0.0', last_modified_date: '2026-05-30T00:00:00Z', step_type: 'END' },
      ],
      connections: [
        { from_step_id: 'cs', to_step_id: 'ce' },
        { from_step_id: 'ce', to_step_id: 'cend' },
      ],
    },
  ]
  const r = validateWorkflow(wf)
  assert.equal(r.valid, false)
  assert.equal(r.error_code, 'UNBOUND_FORM_INPUT')
  assert.match(r.error_message!, /radio/)
})
