// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
package io.saturnis.trajectory.ui.elements

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.sp
import io.saturnis.trajectory.util.htmlToAnnotatedString
import io.saturnis.trajectory.util.substituteChips
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive

@Composable
fun TextElement(props: ElementProps) {
    val contentObj = props.element["content"]
    val rawHtml = when {
        contentObj is JsonObject -> contentObj["content"]?.jsonPrimitive?.contentOrNull
            ?: contentObj["plainText"]?.jsonPrimitive?.contentOrNull
            ?: ""
        else -> contentObj?.jsonPrimitive?.contentOrNull ?: ""
    }

    val substituted = remember(rawHtml, props.properties, props.inputParameters) {
        substituteChips(rawHtml, props.properties, props.inputParameters)
    }
    val annotated = remember(substituted) {
        htmlToAnnotatedString(substituted)
    }

    val rawFontSize = props.element["fontSize"]?.jsonPrimitive?.intOrNull
    val fontSize = rawFontSize?.toFloat()
    val align = props.element["align"]?.jsonPrimitive?.contentOrNull
    val weight = props.element["fontWeight"]?.jsonPrimitive?.contentOrNull
    val colorHex = props.element["color"]?.jsonPrimitive?.contentOrNull

    val textColor = if (colorHex != null) {
        try {
            Color(android.graphics.Color.parseColor(colorHex))
        } catch (_: Exception) {
            Color.Unspecified
        }
    } else Color.Unspecified

    Text(
        text = annotated,
        style = MaterialTheme.typography.bodyMedium.copy(
            fontSize = if (fontSize != null) fontSize.sp else MaterialTheme.typography.bodyMedium.fontSize,
            fontWeight = if (weight == "bold") FontWeight.Bold else FontWeight.Normal,
            lineHeight = if (fontSize != null) (fontSize * 1.5f).sp else MaterialTheme.typography.bodyMedium.lineHeight,
        ),
        color = textColor,
        textAlign = when (align) {
            "center" -> TextAlign.Center
            "right" -> TextAlign.End
            else -> TextAlign.Start
        },
        modifier = Modifier.fillMaxWidth(),
    )
}
