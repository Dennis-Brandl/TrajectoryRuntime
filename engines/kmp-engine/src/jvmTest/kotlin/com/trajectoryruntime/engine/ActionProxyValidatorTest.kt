// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
package com.trajectoryruntime.engine

import kotlin.test.Test
import kotlin.test.assertTrue

class ActionProxyValidatorTest {

    private fun parseWorkflow(json: String): Map<String, Any?> {
        @Suppress("UNCHECKED_CAST")
        return com.fasterxml.jackson.databind.ObjectMapper().readValue(json, Map::class.java) as Map<String, Any?>
    }

    @Test
    fun `ACTION PROXY is accepted as a valid step type`() {
        val workflow = """{
          "local_id":"wf","oid":"wf-oid","version":"1.0.0","last_modified_date":"2026-05-19T00:00:00Z",
          "steps":[
            {"local_id":"start","oid":"step-start","version":"1.0.0","last_modified_date":"2026-05-19T00:00:00Z","step_type":"START"},
            {"local_id":"act","oid":"step-act","version":"1.0.0","last_modified_date":"2026-05-19T00:00:00Z","step_type":"ACTION PROXY","action_proxy_config":{"action_oid":"act-1","environment_oid":"env-1"}},
            {"local_id":"end","oid":"step-end","version":"1.0.0","last_modified_date":"2026-05-19T00:00:00Z","step_type":"END"}
          ],
          "connections":[
            {"from_step_id":"step-start","to_step_id":"step-act"},
            {"from_step_id":"step-act","to_step_id":"step-end"}
          ],
          "environment_specifications":[
            {"local_id":"env","oid":"env-1","version":"1.0.0","last_modified_date":"2026-05-19T00:00:00Z","included_actions":[{"action_oid":"act-1"}]}
          ]
        }""".trimIndent()
        val result = validate(parseWorkflow(workflow))
        assertTrue(result.valid, "expected valid, got ${result.error_code}: ${result.error_message}")
    }
}
