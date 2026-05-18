// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
@file:OptIn(ExperimentalJsExport::class)

package com.trajectoryruntime.engine

import kotlinx.serialization.json.*
import kotlinx.serialization.builtins.ListSerializer

@JsExport
class WorkflowEngineFacade {
    private var engine: WorkflowEngine? = null
    private var currentActionIndex: Int = 0

    fun validate(workflowJson: String): String {
        return try {
            val json = Json { ignoreUnknownKeys = true }
            val jsonElement = json.parseToJsonElement(workflowJson)
            val workflowMap = jsonElementToMap(jsonElement)
            val result = com.trajectoryruntime.engine.validate(workflowMap)

            if (result.valid) {
                """{"valid":true}"""
            } else {
                val errorCode = result.error_code?.let { "\"$it\"" } ?: "null"
                """{"valid":false,"error_code":$errorCode}"""
            }
        } catch (e: Exception) {
            val msg = (e.message ?: "").replace("\"", "\\\"")
            """{"valid":false,"error_code":"PARSE_ERROR","error_message":"$msg"}"""
        }
    }

    fun create(workflowJson: String, setupJson: String?) {
        val json = Json { ignoreUnknownKeys = true }
        val workflow = json.decodeFromString<MasterWorkflowSpecification>(workflowJson)
        val setup = if (setupJson != null) json.decodeFromString<TestFixtureSetup>(setupJson) else null
        engine = WorkflowEngine(workflow, setup)
        currentActionIndex = 0
    }

    fun start() {
        engine!!.start()
    }

    fun createAndStart(workflowJson: String, setupJson: String?) {
        create(workflowJson, setupJson)
        start()
    }

    fun submitAction(actionJson: String) {
        val json = Json { ignoreUnknownKeys = true }
        val action = json.decodeFromString<UserAction>(actionJson)
        engine!!.submitAction(action, currentActionIndex)
        currentActionIndex++
    }

    fun getTrace(): String {
        val json = Json
        return json.encodeToString(ListSerializer(TraceEntry.serializer()), engine!!.getTrace())
    }

    fun getWorkflowState(): String {
        return engine!!.getWorkflowState().name
    }

    fun getProperties(): String {
        val props = engine!!.getProperties()
        val jsonObj = buildJsonObject {
            for ((key, value) in props) {
                put(key, value)
            }
        }
        return jsonObj.toString()
    }

    fun getAllProperties(): String = getProperties()

    fun getActiveSteps(): String {
        val steps = engine!!.getActiveSteps()
        val jsonArray = buildJsonArray {
            for (info in steps) {
                addJsonObject {
                    putJsonObject("step") {
                        put("oid", info.step.oid)
                        put("stepType", info.step.stepType)
                        put("state", info.step.state.name)
                        putJsonObject("step") {
                            put("oid", info.step.step.oid)
                            put("local_id", info.step.step.local_id)
                            put("step_type", info.step.step.step_type)
                            put("description", info.step.step.description)
                            put("version", info.step.step.version)
                            put("last_modified_date", info.step.step.last_modified_date)
                            info.step.step.form_layout_config?.let { put("form_layout_config", it) }
                            info.step.step.yes_no_config?.let { yesNo ->
                                putJsonObject("yes_no_config") {
                                    yesNo.yes_label?.let { put("yes_label", it) }
                                    yesNo.no_label?.let { put("no_label", it) }
                                    yesNo.yes_value?.let { put("yes_value", it) }
                                    yesNo.no_value?.let { put("no_value", it) }
                                }
                            }
                            info.step.step.input_parameter_specifications?.let { specs ->
                                putJsonArray("input_parameter_specifications") {
                                    for (spec in specs) {
                                        addJsonObject {
                                            put("id", spec.id)
                                            put("default_value", spec.default_value)
                                            spec.value_type?.let { put("value_type", it) }
                                            spec.oid?.let { put("oid", it) }
                                            spec.description?.let { put("description", it) }
                                        }
                                    }
                                }
                            }
                            info.step.step.output_parameter_specifications?.let { specs ->
                                putJsonArray("output_parameter_specifications") {
                                    for (spec in specs) {
                                        addJsonObject {
                                            put("id", spec.id)
                                            spec.target?.let { put("target", it) }
                                            spec.oid?.let { put("oid", it) }
                                            spec.description?.let { put("description", it) }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    put("workflowName", info.workflowName)
                    info.waitingOn?.let { waiting ->
                        putJsonObject("waitingOn") {
                            put("resourceName", waiting.resourceName)
                            put("commandType", waiting.commandType)
                        }
                    }
                }
            }
        }
        return jsonArray.toString()
    }

    fun getActiveInputParameters(): String {
        val params = engine!!.getActiveInputParameters()
        val jsonObj = buildJsonObject {
            for ((key, value) in params) { put(key, value) }
        }
        return jsonObj.toString()
    }

    fun getStepParameterSnapshots(): String {
        val snapshots = engine!!.getStepParameterSnapshots()
        val jsonObj = buildJsonObject {
            for ((oid, snap) in snapshots) {
                putJsonObject(oid) {
                    putJsonObject("inputParameters") {
                        for ((k, v) in snap.inputParameters) { put(k, v) }
                    }
                    putJsonObject("outputParameters") {
                        for ((k, v) in snap.outputParameters) { put(k, v) }
                    }
                    put("description", snap.description)
                    put("label", snap.label)
                    put("stepType", snap.stepType)
                }
            }
        }
        return jsonObj.toString()
    }
}

private fun jsonElementToMap(element: JsonElement): Map<String, Any?> {
    if (element !is JsonObject) return emptyMap()
    val result = mutableMapOf<String, Any?>()
    for ((key, value) in element) {
        result[key] = jsonElementToAny(value)
    }
    return result
}

private fun jsonElementToAny(element: JsonElement): Any? {
    return when (element) {
        is JsonNull -> null
        is JsonPrimitive -> {
            if (element.isString) element.content
            else element.booleanOrNull ?: element.intOrNull ?: element.longOrNull ?: element.doubleOrNull ?: element.content
        }
        is JsonArray -> element.map { jsonElementToAny(it) }
        is JsonObject -> {
            val map = mutableMapOf<String, Any?>()
            for ((key, value) in element) {
                map[key] = jsonElementToAny(value)
            }
            map
        }
    }
}
