// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
import Ajv, { type ErrorObject } from 'ajv';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ValidationResult } from './types.js';
import { partitionCatchNetworks, type PartitionStep, type PartitionConnection } from './catch-network-partition.js';
import { hasValidServerUriScheme } from './lib/server-uri.js';

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
  // Catch networks are intentional disconnected islands (reached at runtime via TRY, not via a connection).
  const partition = partitionCatchNetworks(
    steps as unknown as PartitionStep[],
    connections as unknown as PartitionConnection[],
  );
  for (const step of steps) {
    const oid = step.oid as string;
    if (partition.catchNetworkStepOids.has(oid)) continue;
    if (!reachable.has(oid)) {
      return { valid: false, error_code: 'ORPHANED_STEP', error_message: `Step ${oid} is not reachable from START` };
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

function tryCatchValidation(workflow: Record<string, unknown>): ValidationResult | null {
  const steps = (workflow['steps'] as Record<string, unknown>[]) ?? [];
  const connections = (workflow['connections'] as Record<string, unknown>[]) ?? [];
  const fail = (code: string, msg: string, oid?: string): ValidationResult =>
    ({ valid: false, error_code: code, error_message: oid ? `${msg} (step ${oid})` : msg });

  const TRY_SCOPED = new Set(['ACTION PROXY', 'WAIT ACTION PROXY']);
  const MODES = new Set(['ERROR', 'ABORT', 'TIMEOUT']);
  const COMMANDS = new Set(['ABANDON', 'RESTART', 'GOTO', 'RETRY', 'COMPLETE']);

  for (const step of steps) {
    const type = normalizeStepType(String(step.step_type));
    const oid = step.oid as string;
    const inDeg = connections.filter(c => c.to_step_id === oid).length;
    const outDeg = connections.filter(c => c.from_step_id === oid).length;

    if (type === 'CATCH' && (inDeg !== 0 || outDeg !== 1)) {
      return fail('CATCH_WRONG_DEGREE', `CATCH must have 0 incoming and 1 outgoing connection (has ${inDeg} in, ${outDeg} out)`, oid);
    }
    if (type === 'RETURN' && (inDeg !== 1 || outDeg !== 0)) {
      return fail('RETURN_WRONG_DEGREE', `RETURN must have 1 incoming and 0 outgoing connections (has ${inDeg} in, ${outDeg} out)`, oid);
    }

    const tries = step.try_specifications as Array<{ mode: string; catch_id: string }> | undefined;
    if (tries && tries.length > 0) {
      if (!TRY_SCOPED.has(type)) {
        return fail('TRY_ON_INVALID_STEP', `try_specifications not allowed on step_type '${type}'`, oid);
      }
      const seen = new Set<string>();
      for (const t of tries) {
        if (!MODES.has(t.mode)) return fail('INVALID_TRY_MODE', `invalid try mode '${t.mode}'`, oid);
        if (seen.has(t.mode)) return fail('DUPLICATE_TRY_MODE', `mode '${t.mode}' appears more than once`, oid);
        seen.add(t.mode);
      }
    }

    if (type === 'RETURN') {
      const rc = step.return_config as { command?: string; restart_mode?: string; goto_step_oid?: string } | undefined;
      // A RETURN must carry a valid command. A missing return_config (e.g. a RETURN left
      // at the editor's visual default) is rejected here rather than silently stranding the
      // workflow at runtime (dispatchReturn would otherwise no-op on the absent config).
      if (!rc || !rc.command || !COMMANDS.has(rc.command)) {
        return fail('INVALID_RETURN_COMMAND', `RETURN requires a valid return_config.command (got '${rc?.command ?? 'none'}')`, oid);
      }
      if (rc.command === 'RESTART' && !rc.restart_mode) return fail('MISSING_RESTART_MODE', `RESTART requires restart_mode`, oid);
      if (rc.restart_mode && rc.restart_mode !== 'CLEAN' && rc.restart_mode !== 'KEEP') return fail('INVALID_RESTART_MODE', `invalid restart_mode '${rc.restart_mode}'`, oid);
      if (rc.command === 'GOTO' && !rc.goto_step_oid) return fail('MISSING_GOTO_TARGET', `GOTO requires goto_step_oid`, oid);
    }
  }

  // Cross-reference: catch_id uniqueness, TRY→CATCH resolution, GOTO target.
  const catchIds = new Set<string>();
  for (const step of steps) {
    if (normalizeStepType(String(step.step_type)) !== 'CATCH') continue;
    const cid = step.catch_id as string | undefined;
    if (!cid) continue;
    if (catchIds.has(cid)) return fail('DUPLICATE_CATCH_ID', `catch_id '${cid}' used by more than one CATCH`, step.oid as string);
    catchIds.add(cid);
  }
  const oidSet = new Set(steps.map(s => s.oid as string));
  const partition = partitionCatchNetworks(steps as unknown as PartitionStep[], connections as unknown as PartitionConnection[]);
  for (const step of steps) {
    const tries = step.try_specifications as Array<{ catch_id: string }> | undefined;
    for (const t of tries ?? []) {
      if (!catchIds.has(t.catch_id)) return fail('UNMATCHED_TRY', `TRY references undefined catch_id '${t.catch_id}'`, step.oid as string);
    }
    if (normalizeStepType(String(step.step_type)) === 'RETURN') {
      const rc = step.return_config as { command?: string; goto_step_oid?: string } | undefined;
      if (rc?.command === 'GOTO' && rc.goto_step_oid) {
        if (!oidSet.has(rc.goto_step_oid)) return fail('GOTO_TARGET_NOT_FOUND', `GOTO target '${rc.goto_step_oid}' not found`, step.oid as string);
        if (partition.catchNetworkStepOids.has(rc.goto_step_oid)) return fail('GOTO_TARGET_IN_CATCH', `GOTO target '${rc.goto_step_oid}' is inside a catch network`, step.oid as string);
      }
    }
  }

  // Topology: no edge may cross the main-flow / catch-network boundary (spec §6.3).
  // The partition is RETURN-gated (spec §6.5); structural-degree checks above fire first.
  // CATCH_WITHOUT_RETURN / RETURN_WITHOUT_CATCH / CATCH_NETWORK_NOT_CONNECTED (spec §6.3)
  // are editor-time codes (§6.6); at runtime a RETURN-less or internally-disconnected
  // catch island is rejected transitively by the ORPHANED_STEP check in semanticValidation.
  for (const c of connections) {
    const fromIn = partition.catchNetworkStepOids.has(c.from_step_id as string);
    const toIn = partition.catchNetworkStepOids.has(c.to_step_id as string);
    if (fromIn !== toIn) {
      return fail('CROSS_NETWORK_EDGE', `connection ${c.from_step_id} → ${c.to_step_id} crosses the catch-network boundary`);
    }
  }
  // ORPHANED_CATCH (a catch_id referenced by no TRY) is ACCEPTED at runtime (valid:true);
  // the editor surfaces the warning chip (spec §6.3, §6.6).

  return null;
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

// ────────────────────────────────────────────────────────────────────────────
// Form input binding validation
//
// Every form element that captures user input — `textInput`, `textarea`
// (multi-line text), `checkbox` (checkbox group), and `radio` (radio group) —
// must declare an `outputParameter` binding. Without one, the runtime's
// `captureFormOutputs` (engines/web/src/properties.ts) skips the element on
// submit (`if (!('outputParameter' in el) || !el.outputParameter) continue`)
// and the user's input is silently discarded — any downstream step that
// reads the property the author *thought* the field wrote to gets an empty
// string. That's exactly how the Kitchen workflow's BakeItem hit `int('')`
// after the "Get Test Info" form's three inputs all had auto-generated
// fieldNames (`Text_127680`, `Radio_547520`, `Radio_282752`) but no
// `outputParameter` linking them to the step's output spec.
//
// Catching this at validation time fails fast at file load instead of at
// invoke-time inside Python on the action server.
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
      const layouts = step['form_layout_config'] as
        | Array<Record<string, unknown>>
        | undefined
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

export function validate(workflow: Record<string, unknown>): ValidationResult {
  // Phase 0: Pre-structural (missing required fields on steps/connections)
  const preError = preStructuralChecks(workflow);
  if (preError) return preError;

  // Phase A: Semantic checks (graph analysis)
  const semanticError = semanticValidation(workflow);
  if (semanticError) return semanticError;

  // Phase A1.5: TRY/CATCH/RETURN structural + cross-reference + topology rules
  const tryCatchError = tryCatchValidation(workflow);
  if (tryCatchError) return tryCatchError;

  // Phase A2: ACTION PROXY config validation (§14.2)
  const actionProxyError = actionProxyValidation(workflow);
  if (actionProxyError) return actionProxyError;

  // Phase A2.5: action-server URI scheme check (SSRF — reject non-http(s) URIs)
  const serverUriError = actionServerUriValidation(workflow);
  if (serverUriError) return serverUriError;

  // Phase A3: Resource validation
  const resourceError = resourceValidation(workflow);
  if (resourceError) return resourceError;

  // Phase A4: Form input binding validation — every textInput / textarea /
  // checkbox / radio element must declare an outputParameter or its captured
  // value would be silently discarded by captureFormOutputs at runtime.
  const formInputBindingError = formInputBindingValidation(workflow);
  if (formInputBindingError) return formInputBindingError;

  // Phase B: Structural validation (ajv)
  const structuralError = structuralValidation(workflow);
  if (structuralError) return structuralError;

  return { valid: true };
}

export { validate as validateWorkflow };
