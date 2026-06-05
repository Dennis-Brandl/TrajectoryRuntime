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
import androidx.compose.foundation.selection.selectable
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
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
fun RadioElement(props: ElementProps) {
    val fieldName = props.element["fieldName"]?.jsonPrimitive?.contentOrNull ?: return
    val label = props.element["label"]?.jsonPrimitive?.contentOrNull ?: ""

    val selectedValue = (props.formValues[fieldName] as? String) ?: ""
    val parsedOptions = resolveCheckRadioOptions(props)
    if (parsedOptions.isEmpty()) return

    val radioLayoutSize = 24.dp
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
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .selectable(
                        selected = optValue == selectedValue,
                        role = Role.RadioButton,
                        onClick = { props.onFormChange(fieldName, optValue) },
                    ),
            ) {
                Box(modifier = Modifier.size(radioLayoutSize)) {
                    RadioButton(
                        selected = optValue == selectedValue,
                        onClick = null,
                        modifier = Modifier.size(radioLayoutSize),
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
