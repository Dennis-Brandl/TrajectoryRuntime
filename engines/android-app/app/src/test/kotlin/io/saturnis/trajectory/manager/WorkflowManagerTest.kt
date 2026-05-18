// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
package io.saturnis.trajectory.manager

import com.trajectoryruntime.engine.MasterWorkflowSpecification
import kotlinx.serialization.json.Json
import org.junit.Assert.*
import org.junit.Test

class WorkflowManagerTest {
    private val json = Json { ignoreUnknownKeys = true }

    private fun startEndSpec(): MasterWorkflowSpecification {
        return json.decodeFromString("""
        {
            "local_id": "test-wf", "oid": "oid-1", "version": "1.0",
            "last_modified_date": "2026-01-01",
            "steps": [
                {"local_id": "start", "oid": "s1", "version": "1.0", "last_modified_date": "2026-01-01", "step_type": "START"},
                {"local_id": "end", "oid": "s2", "version": "1.0", "last_modified_date": "2026-01-01", "step_type": "END"}
            ],
            "connections": [{"from_step_id": "s1", "to_step_id": "s2"}]
        }
        """.trimIndent())
    }

    @Test
    fun `addWorkflow adds to loaded list`() {
        val manager = WorkflowManager(dao = null)
        val result = manager.addWorkflow(startEndSpec(), emptyMap())
        assertTrue(result is AddResult.Success)
        assertEquals(1, manager.state.value.loaded.size)
    }

    @Test
    fun `addWorkflow detects duplicates by specOid`() {
        val manager = WorkflowManager(dao = null)
        manager.addWorkflow(startEndSpec(), emptyMap())
        val result = manager.addWorkflow(startEndSpec(), emptyMap())
        assertTrue(result is AddResult.Duplicate)
    }

    @Test
    fun `startWorkflow creates active workflow and auto-completes`() {
        val manager = WorkflowManager(dao = null)
        val addResult = manager.addWorkflow(startEndSpec(), emptyMap()) as AddResult.Success
        val instanceId = manager.startWorkflow(addResult.id)
        assertNotNull(instanceId)
        // START→END auto-completes immediately
        assertEquals(0, manager.state.value.active.size)
        assertEquals(1, manager.state.value.completed.size)
    }

    @Test
    fun `removeLoadedWorkflow removes from list`() {
        val manager = WorkflowManager(dao = null)
        val addResult = manager.addWorkflow(startEndSpec(), emptyMap()) as AddResult.Success
        manager.removeLoadedWorkflow(addResult.id)
        assertEquals(0, manager.state.value.loaded.size)
    }
}
