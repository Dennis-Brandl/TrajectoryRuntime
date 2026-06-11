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
                  catchOutputs: String = """[{"id":"Reason","target":"FailureContext.Mode"}]""",
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

  @Test fun `RETURN ABANDON aborts the workflow`() {
    val engine = WorkflowEngine(wfSpec(tryWf(returnJson = """{"command":"ABANDON"}""")))
    engine.start()
    engine.submitAction(UserAction(step_oid = "s2", action = "fail", failure_mode = "ERROR", error = "x"), 0)
    assertEquals(WorkflowState.ABORTED, engine.getWorkflowState())
  }

  @Test fun `RESTART KEEP re-runs from START and preserves properties`() {
    val engine = WorkflowEngine(wfSpec(tryWf(returnJson = """{"command":"RESTART","restart_mode":"KEEP"}""")))
    engine.start()
    engine.submitAction(UserAction(step_oid = "s2", action = "fail", failure_mode = "ERROR", error = "x"), 0)
    assertEquals(WorkflowState.RUNNING, engine.getWorkflowState())
    assertEquals("ERROR", engine.getProperties()["FailureContext.Mode"])
    assertTrue(engine.getActiveSteps().any { it.step.oid == "s2" })
  }

  @Test fun `RESTART CLEAN resets properties to defaults`() {
    val engine = WorkflowEngine(wfSpec(tryWf(returnJson = """{"command":"RESTART","restart_mode":"CLEAN"}""")))
    engine.start()
    engine.submitAction(UserAction(step_oid = "s2", action = "fail", failure_mode = "ERROR", error = "x"), 0)
    assertEquals("", engine.getProperties()["FailureContext.Mode"])
  }

  @Test fun `RETURN GOTO resumes the main flow at the target`() {
    val wf = tryWf(
      returnJson = """{"command":"GOTO","goto_step_oid":"m1"}""",
      extraSteps = """,{"local_id":"Mid","oid":"m1","version":"1.0.0","last_modified_date":"$DATE","step_type":"USER_INTERACTION"}""")
      .replace(
        """"connections":[{"from_step_id":"s1","to_step_id":"s2"},{"from_step_id":"s2","to_step_id":"s3"}""",
        """"connections":[{"from_step_id":"s1","to_step_id":"s2"},{"from_step_id":"s2","to_step_id":"m1"},{"from_step_id":"m1","to_step_id":"s3"}""")
    val engine = WorkflowEngine(wfSpec(wf))
    engine.start()
    engine.submitAction(UserAction(step_oid = "s2", action = "fail", failure_mode = "ERROR", error = "x"), 0)
    assertTrue(engine.getActiveSteps().any { it.step.oid == "m1" }, "GOTO target not active")
    assertNotEquals(WorkflowState.ERRORED, engine.getWorkflowState())
  }

  @Test fun `RETURN RETRY re-invokes the trigger and second attempt succeeds`() {
    val engine = WorkflowEngine(wfSpec(tryWf(returnJson = """{"command":"RETRY"}""")))
    engine.start()
    engine.submitAction(UserAction(step_oid = "s2", action = "fail", failure_mode = "ERROR", error = "x"), 0)
    assertTrue(engine.getActiveSteps().any { it.step.oid == "s2" }, "s2 not re-activated")
    engine.submitAction(UserAction(step_oid = "s2", action = "submit"), 1)
    assertEquals(WorkflowState.COMPLETED, engine.getWorkflowState())
  }

  @Test fun `RETURN COMPLETE force-completes the trigger and the workflow completes`() {
    val engine = WorkflowEngine(wfSpec(tryWf(returnJson = """{"command":"COMPLETE"}""")))
    engine.start()
    engine.submitAction(UserAction(step_oid = "s2", action = "fail", failure_mode = "ERROR", error = "x"), 0)
    assertEquals(WorkflowState.COMPLETED, engine.getWorkflowState())
    assertTrue(engine.getTrace().any { it.step_oid == "s2" && it.state == "COMPLETED" }, "s2 was not force-completed")
  }
}
