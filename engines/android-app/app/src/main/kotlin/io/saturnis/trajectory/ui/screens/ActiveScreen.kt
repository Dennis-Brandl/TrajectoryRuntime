// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
package io.saturnis.trajectory.ui.screens

import android.content.res.Configuration
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.PagerState
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.saturnis.trajectory.manager.WorkflowManager
import io.saturnis.trajectory.ui.components.ViewportClass
import com.trajectoryruntime.engine.*
import kotlinx.coroutines.flow.combine

data class FlatActiveStep(
    val workflowId: String,
    val workflowName: String,
    val stepInfo: ActiveStepInfo,
    val properties: Map<String, String>,
    val inputParameters: Map<String, String>,
    val mediaMap: Map<String, String>,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ActiveScreen(
    manager: WorkflowManager,
) {
    val managerState by manager.state.collectAsState()
    val activeWorkflows = managerState.active

    // Stably combine all coordinator StateFlows — only recomputes on actual state changes
    val allSteps by produceState(initialValue = emptyList<FlatActiveStep>(), key1 = activeWorkflows) {
        if (activeWorkflows.isEmpty()) {
            value = emptyList()
            return@produceState
        }
        combine(activeWorkflows.map { it.coordinator.state }) { states ->
            activeWorkflows.flatMapIndexed { index, wf ->
                val coordState = states[index]
                coordState.activeSteps.map { stepInfo ->
                    val stepOid = stepInfo.step.oid
                    val perStepParams = coordState.stepParams[stepOid]?.inputParameters
                        ?: coordState.inputParameters
                    FlatActiveStep(
                        workflowId = wf.id,
                        workflowName = wf.name,
                        stepInfo = stepInfo,
                        properties = coordState.properties,
                        inputParameters = perStepParams,
                        mediaMap = coordState.mediaMap,
                    )
                }
            }
        }.collect { value = it }
    }

    val configuration = LocalConfiguration.current
    val viewport = if (
        configuration.orientation == Configuration.ORIENTATION_LANDSCAPE &&
        configuration.smallestScreenWidthDp >= 600
    ) {
        ViewportClass.TABLET_LANDSCAPE
    } else {
        ViewportClass.PORTRAIT
    }

    // State command menu
    var showMenu by remember { mutableStateOf(false) }
    var showAbandonConfirm by remember { mutableStateOf(false) }
    var showRestartConfirm by remember { mutableStateOf(false) }
    var showRepeatPicker by remember { mutableStateOf(false) }
    val focusedId = managerState.focusedActiveId
    val focusedWorkflow = managerState.active.find { it.id == focusedId }
    val focusedCoordState = focusedWorkflow?.coordinator?.state?.collectAsState()?.value
    val isRunning = focusedCoordState?.workflowState == WorkflowState.RUNNING
    val hasExecuting = focusedCoordState?.activeSteps?.any { it.step.state == StepState.EXECUTING } ?: false
    val hasPaused = focusedCoordState?.activeSteps?.any { it.step.state == StepState.PAUSED } ?: false
    val completedSteps = focusedWorkflow?.coordinator?.getCompletedSteps() ?: emptyList()
    val canRepeat = isRunning && completedSteps.isNotEmpty()

    // Pager state lifted here so TopAppBar can show current step name
    // Use large virtual page count for infinite loop swiping
    val realPageCount = allSteps.size
    val virtualPageCount = if (realPageCount > 1) realPageCount * 1000 else realPageCount
    val initialPage = if (realPageCount > 1) virtualPageCount / 2 - (virtualPageCount / 2 % realPageCount) else 0
    val pagerState = rememberPagerState(initialPage = initialPage, pageCount = { virtualPageCount })
    val currentRealPage = if (realPageCount > 0) pagerState.currentPage % realPageCount else 0
    val currentStep = if (allSteps.isNotEmpty() && currentRealPage < allSteps.size) {
        allSteps[currentRealPage]
    } else null

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = currentStep?.workflowName ?: focusedWorkflow?.name ?: "Active",
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        currentStep?.let {
                            Text(
                                text = it.stepInfo.step.step.local_id,
                                style = MaterialTheme.typography.bodyMedium,
                                fontStyle = FontStyle.Italic,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                },
                actions = {
                    if (focusedWorkflow != null) {
                        Box {
                            IconButton(onClick = { showMenu = true }) {
                                Icon(Icons.Default.MoreVert, contentDescription = "State Commands")
                            }
                            DropdownMenu(
                                expanded = showMenu,
                                onDismissRequest = { showMenu = false },
                            ) {
                                DropdownMenuItem(
                                    text = { Text("Pause") },
                                    enabled = isRunning && hasExecuting,
                                    onClick = {
                                        showMenu = false
                                        focusedWorkflow.coordinator.pauseAll()
                                    },
                                )
                                DropdownMenuItem(
                                    text = { Text("Resume") },
                                    enabled = isRunning && hasPaused,
                                    onClick = {
                                        showMenu = false
                                        focusedWorkflow.coordinator.resumeAll()
                                    },
                                )
                                DropdownMenuItem(
                                    text = { Text("Repeat") },
                                    enabled = canRepeat,
                                    onClick = {
                                        showMenu = false
                                        showRepeatPicker = true
                                    },
                                )
                                HorizontalDivider()
                                DropdownMenuItem(
                                    text = { Text("Abandon", color = MaterialTheme.colorScheme.error) },
                                    enabled = isRunning,
                                    onClick = {
                                        showMenu = false
                                        showAbandonConfirm = true
                                    },
                                )
                                DropdownMenuItem(
                                    text = { Text("Restart", color = MaterialTheme.colorScheme.error) },
                                    enabled = isRunning,
                                    onClick = {
                                        showMenu = false
                                        showRestartConfirm = true
                                    },
                                )
                            }
                        }
                    }
                },
            )
        },
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            if (allSteps.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(
                        "No active steps",
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            } else {
                val onAction: (String, UserAction) -> Unit = { workflowId, action ->
                    manager.getCoordinator(workflowId)?.submitAction(action)
                }

                PagerActiveLayout(allSteps, onAction, viewport = viewport, pagerState = pagerState)
            }
        }
    }

    // Abandon confirmation dialog
    if (showAbandonConfirm) {
        AlertDialog(
            onDismissRequest = { showAbandonConfirm = false },
            title = { Text("Abandon Workflow?") },
            text = { Text("This will stop and remove the workflow. This cannot be undone.") },
            confirmButton = {
                TextButton(onClick = {
                    showAbandonConfirm = false
                    if (focusedId != null) manager.getCoordinator(focusedId)?.abort()
                }) { Text("Abandon") }
            },
            dismissButton = {
                TextButton(onClick = { showAbandonConfirm = false }) { Text("Cancel") }
            },
        )
    }

    // Restart confirmation dialog
    if (showRestartConfirm) {
        AlertDialog(
            onDismissRequest = { showRestartConfirm = false },
            title = { Text("Restart Workflow?") },
            text = { Text("This will stop the current execution and restart from the beginning.") },
            confirmButton = {
                TextButton(onClick = {
                    showRestartConfirm = false
                    if (focusedId != null) manager.getCoordinator(focusedId)?.restart()
                }) { Text("Restart") }
            },
            dismissButton = {
                TextButton(onClick = { showRestartConfirm = false }) { Text("Cancel") }
            },
        )
    }

    // Repeat step picker dialog
    if (showRepeatPicker && completedSteps.isNotEmpty()) {
        var selectedOids by remember { mutableStateOf(setOf<String>()) }
        val coordinator = focusedWorkflow?.coordinator
        val warnings = if (selectedOids.isNotEmpty()) {
            coordinator?.checkRestartSafety(selectedOids.toList()) ?: emptyList()
        } else emptyList()

        AlertDialog(
            onDismissRequest = { showRepeatPicker = false },
            title = { Text("Repeat from Step") },
            text = {
                Column {
                    Text(
                        "Select completed steps to repeat:",
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(bottom = 8.dp),
                    )
                    completedSteps.forEach { step ->
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    selectedOids = if (step.oid in selectedOids) {
                                        selectedOids - step.oid
                                    } else {
                                        selectedOids + step.oid
                                    }
                                }
                                .padding(vertical = 4.dp),
                        ) {
                            Checkbox(
                                checked = step.oid in selectedOids,
                                onCheckedChange = null,
                            )
                            Text(
                                text = step.localId,
                                modifier = Modifier.padding(start = 8.dp),
                            )
                        }
                    }
                    if (warnings.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(8.dp))
                        warnings.forEach { warning ->
                            Text(
                                text = warning,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.error,
                            )
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        showRepeatPicker = false
                        coordinator?.restartToSteps(selectedOids.toList())
                    },
                    enabled = selectedOids.isNotEmpty(),
                ) { Text("Repeat") }
            },
            dismissButton = {
                TextButton(onClick = { showRepeatPicker = false }) { Text("Cancel") }
            },
        )
    }
}

@Composable
private fun PagerActiveLayout(
    allSteps: List<FlatActiveStep>,
    onAction: (String, UserAction) -> Unit,
    viewport: ViewportClass,
    pagerState: PagerState,
) {
    val realPageCount = allSteps.size
    val dotIndex = if (realPageCount > 0) pagerState.currentPage % realPageCount else 0

    Column(modifier = Modifier.fillMaxSize()) {
        // BoxWithConstraints captures bounded height from weight(1f),
        // then passes it explicitly to pager pages for safe verticalScroll
        BoxWithConstraints(modifier = Modifier.weight(1f).fillMaxWidth()) {
            val pageHeight = maxHeight
            HorizontalPager(
                state = pagerState,
                modifier = Modifier.fillMaxSize(),
            ) { page ->
                val realIndex = if (allSteps.isNotEmpty()) page % allSteps.size else -1
                if (realIndex in allSteps.indices) {
                    val step = allSteps[realIndex]
                    key(step.stepInfo.step.oid) {
                        // Card outer (4 top + 4 bottom) + inner (8 top + 8 bottom) padding.
                        val cardChrome = 24.dp
                        CompositionLocalProvider(
                            io.saturnis.trajectory.ui.components.LocalAvailableFormHeight provides
                                (pageHeight - cardChrome).coerceAtLeast(0.dp),
                        ) {
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(pageHeight)
                                    .verticalScroll(rememberScrollState()),
                            ) {
                                io.saturnis.trajectory.ui.components.ActiveStepCard(
                                    step = step.stepInfo,
                                    onAction = { action -> onAction(step.workflowId, action) },
                                    properties = step.properties,
                                    inputParameters = step.inputParameters,
                                    mediaMap = step.mediaMap,
                                    viewport = viewport,
                                )
                            }
                        }
                    }
                }
            }
        }

        // Dot indicator
        if (allSteps.size > 1) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 8.dp),
                horizontalArrangement = Arrangement.Center,
            ) {
                repeat(allSteps.size) { index ->
                    val color = if (index == dotIndex) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        MaterialTheme.colorScheme.onSurface.copy(alpha = 0.3f)
                    }
                    Box(
                        modifier = Modifier
                            .padding(horizontal = 4.dp)
                            .size(10.dp)
                            .background(color, shape = CircleShape),
                    )
                }
            }
        }
    }
}
