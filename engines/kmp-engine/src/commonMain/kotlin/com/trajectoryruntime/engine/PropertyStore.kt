// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
package com.trajectoryruntime.engine

import kotlinx.serialization.json.*

class PropertyStore {
    private val store = mutableMapOf<String, String>()
    private val inputParameters = mutableMapOf<String, String>()
    private val startingParameters = mutableMapOf<String, String>()

    fun initializeFromWorkflow(workflow: MasterWorkflowSpecification) {
        val specs = workflow.value_property_specifications ?: return
        for (prop in specs) {
            for (entry in prop.entries) {
                store["${prop.name}.${entry.name}"] = entry.value
            }
        }
    }

    fun initializeFromSetup(initialProperties: Map<String, String>) {
        store.putAll(initialProperties)
    }

    fun get(dotKey: String): String? = store[dotKey]

    fun set(dotKey: String, value: String) {
        store[dotKey] = value
    }

    /** Sync-receive write: set bare target, and if data is a JSON [{name,value},...] array
     *  (mirror of resolveKey's group serialization), also explode entries into dotted children
     *  so downstream readers can consume either the full record or individual fields. */
    fun setSyncTarget(target: String, data: String) {
        store[target] = data
        val entries = parseGroupEntries(data) ?: return
        for ((name, value) in entries) {
            store["$target.$name"] = value
        }
    }

    /** Parse [{"name":string,"value":string}, ...]. Returns null on any deviation. */
    private fun parseGroupEntries(data: String): List<Pair<String, String>>? {
        if (data.isBlank()) return null
        val trimmed = data.trim()
        if (!trimmed.startsWith("[")) return null
        return try {
            val element = Json.parseToJsonElement(trimmed)
            val arr = element as? JsonArray ?: return null
            if (arr.isEmpty()) return null
            val result = mutableListOf<Pair<String, String>>()
            for (item in arr) {
                val obj = item as? JsonObject ?: return null
                val namePrim = obj["name"] as? JsonPrimitive ?: return null
                val valuePrim = obj["value"] as? JsonPrimitive ?: return null
                if (!namePrim.isString || !valuePrim.isString) return null
                result.add(namePrim.content to valuePrim.content)
            }
            result
        } catch (_: Throwable) {
            null
        }
    }

    /** Public mirror of TS PropertyStore.resolveKey — exact match first,
     *  then group-prefix fallback returning JSON array of {name, value} pairs. */
    fun resolveKey(key: String): String = resolvePropertyKey(key)

    /** Resolve a property key: exact match first, then group prefix fallback.
     *  If the key matches a group (e.g., "DataToSend" with entries "DataToSend.X", "DataToSend.Y"),
     *  returns a JSON array of {name, value} pairs.
     *
     *  The "Description" entry is intentionally excluded — value properties use it for
     *  human-readable annotation, not runtime data, so it should never surface in
     *  serialized lists, sync payloads, or input-parameter resolutions. */
    private fun resolvePropertyKey(key: String): String {
        val exact = store[key]
        if (exact != null) return exact
        val prefix = "$key."
        val entries = store.entries
            .filter { it.key.startsWith(prefix) }
            .filter { !it.key.substring(prefix.length).equals("Description", ignoreCase = true) }
            .map { buildJsonObject {
                put("name", it.key.substring(prefix.length))
                put("value", it.value)
            }}
        if (entries.isNotEmpty()) return JsonArray(entries).toString()
        return ""
    }

    fun resolveDefault(defaultSource: ParameterDefaultSource?): String {
        if (defaultSource == null) return ""
        return when (defaultSource.mode) {
            "static" -> defaultSource.value
            "property", "parameter" -> store[defaultSource.value] ?: ""
            else -> ""
        }
    }

    fun initializeStartingParameters(
        specs: List<ParameterSpecification>?,
        values: Map<String, String>?,
    ) {
        if (specs == null) return
        for (spec in specs) {
            if (values != null && spec.id in values) {
                startingParameters[spec.id] = values[spec.id]!!
            } else {
                var resolved = spec.default_value
                if (spec.value_type == "property") {
                    resolved = resolvePropertyKey(spec.default_value)
                }
                startingParameters[spec.id] = resolved
            }
            // Also make starting params available as properties for downstream lookups
            store[spec.id] = startingParameters[spec.id]!!
        }
    }

    fun resolveInputParameters(specs: List<ParameterSpecification>?) {
        if (specs == null) return
        inputParameters.clear()
        for (spec in specs) {
            var resolved = spec.default_value
            if (spec.value_type == "property") {
                resolved = resolvePropertyKey(spec.default_value)
            }
            inputParameters[spec.id] = resolved
        }
    }

    fun getInputParameters(): Map<String, String> {
        // Merge: inputParameters take precedence, startingParameters as fallback
        // Matches TS engine's PropertyStore.getInputParameters()
        val result = mutableMapOf<String, String>()
        for ((key, value) in startingParameters) {
            result[key] = value
        }
        for ((key, value) in inputParameters) {
            result[key] = value
        }
        return result
    }

    fun captureFormOutputs(
        elements: List<JsonObject>,
        formValues: Map<String, JsonElement>,
        outputSpecs: List<OutputParameterSpecification>? = null,
    ) {
        for (el in elements) {
            val outputParameter = el["outputParameter"]?.jsonPrimitive?.contentOrNull ?: continue
            val fieldName = el["fieldName"]?.jsonPrimitive?.contentOrNull ?: continue
            val value = formValues[fieldName] ?: continue

            val target = if (outputSpecs != null) {
                val spec = outputSpecs.find { it.id == outputParameter }
                spec?.target ?: outputParameter
            } else {
                outputParameter
            }

            store[target] = if (value is JsonArray) {
                value.toString()
            } else {
                when {
                    value is JsonPrimitive && value.isString -> value.content
                    value is JsonPrimitive -> value.content
                    else -> value.toString()
                }
            }
        }
    }

    fun toFlatMap(): Map<String, String> = store.toMap()
}
