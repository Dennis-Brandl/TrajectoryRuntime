// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.

export interface PartitionStep { oid: string; step_type: string; catch_id?: string }
export interface PartitionConnection { from_step_id: string; to_step_id: string }

export interface CatchNetworkPartition {
  mainFlowStepOids: Set<string>;
  catchNetworkStepOids: Set<string>;
  /** catch_id → set of step oids reachable from that CATCH (only if the subgraph contains a RETURN). */
  networksByCatchId: Map<string, Set<string>>;
}

/** Spec §6.5: a catch network is the BFS-closure from a CATCH over outgoing edges, but only counts if it reaches a RETURN. */
export function partitionCatchNetworks(
  steps: PartitionStep[],
  connections: PartitionConnection[],
): CatchNetworkPartition {
  const outEdges = new Map<string, string[]>();
  for (const c of connections) {
    const list = outEdges.get(c.from_step_id);
    if (list) list.push(c.to_step_id);
    else outEdges.set(c.from_step_id, [c.to_step_id]);
  }
  const typeByOid = new Map<string, string>();
  for (const s of steps) typeByOid.set(s.oid, s.step_type);

  const networksByCatchId = new Map<string, Set<string>>();
  const catchNetworkStepOids = new Set<string>();

  for (const step of steps) {
    if (step.step_type !== 'CATCH' || !step.catch_id) continue;
    const visited = new Set<string>();
    const queue: string[] = [step.oid];
    let hasReturn = false;
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (visited.has(cur)) continue;
      visited.add(cur);
      if (typeByOid.get(cur) === 'RETURN') hasReturn = true;
      for (const n of outEdges.get(cur) ?? []) {
        if (!visited.has(n)) queue.push(n);
      }
    }
    if (hasReturn) {
      networksByCatchId.set(step.catch_id, visited);
      for (const oid of visited) catchNetworkStepOids.add(oid);
    }
  }

  const mainFlowStepOids = new Set<string>();
  for (const s of steps) {
    if (!catchNetworkStepOids.has(s.oid)) mainFlowStepOids.add(s.oid);
  }
  return { mainFlowStepOids, catchNetworkStepOids, networksByCatchId };
}
