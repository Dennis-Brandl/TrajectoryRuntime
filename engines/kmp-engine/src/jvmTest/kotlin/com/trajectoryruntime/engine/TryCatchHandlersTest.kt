package com.trajectoryruntime.engine

import kotlin.test.Test
import kotlin.test.assertEquals

class TryCatchHandlersTest {
  @Test fun `activateCatchStep writes trigger info to declared targets`() {
    val store = PropertyStore()
    store.set("FailureContext.Mode", "")
    store.set("FailureContext.Message", "")
    store.set("FailureContext.Step", "")
    store.set("FailureContext.StepID", "")
    val step = MasterWorkflowStep(
      local_id = "Catch", oid = "c1", version = "1.0.0", last_modified_date = "d", step_type = "CATCH", catch_id = "C1",
      output_parameter_specifications = listOf(
        OutputParameterSpecification(id = "Reason", target = "FailureContext.Mode"),
        OutputParameterSpecification(id = "Message", target = "FailureContext.Message"),
        OutputParameterSpecification(id = "Step", target = "FailureContext.Step"),
        OutputParameterSpecification(id = "StepID", target = "FailureContext.StepID"),
      ),
    )
    val ctx = CatchContext("c1", "a1", "Heat Oven", "ERROR", "thermocouple failure", "d")
    activateCatchStep(step, ctx, store)
    assertEquals("ERROR", store.get("FailureContext.Mode"))
    assertEquals("thermocouple failure", store.get("FailureContext.Message"))
    assertEquals("Heat Oven", store.get("FailureContext.Step"))
    assertEquals("a1", store.get("FailureContext.StepID"))
  }

  @Test fun `activateCatchStep ignores unknown output ids without throwing`() {
    val store = PropertyStore()
    val step = MasterWorkflowStep(
      local_id = "C", oid = "c1", version = "1.0.0", last_modified_date = "d", step_type = "CATCH", catch_id = "C1",
      output_parameter_specifications = listOf(
        OutputParameterSpecification(id = "not_a_field", target = "X.Y"),
      ),
    )
    val ctx = CatchContext("c1", "a1", "X", "ABORT", null, "d")
    activateCatchStep(step, ctx, store) // must not throw
  }
}
