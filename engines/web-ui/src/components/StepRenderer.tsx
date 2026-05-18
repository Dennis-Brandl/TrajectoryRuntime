// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { useState, useCallback, useMemo } from 'react';
import type { StepInstance, FormLayoutExportEntry, FormElement, UserAction } from '@engine/types.js';
import { getFormElements } from '@engine/step-handlers.js';
import { resolveDefaultValue } from '@engine/properties.js';
import { useWorkflowManager } from '../manager/useWorkflowManager';
import { FormRenderer } from './FormRenderer';
import type { StepCanvasHeader } from './StepCanvas';

const REQUIRED_TOOLTIP = 'Please complete all required fields before proceeding';

/** Check whether all required form fields have values. */
function areRequiredFieldsSatisfied(
  elements: FormElement[],
  formValues: Record<string, unknown>,
): boolean {
  for (const el of elements) {
    if (!('required' in el) || !el.required) continue;
    if (!('fieldName' in el)) continue;
    const value = formValues[(el as { fieldName: string }).fieldName];
    switch (el.type) {
      case 'textInput':
      case 'textarea': {
        if (typeof value !== 'string' || value.trim() === '') return false;
        break;
      }
      case 'checkbox': {
        if (!Array.isArray(value) || value.length === 0) return false;
        break;
      }
      case 'radio': {
        if (value === undefined || value === null || value === '') return false;
        break;
      }
    }
  }
  return true;
}

interface StepRendererProps {
  step: StepInstance;
  onAction: (action: UserAction) => void;
  workflowId: string;
  properties: Record<string, string>;
  inputParameters: Record<string, string>;
  viewportOverride?: 'phone' | 'tablet-vertical' | 'tablet-horizontal' | 'desktop';
  mediaMap: Record<string, string>;
  header?: StepCanvasHeader;
}

export function StepRenderer({ step, onAction, workflowId, properties, inputParameters, viewportOverride, mediaMap, header }: StepRendererProps) {
  if (step.stepType === 'YES_NO') {
    return <YesNoRenderer step={step} onAction={onAction} workflowId={workflowId} properties={properties} inputParameters={inputParameters} viewportOverride={viewportOverride} mediaMap={mediaMap} header={header} />;
  }
  if (step.stepType === 'USER_INTERACTION') {
    return <UserInteractionRenderer step={step} onAction={onAction} workflowId={workflowId} properties={properties} inputParameters={inputParameters} viewportOverride={viewportOverride} mediaMap={mediaMap} header={header} />;
  }
  return (
    <div className="step-unknown">
      <p>Step type "{step.stepType}" is executing — waiting for engine action.</p>
    </div>
  );
}

function YesNoRenderer({
  step,
  onAction,
  workflowId,
  properties,
  inputParameters,
  viewportOverride,
  mediaMap,
  header,
}: {
  step: StepInstance;
  onAction: (a: UserAction) => void;
  workflowId: string;
  properties: Record<string, string>;
  inputParameters: Record<string, string>;
  viewportOverride?: 'phone' | 'tablet-vertical' | 'tablet-horizontal' | 'desktop';
  mediaMap: Record<string, string>;
  header?: StepCanvasHeader;
}) {
  const config = step.step.yes_no_config;
  const yesLabel = config?.yes_label ?? 'Yes';
  const noLabel = config?.no_label ?? 'No';
  const yesValue = config?.yes_value ?? 'yes';
  const noValue = config?.no_value ?? 'no';

  const manager = useWorkflowManager();
  const coordinator = manager.getCoordinator(workflowId);

  const initialValues = useMemo(() => {
    const defaults = computeInitialFormValues(step, properties, inputParameters);
    const persisted = coordinator?.getFormValues(step.oid) ?? {};
    return { ...defaults, ...persisted };
  }, [step.oid, properties, inputParameters, coordinator]);
  const [formValues, setFormValues] = useState<Record<string, unknown>>(initialValues);

  const onFormChange = useCallback((fieldName: string, value: unknown) => {
    setFormValues((prev) => ({ ...prev, [fieldName]: value }));
    coordinator?.setFormValue(step.oid, fieldName, value);
  }, [coordinator, step.oid]);

  const press = (value: string) => {
    onAction({ step_oid: step.oid, action: 'button_press', button_output: value, form_values: formValues });
  };

  const elements = getFormElements(step.step);
  const allSatisfied = areRequiredFieldsSatisfied(elements, formValues);
  const disabled = !allSatisfied;

  const layouts = step.step.form_layout_config;
  if (layouts && Array.isArray(layouts) && layouts.length > 0) {
    // Check if form layout already contains button elements — if so, don't add extra Yes/No buttons
    const hasButtons = elements.some((el) => el.type === 'button');

    return (
      <div className="step-yesno">
        <FormRenderer
          layouts={layouts as FormLayoutExportEntry[]}
          formValues={formValues}
          onFormChange={onFormChange}
          onButtonPress={(v) => press(v)}
          properties={properties}
          inputParameters={inputParameters}
          viewportOverride={viewportOverride}
          mediaMap={mediaMap}
          buttonsDisabled={disabled}
          disabledTooltip={REQUIRED_TOOLTIP}
          header={header}
        />
        {!hasButtons && (
          <div className="step-yesno-buttons">
            {disabled ? (
              <span title={REQUIRED_TOOLTIP} style={{ display: 'contents' }}>
                <button className="btn btn-yes" disabled>{yesLabel}</button>
                <button className="btn btn-no" disabled>{noLabel}</button>
              </span>
            ) : (
              <>
                <button className="btn btn-yes" onClick={() => press(yesValue)}>{yesLabel}</button>
                <button className="btn btn-no" onClick={() => press(noValue)}>{noLabel}</button>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="step-yesno">
      <h3>{step.step.description ?? 'Yes / No'}</h3>
      <div className="step-yesno-buttons">
        {disabled ? (
          <span title={REQUIRED_TOOLTIP} style={{ display: 'contents' }}>
            <button className="btn btn-yes" disabled>{yesLabel}</button>
            <button className="btn btn-no" disabled>{noLabel}</button>
          </span>
        ) : (
          <>
            <button className="btn btn-yes" onClick={() => press(yesValue)}>{yesLabel}</button>
            <button className="btn btn-no" onClick={() => press(noValue)}>{noLabel}</button>
          </>
        )}
      </div>
    </div>
  );
}

/** Compute initial form values from defaultSource on form elements. */
function computeInitialFormValues(
  step: StepInstance,
  properties: Record<string, string>,
  inputParameters: Record<string, string>,
): Record<string, unknown> {
  const elements = getFormElements(step.step);
  const initial: Record<string, unknown> = {};
  for (const el of elements) {
    if ('defaultSource' in el && el.defaultSource && 'fieldName' in el) {
      const resolved = resolveDefaultValue(el.defaultSource, properties, inputParameters);
      if (resolved) {
        initial[(el as { fieldName: string }).fieldName] = resolved;
      }
    }
  }
  return initial;
}

function UserInteractionRenderer({
  step,
  onAction,
  workflowId,
  properties,
  inputParameters,
  viewportOverride,
  mediaMap,
  header,
}: {
  step: StepInstance;
  onAction: (a: UserAction) => void;
  workflowId: string;
  properties: Record<string, string>;
  inputParameters: Record<string, string>;
  viewportOverride?: 'phone' | 'tablet-vertical' | 'tablet-horizontal' | 'desktop';
  mediaMap: Record<string, string>;
  header?: StepCanvasHeader;
}) {
  const manager = useWorkflowManager();
  const coordinator = manager.getCoordinator(workflowId);

  const initialValues = useMemo(() => {
    const defaults = computeInitialFormValues(step, properties, inputParameters);
    const persisted = coordinator?.getFormValues(step.oid) ?? {};
    return { ...defaults, ...persisted };
  }, [step.oid, properties, inputParameters, coordinator]);
  const [formValues, setFormValues] = useState<Record<string, unknown>>(initialValues);

  const onFormChange = useCallback((fieldName: string, value: unknown) => {
    setFormValues((prev) => ({ ...prev, [fieldName]: value }));
    coordinator?.setFormValue(step.oid, fieldName, value);
  }, [coordinator, step.oid]);

  const onButtonPress = useCallback(
    (outputValue: string) => {
      onAction({
        step_oid: step.oid,
        action: 'button_press',
        button_output: outputValue,
        form_values: formValues,
      });
    },
    [step.oid, formValues, onAction],
  );

  const elements = getFormElements(step.step);
  const allSatisfied = areRequiredFieldsSatisfied(elements, formValues);
  const disabled = !allSatisfied;

  const layouts = step.step.form_layout_config;
  if (!layouts || !Array.isArray(layouts) || layouts.length === 0) {
    // No form layout — show a simple submit button
    const submitBtn = (
      <button
        className="btn"
        disabled={disabled}
        onClick={() =>
          onAction({ step_oid: step.oid, action: 'submit', form_values: formValues })
        }
      >
        Submit
      </button>
    );
    return (
      <div className="step-ui-no-form">
        <h3>{step.step.description ?? 'User Interaction'}</h3>
        {disabled ? (
          <span title={REQUIRED_TOOLTIP}>{submitBtn}</span>
        ) : submitBtn}
      </div>
    );
  }

  return (
    <div className="step-ui">
      <FormRenderer
        layouts={layouts as FormLayoutExportEntry[]}
        formValues={formValues}
        onFormChange={onFormChange}
        onButtonPress={onButtonPress}
        properties={properties}
        inputParameters={inputParameters}
        viewportOverride={viewportOverride}
        mediaMap={mediaMap}
        buttonsDisabled={disabled}
        disabledTooltip={REQUIRED_TOOLTIP}
        header={header}
      />
    </div>
  );
}
