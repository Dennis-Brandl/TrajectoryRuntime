// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
package io.saturnis.trajectory.ui.elements

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
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
fun HeaderElement(props: ElementProps) {
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

    Text(
        text = annotated,
        style = MaterialTheme.typography.headlineSmall.copy(
            fontSize = if (fontSize != null) fontSize.sp else MaterialTheme.typography.headlineSmall.fontSize,
            fontWeight = if (weight == "bold") FontWeight.Bold else FontWeight.SemiBold,
            lineHeight = if (fontSize != null) (fontSize * 1.3f).sp else MaterialTheme.typography.headlineSmall.lineHeight,
        ),
        textAlign = when (align) {
            "center" -> TextAlign.Center
            "right" -> TextAlign.End
            else -> TextAlign.Start
        },
        modifier = Modifier.fillMaxWidth(),
    )
}
