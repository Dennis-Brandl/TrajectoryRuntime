// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
package io.saturnis.trajectory.ui.screens

import android.content.Context
import androidx.compose.foundation.layout.*
import androidx.compose.material3.windowsizeclass.WindowWidthSizeClass
import androidx.compose.ui.unit.Dp
import io.saturnis.trajectory.ui.theme.spacingFor
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp

private const val PREFS_NAME = "trajectoryruntime_settings"
private const val KEY_THEME = "theme"
private const val KEY_CONFIRM_DELETE_LOADED = "confirm_delete_loaded"
private const val KEY_CONFIRM_DELETE_COMPLETED = "confirm_delete_completed"

private enum class ThemeOption(val key: String, val label: String) {
    LIGHT("light", "Light"),
    DARK("dark", "Dark"),
    SYSTEM("system", "System"),
}

private enum class ResourceScope(val title: String, val emptyText: String) {
    ENVIRONMENT("Environment Resources", "No environment resources are registered."),
    WORKFLOW("Workflow Resources", "No workflow resources are registered."),
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    widthSizeClass: WindowWidthSizeClass,
    onThemeChanged: ((String) -> Unit)? = null,
    onGetEnvironmentResources: (() -> List<com.trajectoryruntime.engine.ResourceSnapshotEntry>)? = null,
    onReleaseEnvironmentResources: (() -> List<String>)? = null,
    onGetWorkflowResources: (() -> List<com.trajectoryruntime.engine.ResourceSnapshotEntry>)? = null,
    onReleaseWorkflowResources: (() -> List<String>)? = null,
    onResetResource: ((String) -> Boolean)? = null,
) {
    val spacing = spacingFor(widthSizeClass)
    val context = LocalContext.current
    val prefs = remember { context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE) }

    var theme by remember {
        mutableStateOf(
            ThemeOption.entries.find { it.key == prefs.getString(KEY_THEME, "system") }
                ?: ThemeOption.SYSTEM
        )
    }
    var confirmDeleteLoaded by remember {
        mutableStateOf(prefs.getBoolean(KEY_CONFIRM_DELETE_LOADED, true))
    }
    var confirmDeleteCompleted by remember {
        mutableStateOf(prefs.getBoolean(KEY_CONFIRM_DELETE_COMPLETED, true))
    }

    Scaffold(
        topBar = {
            TopAppBar(title = { Text("Settings") })
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(spacing.contentPadding)
                .then(
                    if (spacing.maxContentWidth != Dp.Infinity)
                        Modifier.widthIn(max = spacing.maxContentWidth)
                    else Modifier
                ),
            verticalArrangement = Arrangement.spacedBy(spacing.sectionSpacing),
        ) {
            // Theme section
            Text(
                text = "Appearance",
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.primary,
            )
            Column(modifier = Modifier.selectableGroup()) {
                ThemeOption.entries.forEach { option ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        RadioButton(
                            selected = theme == option,
                            onClick = {
                                theme = option
                                prefs.edit().putString(KEY_THEME, option.key).apply()
                                onThemeChanged?.invoke(option.key)
                            },
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = option.label,
                            style = MaterialTheme.typography.bodyLarge,
                        )
                    }
                }
            }

            HorizontalDivider()

            // Confirmations section
            Text(
                text = "Confirmations",
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.primary,
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "Confirm before deleting loaded workflows",
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.weight(1f),
                )
                Switch(
                    checked = confirmDeleteLoaded,
                    onCheckedChange = { checked ->
                        confirmDeleteLoaded = checked
                        prefs.edit().putBoolean(KEY_CONFIRM_DELETE_LOADED, checked).apply()
                    },
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "Confirm before deleting completed workflows",
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.weight(1f),
                )
                Switch(
                    checked = confirmDeleteCompleted,
                    onCheckedChange = { checked ->
                        confirmDeleteCompleted = checked
                        prefs.edit().putBoolean(KEY_CONFIRM_DELETE_COMPLETED, checked).apply()
                    },
                )
            }

            HorizontalDivider()

            // Resource management section
            if (onReleaseEnvironmentResources != null || onReleaseWorkflowResources != null) {
                Text(
                    text = "Resource Management",
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.primary,
                )

                var releaseResult by remember { mutableStateOf<String?>(null) }
                var dialogScope by remember { mutableStateOf<ResourceScope?>(null) }
                var dialogSnapshot by remember {
                    mutableStateOf<List<com.trajectoryruntime.engine.ResourceSnapshotEntry>>(emptyList())
                }

                fun loadSnapshot(scope: ResourceScope) {
                    dialogSnapshot = when (scope) {
                        ResourceScope.ENVIRONMENT -> onGetEnvironmentResources?.invoke() ?: emptyList()
                        ResourceScope.WORKFLOW -> onGetWorkflowResources?.invoke() ?: emptyList()
                    }
                }

                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        text = "View resources held by active workflows. Use the trash icon to release a single resource, or Release All to reset every resource of that scope.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    if (onGetEnvironmentResources != null && onReleaseEnvironmentResources != null) {
                        OutlinedButton(
                            onClick = {
                                dialogScope = ResourceScope.ENVIRONMENT
                                loadSnapshot(ResourceScope.ENVIRONMENT)
                                releaseResult = null
                            },
                        ) {
                            Text("View All Environment Resources")
                        }
                    }
                    if (onGetWorkflowResources != null && onReleaseWorkflowResources != null) {
                        OutlinedButton(
                            onClick = {
                                dialogScope = ResourceScope.WORKFLOW
                                loadSnapshot(ResourceScope.WORKFLOW)
                                releaseResult = null
                            },
                        ) {
                            Text("View All Workflow Resources")
                        }
                    }
                    if (releaseResult != null) {
                        Text(
                            text = releaseResult!!,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }
                }

                if (dialogScope != null) {
                    val scope = dialogScope!!
                    ResourcesDialog(
                        scope = scope,
                        snapshot = dialogSnapshot,
                        onCancel = { dialogScope = null },
                        onReleaseAll = {
                            val released = when (scope) {
                                ResourceScope.ENVIRONMENT -> onReleaseEnvironmentResources?.invoke() ?: emptyList()
                                ResourceScope.WORKFLOW -> onReleaseWorkflowResources?.invoke() ?: emptyList()
                            }
                            dialogScope = null
                            val label = if (scope == ResourceScope.ENVIRONMENT) "environment" else "workflow"
                            releaseResult = if (released.isEmpty()) {
                                "No $label resources were held"
                            } else {
                                "Released ${released.size}: ${released.joinToString(", ")}"
                            }
                        },
                        onReleaseOne = { key ->
                            onResetResource?.invoke(key)
                            loadSnapshot(scope) // refresh the displayed table
                        },
                    )
                }

                HorizontalDivider()
            }

            // About section
            Text(
                text = "About",
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.primary,
            )
            Text(
                text = "Trajectory Mobile",
                style = MaterialTheme.typography.bodyLarge,
            )
            Text(
                text = "Version ${getAppVersion(context)}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

private fun getAppVersion(context: Context): String {
    return try {
        val packageInfo = context.packageManager.getPackageInfo(context.packageName, 0)
        packageInfo.versionName ?: "unknown"
    } catch (_: Exception) {
        "unknown"
    }
}

@Composable
private fun ResourcesDialog(
    scope: ResourceScope,
    snapshot: List<com.trajectoryruntime.engine.ResourceSnapshotEntry>,
    onCancel: () -> Unit,
    onReleaseAll: () -> Unit,
    onReleaseOne: (String) -> Unit,
) {
    val sorted = remember(snapshot) { snapshot.sortedBy { it.resourceName } }
    AlertDialog(
        onDismissRequest = onCancel,
        title = { Text(scope.title) },
        text = {
            if (sorted.isEmpty()) {
                Text(
                    text = scope.emptyText,
                    style = MaterialTheme.typography.bodyMedium,
                )
            } else {
                Column(
                    modifier = Modifier
                        .heightIn(max = 400.dp)
                        .verticalScroll(rememberScrollState()),
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text("Resource", modifier = Modifier.weight(2f), style = MaterialTheme.typography.labelSmall)
                        Text("Total", modifier = Modifier.weight(1f), style = MaterialTheme.typography.labelSmall)
                        Text("Acq.", modifier = Modifier.weight(1f), style = MaterialTheme.typography.labelSmall)
                        Text("Avail.", modifier = Modifier.weight(1f), style = MaterialTheme.typography.labelSmall)
                        Text("Q", modifier = Modifier.weight(0.6f), style = MaterialTheme.typography.labelSmall)
                        Spacer(modifier = Modifier.width(40.dp))
                    }
                    HorizontalDivider()
                    for (r in sorted) {
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(modifier = Modifier.weight(2f)) {
                                Text(r.resourceName, style = MaterialTheme.typography.bodySmall)
                                Text(
                                    text = r.type,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            val isSync = r.type == "sync"
                            Text(if (isSync) "—" else r.total.toString(), modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
                            Text(if (isSync) "—" else r.inUse.toString(), modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
                            Text(if (isSync) "—" else r.available.toString(), modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
                            Text(r.queued.toString(), modifier = Modifier.weight(0.6f), style = MaterialTheme.typography.bodySmall)
                            IconButton(
                                onClick = { onReleaseOne(r.name) },
                                modifier = Modifier.size(40.dp),
                            ) {
                                Icon(
                                    Icons.Default.Delete,
                                    contentDescription = "Release ${r.resourceName}",
                                    tint = MaterialTheme.colorScheme.error,
                                )
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onReleaseAll) {
                Text("Release All", color = MaterialTheme.colorScheme.error)
            }
        },
        dismissButton = {
            TextButton(onClick = onCancel) { Text("Cancel") }
        },
    )
}
