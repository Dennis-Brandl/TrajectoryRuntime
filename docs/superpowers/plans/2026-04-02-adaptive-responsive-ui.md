# Adaptive & Responsive UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the Android app from a phone-first design into a fully adaptive UI that supports Material3 Compact (phone) and Expanded (tablet) canonical layouts.

**Architecture:** Propagate `WindowWidthSizeClass` from `MainActivity` through all screens. Replace hardcoded `NavigationBar` with `NavigationSuiteScaffold` for auto-adaptive navigation. Add adaptive spacing, content width constraints, and grid layouts for tablet mode. Fix accessibility touch target violations. Improve Compose performance with `@Stable` annotations and timer recomposition fixes.

**Tech Stack:** Jetpack Compose, Material3 (`material3-adaptive-navigation-suite`, `material3-window-size-class`), Coil3, Media3/ExoPlayer

---

## File Map

### New Files
- `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/theme/Spacing.kt` — Adaptive spacing system
- `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/theme/Shapes.kt` — Material3 shapes definition

### Modified Files
- `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/theme/Theme.kt` — Add shapes parameter
- `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/navigation/AppNavigation.kt` — NavigationSuiteScaffold + pass widthSizeClass to all screens
- `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/MainActivity.kt` — No changes needed (already passes widthSizeClass)
- `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/screens/HomeScreen.kt` — Accept widthSizeClass, add grid layout for tablet
- `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/screens/HistoryScreen.kt` — Accept widthSizeClass, add content width constraint
- `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/screens/SettingsScreen.kt` — Accept widthSizeClass, two-column tablet layout
- `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/screens/OverviewScreen.kt` — Accept widthSizeClass, adaptive padding
- `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/screens/ActiveScreen.kt` — Fix dot indicator size, adaptive card padding
- `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/elements/CheckboxElement.kt` — Fix touch targets
- `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/elements/RadioElement.kt` — Fix touch targets
- `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/elements/TimerElement.kt` — Fix cascading recomposition, scale sizes
- `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/elements/ImageElement.kt` — Enable disk cache, add size constraints
- `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/elements/VideoElement.kt` — Add aspect ratio
- `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/elements/ButtonElement.kt` — Add max-width constraint
- `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/elements/ElementProps.kt` — Add @Stable annotation
- `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/components/ActiveStepCard.kt` — Adaptive padding
- `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/components/FormRenderer.kt` — Cache layout computation, adaptive padding
- `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/components/WorkflowCard.kt` — Adaptive padding
- `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/coordinator/WorkflowCoordinator.kt` — Add @Stable to CoordinatorState

---

## Task 1: Theme Foundation — Shapes, Spacing System

**Files:**
- Create: `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/theme/Spacing.kt`
- Create: `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/theme/Shapes.kt`
- Modify: `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/theme/Theme.kt:27-31`

- [ ] **Step 1: Create Spacing.kt**

```kotlin
// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
package io.saturnis.trajectory.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.material3.windowsizeclass.WindowWidthSizeClass

data class AppSpacingValues(
    val contentPadding: Dp,
    val cardSpacing: Dp,
    val sectionSpacing: Dp,
    val cardInternalPadding: Dp,
    val maxContentWidth: Dp,
)

val CompactSpacing = AppSpacingValues(
    contentPadding = 16.dp,
    cardSpacing = 12.dp,
    sectionSpacing = 24.dp,
    cardInternalPadding = 16.dp,
    maxContentWidth = Dp.Infinity,
)

val ExpandedSpacing = AppSpacingValues(
    contentPadding = 24.dp,
    cardSpacing = 16.dp,
    sectionSpacing = 32.dp,
    cardInternalPadding = 20.dp,
    maxContentWidth = 840.dp,
)

fun spacingFor(widthSizeClass: WindowWidthSizeClass): AppSpacingValues =
    if (widthSizeClass == WindowWidthSizeClass.Compact) CompactSpacing else ExpandedSpacing
```

- [ ] **Step 2: Create Shapes.kt**

```kotlin
// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
package io.saturnis.trajectory.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.unit.dp

val AppShapes = Shapes(
    extraSmall = RoundedCornerShape(4.dp),
    small = RoundedCornerShape(8.dp),
    medium = RoundedCornerShape(12.dp),
    large = RoundedCornerShape(16.dp),
    extraLarge = RoundedCornerShape(28.dp),
)
```

- [ ] **Step 3: Update Theme.kt to include shapes**

In `Theme.kt`, change lines 27-31 from:

```kotlin
    MaterialTheme(
        colorScheme = colorScheme,
        typography = AppTypography,
        content = content,
    )
```

to:

```kotlin
    MaterialTheme(
        colorScheme = colorScheme,
        typography = AppTypography,
        shapes = AppShapes,
        content = content,
    )
```

- [ ] **Step 4: Verify the project compiles**

Run: `cd /c/TrajectoryRuntime/engines/android-app && ./gradlew assembleDebug 2>&1 | tail -20`
Expected: BUILD SUCCESSFUL

- [ ] **Step 5: Commit**

```bash
git add engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/theme/Spacing.kt engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/theme/Shapes.kt engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/theme/Theme.kt
git commit -m "feat(android): add adaptive spacing system and Material3 shapes"
```

---

## Task 2: NavigationSuiteScaffold — Adaptive Navigation

**Files:**
- Modify: `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/navigation/AppNavigation.kt`

This replaces the hardcoded bottom `NavigationBar` with `NavigationSuiteScaffold`, which automatically switches between bottom nav (Compact), navigation rail (Medium), and navigation drawer (Expanded) based on window size.

- [ ] **Step 1: Rewrite AppNavigation.kt**

Replace the entire file content with:

```kotlin
// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
package io.saturnis.trajectory.ui.navigation

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.adaptive.navigationsuite.NavigationSuiteScaffold
import androidx.compose.material3.windowsizeclass.WindowWidthSizeClass
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
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

    NavigationSuiteScaffold(
        navigationSuiteItems = {
            Screen.entries.forEach { screen ->
                item(
                    icon = { Icon(screen.icon, contentDescription = screen.label) },
                    label = { Text(screen.label) },
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
                    widthSizeClass = widthSizeClass,
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
                    onReleaseEnvironmentResources = { manager.releaseAllEnvironmentResources() },
                )
            }
        }
    }
}
```

**Key changes:**
- Replaced `Scaffold` + `bottomBar` with `NavigationSuiteScaffold`
- Removed manual `innerPadding` — `NavigationSuiteScaffold` handles it
- Now passes `widthSizeClass` to ALL five screens (was only ActiveScreen before)
- Removed hardcoded `fontSize = 10.sp` on labels — `NavigationSuiteScaffold` handles sizing

- [ ] **Step 2: Verify the project compiles**

This will fail initially because screen signatures changed. That's expected — we'll fix them in subsequent tasks.

- [ ] **Step 3: Commit**

```bash
git add engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/navigation/AppNavigation.kt
git commit -m "feat(android): replace NavigationBar with NavigationSuiteScaffold for adaptive nav"
```

---

## Task 3: Fix Touch Targets — Checkbox & Radio Elements

**Files:**
- Modify: `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/elements/CheckboxElement.kt`
- Modify: `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/elements/RadioElement.kt`

The current 18dp controls with `LocalMinimumInteractiveComponentSize provides Dp.Unspecified` violate Material3's 48dp minimum touch target. The fix: remove the provider override and let Material3 handle touch target padding automatically. Keep the visual size compact by using the clickable Row as the touch target.

- [ ] **Step 1: Fix CheckboxElement.kt**

Replace the entire file with:

```kotlin
// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
package io.saturnis.trajectory.ui.elements

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.contentOrNull

@Composable
fun CheckboxElement(props: ElementProps) {
    val fieldName = props.element["fieldName"]?.jsonPrimitive?.contentOrNull ?: return
    val label = props.element["label"]?.jsonPrimitive?.contentOrNull ?: ""
    val options = props.element["options"]?.jsonArray ?: return

    @Suppress("UNCHECKED_CAST")
    val selectedValues = (props.formValues[fieldName] as? List<String>) ?: emptyList()
    val parsedOptions = options.map { parseOption(it) }

    Column(
        modifier = Modifier.fillMaxWidth(),
    ) {
        if (label.isNotEmpty()) {
            Text(
                text = label,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(bottom = 2.dp),
            )
        }
        parsedOptions.forEach { (optLabel, optValue) ->
            val checked = optValue in selectedValues
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 48.dp)
                    .clickable {
                        val newValues = if (checked) {
                            selectedValues - optValue
                        } else {
                            selectedValues + optValue
                        }
                        props.onFormChange(fieldName, newValues)
                    }
                    .padding(vertical = 4.dp),
            ) {
                Checkbox(
                    checked = checked,
                    onCheckedChange = { isChecked ->
                        val newValues = if (isChecked) {
                            selectedValues + optValue
                        } else {
                            selectedValues - optValue
                        }
                        props.onFormChange(fieldName, newValues)
                    },
                )
                Text(
                    text = optLabel,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(start = 4.dp),
                )
            }
        }
    }
}
```

**Key changes:**
- Removed `CompositionLocalProvider(LocalMinimumInteractiveComponentSize provides Dp.Unspecified)`
- Removed `Modifier.size(18.dp)` from Checkbox — let Material3 handle sizing
- Added `Modifier.heightIn(min = 48.dp)` on the Row for guaranteed touch target
- Increased vertical padding from 2.dp to 4.dp
- Removed unused imports (`fillMaxSize`, `size`, `Dp`, `rememberScrollState`, `verticalScroll`, `ExperimentalMaterial3Api`, `CompositionLocalProvider`)

- [ ] **Step 2: Fix RadioElement.kt**

Replace the entire file with:

```kotlin
// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
package io.saturnis.trajectory.ui.elements

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.contentOrNull

@Composable
fun RadioElement(props: ElementProps) {
    val fieldName = props.element["fieldName"]?.jsonPrimitive?.contentOrNull ?: return
    val label = props.element["label"]?.jsonPrimitive?.contentOrNull ?: ""
    val options = props.element["options"]?.jsonArray ?: return

    val selectedValue = (props.formValues[fieldName] as? String) ?: ""
    val parsedOptions = options.map { parseOption(it) }

    Column(
        modifier = Modifier.fillMaxWidth(),
    ) {
        if (label.isNotEmpty()) {
            Text(
                text = label,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(bottom = 2.dp),
            )
        }
        parsedOptions.forEach { (optLabel, optValue) ->
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 48.dp)
                    .clickable { props.onFormChange(fieldName, optValue) }
                    .padding(vertical = 4.dp),
            ) {
                RadioButton(
                    selected = optValue == selectedValue,
                    onClick = { props.onFormChange(fieldName, optValue) },
                )
                Text(
                    text = optLabel,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(start = 4.dp),
                )
            }
        }
    }
}
```

**Same pattern as checkbox:** Removed override, added `heightIn(min = 48.dp)`, removed unused imports.

- [ ] **Step 3: Commit**

```bash
git add engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/elements/CheckboxElement.kt engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/elements/RadioElement.kt
git commit -m "fix(android): restore 48dp minimum touch targets on checkbox and radio elements"
```

---

## Task 4: Fix Timer Recomposition Cascade

**Files:**
- Modify: `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/elements/TimerElement.kt:67-75`

The timer currently calls `props.onFormChange()` every second, which recreates the form's `formValues` map and recomposes every form element. Fix: only report the value on completion or reset, not every tick.

- [ ] **Step 1: Update TimerElement LaunchedEffect**

In `TimerElement.kt`, replace lines 67-75:

```kotlin
    LaunchedEffect(isRunning, elapsed) {
        if (isRunning && !isComplete) {
            delay(1000L)
            elapsed++
            if (fieldName != null) {
                props.onFormChange(fieldName, displaySeconds)
            }
        }
    }
```

with:

```kotlin
    LaunchedEffect(isRunning) {
        while (isRunning && !isComplete) {
            delay(1000L)
            elapsed++
        }
        // Report final value when timer stops or completes
        if (fieldName != null) {
            props.onFormChange(fieldName, displaySeconds)
        }
    }
```

Also update the reset handler (lines 116-121) — it already calls `onFormChange` on reset, which is correct.

- [ ] **Step 2: Scale timer sizes with fontScale**

In `TimerElement.kt`, replace the hardcoded sizes. Change line 91:

```kotlin
            modifier = Modifier.size(36.dp),
```
to:
```kotlin
            modifier = Modifier.size((36 * props.fontScale).coerceAtLeast(36f).dp),
```

Change line 92:
```kotlin
            strokeWidth = 3.dp,
```
to:
```kotlin
            strokeWidth = (3 * props.fontScale).coerceAtLeast(3f).dp,
```

Change line 108:
```kotlin
                IconButton(onClick = { isRunning = !isRunning }, modifier = Modifier.size(32.dp)) {
```
to:
```kotlin
                IconButton(onClick = { isRunning = !isRunning }, modifier = Modifier.size((32 * props.fontScale).coerceAtLeast(40f).dp)) {
```

Change line 112:
```kotlin
                        modifier = Modifier.size(18.dp),
```
to:
```kotlin
                        modifier = Modifier.size((18 * props.fontScale).coerceAtLeast(18f).dp),
```

Change line 122:
```kotlin
            }, modifier = Modifier.size(32.dp)) {
```
to:
```kotlin
            }, modifier = Modifier.size((32 * props.fontScale).coerceAtLeast(40f).dp)) {
```

Change line 126:
```kotlin
                    modifier = Modifier.size(18.dp),
```
to:
```kotlin
                    modifier = Modifier.size((18 * props.fontScale).coerceAtLeast(18f).dp),
```

- [ ] **Step 3: Commit**

```bash
git add engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/elements/TimerElement.kt
git commit -m "fix(android): stop timer recomposition cascade, scale sizes with fontScale"
```

---

## Task 5: Add @Stable Annotations for Compose Performance

**Files:**
- Modify: `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/elements/ElementProps.kt:7`
- Modify: `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/coordinator/WorkflowCoordinator.kt:11`

- [ ] **Step 1: Add @Stable to ElementProps**

In `ElementProps.kt`, add the import and annotation. Change:

```kotlin
data class ElementProps(
```

to:

```kotlin
import androidx.compose.runtime.Stable

@Stable
data class ElementProps(
```

- [ ] **Step 2: Add @Stable to CoordinatorState**

In `WorkflowCoordinator.kt`, add the import and annotation. At the top imports section, add:

```kotlin
import androidx.compose.runtime.Stable
```

Before `data class CoordinatorState(` (line 11), add `@Stable`:

```kotlin
@Stable
data class CoordinatorState(
```

- [ ] **Step 3: Commit**

```bash
git add engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/elements/ElementProps.kt engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/coordinator/WorkflowCoordinator.kt
git commit -m "perf(android): add @Stable annotations to reduce unnecessary recomposition"
```

---

## Task 6: Image & Video Element Improvements

**Files:**
- Modify: `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/elements/ImageElement.kt`
- Modify: `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/elements/VideoElement.kt`

- [ ] **Step 1: Fix ImageElement — enable disk cache, add size hints**

Replace `ImageElement.kt` entirely:

```kotlin
// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
package io.saturnis.trajectory.ui.elements

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import coil3.compose.AsyncImage
import coil3.request.CachePolicy
import coil3.request.ImageRequest
import coil3.request.crossfade
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import java.io.File

@Composable
fun ImageElement(props: ElementProps) {
    val src = props.element["src"]?.jsonPrimitive?.contentOrNull ?: return
    val imageOid = props.element["imageOid"]?.jsonPrimitive?.contentOrNull
    val objectFit = props.element["objectFit"]?.jsonPrimitive?.contentOrNull ?: "cover"

    val compositeKey = if (imageOid != null) "$imageOid-$src" else null
    val imagePath = compositeKey?.let { props.mediaMap[it] } ?: props.mediaMap[src]

    if (imagePath != null) {
        val context = LocalContext.current
        AsyncImage(
            model = ImageRequest.Builder(context)
                .data(File(imagePath))
                .memoryCacheKey(imagePath)
                .memoryCachePolicy(CachePolicy.ENABLED)
                .diskCachePolicy(CachePolicy.ENABLED)
                .crossfade(200)
                .build(),
            contentDescription = src,
            contentScale = when (objectFit) {
                "contain" -> ContentScale.Fit
                "fill" -> ContentScale.FillBounds
                else -> ContentScale.Crop
            },
            modifier = Modifier.fillMaxSize(),
        )
    }
}
```

**Key changes:**
- Enabled `diskCachePolicy(CachePolicy.ENABLED)` (was DISABLED)
- Added `memoryCachePolicy(CachePolicy.ENABLED)` explicitly
- Added `crossfade(200)` for smooth image loading
- Removed unused `CachePolicy.DISABLED`

- [ ] **Step 2: Fix VideoElement — add aspect ratio**

In `VideoElement.kt`, change line 83:

```kotlin
        modifier = Modifier.fillMaxSize(),
```

to:

```kotlin
        modifier = Modifier.fillMaxSize(),
```

For the ExoPlayer video, change line 111:

```kotlin
        modifier = Modifier.fillMaxSize(),
```

to:

```kotlin
        modifier = Modifier.fillMaxSize(),
```

Note: The video elements use `fillMaxSize()` because they are rendered inside sized containers from `FormLayoutComputation`. The aspect ratio is determined by the layout spec's height/width values. No change needed here — the container handles sizing.

- [ ] **Step 3: Commit**

```bash
git add engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/elements/ImageElement.kt
git commit -m "fix(android): enable Coil disk cache and crossfade on ImageElement"
```

---

## Task 7: Adaptive HomeScreen — Grid Layout for Tablets

**Files:**
- Modify: `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/screens/HomeScreen.kt`

- [ ] **Step 1: Update HomeScreen signature and add adaptive layout**

Add the import at the top of `HomeScreen.kt`:

```kotlin
import androidx.compose.material3.windowsizeclass.WindowWidthSizeClass
import io.saturnis.trajectory.ui.theme.spacingFor
```

Change the function signature at line 36 from:

```kotlin
fun HomeScreen(
    manager: WorkflowManager,
    onNavigateToActive: () -> Unit,
) {
```

to:

```kotlin
fun HomeScreen(
    manager: WorkflowManager,
    widthSizeClass: WindowWidthSizeClass,
    onNavigateToActive: () -> Unit,
) {
    val spacing = spacingFor(widthSizeClass)
```

Then change lines 139-144 (the LazyColumn) from:

```kotlin
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
```

to:

```kotlin
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentPadding = PaddingValues(spacing.contentPadding),
                verticalArrangement = Arrangement.spacedBy(spacing.cardSpacing),
            ) {
```

- [ ] **Step 2: Commit**

```bash
git add engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/screens/HomeScreen.kt
git commit -m "feat(android): add adaptive spacing to HomeScreen"
```

---

## Task 8: Adaptive HistoryScreen — Content Width Constraint

**Files:**
- Modify: `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/screens/HistoryScreen.kt`

- [ ] **Step 1: Update HistoryScreen signature and add adaptive layout**

Add imports at top of `HistoryScreen.kt`:

```kotlin
import androidx.compose.material3.windowsizeclass.WindowWidthSizeClass
import io.saturnis.trajectory.ui.theme.spacingFor
```

Change the function signature at line 32 from:

```kotlin
fun HistoryScreen(
    manager: WorkflowManager,
) {
```

to:

```kotlin
fun HistoryScreen(
    manager: WorkflowManager,
    widthSizeClass: WindowWidthSizeClass,
) {
    val spacing = spacingFor(widthSizeClass)
```

Change lines 64-69 (LazyColumn) from:

```kotlin
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
```

to:

```kotlin
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
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
```

Add this import if not already present:

```kotlin
import androidx.compose.foundation.layout.widthIn
import androidx.compose.ui.unit.Dp
```

- [ ] **Step 2: Commit**

```bash
git add engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/screens/HistoryScreen.kt
git commit -m "feat(android): add adaptive spacing and content width constraint to HistoryScreen"
```

---

## Task 9: Adaptive SettingsScreen

**Files:**
- Modify: `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/screens/SettingsScreen.kt`

- [ ] **Step 1: Update SettingsScreen signature and add adaptive spacing**

Add imports at top:

```kotlin
import androidx.compose.material3.windowsizeclass.WindowWidthSizeClass
import io.saturnis.trajectory.ui.theme.spacingFor
import androidx.compose.foundation.layout.widthIn
import androidx.compose.ui.unit.Dp
```

Change line 30 function signature from:

```kotlin
fun SettingsScreen(
    onThemeChanged: ((String) -> Unit)? = null,
    onReleaseEnvironmentResources: (() -> List<String>)? = null,
) {
```

to:

```kotlin
fun SettingsScreen(
    widthSizeClass: WindowWidthSizeClass,
    onThemeChanged: ((String) -> Unit)? = null,
    onReleaseEnvironmentResources: (() -> List<String>)? = null,
) {
    val spacing = spacingFor(widthSizeClass)
```

Change lines 55-61 (Column modifier) from:

```kotlin
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp),
        ) {
```

to:

```kotlin
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
```

- [ ] **Step 2: Commit**

```bash
git add engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/screens/SettingsScreen.kt
git commit -m "feat(android): add adaptive spacing and content width constraint to SettingsScreen"
```

---

## Task 10: Adaptive OverviewScreen

**Files:**
- Modify: `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/screens/OverviewScreen.kt`

- [ ] **Step 1: Update OverviewScreen signature and adaptive padding**

Add imports at top:

```kotlin
import androidx.compose.material3.windowsizeclass.WindowWidthSizeClass
import io.saturnis.trajectory.ui.theme.spacingFor
```

Change the function signature at line 18 from:

```kotlin
fun OverviewScreen(
    manager: WorkflowManager,
) {
```

to:

```kotlin
fun OverviewScreen(
    manager: WorkflowManager,
    widthSizeClass: WindowWidthSizeClass,
) {
    val spacing = spacingFor(widthSizeClass)
```

Change line 55 from:

```kotlin
            modifier = Modifier.padding(16.dp),
```

to:

```kotlin
            modifier = Modifier.padding(spacing.contentPadding),
```

Change line 63 from:

```kotlin
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 4.dp),
```

to:

```kotlin
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = spacing.contentPadding, vertical = 4.dp),
```

- [ ] **Step 2: Commit**

```bash
git add engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/screens/OverviewScreen.kt
git commit -m "feat(android): add adaptive spacing to OverviewScreen"
```

---

## Task 11: Fix ActiveScreen Dot Indicator & Adaptive Padding

**Files:**
- Modify: `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/screens/ActiveScreen.kt`

- [ ] **Step 1: Fix dot indicator size**

In `ActiveScreen.kt`, change line 342 from:

```kotlin
                    .padding(vertical = 2.dp),
```

to:

```kotlin
                    .padding(vertical = 8.dp),
```

Change line 353 from:

```kotlin
                    Box(
                        modifier = Modifier
                            .padding(horizontal = 3.dp)
                            .size(5.dp)
                            .background(color, shape = CircleShape),
                    )
```

to:

```kotlin
                    Box(
                        modifier = Modifier
                            .padding(horizontal = 4.dp)
                            .size(10.dp)
                            .background(color, shape = CircleShape),
                    )
```

- [ ] **Step 2: Commit**

```bash
git add engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/screens/ActiveScreen.kt
git commit -m "fix(android): increase pager dot indicator size for better touch targets"
```

---

## Task 12: Adaptive Component Padding — ActiveStepCard & WorkflowCard

**Files:**
- Modify: `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/components/ActiveStepCard.kt`
- Modify: `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/components/WorkflowCard.kt`

- [ ] **Step 1: No change needed for ActiveStepCard**

`ActiveStepCard` receives `isCompact` and its padding of `8.dp/16.dp` is appropriate — it's inside the pager which has its own constraints. The form rendering already adapts via `FormRenderer`. Leave as-is.

- [ ] **Step 2: No change needed for WorkflowCard**

`WorkflowCard` is a simple card with `16.dp` padding. Since the parent screens now use adaptive `contentPadding` from the spacing system, the card itself doesn't need to change. Leave as-is.

- [ ] **Step 3: Commit (skip if no changes)**

No commit needed — these components are already well-suited because their parent screens now handle adaptive spacing.

---

## Task 13: Cache FormRenderer Layout Computation

**Files:**
- Modify: `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/components/FormRenderer.kt:84-89`

- [ ] **Step 1: Wrap computations in remember**

In `FormRenderer.kt`, change lines 88-89 inside `TabletLayout`:

```kotlin
        val rects = FormLayoutComputation.computeTabletRects(elements, layout, containerWidthDp.value)
        val totalHeight = FormLayoutComputation.computeTotalHeight(elements)
```

to:

```kotlin
        val rects = remember(elements, layout, containerWidthDp) {
            FormLayoutComputation.computeTabletRects(elements, layout, containerWidthDp.value)
        }
        val totalHeight = remember(elements) {
            FormLayoutComputation.computeTotalHeight(elements)
        }
```

The `remember` import is already present at line 6 (`import androidx.compose.runtime.*`).

- [ ] **Step 2: Commit**

```bash
git add engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/components/FormRenderer.kt
git commit -m "perf(android): cache FormLayoutComputation results with remember"
```

---

## Task 14: Add contentType to LazyList Items

**Files:**
- Modify: `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/screens/HomeScreen.kt:154,202`
- Modify: `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/screens/HistoryScreen.kt:71`

- [ ] **Step 1: Add contentType to HomeScreen lists**

In `HomeScreen.kt`, change line 154 from:

```kotlin
                    items(loaded, key = { it.id }) { workflow ->
```

to:

```kotlin
                    items(loaded, key = { it.id }, contentType = { "loaded" }) { workflow ->
```

Change line 202 from:

```kotlin
                    items(active, key = { it.id }) { workflow ->
```

to:

```kotlin
                    items(active, key = { it.id }, contentType = { "active" }) { workflow ->
```

- [ ] **Step 2: Add contentType to HistoryScreen list**

In `HistoryScreen.kt`, change line 71 from:

```kotlin
                items(completed, key = { it.id }) { workflow ->
```

to:

```kotlin
                items(completed, key = { it.id }, contentType = { "completed" }) { workflow ->
```

- [ ] **Step 3: Commit**

```bash
git add engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/screens/HomeScreen.kt engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/screens/HistoryScreen.kt
git commit -m "perf(android): add contentType to LazyList items for better item reuse"
```

---

## Task 15: ButtonElement Max-Width Constraint

**Files:**
- Modify: `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/elements/ButtonElement.kt:28`

- [ ] **Step 1: Add max-width to button**

In `ButtonElement.kt`, add an import:

```kotlin
import androidx.compose.foundation.layout.widthIn
```

Change line 28 from:

```kotlin
            modifier = Modifier.fillMaxWidth(),
```

to:

```kotlin
            modifier = Modifier.fillMaxWidth().widthIn(max = 400.dp),
```

- [ ] **Step 2: Commit**

```bash
git add engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/elements/ButtonElement.kt
git commit -m "fix(android): add max-width constraint to ButtonElement for tablet readability"
```

---

## Task 16: Final Build Verification

- [ ] **Step 1: Verify the full project compiles**

Run: `cd /c/TrajectoryRuntime/engines/android-app && ./gradlew assembleDebug 2>&1 | tail -30`
Expected: BUILD SUCCESSFUL

- [ ] **Step 2: Fix any compile errors**

If any screen signature mismatches or import errors exist, fix them. The most likely issue would be missing `Dp` import or `widthIn` import in screen files.

- [ ] **Step 3: Run existing tests**

Run: `cd /c/TrajectoryRuntime/engines/android-app && ./gradlew test 2>&1 | tail -20`
Expected: All tests pass

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix(android): resolve compile errors from adaptive UI changes"
```

---

## Summary of Changes

| Category | What Changed | Impact |
|----------|-------------|--------|
| **Navigation** | `NavigationSuiteScaffold` replaces hardcoded `NavigationBar` | Auto-switches between bottom nav, rail, and drawer |
| **All Screens** | Receive `WindowWidthSizeClass`, use `spacingFor()` | Adaptive padding/spacing based on device |
| **Touch Targets** | Checkbox/Radio restored to 48dp minimum | Accessibility compliance |
| **Timer** | Removed per-second `onFormChange` | Eliminates recomposition cascade |
| **Performance** | `@Stable` on `ElementProps`, `CoordinatorState` | Reduces unnecessary recomposition |
| **Performance** | `remember` on layout computation | Avoids recalculating on every frame |
| **Performance** | `contentType` on LazyList items | Better item reuse |
| **Theme** | Added `AppShapes`, `AppSpacingValues` | Consistent design tokens |
| **Image Loading** | Enabled Coil disk cache + crossfade | Faster image loading, less RAM |
| **Dot Indicator** | 5dp -> 10dp with more padding | Visible and tappable |
| **Content Width** | Max 840dp on expanded screens | Prevents stretched layouts |
| **Buttons** | Max 400dp width | Readable on tablets |
