// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
package com.trajectoryruntime.engine

actual fun platformEvalScript(
    source: String,
    inputParameters: Map<String, String>,
): ScriptEvalResult {
    return try {
        // Build input variable declarations
        val inputDecls = inputParameters.entries.joinToString("\n") { (k, v) ->
            "var ${k} = ${jsStringify(v)};"
        }

        // Wrap in IIFE to get output
        val wrappedSource = "(function() { $inputDecls\nvar output = {};\n$source\nreturn output; })()"

        val result: dynamic = eval(wrappedSource)

        // Extract keys from the result object
        val outputs = mutableMapOf<String, String>()
        val keys: dynamic = js("Object.keys(result)")
        val len = (keys.length as Number).toInt()
        for (i in 0 until len) {
            val key = keys[i] as String
            val value = result[key]
            if (value != null && value != undefined) {
                outputs[key] = value.toString()
            }
        }

        ScriptEvalResult(success = true, outputs = outputs)
    } catch (e: dynamic) {
        val message = try { (e.message as? String) ?: e.toString() } catch (_: dynamic) { "Unknown error" }
        ScriptEvalResult(success = false, error = message)
    }
}

private fun jsStringify(value: String): String {
    val escaped = value
        .replace("\\", "\\\\")
        .replace("\"", "\\\"")
        .replace("\n", "\\n")
        .replace("\r", "\\r")
        .replace("\t", "\\t")
    return "\"$escaped\""
}
