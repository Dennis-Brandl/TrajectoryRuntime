// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
package io.saturnis.trajectory.ui.elements

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.saturnis.trajectory.util.resolveDefaultValue
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull

@Composable
fun TextareaElement(props: ElementProps) {
    val fieldName = props.element["fieldName"]?.jsonPrimitive?.contentOrNull ?: return
    val label = props.element["label"]?.jsonPrimitive?.contentOrNull ?: ""
    val rows = props.element["rows"]?.jsonPrimitive?.intOrNull ?: 3

    val resolvedPlaceholder = resolveDefaultValue(
        props.element["placeholderSource"]?.jsonObject,
        props.properties,
        props.inputParameters,
    ).ifEmpty {
        props.element["placeholder"]?.jsonPrimitive?.contentOrNull ?: ""
    }

    val defaultSource = props.element["defaultSource"]?.jsonObject
    val resolvedDefault = resolveDefaultValue(defaultSource, props.properties, props.inputParameters)
    val currentValue = (props.formValues[fieldName] as? String) ?: ""

    LaunchedEffect(fieldName, resolvedDefault) {
        if (currentValue.isEmpty() && resolvedDefault.isNotEmpty()) {
            props.onFormChange(fieldName, resolvedDefault)
        }
    }

    val scaledFontSize = 16.sp
    val labelFontSize = 12.sp
    val textStyle = LocalTextStyle.current.copy(
        fontSize = scaledFontSize,
        color = MaterialTheme.colorScheme.onSurface,
    )
    val borderColor = MaterialTheme.colorScheme.outline
    val placeholderColor = MaterialTheme.colorScheme.onSurfaceVariant
    val cursorBrush = SolidColor(MaterialTheme.colorScheme.primary)

    Column(modifier = Modifier.fillMaxWidth()) {
        if (label.isNotEmpty()) {
            Text(
                text = label,
                fontSize = labelFontSize,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(bottom = 2.dp),
            )
        }
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .border(1.dp, borderColor, RoundedCornerShape(4.dp))
                .padding(horizontal = 8.dp, vertical = 4.dp),
            contentAlignment = Alignment.TopStart,
        ) {
            BasicTextField(
                value = currentValue,
                onValueChange = { props.onFormChange(fieldName, it) },
                textStyle = textStyle,
                singleLine = false,
                minLines = rows,
                cursorBrush = cursorBrush,
                modifier = Modifier.fillMaxWidth(),
                decorationBox = { innerTextField ->
                    Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.TopStart) {
                        if (currentValue.isEmpty() && resolvedPlaceholder.isNotEmpty()) {
                            Text(
                                text = resolvedPlaceholder,
                                color = placeholderColor,
                                fontSize = scaledFontSize,
                            )
                        }
                        innerTextField()
                    }
                },
            )
        }
    }
}
