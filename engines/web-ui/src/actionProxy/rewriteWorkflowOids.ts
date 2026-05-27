// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import type { MasterWorkflowSpecification } from '@engine/types.js';

/**
 * Return a deep clone of `workflow` with all OIDs in `rewrites` replaced by their
 * server-assigned counterparts.  Handles:
 *   - environment_specifications[].oid
 *   - environment_specifications[].included_actions[].oid / .action_oid
 *   - steps[].action_proxy_config.environment_oid / .action_oid
 *   - children (v7.0 nested workflows) — recursed into via the same function
 *
 * When `rewrites` is empty the original object is returned unchanged (no clone).
 */
export function rewriteWorkflowOids(
  workflow: MasterWorkflowSpecification,
  rewrites: Map<string, string>,
): MasterWorkflowSpecification {
  if (rewrites.size === 0) return workflow;

  // Deep clone to avoid mutating the source workflow spec.
  const clone = JSON.parse(JSON.stringify(workflow)) as MasterWorkflowSpecification;

  // Rewrite environment_specifications
  for (const env of clone.environment_specifications ?? []) {
    if (rewrites.has(env.oid)) env.oid = rewrites.get(env.oid)!;
    for (const inc of (env.included_actions ?? []) as Array<{ oid?: string; action_oid?: string }>) {
      const incOid = inc.oid ?? inc.action_oid;
      if (incOid && rewrites.has(incOid)) {
        if (inc.oid !== undefined) inc.oid = rewrites.get(incOid)!;
        if (inc.action_oid !== undefined) inc.action_oid = rewrites.get(incOid)!;
      }
    }
  }

  // Rewrite steps[].action_proxy_config
  for (const step of clone.steps ?? []) {
    const cfg = step.action_proxy_config;
    if (cfg) {
      if (rewrites.has(cfg.environment_oid)) cfg.environment_oid = rewrites.get(cfg.environment_oid)!;
      if (rewrites.has(cfg.action_oid)) cfg.action_oid = rewrites.get(cfg.action_oid)!;
    }
  }

  // Recurse into nested children (v7.0+)
  if (clone.children && clone.children.length > 0) {
    clone.children = clone.children.map(child =>
      rewriteWorkflowOids(child, rewrites) as typeof child,
    );
  }

  return clone;
}
