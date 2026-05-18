// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
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
