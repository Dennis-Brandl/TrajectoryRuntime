// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
package com.trajectoryruntime.engine

import org.mozilla.javascript.Context
import org.mozilla.javascript.ScriptableObject

actual fun platformEvalScript(
    source: String,
    inputParameters: Map<String, String>,
): ScriptEvalResult {
    return try {
        val cx = Context.enter()
        try {
            // Android doesn't support bytecode generation; use interpreted mode
            cx.optimizationLevel = -1
            // ES6 so user scripts can use let/const/arrows/etc.
            cx.languageVersion = Context.VERSION_ES6
            val scope = cx.initStandardObjects()

            // Inject input parameters as global variables
            for ((key, value) in inputParameters) {
                ScriptableObject.putProperty(scope, key, value)
            }

            // Initialize empty output object in outer scope so a top-level
            // `return` in user source does not discard mutated output.
            cx.evaluateString(scope, "var output = {};", "<init>", 1, null)

            // Wrap user source in an IIFE so bare top-level `return` is legal.
            val wrapped = "(function(){\n$source\n})();"
            cx.evaluateString(scope, wrapped, "<script>", 1, null)

            // Extract output object
            val outputObj = scope.get("output", scope)
            val outputs = mutableMapOf<String, String>()
            if (outputObj is ScriptableObject) {
                for (id in outputObj.ids) {
                    val key = id.toString()
                    val value = outputObj.get(key, outputObj)
                    if (value != null && value != ScriptableObject.NOT_FOUND) {
                        outputs[key] = Context.toString(value)
                    }
                }
            }

            ScriptEvalResult(success = true, outputs = outputs)
        } finally {
            Context.exit()
        }
    } catch (e: Exception) {
        ScriptEvalResult(success = false, error = e.message ?: e.toString())
    }
}
