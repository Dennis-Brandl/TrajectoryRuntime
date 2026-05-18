# Android Home Screen — Design Spec

**Date:** 2026-03-19
**Goal:** Bring the Android-ui home screen to feature parity with the web-ui, using native Material 3 components.

## 1. Overview

The current Android home screen is a single-workflow loader with bundled fixture dropdown, file picker, and paste-JSON textarea. The web-ui has a full multi-workflow management screen with loaded/active/completed sections, swipe-to-delete, sort options, and a start dialog with parameter input.

This spec replaces the Android home screen with a matching implementation.

## 2. Architecture

### 2.1 New Class: `WorkflowManager`

**Package:** `io.saturnis.trajectory.manager`

Central state holder for the entire app. Manages three workflow lists via a single `StateFlow<ManagerState>`. Must be scoped to a `ViewModel` (or the `Application` class) so it survives configuration changes (rotation).

```kotlin
data class ManagerState(
    val loaded: List<LoadedWorkflow> = emptyList(),
    val active: List<ActiveWorkflow> = emptyList(),
    val completed: List<CompletedWorkflow> = emptyList(),
    val focusedActiveId: String? = null,
    val currentScreen: Screen = Screen.HOME,
    val error: String? = null,
)

sealed class Screen {
    object Home : Screen()
    data class Active(val workflowId: String) : Screen()
}
```

Using a sealed class for `Screen` ties the focused workflow ID to the navigation state, preventing invalid states where `currentScreen == ACTIVE` but no workflow is focused.

**Public API:**

| Method | Description |
|--------|-------------|
| `addWorkflow(spec, mediaMap, environments)` | Adds to loaded list. Returns duplicate ID if specOid already loaded. Shows snackbar error on duplicate. |
| `removeLoadedWorkflow(id)` | Removes from loaded list. |
| `startWorkflow(loadedId, startingParams?)` | Creates a WorkflowCoordinator via `load()` + `start()`, adds to active list, subscribes for terminal state detection. |
| `focusWorkflow(id)` | Sets currentScreen to `Screen.Active(id)`. |
| `removeCompletedWorkflow(id)` | Removes single completed entry. |
| `clearCompleted()` | Removes all completed entries. |
| `navigateHome()` | Sets currentScreen to `Screen.Home`. |
| `getCoordinator(id): WorkflowCoordinator?` | Returns coordinator for an active workflow. |
| `clearError()` | Clears the error field. |

**Completion detection:** WorkflowManager subscribes to each coordinator's `StateFlow`. When a coordinator's `workflowState` reaches COMPLETED, ABORTED, STOPPED, or ERRORED, the manager captures trace, properties, and stepParams from the coordinator's final state, creates a `CompletedWorkflow`, removes from active, and resets the coordinator. This runs in the next frame via `launch { }` to avoid modifying state during collection.

**Persistence:** Completed workflows are persisted to SharedPreferences as JSON (capped at 50 entries). The `trace` field is capped at 500 entries per workflow during serialization; `stepParams` is excluded from persistence. In-memory `CompletedWorkflow` objects carry the full trace and properties for the current session.

**Error display:** File processing errors, duplicate detection, and validation failures set `ManagerState.error`. The HomeScreen observes this and shows a `Snackbar` via `SnackbarHostState`, then calls `clearError()`.

### 2.2 Data Model

**Package:** `io.saturnis.trajectory.manager`

Display name decision: We use `localId` as the primary display name everywhere (matching how the web-ui displays workflows). The web-ui's separate `name` field (set to `spec.description || spec.oid`) is not needed since `localId` is always present and more meaningful to users.

```kotlin
data class LoadedWorkflow(
    val id: String,              // UUID
    val specOid: String,         // from spec.oid — used for dedup
    val localId: String,         // from spec.local_id — primary display name
    val version: String,         // from spec.version
    val description: String?,    // from spec.description (nullable — many specs omit it)
    val spec: MasterWorkflowSpecification,
    val mediaMap: Map<String, ByteArray>,
    val environments: List<JsonObject>,
    val loadedAt: Long,          // System.currentTimeMillis()
)

data class ActiveWorkflow(
    val id: String,              // UUID
    val sourceSpecId: String,    // links back to LoadedWorkflow.id
    val localId: String,
    val version: String,
    val coordinator: WorkflowCoordinator,
    val startedAt: Long,
)

data class CompletedWorkflow(
    val id: String,
    val sourceSpecId: String,
    val localId: String,
    val version: String,
    val finalState: String,      // "COMPLETED" | "ABORTED" | "STOPPED" | "ERRORED"
    val startedAt: Long,
    val finishedAt: Long,
    val trace: List<TraceEntry>, // full trace from coordinator snapshot
    val properties: Map<String, String>, // final property values
)
```

### 2.3 WorkflowCoordinator API Changes

The existing `WorkflowCoordinator` has a monolithic `loadAndStart(json: String)` that parses JSON internally. The `WorkflowManager` needs to pass a pre-parsed spec with optional setup parameters. Add these methods:

```kotlin
/** Load a pre-parsed spec with optional setup. Does not start execution. */
fun load(
    spec: MasterWorkflowSpecification,
    setup: Setup? = null,
    mediaMap: Map<String, ByteArray> = emptyMap(),
)

/** Start execution. Must call load() first. */
fun start()

data class Setup(
    val startingParameters: Map<String, String>? = null,
    val initialProperties: Map<String, String>? = null,
)
```

The existing `loadAndStart(json)` remains for backward compatibility (fixtures) but delegates to `load()` + `start()` internally.

**Restart semantics:** `restart()` re-invokes `load()` + `start()` with the stored spec and setup. The same `ActiveWorkflow` entry is reused — no new entry is created. The coordinator resets its internal engine and starts fresh.

### 2.4 File Processing: `FileProcessor`

**Package:** `io.saturnis.trajectory.manager`

Handles two file formats. All processing runs on `Dispatchers.IO` via `withContext`.

**`.WFmasterX` (ZIP):**
1. Open as `ZipInputStream` from the `ContentResolver` URI
2. Find entry ending in `.WFmaster` — parse as `MasterWorkflowSpecification`
3. Find entries ending in `.WFenvir` — parse as environment library JSON
4. Remaining non-directory entries — read as `ByteArray` for media, keyed by full path, basename, and bare name (strip numeric OID prefix like `{oid}-{filename}`)
5. Validate spec via KMP engine

**`.json` / `.WFmaster`:**
1. Read as text from `ContentResolver` URI, parse JSON
2. Support test fixture wrapper (check for `workflow` key) or raw spec
3. If fixture wrapper has `setup` field, extract `starting_parameters` and `initial_properties`
4. Validate spec

**Return type:**
```kotlin
sealed class FileResult {
    data class Success(
        val spec: MasterWorkflowSpecification,
        val mediaMap: Map<String, ByteArray>,
        val environments: List<JsonObject>,
        val setup: WorkflowCoordinator.Setup? = null,
    ) : FileResult()
    data class Error(val message: String) : FileResult()
}
```

**MIME type handling:** The file picker uses `ActivityResultContracts.OpenDocument` with `arrayOf("*/*")` since `.WFmasterX` and `.WFmaster` have no registered MIME types. The `FileProcessor` determines format by file extension from the URI's display name, falling back to content inspection (check for ZIP magic bytes `PK`).

**Media resolution:** `ByteArray` media entries are converted to `ImageBitmap` at render time via `BitmapFactory.decodeByteArray()`. This is done in the element composables that need images. No external image loading library is required for this.

### 2.5 Navigation

Replace the current state-based routing in `WorkflowRunner` with `WorkflowManager.currentScreen`:

- `Screen.Home` → `HomeScreen` composable
- `Screen.Active(id)` → `ActiveScreen` composable (existing step/form/trace rendering, refactored out of `WorkflowRunner`)

`MainActivity` creates a `WorkflowManager` inside a `ViewModel`, observes `state.currentScreen`, and renders the appropriate screen. Back press on `Screen.Active` calls `navigateHome()`. Back press on `Screen.Home` exits the app.

## 3. UI Components

### 3.1 HomeScreen

Top-level composable matching the web-ui layout. Uses `Scaffold` with `SnackbarHost` for error display.

```
┌──────────────────────────────┐
│ TitleBar: "Trajectory Mobile"│
│           [⋮ menu]           │
├──────────────────────────────┤
│ [+ Load Workflow]            │
├──────────────────────────────┤
│ ▸ Loaded Workflows           │
│  ┌────────────────────────┐  │
│  │ MyWorkflow  v1.0    ⟵swipe│
│  │ OtherFlow   v2.1    ⟵swipe│
│  └────────────────────────┘  │
├──────────────────────────────┤
│ ▸ Active Workflows           │
│  ┌────────────────────────┐  │
│  │ MyWorkflow  v1.0 [Running]│
│  └────────────────────────┘  │
├──────────────────────────────┤
│ ▸ Completed      [Clear all] │
│  ┌────────────────────────┐  │
│  │ OtherFlow v2.1 14:30   │  │
│  │            [COMPLETED]  │  │
│  └────────────────────────┘  │
└──────────────────────────────┘
```

**Toolbar:**
- `FilledTonalButton` with `+` icon: "Load Workflow"
- Opens system file picker via `ActivityResultContracts.OpenDocument` with `arrayOf("*/*")`
- Bundled fixtures remain accessible via the TitleBar overflow menu as a "Load Fixture" option (dev convenience)

**Loaded Workflows section:**
- Section header: "Loaded Workflows" as `Text(style = titleSmall)`
- Each item: `SwipeToDismissBox` (M3) wrapping a `ListItem`
  - `headlineContent`: localId
  - `trailingContent`: version badge
  - Tap → opens `WorkflowStartDialog`
  - Swipe end-to-start → red background with trash icon, calls `removeLoadedWorkflow(id)`
  - Delete confirmation: controlled by a preference (default: confirm for loaded, no confirm for completed — matching web-ui's `trajectory-confirm-delete-loaded` / `trajectory-confirm-delete-completed` defaults). Confirmation uses `AlertDialog`.
- Empty state: "No workflows loaded" in secondary text
- Sort: applied to loaded list only (matching web-ui). Default: by date (most recent first). "Sort by Name" sorts by `localId` alphabetically.

**Active Workflows section:**
- Section header: "Active Workflows"
- Each item: `ListItem`
  - `headlineContent`: localId
  - `trailingContent`: "Running" badge (`Surface` with `primary` color, small rounded chip)
  - Tap → `focusWorkflow(id)` (navigates to ACTIVE screen)
- Empty state: "No active workflows"

**Completed Workflows section:**
- Section header row: "Completed" + "Clear all" `TextButton` (only when list non-empty)
- Sorted by `finishedAt` descending (most recent first) — not affected by the sort menu
- Each item: `SwipeToDismissBox` wrapping a `ListItem`
  - `headlineContent`: localId + version
  - `supportingContent`: formatted timestamp (HH:mm)
  - `trailingContent`: state badge with color:
    - COMPLETED → green
    - ABORTED → orange
    - STOPPED → yellow
    - ERRORED → red
  - Swipe end-to-start → removes from completed (no confirmation by default)
- Empty state: "No completed workflows"

### 3.2 WorkflowStartDialog

`AlertDialog` that appears when tapping a loaded workflow:

```
┌─────────────────────────┐
│  MyWorkflow              │
│  Version 1.0             │
│  "Description text..."   │
│                          │
│  Input Parameters        │
│  ┌─────────────────────┐ │
│  │ Param 1: [_________]│ │
│  │ Param 2: [_________]│ │
│  └─────────────────────┘ │
│                          │
│  [Cancel]      [Start]   │
└─────────────────────────┘
```

- Title: workflow `localId`
- Supporting text: version + description (description omitted if null)
- Parameter fields: `OutlinedTextField` for each `starting_parameter_specification`
  - Pre-filled with `default_value`
  - Label from `description` or `id`
- Confirm button: "Start" — calls `manager.startWorkflow(id, params)`, navigates to ACTIVE screen
- Dismiss button: "Cancel"
- Only shows parameter section if `starting_parameter_specifications` is non-empty

### 3.3 ActiveScreen

Refactored from the existing `WorkflowRunner` RUNNING/COMPLETED/terminal state views:

- Top bar with workflow localId + version, back arrow to HOME
- Step rendering via existing `StepRenderer` / `FormRenderer`
- Trace view via existing `TraceView`
- Restart / New buttons in header bar:
  - **Restart**: Calls `coordinator.restart()` — reuses the same ActiveWorkflow entry
  - **New**: Calls `manager.navigateHome()` — returns to home screen

### 3.4 TitleBar

A new `TitleBar` composable replacing the inline header `Surface` from `WorkflowRunner`:

- HOME screen: Shows "Trajectory Mobile" + overflow menu with:
  - Sort by Name
  - Sort by Date
  - Load Fixture (opens fixture list dialog)
- ACTIVE screen: Shows workflow localId + version, back arrow icon button

## 4. File Changes

### New Files
| File | Purpose |
|------|---------|
| `manager/WorkflowManager.kt` | Central state management with ViewModel scoping |
| `manager/Types.kt` | LoadedWorkflow, ActiveWorkflow, CompletedWorkflow data classes |
| `manager/FileProcessor.kt` | ZIP and JSON file processing from ContentResolver URIs |
| `components/HomeScreen.kt` | Home screen composable with three-section layout |
| `components/WorkflowStartDialog.kt` | Start dialog composable |
| `components/ActiveScreen.kt` | Active workflow screen (refactored from WorkflowRunner) |
| `components/TitleBar.kt` | Shared title bar composable |

### Modified Files
| File | Change |
|------|--------|
| `MainActivity.kt` | Create WorkflowManager in ViewModel, observe currentScreen, route to HomeScreen or ActiveScreen, handle back press |
| `coordinator/WorkflowCoordinator.kt` | Add `load(spec, setup, mediaMap)` + `start()` API alongside existing `loadAndStart(json)`. Refactor `loadAndStart` to delegate to `load()` + `start()`. |

### Removed Files
| File | Reason |
|------|--------|
| `components/WorkflowRunner.kt` | Replaced by HomeScreen + ActiveScreen |
| `components/WorkflowLoader.kt` | Replaced by HomeScreen file picker |

### Unchanged Files
| File | Reason |
|------|--------|
| `components/StepRenderer.kt` | Reused in ActiveScreen |
| `components/FormRenderer.kt` | Reused in ActiveScreen |
| `components/TraceView.kt` | Reused in ActiveScreen |
| `elements/ElementRegistry.kt` | No changes needed |
| `elements/Elements.kt` | No changes needed |
| `theme/Theme.kt` | No changes needed |

## 5. Bundled Fixtures

The 21 bundled fixture JSON files in `assets/fixtures/` remain for testing. They are accessible via the TitleBar overflow menu → "Load Fixture" which opens a dialog listing available fixtures by display name. Selecting one reads from `context.assets`, processes through `FileProcessor.processJson()`, and adds to the loaded workflows list (including any `setup` data from the fixture wrapper).

## 6. Edge Cases

- **Duplicate detection:** `addWorkflow` checks `specOid` — if already loaded, sets `ManagerState.error` to "This workflow is already loaded" (displayed as snackbar).
- **Active workflow completion:** WorkflowManager subscribes to each coordinator's StateFlow. On terminal state, captures trace/properties in the next frame via `launch { }` to avoid modifying state during collection.
- **Back navigation:** System back on ACTIVE screen returns to HOME. On HOME screen, exits the app. Handled via `BackHandler` composable.
- **Empty media map:** JSON files produce empty mediaMap. Only ZIPs extract media.
- **Large files:** File processing runs on `Dispatchers.IO` via `withContext` to avoid blocking the main thread.
- **Configuration changes:** WorkflowManager lives in a ViewModel — survives rotation and process recreation.
- **Delete confirmation:** Loaded workflow delete shows confirmation dialog (default on). Completed workflow delete has no confirmation (default off). These defaults match web-ui behavior.

## 7. Known Parity Gaps

These web-ui features are intentionally deferred, not forgotten:

| Feature | Web-UI Status | Android Status | Reason |
|---------|--------------|----------------|--------|
| Value Properties modal | Working (menu action) | Deferred | Can be added as menu action later |
| Environment Properties modal | Working (menu action) | Deferred | Can be added as menu action later |
| Drag-and-drop file loading | Working (desktop only) | N/A | Not standard on Android — file picker is the native pattern |
| QR code scanning | Placeholder (disabled button) | Omitted | Not implemented on either platform |
| History tab | Separate tab | Completed section on home | Android uses single-screen approach |
| Settings tab | Working | Deferred | Not part of home screen scope |
| Multiple active workflow switching | Tab-based | One visible at a time | All active workflows run in background; user taps to switch |
