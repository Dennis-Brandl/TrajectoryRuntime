// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
package io.saturnis.trajectory.ui.elements

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material3.*
import androidx.compose.material3.LocalTextStyle
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.saturnis.trajectory.util.resolveDefaultValue
import kotlinx.serialization.json.*

@Composable
fun TextInputElement(props: ElementProps) {
    val fieldName = props.element["fieldName"]?.jsonPrimitive?.contentOrNull ?: return
    val label = props.element["label"]?.jsonPrimitive?.contentOrNull ?: ""
    val mode = props.element["inputMode"]?.jsonPrimitive?.contentOrNull ?: "text"

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

    when (mode) {
        "dropdown" -> DropdownInput(props, fieldName, label, resolvedPlaceholder, currentValue)
        "combobox" -> ComboBoxInput(props, fieldName, label, resolvedPlaceholder, currentValue)
        else -> StandardInput(props, fieldName, label, resolvedPlaceholder, currentValue, mode)
    }
}

/**
 * Compact label + bordered field stack. Renders the label as a separate Text
 * above the field so the field itself only needs ~24dp of vertical space —
 * fits in canvas-authored cells (e.g., 73 px scaled to ~44 dp on a 600 dp
 * portrait tablet) without Material's 56 dp `defaultMinSize` clipping the
 * typed text below the visible area.
 */
@Composable
private fun LabeledFieldStack(
    label: String,
    labelFontSize: androidx.compose.ui.unit.TextUnit,
    content: @Composable ColumnScope.() -> Unit,
) {
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
        content()
    }
}

@Composable
private fun StandardInput(
    props: ElementProps,
    fieldName: String,
    label: String,
    placeholder: String,
    currentValue: String,
    mode: String,
) {
    val keyboardType = when (mode) {
        "number" -> KeyboardType.Number
        "phone" -> KeyboardType.Phone
        "password" -> KeyboardType.Password
        else -> KeyboardType.Text
    }
    val visualTransformation = if (mode == "password") {
        PasswordVisualTransformation()
    } else {
        VisualTransformation.None
    }
    val allowedChars: Regex? = when (mode) {
        "number" -> Regex("[^0-9+\\-.,]")
        "phone" -> Regex("[^0-9+\\-() ]")
        else -> null
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

    LabeledFieldStack(label, labelFontSize) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(40.dp)
                .border(1.dp, borderColor, RoundedCornerShape(4.dp))
                .padding(horizontal = 8.dp, vertical = 4.dp),
            contentAlignment = Alignment.CenterStart,
        ) {
            BasicTextField(
                value = currentValue,
                onValueChange = { newValue ->
                    val filtered = if (allowedChars != null) newValue.replace(allowedChars, "") else newValue
                    props.onFormChange(fieldName, filtered)
                },
                textStyle = textStyle,
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
                visualTransformation = visualTransformation,
                cursorBrush = cursorBrush,
                modifier = Modifier.fillMaxWidth(),
                decorationBox = { innerTextField ->
                    Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterStart) {
                        if (currentValue.isEmpty() && placeholder.isNotEmpty()) {
                            Text(
                                text = placeholder,
                                color = placeholderColor,
                                fontSize = scaledFontSize,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                        innerTextField()
                    }
                },
            )
        }
    }
}

@Composable
private fun DropdownInput(
    props: ElementProps,
    fieldName: String,
    label: String,
    placeholder: String,
    currentValue: String,
) {
    val items = resolveListItems(props)
    var expanded by remember { mutableStateOf(false) }
    val selectedLabel = items.find { it.second == currentValue }?.first ?: currentValue

    val scaledFontSize = 16.sp
    val labelFontSize = 12.sp
    val borderColor = MaterialTheme.colorScheme.outline
    val placeholderColor = MaterialTheme.colorScheme.onSurfaceVariant
    val textColor = MaterialTheme.colorScheme.onSurface

    LabeledFieldStack(label, labelFontSize) {
        Box(modifier = Modifier.fillMaxWidth().height(40.dp)) {
            Row(
                modifier = Modifier
                    .fillMaxSize()
                    .border(1.dp, borderColor, RoundedCornerShape(4.dp))
                    .clickable { expanded = true }
                    .padding(horizontal = 8.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (selectedLabel.isNotEmpty()) {
                    Text(
                        text = selectedLabel,
                        color = textColor,
                        fontSize = scaledFontSize,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                } else {
                    Text(
                        text = if (placeholder.isNotEmpty()) placeholder else "Select…",
                        color = placeholderColor,
                        fontSize = scaledFontSize,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                }
                Icon(
                    imageVector = Icons.Default.ArrowDropDown,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            DropdownMenu(
                expanded = expanded,
                onDismissRequest = { expanded = false },
                modifier = Modifier.fillMaxWidth(),
            ) {
                items.forEach { (itemLabel, itemValue) ->
                    DropdownMenuItem(
                        text = { Text(itemLabel, fontSize = scaledFontSize) },
                        onClick = {
                            props.onFormChange(fieldName, itemValue)
                            expanded = false
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun ComboBoxInput(
    props: ElementProps,
    fieldName: String,
    label: String,
    placeholder: String,
    currentValue: String,
) {
    val items = resolveListItems(props)
    var expanded by remember { mutableStateOf(false) }
    val filteredItems = items.filter {
        currentValue.isEmpty() || it.first.contains(currentValue, ignoreCase = true)
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

    LabeledFieldStack(label, labelFontSize) {
        Box(modifier = Modifier.fillMaxWidth().height(40.dp)) {
            Row(
                modifier = Modifier
                    .fillMaxSize()
                    .border(1.dp, borderColor, RoundedCornerShape(4.dp))
                    .padding(horizontal = 8.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                BasicTextField(
                    value = currentValue,
                    onValueChange = { newValue ->
                        props.onFormChange(fieldName, newValue)
                        expanded = true
                    },
                    textStyle = textStyle,
                    singleLine = true,
                    cursorBrush = cursorBrush,
                    modifier = Modifier.weight(1f),
                    decorationBox = { innerTextField ->
                        Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterStart) {
                            if (currentValue.isEmpty() && placeholder.isNotEmpty()) {
                                Text(
                                    text = placeholder,
                                    color = placeholderColor,
                                    fontSize = scaledFontSize,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                            innerTextField()
                        }
                    },
                )
                Icon(
                    imageVector = Icons.Default.ArrowDropDown,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.clickable { expanded = !expanded },
                )
            }
            DropdownMenu(
                expanded = expanded && filteredItems.isNotEmpty(),
                onDismissRequest = { expanded = false },
                modifier = Modifier.fillMaxWidth(),
            ) {
                filteredItems.forEach { (itemLabel, itemValue) ->
                    DropdownMenuItem(
                        text = { Text(itemLabel, fontSize = scaledFontSize) },
                        onClick = {
                            props.onFormChange(fieldName, itemValue)
                            expanded = false
                        },
                    )
                }
            }
        }
    }
}

private fun resolveListItems(props: ElementProps): List<Pair<String, String>> {
    val listSource = props.element["listSource"]?.jsonObject
    val sourceMode = listSource?.get("mode")?.jsonPrimitive?.contentOrNull ?: "static"

    if (sourceMode == "input") {
        val paramName = listSource?.get("value")?.jsonPrimitive?.contentOrNull ?: ""
        val raw = props.inputParameters[paramName] ?: return emptyList()
        return try {
            val parsed = Json.parseToJsonElement(raw).jsonArray
            parsed.map { item ->
                when {
                    item is JsonPrimitive -> item.content to item.content
                    item is JsonObject -> {
                        // Accept {label,value} or {name,value} (value-property shape).
                        // Mirrors web resolveListItems in TextInputElement.tsx.
                        val lbl = item["label"]?.jsonPrimitive?.contentOrNull
                            ?: item["name"]?.jsonPrimitive?.contentOrNull
                            ?: ""
                        val v = item["value"]?.jsonPrimitive?.contentOrNull ?: lbl
                        lbl to v
                    }
                    else -> item.toString() to item.toString()
                }
            }
        } catch (_: Exception) { emptyList() }
    }

    val listItems = props.element["listItems"]?.jsonArray ?: return emptyList()
    return listItems.map { item ->
        when {
            item is JsonPrimitive -> item.content to item.content
            item is JsonObject -> {
                // Accept {label,value} or {name,value} (value-property shape).
                val lbl = item["label"]?.jsonPrimitive?.contentOrNull
                    ?: item["name"]?.jsonPrimitive?.contentOrNull
                    ?: ""
                val v = item["value"]?.jsonPrimitive?.contentOrNull ?: lbl
                lbl to v
            }
            else -> item.toString() to item.toString()
        }
    }
}
