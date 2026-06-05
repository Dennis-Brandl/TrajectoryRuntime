// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
package com.trajectoryruntime.engine

import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ScriptGateKmpTest {
    private val wfJson = """
    {
      "local_id":"wf","oid":"wf","version":"1.0","last_modified_date":"2026-06-04",
      "steps":[
        {"local_id":"start","oid":"start","version":"1.0","last_modified_date":"2026-06-04","step_type":"START"},
        {"local_id":"script","oid":"script","version":"1.0","last_modified_date":"2026-06-04","step_type":"SCRIPT",
         "script_config":{"language":"javascript","source":"output.Result = 'ran';"},
         "output_parameter_specifications":[{"id":"Result","oid":"op1","target":"Out.Result"}]},
        {"local_id":"end","oid":"end","version":"1.0","last_modified_date":"2026-06-04","step_type":"END"}
      ],
      "connections":[
        {"from_step_id":"start","to_step_id":"script"},
        {"from_step_id":"script","to_step_id":"end"}
      ]
    }
    """.trimIndent()

    private fun wf() = Json { ignoreUnknownKeys = true }.decodeFromString<MasterWorkflowSpecification>(wfJson)

    @Test fun scriptIsDisabledByDefault() {
        val engine = WorkflowEngine(wf())
        engine.start()
        assertEquals(WorkflowState.ERRORED, engine.getWorkflowState())
        assertNull(engine.getProperties()["Out.Result"])
        val errored = engine.getTrace().firstOrNull { it.state == "ERRORED" }
        assertTrue(errored?.error?.contains("disabled", ignoreCase = true) == true, "expected a 'disabled' error trace")
    }

    @Test fun scriptExecutesWhenAllowed() {
        val engine = WorkflowEngine(wf(), allowScriptExecution = true)
        engine.start()
        assertEquals(WorkflowState.COMPLETED, engine.getWorkflowState())
        assertEquals("ran", engine.getProperties()["Out.Result"])
    }
}
