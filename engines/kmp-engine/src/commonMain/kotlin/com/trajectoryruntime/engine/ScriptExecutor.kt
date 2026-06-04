// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
package com.trajectoryruntime.engine

data class ScriptEvalResult(
    val success: Boolean,
    val error: String? = null,
    val outputs: Map<String, String>? = null,
)

expect fun platformEvalScript(
    source: String,
    inputParameters: Map<String, String>,
): ScriptEvalResult
