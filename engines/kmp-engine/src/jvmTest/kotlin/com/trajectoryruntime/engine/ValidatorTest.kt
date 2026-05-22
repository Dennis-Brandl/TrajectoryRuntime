// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
package com.trajectoryruntime.engine

import kotlin.test.Test
import kotlin.test.assertNull
import kotlin.test.assertFails
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json

class ValidatorTest {

    // Strict Json: does NOT ignore unknown keys — used to prove child_workflows is removed
    private val strictJson = Json { ignoreUnknownKeys = false }

    // Lenient Json: matches production config in ConformanceRunner
    private val lenientJson = Json { ignoreUnknownKeys = true }

    /**
     * After removal of child_workflows from MasterWorkflowSpecification, strict
     * deserialization must reject JSON that contains child_workflows (unknown key).
     * Before removal this test FAILS because the field exists and is accepted.
     * After removal this test PASSES because the key is unknown → SerializationException.
     */
    @Test
    fun `legacy child_workflows field is rejected by strict deserialization after removal`() {
        val legacyJson = """
          {
            "oid": "wf-1",
            "local_id": "Outer",
            "version": "1.0.0",
            "last_modified_date": "2026-01-01T00:00:00Z",
            "steps": [],
            "connections": [],
            "child_workflows": [
              {
                "oid": "old-child",
                "local_id": "Inner",
                "version": "1.0.0",
                "last_modified_date": "2026-01-01T00:00:00Z",
                "steps": [],
                "connections": []
              }
            ]
          }
        """.trimIndent()
        assertFails {
            strictJson.decodeFromString<MasterWorkflowSpecification>(legacyJson)
        }
    }

    /**
     * After removal, production-config Json (ignoreUnknownKeys = true) silently
     * ignores child_workflows and children remains null.
     */
    @Test
    fun `legacy child_workflows field is ignored after removal`() {
        val legacyJson = """
          {
            "oid": "wf-1",
            "local_id": "Outer",
            "version": "1.0.0",
            "last_modified_date": "2026-01-01T00:00:00Z",
            "steps": [],
            "connections": [],
            "child_workflows": [
              {
                "oid": "old-child",
                "local_id": "Inner",
                "version": "1.0.0",
                "last_modified_date": "2026-01-01T00:00:00Z",
                "steps": [],
                "connections": []
              }
            ]
          }
        """.trimIndent()
        val workflow = lenientJson.decodeFromString<MasterWorkflowSpecification>(legacyJson)
        // After removal of child_workflows field, children stays null (not populated from child_workflows).
        assertNull(workflow.children)
    }
}
