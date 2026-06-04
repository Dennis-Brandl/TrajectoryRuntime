// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
package io.saturnis.trajectory.ui.navigation

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.adaptive.navigationsuite.NavigationSuiteScaffold
import androidx.compose.material3.windowsizeclass.WindowWidthSizeClass
import androidx.compose.runtime.*
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextOverflow
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.*
import io.saturnis.trajectory.manager.WorkflowManager
import io.saturnis.trajectory.ui.screens.*

enum class Screen(val route: String, val label: String, val icon: ImageVector) {
    Home("home", "Home", Icons.Default.Home),
    Active("active", "Active", Icons.Default.PlayArrow),
    Overview("overview", "Overview", Icons.Default.List),
    History("history", "History", Icons.Default.DateRange),
    Settings("settings", "Settings", Icons.Default.Settings),
}

@Composable
fun AppNavigation(
    manager: WorkflowManager,
    widthSizeClass: WindowWidthSizeClass,
    onThemeChanged: (String) -> Unit = {},
) {
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = navBackStackEntry?.destination

    val isCompact = widthSizeClass == WindowWidthSizeClass.Compact

    NavigationSuiteScaffold(
        navigationSuiteItems = {
            Screen.entries.forEach { screen ->
                item(
                    icon = { Icon(screen.icon, contentDescription = screen.label) },
                    label = {
                        Text(
                            text = screen.label,
                            style = if (isCompact) MaterialTheme.typography.labelSmall else MaterialTheme.typography.labelMedium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    },
                    selected = currentDestination?.hierarchy?.any { it.route == screen.route } == true,
                    onClick = {
                        navController.navigate(screen.route) {
                            popUpTo(navController.graph.findStartDestination().id) {
                                saveState = true
                            }
                            launchSingleTop = true
                            restoreState = true
                        }
                    },
                )
            }
        },
    ) {
        NavHost(
            navController = navController,
            startDestination = Screen.Home.route,
        ) {
            composable(Screen.Home.route) {
                HomeScreen(
                    manager = manager,
                    widthSizeClass = widthSizeClass,
                    onNavigateToActive = {
                        navController.navigate(Screen.Active.route) {
                            popUpTo(navController.graph.findStartDestination().id) {
                                saveState = true
                            }
                            launchSingleTop = true
                            restoreState = true
                        }
                    },
                )
            }
            composable(Screen.Active.route) {
                ActiveScreen(
                    manager = manager,
                )
            }
            composable(Screen.Overview.route) {
                OverviewScreen(
                    manager = manager,
                    widthSizeClass = widthSizeClass,
                )
            }
            composable(Screen.History.route) {
                HistoryScreen(
                    manager = manager,
                    widthSizeClass = widthSizeClass,
                )
            }
            composable(Screen.Settings.route) {
                SettingsScreen(
                    widthSizeClass = widthSizeClass,
                    onThemeChanged = onThemeChanged,
                    onGetEnvironmentResources = { manager.getEnvironmentResourceSnapshot() },
                    onReleaseEnvironmentResources = { manager.releaseAllEnvironmentResources() },
                    onGetWorkflowResources = { manager.getWorkflowResourceSnapshot() },
                    onReleaseWorkflowResources = { manager.releaseAllWorkflowResources() },
                    onResetResource = { key -> manager.resetResource(key) },
                )
            }
        }
    }
}
