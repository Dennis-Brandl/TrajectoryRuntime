// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
package io.saturnis.trajectory.ui.elements

import androidx.compose.runtime.Stable
import kotlinx.serialization.json.JsonObject

@Stable
data class ElementProps(
    val element: JsonObject,
    val formValues: Map<String, Any?>,
    val onFormChange: (fieldName: String, value: Any?) -> Unit,
    val onButtonPress: (outputValue: String) -> Unit,
    val properties: Map<String, String>,
    val inputParameters: Map<String, String>,
    val mediaMap: Map<String, String>,
    val buttonsEnabled: Boolean = true,
    val stepOid: String = "",
)
