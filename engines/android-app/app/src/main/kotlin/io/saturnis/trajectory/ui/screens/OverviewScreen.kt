// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
package io.saturnis.trajectory.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.material3.windowsizeclass.WindowWidthSizeClass
import io.saturnis.trajectory.coordinator.CoordinatorState
import io.saturnis.trajectory.manager.WorkflowManager
import io.saturnis.trajectory.ui.theme.spacingFor
import io.saturnis.trajectory.ui.components.WorkflowGraph
import com.trajectoryruntime.engine.MasterWorkflowSpecification
import com.trajectoryruntime.engine.StepState

@Composable
fun OverviewScreen(
    manager: WorkflowManager,
    widthSizeClass: WindowWidthSizeClass,
) {
    val spacing = spacingFor(widthSizeClass)
    val managerState by manager.state.collectAsState()
    val focusedId = managerState.focusedActiveId
    val activeWorkflow = managerState.active.find { it.id == focusedId }

    if (activeWorkflow == null) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(
                "No active workflow",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        return
    }

    val coordState by activeWorkflow.coordinator.state.collectAsState()

    // Use getActiveSpec() to follow into child workflows, matching web behavior
    val activeSpec = remember(coordState) {
        activeWorkflow.coordinator.getActiveSpec()
    }

    if (activeSpec == null) return

    // Build state map from coordinator trace and active steps
    val stateMap = remember(coordState, activeSpec) {
        buildStepStateMap(activeSpec, coordState)
    }

    Column(modifier = Modifier.fillMaxSize()) {
        // Header with workflow name
        Text(
            text = activeWorkflow.name,
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(spacing.contentPadding),
        )

        // Workflow selector when multiple active workflows exist
        if (managerState.active.size > 1) {
            SingleChoiceSegmentedButtonRow(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = spacing.contentPadding, vertical = 4.dp),
            ) {
                managerState.active.forEachIndexed { index, wf ->
                    SegmentedButton(
                        selected = wf.id == focusedId,
                        onClick = { manager.focusWorkflow(wf.id) },
                        shape = SegmentedButtonDefaults.itemShape(
                            index = index,
                            count = managerState.active.size,
                        ),
                    ) {
                        Text(
                            text = wf.name.take(12),
                            maxLines = 1,
                        )
                    }
                }
            }
        }

        WorkflowGraph(
            spec = activeSpec,
            stateMap = stateMap,
            modifier = Modifier.fillMaxSize(),
        )
    }
}

private fun buildStepStateMap(
    spec: MasterWorkflowSpecification,
    coordState: CoordinatorState,
): Map<String, String> {
    val map = mutableMapOf<String, String>()

    // From trace: mark steps that reached COMPLETED
    for (entry in coordState.trace) {
        if (entry.state == "COMPLETED") {
            map[entry.step_oid] = "COMPLETED"
        }
    }

    // From active steps: currently executing/waiting/paused (overrides trace)
    for (activeStep in coordState.activeSteps) {
        map[activeStep.step.oid] = activeStep.step.state.name
    }

    // Anything not in the map is implicitly IDLE (handled by WorkflowGraph default)
    return map
}
