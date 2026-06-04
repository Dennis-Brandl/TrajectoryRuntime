// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
import type { MasterEnvironmentSpecification, MasterWorkflowSpecification } from '@engine/types.js';

export function environmentsNeedingBinding(workflow: MasterWorkflowSpecification): MasterEnvironmentSpecification[] {
  const refs = new Set<string>();
  for (const step of workflow.steps) {
    if (step.step_type === 'ACTION PROXY' && step.action_proxy_config?.environment_oid) {
      refs.add(step.action_proxy_config.environment_oid);
    }
  }
  return (workflow.environment_specifications ?? []).filter(e => refs.has(e.oid));
}
