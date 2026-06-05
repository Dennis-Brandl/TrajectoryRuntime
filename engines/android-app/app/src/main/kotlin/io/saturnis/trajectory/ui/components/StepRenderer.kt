// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
package io.saturnis.trajectory.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import io.saturnis.trajectory.util.resolveDefaultValue
import com.trajectoryruntime.engine.*
import kotlinx.serialization.json.*

@Composable
fun StepRenderer(
    step: StepInstance,
    onAction: (UserAction) -> Unit,
    properties: Map<String, String>,
    inputParameters: Map<String, String>,
    mediaMap: Map<String, String>,
    viewport: ViewportClass,
) {
    val stepType = step.stepType
    when {
        stepType == "YES NO" || stepType == "YES_NO" -> {
            YesNoRenderer(step, onAction, properties, inputParameters, mediaMap, viewport)
        }
        stepType == "USER INTERACTION" || stepType == "USER_INTERACTION" -> {
            UserInteractionRenderer(step, onAction, properties, inputParameters, mediaMap, viewport)
        }
        else -> {
            Text("Step type \"$stepType\" is executing — waiting for engine action.")
        }
    }
}

private fun buildFormValuesJson(formValues: Map<String, Any?>): Map<String, JsonElement> {
    return formValues.mapValues { (_, v) ->
        when (v) {
            is String -> JsonPrimitive(v)
            is Boolean -> JsonPrimitive(v)
            is Number -> JsonPrimitive(v)
            is List<*> -> JsonArray(v.filterIsInstance<String>().map { JsonPrimitive(it) })
            else -> JsonPrimitive(v.toString())
        }
    }
}

/**
 * Check if all required form fields have been filled in.
 * Returns true if all required fields are satisfied (or no required fields exist).
 */
private fun areRequiredFieldsSatisfied(
    elements: List<JsonElement>,
    formValues: Map<String, Any?>,
): Boolean {
    for (el in elements) {
        val obj = el.jsonObject
        val required = obj["required"]?.jsonPrimitive?.booleanOrNull ?: false
        if (!required) continue

        val fieldName = obj["fieldName"]?.jsonPrimitive?.contentOrNull ?: continue
        val type = obj["type"]?.jsonPrimitive?.contentOrNull ?: continue
        val value = formValues[fieldName]

        when (type) {
            "textInput", "textarea" -> {
                if (value == null || (value as? String).isNullOrBlank()) return false
            }
            "radio" -> {
                if (value == null || (value as? String).isNullOrEmpty()) return false
            }
            "checkbox" -> {
                val list = value as? List<*>
                if (list.isNullOrEmpty()) return false
            }
        }
    }
    return true
}

@Composable
private fun YesNoRenderer(
    step: StepInstance,
    onAction: (UserAction) -> Unit,
    properties: Map<String, String>,
    inputParameters: Map<String, String>,
    mediaMap: Map<String, String>,
    viewport: ViewportClass,
) {
    val config = step.step.yes_no_config
    val yesLabel = config?.yes_label ?: "Yes"
    val noLabel = config?.no_label ?: "No"
    val yesValue = config?.yes_value ?: "yes"
    val noValue = config?.no_value ?: "no"

    var formValues by remember(step.oid) {
        mutableStateOf(computeInitialFormValues(step, properties, inputParameters))
    }

    val onFormChange: (String, Any?) -> Unit = { name, value ->
        formValues = formValues + (name to value)
    }

    val press: (String) -> Unit = { value ->
        onAction(
            UserAction(
                step_oid = step.oid,
                action = "button_press",
                button_output = value,
                form_values = buildFormValuesJson(formValues),
            )
        )
    }

    Column(modifier = Modifier.fillMaxWidth()) {
        val layouts = step.step.form_layout_config
        if (layouts != null) {
            val elements = getFormElements(layouts)
            val hasButtons = elements.any {
                it.jsonObject["type"]?.jsonPrimitive?.contentOrNull == "button"
            }
            val buttonsEnabled = areRequiredFieldsSatisfied(elements, formValues)

            FormRenderer(
                layouts = layouts,
                formValues = formValues,
                onFormChange = onFormChange,
                onButtonPress = press,
                properties = properties,
                inputParameters = inputParameters,
                mediaMap = mediaMap,
                viewport = viewport,
                buttonsEnabled = buttonsEnabled,
                stepOid = step.oid,
            )

            if (!hasButtons) {
                Spacer(modifier = Modifier.height(16.dp))
                if (!buttonsEnabled) {
                    Text(
                        text = "Required fields must be completed",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                    )
                }
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Button(
                        onClick = { press(yesValue) },
                        enabled = buttonsEnabled,
                        modifier = Modifier.weight(1f),
                    ) { Text(yesLabel) }
                    OutlinedButton(
                        onClick = { press(noValue) },
                        enabled = buttonsEnabled,
                        modifier = Modifier.weight(1f),
                    ) { Text(noLabel) }
                }
            }
        } else {
            Spacer(modifier = Modifier.height(16.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Button(
                    onClick = { press(yesValue) },
                    modifier = Modifier.weight(1f),
                ) { Text(yesLabel) }
                OutlinedButton(
                    onClick = { press(noValue) },
                    modifier = Modifier.weight(1f),
                ) { Text(noLabel) }
            }
        }
    }
}

@Composable
private fun UserInteractionRenderer(
    step: StepInstance,
    onAction: (UserAction) -> Unit,
    properties: Map<String, String>,
    inputParameters: Map<String, String>,
    mediaMap: Map<String, String>,
    viewport: ViewportClass,
) {
    var formValues by remember(step.oid) {
        mutableStateOf(computeInitialFormValues(step, properties, inputParameters))
    }

    val onFormChange: (String, Any?) -> Unit = { name, value ->
        formValues = formValues + (name to value)
    }

    val onButtonPress: (String) -> Unit = { outputValue ->
        onAction(
            UserAction(
                step_oid = step.oid,
                action = "button_press",
                button_output = outputValue,
                form_values = buildFormValuesJson(formValues),
            )
        )
    }

    val layouts = step.step.form_layout_config
    if (layouts == null || (layouts is JsonArray && layouts.isEmpty())) {
        Column(modifier = Modifier.fillMaxWidth()) {
            Spacer(modifier = Modifier.height(16.dp))
            Button(onClick = {
                onAction(
                    UserAction(
                        step_oid = step.oid,
                        action = "submit",
                        form_values = buildFormValuesJson(formValues),
                    )
                )
            }) { Text("Submit") }
        }
    } else {
        val elements = getFormElements(layouts)
        val buttonsEnabled = areRequiredFieldsSatisfied(elements, formValues)

        FormRenderer(
            layouts = layouts,
            formValues = formValues,
            onFormChange = onFormChange,
            onButtonPress = onButtonPress,
            properties = properties,
            inputParameters = inputParameters,
            mediaMap = mediaMap,
            viewport = viewport,
            buttonsEnabled = buttonsEnabled,
            stepOid = step.oid,
        )
    }
}

private fun computeInitialFormValues(
    step: StepInstance,
    properties: Map<String, String>,
    inputParameters: Map<String, String>,
): Map<String, Any?> {
    val layouts = step.step.form_layout_config ?: return emptyMap()
    val elements = getFormElements(layouts)
    val initial = mutableMapOf<String, Any?>()
    for (el in elements) {
        val obj = el.jsonObject
        val fieldName = obj["fieldName"]?.jsonPrimitive?.contentOrNull ?: continue
        val defaultSource = obj["defaultSource"]?.jsonObject ?: continue
        val resolved = resolveDefaultValue(defaultSource, properties, inputParameters)
        if (resolved.isNotEmpty()) {
            initial[fieldName] = resolved
        }
    }
    return initial
}

private fun getFormElements(layouts: JsonElement): List<JsonElement> {
    val array = when {
        layouts is JsonArray -> layouts
        layouts is JsonObject -> JsonArray(listOf(layouts))
        else -> return emptyList()
    }
    val first = array.firstOrNull()?.jsonObject ?: return emptyList()
    return first["elements"]?.jsonArray?.toList() ?: emptyList()
}
