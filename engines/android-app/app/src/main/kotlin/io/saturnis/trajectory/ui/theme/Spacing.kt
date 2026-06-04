// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
package io.saturnis.trajectory.ui.theme

import androidx.compose.material3.windowsizeclass.WindowWidthSizeClass
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

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
