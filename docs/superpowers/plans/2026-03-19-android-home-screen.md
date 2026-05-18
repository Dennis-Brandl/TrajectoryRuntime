# Android Home Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Android single-workflow loader with a multi-workflow home screen matching the web-ui's feature set, using native Material 3 components.

**Architecture:** New `WorkflowManager` manages loaded/active/completed workflow lists via `StateFlow`. `FileProcessor` handles `.WFmasterX` ZIP and `.json` files. Navigation is a sealed class (`Screen.Home` / `Screen.Active(id)`). Existing `StepRenderer`, `FormRenderer`, `TraceView`, and element system are reused unchanged.

**Tech Stack:** Kotlin, Jetpack Compose, Material 3, KMP Engine, kotlinx.serialization

**Spec:** `docs/superpowers/specs/2026-03-19-android-home-screen-design.md`

---

## File Structure

### New Files (all under `engines/android-ui/app/src/main/kotlin/io/saturnis/trajectory/`)

| File | Responsibility |
|------|----------------|
| `manager/Types.kt` | Data classes: `LoadedWorkflow`, `ActiveWorkflow`, `CompletedWorkflow`, `ManagerState`, `Screen` |
| `manager/FileProcessor.kt` | Parse `.WFmasterX` (ZIP) and `.json` files from `ContentResolver` URIs or raw strings |
| `manager/WorkflowManager.kt` | Central state holder: add/remove/start workflows, completion detection, persistence |
| `components/TitleBar.kt` | Shared title bar with overflow menu for Home and Active screens |
| `components/HomeScreen.kt` | Three-section workflow list with swipe-to-delete, file picker, start dialog |
| `components/WorkflowStartDialog.kt` | AlertDialog for starting a workflow with optional parameter input |
| `components/ActiveScreen.kt` | Active workflow view: step rendering, trace, restart/new controls |

### Modified Files

| File | Change |
|------|--------|
| `coordinator/WorkflowCoordinator.kt` | Add `load(spec, setup)` + `start()` API; refactor `loadAndStart(json)` to delegate |
| `MainActivity.kt` | Create `WorkflowManager`, observe `currentScreen`, render HomeScreen or ActiveScreen |
| `app/build.gradle.kts` | Add `lifecycle-viewmodel-compose` dependency |

### Removed Files

| File | Reason |
|------|--------|
| `components/WorkflowRunner.kt` | Replaced by HomeScreen + ActiveScreen |
| `components/WorkflowLoader.kt` | Replaced by HomeScreen file picker |

### Unchanged Files

`StepRenderer.kt`, `FormRenderer.kt`, `TraceView.kt`, `ElementRegistry.kt`, `Elements.kt`, `Theme.kt`

---

## Task 1: Add ViewModel dependency

**Files:**
- Modify: `engines/android-ui/app/build.gradle.kts`

- [ ] **Step 1: Add lifecycle-viewmodel-compose dependency**

Add to the `dependencies` block in `build.gradle.kts`:

```kotlin
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
```

Place it after the existing `lifecycle-runtime-ktx` line.

- [ ] **Step 2: Verify build compiles**

Run from `engines/android-ui/`:
```bash
./gradlew compileDebugKotlin 2>&1 | tail -5
```
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 3: Commit**

```bash
git add engines/android-ui/app/build.gradle.kts
git commit -m "chore(android): add lifecycle-viewmodel-compose dependency"
```

---

## Task 2: Create data model types

**Files:**
- Create: `engines/android-ui/app/src/main/kotlin/io/saturnis/trajectory/manager/Types.kt`

- [ ] **Step 1: Create the Types.kt file**

```kotlin
package io.saturnis.trajectory.manager

import com.trajectoryruntime.engine.MasterWorkflowSpecification
import com.trajectoryruntime.engine.TraceEntry
import io.saturnis.trajectory.coordinator.WorkflowCoordinator
import kotlinx.serialization.json.JsonObject

/** Navigation state — sealed class prevents invalid Screen.Active without an ID. */
sealed class Screen {
    object Home : Screen()
    data class Active(val workflowId: String) : Screen()
}

/** Root UI state observed by MainActivity. */
data class ManagerState(
    val loaded: List<LoadedWorkflow> = emptyList(),
    val active: List<ActiveWorkflow> = emptyList(),
    val completed: List<CompletedWorkflow> = emptyList(),
    val currentScreen: Screen = Screen.Home,
    val error: String? = null,
)

/** A loaded workflow spec — persists until explicitly deleted. */
data class LoadedWorkflow(
    val id: String,
    val specOid: String,
    val localId: String,
    val version: String,
    val description: String?,
    val spec: MasterWorkflowSpecification,
    val mediaMap: Map<String, ByteArray> = emptyMap(),
    val environments: List<JsonObject> = emptyList(),
    val loadedAt: Long,
)

/** A running workflow instance. */
data class ActiveWorkflow(
    val id: String,
    val sourceSpecId: String,
    val localId: String,
    val version: String,
    val coordinator: WorkflowCoordinator,
    val startedAt: Long,
)

/** A finished workflow instance. */
data class CompletedWorkflow(
    val id: String,
    val sourceSpecId: String,
    val localId: String,
    val version: String,
    val finalState: String,
    val startedAt: Long,
    val finishedAt: Long,
    val trace: List<TraceEntry> = emptyList(),
    val properties: Map<String, String> = emptyMap(),
)
```

- [ ] **Step 2: Verify build compiles**

Run from `engines/android-ui/`:
```bash
./gradlew compileDebugKotlin 2>&1 | tail -5
```
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 3: Commit**

```bash
git add engines/android-ui/app/src/main/kotlin/io/saturnis/trajectory/manager/Types.kt
git commit -m "feat(android): add workflow manager data model types"
```

---

## Task 3: Refactor WorkflowCoordinator to support load() + start()

**Files:**
- Modify: `engines/android-ui/app/src/main/kotlin/io/saturnis/trajectory/coordinator/WorkflowCoordinator.kt`

- [ ] **Step 1: Add Setup data class and load()/start() methods**

Add the `Setup` data class and new methods to `WorkflowCoordinator`. The existing `loadAndStart(json)` must be refactored to delegate to the new methods. Replace the entire file with:

```kotlin
package io.saturnis.trajectory.coordinator

import com.trajectoryruntime.engine.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.json.*

data class CoordinatorState(
    val workflowState: WorkflowState = WorkflowState.IDLE,
    val executingSteps: List<StepInstance> = emptyList(),
    val trace: List<TraceEntry> = emptyList(),
    val properties: Map<String, String> = emptyMap(),
    val error: String? = null,
)

data class Setup(
    val startingParameters: Map<String, String>? = null,
    val initialProperties: Map<String, String>? = null,
)

class WorkflowCoordinator {
    private val _state = MutableStateFlow(CoordinatorState())
    val state: StateFlow<CoordinatorState> = _state.asStateFlow()

    private var engine: WorkflowEngine? = null
    private var currentSpec: MasterWorkflowSpecification? = null
    private var currentSetup: Setup? = null
    private var currentJson: String? = null
    private var actionIndex = 0
    private val stepMap = mutableMapOf<String, StepInstance>()

    /** Load a pre-parsed spec with optional setup. Does not start execution. */
    fun load(spec: MasterWorkflowSpecification, setup: Setup? = null) {
        currentSpec = spec
        currentSetup = setup
        actionIndex = 0

        // Build step map for UI rendering
        stepMap.clear()
        for (step in spec.steps) {
            stepMap[step.oid] = StepInstance(
                oid = step.oid,
                stepType = canonicalStepType(step.step_type),
                state = StepState.IDLE,
                step = step,
            )
        }
    }

    /** Start execution. Must call load() first. */
    fun start() {
        val spec = currentSpec ?: return
        try {
            // Convert Setup to TestFixtureSetup for the engine
            val fixtureSetup = currentSetup?.let { s ->
                val jsonFormat = Json { ignoreUnknownKeys = true }
                val setupObj = buildJsonObject {
                    s.startingParameters?.let { params ->
                        put("starting_parameters", buildJsonObject {
                            params.forEach { (k, v) -> put(k, JsonPrimitive(v)) }
                        })
                    }
                    s.initialProperties?.let { props ->
                        put("initial_properties", buildJsonObject {
                            props.forEach { (k, v) -> put(k, JsonPrimitive(v)) }
                        })
                    }
                }
                jsonFormat.decodeFromJsonElement<TestFixtureSetup>(setupObj)
            }

            engine = WorkflowEngine(spec, fixtureSetup).also { it.start() }
            syncState()
        } catch (e: Exception) {
            _state.value = CoordinatorState(error = e.message ?: "Unknown error")
        }
    }

    /** Load raw JSON and start (legacy API, used by fixtures). */
    fun loadAndStart(json: String) {
        try {
            val jsonFormat = Json { ignoreUnknownKeys = true }
            val root = jsonFormat.parseToJsonElement(json).jsonObject
            val workflowObj: JsonObject
            val fixtureSetup: TestFixtureSetup?

            if ("workflow" in root) {
                workflowObj = root["workflow"]!!.jsonObject
                fixtureSetup = root["setup"]?.let { jsonFormat.decodeFromJsonElement<TestFixtureSetup>(it) }
            } else {
                workflowObj = root
                fixtureSetup = null
            }

            require("steps" in workflowObj && "connections" in workflowObj) {
                "Invalid workflow: must contain 'steps' and 'connections'"
            }

            val workflow = jsonFormat.decodeFromJsonElement<MasterWorkflowSpecification>(workflowObj)
            currentJson = json

            // Convert fixtureSetup to Setup for storage
            val setup = fixtureSetup?.let { fs ->
                Setup(
                    startingParameters = fs.starting_parameters?.mapValues { it.value.toString() },
                    initialProperties = fs.initial_properties?.mapValues { it.value.toString() },
                )
            }

            load(workflow, setup)

            // Use the original fixtureSetup directly with the engine
            actionIndex = 0
            engine = WorkflowEngine(workflow, fixtureSetup).also { it.start() }
            syncState()
        } catch (e: Exception) {
            _state.value = CoordinatorState(error = e.message ?: "Unknown error")
        }
    }

    fun submitAction(action: UserAction) {
        try {
            engine?.submitAction(action, actionIndex)
            actionIndex++
            syncState()
        } catch (e: Exception) {
            _state.value = _state.value.copy(error = e.message)
        }
    }

    fun reset() {
        engine = null
        currentSpec = null
        currentSetup = null
        currentJson = null
        actionIndex = 0
        stepMap.clear()
        _state.value = CoordinatorState()
    }

    fun restart() {
        // Prefer raw JSON path if available (preserves full fixture setup)
        val json = currentJson
        if (json != null) {
            loadAndStart(json)
            return
        }
        // Otherwise use stored spec
        val spec = currentSpec ?: return
        load(spec, currentSetup)
        start()
    }

    private fun syncState() {
        val eng = engine ?: return
        val trace = eng.getTrace()

        val lastState = mutableMapOf<String, String>()
        for (entry in trace) {
            lastState[entry.step_oid] = entry.state
        }
        val executingSteps = lastState
            .filter { it.value == "EXECUTING" }
            .keys
            .mapNotNull { stepMap[it] }

        _state.value = CoordinatorState(
            workflowState = eng.getWorkflowState(),
            executingSteps = executingSteps,
            trace = trace,
            properties = eng.getProperties(),
            error = null,
        )
    }
}
```

- [ ] **Step 2: Verify build compiles**

Run from `engines/android-ui/`:
```bash
./gradlew compileDebugKotlin 2>&1 | tail -5
```
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 3: Commit**

```bash
git add engines/android-ui/app/src/main/kotlin/io/saturnis/trajectory/coordinator/WorkflowCoordinator.kt
git commit -m "feat(android): add load()+start() API to WorkflowCoordinator"
```

---

## Task 4: Create FileProcessor

**Files:**
- Create: `engines/android-ui/app/src/main/kotlin/io/saturnis/trajectory/manager/FileProcessor.kt`

- [ ] **Step 1: Create FileProcessor.kt**

```kotlin
package io.saturnis.trajectory.manager

import android.content.ContentResolver
import android.net.Uri
import android.provider.OpenableColumns
import com.trajectoryruntime.engine.MasterWorkflowSpecification
import io.saturnis.trajectory.coordinator.Setup
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.*
import java.io.InputStream
import java.util.zip.ZipInputStream

sealed class FileResult {
    data class Success(
        val spec: MasterWorkflowSpecification,
        val mediaMap: Map<String, ByteArray> = emptyMap(),
        val environments: List<JsonObject> = emptyList(),
        val setup: Setup? = null,
    ) : FileResult()

    data class Error(val message: String) : FileResult()
}

object FileProcessor {

    private val jsonFormat = Json { ignoreUnknownKeys = true }

    /** Process a file from a ContentResolver URI. Runs on IO dispatcher. */
    suspend fun processUri(contentResolver: ContentResolver, uri: Uri): FileResult =
        withContext(Dispatchers.IO) {
            try {
                val displayName = getDisplayName(contentResolver, uri)
                val stream = contentResolver.openInputStream(uri)
                    ?: return@withContext FileResult.Error("Cannot open file")

                stream.use { inputStream ->
                    when {
                        displayName.endsWith(".WFmasterX", ignoreCase = true) ->
                            processZip(inputStream)
                        displayName.endsWith(".json", ignoreCase = true) ||
                        displayName.endsWith(".WFmaster", ignoreCase = true) ->
                            processJsonStream(inputStream)
                        else -> {
                            // Try ZIP magic bytes, fall back to JSON
                            val bytes = inputStream.readBytes()
                            if (bytes.size >= 2 && bytes[0] == 0x50.toByte() && bytes[1] == 0x4B.toByte()) {
                                processZip(bytes.inputStream())
                            } else {
                                processJsonString(bytes.decodeToString())
                            }
                        }
                    }
                }
            } catch (e: Exception) {
                FileResult.Error("Error processing file: ${e.message}")
            }
        }

    /** Process a raw JSON string (used for bundled fixtures). */
    fun processJson(json: String): FileResult = processJsonString(json)

    private fun processZip(stream: InputStream): FileResult {
        val entries = mutableMapOf<String, ByteArray>()
        ZipInputStream(stream).use { zip ->
            var entry = zip.nextEntry
            while (entry != null) {
                if (!entry.isDirectory) {
                    entries[entry.name] = zip.readBytes()
                }
                zip.closeEntry()
                entry = zip.nextEntry
            }
        }

        // Find .WFmaster spec
        val specEntry = entries.entries.find { it.key.endsWith(".WFmaster", ignoreCase = true) }
            ?: return FileResult.Error("No .WFmaster file found inside archive")

        val spec: MasterWorkflowSpecification = try {
            jsonFormat.decodeFromString(specEntry.value.decodeToString())
        } catch (e: Exception) {
            return FileResult.Error("Failed to parse .WFmaster: ${e.message}")
        }

        // Extract environment libraries
        val environments = entries.entries
            .filter { it.key.endsWith(".WFenvir", ignoreCase = true) }
            .mapNotNull { (_, bytes) ->
                try {
                    jsonFormat.parseToJsonElement(bytes.decodeToString()).jsonObject
                } catch (_: Exception) { null }
            }

        // Build media map (everything else)
        val mediaMap = mutableMapOf<String, ByteArray>()
        for ((name, bytes) in entries) {
            if (name.endsWith(".WFmaster", ignoreCase = true)) continue
            if (name.endsWith(".WFenvir", ignoreCase = true)) continue
            if (name.endsWith(".json", ignoreCase = true)) continue

            mediaMap[name] = bytes
            // Also key by basename
            val basename = if (name.contains('/')) name.substringAfterLast('/') else name
            if (basename != name) mediaMap[basename] = bytes
            // Also key by bare name (strip OID prefix like "123-filename.jpg")
            val bare = basename.replace(Regex("^\\d+-"), "")
            if (bare != basename && bare !in mediaMap) mediaMap[bare] = bytes
        }

        return FileResult.Success(spec = spec, mediaMap = mediaMap, environments = environments)
    }

    private fun processJsonStream(stream: InputStream): FileResult {
        val text = stream.bufferedReader().use { it.readText() }
        return processJsonString(text)
    }

    private fun processJsonString(text: String): FileResult {
        val parsed: JsonObject = try {
            jsonFormat.parseToJsonElement(text).jsonObject
        } catch (e: Exception) {
            return FileResult.Error("JSON parse error: ${e.message}")
        }

        val workflowObj: JsonObject
        var setup: Setup? = null

        if ("workflow" in parsed) {
            workflowObj = parsed["workflow"]!!.jsonObject
            // Extract setup if present
            parsed["setup"]?.jsonObject?.let { setupObj ->
                val startParams = setupObj["starting_parameters"]?.jsonObject
                    ?.mapValues { it.value.jsonPrimitive.content }
                val initProps = setupObj["initial_properties"]?.jsonObject
                    ?.mapValues { it.value.jsonPrimitive.content }
                setup = Setup(startingParameters = startParams, initialProperties = initProps)
            }
        } else {
            workflowObj = parsed
        }

        val spec: MasterWorkflowSpecification = try {
            jsonFormat.decodeFromJsonElement(workflowObj)
        } catch (e: Exception) {
            return FileResult.Error("Invalid workflow format: ${e.message}")
        }

        return FileResult.Success(spec = spec, setup = setup)
    }

    private fun getDisplayName(contentResolver: ContentResolver, uri: Uri): String {
        if (uri.scheme == "content") {
            contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    if (idx >= 0) return cursor.getString(idx)
                }
            }
        }
        return uri.lastPathSegment ?: "unknown"
    }
}
```

- [ ] **Step 2: Verify build compiles**

Run from `engines/android-ui/`:
```bash
./gradlew compileDebugKotlin 2>&1 | tail -5
```
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 3: Commit**

```bash
git add engines/android-ui/app/src/main/kotlin/io/saturnis/trajectory/manager/FileProcessor.kt
git commit -m "feat(android): add FileProcessor for ZIP and JSON workflow files"
```

---

## Task 5: Create WorkflowManager

**Files:**
- Create: `engines/android-ui/app/src/main/kotlin/io/saturnis/trajectory/manager/WorkflowManager.kt`

- [ ] **Step 1: Create WorkflowManager.kt**

```kotlin
package io.saturnis.trajectory.manager

import android.content.ContentResolver
import android.content.Context
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.trajectoryruntime.engine.WorkflowState
import io.saturnis.trajectory.coordinator.Setup
import io.saturnis.trajectory.coordinator.WorkflowCoordinator
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.util.UUID

class WorkflowManager(application: android.app.Application) : AndroidViewModel(application) {

    private val _state = MutableStateFlow(ManagerState())
    val state: StateFlow<ManagerState> = _state.asStateFlow()

    private val coordinatorJobs = mutableMapOf<String, () -> Unit>()
    private val appContext: Context get() = getApplication<android.app.Application>().applicationContext

    companion object {
        private const val PREFS_KEY = "trajectory-completed-history"
        private const val MAX_COMPLETED = 50
        private const val MAX_TRACE_PER_WORKFLOW = 500
        private val jsonFormat = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    }

    init {
        // Load completed history once at creation
        val completed = loadCompletedHistory(appContext)
        if (completed.isNotEmpty()) {
            _state.value = _state.value.copy(completed = completed)
        }
    }

    /** Load a workflow file from a URI. */
    fun loadFromUri(contentResolver: ContentResolver, uri: Uri) {
        viewModelScope.launch {
            when (val result = FileProcessor.processUri(contentResolver, uri)) {
                is FileResult.Success -> addWorkflowFromResult(result)
                is FileResult.Error -> _state.value = _state.value.copy(error = result.message)
            }
        }
    }

    /** Load a workflow from a raw JSON string (fixtures). */
    fun loadFromJson(json: String) {
        when (val result = FileProcessor.processJson(json)) {
            is FileResult.Success -> addWorkflowFromResult(result)
            is FileResult.Error -> _state.value = _state.value.copy(error = result.message)
        }
    }

    private fun addWorkflowFromResult(result: FileResult.Success) {
        val spec = result.spec
        val current = _state.value

        // Duplicate check
        if (current.loaded.any { it.specOid == spec.oid }) {
            _state.value = current.copy(error = "This workflow is already loaded")
            return
        }

        val loaded = LoadedWorkflow(
            id = UUID.randomUUID().toString(),
            specOid = spec.oid,
            localId = spec.local_id,
            version = spec.version,
            description = spec.description,
            spec = spec,
            mediaMap = result.mediaMap,
            environments = result.environments,
            loadedAt = System.currentTimeMillis(),
        )

        _state.value = current.copy(
            loaded = current.loaded + loaded,
            error = null,
        )
    }

    /** Remove a loaded workflow. */
    fun removeLoadedWorkflow(id: String) {
        _state.value = _state.value.copy(
            loaded = _state.value.loaded.filter { it.id != id },
        )
    }

    /** Start a workflow instance from a loaded spec. */
    fun startWorkflow(loadedId: String, startingParams: Map<String, String>? = null) {
        val loaded = _state.value.loaded.find { it.id == loadedId } ?: return

        val instanceId = UUID.randomUUID().toString()
        val coordinator = WorkflowCoordinator()
        val setup = if (startingParams != null) Setup(startingParameters = startingParams) else null

        coordinator.load(loaded.spec, setup)

        val active = ActiveWorkflow(
            id = instanceId,
            sourceSpecId = loaded.id,
            localId = loaded.localId,
            version = loaded.version,
            coordinator = coordinator,
            startedAt = System.currentTimeMillis(),
        )

        _state.value = _state.value.copy(
            active = _state.value.active + active,
            currentScreen = Screen.Active(instanceId),
        )

        // Subscribe to detect completion — use launch{} to defer state update
        val job = viewModelScope.launch {
            coordinator.state.collect { coordState ->
                val ws = coordState.workflowState
                if (ws == WorkflowState.COMPLETED || ws == WorkflowState.ABORTED ||
                    ws == WorkflowState.STOPPED || ws == WorkflowState.ERRORED
                ) {
                    // Defer to next frame to avoid modifying state during collection
                    launch { completeWorkflow(instanceId, coordState) }
                }
            }
        }
        coordinatorJobs[instanceId] = { job.cancel() }

        // Start execution after subscription is set up
        coordinator.start()
    }

    private fun completeWorkflow(
        instanceId: String,
        finalState: io.saturnis.trajectory.coordinator.CoordinatorState,
    ) {
        val current = _state.value
        val active = current.active.find { it.id == instanceId } ?: return

        // Cancel subscription
        coordinatorJobs.remove(instanceId)?.invoke()

        val completed = CompletedWorkflow(
            id = active.id,
            sourceSpecId = active.sourceSpecId,
            localId = active.localId,
            version = active.version,
            finalState = finalState.workflowState.name,
            startedAt = active.startedAt,
            finishedAt = System.currentTimeMillis(),
            trace = finalState.trace,
            properties = finalState.properties,
        )

        // Reset coordinator
        active.coordinator.reset()

        val newActive = current.active.filter { it.id != instanceId }
        val newCompleted = listOf(completed) + current.completed

        // Navigate home if we were viewing this workflow
        val newScreen = when (val screen = current.currentScreen) {
            is Screen.Active -> if (screen.workflowId == instanceId) Screen.Home else screen
            else -> current.currentScreen
        }

        _state.value = current.copy(
            active = newActive,
            completed = newCompleted,
            currentScreen = newScreen,
        )

        persistCompletedHistory(newCompleted)
    }

    /** Focus an active workflow (navigate to it). */
    fun focusWorkflow(id: String) {
        if (_state.value.active.any { it.id == id }) {
            _state.value = _state.value.copy(currentScreen = Screen.Active(id))
        }
    }

    /** Navigate to home screen. */
    fun navigateHome() {
        _state.value = _state.value.copy(currentScreen = Screen.Home)
    }

    /** Get coordinator for an active workflow. */
    fun getCoordinator(id: String): WorkflowCoordinator? {
        return _state.value.active.find { it.id == id }?.coordinator
    }

    /** Remove a single completed workflow. */
    fun removeCompletedWorkflow(id: String) {
        val newCompleted = _state.value.completed.filter { it.id != id }
        _state.value = _state.value.copy(completed = newCompleted)
        persistCompletedHistory(newCompleted)
    }

    /** Clear all completed workflows. */
    fun clearCompleted() {
        _state.value = _state.value.copy(completed = emptyList())
        persistCompletedHistory(emptyList())
    }

    /** Clear the current error. */
    fun clearError() {
        _state.value = _state.value.copy(error = null)
    }

    // -- Persistence --

    @kotlinx.serialization.Serializable
    private data class PersistedCompleted(
        val id: String,
        val sourceSpecId: String,
        val localId: String,
        val version: String,
        val finalState: String,
        val startedAt: Long,
        val finishedAt: Long,
    )

    private fun persistCompletedHistory(completed: List<CompletedWorkflow>) {
        try {
            val capped = completed.take(MAX_COMPLETED).map { wf ->
                PersistedCompleted(
                    id = wf.id,
                    sourceSpecId = wf.sourceSpecId,
                    localId = wf.localId,
                    version = wf.version,
                    finalState = wf.finalState,
                    startedAt = wf.startedAt,
                    finishedAt = wf.finishedAt,
                )
            }
            val json = jsonFormat.encodeToString(capped)
            appContext.getSharedPreferences("trajectory", Context.MODE_PRIVATE)
                .edit().putString(PREFS_KEY, json).apply()
        } catch (_: Exception) {
            // Storage full — silently fail
        }
    }

    private fun loadCompletedHistory(context: Context): List<CompletedWorkflow> {
        return try {
            val json = context.getSharedPreferences("trajectory", Context.MODE_PRIVATE)
                .getString(PREFS_KEY, null) ?: return emptyList()
            val persisted = jsonFormat.decodeFromString<List<PersistedCompleted>>(json)
            persisted.map { p ->
                CompletedWorkflow(
                    id = p.id,
                    sourceSpecId = p.sourceSpecId,
                    localId = p.localId,
                    version = p.version,
                    finalState = p.finalState,
                    startedAt = p.startedAt,
                    finishedAt = p.finishedAt,
                )
            }
        } catch (_: Exception) {
            emptyList()
        }
    }

    override fun onCleared() {
        super.onCleared()
        coordinatorJobs.values.forEach { it.invoke() }
        coordinatorJobs.clear()
    }
}
```

- [ ] **Step 2: Verify build compiles**

Run from `engines/android-ui/`:
```bash
./gradlew compileDebugKotlin 2>&1 | tail -5
```
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 3: Commit**

```bash
git add engines/android-ui/app/src/main/kotlin/io/saturnis/trajectory/manager/WorkflowManager.kt
git commit -m "feat(android): add WorkflowManager with multi-workflow state management"
```

---

## Task 6: Create TitleBar component

**Files:**
- Create: `engines/android-ui/app/src/main/kotlin/io/saturnis/trajectory/components/TitleBar.kt`

- [ ] **Step 1: Create TitleBar.kt**

```kotlin
package io.saturnis.trajectory.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight

enum class SortMode { NAME, DATE }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeTitleBar(
    sortMode: SortMode,
    onSortChange: (SortMode) -> Unit,
    onLoadFixture: () -> Unit,
) {
    var menuExpanded by remember { mutableStateOf(false) }

    TopAppBar(
        title = {
            Text(
                text = "Trajectory Mobile",
                fontWeight = FontWeight.Bold,
            )
        },
        actions = {
            Box {
                IconButton(onClick = { menuExpanded = true }) {
                    Text("⋮", style = MaterialTheme.typography.titleLarge)
                }
                DropdownMenu(
                    expanded = menuExpanded,
                    onDismissRequest = { menuExpanded = false },
                ) {
                    DropdownMenuItem(
                        text = { Text("Sort by Name") },
                        onClick = { onSortChange(SortMode.NAME); menuExpanded = false },
                        enabled = sortMode != SortMode.NAME,
                    )
                    DropdownMenuItem(
                        text = { Text("Sort by Date") },
                        onClick = { onSortChange(SortMode.DATE); menuExpanded = false },
                        enabled = sortMode != SortMode.DATE,
                    )
                    HorizontalDivider()
                    DropdownMenuItem(
                        text = { Text("Load Fixture") },
                        onClick = { onLoadFixture(); menuExpanded = false },
                    )
                }
            }
        },
        colors = TopAppBarDefaults.topAppBarColors(
            containerColor = MaterialTheme.colorScheme.primary,
            titleContentColor = MaterialTheme.colorScheme.onPrimary,
            actionIconContentColor = MaterialTheme.colorScheme.onPrimary,
        ),
        modifier = Modifier.statusBarsPadding(),
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ActiveTitleBar(
    localId: String,
    version: String,
    onBack: () -> Unit,
) {
    TopAppBar(
        title = {
            Column {
                Text(text = localId, fontWeight = FontWeight.Bold)
                Text(
                    text = "v$version",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.7f),
                )
            }
        },
        navigationIcon = {
            IconButton(onClick = onBack) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = "Back",
                )
            }
        },
        colors = TopAppBarDefaults.topAppBarColors(
            containerColor = MaterialTheme.colorScheme.primary,
            titleContentColor = MaterialTheme.colorScheme.onPrimary,
            navigationIconContentColor = MaterialTheme.colorScheme.onPrimary,
        ),
        modifier = Modifier.statusBarsPadding(),
    )
}
```

- [ ] **Step 2: Verify build compiles**

Run from `engines/android-ui/`:
```bash
./gradlew compileDebugKotlin 2>&1 | tail -5
```
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 3: Commit**

```bash
git add engines/android-ui/app/src/main/kotlin/io/saturnis/trajectory/components/TitleBar.kt
git commit -m "feat(android): add TitleBar component for Home and Active screens"
```

---

## Task 7: Create WorkflowStartDialog

**Files:**
- Create: `engines/android-ui/app/src/main/kotlin/io/saturnis/trajectory/components/WorkflowStartDialog.kt`

- [ ] **Step 1: Create WorkflowStartDialog.kt**

```kotlin
package io.saturnis.trajectory.components

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import io.saturnis.trajectory.manager.LoadedWorkflow

@Composable
fun WorkflowStartDialog(
    workflow: LoadedWorkflow,
    onStart: (id: String, params: Map<String, String>?) -> Unit,
    onCancel: () -> Unit,
) {
    val params = workflow.spec.starting_parameter_specifications ?: emptyList()
    val paramValues = remember {
        mutableStateMapOf<String, String>().apply {
            for (p in params) {
                put(p.id, p.default_value ?: "")
            }
        }
    }

    AlertDialog(
        onDismissRequest = onCancel,
        title = { Text(workflow.localId) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Version ${workflow.version}")
                if (!workflow.description.isNullOrBlank()) {
                    Text(
                        text = workflow.description,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                if (params.isNotEmpty()) {
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "Input Parameters",
                        style = MaterialTheme.typography.titleSmall,
                    )
                    params.forEach { p ->
                        OutlinedTextField(
                            value = paramValues[p.id] ?: "",
                            onValueChange = { paramValues[p.id] = it },
                            label = { Text(p.description ?: p.id) },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                        )
                    }
                }
            }
        },
        confirmButton = {
            Button(onClick = {
                val startParams = if (params.isNotEmpty()) paramValues.toMap() else null
                onStart(workflow.id, startParams)
            }) {
                Text("Start")
            }
        },
        dismissButton = {
            TextButton(onClick = onCancel) {
                Text("Cancel")
            }
        },
    )
}
```

- [ ] **Step 2: Verify build compiles**

Run from `engines/android-ui/`:
```bash
./gradlew compileDebugKotlin 2>&1 | tail -5
```
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 3: Commit**

```bash
git add engines/android-ui/app/src/main/kotlin/io/saturnis/trajectory/components/WorkflowStartDialog.kt
git commit -m "feat(android): add WorkflowStartDialog with parameter input"
```

---

## Task 8: Create HomeScreen

**Files:**
- Create: `engines/android-ui/app/src/main/kotlin/io/saturnis/trajectory/components/HomeScreen.kt`

- [ ] **Step 1: Create HomeScreen.kt**

```kotlin
package io.saturnis.trajectory.components

import android.content.Context
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import io.saturnis.trajectory.manager.*
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    manager: WorkflowManager,
    state: ManagerState,
) {
    val context = LocalContext.current
    val snackbarHostState = remember { SnackbarHostState() }
    var sortMode by remember { mutableStateOf(SortMode.DATE) }
    var startTarget by remember { mutableStateOf<LoadedWorkflow?>(null) }
    var showFixtureDialog by remember { mutableStateOf(false) }

    // File picker
    val filePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument()
    ) { uri ->
        if (uri != null) {
            manager.loadFromUri(context.contentResolver, uri)
        }
    }

    // Show errors as snackbar
    LaunchedEffect(state.error) {
        if (state.error != null) {
            snackbarHostState.showSnackbar(state.error)
            manager.clearError()
        }
    }

    // Sort loaded workflows
    val sortedLoaded = remember(state.loaded, sortMode) {
        when (sortMode) {
            SortMode.NAME -> state.loaded.sortedBy { it.localId }
            SortMode.DATE -> state.loaded.sortedByDescending { it.loadedAt }
        }
    }

    Scaffold(
        topBar = {
            HomeTitleBar(
                sortMode = sortMode,
                onSortChange = { sortMode = it },
                onLoadFixture = { showFixtureDialog = true },
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState()),
        ) {
            // Load button toolbar
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
            ) {
                FilledTonalButton(
                    onClick = { filePickerLauncher.launch(arrayOf("*/*")) },
                ) {
                    Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Load Workflow")
                }
            }

            // Loaded Workflows section
            SectionHeader("Loaded Workflows")
            if (sortedLoaded.isEmpty()) {
                EmptyText("No workflows loaded")
            } else {
                sortedLoaded.forEach { wf ->
                    SwipeToDeleteItem(
                        onDelete = { manager.removeLoadedWorkflow(wf.id) },
                    ) {
                        ListItem(
                            headlineContent = { Text(wf.localId) },
                            trailingContent = {
                                Surface(
                                    color = MaterialTheme.colorScheme.secondaryContainer,
                                    shape = RoundedCornerShape(4.dp),
                                ) {
                                    Text(
                                        text = "v${wf.version}",
                                        style = MaterialTheme.typography.labelSmall,
                                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                    )
                                }
                            },
                            modifier = Modifier.clickable { startTarget = wf },
                        )
                    }
                    HorizontalDivider()
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            // Active Workflows section
            SectionHeader("Active Workflows")
            if (state.active.isEmpty()) {
                EmptyText("No active workflows")
            } else {
                state.active.forEach { wf ->
                    ListItem(
                        headlineContent = { Text(wf.localId) },
                        trailingContent = {
                            Surface(
                                color = MaterialTheme.colorScheme.primary,
                                shape = RoundedCornerShape(4.dp),
                            ) {
                                Text(
                                    text = "Running",
                                    color = MaterialTheme.colorScheme.onPrimary,
                                    style = MaterialTheme.typography.labelSmall,
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                                )
                            }
                        },
                        modifier = Modifier.clickable { manager.focusWorkflow(wf.id) },
                    )
                    HorizontalDivider()
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            // Completed Workflows section
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "Completed",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                )
                if (state.completed.isNotEmpty()) {
                    TextButton(onClick = { manager.clearCompleted() }) {
                        Text("Clear all")
                    }
                }
            }
            if (state.completed.isEmpty()) {
                EmptyText("No completed workflows")
            } else {
                state.completed.forEach { wf ->
                    SwipeToDeleteItem(
                        onDelete = { manager.removeCompletedWorkflow(wf.id) },
                    ) {
                        ListItem(
                            headlineContent = {
                                Text("${wf.localId} v${wf.version}")
                            },
                            supportingContent = {
                                Text(formatTime(wf.finishedAt))
                            },
                            trailingContent = {
                                StateBadge(wf.finalState)
                            },
                        )
                    }
                    HorizontalDivider()
                }
            }

            Spacer(modifier = Modifier.height(16.dp))
        }
    }

    // Start dialog
    if (startTarget != null) {
        WorkflowStartDialog(
            workflow = startTarget!!,
            onStart = { id, params ->
                manager.startWorkflow(id, params)
                startTarget = null
            },
            onCancel = { startTarget = null },
        )
    }

    // Fixture dialog
    if (showFixtureDialog) {
        FixtureDialog(
            context = context,
            onSelect = { json ->
                manager.loadFromJson(json)
                showFixtureDialog = false
            },
            onDismiss = { showFixtureDialog = false },
        )
    }
}

@Composable
private fun SectionHeader(title: String) {
    Text(
        text = title,
        style = MaterialTheme.typography.titleSmall,
        fontWeight = FontWeight.Bold,
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
    )
}

@Composable
private fun EmptyText(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
    )
}

@Composable
private fun StateBadge(state: String) {
    val color = when (state) {
        "COMPLETED" -> Color(0xFF16A34A)
        "ABORTED" -> Color(0xFFD97706)
        "STOPPED" -> Color(0xFFCA8A04)
        "ERRORED" -> Color(0xFFDC2626)
        else -> Color(0xFF9CA3AF)
    }
    Surface(
        color = color,
        shape = RoundedCornerShape(4.dp),
    ) {
        Text(
            text = state,
            color = Color.White,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SwipeToDeleteItem(
    onDelete: () -> Unit,
    content: @Composable () -> Unit,
) {
    val dismissState = rememberSwipeToDismissBoxState(
        confirmValueChange = { value ->
            if (value == SwipeToDismissBoxValue.EndToStart) {
                onDelete()
                true
            } else false
        },
    )

    SwipeToDismissBox(
        state = dismissState,
        backgroundContent = {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(MaterialTheme.colorScheme.error)
                    .padding(horizontal = 20.dp),
                contentAlignment = Alignment.CenterEnd,
            ) {
                Icon(
                    imageVector = Icons.Default.Delete,
                    contentDescription = "Delete",
                    tint = MaterialTheme.colorScheme.onError,
                )
            }
        },
        enableDismissFromStartToEnd = false,
    ) {
        Surface { content() }
    }
}

@Composable
private fun FixtureDialog(
    context: Context,
    onSelect: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    val fixtures = remember {
        try {
            context.assets.list("fixtures")
                ?.filter { it.endsWith(".json") }
                ?.sorted()
                ?: emptyList()
        } catch (_: Exception) {
            emptyList()
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Load Fixture") },
        text = {
            Column {
                if (fixtures.isEmpty()) {
                    Text("No fixtures available")
                } else {
                    fixtures.forEach { name ->
                        TextButton(
                            onClick = {
                                try {
                                    val json = context.assets.open("fixtures/$name")
                                        .bufferedReader().use { it.readText() }
                                    onSelect(json)
                                } catch (_: Exception) { }
                            },
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(name, modifier = Modifier.fillMaxWidth())
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
    )
}

private fun formatTime(timestamp: Long): String {
    return SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(timestamp))
}
```

- [ ] **Step 2: Verify build compiles**

Run from `engines/android-ui/`:
```bash
./gradlew compileDebugKotlin 2>&1 | tail -5
```
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 3: Commit**

```bash
git add engines/android-ui/app/src/main/kotlin/io/saturnis/trajectory/components/HomeScreen.kt
git commit -m "feat(android): add HomeScreen with loaded/active/completed sections"
```

---

## Task 9: Create ActiveScreen

**Files:**
- Create: `engines/android-ui/app/src/main/kotlin/io/saturnis/trajectory/components/ActiveScreen.kt`

- [ ] **Step 1: Create ActiveScreen.kt**

Refactor the RUNNING/COMPLETED/terminal views from `WorkflowRunner.kt` into a standalone screen:

```kotlin
package io.saturnis.trajectory.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.trajectoryruntime.engine.WorkflowState
import androidx.activity.compose.BackHandler
import io.saturnis.trajectory.coordinator.WorkflowCoordinator
import io.saturnis.trajectory.coordinator.CoordinatorState
import io.saturnis.trajectory.manager.WorkflowManager

@Composable
fun ActiveScreen(
    workflowId: String,
    manager: WorkflowManager,
) {
    val coordinator = remember(workflowId) { manager.getCoordinator(workflowId) }
    if (coordinator == null) {
        // Workflow no longer active (completed while navigating)
        LaunchedEffect(Unit) { manager.navigateHome() }
        return
    }

    // System back returns to home
    BackHandler { manager.navigateHome() }

    val activeWf = manager.state.collectAsState().value.active.find { it.id == workflowId }
    val state by coordinator.state.collectAsState()

    Scaffold(
        topBar = {
            ActiveTitleBar(
                localId = activeWf?.localId ?: "",
                version = activeWf?.version ?: "",
                onBack = { manager.navigateHome() },
            )
        },
    ) { padding ->
        // No verticalScroll — TraceView uses LazyColumn which cannot nest in scrollable Column
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            when (state.workflowState) {
                WorkflowState.RUNNING -> {
                    RunningContent(coordinator, state, onNavigateHome = { manager.navigateHome() })
                }
                WorkflowState.COMPLETED -> {
                    CompletedContent(coordinator, state, onNavigateHome = { manager.navigateHome() })
                }
                WorkflowState.ABORTED, WorkflowState.STOPPED, WorkflowState.ERRORED -> {
                    TerminalContent(coordinator, state, onNavigateHome = { manager.navigateHome() })
                }
                WorkflowState.IDLE -> {
                    // Shouldn't happen — loading state
                    CircularProgressIndicator(
                        modifier = Modifier
                            .padding(32.dp)
                            .align(Alignment.CenterHorizontally),
                    )
                }
            }
        }
    }
}

@Composable
private fun HeaderBar(
    workflowState: WorkflowState,
    onRestart: () -> Unit,
    onNew: () -> Unit,
) {
    Surface(
        color = MaterialTheme.colorScheme.surfaceVariant,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            val badgeColor = when (workflowState) {
                WorkflowState.RUNNING -> Color(0xFF2563EB)
                WorkflowState.COMPLETED -> Color(0xFF16A34A)
                else -> Color(0xFF9CA3AF)
            }
            Surface(
                color = badgeColor,
                shape = MaterialTheme.shapes.small,
            ) {
                Text(
                    text = workflowState.name,
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
                )
            }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = onRestart) { Text("Restart") }
                OutlinedButton(onClick = onNew) { Text("New") }
            }
        }
    }
}

@Composable
private fun RunningContent(
    coordinator: WorkflowCoordinator,
    state: CoordinatorState,
    onNavigateHome: () -> Unit,
) {
    HeaderBar(
        workflowState = state.workflowState,
        onRestart = { coordinator.restart() },
        onNew = onNavigateHome,
    )

    if (state.error != null) {
        Card(
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.errorContainer,
            ),
            modifier = Modifier.fillMaxWidth().padding(16.dp),
        ) {
            Text(
                text = state.error,
                modifier = Modifier.padding(12.dp),
                color = MaterialTheme.colorScheme.onErrorContainer,
            )
        }
    }

    if (state.executingSteps.isNotEmpty()) {
        Text(
            text = "Active Steps",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(start = 16.dp, top = 12.dp, bottom = 4.dp),
        )

        state.executingSteps.forEach { step ->
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 6.dp),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
            ) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Text(
                        text = "${step.stepType} — ${step.oid}",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.primary,
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    StepRenderer(
                        stepInstance = step,
                        coordinator = coordinator,
                        properties = state.properties,
                    )
                }
            }
        }
    }

    Spacer(modifier = Modifier.height(12.dp))
    TraceView(trace = state.trace, properties = state.properties)
    Spacer(modifier = Modifier.height(16.dp))
}

@Composable
private fun CompletedContent(
    coordinator: WorkflowCoordinator,
    state: CoordinatorState,
    onNavigateHome: () -> Unit,
) {
    HeaderBar(
        workflowState = state.workflowState,
        onRestart = { coordinator.restart() },
        onNew = onNavigateHome,
    )

    Card(
        colors = CardDefaults.cardColors(containerColor = Color(0xFFE8F5E9)),
        modifier = Modifier.fillMaxWidth().padding(16.dp),
    ) {
        Text(
            text = "Workflow completed successfully",
            fontWeight = FontWeight.Bold,
            color = Color(0xFF2E7D32),
            modifier = Modifier.padding(16.dp),
        )
    }

    TraceView(trace = state.trace, properties = state.properties)
    Spacer(modifier = Modifier.height(16.dp))
}

@Composable
private fun TerminalContent(
    coordinator: WorkflowCoordinator,
    state: CoordinatorState,
    onNavigateHome: () -> Unit,
) {
    HeaderBar(
        workflowState = state.workflowState,
        onRestart = { coordinator.restart() },
        onNew = onNavigateHome,
    )

    Text(
        text = "Workflow ${state.workflowState.name}",
        style = MaterialTheme.typography.bodyLarge,
        modifier = Modifier.padding(16.dp),
    )

    TraceView(trace = state.trace, properties = state.properties)
}
```

- [ ] **Step 2: Verify build compiles**

Run from `engines/android-ui/`:
```bash
./gradlew compileDebugKotlin 2>&1 | tail -5
```
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 3: Commit**

```bash
git add engines/android-ui/app/src/main/kotlin/io/saturnis/trajectory/components/ActiveScreen.kt
git commit -m "feat(android): add ActiveScreen with step rendering and trace view"
```

---

## Task 10: Update MainActivity and remove old files

**Files:**
- Modify: `engines/android-ui/app/src/main/kotlin/io/saturnis/trajectory/MainActivity.kt`
- Delete: `engines/android-ui/app/src/main/kotlin/io/saturnis/trajectory/components/WorkflowRunner.kt`
- Delete: `engines/android-ui/app/src/main/kotlin/io/saturnis/trajectory/components/WorkflowLoader.kt`

- [ ] **Step 1: Rewrite MainActivity.kt**

```kotlin
package io.saturnis.trajectory

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import io.saturnis.trajectory.components.ActiveScreen
import io.saturnis.trajectory.components.HomeScreen
import io.saturnis.trajectory.elements.ElementRegistry
import io.saturnis.trajectory.manager.Screen
import io.saturnis.trajectory.manager.WorkflowManager
import io.saturnis.trajectory.theme.TrajectoryTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        ElementRegistry.registerDefaults()
        setContent {
            TrajectoryTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    // WorkflowManager extends AndroidViewModel — init happens in its constructor
                    val manager: WorkflowManager = viewModel()
                    val state by manager.state.collectAsState()

                    when (val screen = state.currentScreen) {
                        is Screen.Home -> HomeScreen(manager = manager, state = state)
                        is Screen.Active -> ActiveScreen(
                            workflowId = screen.workflowId,
                            manager = manager,
                        )
                    }
                }
            }
        }
    }
}
```

- [ ] **Step 2: Delete WorkflowRunner.kt and WorkflowLoader.kt**

```bash
rm engines/android-ui/app/src/main/kotlin/io/saturnis/trajectory/components/WorkflowRunner.kt
rm engines/android-ui/app/src/main/kotlin/io/saturnis/trajectory/components/WorkflowLoader.kt
```

- [ ] **Step 3: Verify build compiles**

Run from `engines/android-ui/`:
```bash
./gradlew compileDebugKotlin 2>&1 | tail -5
```
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 4: Commit**

```bash
git add engines/android-ui/app/src/main/kotlin/io/saturnis/trajectory/MainActivity.kt
git add engines/android-ui/app/src/main/kotlin/io/saturnis/trajectory/components/WorkflowRunner.kt
git add engines/android-ui/app/src/main/kotlin/io/saturnis/trajectory/components/WorkflowLoader.kt
git commit -m "feat(android): wire up HomeScreen/ActiveScreen, remove old WorkflowRunner/Loader"
```

---

## Task 11: Build, install, and verify on device

**Files:** None (verification only)

- [ ] **Step 1: Full build and install**

```bash
cd engines/android-ui && ./gradlew installDebug 2>&1 | tail -10
```
Expected: `BUILD SUCCESSFUL` and `Installed on 1 device`

- [ ] **Step 2: Launch app on device**

```bash
export PATH="$PATH:$LOCALAPPDATA/Android/Sdk/platform-tools"
adb shell am start -n io.saturnis.trajectory/.MainActivity
```

- [ ] **Step 3: Verify home screen renders**

The app should show:
- TitleBar with "Trajectory Mobile" and overflow menu
- "Load Workflow" button
- "Loaded Workflows" section (empty)
- "Active Workflows" section (empty)
- "Completed Workflows" section (may have persisted history)

- [ ] **Step 4: Load a fixture via menu**

Tap overflow menu → "Load Fixture" → select a fixture (e.g., `exec-linear-002-start-ui-end.json`). It should appear in the Loaded Workflows list.

- [ ] **Step 5: Start the workflow**

Tap the loaded workflow → Start dialog appears → tap "Start". Should navigate to ActiveScreen with step rendering.

- [ ] **Step 6: Verify completion**

Complete the workflow by interacting with the steps. On completion, navigate back to home — the workflow should appear in the Completed section with a green "COMPLETED" badge.

- [ ] **Step 7: Verify swipe-to-delete**

Swipe a loaded or completed workflow to the left. Red delete background should appear and the item should be removed.
