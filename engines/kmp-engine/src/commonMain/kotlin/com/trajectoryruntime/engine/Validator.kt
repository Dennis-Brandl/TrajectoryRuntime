// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
package com.trajectoryruntime.engine

private fun normalizeStepType(t: String): String = t.replace('_', ' ')

// Pre-checks: catch missing required fields on steps/connections before
// semantic graph analysis (which would misinterpret them)
private fun preStructuralChecks(workflow: Map<String, Any?>): ValidationResult? {
    val steps = workflow["steps"]
    val connections = workflow["connections"]

    if (steps !is List<*>) {
        return ValidationResult(false, "MISSING_REQUIRED_FIELD", "Missing steps array")
    }
    if (connections !is List<*>) {
        return ValidationResult(false, "MISSING_REQUIRED_FIELD", "Missing connections array")
    }

    // Check each step has required ManagedElement fields
    for (step in steps) {
        if (step !is Map<*, *>) {
            return ValidationResult(false, "MISSING_REQUIRED_FIELD", "Invalid step entry")
        }
        for (field in listOf("local_id", "oid", "version", "last_modified_date")) {
            if (field !in step) {
                return ValidationResult(false, "MISSING_REQUIRED_FIELD", "Step missing required field: $field")
            }
        }
        if ("step_type" !in step) {
            return ValidationResult(false, "MISSING_REQUIRED_FIELD", "Step missing required field: step_type")
        }
    }

    // Check each connection has required fields
    for (conn in connections) {
        if (conn !is Map<*, *>) {
            return ValidationResult(false, "MISSING_REQUIRED_FIELD", "Invalid connection entry")
        }
        if ("from_step_id" !in conn) {
            return ValidationResult(false, "MISSING_REQUIRED_FIELD", "Connection missing from_step_id")
        }
        if ("to_step_id" !in conn) {
            return ValidationResult(false, "MISSING_REQUIRED_FIELD", "Connection missing to_step_id")
        }
    }

    return null
}

// Semantic checks: graph-level analysis
private fun semanticValidation(workflow: Map<String, Any?>): ValidationResult? {
    @Suppress("UNCHECKED_CAST")
    val steps = workflow["steps"] as List<Map<String, Any?>>
    @Suppress("UNCHECKED_CAST")
    val connections = workflow["connections"] as List<Map<String, Any?>>

    // Duplicate step OIDs
    val oids = mutableSetOf<String>()
    for (step in steps) {
        val oid = step["oid"] as String
        if (oid in oids) {
            return ValidationResult(false, "DUPLICATE_STEP_OID", "Duplicate step OID: $oid")
        }
        oids.add(oid)
    }

    // Count START and END steps
    var startCount = 0
    var endCount = 0
    for (step in steps) {
        val st = normalizeStepType(step["step_type"] as String)
        if (st == "START") startCount++
        if (st == "END") endCount++
    }

    if (startCount == 0) {
        return ValidationResult(false, "NO_START_STEP", "No START step found")
    }
    if (startCount > 1) {
        return ValidationResult(false, "MULTIPLE_START_STEPS", "Multiple START steps found")
    }
    if (endCount == 0) {
        return ValidationResult(false, "NO_END_STEP", "No END step found")
    }

    // Dangling connections (reference non-existent step)
    for (conn in connections) {
        val from = conn["from_step_id"] as String
        val to = conn["to_step_id"] as String
        if (from !in oids) {
            return ValidationResult(false, "DANGLING_CONNECTION", "Connection references non-existent step: $from")
        }
        if (to !in oids) {
            return ValidationResult(false, "DANGLING_CONNECTION", "Connection references non-existent step: $to")
        }
    }

    // Self-referencing connections
    for (conn in connections) {
        if (conn["from_step_id"] == conn["to_step_id"]) {
            return ValidationResult(false, "SELF_REFERENCING_CONNECTION", "Self-referencing connection on step: ${conn["from_step_id"]}")
        }
    }

    // Orphaned steps (not reachable from START via BFS)
    val startOid = steps.first { normalizeStepType(it["step_type"] as String) == "START" }["oid"] as String
    val reachable = mutableSetOf(startOid)
    val queue = ArrayDeque<String>()
    queue.add(startOid)
    while (queue.isNotEmpty()) {
        val current = queue.removeFirst()
        for (conn in connections) {
            if (conn["from_step_id"] == current) {
                val to = conn["to_step_id"] as String
                if (to !in reachable) {
                    reachable.add(to)
                    queue.add(to)
                }
            }
        }
    }
    for (step in steps) {
        val oid = step["oid"] as String
        if (oid !in reachable) {
            return ValidationResult(false, "ORPHANED_STEP", "Step $oid is not reachable from START")
        }
    }

    // PARALLEL without matching WAIT ALL
    for (step in steps) {
        val st = normalizeStepType(step["step_type"] as String)
        if (st == "PARALLEL") {
            if (!hasMatchingWaitAll(step["oid"] as String, steps, connections)) {
                return ValidationResult(false, "UNMATCHED_PARALLEL", "PARALLEL step ${step["oid"]} has no matching WAIT ALL")
            }
        }
    }

    return null
}

private fun hasMatchingWaitAll(
    parallelOid: String,
    steps: List<Map<String, Any?>>,
    connections: List<Map<String, Any?>>,
): Boolean {
    val stepMap = mutableMapOf<String, String>()
    for (s in steps) {
        stepMap[s["oid"] as String] = normalizeStepType(s["step_type"] as String)
    }

    val visited = mutableSetOf<String>()
    val queue = ArrayDeque<String>()
    for (conn in connections) {
        if (conn["from_step_id"] == parallelOid) {
            queue.add(conn["to_step_id"] as String)
        }
    }

    while (queue.isNotEmpty()) {
        val oid = queue.removeFirst()
        if (oid in visited) continue
        visited.add(oid)
        val type = stepMap[oid]
        if (type == "WAIT ALL") return true
        if (type == "END") continue
        for (conn in connections) {
            if (conn["from_step_id"] == oid) {
                queue.add(conn["to_step_id"] as String)
            }
        }
    }
    return false
}

private val VALID_STEP_TYPES = setOf(
    "START", "END", "PARALLEL", "WAIT ALL", "WAIT ANY",
    "SELECT 1", "SELECT_1", "SCRIPT", "MATH",
    "USER_INTERACTION", "YES_NO", "WORKFLOW PROXY",
    "WAIT ACTION PROXY", "ACTION PROXY",
)

private val VALID_FORM_ELEMENT_TYPES = setOf(
    "button", "text", "header", "textInput", "textarea",
    "image", "video", "checkbox", "radio", "divider", "timer",
)

private fun structuralValidation(workflow: Map<String, Any?>): ValidationResult? {
    @Suppress("UNCHECKED_CAST")
    val steps = workflow["steps"] as? List<Map<String, Any?>> ?: return null

    for (step in steps) {
        val stepType = step["step_type"] as? String ?: continue
        if (stepType !in VALID_STEP_TYPES) {
            return ValidationResult(false, "INVALID_STEP_TYPE", "Invalid step type: $stepType")
        }

        val formConfig = step["form_layout_config"]
        if (formConfig != null) {
            val elements = extractFormElements(formConfig)
            for (el in elements) {
                @Suppress("UNCHECKED_CAST")
                val elMap = el as? Map<String, Any?> ?: continue
                val type = elMap["type"] as? String
                if (type != null && type !in VALID_FORM_ELEMENT_TYPES) {
                    return ValidationResult(false, "INVALID_FORM_ELEMENT_TYPE", "Invalid form element type: $type")
                }
            }
        }
    }
    return null
}

@Suppress("UNCHECKED_CAST")
private fun extractFormElements(config: Any?): List<Any> {
    if (config is List<*>) {
        val first = (config as? List<Map<String, Any?>>)?.firstOrNull() ?: return emptyList()
        return (first["elements"] as? List<Any>) ?: emptyList()
    }
    if (config is Map<*, *>) {
        return ((config as Map<String, Any?>)["elements"] as? List<Any>) ?: emptyList()
    }
    return emptyList()
}

private fun resourceValidation(workflow: Map<String, Any?>): ValidationResult? {
    // (sourceOid → Map<resourceName, resource_type>) across the whole tree.
    // An empty inner map records that the source oid IS known (workflow or env)
    // even when it owns no resources, letting us distinguish "unknown source"
    // from "known source missing this resource name".
    val ownedResources = mutableMapOf<String, MutableMap<String, String>>()

    fun recordOwner(sourceOid: String?, name: String?, type: String?) {
        if (sourceOid == null) return
        val owned = ownedResources.getOrPut(sourceOid) { mutableMapOf() }
        if (name != null && type != null && name !in owned) owned[name] = type
    }

    fun gatherOwners(spec: Map<String, Any?>?) {
        if (spec == null) return
        val specOid = spec["oid"] as? String
        if (specOid != null) recordOwner(specOid, null, null)

        @Suppress("UNCHECKED_CAST")
        val wfResources = spec["resource_property_specifications"] as? List<Map<String, Any?>>
        if (wfResources != null) {
            for (r in wfResources) {
                if (r["scope"] == "environment") continue
                recordOwner(specOid, r["name"] as? String, r["resource_type"] as? String)
            }
        }

        @Suppress("UNCHECKED_CAST")
        val envSpecs = spec["environment_specifications"] as? List<Map<String, Any?>>
        if (envSpecs != null) {
            for (env in envSpecs) {
                val envOid = env["oid"] as? String
                if (envOid != null) recordOwner(envOid, null, null)
                @Suppress("UNCHECKED_CAST")
                val envResources = env["resource_property_specifications"] as? List<Map<String, Any?>>
                if (envResources != null) {
                    for (r in envResources) {
                        recordOwner(envOid, r["name"] as? String, r["resource_type"] as? String)
                    }
                }
            }
        }

        @Suppress("UNCHECKED_CAST")
        val childSpecs = (spec["children"] ?: spec["child_workflows"]) as? List<Map<String, Any?>>
        if (childSpecs != null) {
            for (c in childSpecs) gatherOwners(c)
        }
    }

    gatherOwners(workflow)

    val acquireReleaseTypes = setOf("binary exclusive use", "binary shared use with pool limits", "named pool")
    val countableTypes = setOf("countable use with pool limits")
    val syncTypes = setOf("sync")
    val syncCommands = setOf("Send", "Receive", "Synchronize")

    fun validateSpecSteps(spec: Map<String, Any?>): ValidationResult? {
        val specOid = spec["oid"] as? String
        @Suppress("UNCHECKED_CAST")
        val steps = spec["steps"] as? List<Map<String, Any?>>
        if (steps != null) {
            for (step in steps) {
                @Suppress("UNCHECKED_CAST")
                val cmds = step["resource_command_specifications"] as? List<Map<String, Any?>> ?: continue
                if (cmds.isEmpty()) continue

                var syncCount = 0
                val stepLabel = (step["local_id"] as? String) ?: (step["oid"] as? String) ?: "<unknown>"

                for (cmd in cmds) {
                    val commandType = cmd["command_type"] as String
                    val resourceName = cmd["resource_name"] as String
                    val sourceOid = (cmd["resource_source_oid"] as? String) ?: specOid

                    val ownedByThisSource = sourceOid?.let { ownedResources[it] }
                    val resType = ownedByThisSource?.get(resourceName)

                    if (resType == null) {
                        if (ownedByThisSource == null) {
                            return ValidationResult(
                                false,
                                "INVALID_RESOURCE_COMMAND",
                                "Step \"$stepLabel\" command \"$commandType\": resource_source_oid \"${sourceOid ?: "(none)"}\" does not match any workflow or environment in this package",
                            )
                        }
                        return ValidationResult(
                            false,
                            "INVALID_RESOURCE_COMMAND",
                            "Resource command references unknown resource: \"$resourceName\"",
                        )
                    }

                    if (commandType == "Acquire" || commandType == "Release") {
                        if (resType !in acquireReleaseTypes) {
                            return ValidationResult(false, "INVALID_RESOURCE_COMMAND", "$commandType not compatible with resource type \"$resType\"")
                        }
                    } else if (commandType == "Acquire Pool Amount" || commandType == "Release Pool Amount") {
                        if (resType !in countableTypes) {
                            return ValidationResult(false, "INVALID_RESOURCE_COMMAND", "$commandType not compatible with resource type \"$resType\"")
                        }
                        val amount = (cmd["amount"] as? Number)?.toDouble()
                        if (amount == null || amount <= 0) {
                            return ValidationResult(false, "INVALID_RESOURCE_COMMAND", "$commandType requires amount > 0")
                        }
                    } else if (commandType in syncCommands) {
                        if (resType !in syncTypes) {
                            return ValidationResult(false, "INVALID_RESOURCE_COMMAND", "$commandType not compatible with resource type \"$resType\"")
                        }
                        syncCount++
                    }
                }

                if (syncCount > 1) {
                    return ValidationResult(false, "INVALID_RESOURCE_COMMAND", "Step \"${step["oid"]}\" has $syncCount sync commands (max 1)")
                }
            }
        }

        @Suppress("UNCHECKED_CAST")
        val childSpecs = (spec["children"] ?: spec["child_workflows"]) as? List<Map<String, Any?>>
        if (childSpecs != null) {
            for (c in childSpecs) {
                val err = validateSpecSteps(c)
                if (err != null) return err
            }
        }
        return null
    }

    val stepError = validateSpecSteps(workflow)
    if (stepError != null) return stepError

    fun validateSpecResourceShape(spec: Map<String, Any?>): ValidationResult? {
        @Suppress("UNCHECKED_CAST")
        val resourceSpecs = spec["resource_property_specifications"] as? List<Map<String, Any?>>
        if (resourceSpecs != null) {
            for (rspec in resourceSpecs) {
                if (rspec["resource_type"] == "named pool") {
                    @Suppress("UNCHECKED_CAST")
                    val names = rspec["names"] as? List<String>
                    if (names == null || names.isEmpty()) {
                        return ValidationResult(false, "INVALID_RESOURCE_SPEC", "Named pool \"${rspec["name"]}\" must have a non-empty names array")
                    }
                }
                if (rspec["resource_type"] == "binary shared use with pool limits" || rspec["resource_type"] == "countable use with pool limits") {
                    val limit = (rspec["use_limit"] as? Number)?.toDouble()
                    if (limit == null || limit <= 0) {
                        return ValidationResult(false, "INVALID_RESOURCE_SPEC", "Resource \"${rspec["name"]}\" requires use_limit > 0")
                    }
                }
            }
        }
        @Suppress("UNCHECKED_CAST")
        val childSpecs = (spec["children"] ?: spec["child_workflows"]) as? List<Map<String, Any?>>
        if (childSpecs != null) {
            for (c in childSpecs) {
                val err = validateSpecResourceShape(c)
                if (err != null) return err
            }
        }
        return null
    }

    return validateSpecResourceShape(workflow)
}

@Suppress("UNCHECKED_CAST")
private fun actionProxyValidation(workflow: Map<String, Any?>): ValidationResult? {
    val steps = workflow["steps"] as? List<Map<String, Any?>> ?: return null
    val envSpecs = workflow["environment_specifications"] as? List<Map<String, Any?>> ?: emptyList()

    val envActions = mutableMapOf<String, Set<String>>()
    for (env in envSpecs) {
        val envOid = env["oid"] as? String ?: continue
        val included = env["included_actions"] as? List<Map<String, Any?>> ?: emptyList()
        envActions[envOid] = included.mapNotNull { it["action_oid"] as? String }.toSet()
    }

    for (step in steps) {
        val stepType = step["step_type"] as? String ?: continue
        if (stepType != "ACTION PROXY") continue

        val stepOid = step["oid"] as? String ?: "<unknown>"
        val config = step["action_proxy_config"] as? Map<String, Any?>
        if (config == null) {
            return ValidationResult(false, "INVALID_VALIDATION", "ACTION PROXY step $stepOid missing action_proxy_config")
        }

        val envOid = config["environment_oid"] as? String
        val actionOid = config["action_oid"] as? String
        if (envOid == null || actionOid == null) {
            return ValidationResult(false, "INVALID_VALIDATION", "ACTION PROXY step $stepOid action_proxy_config missing required field")
        }

        if (envOid !in envActions) {
            return ValidationResult(false, "INVALID_VALIDATION", "ACTION PROXY step $stepOid references unknown environment_oid $envOid")
        }
        val actions = envActions[envOid]!!
        if (actionOid !in actions) {
            return ValidationResult(false, "INVALID_VALIDATION", "ACTION PROXY step $stepOid action_oid $actionOid not in environment $envOid")
        }
    }
    return null
}

fun validate(workflow: Map<String, Any?>): ValidationResult {
    // Phase 0: Pre-structural (missing required fields on steps/connections)
    preStructuralChecks(workflow)?.let { return it }

    // Phase A: Semantic checks (graph analysis)
    semanticValidation(workflow)?.let { return it }

    // Phase A2: Resource command validation
    resourceValidation(workflow)?.let { return it }

    // Phase B: Structural validation (step types and form elements)
    structuralValidation(workflow)?.let { return it }

    // Phase C: ACTION PROXY config validation (§14.2 rules)
    actionProxyValidation(workflow)?.let { return it }

    return ValidationResult(valid = true)
}
