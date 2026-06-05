// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
package io.saturnis.trajectory.util

import kotlinx.serialization.json.*

/**
 * Resolves a defaultSource or placeholderSource to a concrete value.
 * Matches web-ui's resolveDefaultValue() from properties.ts.
 *
 * The source object has: { mode: "static"|"property"|"parameter"|"input", value: "key" }
 */
fun resolveDefaultValue(
    source: JsonObject?,
    properties: Map<String, String>,
    inputParameters: Map<String, String>,
): String {
    if (source == null) return ""
    val mode = source["mode"]?.jsonPrimitive?.contentOrNull ?: return ""
    val value = source["value"]?.jsonPrimitive?.contentOrNull ?: return ""
    return when (mode) {
        "static" -> value
        "property" -> properties[value] ?: ""
        "parameter", "input" -> inputParameters[value] ?: ""
        else -> ""
    }
}
