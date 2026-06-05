// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
package io.saturnis.trajectory.manager

import io.saturnis.trajectory.coordinator.WorkflowCoordinator
import io.saturnis.trajectory.coordinator.CoordinatorState
import io.saturnis.trajectory.storage.WorkflowDao
import io.saturnis.trajectory.storage.LoadedWorkflowEntity
import io.saturnis.trajectory.storage.ActiveWorkflowEntity
import io.saturnis.trajectory.storage.CompletedWorkflowEntity
import com.trajectoryruntime.engine.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.encodeToString
import java.io.File
import java.util.UUID

data class LoadedWorkflow(
    val id: String,
    val specOid: String,
    val localId: String,
    val version: String,
    val name: String,
    val spec: MasterWorkflowSpecification,
    val mediaMap: Map<String, String>,
    val mediaDir: String?,
    val environmentJsons: List<String> = emptyList(),
    val loadedAt: Long,
)

data class ActiveWorkflow(
    val id: String,
    val name: String,
    val localId: String,
    val version: String,
    val coordinator: WorkflowCoordinator,
    val specJson: String,
    val mediaMapJson: String?,
    val environmentsJson: String?,
    val startedAt: Long,
)

data class CompletedWorkflow(
    val id: String,
    val localId: String,
    val version: String,
    val name: String,
    val workflowState: String,
    val startedAt: Long,
    val finishedAt: Long,
    val traceJson: String,
    val propertiesJson: String,
    val specJson: String,
)

data class ManagerState(
    val loaded: List<LoadedWorkflow> = emptyList(),
    val active: List<ActiveWorkflow> = emptyList(),
    val completed: List<CompletedWorkflow> = emptyList(),
    val focusedActiveId: String? = null,
)

sealed class AddResult {
    data class Success(val id: String) : AddResult()
    data class Duplicate(val existingId: String) : AddResult()
}

class WorkflowManager(
    private val dao: WorkflowDao?,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Main),
) {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private val _state = MutableStateFlow(ManagerState())
    val state: StateFlow<ManagerState> = _state.asStateFlow()

    private val coordinatorJobs = mutableMapOf<String, Job>()
    /** Shared resource managers for environment-scoped cross-workflow sync, keyed by env OID set. */
    private val envResourceManagers = mutableMapOf<String, InMemoryResourceManager>()
    /** Guard against re-entrant pumping of sibling coordinators. */
    private var pumpingInProgress = false

    fun addWorkflow(
        spec: MasterWorkflowSpecification,
        mediaMap: Map<String, String>,
        mediaDir: String? = null,
        environmentJsons: List<String> = emptyList(),
    ): AddResult {
        val existing = _state.value.loaded.find { it.specOid == spec.oid }
        if (existing != null) return AddResult.Duplicate(existing.id)

        val id = UUID.randomUUID().toString()
        val loaded = LoadedWorkflow(
            id = id, specOid = spec.oid, localId = spec.local_id,
            version = spec.version, name = spec.local_id,
            spec = spec, mediaMap = mediaMap, mediaDir = mediaDir,
            environmentJsons = environmentJsons,
            loadedAt = System.currentTimeMillis(),
        )

        _state.update { it.copy(loaded = it.loaded + loaded) }

        dao?.let { d ->
            scope.launch(Dispatchers.IO) {
                d.insertLoaded(LoadedWorkflowEntity(
                    id = id, localId = spec.local_id, version = spec.version,
                    name = loaded.name, specOid = spec.oid,
                    specJson = json.encodeToString(spec),
                    mediaDir = mediaDir,
                    mediaMapJson = json.encodeToString(mediaMap),
                    loadedAt = loaded.loadedAt,
                ))
            }
        }

        return AddResult.Success(id)
    }

    @OptIn(kotlinx.coroutines.FlowPreview::class)
    fun startWorkflow(loadedId: String, startingParams: Map<String, String>? = null, allowScriptExecution: Boolean = false): String? {
        val loaded = _state.value.loaded.find { it.id == loadedId } ?: return null
        val instanceId = UUID.randomUUID().toString()
        val coordinator = WorkflowCoordinator()

        val specJsonStr = json.encodeToString(loaded.spec)
        val mediaMapJsonStr = json.encodeToString(loaded.mediaMap)
        val envsJsonStr = if (loaded.environmentJsons.isNotEmpty()) json.encodeToString(loaded.environmentJsons) else null

        val active = ActiveWorkflow(
            id = instanceId,
            name = loaded.name, localId = loaded.localId,
            version = loaded.version, coordinator = coordinator,
            specJson = specJsonStr, mediaMapJson = mediaMapJsonStr,
            environmentsJson = envsJsonStr,
            startedAt = System.currentTimeMillis(),
        )

        _state.update { it.copy(
            active = it.active + active,
            focusedActiveId = instanceId,
        ) }

        // Persist active to Room BEFORE starting
        dao?.let { d ->
            scope.launch(Dispatchers.IO) {
                d.insertActive(ActiveWorkflowEntity(
                    id = instanceId,
                    name = loaded.name, localId = loaded.localId,
                    version = loaded.version,
                    specJson = specJsonStr,
                    mediaMapJson = mediaMapJsonStr,
                    environmentsJson = envsJsonStr,
                    traceJson = "[]", propertiesJson = "{}",
                    userActionsJson = "[]", workflowState = "RUNNING",
                    activeStepsJson = "[]",
                    startedAt = active.startedAt,
                    lastUpdatedAt = active.startedAt,
                ))
            }
        }

        // Start engine (synchronous — state settles immediately)
        val setup = if (startingParams != null) TestFixtureSetup(starting_parameters = startingParams) else null
        val sharedRM = getSharedResourceManager(loaded.environmentJsons)
        coordinator.loadAndStart(loaded.spec, setup = setup, mediaMap = loaded.mediaMap, environmentJsons = loaded.environmentJsons, sharedResourceManager = sharedRM, allowScriptExecution = allowScriptExecution)

        // After start, pump siblings in case this workflow's activation granted resources for others
        pumpSiblingCoordinators(instanceId)

        // Check if already completed (e.g., START→END workflow)
        val currentState = coordinator.state.value.workflowState
        if (currentState in setOf(
            WorkflowState.COMPLETED, WorkflowState.ABORTED,
            WorkflowState.STOPPED, WorkflowState.ERRORED,
        )) {
            completeWorkflow(instanceId, coordinator.state.value)
            return instanceId
        }

        // Watch for future completion and pump cross-workflow resource grants
        val job = scope.launch {
            coordinator.state.collect { coordState ->
                pumpSiblingCoordinators(instanceId)
                if (coordState.workflowState in setOf(
                    WorkflowState.COMPLETED, WorkflowState.ABORTED,
                    WorkflowState.STOPPED, WorkflowState.ERRORED,
                )) {
                    completeWorkflow(instanceId, coordState)
                    cancel()
                }
            }
        }
        coordinatorJobs[instanceId] = job

        // Persist snapshots on state changes (debounced 300ms)
        val snapshotJob = scope.launch {
            coordinator.state
                .drop(1) // skip current value
                .debounce(300)
                .conflate()
                .collect { coordState ->
                    persistActiveSnapshot(instanceId, coordinator, coordState)
                }
        }
        coordinatorJobs["${instanceId}-snapshot"] = snapshotJob

        return instanceId
    }

    /** Get or create a shared resource manager for workflows sharing environments. */
    private fun getSharedResourceManager(environmentJsons: List<String>): InMemoryResourceManager? {
        if (environmentJsons.isEmpty()) return null
        // Build stable key from sorted environment OIDs
        val envOids = mutableListOf<String>()
        for (envJson in environmentJsons) {
            try {
                val lib = json.parseToJsonElement(envJson).jsonObject
                val specs = lib["environment_specifications"]?.jsonArray ?: continue
                for (specEl in specs) {
                    val oid = specEl.jsonObject["oid"]?.jsonPrimitive?.contentOrNull ?: continue
                    envOids.add(oid)
                }
            } catch (e: Exception) {
                android.util.Log.w("WorkflowManager", "Failed to parse environment JSON", e)
            }
        }
        if (envOids.isEmpty()) return null
        val key = envOids.sorted().joinToString(",")
        return envResourceManagers.getOrPut(key) { InMemoryResourceManager() }
    }

    /** Pump all active coordinators (except the source) to check for cross-workflow resource grants. */
    private fun pumpSiblingCoordinators(sourceId: String) {
        if (pumpingInProgress) return
        pumpingInProgress = true
        try {
            for (wf in _state.value.active) {
                if (wf.id == sourceId) continue
                wf.coordinator.pumpSharedResources()
            }
        } finally {
            pumpingInProgress = false
        }
    }

    fun removeLoadedWorkflow(id: String) {
        val loaded = _state.value.loaded.find { it.id == id }
        _state.update { it.copy(loaded = it.loaded.filter { w -> w.id != id }) }
        dao?.let { d ->
            scope.launch(Dispatchers.IO) {
                d.deleteLoaded(id)
                // Clean up extracted files from disk
                loaded?.mediaDir?.let { dir ->
                    File(dir).deleteRecursively()
                }
            }
        }
    }

    fun removeCompletedWorkflow(id: String) {
        _state.update { it.copy(completed = it.completed.filter { w -> w.id != id }) }
        dao?.let { d -> scope.launch(Dispatchers.IO) { d.deleteCompleted(id) } }
    }

    fun focusWorkflow(id: String) {
        _state.update { it.copy(focusedActiveId = id) }
    }

    fun releaseAllEnvironmentResources(): List<String> {
        val released = mutableSetOf<String>()
        for (active in _state.value.active) {
            released.addAll(active.coordinator.releaseAllEnvironmentResources())
        }
        return released.toList()
    }

    fun releaseAllWorkflowResources(): List<String> {
        val released = mutableSetOf<String>()
        for (active in _state.value.active) {
            released.addAll(active.coordinator.releaseAllWorkflowResources())
        }
        return released.toList()
    }

    /** Aggregate env-resource snapshot across all active workflows, deduplicated by
     *  composite resourceKey (`name` field). When the same env-scoped pool is shared
     *  by multiple workflows, the entry reflects current pool state once. */
    fun getEnvironmentResourceSnapshot(): List<com.trajectoryruntime.engine.ResourceSnapshotEntry> {
        val seen = linkedMapOf<String, com.trajectoryruntime.engine.ResourceSnapshotEntry>()
        for (active in _state.value.active) {
            for (e in active.coordinator.getEnvironmentResourceSnapshot()) {
                seen.putIfAbsent(e.name, e)
            }
        }
        return seen.values.toList()
    }

    /** Aggregate workflow-scoped resource snapshot across all active workflows. */
    fun getWorkflowResourceSnapshot(): List<com.trajectoryruntime.engine.ResourceSnapshotEntry> {
        val seen = linkedMapOf<String, com.trajectoryruntime.engine.ResourceSnapshotEntry>()
        for (active in _state.value.active) {
            for (e in active.coordinator.getWorkflowResourceSnapshot()) {
                seen.putIfAbsent(e.name, e)
            }
        }
        return seen.values.toList()
    }

    /** Reset a single resource by composite resourceKey. Tries each coordinator
     *  until one reports the resource exists in its manager view. */
    fun resetResource(resourceKey: String): Boolean {
        for (active in _state.value.active) {
            if (active.coordinator.resetResource(resourceKey)) return true
        }
        return false
    }

    fun getCoordinator(activeId: String): WorkflowCoordinator? {
        return _state.value.active.find { it.id == activeId }?.coordinator
    }

    private fun completeWorkflow(instanceId: String, finalState: CoordinatorState) {
        android.util.Log.d("WorkflowManager", "completeWorkflow called: id=$instanceId state=${finalState.workflowState}")
        val active = _state.value.active.find { it.id == instanceId }
        if (active == null) {
            android.util.Log.w("WorkflowManager", "completeWorkflow: workflow $instanceId not found in active list (already completed?)")
            return
        }

        coordinatorJobs.remove(instanceId)?.cancel()
        coordinatorJobs.remove("${instanceId}-snapshot")?.cancel()

        val completed = CompletedWorkflow(
            id = instanceId, localId = active.localId,
            version = active.version, name = active.name,
            workflowState = finalState.workflowState.name,
            startedAt = active.startedAt,
            finishedAt = System.currentTimeMillis(),
            traceJson = json.encodeToString(finalState.trace),
            propertiesJson = json.encodeToString(finalState.properties),
            specJson = json.encodeToString(active.coordinator.getSpec()),
        )

        _state.update { current ->
            val newActive = current.active.filter { it.id != instanceId }
            android.util.Log.d("WorkflowManager", "completeWorkflow: active ${current.active.size} -> ${newActive.size}, completed ${current.completed.size} -> ${current.completed.size + 1}")
            current.copy(
                active = newActive,
                completed = listOf(completed) + current.completed,
                focusedActiveId = if (current.focusedActiveId == instanceId) {
                    newActive.firstOrNull()?.id
                } else current.focusedActiveId,
            )
        }

        active.coordinator.reset()

        dao?.let { d ->
            scope.launch(Dispatchers.IO) {
                d.deleteActive(instanceId)
                d.insertCompleted(CompletedWorkflowEntity(
                    id = completed.id, localId = completed.localId,
                    version = completed.version, name = completed.name,
                    specJson = completed.specJson,
                    traceJson = completed.traceJson,
                    propertiesJson = completed.propertiesJson,
                    workflowState = completed.workflowState,
                    startedAt = completed.startedAt,
                    finishedAt = completed.finishedAt,
                ))
            }
        }
    }

    private suspend fun persistActiveSnapshot(
        instanceId: String,
        coordinator: WorkflowCoordinator,
        coordState: CoordinatorState,
    ) {
        dao?.let { d ->
            withContext(Dispatchers.IO) {
                val active = _state.value.active.find { it.id == instanceId } ?: return@withContext
                d.updateActive(ActiveWorkflowEntity(
                    id = instanceId,
                    name = active.name, localId = active.localId,
                    version = active.version,
                    specJson = active.specJson,
                    mediaMapJson = active.mediaMapJson,
                    environmentsJson = active.environmentsJson,
                    traceJson = json.encodeToString(coordState.trace),
                    propertiesJson = json.encodeToString(coordState.properties),
                    userActionsJson = json.encodeToString(coordinator.getUserActions()),
                    workflowState = coordState.workflowState.name,
                    activeStepsJson = "[]",
                    startedAt = active.startedAt,
                    lastUpdatedAt = System.currentTimeMillis(),
                ))
            }
        }
    }

    suspend fun resumeFromDatabase() {
        val d = dao ?: return
        withContext(Dispatchers.IO) {
            val loadedEntities = d.observeLoaded().first()
            val loadedList = loadedEntities.mapNotNull { entity ->
                try {
                    val spec = json.decodeFromString<MasterWorkflowSpecification>(entity.specJson)
                    val mediaMap: Map<String, String> = entity.mediaMapJson?.let {
                        json.decodeFromString(it)
                    } ?: emptyMap()
                    LoadedWorkflow(
                        id = entity.id, specOid = entity.specOid,
                        localId = entity.localId, version = entity.version,
                        name = entity.name, spec = spec, mediaMap = mediaMap,
                        mediaDir = entity.mediaDir, loadedAt = entity.loadedAt,
                    )
                } catch (e: Exception) {
                    android.util.Log.e("WorkflowManager", "Failed to restore loaded workflow ${entity.id}", e)
                    null
                }
            }

            val activeEntities = d.getAllActive()
            val activeList = activeEntities.mapNotNull { entity ->
                try {
                    val spec = json.decodeFromString<MasterWorkflowSpecification>(entity.specJson)
                    val mediaMap: Map<String, String> = entity.mediaMapJson?.let {
                        json.decodeFromString(it)
                    } ?: emptyMap()
                    val envJsons: List<String> = entity.environmentsJson?.let {
                        json.decodeFromString(it)
                    } ?: emptyList()
                    val coordinator = WorkflowCoordinator()
                    val userActions: List<UserAction> = json.decodeFromString(entity.userActionsJson)
                    val sharedRM = getSharedResourceManager(envJsons)
                    coordinator.loadAndStart(spec, mediaMap = mediaMap, environmentJsons = envJsons, sharedResourceManager = sharedRM)
                    for (action in userActions) {
                        coordinator.submitAction(action)
                    }
                    ActiveWorkflow(
                        id = entity.id,
                        name = entity.name, localId = entity.localId,
                        version = entity.version, coordinator = coordinator,
                        specJson = entity.specJson,
                        mediaMapJson = entity.mediaMapJson,
                        environmentsJson = entity.environmentsJson,
                        startedAt = entity.startedAt,
                    )
                } catch (e: Exception) {
                    android.util.Log.e("WorkflowManager", "Failed to restore active workflow ${entity.id}", e)
                    d.deleteActive(entity.id)
                    null
                }
            }

            val completedEntities = d.observeCompleted().first()
            val completedList = completedEntities.map { entity ->
                CompletedWorkflow(
                    id = entity.id, localId = entity.localId,
                    version = entity.version, name = entity.name,
                    workflowState = entity.workflowState,
                    startedAt = entity.startedAt, finishedAt = entity.finishedAt,
                    traceJson = entity.traceJson,
                    propertiesJson = entity.propertiesJson,
                    specJson = entity.specJson,
                )
            }

            withContext(Dispatchers.Main) {
                _state.value = ManagerState(
                    loaded = loadedList,
                    active = activeList,
                    completed = completedList,
                    focusedActiveId = activeList.firstOrNull()?.id,
                )
            }
        }
    }
}
