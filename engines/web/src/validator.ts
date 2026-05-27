// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import Ajv, { type ErrorObject } from 'ajv';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ValidationResult } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function normalizeStepType(t: string): string {
  return t.replace(/_/g, ' ');
}

// Pre-checks: catch missing required fields on steps/connections before
// semantic graph analysis (which would misinterpret them)
function preStructuralChecks(workflow: Record<string, unknown>): ValidationResult | null {
  const steps = workflow['steps'];
  const connections = workflow['connections'];

  if (!Array.isArray(steps)) {
    return { valid: false, error_code: 'MISSING_REQUIRED_FIELD', error_message: 'Missing steps array' };
  }
  if (!Array.isArray(connections)) {
    return { valid: false, error_code: 'MISSING_REQUIRED_FIELD', error_message: 'Missing connections array' };
  }

  // Check each step has required ManagedElement fields
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

  // Check each connection has required fields
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

// Semantic checks: graph-level analysis
function semanticValidation(workflow: Record<string, unknown>): ValidationResult | null {
  const steps = workflow['steps'] as Record<string, unknown>[];
  const connections = workflow['connections'] as Record<string, unknown>[];

  // Duplicate step OIDs
  const oids = new Set<string>();
  for (const step of steps) {
    const oid = step.oid as string;
    if (oids.has(oid)) {
      return { valid: false, error_code: 'DUPLICATE_STEP_OID', error_message: `Duplicate step OID: ${oid}` };
    }
    oids.add(oid);
  }

  // Count START and END steps
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

  // Dangling connections (reference non-existent step)
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

  // Self-referencing connections
  for (const conn of connections) {
    if (conn.from_step_id === conn.to_step_id) {
      return { valid: false, error_code: 'SELF_REFERENCING_CONNECTION', error_message: `Self-referencing connection on step: ${conn.from_step_id}` };
    }
  }

  // Orphaned steps (not reachable from START via BFS)
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
  for (const step of steps) {
    if (!reachable.has(step.oid as string)) {
      return { valid: false, error_code: 'ORPHANED_STEP', error_message: `Step ${step.oid} is not reachable from START` };
    }
  }

  // PARALLEL without matching WAIT ALL
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

function actionProxyValidation(workflow: Record<string, unknown>): ValidationResult | null {
  const steps = workflow['steps'] as Array<Record<string, unknown>>;
  const envSpecs = (workflow['environment_specifications'] as Array<Record<string, unknown>> | undefined) ?? [];

  const envActions = new Map<string, Set<string>>();
  for (const env of envSpecs) {
    const envOid = env['oid'] as string | undefined;
    if (typeof envOid !== 'string') continue;
    const included = (env['included_actions'] as Array<Record<string, unknown>> | undefined) ?? [];
    const oids = new Set<string>();
    for (const a of included) {
      const aOid = a['action_oid'];
      if (typeof aOid === 'string') oids.add(aOid);
    }
    envActions.set(envOid, oids);
  }

  for (const step of steps) {
    if (step['step_type'] !== 'ACTION PROXY') continue;
    const stepOid = (step['oid'] as string | undefined) ?? '<unknown>';
    const config = step['action_proxy_config'] as Record<string, unknown> | undefined;
    if (!config) {
      return { valid: false, error_code: 'INVALID_VALIDATION', error_message: `ACTION PROXY step ${stepOid} missing action_proxy_config` };
    }
    const envOid = config['environment_oid'] as string | undefined;
    const actionOid = config['action_oid'] as string | undefined;
    if (!envOid || !actionOid) {
      return { valid: false, error_code: 'INVALID_VALIDATION', error_message: `ACTION PROXY step ${stepOid} action_proxy_config missing required field` };
    }
    if (!envActions.has(envOid)) {
      return { valid: false, error_code: 'INVALID_VALIDATION', error_message: `ACTION PROXY step ${stepOid} references unknown environment_oid ${envOid}` };
    }
    if (!envActions.get(envOid)!.has(actionOid)) {
      return { valid: false, error_code: 'INVALID_VALIDATION', error_message: `ACTION PROXY step ${stepOid} action_oid ${actionOid} not in environment ${envOid}` };
    }
  }
  return null;
}

function resourceValidation(workflow: Record<string, unknown>): ValidationResult | null {
  // Build (sourceOid → Map<resourceName, resource_type>) across the whole tree:
  // every workflow's own (workflow-scoped) resources keyed by that workflow's oid,
  // every embedded environment's resources keyed by that environment's oid.
  // An empty inner Map records that the source oid IS known even if it owns no resources,
  // letting us distinguish "unknown source" from "known source missing this resource".
  const ownedResources = new Map<string, Map<string, string>>();

  function recordOwner(sourceOid: string | undefined, name: string | undefined, type: string | undefined): void {
    if (typeof sourceOid !== 'string') return;
    let owned = ownedResources.get(sourceOid);
    if (!owned) {
      owned = new Map<string, string>();
      ownedResources.set(sourceOid, owned);
    }
    if (typeof name === 'string' && typeof type === 'string' && !owned.has(name)) {
      owned.set(name, type);
    }
  }

  function gatherOwners(spec: Record<string, unknown> | undefined): void {
    if (!spec || typeof spec !== 'object') return;
    const specOid = spec['oid'] as string | undefined;
    if (typeof specOid === 'string') recordOwner(specOid, undefined, undefined);

    const wfResources = spec['resource_property_specifications'] as Record<string, unknown>[] | undefined;
    if (Array.isArray(wfResources)) {
      for (const r of wfResources) {
        if (r['scope'] === 'environment') continue;
        recordOwner(specOid, r['name'] as string, r['resource_type'] as string);
      }
    }

    const envSpecs = spec['environment_specifications'] as Record<string, unknown>[] | undefined;
    if (Array.isArray(envSpecs)) {
      for (const env of envSpecs) {
        const envOid = env['oid'] as string | undefined;
        if (typeof envOid === 'string') recordOwner(envOid, undefined, undefined);
        const envResources = env['resource_property_specifications'] as Record<string, unknown>[] | undefined;
        if (Array.isArray(envResources)) {
          for (const r of envResources) {
            recordOwner(envOid, r['name'] as string, r['resource_type'] as string);
          }
        }
      }
    }

    const childSpecs = spec['children'] as Record<string, unknown>[] | undefined;
    if (Array.isArray(childSpecs)) {
      for (const c of childSpecs) gatherOwners(c);
    }
  }

  gatherOwners(workflow);

  const ACQUIRE_RELEASE_TYPES = new Set(['binary exclusive use', 'binary shared use with pool limits', 'named pool']);
  const COUNTABLE_TYPES = new Set(['countable use with pool limits']);
  const SYNC_TYPES = new Set(['sync']);
  const SYNC_COMMANDS = new Set(['Send', 'Receive', 'Synchronize']);

  function validateSpecSteps(spec: Record<string, unknown>): ValidationResult | null {
    const specOid = spec['oid'] as string | undefined;
    const steps = spec['steps'] as Record<string, unknown>[] | undefined;
    if (Array.isArray(steps)) {
      for (const step of steps) {
        const cmds = step['resource_command_specifications'] as Record<string, unknown>[] | undefined;
        if (!Array.isArray(cmds) || cmds.length === 0) continue;
        let syncCount = 0;
        const stepLabel = (step['local_id'] as string | undefined) ?? (step['oid'] as string | undefined) ?? '<unknown>';

        for (const cmd of cmds) {
          const commandType = cmd['command_type'] as string;
          const resourceName = cmd['resource_name'] as string;
          const sourceOid = (cmd['resource_source_oid'] as string | undefined) ?? specOid;

          const ownedByThisSource = typeof sourceOid === 'string' ? ownedResources.get(sourceOid) : undefined;
          const resType = ownedByThisSource?.get(resourceName);

          if (!resType) {
            // Distinguish: source oid unknown vs known source missing this resource name.
            if (!ownedByThisSource) {
              return {
                valid: false,
                error_code: 'INVALID_RESOURCE_COMMAND',
                error_message: `Step "${stepLabel}" command "${commandType}": resource_source_oid "${sourceOid ?? '(none)'}" does not match any workflow or environment in this package`,
              };
            }
            return {
              valid: false,
              error_code: 'INVALID_RESOURCE_COMMAND',
              error_message: `Resource command references unknown resource: "${resourceName}"`,
            };
          }

          if (commandType === 'Acquire' || commandType === 'Release') {
            if (!ACQUIRE_RELEASE_TYPES.has(resType)) {
              return { valid: false, error_code: 'INVALID_RESOURCE_COMMAND', error_message: `${commandType} not compatible with resource type "${resType}"` };
            }
          } else if (commandType === 'Acquire Pool Amount' || commandType === 'Release Pool Amount') {
            if (!COUNTABLE_TYPES.has(resType)) {
              return { valid: false, error_code: 'INVALID_RESOURCE_COMMAND', error_message: `${commandType} not compatible with resource type "${resType}"` };
            }
            const amount = cmd['amount'] as number | undefined;
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
          return { valid: false, error_code: 'INVALID_RESOURCE_COMMAND', error_message: `Step "${step['oid']}" has ${syncCount} sync commands (max 1)` };
        }
      }
    }

    const childSpecs = spec['children'] as Record<string, unknown>[] | undefined;
    if (Array.isArray(childSpecs)) {
      for (const c of childSpecs) {
        const err = validateSpecSteps(c);
        if (err) return err;
      }
    }
    return null;
  }

  const stepError = validateSpecSteps(workflow);
  if (stepError) return stepError;

  function validateSpecResourceShape(spec: Record<string, unknown>): ValidationResult | null {
    const resourceSpecs = spec['resource_property_specifications'] as Record<string, unknown>[] | undefined;
    if (Array.isArray(resourceSpecs)) {
      for (const rspec of resourceSpecs) {
        if (rspec['resource_type'] === 'named pool') {
          const names = rspec['names'] as string[] | undefined;
          if (!names || names.length === 0) {
            return { valid: false, error_code: 'INVALID_RESOURCE_SPEC', error_message: `Named pool "${rspec['name']}" must have a non-empty names array` };
          }
        }
        if (rspec['resource_type'] === 'binary shared use with pool limits' || rspec['resource_type'] === 'countable use with pool limits') {
          const limit = rspec['use_limit'] as number | undefined;
          if (!limit || limit <= 0) {
            return { valid: false, error_code: 'INVALID_RESOURCE_SPEC', error_message: `Resource "${rspec['name']}" requires use_limit > 0` };
          }
        }
      }
    }
    const childSpecs = spec['children'] as Record<string, unknown>[] | undefined;
    if (Array.isArray(childSpecs)) {
      for (const c of childSpecs) {
        const err = validateSpecResourceShape(c);
        if (err) return err;
      }
    }
    return null;
  }

  return validateSpecResourceShape(workflow);
}

// Relax form element `required` arrays in the schema so that elements
// missing optional-in-practice fields (fieldName, label, etc.) still
// validate.  We keep only `["type"]` so invalid element types are caught.
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
        // Keep only 'type' as required
        part.required = ['type'];
      }
    }
  }
}

// Structural validation via ajv
let cachedSchema: Record<string, unknown> | null = null;

function loadSchema(): Record<string, unknown> {
  if (cachedSchema) return cachedSchema;
  const candidates = [
    resolve(__dirname, '../../../../spec/workflow-schema.json'),
    resolve(__dirname, '../../../../../spec/workflow-schema.json'),
    resolve(__dirname, '../../../spec/workflow-schema.json'),
    resolve(__dirname, '../../spec/workflow-schema.json'),
  ];
  for (const p of candidates) {
    try {
      const raw = JSON.parse(readFileSync(p, 'utf-8'));
      // Remove $schema since ajv doesn't support 2020-12 out of the box
      delete raw['$schema'];
      // Relax form element required fields — fixtures have elements
      // without fieldName/label/outputValue that are still valid.
      // Keep only the 'type' const so invalid types are still caught.
      relaxFormElementRequired(raw);
      cachedSchema = raw;
      return cachedSchema!;
    } catch {
      // try next
    }
  }
  throw new Error(`Cannot find workflow-schema.json, tried: ${candidates.join(', ')}`);
}

// Deep-clone workflow with SELECT_1 → SELECT 1 normalization for ajv
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

function structuralValidation(workflow: Record<string, unknown>): ValidationResult | null {
  const schema = loadSchema();
  const ajv = new (Ajv as unknown as typeof Ajv.default)({ allErrors: true, strict: false });
  const validateFn = ajv.compile(schema);
  const valid = validateFn(normalizeForAjv(workflow));

  if (valid) return null;

  const errors = validateFn.errors ?? [];

  for (const err of errors) {
    const path = err.instancePath ?? '';
    const keyword = err.keyword;

    if (keyword === 'oneOf' && path.includes('elements')) {
      return { valid: false, error_code: 'INVALID_FORM_ELEMENT_TYPE', error_message: `Invalid form element at ${path}` };
    }

    if (keyword === 'enum' && path.includes('step_type')) {
      return { valid: false, error_code: 'INVALID_STEP_TYPE', error_message: `Invalid step type at ${path}` };
    }

    if (keyword === 'required') {
      return { valid: false, error_code: 'MISSING_REQUIRED_FIELD', error_message: `Missing required field: ${err.params?.missingProperty} at ${path}` };
    }
  }

  // Fallback: form element type failures via const mismatches
  const hasOneOfFail = errors.some((e: ErrorObject) => e.keyword === 'oneOf');
  const hasConstFails = errors.some((e: ErrorObject) => e.keyword === 'const' && e.instancePath?.includes('/type'));
  if (hasOneOfFail && hasConstFails) {
    return { valid: false, error_code: 'INVALID_FORM_ELEMENT_TYPE', error_message: 'Invalid form element type' };
  }

  return { valid: false, error_code: 'MISSING_REQUIRED_FIELD', error_message: errors[0]?.message ?? 'Validation failed' };
}

export function validate(workflow: Record<string, unknown>): ValidationResult {
  // Phase 0: Pre-structural (missing required fields on steps/connections)
  const preError = preStructuralChecks(workflow);
  if (preError) return preError;

  // Phase A: Semantic checks (graph analysis)
  const semanticError = semanticValidation(workflow);
  if (semanticError) return semanticError;

  // Phase A2: ACTION PROXY config validation (§14.2)
  const actionProxyError = actionProxyValidation(workflow);
  if (actionProxyError) return actionProxyError;

  // Phase A3: Resource validation
  const resourceError = resourceValidation(workflow);
  if (resourceError) return resourceError;

  // Phase B: Structural validation (ajv)
  const structuralError = structuralValidation(workflow);
  if (structuralError) return structuralError;

  return { valid: true };
}

export { validate as validateWorkflow };
