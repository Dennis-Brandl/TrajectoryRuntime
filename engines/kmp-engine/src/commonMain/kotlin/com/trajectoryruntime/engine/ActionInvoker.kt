// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
package com.trajectoryruntime.engine

enum class ActionServerCommand { PAUSE, RESUME, HOLD, UNHOLD, STOP, ABORT, CLEAR }

data class InvokeRequestKmp(
    val stepOid: String,
    val workflowInstanceId: String,
    val serverUri: String,
    val actionOid: String,
    val inputs: Map<String, String>,
    val pollIntervalMs: Long,
)

interface ActionInvokerCallbacks {
    fun onStateChange(stepOid: String, newState: StepState, outputs: Map<String, String>?)
    fun onConnectivityChange(stepOid: String, status: String) // "ok" | "reconnecting" | "never_connected"
}

interface ActionInvoker {
    suspend fun invoke(req: InvokeRequestKmp, callbacks: ActionInvokerCallbacks): String
    suspend fun sendCommand(serverUri: String, instanceId: String, command: ActionServerCommand)
    suspend fun abort(serverUri: String, instanceId: String)
    fun release(stepOid: String)
}
