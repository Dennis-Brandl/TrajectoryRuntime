// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
package com.trajectoryruntime.engine

import kotlin.random.Random
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

class WorkflowEngine(
    private val workflow: MasterWorkflowSpecification,
    setup: TestFixtureSetup? = null,
    resourceManager: ResourceManager? = null,
    private val allowScriptExecution: Boolean = false,
) {
    private val steps = mutableMapOf<String, StepInstance>()
    private val stepDefinitionOrder = mutableListOf<String>()
    private val connections: List<WorkflowConnection> = workflow.connections
    private val propertyStore = PropertyStore()
    private val trace = mutableListOf<TraceEntry>()
    private var traceOrder = 0
    private var workflowState = WorkflowState.IDLE
    private val pendingUserSteps = mutableSetOf<String>()
    private val waitAllTracking = mutableMapOf<String, WaitAllTracker>()
    private val routingContext = mutableMapOf<String, RoutingResult>()
    private val completionQueue = ArrayDeque<String>()

    // Resource management fields
    private var resourceManager: ResourceManager? = resourceManager
    private val pendingResources = mutableMapOf<String, PendingResourceState>()
    private val stepParameterSnapshots = mutableMapOf<String, StepParameterSnapshot>()
    private val instanceId: String = "wf-${Random.nextLong()}-${Random.nextInt(1000000)}"

    private val activeCatches = mutableMapOf<String, CatchContext>()

    // Child workflow support
    private val childWorkflows = mutableMapOf<String, MasterWorkflowSpecification>()  // local_id -> spec
    private val activeChildEngines = mutableMapOf<String, WorkflowEngine>()  // parent step OID -> child engine

    // ACTION PROXY support
    private var actionInvoker: ActionInvoker? = null
    private var serverByEnvOid: Map<String, ActionServerSpecification> = emptyMap()
    private var pollIntervalMs: Long = 4000
    private val actionInstanceIdByStep = mutableMapOf<String, String>()
    private val activeActionProxyServers = mutableMapOf<String, String>()
    private val connectivityListeners = mutableListOf<(String, String) -> Unit>()

    private data class WaitAllTracker(
        val expected: Set<String>,
        val completed: MutableSet<String>,
    )

    fun setActionInvoker(invoker: ActionInvoker, servers: Map<String, ActionServerSpecification>) {
        actionInvoker = invoker
        serverByEnvOid = servers
    }

    fun setActionInvokerOptions(pollMs: Long) {
        pollIntervalMs = pollMs
    }

    fun subscribeConnectivity(fn: (String, String) -> Unit): () -> Unit {
        connectivityListeners.add(fn)
        return { connectivityListeners.remove(fn) }
    }

    init {
        // Initialize steps
        for (step in workflow.steps) {
            val normalized = StepInstance(
                oid = step.oid,
                stepType = canonicalStepType(step.step_type),
                state = StepState.IDLE,
                step = step,
            )
            steps[step.oid] = normalized
            stepDefinitionOrder.add(step.oid)
        }

        // Initialize property store
        propertyStore.initializeFromWorkflow(workflow)
        setup?.initial_properties?.let { propertyStore.initializeFromSetup(it) }

        // Initialize starting parameters
        propertyStore.initializeStartingParameters(
            workflow.starting_parameter_specifications,
            setup?.starting_parameters,
        )

        // Index child workflows by local_id
        workflow.children?.forEach { cw ->
            childWorkflows[cw.local_id] = cw.toSpec()
        }

        // Validate: action local_ids unique across environments
        val seenActionLocalIds = mutableMapOf<String, String>()
        for (env in workflow.environment_specifications ?: emptyList()) {
            for (a in env.included_actions ?: emptyList()) {
                val lid = (a as? JsonObject)?.get("local_id")?.jsonPrimitive?.content ?: continue
                val prior = seenActionLocalIds[lid]
                if (prior != null) {
                    throw IllegalStateException(
                        "Workflow has duplicate action local_id \"$lid\" in environments \"$prior\" and \"${env.local_id}\""
                    )
                }
                seenActionLocalIds[lid] = env.local_id
            }
        }
    }

    fun start() {
        workflowState = WorkflowState.RUNNING

        // Auto-create resource manager if workflow uses resources
        if (resourceManager == null) {
            val hasResourceSpecs = !workflow.resource_property_specifications.isNullOrEmpty()
            val hasResourceCmds = workflow.steps.any { !it.resource_command_specifications.isNullOrEmpty() }
            val hasEnvResources = workflow.environment_specifications?.any {
                !it.resource_property_specifications.isNullOrEmpty()
            } == true
            if (hasResourceSpecs || hasResourceCmds || hasEnvResources) {
                resourceManager = InMemoryResourceManager()
            }
        }

        // Register workflow-scoped resources
        val mgr = resourceManager
        if (mgr != null && workflow.resource_property_specifications != null) {
            for (spec in workflow.resource_property_specifications!!) {
                if (spec.scope != "environment") {
                    mgr.registerResource(spec, instanceId, "workflow")
                }
            }
        }

        // Register environment-scoped resources (using environment OID as ownerId)
        if (mgr != null && workflow.environment_specifications != null) {
            for (envSpec in workflow.environment_specifications!!) {
                for (spec in envSpec.resource_property_specifications ?: emptyList()) {
                    mgr.registerResource(spec, envSpec.oid, "environment")
                }
            }
        }

        // Find START step
        val startStep = steps.values.firstOrNull { it.stepType == "START" }
            ?: throw IllegalStateException("No START step found")

        // START auto-completes immediately
        recordTrace(startStep.oid, "COMPLETED")
        startStep.state = StepState.COMPLETED
        completionQueue.addLast(startStep.oid)
        drainCompletionQueue()
    }

    fun hasStep(stepOid: String): Boolean {
        if (steps.containsKey(stepOid)) return true
        for (childEngine in activeChildEngines.values) {
            if (childEngine.hasStep(stepOid)) return true
        }
        return false
    }

    fun submitAction(action: UserAction, actionIndex: Int) {
        // Check if action is for a child engine
        for ((parentOid, childEngine) in activeChildEngines) {
            if (childEngine.hasStep(action.step_oid)) {
                childEngine.submitAction(action, actionIndex)
                // Child may have released resources — flush grants at parent level
                resumeGrantedSteps()
                if (childEngine.getWorkflowState() == WorkflowState.COMPLETED) {
                    completeChildWorkflow(parentOid, childEngine)
                }
                return
            }
        }

        if (action.action == "pause") {
            val step = steps[action.step_oid] ?: return
            if (step.state == StepState.EXECUTING) {
                step.state = StepState.PAUSED
                recordTrace(step.oid, "PAUSED")
            }
            return
        }
        if (action.action == "resume") {
            val step = steps[action.step_oid] ?: return
            if (step.state == StepState.PAUSED) {
                step.state = StepState.EXECUTING
                recordTrace(step.oid, "EXECUTING")
            }
            return
        }

        val stepInstance = steps[action.step_oid]
            ?: throw IllegalStateException("Step ${action.step_oid} not found")
        if (stepInstance.state != StepState.EXECUTING) {
            throw IllegalStateException("Step ${action.step_oid} is not EXECUTING")
        }

        if (action.action == "fail") {
            handleStepFailure(stepInstance, action.failure_mode ?: "ERROR", action.error, actionIndex)
            return
        }

        // Handle the action
        val routing = handleUserAction(stepInstance.step, action, propertyStore)

        // Capture output parameters in snapshot
        val snapshot = stepParameterSnapshots[stepInstance.oid]
        if (snapshot != null && stepInstance.step.output_parameter_specifications != null) {
            for (spec in stepInstance.step.output_parameter_specifications!!) {
                val key = spec.target ?: spec.id
                val value = propertyStore.get(key)
                if (value != null) {
                    snapshot.outputParameters[key] = value
                }
            }
        }

        // Complete the step
        recordTrace(stepInstance.oid, "COMPLETED", actionIndex)
        stepInstance.state = StepState.COMPLETED
        pendingUserSteps.remove(stepInstance.oid)

        // Store routing context
        if (routing.conditionValue != null || routing.connectionId != null) {
            routingContext[stepInstance.oid] = routing
        }

        completionQueue.addLast(stepInstance.oid)
        drainCompletionQueue()
    }

    fun getTrace(): List<TraceEntry> = trace.toList()

    fun getWorkflowState(): WorkflowState = workflowState

    fun getProperties(): Map<String, String> = propertyStore.toFlatMap()

    /** Return the deepest active child spec, or this workflow's spec if no child is active. */
    fun getActiveSpec(): MasterWorkflowSpecification {
        for (childEngine in activeChildEngines.values) {
            return childEngine.getActiveSpec()
        }
        return workflow
    }

    fun getResourceSnapshot(): List<ResourceSnapshotEntry> {
        return resourceManager?.getSnapshot() ?: emptyList()
    }

    /** Snapshot of env-scoped resources visible to this engine. */
    fun getEnvironmentResourceSnapshot(): List<ResourceSnapshotEntry> {
        return getResourceSnapshot().filter { it.scope == "environment" }
    }

    /** Snapshot of workflow-scoped resources visible to this engine (master + descendants). */
    fun getWorkflowResourceSnapshot(): List<ResourceSnapshotEntry> {
        return getResourceSnapshot().filter { it.scope == "workflow" }
    }

    fun releaseAllEnvironmentResources(): List<String> {
        val mgr = resourceManager ?: return emptyList()
        val keys = getEnvironmentResourceSnapshot().map { it.name }.toSet()
        return if (keys.isEmpty()) emptyList() else mgr.resetResources(keys)
    }

    fun releaseAllWorkflowResources(): List<String> {
        val mgr = resourceManager ?: return emptyList()
        val keys = getWorkflowResourceSnapshot().map { it.name }.toSet()
        return if (keys.isEmpty()) emptyList() else mgr.resetResources(keys)
    }

    /** Reset a single resource by composite resourceKey. */
    fun resetResource(resourceKey: String): Boolean {
        val mgr = resourceManager ?: return false
        if (!mgr.hasResource(resourceKey)) return false
        mgr.resetResources(setOf(resourceKey))
        return true
    }

    /** Cancel any queued waiters from this workflow instance. Per the resource model
     *  the engine does NOT track who holds what — the workflow author is responsible
     *  for releasing pool state via Release commands. This call only cleans up queue
     *  entries so they can't be granted spuriously after abort. */
    fun releaseAllResources() {
        val mgr = resourceManager ?: return
        val known = mutableSetOf<String>()
        collectKnownStepOids(known)
        mgr.cancelQueuedWaiters(known)
        mgr.flushGranted(known)
    }

    /** Check for pending resource grants from a shared resource manager and resume any unblocked steps.
     *  Returns true if any steps were resumed. Called for cross-workflow sync. */
    fun pumpSharedResources(): Boolean {
        val mgr = resourceManager ?: return false
        val knownOids = mutableSetOf<String>()
        collectKnownStepOids(knownOids)
        val granted = mgr.flushGranted(knownOids)
        if (granted.isEmpty()) return false
        processGrantedSteps(granted)
        return true
    }

    fun getActiveSteps(): List<ActiveStepInfo> {
        val result = mutableListOf<ActiveStepInfo>()
        for (step in steps.values) {
            if (step.state !in ACTIVE_STEP_STATES) continue
            if (step.stepType == "WAIT ALL") continue
            // Skip steps that have active child engines (child handles UI)
            if (activeChildEngines.containsKey(step.oid)) continue

            val info = ActiveStepInfo(
                step = step,
                workflowName = workflow.local_id,
                waitingOn = if (step.state == StepState.WAITING) {
                    val pending = pendingResources[step.oid]
                    WaitingOnInfo(
                        resourceName = pending?.blockedOn?.resource_name ?: "unknown",
                        commandType = pending?.blockedOn?.command_type ?: "Acquire",
                    )
                } else null,
            )
            result.add(info)
        }
        // Include active steps from child engines
        for (childEngine in activeChildEngines.values) {
            result.addAll(childEngine.getActiveSteps())
        }
        return result
    }

    fun getAllProperties(): Map<String, String> {
        val props = propertyStore.toFlatMap().toMutableMap()
        for (childEngine in activeChildEngines.values) {
            props.putAll(childEngine.getAllProperties())
        }
        return props
    }

    fun getActiveInputParameters(): Map<String, String> {
        for (childEngine in activeChildEngines.values) {
            val childParams = childEngine.getActiveInputParameters()
            if (childParams.isNotEmpty()) return childParams
        }
        return propertyStore.getInputParameters()
    }

    fun getStepParameterSnapshots(): Map<String, StepParameterSnapshot> {
        val result = stepParameterSnapshots.toMutableMap()
        for (childEngine in activeChildEngines.values) {
            result.putAll(childEngine.getStepParameterSnapshots())
        }
        return result
    }

    private fun recordTrace(stepOid: String, state: String, afterAction: Int? = null, error: String? = null) {
        traceOrder++
        val entry = TraceEntry(
            step_oid = stepOid,
            state = state,
            order = traceOrder,
            after_action = afterAction,
            error = error,
        )
        trace.add(entry)
    }

    private fun drainCompletionQueue() {
        while (completionQueue.isNotEmpty()) {
            val stepOid = completionQueue.removeFirst()

            processReleaseCommands(stepOid)
            resumeGrantedSteps()

            val outgoing = getRoutedConnections(stepOid)

            for (conn in outgoing) {
                val targetOid = conn.to_step_id
                val target = steps[targetOid] ?: continue

                if (target.stepType == "WAIT ALL") {
                    handleWaitAllArrival(target, stepOid)
                } else {
                    activateStep(target)
                }
            }
        }

        activatePendingWaitAlls()
        checkWorkflowCompletion()
    }

    private fun activateStep(target: StepInstance) {
        // Allow cycle re-entry: reset COMPLETED steps back to IDLE
        if (target.state == StepState.COMPLETED) {
            target.state = StepState.IDLE
            routingContext.remove(target.oid)
            pendingResources.remove(target.oid)
        }

        if (target.state != StepState.IDLE) return

        // Process resource activation commands first (may block and enter WAITING)
        if (!processResourceCommands(target)) {
            return // step is WAITING on resources
        }

        activateStepAfterResources(target)
    }

    private fun activateStepAfterResources(target: StepInstance) {
        // Resolve input parameters AFTER resources are granted, so params can reference
        // acquired resource names (via target property) and sync-received data
        propertyStore.resolveInputParameters(target.step.input_parameter_specifications)

        // Capture parameter snapshot for UI integration
        stepParameterSnapshots[target.oid] = StepParameterSnapshot(
            inputParameters = propertyStore.getInputParameters().toMap(),
            outputParameters = mutableMapOf(),
            description = target.step.description ?: target.stepType,
            label = target.step.local_id,
            stepType = target.stepType,
        )

        if (target.stepType == "ACTION PROXY") {
            activateActionProxy(target)
            return
        }

        if (target.stepType == "WORKFLOW PROXY") {
            activateWorkflowProxy(target)
            return
        }

        if (target.stepType == "RETURN") {
            recordTrace(target.oid, "COMPLETED")
            target.state = StepState.COMPLETED
            dispatchReturn(target)
            return // RETURN's command is terminal/redirective — do not fall through.
        }

        if (isAutoCompleting(target.stepType)) {
            if (target.stepType == "SELECT 1" || target.stepType == "SELECT_1") {
                val routing = handleSelect1(target.step, propertyStore)
                if (routing.connectionId != null) {
                    routingContext[target.oid] = routing
                }
            }

            if (target.stepType == "SCRIPT") {
                // B4: SCRIPT runs author-supplied code; disabled unless the user opts
                // in for a trusted package (untrusted-content safe default).
                if (target.step.script_config?.source != null && !allowScriptExecution) {
                    recordTrace(
                        target.oid,
                        "ERRORED",
                        error = "SCRIPT execution is disabled — enable it only for trusted packages",
                    )
                    target.state = StepState.ERRORED
                    workflowState = WorkflowState.ERRORED
                    val known = mutableSetOf<String>()
                    collectKnownStepOids(known)
                    resourceManager?.cancelQueuedWaiters(known)
                    return
                }
                val inputParams = propertyStore.getInputParameters().toMutableMap()
                target.step.input_parameter_specifications?.forEach { spec ->
                    if (spec.id !in inputParams) {
                        val resolved = when (spec.value_type) {
                            "property" -> propertyStore.get(spec.default_value) ?: ""
                            else -> spec.default_value
                        }
                        inputParams[spec.id] = resolved
                    }
                }
                val result = executeScript(target.step, propertyStore, inputParams)
                if (!result.success) {
                    recordTrace(target.oid, "ERRORED", error = result.error)
                    target.state = StepState.ERRORED
                    workflowState = WorkflowState.ERRORED
                    val known = mutableSetOf<String>()
                    collectKnownStepOids(known)
                    resourceManager?.cancelQueuedWaiters(known)
                    return
                }
            }

            if (target.stepType == "CATCH") {
                activeCatches[target.oid]?.let { activateCatchStep(target.step, it, propertyStore) }
            }

            recordTrace(target.oid, "COMPLETED")
            target.state = StepState.COMPLETED
            completionQueue.addLast(target.oid)
        } else if (needsUserAction(target.stepType)) {
            recordTrace(target.oid, "EXECUTING")
            target.state = StepState.EXECUTING
            pendingUserSteps.add(target.oid)
        }
    }

    // ── Child Workflow Support ──

    private fun activateWorkflowProxy(target: StepInstance) {
        val childSpec = childWorkflows[target.step.local_id]
        if (childSpec == null) {
            // No child workflow found -- auto-complete as no-op
            recordTrace(target.oid, "COMPLETED")
            target.state = StepState.COMPLETED
            completionQueue.addLast(target.oid)
            return
        }

        // Resolve parent step's input params -> child's starting params
        val startingParams = mutableMapOf<String, String>()
        if (target.step.input_parameter_specifications != null && childSpec.starting_parameter_specifications != null) {
            for (childParam in childSpec.starting_parameter_specifications!!) {
                val parentParam = target.step.input_parameter_specifications!!.find { it.id == childParam.id }
                if (parentParam != null) {
                    var value = parentParam.default_value
                    if (parentParam.value_type == "property") {
                        value = propertyStore.get(parentParam.default_value) ?: ""
                    }
                    startingParams[childParam.id] = value
                }
            }
        }

        // Share parent's properties with child
        val initialProperties = propertyStore.toFlatMap()

        // Create and start child engine (shares resourceManager)
        val childEngine = WorkflowEngine(childSpec, TestFixtureSetup(
            starting_parameters = startingParams,
            initial_properties = initialProperties,
        ), resourceManager, allowScriptExecution)

        // Mark parent step as EXECUTING
        recordTrace(target.oid, "EXECUTING")
        target.state = StepState.EXECUTING

        childEngine.start()

        if (childEngine.getWorkflowState() == WorkflowState.COMPLETED) {
            // Child auto-completed (no user steps)
            completeChildWorkflow(target.oid, childEngine)
        } else {
            // Child needs user interaction -- store it
            activeChildEngines[target.oid] = childEngine
        }
    }

    private fun completeChildWorkflow(parentStepOid: String, childEngine: WorkflowEngine) {
        activeChildEngines.remove(parentStepOid)

        val parentStep = steps[parentStepOid] ?: return

        // Map child output params -> parent step output params -> property store
        val childSpec = childWorkflows[parentStep.step.local_id]
        if (childSpec?.output_parameter_specifications != null && parentStep.step.output_parameter_specifications != null) {
            val childProps = childEngine.getProperties()
            for (childOutParam in childSpec.output_parameter_specifications!!) {
                val parentOutParam = parentStep.step.output_parameter_specifications!!.find { it.id == childOutParam.id }
                if (parentOutParam?.target != null) {
                    // Look up by child output's target key (where child stored it)
                    val childKey = childOutParam.target ?: childOutParam.id
                    val value = childProps[childKey] ?: ""
                    propertyStore.set(parentOutParam.target!!, value)
                }
            }
        }

        // Complete the parent step
        recordTrace(parentStepOid, "COMPLETED")
        parentStep.state = StepState.COMPLETED
        completionQueue.addLast(parentStepOid)
        drainCompletionQueue()
    }

    // ── Resource Processing ──

    private fun processResourceCommands(target: StepInstance): Boolean {
        val cmds = target.step.resource_command_specifications
        if (cmds.isNullOrEmpty() || resourceManager == null) return true
        val (activation, completion) = splitResourceCommands(cmds)
        val sorted = sortActivationCommands(activation)
        val sortedCompletion = completion.sortedBy { it.resource_name }
        return executeActivationCommands(target, sorted, sortedCompletion)
    }

    private fun executeActivationCommands(
        target: StepInstance,
        remaining: List<ResourceCommandSpecification>,
        completionCommands: List<ResourceCommandSpecification>,
    ): Boolean {
        val mgr = resourceManager!!
        val requesterId = "$instanceId:${target.oid}"

        for (i in remaining.indices) {
            val cmd = remaining[i]
            var blocked = false

            when (cmd.command_type) {
                "Acquire", "Acquire Pool Amount" -> {
                    val result = if (cmd.command_type == "Acquire Pool Amount") {
                        mgr.acquireAmount(cmd.resource_name, requesterId, cmd.amount ?: 0.0)
                    } else {
                        mgr.acquire(cmd.resource_name, requesterId)
                    }
                    if (!result.granted) {
                        blocked = true
                    } else if (result.name != null && cmd.target != null) {
                        propertyStore.set(cmd.target!!, result.name)
                    }
                }
                "Send" -> {
                    // resolveKey falls back to JSON-serialized group entries when the source
                    // names a parent property (e.g. "TransferData" with TransferData.Name,
                    // TransferData.Address, ...). Plain get() only does exact-match lookup.
                    val data = if (cmd.source != null) propertyStore.resolveKey(cmd.source!!) else ""
                    val result = mgr.send(cmd.resource_name, requesterId, data)
                    if (!result.ready) {
                        blocked = true
                    }
                }
                "Receive" -> {
                    val result = mgr.receive(cmd.resource_name, requesterId)
                    if (!result.available) {
                        blocked = true
                    } else if (cmd.target != null) {
                        propertyStore.setSyncTarget(cmd.target!!, result.data)
                    }
                }
                "Synchronize" -> {
                    val result = mgr.synchronize(cmd.resource_name, requesterId)
                    if (!result.ready) {
                        blocked = true
                    }
                }
            }

            if (blocked) {
                pendingResources[target.oid] = PendingResourceState(
                    stepOid = target.oid,
                    blockedOn = BlockedOnInfo(cmd.resource_name, cmd.command_type),
                    remainingCommands = remaining.drop(i + 1),
                    completionCommands = completionCommands,
                )
                recordTrace(target.oid, "WAITING")
                target.state = StepState.WAITING
                return false
            }
        }

        if (completionCommands.isNotEmpty()) {
            pendingResources[target.oid] = PendingResourceState(
                stepOid = target.oid,
                remainingCommands = emptyList(),
                completionCommands = completionCommands,
            )
        }
        return true
    }

    private fun processReleaseCommands(stepOid: String) {
        val pending = pendingResources[stepOid] ?: return
        if (pending.completionCommands.isEmpty() || resourceManager == null) return
        val mgr = resourceManager!!
        val sorted = pending.completionCommands.sortedBy { it.resource_name }

        for (cmd in sorted) {
            when (cmd.command_type) {
                "Release" -> {
                    // For named pools, the workflow author specifies cmd.target — the
                    // property holding the assigned name to return. The manager has no
                    // holder tracking, so the author is responsible for releasing the
                    // right name.
                    val name = cmd.target?.let { propertyStore.get(it) }
                    val released = if (name != null) {
                        mgr.releaseNamed(cmd.resource_name, name)
                    } else {
                        mgr.release(cmd.resource_name)
                    }
                    if (!released) {
                        recordTrace(stepOid, "RELEASE_NO_OP",
                            error = "Release of \"${cmd.resource_name}\" had no effect")
                    }
                }
                "Release Pool Amount" -> {
                    mgr.releaseAmount(cmd.resource_name, cmd.amount ?: 0.0)
                }
            }
        }
        pendingResources.remove(stepOid)
    }

    /** Collect all step OIDs known to this engine and its children. */
    private fun collectKnownStepOids(out: MutableSet<String>) {
        out.addAll(steps.keys)
        for (child in activeChildEngines.values) {
            child.collectKnownStepOids(out)
        }
    }

    /** Find a step by OID in this engine or any child engine. */
    private fun findStepInTree(stepOid: String): StepInstance? {
        val local = steps[stepOid]
        if (local != null) return local
        for (child in activeChildEngines.values) {
            val found = child.findStepInTree(stepOid)
            if (found != null) return found
        }
        return null
    }

    /** Find pending resource state in child engines. */
    private fun findPendingInChildren(stepOid: String): PendingResourceState? {
        for (child in activeChildEngines.values) {
            val pending = child.pendingResources[stepOid]
            if (pending != null) return pending
        }
        return null
    }

    /** Activate a step in this engine or find the owning child engine. */
    private fun activateStepInTree(step: StepInstance) {
        if (steps.containsKey(step.oid)) {
            activateStepAfterResources(step)
            return
        }
        for (child in activeChildEngines.values) {
            child.activateStepInTree(step)
        }
    }

    private fun resumeGrantedSteps() {
        val mgr = resourceManager ?: return
        // Filter by this engine's known step OIDs so cross-workflow grants
        // (e.g. a sibling's Receive step waiting on our Send) stay in the
        // shared queue for the sibling's pumpSharedResources() to pick up.
        val knownOids = mutableSetOf<String>()
        collectKnownStepOids(knownOids)
        val granted = mgr.flushGranted(knownOids)
        processGrantedSteps(granted)
    }

    private fun processGrantedSteps(granted: List<String>) {
        val mgr = resourceManager ?: return

        for (requesterId in granted) {
            val colonIdx = requesterId.lastIndexOf(':')
            if (colonIdx < 0) continue
            val stepOid = requesterId.substring(colonIdx + 1)

            // Search this engine and child engines for the step
            val stepInstance = findStepInTree(stepOid) ?: continue
            if (stepInstance.state != StepState.WAITING) continue

            val pending = pendingResources[stepOid]
                ?: findPendingInChildren(stepOid)
            if (pending == null) {
                stepInstance.state = StepState.IDLE
                // Find the engine that owns this step and activate it there
                activateStepInTree(stepInstance)
                continue
            }

            val syncData = mgr.getSyncData(requesterId)
            if (syncData != null) {
                val receiveCmd = stepInstance.step.resource_command_specifications?.find { it.command_type == "Receive" }
                if (receiveCmd?.target != null) {
                    propertyStore.setSyncTarget(receiveCmd.target!!, syncData)
                }
                mgr.clearSyncData(requesterId)
            }

            // Named-pool name assignment: the manager reserved a name when the pool
            // freed up; write it to the Acquire's cmd.target so downstream commands
            // and the activation can read it.
            val assignedName = mgr.consumePendingNamedAssignment(requesterId)
            if (assignedName != null) {
                val grantedResource = pending.blockedOn?.resource_name
                val acquireCmd = stepInstance.step.resource_command_specifications?.find {
                    (it.command_type == "Acquire" || it.command_type == "Acquire Pool Amount")
                        && it.resource_name == grantedResource
                }
                if (acquireCmd?.target != null) {
                    propertyStore.set(acquireCmd.target!!, assignedName)
                }
            }

            if (pending.remainingCommands.isNotEmpty()) {
                val allGranted = executeActivationCommands(stepInstance, pending.remainingCommands, pending.completionCommands)
                if (!allGranted) continue
            }

            stepInstance.state = StepState.IDLE
            if (pending.completionCommands.isNotEmpty()) {
                pendingResources[stepOid] = PendingResourceState(
                    stepOid = stepOid,
                    remainingCommands = emptyList(),
                    completionCommands = pending.completionCommands,
                )
            } else {
                pendingResources.remove(stepOid)
            }

            activateStepInTree(stepInstance)
        }
    }

    // ── WAIT ALL Handling ──

    private fun handleWaitAllArrival(waitAll: StepInstance, sourceOid: String) {
        if (waitAll.state == StepState.COMPLETED) return // Already done

        if (waitAll.state == StepState.IDLE) {
            // First arrival — check how many branches are already completed
            val expected = getIncomingStepOids(waitAll.oid)
            val completed = mutableSetOf(sourceOid)
            for (oid in expected) {
                if (steps[oid]?.state == StepState.COMPLETED) {
                    completed.add(oid)
                }
            }

            waitAllTracking[waitAll.oid] = WaitAllTracker(expected, completed)

            if (completed.size >= expected.size) {
                // All branches already done — skip EXECUTING, go straight to COMPLETED
                completeWaitAll(waitAll)
            } else {
                // Some branches still pending — enter EXECUTING
                recordTrace(waitAll.oid, "EXECUTING")
                waitAll.state = StepState.EXECUTING
            }
        } else if (waitAll.state == StepState.EXECUTING) {
            // Subsequent arrival
            val tracking = waitAllTracking[waitAll.oid]!!
            tracking.completed.add(sourceOid)

            if (tracking.completed.size >= tracking.expected.size) {
                completeWaitAll(waitAll)
            }
        }
    }

    private fun completeWaitAll(waitAll: StepInstance) {
        recordTrace(waitAll.oid, "COMPLETED")
        waitAll.state = StepState.COMPLETED
        completionQueue.addLast(waitAll.oid)
    }

    private fun activatePendingWaitAlls() {
        // Process in step definition order (inner before outer for nested parallels)
        for (oid in stepDefinitionOrder) {
            val step = steps[oid]!!
            if (step.stepType != "WAIT ALL" || step.state != StepState.IDLE) continue

            // Check if ALL incoming sources are non-IDLE
            val incomingSources = getIncomingStepOids(step.oid)
            if (incomingSources.isEmpty()) continue

            var allActive = true
            for (sourceOid in incomingSources) {
                val source = steps[sourceOid]
                if (source == null || source.state == StepState.IDLE) {
                    allActive = false
                    break
                }
            }

            if (allActive) {
                // Pre-activate: find which branches are already completed
                val completedSources = mutableSetOf<String>()
                for (sourceOid in incomingSources) {
                    val source = steps[sourceOid]
                    if (source != null && source.state == StepState.COMPLETED) {
                        completedSources.add(sourceOid)
                    }
                }

                waitAllTracking[step.oid] = WaitAllTracker(incomingSources, completedSources)

                recordTrace(step.oid, "EXECUTING")
                step.state = StepState.EXECUTING

                // Check if already fully complete
                if (completedSources.size >= incomingSources.size) {
                    completeWaitAll(step)
                }
            }
        }
    }

    // ── Connection Helpers ──

    private fun getIncomingStepOids(targetOid: String): Set<String> {
        val sources = mutableSetOf<String>()
        for (conn in connections) {
            if (conn.to_step_id == targetOid) {
                sources.add(conn.from_step_id)
            }
        }
        return sources
    }

    private fun getRoutedConnections(stepOid: String): List<WorkflowConnection> {
        val all = connections.filter { it.from_step_id == stepOid }
        val routing = routingContext[stepOid] ?: return all

        if (routing.connectionId != null) {
            // SELECT 1: filter by connection_id
            return all.filter { it.connection_id == routing.connectionId }
        }

        if (routing.sourceHandleId != null) {
            // YES_NO: match source_handle_id against button outputValue
            val handle = routing.sourceHandleId
            val matched = all.filter { c ->
                // Direct match: source_handle_id equals the button outputValue
                c.source_handle_id == handle ||
                // Legacy "yes"/"no" handles: map "true"→"yes", "false"→"no"
                (handle == "true" && c.source_handle_id == "yes") ||
                (handle == "false" && c.source_handle_id == "no") ||
                // Condition field match (case-insensitive) for test fixtures
                (c.condition != null && c.condition.lowercase() == handle.lowercase())
            }
            if (matched.isNotEmpty()) return matched
            // Fall through to conditionValue matching below
        }

        if (routing.conditionValue != null) {
            // button_press / YES_NO fallback: filter by condition field
            val v = routing.conditionValue
            val matched = all.filter { c ->
                c.condition == v || c.condition?.lowercase() == v.lowercase()
            }
            return if (matched.isNotEmpty()) matched else all
        }

        return all
    }

    private fun checkWorkflowCompletion() {
        val endCompleted = steps.values.any { it.stepType == "END" && it.state == StepState.COMPLETED }

        if (endCompleted && pendingUserSteps.isEmpty()) {
            val anyBlocking = steps.values.any {
                it.state == StepState.EXECUTING || it.state == StepState.WAITING
            }
            if (!anyBlocking) {
                workflowState = WorkflowState.COMPLETED
            }
        }
    }

    // ── Pause / Resume / Stop / Abort ──

    fun pauseStep(stepOid: String) {
        val step = steps[stepOid]
        if (step != null && step.stepType == "ACTION PROXY") {
            val uri = activeActionProxyServers[stepOid] ?: return
            val id = actionInstanceIdByStep[stepOid] ?: return
            val inv = actionInvoker ?: return
            GlobalScope.launch {
                try { inv.sendCommand(uri, id, ActionServerCommand.PAUSE) } catch (_: Throwable) {}
            }
            return
        }
        if (step != null && step.state == StepState.EXECUTING) {
            step.state = StepState.PAUSED
            recordTrace(stepOid, "PAUSED")
        } else {
            for (child in activeChildEngines.values) {
                child.pauseStep(stepOid)
            }
        }
    }

    fun resumeStep(stepOid: String) {
        val step = steps[stepOid]
        if (step != null && step.stepType == "ACTION PROXY") {
            val uri = activeActionProxyServers[stepOid] ?: return
            val id = actionInstanceIdByStep[stepOid] ?: return
            val inv = actionInvoker ?: return
            GlobalScope.launch {
                try { inv.sendCommand(uri, id, ActionServerCommand.RESUME) } catch (_: Throwable) {}
            }
            return
        }
        if (step != null && step.state == StepState.PAUSED) {
            step.state = StepState.EXECUTING
            recordTrace(stepOid, "EXECUTING")
        } else {
            for (child in activeChildEngines.values) {
                child.resumeStep(stepOid)
            }
        }
    }

    fun stopStep(stepOid: String) {
        val step = steps[stepOid] ?: return
        if (step.stepType != "ACTION PROXY") return
        val uri = activeActionProxyServers[stepOid] ?: return
        val id = actionInstanceIdByStep[stepOid] ?: return
        val inv = actionInvoker ?: return
        GlobalScope.launch {
            try { inv.sendCommand(uri, id, ActionServerCommand.STOP) } catch (_: Throwable) {}
        }
    }

    fun abortWorkflow() {
        val inv = actionInvoker
        for ((stepOid, uri) in activeActionProxyServers) {
            val id = actionInstanceIdByStep[stepOid]
            if (id != null && inv != null) {
                GlobalScope.launch { try { inv.abort(uri, id) } catch (_: Throwable) {} }
            }
            inv?.release(stepOid)
        }
        actionInstanceIdByStep.clear()
        activeActionProxyServers.clear()
        for (child in activeChildEngines.values) child.abortWorkflow()
        workflowState = WorkflowState.ABORTED
    }

    // ── ACTION PROXY ──

    private fun activateActionProxy(target: StepInstance) {
        val invoker = actionInvoker
        if (invoker == null) {
            // Conformance / headless mode: no Action Container. Park the step like a user-action step
            // so submitAction (success or 'fail') can drive it — mirrors the TS engine.
            recordTrace(target.oid, "EXECUTING")
            target.state = StepState.EXECUTING
            pendingUserSteps.add(target.oid)
            return
        }

        val env = findEnvForActionLocalId(target.step.local_id)
        if (env == null) {
            recordTrace(target.oid, "ERRORED",
                error = "No environment contains action local_id \"${target.step.local_id}\"")
            target.state = StepState.ERRORED
            workflowState = WorkflowState.ERRORED
            return
        }

        val server = serverByEnvOid[env.oid]
        if (server == null) {
            recordTrace(target.oid, "ERRORED",
                error = "No action server selected for environment \"${env.local_id}\"")
            target.state = StepState.ERRORED
            workflowState = WorkflowState.ERRORED
            return
        }

        val included = env.included_actions ?: emptyList()
        val match = included.firstOrNull {
            (it as? JsonObject)?.get("local_id")?.jsonPrimitive?.content == target.step.local_id
        } as? JsonObject
        val actionOid = match?.get("oid")?.jsonPrimitive?.content
        if (actionOid == null) {
            recordTrace(target.oid, "ERRORED",
                error = "Environment \"${env.local_id}\" does not include action \"${target.step.local_id}\"")
            target.state = StepState.ERRORED
            workflowState = WorkflowState.ERRORED
            return
        }

        val inputs = stepParameterSnapshots[target.oid]?.inputParameters ?: emptyMap()

        recordTrace(target.oid, "STARTING")
        target.state = StepState.STARTING
        activeActionProxyServers[target.oid] = server.uri.trim()

        val req = InvokeRequestKmp(
            stepOid = target.oid,
            workflowInstanceId = instanceId,
            serverUri = server.uri.trim(),
            actionOid = actionOid,
            inputs = inputs,
            pollIntervalMs = pollIntervalMs,
        )
        val callbacks = object : ActionInvokerCallbacks {
            override fun onStateChange(stepOid: String, newState: StepState, outputs: Map<String, String>?) {
                onExternalStateChange(stepOid, newState, outputs)
            }
            override fun onConnectivityChange(stepOid: String, status: String) {
                connectivityListeners.forEach { it(stepOid, status) }
            }
        }

        GlobalScope.launch {
            try {
                val instId = invoker.invoke(req, callbacks)
                actionInstanceIdByStep[target.oid] = instId
            } catch (e: Throwable) {
                recordTrace(target.oid, "ERRORED", error = e.message ?: "invoke failed")
                steps[target.oid]?.state = StepState.ERRORED
                workflowState = WorkflowState.ERRORED
            }
        }
    }

    private fun findCatchByCatchId(catchId: String): StepInstance? =
        steps.values.firstOrNull { it.stepType == "CATCH" && it.step.catch_id == catchId }

    private fun buildPartition(): CatchNetworkPartition = partitionCatchNetworks(
        steps.values.map { Triple(it.oid, it.stepType, it.step.catch_id) },
        connections.map { it.from_step_id to it.to_step_id },
    )

    private fun handleStepFailure(stepInstance: StepInstance, mode: String, error: String?, actionIndex: Int) {
        val matching = stepInstance.step.try_specifications?.firstOrNull { it.mode == mode }
        val catchStep = matching?.let { findCatchByCatchId(it.catch_id) }
        if (matching != null && catchStep != null) {
            if (activeCatches.containsKey(catchStep.oid)) {
                // CATCH_REENTRY (spec §6.4)
                recordTrace(stepInstance.oid, "ERRORED", actionIndex, "CATCH_REENTRY on ${matching.catch_id}")
                stepInstance.state = StepState.ERRORED
                workflowState = WorkflowState.ABORTED
                return
            }
            activeCatches[catchStep.oid] = CatchContext(
                catch_oid = catchStep.oid,
                trigger_step_oid = stepInstance.oid,
                trigger_step_name = stepInstance.step.local_id,
                trigger_reason = mode,
                error_message = error,
                activated_at = "", // audit-only; conformance is time-free
            )
            recordTrace(stepInstance.oid, "IDLE", actionIndex)
            stepInstance.state = StepState.IDLE
            pendingUserSteps.remove(stepInstance.oid)
            pendingResources.remove(stepInstance.oid) // parity with TS
            activateStep(catchStep)
            drainCompletionQueue()
            return
        }
        // No matching TRY — uncaught failure errors the workflow.
        recordTrace(stepInstance.oid, "ERRORED", actionIndex, error)
        stepInstance.state = StepState.ERRORED
        workflowState = WorkflowState.ERRORED
        pendingUserSteps.remove(stepInstance.oid)
        pendingResources.remove(stepInstance.oid) // parity with TS
        val known = mutableSetOf<String>()
        collectKnownStepOids(known)
        resourceManager?.cancelQueuedWaiters(known)
    }

    private fun findEnvForActionLocalId(localId: String): MasterEnvironmentSpecification? {
        val envs = workflow.environment_specifications ?: return null
        return envs.firstOrNull { env ->
            (env.included_actions ?: emptyList()).any {
                (it as? JsonObject)?.get("local_id")?.jsonPrimitive?.content == localId
            }
        }
    }

    fun onExternalStateChange(
        stepOid: String,
        newState: StepState,
        outputs: Map<String, String>?,
    ) {
        val step = steps[stepOid] ?: return
        if (workflowState == WorkflowState.ABORTED || workflowState == WorkflowState.COMPLETED) return

        recordTrace(stepOid, newState.name)
        step.state = newState

        if (outputs != null) {
            for (spec in step.step.output_parameter_specifications ?: emptyList()) {
                val v = outputs[spec.id]
                if (v != null && spec.target != null) propertyStore.set(spec.target!!, v)
            }
        }

        when (newState) {
            StepState.COMPLETED -> {
                actionInvoker?.release(stepOid)
                actionInstanceIdByStep.remove(stepOid)
                activeActionProxyServers.remove(stepOid)
                completionQueue.addLast(stepOid)
                drainCompletionQueue()
            }
            StepState.ABORTED -> {
                actionInvoker?.release(stepOid)
                actionInstanceIdByStep.remove(stepOid)
                activeActionProxyServers.remove(stepOid)
            }
            StepState.ERRORED -> {
                actionInvoker?.release(stepOid)
                workflowState = WorkflowState.ERRORED
            }
            else -> { /* intermediate */ }
        }
    }

    // ── Completed Steps Query ──

    fun getCompletedSteps(): List<CompletedStepInfo> {
        val autoTypes = setOf("START", "END", "PARALLEL", "WAIT ALL", "WAIT ANY", "SELECT 1", "SCRIPT", "MATH")
        val result = mutableListOf<CompletedStepInfo>()
        for (step in steps.values) {
            if (step.state != StepState.COMPLETED) continue
            if (step.stepType in autoTypes) continue
            val traceEntry = trace.find { it.step_oid == step.oid && it.state == "COMPLETED" }
            result.add(CompletedStepInfo(
                oid = step.oid,
                localId = step.step.local_id,
                stepType = step.stepType,
                description = step.step.description ?: step.stepType,
                completedOrder = traceEntry?.order ?: 0,
            ))
        }
        result.sortBy { it.completedOrder }
        return result
    }

    // ── Restart Support ──

    // ── RETURN Dispatch ──

    private fun dispatchReturn(returnStep: StepInstance) {
        val rc = returnStep.step.return_config ?: return
        val catchOid = findActiveCatchForReturn(returnStep.oid)
        val ctx = catchOid?.let { activeCatches[it] }
        when (rc.command) {
            "ABANDON" -> returnAbandon()
            "RESTART" -> returnRestart(rc.restart_mode ?: "KEEP")
            "GOTO" -> rc.goto_step_oid?.let { returnGoto(it) }
            "RETRY" -> returnRetry(ctx)
        }
        // Clear the triggering catch network. This is a no-op for ABANDON/RESTART (they already
        // idled every step, and RESTART already cleared activeCatches); it does the real work for
        // GOTO/RETRY, which resume the main flow while the rest of the workflow keeps running.
        if (catchOid != null) {
            cleanupCatchNetwork(catchOid)
            activeCatches.remove(catchOid)
        }
    }

    private fun findActiveCatchForReturn(returnOid: String): String? {
        for ((catchId, net) in buildPartition().networksByCatchId) {
            if (returnOid in net) {
                val cs = findCatchByCatchId(catchId)
                if (cs != null && activeCatches.containsKey(cs.oid)) return cs.oid
            }
        }
        return null
    }

    private fun cleanupCatchNetwork(catchOid: String) {
        val cid = steps[catchOid]?.step?.catch_id ?: return
        val net = buildPartition().networksByCatchId[cid] ?: return
        for (oid in net) {
            val st = steps[oid] ?: continue
            if (st.state != StepState.IDLE) { recordTrace(oid, "IDLE"); st.state = StepState.IDLE }
        }
    }

    private fun returnAbandon() {
        for (step in steps.values) {
            if (step.state in ACTIVE_STEP_STATES) { recordTrace(step.oid, "IDLE"); step.state = StepState.IDLE }
        }
        completionQueue.clear()
        releaseAllResources()
        workflowState = WorkflowState.ABORTED
    }

    private fun returnRestart(mode: String) {
        for (step in steps.values) { resetStepInline(step.oid) }
        completionQueue.clear()
        activeCatches.clear()
        releaseAllResources()
        if (mode == "CLEAN") propertyStore.initializeFromWorkflow(workflow)
        val startStep = steps.values.firstOrNull { it.stepType == "START" }
        if (startStep != null) {
            recordTrace(startStep.oid, "COMPLETED")
            startStep.state = StepState.COMPLETED
            completionQueue.addLast(startStep.oid)
        }
    }

    private fun returnGoto(gotoOid: String) {
        val target = steps[gotoOid] ?: return
        if (target.state != StepState.IDLE) resetStepInline(gotoOid)
        activateStep(target) // branch-local
    }

    private fun returnRetry(ctx: CatchContext?) {
        if (ctx == null) return // no active catch context (e.g. a RETURN outside a catch network): nothing to re-invoke

        val trigger = steps[ctx.trigger_step_oid] ?: return
        if (trigger.state != StepState.IDLE) resetStepInline(ctx.trigger_step_oid)
        activateStep(trigger) // ACTION PROXY → EXECUTING again
    }

    private fun resetStepInline(oid: String) {
        val step = steps[oid] ?: return
        if (step.state != StepState.IDLE) recordTrace(oid, "IDLE")
        step.state = StepState.IDLE
        routingContext.remove(oid)
        pendingResources.remove(oid)
        pendingUserSteps.remove(oid)
        stepParameterSnapshots.remove(oid)
        waitAllTracking.remove(oid)
        activeChildEngines.remove(oid)
    }

    fun checkRestartSafety(targetOids: List<String>): List<String> {
        val warnings = mutableListOf<String>()

        val predecessors = mutableMapOf<String, MutableSet<String>>()
        for (conn in connections) {
            predecessors.getOrPut(conn.to_step_id) { mutableSetOf() }.add(conn.from_step_id)
        }

        val activeOids = mutableSetOf<String>()
        for (step in steps.values) {
            if (step.state in ACTIVE_STEP_STATES) activeOids.add(step.oid)
        }

        val ancestors = mutableSetOf<String>()
        val queue = ArrayDeque(activeOids)
        while (queue.isNotEmpty()) {
            val current = queue.removeLast()
            val preds = predecessors[current] ?: continue
            for (pred in preds) {
                if (ancestors.add(pred)) {
                    queue.addLast(pred)
                }
            }
        }

        for (targetOid in targetOids) {
            if (targetOid !in ancestors && targetOid !in activeOids) {
                val step = steps[targetOid]
                val desc = step?.step?.description ?: step?.stepType ?: targetOid
                warnings.add("Step \"$desc\" is on a different branch — workflow may not execute correctly")
            }
        }

        return warnings
    }

    fun restartToSteps(targetOids: List<String>) {
        if (workflowState != WorkflowState.RUNNING) return

        for (oid in targetOids) {
            val step = steps[oid]
            if (step == null || step.state != StepState.COMPLETED) {
                throw IllegalStateException("Cannot restart to step $oid: not in COMPLETED state")
            }
        }

        // Build successor map
        val successors = mutableMapOf<String, MutableSet<String>>()
        for (conn in connections) {
            successors.getOrPut(conn.from_step_id) { mutableSetOf() }.add(conn.to_step_id)
        }

        // BFS to find all downstream steps to reset
        val toReset = mutableSetOf<String>()
        toReset.addAll(targetOids)
        val bfsQueue = ArrayDeque(targetOids)
        while (bfsQueue.isNotEmpty()) {
            val current = bfsQueue.removeFirst()
            val succs = successors[current] ?: continue
            for (succ in succs) {
                if (toReset.add(succ)) {
                    bfsQueue.addLast(succ)
                }
            }
        }

        // Reset all downstream steps
        for (oid in toReset) {
            val step = steps[oid] ?: continue
            step.state = StepState.IDLE
            routingContext.remove(oid)
            pendingResources.remove(oid)
            pendingUserSteps.remove(oid)
            stepParameterSnapshots.remove(oid)
            waitAllTracking.remove(oid)
            activeChildEngines.remove(oid)
        }

        // Record trace entries for re-activation
        for (oid in targetOids) {
            recordTrace(oid, "EXECUTING")
        }

        // Re-activate target steps
        for (oid in targetOids) {
            val step = steps[oid]!!
            activateStep(step)
        }

        drainCompletionQueue()
    }
}
