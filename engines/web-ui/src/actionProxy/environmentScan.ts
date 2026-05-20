// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
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
