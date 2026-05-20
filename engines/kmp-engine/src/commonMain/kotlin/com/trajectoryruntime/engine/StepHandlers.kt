// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
package com.trajectoryruntime.engine

import kotlinx.serialization.json.*

// Normalize only SELECT_1 -> SELECT 1 (the only fixture/schema discrepancy).
// USER_INTERACTION and YES_NO keep their underscores per the schema enum.
fun canonicalStepType(raw: String): String {
    if (raw == "SELECT_1") return "SELECT 1"
    return raw
}

fun isAutoCompleting(stepType: String): Boolean {
    val t = canonicalStepType(stepType)
    return t in listOf("START", "END", "PARALLEL", "WAIT ANY", "SELECT 1", "SCRIPT", "MATH")
}

fun needsUserAction(stepType: String): Boolean {
    return stepType in listOf("USER_INTERACTION", "YES_NO", "ACTION PROXY")
}

fun getFormElements(step: MasterWorkflowStep): List<JsonObject> {
    val config = step.form_layout_config ?: return emptyList()

    // Handle array of breakpoints -- use first one (phone)
    if (config is JsonArray) {
        if (config.isEmpty()) return emptyList()
        val first = config[0].jsonObject
        val elements = first["elements"] as? JsonArray ?: return emptyList()
        return elements.map { it.jsonObject }
    }

    // Handle plain object shape (some semantic fixtures use this)
    if (config is JsonObject && "elements" in config) {
        val elements = config["elements"] as? JsonArray ?: return emptyList()
        return elements.map { it.jsonObject }
    }

    return emptyList()
}

fun handleSelect1(
    step: MasterWorkflowStep,
    propertyStore: PropertyStore,
): RoutingResult {
    val config = step.select1_config ?: return RoutingResult()
    val options = config.options ?: return RoutingResult()

    // Resolve the input value
    var inputValue = ""
    if (config.input_value_type == "property" && config.input_name != null) {
        inputValue = propertyStore.get(config.input_name) ?: ""
    } else if (config.input_name != null) {
        inputValue = config.input_name
    }

    // Evaluate options in order
    var defaultOption: Select1Option? = null
    for (option in options) {
        if (option.is_default) {
            defaultOption = option
            continue
        }

        val compareValue = if (option.value_type == "property") {
            propertyStore.get(option.value) ?: ""
        } else {
            option.value
        }

        if (evaluateOperator(inputValue, option.operator, compareValue)) {
            return RoutingResult(connectionId = option.id)
        }
    }

    // No match -- use default
    if (defaultOption != null) {
        return RoutingResult(connectionId = defaultOption.id)
    }

    return RoutingResult()
}

private fun evaluateOperator(input: String, operator: String, value: String): Boolean {
    return when (operator) {
        "==" -> input == value
        "!=" -> input != value
        "<" -> input < value
        ">" -> input > value
        "<=" -> input <= value
        ">=" -> input >= value
        "Contains" -> input.contains(value)
        "Not Contains" -> !input.contains(value)
        else -> false
    }
}

fun handleUserAction(
    step: MasterWorkflowStep,
    action: UserAction,
    propertyStore: PropertyStore,
): RoutingResult {
    val stepType = step.step_type

    if (stepType == "YES_NO") {
        // YES_NO is a routing step -- the button output drives routing via sourceHandleId/condition.
        // Parameter writes only come from form elements with `outputParameter` bindings; the button
        // literal is never written to output_parameter_specifications.
        if (action.form_values != null) {
            val elements = getFormElements(step)
            propertyStore.captureFormOutputs(elements, action.form_values, step.output_parameter_specifications)
        }
        return RoutingResult(
            sourceHandleId = action.button_output,
            conditionValue = action.button_output,
        )
    }

    if (stepType == "USER_INTERACTION") {
        // Capture form outputs for ALL actions that carry form_values
        // (both submit and button_press can carry form data)
        if (action.form_values != null) {
            val elements = getFormElements(step)
            propertyStore.captureFormOutputs(elements, action.form_values, step.output_parameter_specifications)
        }

        if (action.action == "button_press") {
            return RoutingResult(conditionValue = action.button_output)
        }

        return RoutingResult()
    }

    return RoutingResult()
}

data class ScriptResult(
    val success: Boolean,
    val error: String? = null,
)

fun executeScript(
    step: MasterWorkflowStep,
    propertyStore: PropertyStore,
    inputParameters: Map<String, String>,
): ScriptResult {
    val config = step.script_config ?: return ScriptResult(success = true)
    val source = config.source ?: return ScriptResult(success = true)

    val result = platformEvalScript(source, inputParameters)
    if (!result.success) return ScriptResult(success = false, error = result.error)

    val outputSpecs = step.output_parameter_specifications
    if (outputSpecs != null && result.outputs != null) {
        for (spec in outputSpecs) {
            val target = spec.target ?: continue
            val value = result.outputs[spec.id]
            if (value != null) {
                propertyStore.set(target, value)
            }
        }
    }

    return ScriptResult(success = true)
}
