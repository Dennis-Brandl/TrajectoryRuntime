// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
package com.trajectoryruntime.engine

actual fun platformEvalScript(
    source: String,
    inputParameters: Map<String, String>,
): ScriptEvalResult {
    return try {
        val outputs = mutableMapOf<String, String>()

        // Parse simple assignment statements: output.key = 'value'; or output.key = value;
        val trimmed = source.trim()
        if (trimmed.isEmpty() || trimmed == ";") {
            return ScriptEvalResult(success = true, outputs = outputs)
        }

        // Split by semicolons and process each statement
        val statements = trimmed.split(";").map { it.trim() }.filter { it.isNotEmpty() }

        for (statement in statements) {
            // Match: output.key = 'value' or output.key = "value"
            val quotedMatch = Regex("""output\.(\w+)\s*=\s*['"](.*)['"]""").find(statement)
            if (quotedMatch != null) {
                val key = quotedMatch.groupValues[1]
                val value = quotedMatch.groupValues[2]
                outputs[key] = value
                continue
            }

            // Match: output.key = variableName (resolve from input parameters)
            val varMatch = Regex("""output\.(\w+)\s*=\s*(\w+)""").find(statement)
            if (varMatch != null) {
                val key = varMatch.groupValues[1]
                val varName = varMatch.groupValues[2]
                val value = inputParameters[varName] ?: varName
                outputs[key] = value
                continue
            }

            // Unknown statement - skip (for statements like variable declarations)
        }

        ScriptEvalResult(success = true, outputs = outputs)
    } catch (e: Exception) {
        ScriptEvalResult(success = false, error = e.message ?: e.toString())
    }
}
