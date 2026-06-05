// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
package io.saturnis.trajectory.ui.screens

import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.material3.windowsizeclass.WindowWidthSizeClass
import io.saturnis.trajectory.manager.AddResult
import io.saturnis.trajectory.manager.WorkflowManager
import io.saturnis.trajectory.manager.LoadedWorkflow
import io.saturnis.trajectory.ui.theme.spacingFor
import io.saturnis.trajectory.ui.components.WorkflowCard
import io.saturnis.trajectory.ui.components.WorkflowStartDialog
import io.saturnis.trajectory.util.FileProcessor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    manager: WorkflowManager,
    widthSizeClass: WindowWidthSizeClass,
    onNavigateToActive: () -> Unit,
) {
    val spacing = spacingFor(widthSizeClass)
    val state by manager.state.collectAsState()
    val context = LocalContext.current
    val prefs = remember { context.getSharedPreferences("trajectoryruntime_settings", android.content.Context.MODE_PRIVATE) }
    val confirmDeleteLoaded = prefs.getBoolean("confirm_delete_loaded", true)

    // Pending delete confirmation state
    var pendingDeleteLoadedId by remember { mutableStateOf<String?>(null) }
    // Workflow start dialog state
    var startTarget by remember { mutableStateOf<LoadedWorkflow?>(null) }
    val scope = rememberCoroutineScope()

    val filePicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument(),
    ) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        // Validate file extension
        val displayName = context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) {
                val idx = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                if (idx >= 0) cursor.getString(idx) else null
            } else null
        }
        if (displayName == null || !displayName.lowercase().endsWith(".wfmasterx")) {
            Toast.makeText(context, "Only .wfmasterx files are supported", Toast.LENGTH_LONG).show()
            return@rememberLauncherForActivityResult
        }
        scope.launch {
            val result = withContext(Dispatchers.IO) {
                val workflowsDir = File(context.filesDir, "workflows")
                workflowsDir.mkdirs()
                FileProcessor.processFile(context, uri, workflowsDir)
            }
            result.fold(
                onSuccess = { processResult ->
                    when (val addResult = manager.addWorkflow(
                        spec = processResult.spec,
                        mediaMap = processResult.mediaMap,
                        mediaDir = processResult.mediaDir,
                        environmentJsons = processResult.environmentJsons,
                    )) {
                        is AddResult.Success -> {
                            Toast.makeText(context, "Workflow loaded", Toast.LENGTH_SHORT).show()
                        }
                        is AddResult.Duplicate -> {
                            Toast.makeText(context, "Workflow already loaded", Toast.LENGTH_SHORT).show()
                        }
                    }
                },
                onFailure = { error ->
                    Toast.makeText(
                        context,
                        "Failed to load: ${error.message}",
                        Toast.LENGTH_LONG,
                    ).show()
                },
            )
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Trajectory Mobile") },
            )
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = {
                    filePicker.launch(
                        arrayOf(
                            "application/octet-stream",
                            "application/zip",
                            "*/*",
                        )
                    )
                },
            ) {
                Icon(Icons.Default.Add, contentDescription = "Load workflow")
            }
        },
    ) { padding ->
        val loaded = state.loaded
        val active = state.active

        if (loaded.isEmpty() && active.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = "No workflows loaded.\nTap + to import a workflow file.",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                )
            }
        } else {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentPadding = PaddingValues(spacing.contentPadding),
                verticalArrangement = Arrangement.spacedBy(spacing.cardSpacing),
            ) {
                if (loaded.isNotEmpty()) {
                    item {
                        Text(
                            text = "Loaded Workflows",
                            style = MaterialTheme.typography.titleSmall,
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }
                    items(loaded, key = { it.id }, contentType = { "loaded" }) { workflow ->
                        val dismissState = rememberSwipeToDismissBoxState(
                            confirmValueChange = { value ->
                                if (value == SwipeToDismissBoxValue.EndToStart || value == SwipeToDismissBoxValue.StartToEnd) {
                                    if (confirmDeleteLoaded) {
                                        pendingDeleteLoadedId = workflow.id
                                        false // don't dismiss yet — wait for confirmation
                                    } else {
                                        manager.removeLoadedWorkflow(workflow.id)
                                        true
                                    }
                                } else false
                            },
                        )
                        SwipeToDismissBox(
                            state = dismissState,
                            backgroundContent = {
                                Box(
                                    modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.errorContainer),
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
                            WorkflowCard(
                                name = workflow.name,
                                onClick = { startTarget = workflow },
                            )
                        }
                    }
                }

                if (active.isNotEmpty()) {
                    item {
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = "Active Workflows",
                            style = MaterialTheme.typography.titleSmall,
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }
                    items(active, key = { it.id }, contentType = { "active" }) { workflow ->
                        WorkflowCard(
                            name = workflow.name,
                            subtitle = "Running",
                            onClick = {
                                manager.focusWorkflow(workflow.id)
                                onNavigateToActive()
                            },
                            modifier = Modifier.animateItem(),
                        )
                    }
                }
            }
        }
    }

    // Workflow start dialog
    startTarget?.let { workflow ->
        WorkflowStartDialog(
            workflow = workflow,
            onStart = { id, startingParams ->
                startTarget = null
                val allowScript = prefs.getBoolean("allow_script_execution", false)
                manager.startWorkflow(id, startingParams, allowScript)
                onNavigateToActive()
            },
            onCancel = { startTarget = null },
        )
    }

    // Confirmation dialog for deleting loaded workflows
    if (pendingDeleteLoadedId != null) {
        AlertDialog(
            onDismissRequest = { pendingDeleteLoadedId = null },
            title = { Text("Delete Workflow?") },
            text = { Text("Are you sure you want to remove this loaded workflow?") },
            confirmButton = {
                TextButton(onClick = {
                    manager.removeLoadedWorkflow(pendingDeleteLoadedId!!)
                    pendingDeleteLoadedId = null
                }) { Text("Delete") }
            },
            dismissButton = {
                TextButton(onClick = { pendingDeleteLoadedId = null }) { Text("Cancel") }
            },
        )
    }
}
