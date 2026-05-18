// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
package io.saturnis.trajectory.coordinator

import com.trajectoryruntime.engine.*
import kotlinx.serialization.json.Json
import org.junit.Assert.*
import org.junit.Test

class WorkflowCoordinatorTest {
    private val json = Json { ignoreUnknownKeys = true }

    private fun minimalSpec(): MasterWorkflowSpecification {
        val specJson = """
        {
            "local_id": "test-wf", "oid": "oid-1", "version": "1.0",
            "last_modified_date": "2026-01-01",
            "steps": [
                {"local_id": "start", "oid": "s1", "version": "1.0", "last_modified_date": "2026-01-01", "step_type": "START"},
                {"local_id": "end", "oid": "s2", "version": "1.0", "last_modified_date": "2026-01-01", "step_type": "END"}
            ],
            "connections": [{"from_step_id": "s1", "to_step_id": "s2"}]
        }
        """.trimIndent()
        return json.decodeFromString(specJson)
    }

    @Test
    fun `loadAndStart transitions to COMPLETED for start-end workflow`() {
        val coordinator = WorkflowCoordinator()
        coordinator.loadAndStart(minimalSpec())
        val state = coordinator.state.value
        assertEquals(WorkflowState.COMPLETED, state.workflowState)
    }

    @Test
    fun `initial state is IDLE`() {
        val coordinator = WorkflowCoordinator()
        assertEquals(WorkflowState.IDLE, coordinator.state.value.workflowState)
    }

    @Test
    fun `getUserActions returns empty for no interactions`() {
        val coordinator = WorkflowCoordinator()
        coordinator.loadAndStart(minimalSpec())
        assertTrue(coordinator.getUserActions().isEmpty())
    }

    @Test
    fun `reset returns to IDLE state`() {
        val coordinator = WorkflowCoordinator()
        coordinator.loadAndStart(minimalSpec())
        assertEquals(WorkflowState.COMPLETED, coordinator.state.value.workflowState)
        coordinator.reset()
        assertEquals(WorkflowState.IDLE, coordinator.state.value.workflowState)
    }
}
