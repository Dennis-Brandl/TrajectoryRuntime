// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
package com.trajectoryruntime.engine

import io.ktor.client.HttpClient
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

class KtorActionInvoker : ActionInvoker {
    private val client = HttpClient {
        install(ContentNegotiation) { json() }
    }
    private val active = mutableMapOf<String, Job>()

    private fun normalize(uri: String): String {
        val t = uri.trim()
        return if (t.endsWith("/")) t else "$t/"
    }

    override suspend fun invoke(req: InvokeRequestKmp, callbacks: ActionInvokerCallbacks): String {
        val base = normalize(req.serverUri)
        val invokeUrl = "${base}actions/${req.actionOid}/invoke"
        val bodyJson = buildJsonObject {
            put("workflow_instance_id", req.workflowInstanceId)
            put("input_parameters", buildJsonObject {
                for ((k, v) in req.inputs) put(k, v)
            })
        }
        val resText = retryForever {
            val r = client.post(invokeUrl) {
                contentType(ContentType.Application.Json)
                setBody(bodyJson.toString())
            }
            r.bodyAsText()
        }
        val data = Json.parseToJsonElement(resText).jsonObject["data"]?.jsonObject
            ?: error("invoke missing data")
        val instanceId = data["runtime_action_instance_id"]?.jsonPrimitive?.content
            ?: error("missing runtime_action_instance_id")
        val initial = data["status"]?.jsonPrimitive?.content
        if (initial != null) {
            callbacks.onStateChange(req.stepOid, mapStateToEnum(initial), null)
        }

        active[req.stepOid] = GlobalScope.launch {
            pollLoop(req.stepOid, base, instanceId, req.pollIntervalMs, callbacks, initial)
        }
        return instanceId
    }

    private suspend fun pollLoop(
        stepOid: String,
        base: String,
        instanceId: String,
        intervalMs: Long,
        callbacks: ActionInvokerCallbacks,
        initialStatus: String?,
    ) {
        var lastStatus = initialStatus
        var consecutiveFailures = 0
        var connectivity = "ok"
        while (currentCoroutineContext().isActive) {
            delay(intervalMs)
            try {
                val r = client.get("${base}instances/$instanceId")
                if (r.status.value == 404) {
                    callbacks.onStateChange(stepOid, StepState.ABORTED, null)
                    release(stepOid)
                    return
                }
                if (r.status.isSuccess()) {
                    if (connectivity != "ok") {
                        connectivity = "ok"
                        callbacks.onConnectivityChange(stepOid, "ok")
                    }
                    consecutiveFailures = 0
                    val txt = r.bodyAsText()
                    val data = Json.parseToJsonElement(txt).jsonObject["data"]?.jsonObject ?: continue
                    val status = data["status"]?.jsonPrimitive?.content ?: continue
                    val outputs = data["output_parameters"]?.jsonObject?.entries
                        ?.associate { (k, v) -> k to v.jsonPrimitive.content }
                    if (status != lastStatus) {
                        lastStatus = status
                        callbacks.onStateChange(stepOid, mapStateToEnum(status), outputs)
                    }
                    if (status in setOf("COMPLETED", "ABORTED", "ERRORED", "STOPPED")) {
                        release(stepOid)
                        return
                    }
                } else if (r.status.value >= 500) {
                    consecutiveFailures++
                    if (consecutiveFailures >= 3 && connectivity == "ok") {
                        connectivity = "reconnecting"
                        callbacks.onConnectivityChange(stepOid, "reconnecting")
                    }
                }
            } catch (_: Throwable) {
                consecutiveFailures++
                if (consecutiveFailures >= 3 && connectivity == "ok") {
                    connectivity = "reconnecting"
                    callbacks.onConnectivityChange(stepOid, "reconnecting")
                }
            }
        }
    }

    private fun mapStateToEnum(s: String): StepState = when (s) {
        "STARTING" -> StepState.STARTING
        "EXECUTING" -> StepState.EXECUTING
        "COMPLETING" -> StepState.COMPLETING
        "COMPLETED" -> StepState.COMPLETED
        "POSTED" -> StepState.POSTED
        "RECEIVED" -> StepState.RECEIVED
        "IN_PROGRESS" -> StepState.IN_PROGRESS
        "HELD" -> StepState.HELD
        "PAUSED" -> StepState.PAUSED
        "ABORTED", "STOPPED" -> StepState.ABORTED
        "ERRORED" -> StepState.ERRORED
        else -> StepState.EXECUTING
    }

    override suspend fun sendCommand(serverUri: String, instanceId: String, command: ActionServerCommand) {
        val url = "${normalize(serverUri)}instances/$instanceId/command"
        try {
            val r = client.post(url) {
                contentType(ContentType.Application.Json)
                setBody(buildJsonObject { put("command", command.name) }.toString())
            }
            if (r.status.value == 409) return // silent-ignore INVALID_STATE_TRANSITION
        } catch (_: Throwable) {
            // best-effort
        }
    }

    override suspend fun abort(serverUri: String, instanceId: String) {
        try {
            client.delete("${normalize(serverUri)}instances/$instanceId")
        } catch (_: Throwable) {
            // best-effort
        }
    }

    override fun release(stepOid: String) {
        active[stepOid]?.cancel()
        active.remove(stepOid)
    }

    private suspend fun <T> retryForever(block: suspend () -> T): T {
        val delays = longArrayOf(100, 200, 400, 800, 1600, 3200, 6400, 12800, 25600, 30000)
        var attempt = 0
        while (true) {
            try {
                return block()
            } catch (_: Throwable) {
                // fall through
            }
            delay(delays[minOf(attempt, delays.lastIndex)])
            attempt++
        }
    }
}
