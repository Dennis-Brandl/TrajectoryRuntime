package com.trajectoryruntime.engine

import kotlin.test.Test
import kotlin.test.assertEquals

class TryCatchHandlersTest {
  @Test fun `activateCatchStep writes trigger info to declared targets`() {
    val store = PropertyStore()
    store.set("FailureContext.Mode", "")
    store.set("FailureContext.Message", "")
    val step = MasterWorkflowStep(
      local_id = "Catch", oid = "c1", version = "1.0.0", last_modified_date = "d", step_type = "CATCH", catch_id = "C1",
      output_parameter_specifications = listOf(
        OutputParameterSpecification(id = "trigger_reason", target = "FailureContext.Mode"),
        OutputParameterSpecification(id = "error_message", target = "FailureContext.Message"),
      ),
    )
    val ctx = CatchContext("c1", "a1", "Heat Oven", "ERROR", "thermocouple failure", "d")
    activateCatchStep(step, ctx, store)
    assertEquals("ERROR", store.get("FailureContext.Mode"))
    assertEquals("thermocouple failure", store.get("FailureContext.Message"))
  }
}
