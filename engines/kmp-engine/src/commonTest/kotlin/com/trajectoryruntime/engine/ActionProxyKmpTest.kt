// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
package com.trajectoryruntime.engine

import kotlin.test.Test
import kotlin.test.assertTrue
import kotlinx.serialization.json.Json

class ActionProxyKmpTest {
    @Test fun engineThrowsOnDuplicateActionLocalId() {
        val wfJson = """
        {
          "local_id":"wf","oid":"o","version":"1.0","last_modified_date":"2026-05-23",
          "steps":[{"local_id":"s","oid":"so","version":"1.0","last_modified_date":"2026-05-23","step_type":"START"}],
          "connections":[],
          "environment_specifications":[
            {"local_id":"e1","oid":"e1o","version":"1.0","last_modified_date":"2026-05-23",
             "included_actions":[{"local_id":"A","oid":"a1"}]},
            {"local_id":"e2","oid":"e2o","version":"1.0","last_modified_date":"2026-05-23",
             "included_actions":[{"local_id":"A","oid":"a2"}]}
          ]
        }
        """.trimIndent()
        val wf = Json { ignoreUnknownKeys = true }.decodeFromString<MasterWorkflowSpecification>(wfJson)
        var threw = false
        var message = ""
        try {
            WorkflowEngine(wf)
        } catch (e: IllegalStateException) {
            threw = true
            message = e.message ?: ""
        }
        assertTrue(threw, "expected IllegalStateException")
        assertTrue(message.contains("duplicate action local_id \"A\""), "wrong message: $message")
    }
}
