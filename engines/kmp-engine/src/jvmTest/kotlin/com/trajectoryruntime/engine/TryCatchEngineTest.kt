package com.trajectoryruntime.engine

import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

private val LENIENT = Json { ignoreUnknownKeys = true }
private fun wfSpec(json: String): MasterWorkflowSpecification = LENIENT.decodeFromString(json)
private const val DATE = "2026-05-31T12:00:00.000Z"

/** START→Action(try ERROR→C1)→END + Catch→Return. opts override the TRY and RETURN JSON. */
private fun tryWf(trySpec: String = """[{"mode":"ERROR","catch_id":"C1"}]""",
                  returnJson: String = """{"command":"ABANDON"}""",
                  catchOutputs: String = """[{"id":"trigger_reason","target":"FailureContext.Mode"}]""",
                  extraSteps: String = "", extraConns: String = ""): String = """
{
 "local_id":"wf","oid":"wf-1","version":"1.0.0","last_modified_date":"$DATE","schemaVersion":"4.0",
 "value_property_specifications":[{"name":"FailureContext","entries":[{"name":"Mode","value":""}]}],
 "steps":[
  {"local_id":"Start","oid":"s1","version":"1.0.0","last_modified_date":"$DATE","step_type":"START"},
  {"local_id":"Action","oid":"s2","version":"1.0.0","last_modified_date":"$DATE","step_type":"ACTION PROXY","try_specifications":$trySpec},
  {"local_id":"End","oid":"s3","version":"1.0.0","last_modified_date":"$DATE","step_type":"END"},
  {"local_id":"Catch","oid":"c1","version":"1.0.0","last_modified_date":"$DATE","step_type":"CATCH","catch_id":"C1","output_parameter_specifications":$catchOutputs},
  {"local_id":"Ret","oid":"r1","version":"1.0.0","last_modified_date":"$DATE","step_type":"RETURN","return_config":$returnJson}
  $extraSteps
 ],
 "connections":[{"from_step_id":"s1","to_step_id":"s2"},{"from_step_id":"s2","to_step_id":"s3"},{"from_step_id":"c1","to_step_id":"r1"}$extraConns]
}"""

class TryCatchEngineTest {
  @Test fun `ACTION PROXY parks EXECUTING with no invoker`() {
    val engine = WorkflowEngine(wfSpec(tryWf()))
    engine.start()
    assertTrue(engine.getActiveSteps().any { it.step.oid == "s2" && it.step.step.step_type == "ACTION PROXY" })
    assertEquals(WorkflowState.RUNNING, engine.getWorkflowState())
  }

  @Test fun `uncaught failure errors the workflow`() {
    val engine = WorkflowEngine(wfSpec(tryWf(trySpec = "[]"))) // Action has no TRY
    engine.start()
    engine.submitAction(UserAction(step_oid = "s2", action = "fail", failure_mode = "ERROR", error = "boom"), 0)
    assertEquals(WorkflowState.ERRORED, engine.getWorkflowState())
    assertTrue(engine.getTrace().any { it.step_oid == "s2" && it.state == "ERRORED" })
  }

  @Test fun `matching failure activates the CATCH network and writes trigger info`() {
    val engine = WorkflowEngine(wfSpec(tryWf()))
    engine.start()
    engine.submitAction(UserAction(step_oid = "s2", action = "fail", failure_mode = "ERROR", error = "thermocouple"), 0)
    val states = engine.getTrace().map { "${it.step_oid}:${it.state}" }
    assertTrue(states.contains("c1:COMPLETED"), "CATCH not activated: $states")
    assertEquals("ERROR", engine.getProperties()["FailureContext.Mode"])
    assertNotEquals(WorkflowState.ERRORED, engine.getWorkflowState())
  }
}
