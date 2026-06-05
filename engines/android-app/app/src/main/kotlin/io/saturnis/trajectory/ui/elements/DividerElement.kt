// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
package io.saturnis.trajectory.ui.elements

import androidx.compose.foundation.layout.padding
import androidx.compose.material3.HorizontalDivider
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive

@Composable
fun DividerElement(props: ElementProps) {
    val thickness = props.element["thickness"]?.jsonPrimitive?.intOrNull ?: 1
    val colorHex = props.element["color"]?.jsonPrimitive?.contentOrNull ?: "#cccccc"

    val color = try {
        Color(android.graphics.Color.parseColor(colorHex))
    } catch (_: Exception) {
        Color(0xFFCCCCCC)
    }

    HorizontalDivider(
        thickness = thickness.dp,
        color = color,
        modifier = Modifier.padding(vertical = 4.dp),
    )
}
