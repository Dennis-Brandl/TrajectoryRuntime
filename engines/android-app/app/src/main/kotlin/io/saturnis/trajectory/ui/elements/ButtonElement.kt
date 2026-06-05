// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
package io.saturnis.trajectory.ui.elements

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.contentOrNull

@Composable
fun ButtonElement(props: ElementProps) {
    val label = props.element["label"]?.jsonPrimitive?.contentOrNull ?: "Button"
    val outputValue = props.element["outputValue"]?.jsonPrimitive?.contentOrNull ?: ""

    val labelFontSize = 14.sp
    val contentPadding = PaddingValues(horizontal = 10.dp, vertical = 8.dp)

    Column(modifier = Modifier.fillMaxWidth()) {
        Button(
            onClick = { props.onButtonPress(outputValue) },
            enabled = props.buttonsEnabled,
            contentPadding = contentPadding,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(
                text = label,
                fontSize = labelFontSize,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                textAlign = TextAlign.Center,
            )
        }
        if (!props.buttonsEnabled) {
            Text(
                text = "Required fields must be completed",
                style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.sp),
                color = MaterialTheme.colorScheme.error,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 2.dp),
            )
        }
    }
}
