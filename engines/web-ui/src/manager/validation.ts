// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
/**
 * Browser-compatible workflow spec validation.
 *
 * Extracted from engines/web/src/validator.ts with Node.js dependencies removed.
 * Uses Vite JSON import for the schema instead of readFileSync.
 */
import Ajv, { type ErrorObject } from 'ajv';
import type { ValidationResult } from '@engine/types.js';
import { partitionCatchNetworks, type PartitionStep, type PartitionConnection } from '@engine/catch-network-partition.js';
import workflowSchema from '../../../../spec/workflow-schema.json';
import { hasValidServerUriScheme } from '@engine/lib/server-uri.js';

// ── Helpers ──

function normalizeStepType(t: string): string {
  return t.replace(/_/g, ' ');
}

// ── Pre-structural checks ──

function preStructuralChecks(workflow: Record<string, unknown>): ValidationResult | null {
  const steps = workflow['steps'];
  const connections = workflow['connections'];

  if (!Array.isArray(steps)) {
    return { valid: false, error_code: 'MISSING_REQUIRED_FIELD', error_message: 'Missing steps array' };
  }
  if (!Array.isArray(connections)) {
    return { valid: false, error_code: 'MISSING_REQUIRED_FIELD', error_message: 'Missing connections array' };
  }

  for (const step of steps) {
    if (!step || typeof step !== 'object') {
      return { valid: false, error_code: 'MISSING_REQUIRED_FIELD', error_message: 'Invalid step entry' };
    }
    for (const field of ['local_id', 'oid', 'version', 'last_modified_date']) {
      if (!(field in step)) {
        return { valid: false, error_code: 'MISSING_REQUIRED_FIELD', error_message: `Step missing required field: ${field}` };
      }
    }
    if (!('step_type' in step)) {
      return { valid: false, error_code: 'MISSING_REQUIRED_FIELD', error_message: 'Step missing required field: step_type' };
    }
  }

  for (const conn of connections) {
    if (!conn || typeof conn !== 'object') {
      return { valid: false, error_code: 'MISSING_REQUIRED_FIELD', error_message: 'Invalid connection entry' };
    }
    if (!('from_step_id' in conn)) {
      return { valid: false, error_code: 'MISSING_REQUIRED_FIELD', error_message: 'Connection missing from_step_id' };
    }
    if (!('to_step_id' in conn)) {
      return { valid: false, error_code: 'MISSING_REQUIRED_FIELD', error_message: 'Connection missing to_step_id' };
    }
  }

  return null;
}

// ── Semantic validation ──

function semanticValidation(workflow: Record<string, unknown>): ValidationResult | null {
  const steps = workflow['steps'] as Record<string, unknown>[];
  const connections = workflow['connections'] as Record<string, unknown>[];

  const oids = new Set<string>();
  for (const step of steps) {
    const oid = step.oid as string;
    if (oids.has(oid)) {
      return { valid: false, error_code: 'DUPLICATE_STEP_OID', error_message: `Duplicate step OID: ${oid}` };
    }
    oids.add(oid);
  }

  let startCount = 0;
  let endCount = 0;
  for (const step of steps) {
    const st = normalizeStepType(String(step.step_type));
    if (st === 'START') startCount++;
    if (st === 'END') endCount++;
  }

  if (startCount === 0) {
    return { valid: false, error_code: 'NO_START_STEP', error_message: 'No START step found' };
  }
  if (startCount > 1) {
    return { valid: false, error_code: 'MULTIPLE_START_STEPS', error_message: 'Multiple START steps found' };
  }
  if (endCount === 0) {
    return { valid: false, error_code: 'NO_END_STEP', error_message: 'No END step found' };
  }

  for (const conn of connections) {
    const from = conn.from_step_id as string;
    const to = conn.to_step_id as string;
    if (!oids.has(from)) {
      return { valid: false, error_code: 'DANGLING_CONNECTION', error_message: `Connection references non-existent step: ${from}` };
    }
    if (!oids.has(to)) {
      return { valid: false, error_code: 'DANGLING_CONNECTION', error_message: `Connection references non-existent step: ${to}` };
    }
  }

  for (const conn of connections) {
    if (conn.from_step_id === conn.to_step_id) {
      return { valid: false, error_code: 'SELF_REFERENCING_CONNECTION', error_message: `Self-referencing connection on step: ${conn.from_step_id}` };
    }
  }

  const startOid = steps.find(s => normalizeStepType(String(s.step_type)) === 'START')!.oid as string;
  const reachable = new Set<string>();
  const queue = [startOid];
  reachable.add(startOid);
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const conn of connections) {
      if (conn.from_step_id === current && !reachable.has(conn.to_step_id as string)) {
        reachable.add(conn.to_step_id as string);
        queue.push(conn.to_step_id as string);
      }
    }
  }
  // Catch networks are intentional disconnected islands (reached at runtime via TRY, not via a connection).
  // Mirrors engines/web/src/validator.ts — keep the two in sync.
  const partition = partitionCatchNetworks(
    steps as unknown as PartitionStep[],
    connections as unknown as PartitionConnection[],
  );
  for (const step of steps) {
    const oid = step.oid as string;
    if (partition.catchNetworkStepOids.has(oid)) continue;
    if (!reachable.has(oid)) {
      return { valid: false, error_code: 'ORPHANED_STEP', error_message: `Step ${step.oid} is not reachable from START` };
    }
  }

  for (const step of steps) {
    const st = normalizeStepType(String(step.step_type));
    if (st === 'PARALLEL') {
      if (!hasMatchingWaitAll(step.oid as string, steps, connections)) {
        return { valid: false, error_code: 'UNMATCHED_PARALLEL', error_message: `PARALLEL step ${step.oid} has no matching WAIT ALL` };
      }
    }
  }

  return null;
}

function hasMatchingWaitAll(parallelOid: string, steps: Record<string, unknown>[], connections: Record<string, unknown>[]): boolean {
  const stepMap = new Map<string, string>();
  for (const s of steps) {
    stepMap.set(s.oid as string, normalizeStepType(String(s.step_type)));
  }

  const visited = new Set<string>();
  const queue: string[] = [];
  for (const conn of connections) {
    if (conn.from_step_id === parallelOid) {
      queue.push(conn.to_step_id as string);
    }
  }

  while (queue.length > 0) {
    const oid = queue.shift()!;
    if (visited.has(oid)) continue;
    visited.add(oid);
    const type = stepMap.get(oid);
    if (type === 'WAIT ALL') return true;
    if (type === 'END') continue;
    for (const conn of connections) {
      if (conn.from_step_id === oid) {
        queue.push(conn.to_step_id as string);
      }
    }
  }
  return false;
}

// ── Resource validation ──

function resourceValidation(workflow: Record<string, unknown>): ValidationResult | null {
  const steps = workflow['steps'] as Record<string, unknown>[];
  const resourceSpecs = workflow['resource_property_specifications'] as Record<string, unknown>[] | undefined;

  const resourceTypes = new Map<string, string>();
  if (resourceSpecs) {
    for (const spec of resourceSpecs) {
      resourceTypes.set(spec.name as string, spec.resource_type as string);
    }
  }

  // Also gather resource specs from environment specifications
  const envSpecs = workflow['environment_specifications'] as Record<string, unknown>[] | undefined;
  if (envSpecs) {
    for (const env of envSpecs) {
      const envResources = env['resource_property_specifications'] as Record<string, unknown>[] | undefined;
      if (envResources) {
        for (const spec of envResources) {
          if (!resourceTypes.has(spec.name as string)) {
            resourceTypes.set(spec.name as string, spec.resource_type as string);
          }
        }
      }
    }
  }

  const childWorkflows = workflow['children'] as Record<string, unknown>[] | undefined;
  if (childWorkflows) {
    for (const cw of childWorkflows) {
      const cwSpecs = cw['resource_property_specifications'] as Record<string, unknown>[] | undefined;
      if (cwSpecs) {
        for (const spec of cwSpecs) {
          if (!resourceTypes.has(spec.name as string)) {
            resourceTypes.set(spec.name as string, spec.resource_type as string);
          }
        }
      }
    }
  }

  const ACQUIRE_RELEASE_TYPES = new Set(['binary exclusive use', 'binary shared use with pool limits', 'named pool']);
  const COUNTABLE_TYPES = new Set(['countable use with pool limits']);
  const SYNC_TYPES = new Set(['sync']);
  const SYNC_COMMANDS = new Set(['Send', 'Receive', 'Synchronize']);

  for (const step of steps) {
    const cmds = step['resource_command_specifications'] as Record<string, unknown>[] | undefined;
    if (!cmds || cmds.length === 0) continue;

    let syncCount = 0;

    for (const cmd of cmds) {
      const commandType = cmd.command_type as string;
      const resourceName = cmd.resource_name as string;

      const resType = resourceTypes.get(resourceName);
      if (!resType) {
        return { valid: false, error_code: 'INVALID_RESOURCE_COMMAND', error_message: `Resource command references unknown resource: "${resourceName}"` };
      }

      if (commandType === 'Acquire' || commandType === 'Release') {
        if (!ACQUIRE_RELEASE_TYPES.has(resType)) {
          return { valid: false, error_code: 'INVALID_RESOURCE_COMMAND', error_message: `${commandType} not compatible with resource type "${resType}"` };
        }
      } else if (commandType === 'Acquire Pool Amount' || commandType === 'Release Pool Amount') {
        if (!COUNTABLE_TYPES.has(resType)) {
          return { valid: false, error_code: 'INVALID_RESOURCE_COMMAND', error_message: `${commandType} not compatible with resource type "${resType}"` };
        }
        const amount = cmd.amount as number | undefined;
        if (!amount || amount <= 0) {
          return { valid: false, error_code: 'INVALID_RESOURCE_COMMAND', error_message: `${commandType} requires amount > 0` };
        }
      } else if (SYNC_COMMANDS.has(commandType)) {
        if (!SYNC_TYPES.has(resType)) {
          return { valid: false, error_code: 'INVALID_RESOURCE_COMMAND', error_message: `${commandType} not compatible with resource type "${resType}"` };
        }
        syncCount++;
      }
    }

    if (syncCount > 1) {
      return { valid: false, error_code: 'INVALID_RESOURCE_COMMAND', error_message: `Step "${step.oid}" has ${syncCount} sync commands (max 1)` };
    }
  }

  if (resourceSpecs) {
    for (const spec of resourceSpecs) {
      if (spec.resource_type === 'named pool') {
        const names = spec.names as string[] | undefined;
        if (!names || names.length === 0) {
          return { valid: false, error_code: 'INVALID_RESOURCE_SPEC', error_message: `Named pool "${spec.name}" must have a non-empty names array` };
        }
      }
      if (spec.resource_type === 'binary shared use with pool limits' || spec.resource_type === 'countable use with pool limits') {
        const limit = spec.use_limit as number | undefined;
        if (!limit || limit <= 0) {
          return { valid: false, error_code: 'INVALID_RESOURCE_SPEC', error_message: `Resource "${spec.name}" requires use_limit > 0` };
        }
      }
    }
  }

  return null;
}

// ── Structural validation (Ajv) ──

function relaxFormElementRequired(schema: Record<string, unknown>): void {
  const defs = schema['$defs'] as Record<string, unknown> | undefined;
  if (!defs) return;

  const formElementNames = [
    'FormElementButton', 'FormElementText', 'FormElementHeader',
    'FormElementTextInput', 'FormElementTextarea', 'FormElementImage',
    'FormElementVideo', 'FormElementCheckbox', 'FormElementRadio',
    'FormElementDivider', 'FormElementTimer',
  ];

  for (const name of formElementNames) {
    const def = defs[name] as Record<string, unknown> | undefined;
    if (!def?.allOf) continue;
    const allOf = def.allOf as Record<string, unknown>[];
    for (const part of allOf) {
      if (part.properties && (part.properties as Record<string, unknown>).type) {
        part.required = ['type'];
      }
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Form input binding validation
//
// Mirrors `formInputBindingValidation` in engines/web/src/validator.ts. Every
// `textInput` / `textarea` / `checkbox` / `radio` element must declare an
// `outputParameter`; without it, properties.ts → captureFormOutputs silently
// skips the element on submit and the captured value disappears. We fail the
// workflow at file load time so the user sees the binding gap before the
// Runtime stalls a downstream step with an empty input. See the matching
// header comment in the engine validator for the full rationale.
// ────────────────────────────────────────────────────────────────────────────

const INPUT_BINDING_REQUIRED_TYPES: ReadonlySet<string> = new Set([
  'textInput',
  'textarea',
  'checkbox',
  'radio',
])

function formInputBindingValidation(workflow: Record<string, unknown>): ValidationResult | null {
  function checkSpec(spec: Record<string, unknown>): ValidationResult | null {
    const steps = (spec['steps'] as Record<string, unknown>[] | undefined) ?? []
    for (const step of steps) {
      const stepLabel = (step['local_id'] as string | undefined) ?? (step['oid'] as string | undefined) ?? '<unknown>'
      const layouts = step['form_layout_config'] as Array<Record<string, unknown>> | undefined
      if (!Array.isArray(layouts)) continue
      for (const layout of layouts) {
        const elements = layout['elements'] as Record<string, unknown>[] | undefined
        if (!Array.isArray(elements)) continue
        for (const el of elements) {
          const type = el['type'] as string | undefined
          if (!type || !INPUT_BINDING_REQUIRED_TYPES.has(type)) continue
          const outputParameter = el['outputParameter']
          if (typeof outputParameter !== 'string' || outputParameter.length === 0) {
            const fieldName = (el['fieldName'] as string | undefined) ?? ''
            const label = (el['label'] as string | undefined) ?? fieldName ?? '(unlabeled)'
            const device = (layout['deviceType'] as string | undefined) ?? 'unknown'
            return {
              valid: false,
              error_code: 'UNBOUND_FORM_INPUT',
              error_message:
                `Step "${stepLabel}" form ${type} "${label}" (${device} layout) has no outputParameter binding — ` +
                `captured input would be discarded. Set the element's outputParameter to one of the step's ` +
                `output_parameter_specifications ids, or remove the element.`,
            }
          }
        }
      }
    }
    const childSpecs = spec['children'] as Record<string, unknown>[] | undefined
    if (Array.isArray(childSpecs)) {
      for (const c of childSpecs) {
        const err = checkSpec(c)
        if (err) return err
      }
    }
    return null
  }
  return checkSpec(workflow)
}

function normalizeForAjv(workflow: Record<string, unknown>): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(workflow)) as Record<string, unknown>;
  const steps = clone['steps'];
  if (Array.isArray(steps)) {
    for (const step of steps) {
      if (step?.step_type === 'SELECT_1') {
        step.step_type = 'SELECT 1';
      }
    }
  }
  return clone;
}

// Prepare schema once at module load: deep clone, remove $schema, relax form elements
const preparedSchema = (() => {
  const raw = JSON.parse(JSON.stringify(workflowSchema)) as Record<string, unknown>;
  delete raw['$schema'];
  relaxFormElementRequired(raw);
  return raw;
})();

function structuralValidation(workflow: Record<string, unknown>): ValidationResult | null {
  const AjvConstructor = (Ajv as { default?: typeof Ajv }).default ?? Ajv;
  const ajv = new AjvConstructor({ allErrors: true, strict: false });
  const validateFn = ajv.compile(preparedSchema);
  const valid = validateFn(normalizeForAjv(workflow));

  if (valid) return null;

  const errors = validateFn.errors ?? [];

  // Filter out form element oneOf/const errors — unknown element types are a rendering
  // concern, not a structural problem. The runtime should accept any element type and
  // render what it can. This also avoids false rejections for elements added in newer
  // versions of the authoring tool (Trajectory Workflows).
  const structuralErrors = errors.filter((e: ErrorObject) => {
    const path = e.instancePath ?? '';
    if (path.includes('elements') && (e.keyword === 'oneOf' || e.keyword === 'const')) {
      return false; // Skip form element type mismatches
    }
    return true;
  });

  if (structuralErrors.length === 0) return null; // All errors were form element warnings

  for (const err of structuralErrors) {
    const path = err.instancePath ?? '';
    const keyword = err.keyword;

    if (keyword === 'enum' && path.includes('step_type')) {
      return { valid: false, error_code: 'INVALID_STEP_TYPE', error_message: `Invalid step type at ${path}` };
    }

    if (keyword === 'required') {
      return { valid: false, error_code: 'MISSING_REQUIRED_FIELD', error_message: `Missing required field: ${err.params?.missingProperty} at ${path}` };
    }
  }

  return { valid: false, error_code: 'MISSING_REQUIRED_FIELD', error_message: structuralErrors[0]?.message ?? 'Validation failed' };
}

// ── Public API ──

function actionServerUriValidation(workflow: Record<string, unknown>): ValidationResult | null {
  const envSpecs =
    (workflow['environment_specifications'] as Array<Record<string, unknown>> | undefined) ?? [];
  for (const env of envSpecs) {
    const servers =
      (env['action_server_specifications'] as Array<Record<string, unknown>> | undefined) ?? [];
    for (const s of servers) {
      const uri = s['uri'];
      if (typeof uri !== 'string' || !hasValidServerUriScheme(uri)) {
        return {
          valid: false,
          error_code: 'INVALID_VALIDATION',
          error_message: `Action server URI is not a valid http(s) URL: ${String(uri)}`,
        };
      }
    }
  }
  return null;
}

export function validateWorkflow(workflow: Record<string, unknown>): ValidationResult {
  const preError = preStructuralChecks(workflow);
  if (preError) return preError;

  const semanticError = semanticValidation(workflow);
  if (semanticError) return semanticError;

  const resourceError = resourceValidation(workflow);
  if (resourceError) return resourceError;

  // Form input binding check — see formInputBindingValidation comment block.
  const formInputBindingError = formInputBindingValidation(workflow);
  if (formInputBindingError) return formInputBindingError;

  // Action-server URI scheme check (SSRF — reject non-http(s) URIs)
  const serverUriError = actionServerUriValidation(workflow);
  if (serverUriError) return serverUriError;

  const structuralError = structuralValidation(workflow);
  if (structuralError) return structuralError;

  return { valid: true };
}
