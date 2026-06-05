// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
import type {
  MasterWorkflowStep,
  FormElement,
  FormLayoutExportEntry,
  UserAction,
  RoutingResult,
  Select1Option,
  OutputParameterSpecification,
  CatchContext,
} from './types.js';
import type { PropertyStore } from './properties.js';

// Normalize only SELECT_1 → SELECT 1 (the only fixture/schema discrepancy).
// USER_INTERACTION and YES_NO keep their underscores per the schema enum.
export function canonicalStepType(raw: string): string {
  if (raw === 'SELECT_1') return 'SELECT 1';
  return raw;
}

export function isAutoCompleting(stepType: string): boolean {
  const t = canonicalStepType(stepType);
  return ['START', 'END', 'PARALLEL', 'WAIT ANY', 'SELECT 1', 'SCRIPT', 'MATH', 'CATCH', 'RETURN'].includes(t);
}

export function needsUserAction(stepType: string): boolean {
  return ['USER_INTERACTION', 'YES_NO', 'ACTION PROXY'].includes(stepType);
}

export function getFormElements(step: MasterWorkflowStep): FormElement[] {
  const config = step.form_layout_config;
  if (!config) return [];

  // Handle array of breakpoints — use first one (phone)
  if (Array.isArray(config)) {
    const entries = config as FormLayoutExportEntry[];
    if (entries.length === 0) return [];
    return entries[0].elements ?? [];
  }

  // Handle plain object shape (some semantic fixtures use this)
  if (typeof config === 'object' && 'elements' in config) {
    return (config as { elements: FormElement[] }).elements ?? [];
  }

  return [];
}

export function handleSelect1(
  step: MasterWorkflowStep,
  propertyStore: PropertyStore,
): RoutingResult {
  const config = step.select1_config;
  if (!config || !config.options) {
    return {};
  }

  // Resolve the input value
  let inputValue = '';
  if (config.input_value_type === 'property' && config.input_name) {
    inputValue = propertyStore.get(config.input_name) ?? '';
  } else if (config.input_name) {
    inputValue = config.input_name;
  }

  // Evaluate options in order
  let defaultOption: Select1Option | undefined;
  for (const option of config.options) {
    if (option.is_default) {
      defaultOption = option;
      continue;
    }

    const compareValue = option.value_type === 'property'
      ? (propertyStore.get(option.value) ?? '')
      : option.value;

    if (evaluateOperator(inputValue, option.operator, compareValue)) {
      return { connectionId: option.id };
    }
  }

  // No match — use default
  if (defaultOption) {
    return { connectionId: defaultOption.id };
  }

  return {};
}

function evaluateOperator(input: string, operator: string, value: string): boolean {
  switch (operator) {
    case '==': return input === value;
    case '!=': return input !== value;
    case '<': return input < value;
    case '>': return input > value;
    case '<=': return input <= value;
    case '>=': return input >= value;
    case 'Contains': return input.includes(value);
    case 'Not Contains': return !input.includes(value);
    default: return false;
  }
}

export function handleUserAction(
  step: MasterWorkflowStep,
  action: UserAction,
  propertyStore: PropertyStore,
): RoutingResult {
  const stepType = step.step_type;

  if (stepType === 'YES_NO') {
    // YES_NO is a routing step — the button output drives routing via sourceHandleId/condition.
    // Parameter writes only come from form elements with `outputParameter` bindings; the button
    // literal is never written to output_parameter_specifications.
    if (action.form_values) {
      const elements = getFormElements(step);
      propertyStore.captureFormOutputs(elements, action.form_values, step.output_parameter_specifications);
    }
    return { conditionValue: action.button_output, sourceHandleId: action.button_output ?? '', excludeUnconditional: true };
  }

  if (stepType === 'USER_INTERACTION') {
    // Capture form outputs, resolving through output_parameter_specifications for full dotted target paths
    if (action.form_values) {
      const elements = getFormElements(step);
      propertyStore.captureFormOutputs(elements, action.form_values, step.output_parameter_specifications);
    }

    if (action.action === 'button_press') {
      return { conditionValue: action.button_output };
    }

    return {};
  }

  return {};
}

export interface ScriptResult {
  success: boolean;
  error?: string;
}

/**
 * Execute a SCRIPT step's source code via `new Function()`.
 *
 * Input parameters are injected as local variables (by their spec id).
 * An `output` object is provided for the script to write results to.
 * After execution, output keys are mapped through output_parameter_specifications
 * into the PropertyStore.
 */
export function executeScript(
  step: MasterWorkflowStep,
  propertyStore: PropertyStore,
  inputParameters: Record<string, string>,
): ScriptResult {
  const config = step.script_config;
  if (!config?.source) {
    return { success: true }; // No source — pass through
  }

  const argNames = Object.keys(inputParameters);
  const argValues = argNames.map(k => inputParameters[k]);

  const outputObj: Record<string, unknown> = {};

  try {
    const fn = new Function(...argNames, 'output', config.source);
    fn(...argValues, outputObj);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }

  // Map output object keys → output_parameter_specifications → PropertyStore
  const outputSpecs = step.output_parameter_specifications;
  if (outputSpecs && outputSpecs.length > 0) {
    for (const spec of outputSpecs) {
      if (spec.id in outputObj && spec.target) {
        const val = outputObj[spec.id];
        propertyStore.set(spec.target, val === undefined ? '' : String(val));
      }
    }
  } else {
    // No specs — write output keys directly as dot-notation properties
    for (const [key, val] of Object.entries(outputObj)) {
      if (val !== undefined) {
        propertyStore.set(key, String(val));
      }
    }
  }

  return { success: true };
}

const KNOWN_CATCH_FIELDS: Record<string, (c: CatchContext) => string> = {
  trigger_step: c => c.trigger_step_name,
  trigger_step_oid: c => c.trigger_step_oid,
  trigger_reason: c => c.trigger_reason,
  error_message: c => c.error_message ?? '',
};

/** Spec §1.2 / §3.1: write the runtime-supplied trigger info to the CATCH's declared Value Property targets. */
export function activateCatchStep(
  step: MasterWorkflowStep,
  ctx: CatchContext,
  propertyStore: PropertyStore,
): void {
  for (const out of step.output_parameter_specifications ?? []) {
    const field = KNOWN_CATCH_FIELDS[out.id];
    if (!field || !out.target) continue; // unknown id: ignore silently (spec §1.2)
    propertyStore.set(out.target, field(ctx));
  }
}
