// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
package com.trajectoryruntime.engine

data class CatchNetworkPartition(
    val mainFlowStepOids: Set<String>,
    val catchNetworkStepOids: Set<String>,
    /** catch_id -> set of step oids reachable from that CATCH (only if the subgraph reaches a RETURN). */
    val networksByCatchId: Map<String, Set<String>>,
)

/** Spec §6.5: a catch network is the BFS-closure from a CATCH over outgoing edges, counted only if it reaches a RETURN. */
fun partitionCatchNetworks(
    steps: List<Triple<String, String, String?>>, // (oid, stepType, catchId)
    connections: List<Pair<String, String>>,      // (fromOid, toOid)
): CatchNetworkPartition {
    val outEdges = HashMap<String, MutableList<String>>()
    for ((from, to) in connections) outEdges.getOrPut(from) { mutableListOf() }.add(to)
    val typeByOid = steps.associate { it.first to it.second }

    val networksByCatchId = HashMap<String, Set<String>>()
    val catchNetworkStepOids = HashSet<String>()
    for ((oid, type, catchId) in steps) {
        if (type != "CATCH" || catchId == null) continue
        val visited = HashSet<String>()
        val queue = ArrayDeque<String>()
        queue.add(oid)
        var hasReturn = false
        while (queue.isNotEmpty()) {
            val cur = queue.removeFirst()
            if (!visited.add(cur)) continue
            if (typeByOid[cur] == "RETURN") hasReturn = true
            for (n in outEdges[cur] ?: emptyList()) if (n !in visited) queue.add(n)
        }
        if (hasReturn) {
            networksByCatchId[catchId] = visited
            catchNetworkStepOids.addAll(visited)
        }
    }
    val mainFlowStepOids = steps.map { it.first }.filterNot { it in catchNetworkStepOids }.toSet()
    return CatchNetworkPartition(mainFlowStepOids, catchNetworkStepOids, networksByCatchId)
}
