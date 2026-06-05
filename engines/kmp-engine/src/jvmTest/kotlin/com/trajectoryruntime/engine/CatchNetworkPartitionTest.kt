// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
package com.trajectoryruntime.engine

import kotlin.test.Test
import kotlin.test.assertEquals

class CatchNetworkPartitionTest {
  private val steps = listOf(
    Triple("s1", "START", null), Triple("s2", "ACTION PROXY", null), Triple("s3", "END", null),
    Triple("c1", "CATCH", "C1"), Triple("c2", "USER_INTERACTION", null), Triple("c3", "RETURN", null),
  )
  private val conns = listOf("s1" to "s2", "s2" to "s3", "c1" to "c2", "c2" to "c3")

  @Test fun `separates main-flow from catch-network`() {
    val p = partitionCatchNetworks(steps, conns)
    assertEquals(setOf("s1", "s2", "s3"), p.mainFlowStepOids)
    assertEquals(setOf("c1", "c2", "c3"), p.catchNetworkStepOids)
    assertEquals(setOf("c1", "c2", "c3"), p.networksByCatchId["C1"])
  }

  @Test fun `excludes a CATCH with no reachable RETURN`() {
    val p = partitionCatchNetworks(
      listOf(Triple("s1","START",null), Triple("s2","END",null), Triple("c1","CATCH","C1"), Triple("c2","USER_INTERACTION",null)),
      listOf("s1" to "s2", "c1" to "c2"),
    )
    assertEquals(0, p.catchNetworkStepOids.size)
    assertEquals(4, p.mainFlowStepOids.size)
  }
}
