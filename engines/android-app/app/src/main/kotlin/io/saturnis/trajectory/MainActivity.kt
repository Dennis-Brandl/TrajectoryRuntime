// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
package io.saturnis.trajectory

import android.content.Context
import android.content.Intent
import android.content.pm.ActivityInfo
import android.os.Bundle
import android.provider.OpenableColumns
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.windowsizeclass.ExperimentalMaterial3WindowSizeClassApi
import androidx.compose.material3.windowsizeclass.calculateWindowSizeClass
import androidx.compose.runtime.*
import androidx.lifecycle.lifecycleScope
import io.saturnis.trajectory.manager.WorkflowManager
import io.saturnis.trajectory.ui.navigation.AppNavigation
import io.saturnis.trajectory.ui.theme.TrajectoryTheme
import io.saturnis.trajectory.util.FileProcessor
import kotlinx.coroutines.launch
import java.io.File

class MainActivity : ComponentActivity() {

    @OptIn(ExperimentalMaterial3WindowSizeClassApi::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        val smallestWidth = resources.configuration.smallestScreenWidthDp
        requestedOrientation = if (smallestWidth < 600) {
            ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
        } else {
            ActivityInfo.SCREEN_ORIENTATION_FULL_USER
        }

        val app = application as TrajectoryApp
        val manager = app.workflowManager

        // Resume state from database
        lifecycleScope.launch {
            manager.resumeFromDatabase()
        }

        // Handle incoming intent
        handleIntent(intent, manager)

        setContent {
            val windowSizeClass = calculateWindowSizeClass(this)

            // Read theme preference reactively
            val prefs = remember {
                getSharedPreferences("trajectoryruntime_settings", Context.MODE_PRIVATE)
            }
            var themeMode by remember {
                mutableStateOf(prefs.getString("theme", "system") ?: "system")
            }
            val darkTheme = when (themeMode) {
                "dark" -> true
                "light" -> false
                else -> isSystemInDarkTheme()
            }

            TrajectoryTheme(darkTheme = darkTheme) {
                AppNavigation(
                    manager = manager,
                    widthSizeClass = windowSizeClass.widthSizeClass,
                    onThemeChanged = { newTheme -> themeMode = newTheme },
                )
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        val app = application as TrajectoryApp
        handleIntent(intent, app.workflowManager)
    }

    private fun handleIntent(intent: Intent, manager: WorkflowManager) {
        if (intent.action != Intent.ACTION_VIEW) return
        val uri = intent.data ?: return

        // Query ContentResolver for display name to verify extension
        val displayName = contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) {
                val idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (idx >= 0) cursor.getString(idx) else null
            } else null
        }

        val validExtensions = listOf(".wfmasterx")
        val isValid = displayName?.lowercase()?.let { name ->
            validExtensions.any { name.endsWith(it) }
        } ?: false

        if (!isValid) return

        val workflowsDir = File(filesDir, "workflows")
        workflowsDir.mkdirs()

        lifecycleScope.launch {
            val result = FileProcessor.processFile(this@MainActivity, uri, workflowsDir)
            result.onSuccess { processResult ->
                manager.addWorkflow(
                    spec = processResult.spec,
                    mediaMap = processResult.mediaMap,
                    mediaDir = processResult.mediaDir,
                    environmentJsons = processResult.environmentJsons,
                )
            }
            result.onFailure { error ->
                android.util.Log.e("MainActivity", "Failed to load workflow", error)
            }
        }
    }
}
