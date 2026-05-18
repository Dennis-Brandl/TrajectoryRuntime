// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
package io.saturnis.trajectory.ui.elements

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.contentOrNull

/**
 * Parses a JSON option element into a (label, value) pair.
 *
 * Supported shapes:
 *  - plain string primitive → label = value = the string
 *  - {label, value} object  → as authored
 *  - {name, value} object   → label = name, value = entry.value (value-property entry shape)
 */
internal fun parseOption(opt: JsonElement): Pair<String, String> {
    return when (opt) {
        is JsonPrimitive -> {
            val text = opt.contentOrNull ?: ""
            text to text
        }
        is JsonObject -> {
            val label = opt["label"]?.jsonPrimitive?.contentOrNull
            if (label != null) {
                val value = opt["value"]?.jsonPrimitive?.contentOrNull ?: label
                return label to value
            }
            val name = opt["name"]?.jsonPrimitive?.contentOrNull
            if (name != null) {
                val value = opt["value"]?.jsonPrimitive?.contentOrNull ?: name
                return name to value
            }
            "" to ""
        }
        else -> "" to ""
    }
}

/**
 * Resolve options for checkbox/radio elements. `listSource` (input mode) takes
 * precedence — when it resolves to an input-parameter property name, that
 * parameter's JSON array of entries becomes the option list. Static `options`
 * is the fallback used only when no usable `listSource` is configured.
 *
 * This mirrors `TextInputElement.resolveListItems` precedence so dropdown,
 * combobox, checkbox, and radio all behave the same way when listSource is
 * present even alongside a static options array.
 *
 * Description entries are filtered out by PropertyStore.resolvePropertyKey before
 * the JSON ever reaches this layer, so no extra filtering is needed here.
 */
internal fun resolveCheckRadioOptions(props: ElementProps): List<Pair<String, String>> {
    val paramName = extractListSourceParam(props.element["listSource"])
    if (paramName != null) {
        val raw = props.inputParameters[paramName]?.takeIf { it.isNotEmpty() }
            ?: return emptyList()
        return try {
            val parsed = Json.parseToJsonElement(raw)
            if (parsed is JsonArray) parsed.map { parseOption(it) } else emptyList()
        } catch (_: Throwable) {
            emptyList()
        }
    }
    val staticOptions = props.element["options"]?.jsonArray
    if (staticOptions != null && staticOptions.isNotEmpty()) {
        return staticOptions.map { parseOption(it) }
    }
    return emptyList()
}

/**
 * Extract the input-parameter property name from a listSource value. Handles
 * either shape the editor may write:
 *  - a JSON string `"PropertyName"`                              (the property name directly)
 *  - a JSON object `{ "mode": "input", "value": "PropertyName" }` (the standard ListItemSource shape)
 *  - a JSON object `{ "value": "PropertyName" }`                  (mode defaults to "input")
 * Returns null when no usable property name can be found, or when mode is
 * explicitly something other than "input".
 */
private fun extractListSourceParam(source: JsonElement?): String? {
    return when (source) {
        is JsonPrimitive -> source.contentOrNull?.takeIf { it.isNotEmpty() }
        is JsonObject -> {
            val mode = source["mode"]?.jsonPrimitive?.contentOrNull
            if (mode != null && mode != "input") return null
            source["value"]?.jsonPrimitive?.contentOrNull?.takeIf { it.isNotEmpty() }
        }
        else -> null
    }
}
