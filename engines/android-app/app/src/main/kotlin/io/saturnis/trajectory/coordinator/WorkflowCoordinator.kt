// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
package io.saturnis.trajectory.coordinator

import androidx.compose.runtime.Stable
import com.trajectoryruntime.engine.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.json.*

@Stable
data class CoordinatorState(
    val workflowState: WorkflowState = WorkflowState.IDLE,
    val activeSteps: List<ActiveStepInfo> = emptyList(),
    val trace: List<TraceEntry> = emptyList(),
    val properties: Map<String, String> = emptyMap(),
    val inputParameters: Map<String, String> = emptyMap(),
    val stepParams: Map<String, StepParameterSnapshot> = emptyMap(),
    val mediaMap: Map<String, String> = emptyMap(),
    val error: String? = null,
)

class WorkflowCoordinator {
    private var engine: WorkflowEngine? = null
    private var spec: MasterWorkflowSpecification? = null
    private var _mediaMap: Map<String, String> = emptyMap()
    private var _environmentJsons: List<String> = emptyList()
    private val _userActions = mutableListOf<UserAction>()
    private var actionIndex = 0

    private val _state = MutableStateFlow(CoordinatorState())
    val state: StateFlow<CoordinatorState> = _state.asStateFlow()

    private val jsonFormat = Json { ignoreUnknownKeys = true }

    private var _sharedResourceManager: InMemoryResourceManager? = null

    fun loadAndStart(
        spec: MasterWorkflowSpecification,
        setup: TestFixtureSetup? = null,
        mediaMap: Map<String, String> = emptyMap(),
        environmentJsons: List<String> = emptyList(),
        sharedResourceManager: InMemoryResourceManager? = null,
    ) {
        this.spec = spec
        this._mediaMap = mediaMap
        this._environmentJsons = environmentJsons
        this._sharedResourceManager = sharedResourceManager
        this._userActions.clear()
        this.actionIndex = 0

        // Use shared resource manager if provided (for cross-workflow env sync),
        // otherwise create a local one
        val resourceManager = sharedResourceManager ?: InMemoryResourceManager()
        val envProperties = mutableMapOf<String, String>()
        for (envJson in environmentJsons) {
            loadEnvironmentLibrary(envJson, resourceManager, envProperties)
        }

        // Merge environment properties into setup initial_properties
        val mergedSetup = if (envProperties.isNotEmpty()) {
            val mergedProps = envProperties.toMutableMap()
            setup?.initial_properties?.let { mergedProps.putAll(it) } // setup overrides env
            TestFixtureSetup(
                starting_parameters = setup?.starting_parameters,
                initial_properties = mergedProps,
            )
        } else {
            setup
        }

        engine = WorkflowEngine(spec, mergedSetup, resourceManager)
        engine!!.start()
        sync()
    }

    fun submitAction(action: UserAction) {
        val eng = engine ?: return
        _userActions.add(action)
        actionIndex++
        eng.submitAction(action, actionIndex)
        sync()
    }

    fun getSpec(): MasterWorkflowSpecification? = spec

    /** Return the deepest active child spec, or the parent spec if no child is active. */
    fun getActiveSpec(): MasterWorkflowSpecification? = engine?.getActiveSpec() ?: spec

    fun getUserActions(): List<UserAction> = _userActions.toList()

    fun getEnvironmentJsons(): List<String> = _environmentJsons

    fun reset() {
        engine = null
        spec = null
        _mediaMap = emptyMap()
        _environmentJsons = emptyList()
        _userActions.clear()
        actionIndex = 0
        _state.value = CoordinatorState()
    }

    fun restart() {
        val s = spec ?: return
        loadAndStart(s, mediaMap = _mediaMap, environmentJsons = _environmentJsons, sharedResourceManager = _sharedResourceManager)
    }

    /** Check for pending cross-workflow resource grants and resume any unblocked steps. */
    fun pumpSharedResources(): Boolean {
        val eng = engine ?: return false
        val changed = eng.pumpSharedResources()
        if (changed) sync()
        return changed
    }

    fun abort() {
        engine = null
        _userActions.clear()
        actionIndex = 0
        _state.value = _state.value.copy(
            workflowState = WorkflowState.ABORTED,
            activeSteps = emptyList(),
        )
    }

    fun pauseAll() {
        val eng = engine ?: return
        for (step in eng.getActiveSteps()) {
            if (step.step.state == StepState.EXECUTING) {
                eng.pauseStep(step.step.oid)
            }
        }
        sync()
    }

    fun resumeAll() {
        val eng = engine ?: return
        for (step in eng.getActiveSteps()) {
            if (step.step.state == StepState.PAUSED) {
                eng.resumeStep(step.step.oid)
            }
        }
        sync()
    }

    fun getCompletedSteps(): List<CompletedStepInfo> {
        return engine?.getCompletedSteps() ?: emptyList()
    }

    fun checkRestartSafety(targetOids: List<String>): List<String> {
        return engine?.checkRestartSafety(targetOids) ?: emptyList()
    }

    fun restartToSteps(targetOids: List<String>) {
        engine?.restartToSteps(targetOids)
        sync()
    }

    fun releaseAllEnvironmentResources(): List<String> {
        return engine?.releaseAllEnvironmentResources() ?: emptyList()
    }

    fun releaseAllWorkflowResources(): List<String> {
        return engine?.releaseAllWorkflowResources() ?: emptyList()
    }

    fun getEnvironmentResourceSnapshot(): List<com.trajectoryruntime.engine.ResourceSnapshotEntry> {
        return engine?.getEnvironmentResourceSnapshot() ?: emptyList()
    }

    fun getWorkflowResourceSnapshot(): List<com.trajectoryruntime.engine.ResourceSnapshotEntry> {
        return engine?.getWorkflowResourceSnapshot() ?: emptyList()
    }

    fun resetResource(resourceKey: String): Boolean {
        return engine?.resetResource(resourceKey) ?: false
    }

    /**
     * Load environment library JSON: register resources and extract value properties.
     * Mirrors web-ui's loadEnvironmentLibrary() function.
     */
    private fun loadEnvironmentLibrary(
        envJson: String,
        resourceManager: InMemoryResourceManager,
        properties: MutableMap<String, String>,
    ) {
        try {
            val lib = jsonFormat.parseToJsonElement(envJson).jsonObject
            processLibrary(lib, resourceManager, properties)
        } catch (e: Exception) {
            android.util.Log.w("WorkflowCoordinator", "Failed to load environment library", e)
        }
    }

    private fun processLibrary(
        lib: JsonObject,
        resourceManager: InMemoryResourceManager,
        properties: MutableMap<String, String>,
    ) {
        val specs = lib["environment_specifications"]?.jsonArray ?: return
        for (specEl in specs) {
            processEnvironmentSpec(specEl.jsonObject, resourceManager, properties)
        }
        val children = lib["child_libraries"]?.jsonArray
        if (children != null) {
            for (child in children) {
                processLibrary(child.jsonObject, resourceManager, properties)
            }
        }
    }

    private fun processEnvironmentSpec(
        spec: JsonObject,
        resourceManager: InMemoryResourceManager,
        properties: MutableMap<String, String>,
    ) {
        val specOid = spec["oid"]?.jsonPrimitive?.contentOrNull ?: "environment"
        // Register resource_property_specifications
        val resourceSpecs = spec["resource_property_specifications"]?.jsonArray
        if (resourceSpecs != null) {
            for (resEl in resourceSpecs) {
                val resSpec = jsonFormat.decodeFromJsonElement<ResourcePropertySpecification>(resEl)
                if (!resourceManager.hasResource(resSpec.name)) {
                    resourceManager.registerResource(resSpec, specOid, "environment")
                }
            }
        }

        // Extract value_property_specifications into flat key=value map
        val valueSpecs = spec["value_property_specifications"]?.jsonArray
        if (valueSpecs != null) {
            for (propEl in valueSpecs) {
                val propObj = propEl.jsonObject
                val propName = propObj["name"]?.jsonPrimitive?.contentOrNull ?: continue
                val entries = propObj["entries"]?.jsonArray ?: continue
                for (entryEl in entries) {
                    val entryObj = entryEl.jsonObject
                    val entryName = entryObj["name"]?.jsonPrimitive?.contentOrNull ?: continue
                    val entryValue = entryObj["value"]?.jsonPrimitive?.contentOrNull ?: continue
                    val key = "$propName.$entryName"
                    if (key !in properties) {
                        properties[key] = entryValue
                    }
                }
            }
        }
    }

    private fun sync() {
        val eng = engine ?: return
        val ws = eng.getWorkflowState()
        val activeSteps = eng.getActiveSteps()
        _state.value = CoordinatorState(
            workflowState = ws,
            activeSteps = activeSteps,
            trace = eng.getTrace(),
            properties = eng.getProperties(),
            inputParameters = eng.getActiveInputParameters(),
            stepParams = eng.getStepParameterSnapshots(),
            mediaMap = _mediaMap,
        )
    }
}
