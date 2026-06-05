// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
package com.trajectoryruntime.engine

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ActionServerUriValidatorTest {
    private fun parseWorkflow(json: String): Map<String, Any?> {
        @Suppress("UNCHECKED_CAST")
        return com.fasterxml.jackson.databind.ObjectMapper().readValue(json, Map::class.java) as Map<String, Any?>
    }

    private fun wf(serverUri: String) = """{
      "local_id":"wf","oid":"wf","version":"1.0.0","last_modified_date":"2026-06-04",
      "steps":[
        {"local_id":"start","oid":"s1","version":"1.0.0","last_modified_date":"2026-06-04","step_type":"START"},
        {"local_id":"end","oid":"s2","version":"1.0.0","last_modified_date":"2026-06-04","step_type":"END"}
      ],
      "connections":[{"from_step_id":"s1","to_step_id":"s2"}],
      "environment_specifications":[
        {"local_id":"env","oid":"env-1","version":"1.0.0","last_modified_date":"2026-06-04",
         "action_server_specifications":[{"uri":"$serverUri"}]}
      ]
    }""".trimIndent()

    @Test fun `valid http server uri passes`() {
        val r = validate(parseWorkflow(wf("http://localhost:3002")))
        assertTrue(r.valid, "expected valid, got ${r.error_code}: ${r.error_message}")
    }

    @Test fun `non-http server uri is rejected`() {
        val r = validate(parseWorkflow(wf("file:///etc/passwd")))
        assertEquals(false, r.valid)
        assertEquals("INVALID_VALIDATION", r.error_code)
    }
}
