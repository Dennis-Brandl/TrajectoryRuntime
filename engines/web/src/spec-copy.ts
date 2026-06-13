// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
import type { MasterWorkflowSpecification, MasterWorkflowStep, WorkflowConnection, ResourceCommandSpecification, ChildWorkflowExport } from './types.js';

/** Monotonically incrementing runtime OID counter. */
let _nextId = 1;

/** Generate a unique runtime OID (e.g., rt_1, rt_2, ...). */
export function nextOid(): string {
  return `rt_${_nextId++}`;
}

/** Reset the OID counter (for testing only). */
export function _resetOidCounter(): void {
  _nextId = 1;
}

/**
 * Deep-copy a workflow spec, regenerating all step OIDs AND spec-level OIDs,
 * remapping connection references, RETURN goto_step_oid, and resource_source_oid
 * on resource commands. Recurses into children.
 *
 * Preserved (not regenerated):
 *  - local_id, connection_id, source_handle_id
 *  - imageOid on form elements
 *  - resource_source_oid where resource_source_type === 'environment'
 *  - parameter/property/resource spec OIDs
 */
export function deepCopySpec(spec: MasterWorkflowSpecification): MasterWorkflowSpecification {
  // First pass: build spec OID map for the entire tree (old spec oid → new spec oid)
  const specOidMap = new Map<string, string>();
  buildSpecOidMap(spec, specOidMap);

  // Second pass: deep copy with remapping
  return deepCopySpecInternal(spec, specOidMap);
}

/** Recursively collect old spec OID → new spec OID mappings. */
function buildSpecOidMap(spec: MasterWorkflowSpecification, map: Map<string, string>): void {
  if (!map.has(spec.oid)) {
    map.set(spec.oid, nextOid());
  }
  if (spec.children) {
    for (const child of spec.children) {
      buildSpecOidMap(child, map);
    }
  }
}

/** Deep-copy a spec using pre-built specOidMap for resource_source_oid remapping. */
function deepCopySpecInternal(
  spec: MasterWorkflowSpecification,
  specOidMap: Map<string, string>,
): MasterWorkflowSpecification {
  const newSpecOid = specOidMap.get(spec.oid) ?? spec.oid;

  // Build step OID map for this spec's steps
  const stepOidMap = new Map<string, string>();
  for (const step of spec.steps) {
    stepOidMap.set(step.oid, nextOid());
  }

  // Deep-clone steps with new OIDs and remapped resource_source_oid
  const steps: MasterWorkflowStep[] = spec.steps.map(step =>
    copyStep(step, stepOidMap.get(step.oid)!, specOidMap, stepOidMap),
  );

  // Remap connections
  const connections: WorkflowConnection[] = spec.connections.map(conn => ({
    ...conn,
    from_step_id: stepOidMap.get(conn.from_step_id) ?? conn.from_step_id,
    to_step_id: stepOidMap.get(conn.to_step_id) ?? conn.to_step_id,
    waypoints: conn.waypoints ? conn.waypoints.map(wp => ({ ...wp })) : undefined,
  }));

  // Recurse into children
  const children = spec.children
    ? spec.children.map(cw => deepCopySpecInternal(cw, specOidMap) as ChildWorkflowExport)
    : undefined;

  return {
    ...spec,
    oid: newSpecOid,
    steps,
    connections,
    children,
    starting_parameter_specifications: spec.starting_parameter_specifications
      ? spec.starting_parameter_specifications.map(p => ({ ...p }))
      : undefined,
    output_parameter_specifications: spec.output_parameter_specifications
      ? spec.output_parameter_specifications.map(p => ({ ...p }))
      : undefined,
    value_property_specifications: spec.value_property_specifications
      ? spec.value_property_specifications.map(p => ({ ...p, entries: p.entries.map(e => ({ ...e })) }))
      : undefined,
    resource_command_specifications: spec.resource_command_specifications
      ? spec.resource_command_specifications.map(r => copyResourceCommand(r, specOidMap))
      : undefined,
    resource_property_specifications: spec.resource_property_specifications
      ? spec.resource_property_specifications.map(r => ({ ...r, names: r.names ? [...r.names] : undefined }))
      : undefined,
    viewport: spec.viewport ? { ...spec.viewport } : undefined,
  };
}

/** Deep-clone a single step with a new OID. Remaps resource_source_oid on resource commands. */
function copyStep(
  step: MasterWorkflowStep,
  newOid: string,
  specOidMap: Map<string, string>,
  stepOidMap: Map<string, string>,
): MasterWorkflowStep {
  return {
    ...step,
    oid: newOid,
    position: step.position ? { ...step.position } : undefined,
    input_parameter_specifications: step.input_parameter_specifications
      ? step.input_parameter_specifications.map(p => ({ ...p }))
      : undefined,
    output_parameter_specifications: step.output_parameter_specifications
      ? step.output_parameter_specifications.map(p => ({ ...p }))
      : undefined,
    value_property_specifications: step.value_property_specifications
      ? step.value_property_specifications.map(p => ({ ...p, entries: p.entries.map(e => ({ ...e })) }))
      : undefined,
    resource_command_specifications: step.resource_command_specifications
      ? step.resource_command_specifications.map(r => copyResourceCommand(r, specOidMap))
      : undefined,
    form_layout_config: step.form_layout_config
      ? JSON.parse(JSON.stringify(step.form_layout_config))
      : undefined,
    yes_no_config: step.yes_no_config
      ? { ...step.yes_no_config }
      : undefined,
    script_config: step.script_config
      ? { ...step.script_config }
      : undefined,
    select1_config: step.select1_config
      ? { ...step.select1_config, options: step.select1_config.options?.map(o => ({ ...o })) }
      : undefined,
    // A RETURN GOTO references another main-flow step by oid; remap it (like connections)
    // so it still resolves after per-instance OID regeneration — otherwise the GOTO target
    // keeps the authored oid while the step itself becomes rt_N, and the GOTO can never resolve.
    return_config: step.return_config
      ? {
          ...step.return_config,
          goto_step_oid: step.return_config.goto_step_oid
            ? (stepOidMap.get(step.return_config.goto_step_oid) ?? step.return_config.goto_step_oid)
            : step.return_config.goto_step_oid,
        }
      : step.return_config,
  };
}

/** Copy a resource command, remapping resource_source_oid for workflow-scoped resources. */
function copyResourceCommand(
  cmd: ResourceCommandSpecification,
  specOidMap: Map<string, string>,
): ResourceCommandSpecification {
  const copy = { ...cmd };
  // Only remap workflow-scoped resource sources, not environment sources
  if (copy.resource_source_oid && copy.resource_source_type !== 'environment') {
    copy.resource_source_oid = specOidMap.get(copy.resource_source_oid) ?? copy.resource_source_oid;
  }
  return copy;
}
