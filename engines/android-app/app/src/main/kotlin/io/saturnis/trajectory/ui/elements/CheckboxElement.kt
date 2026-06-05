// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
package io.saturnis.trajectory.ui.elements

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull

@Composable
fun CheckboxElement(props: ElementProps) {
    val fieldName = props.element["fieldName"]?.jsonPrimitive?.contentOrNull ?: return
    val label = props.element["label"]?.jsonPrimitive?.contentOrNull ?: ""

    @Suppress("UNCHECKED_CAST")
    val selectedValues = (props.formValues[fieldName] as? List<String>) ?: emptyList()
    val parsedOptions = resolveCheckRadioOptions(props)
    if (parsedOptions.isEmpty()) return

    // Constrain the Checkbox's layout size — Material's default 48dp clickable box
    // is what creates the wide spacing between rows. Click handling is already on
    // the surrounding Row, so shrinking the Checkbox is safe.
    val checkboxLayoutSize = 24.dp
    val fontSizeOverride = props.element["fontSize"]?.jsonPrimitive?.intOrNull
    val itemFontSize = fontSizeOverride?.sp ?: 14.sp
    val labelFontSize = fontSizeOverride?.sp ?: 12.sp
    val rowGap = 4.dp

    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(rowGap),
    ) {
        if (label.isNotEmpty()) {
            Text(
                text = label,
                style = MaterialTheme.typography.bodySmall.copy(fontSize = labelFontSize),
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
                    .toggleable(
                        value = checked,
                        role = Role.Checkbox,
                        onValueChange = { isChecked ->
                            val newValues = if (isChecked) {
                                selectedValues + optValue
                            } else {
                                selectedValues - optValue
                            }
                            props.onFormChange(fieldName, newValues)
                        },
                    ),
            ) {
                Box(modifier = Modifier.size(checkboxLayoutSize)) {
                    Checkbox(
                        checked = checked,
                        onCheckedChange = null, // row handles clicks
                        modifier = Modifier.size(checkboxLayoutSize),
                    )
                }
                Text(
                    text = optLabel,
                    style = MaterialTheme.typography.bodyMedium.copy(fontSize = itemFontSize),
                    modifier = Modifier.padding(start = 6.dp),
                )
            }
        }
    }
}
