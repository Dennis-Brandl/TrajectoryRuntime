// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
package io.saturnis.trajectory.ui.screens

import android.content.Intent
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.windowsizeclass.WindowWidthSizeClass
import androidx.compose.ui.unit.Dp
import io.saturnis.trajectory.manager.CompletedWorkflow
import io.saturnis.trajectory.manager.WorkflowManager
import io.saturnis.trajectory.ui.theme.spacingFor
import kotlinx.serialization.json.*
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HistoryScreen(
    manager: WorkflowManager,
    widthSizeClass: WindowWidthSizeClass,
) {
    val spacing = spacingFor(widthSizeClass)
    val state by manager.state.collectAsState()
    val context = LocalContext.current
    val prefs = remember { context.getSharedPreferences("trajectoryruntime_settings", android.content.Context.MODE_PRIVATE) }
    val confirmDeleteCompleted = prefs.getBoolean("confirm_delete_completed", false)
    var pendingDeleteCompletedId by remember { mutableStateOf<String?>(null) }
    val completed = remember(state.completed) {
        state.completed.sortedByDescending { it.finishedAt }
    }

    Scaffold(
        topBar = {
            TopAppBar(title = { Text("History") })
        },
    ) { padding ->
        if (completed.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = "No completed workflows yet.",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                )
            }
        } else {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .then(
                        if (spacing.maxContentWidth != Dp.Infinity)
                            Modifier.widthIn(max = spacing.maxContentWidth)
                        else Modifier
                    ),
                contentPadding = PaddingValues(spacing.contentPadding),
                verticalArrangement = Arrangement.spacedBy(spacing.cardSpacing),
            ) {
                items(completed, key = { it.id }, contentType = { "completed" }) { workflow ->
                    val dismissState = rememberSwipeToDismissBoxState(
                        confirmValueChange = { value ->
                            if (value == SwipeToDismissBoxValue.EndToStart || value == SwipeToDismissBoxValue.StartToEnd) {
                                if (confirmDeleteCompleted) {
                                    pendingDeleteCompletedId = workflow.id
                                    false
                                } else {
                                    manager.removeCompletedWorkflow(workflow.id)
                                    true
                                }
                            } else false
                        },
                    )

                    SwipeToDismissBox(
                        state = dismissState,
                        backgroundContent = {
                            Box(
                                modifier = Modifier
                                    .fillMaxSize()
                                    .background(MaterialTheme.colorScheme.errorContainer),
                                contentAlignment = Alignment.CenterEnd,
                            ) {
                                Icon(
                                    Icons.Default.Delete,
                                    contentDescription = "Delete",
                                    tint = MaterialTheme.colorScheme.onErrorContainer,
                                    modifier = Modifier.padding(horizontal = 20.dp),
                                )
                            }
                        },
                        modifier = Modifier.animateItem(),
                    ) {
                        CompletedWorkflowCard(
                            workflow = workflow,
                            onDelete = { manager.removeCompletedWorkflow(workflow.id) },
                        )
                    }
                }
            }
        }
    }

    // Confirmation dialog for deleting completed workflows
    if (pendingDeleteCompletedId != null) {
        AlertDialog(
            onDismissRequest = { pendingDeleteCompletedId = null },
            title = { Text("Delete Completed Workflow?") },
            text = { Text("Are you sure you want to remove this completed workflow from history?") },
            confirmButton = {
                TextButton(onClick = {
                    manager.removeCompletedWorkflow(pendingDeleteCompletedId!!)
                    pendingDeleteCompletedId = null
                }) { Text("Delete") }
            },
            dismissButton = {
                TextButton(onClick = { pendingDeleteCompletedId = null }) { Text("Cancel") }
            },
        )
    }
}

@Composable
private fun CompletedWorkflowCard(
    workflow: CompletedWorkflow,
    onDelete: () -> Unit,
) {
    val context = LocalContext.current
    var expanded by remember { mutableStateOf(false) }
    val dateFormat = remember { SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.getDefault()) }

    ElevatedCard(
        modifier = Modifier
            .fillMaxWidth()
            .animateContentSize(),
    ) {
        Column(
            modifier = Modifier
                .clickable { expanded = !expanded }
                .padding(16.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = workflow.name,
                        style = MaterialTheme.typography.titleMedium,
                    )
                    Text(
                        text = "${workflow.localId} v${workflow.version}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = dateFormat.format(Date(workflow.finishedAt)),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                StateBadge(workflow.workflowState)
            }

            if (expanded) {
                Spacer(modifier = Modifier.height(12.dp))
                HorizontalDivider()
                Spacer(modifier = Modifier.height(12.dp))

                // Properties
                val properties = tryParseJson(workflow.propertiesJson)
                if (properties != null && properties.isNotEmpty()) {
                    Text(
                        text = "Properties",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.primary,
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    properties.forEach { (key, value) ->
                        Text(
                            text = "$key: ${value.jsonPrimitive.contentOrNull ?: value}",
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                }

                // Trace
                val trace = tryParseJsonArray(workflow.traceJson)
                if (trace != null && trace.isNotEmpty()) {
                    // Build step OID → local_id lookup from stored spec
                    val stepNames = remember(workflow.specJson) {
                        try {
                            val spec = Json.parseToJsonElement(workflow.specJson).jsonObject
                            val steps = spec["steps"]?.jsonArray ?: JsonArray(emptyList())
                            steps.associate { step ->
                                val obj = step.jsonObject
                                val oid = obj["oid"]?.jsonPrimitive?.contentOrNull ?: ""
                                val localId = obj["local_id"]?.jsonPrimitive?.contentOrNull ?: oid
                                oid to localId
                            }
                        } catch (_: Exception) { emptyMap() }
                    }

                    Text(
                        text = "Trace (${trace.size} entries)",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.primary,
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    trace.take(50).forEach { entry ->
                        val obj = entry.jsonObject
                        val stepOid = obj["step_oid"]?.jsonPrimitive?.contentOrNull ?: "?"
                        val state = obj["state"]?.jsonPrimitive?.contentOrNull ?: "?"
                        val stepName = stepNames[stepOid] ?: stepOid
                        Text(
                            text = "$stepName - $state",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    IconButton(onClick = onDelete) {
                        Icon(
                            Icons.Default.Delete,
                            contentDescription = "Delete",
                            tint = MaterialTheme.colorScheme.error,
                        )
                    }
                    IconButton(onClick = {
                        val jsonString = buildExportJson(workflow)
                        val sendIntent = Intent(Intent.ACTION_SEND).apply {
                            type = "application/json"
                            putExtra(Intent.EXTRA_TEXT, jsonString)
                            putExtra(Intent.EXTRA_SUBJECT, "Workflow Result: ${workflow.name}")
                        }
                        context.startActivity(Intent.createChooser(sendIntent, "Share workflow result"))
                    }) {
                        Icon(
                            Icons.Default.Share,
                            contentDescription = "Share",
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun StateBadge(workflowState: String) {
    val (color, label) = when (workflowState) {
        "COMPLETED" -> Color(0xFF4CAF50) to "COMPLETED"
        "ABORTED" -> MaterialTheme.colorScheme.error to "ABORTED"
        "STOPPED" -> Color(0xFFFF9800) to "STOPPED"
        "ERRORED" -> MaterialTheme.colorScheme.error to "ERRORED"
        else -> MaterialTheme.colorScheme.onSurfaceVariant to workflowState
    }
    Surface(
        color = color.copy(alpha = 0.12f),
        shape = MaterialTheme.shapes.small,
    ) {
        Text(
            text = label,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
            style = MaterialTheme.typography.labelSmall,
            color = color,
        )
    }
}

private fun buildExportJson(workflow: CompletedWorkflow): String {
    val json = Json { prettyPrint = true }
    val export = buildJsonObject {
        put("workflowName", workflow.name)
        put("workflowLocalId", workflow.localId)
        put("workflowVersion", workflow.version)
        put("workflowState", workflow.workflowState)
        put("properties", Json.parseToJsonElement(workflow.propertiesJson))
        put("trace", Json.parseToJsonElement(workflow.traceJson))
    }
    return json.encodeToString(JsonObject.serializer(), export)
}

private fun tryParseJson(jsonString: String): Map<String, JsonElement>? {
    return try {
        Json.parseToJsonElement(jsonString).jsonObject
    } catch (_: Exception) {
        null
    }
}

private fun tryParseJsonArray(jsonString: String): List<JsonElement>? {
    return try {
        Json.parseToJsonElement(jsonString).jsonArray
    } catch (_: Exception) {
        null
    }
}
