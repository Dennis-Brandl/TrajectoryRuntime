# TrajectoryRuntime Android App — Design Specification

**Date:** 2026-03-18
**Status:** Draft
**Scope:** Native Android app with full web-ui feature parity + Android-specific enhancements

## 1. Overview

A consumer-grade native Android app for executing Trajectory workflow specifications on phones and tablets. The app runs workflows entirely offline (except remote video streaming), persists active state for resume after app restart, and supports loading `.WFmasterX` files via file picker or Android intent handler.

### Goals

- Full feature parity with the web-ui (Home, Active, Overview, History, Settings)
- Native Android experience — Material 3/Material You, adaptive phone/tablet layouts
- Fully offline workflow execution (images bundled in ZIP, videos are remote URIs)
- Persist active workflow state for resume after process death
- Support loading workflows via file picker and intent handler (.WFmasterX file association)
- Export/share completed workflow results
- Sync-ready storage schema for future server integration

### Non-Goals (v1)

- Server-based workflow distribution or sync
- PDF export of completed results
- Push notifications
- Multi-user / authentication

## 2. Architecture

### Module Structure

Single Android application module at `engines/android-app/`, consuming the KMP engine's JVM target as a Gradle project dependency.

```
engines/android-app/    ← Android app module
engines/kmp-engine/     ← KMP engine (JVM target consumed via project dependency)
```

### Layer Diagram

```
┌─────────────────────────────────────────────────────┐
│  UI Layer (Jetpack Compose + Material 3)            │
│  HomeScreen · ActiveScreen · OverviewScreen         │
│  HistoryScreen · SettingsScreen                     │
└──────────────────────┬──────────────────────────────┘
                       │ observes StateFlow via ViewModel
┌──────────────────────┴──────────────────────────────┐
│  WorkflowManager              FileProcessor         │
│  Lifecycle orchestration      ZIP/JSON ingestion    │
└──────────────────────┬──────────────────────────────┘
                       │ manages per-workflow
┌──────────────────────┴──────────────────────────────┐
│  WorkflowCoordinator (one per active workflow)      │
│  Wraps KMP engine, exposes StateFlow<CoordinatorState>│
│  Snapshots state to Room after each transition      │
└──────────────────────┬──────────────────────────────┘
                       │ calls Kotlin API directly
┌──────────────────────┴──────────────────────────────┐
│  KMP Engine (JVM target)                            │
│  WorkflowEngine · StepHandlers · PropertyStore      │
│  ResourceManager · Validator · GraalVM scripting    │
└──────────────────────┬──────────────────────────────┘
                       │ persists to
┌──────────────────────┴──────────────────────────────┐
│  Room Database           App Internal Storage       │
│  3 tables: loaded,       Extracted media files      │
│  active, completed       (images from ZIPs)         │
└─────────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **StateFlow all the way down** — Engine → Coordinator (StateFlow) → Manager (StateFlow) → ViewModel (StateFlow) → Compose (collectAsState). No LiveData, no custom pub/sub. Native Kotlin coroutines throughout.

2. **Direct KMP Kotlin API** — Unlike the web-ui which uses the JSON-in/JSON-out JS facade, the Android app calls the KMP engine's Kotlin API directly. No serialization overhead, full type safety.

3. **Room DB for all workflow states** — Loaded, active, and completed workflows all persist to Room. Active workflow state is snapshotted after each engine transition for resume after process death.

4. **ViewModel per screen** — Each screen gets its own ViewModel that observes WorkflowManager. The Manager holds the coordinators. This avoids ViewModel lifecycle issues when switching between workflows.

5. **One Coordinator per active workflow** — WorkflowManager creates a Coordinator when a workflow starts and destroys it when it completes. Each Coordinator wraps its own KMP engine instance.

6. **CoordinatorState carries everything the UI needs** — The `StateFlow<CoordinatorState>` includes: active steps, step parameter snapshots, properties, active input parameters, workflow state, trace, and `mediaMap`. The mediaMap is needed by ImageElement and VideoElement to resolve bundled file URIs.

## 3. Target Platform

- **minSdk:** 29 (Android 10)
- **targetSdk:** 35 (Android 15)
- **compileSdk:** 35
- **Kotlin:** 2.1.x (matching KMP engine)
- **Gradle:** 8.11.x (matching KMP engine)

## 4. Navigation & Screens

### Navigation Model

Bottom navigation bar with 5 tabs:

| Tab | Icon | Screen |
|-----|------|--------|
| Home | Home | Load/manage workflows |
| Active | Play | Execute active workflow steps |
| Overview | Search/Graph | Workflow graph visualization |
| History | Clipboard | Completed workflow history |
| Settings | Gear | App preferences |

Uses Jetpack Navigation Compose with a `NavHost` and bottom `NavigationBar`.

### Adaptive Layouts

Uses `WindowSizeClass` from `material3-window-size-class`:

- **Compact** (< 600dp width) → Phone layout
- **Medium/Expanded** (≥ 600dp width) → Tablet layout

### Screen Specifications

#### Home Screen
- Displays loaded workflows (ready to start) and active workflows (in progress) as cards
- Each card shows: workflow name, progress indicator (for active), loaded timestamp
- FAB or top bar button to load a new workflow via system file picker
- Tap loaded workflow → start it (moves to active)
- Tap active workflow → navigate to Active tab focused on that workflow
- Swipe to delete with optional confirmation (configurable in Settings)

#### Active Screen
- **Phone:** Horizontal pager (`HorizontalPager`) — swipe between active step cards. Each card shows the step's form via FormRenderer. Steps from all active workflows are aggregated, grouped by workflow name.
- **Tablet:** List+detail split. Left pane shows a scrollable list of active steps grouped by workflow. Right pane shows the selected step's form. Tapping a step in the list updates the detail pane.
- Step cards show: step label/description, form elements, submit action
- After submitting an action, auto-advances to the next active step

#### Overview Screen
- Workflow graph visualization — SVG-based node+edge diagram matching the web-ui's WorkflowGraph component
- Step types rendered as colored shapes with status indicators (executing, completed, waiting)
- Pinch-to-zoom and pan on touch
- Rendered via Compose Canvas or AndroidView wrapping an SVG renderer

#### History Screen
- List of completed workflows sorted by completion time (newest first)
- Each entry shows: workflow name, completion timestamp, workflow state (COMPLETED/ABORTED)
- Tap to expand: view execution trace and final properties
- Share/export button on each entry
- Swipe to delete

#### Settings Screen
- Theme: Light / Dark / System (follows Material You dynamic color on Android 12+)
- Confirm before deleting loaded workflows: toggle
- Confirm before deleting completed workflows: toggle
- App version info

## 5. Form Elements

### Element Registry Pattern

Each `form_element_type` string maps to a `@Composable` function registered at app startup. `FormRenderer` iterates the step's form elements, resolves each from the registry, and positions them.

```kotlin
ElementRegistry.register("textInput") { config, onUpdate -> TextInputElement(config, onUpdate) }
ElementRegistry.register("checkbox")  { config, onUpdate -> CheckboxElement(config, onUpdate) }
// ... etc for all 11 types
```

### Form Layout

- **Phone (Compact):** Flex column layout, elements sorted by y-position from the spec. Full-width elements stacked vertically.
- **Tablet (Medium/Expanded):** Absolute positioning using the spec's x/y/width/height fields, scaled to the available container width.

All elements share base positioning fields: `x`, `y`, `width`, `height`, `zIndex`.

### Element Type Specifications

#### Input Elements

| Type | Compose Component | Key Config Fields |
|------|------------------|-------------------|
| `textInput` | `OutlinedTextField` | fieldName, label, placeholder, required, outputParameter, defaultSource, placeholderSource |
| `textarea` | `OutlinedTextField` (multiline) | fieldName, label, placeholder, rows (default 3), required, outputParameter, defaultSource, placeholderSource |
| `checkbox` | Checkbox group in Column | fieldName, label, options (string[] or {label,value}[]), required, outputParameter |
| `radio` | RadioButton group in Column | fieldName, label, options (string[] or {label,value}[]), required, outputParameter |

#### Action Elements

| Type | Compose Component | Key Config Fields |
|------|------------------|-------------------|
| `button` | `Button` / `FilledTonalButton` | label, outputValue (routes connections based on value) |
| `timer` | Custom CountdownTimer composable | label, fieldName, durationSeconds, direction (countdown/countup), blockDone, outputParameter |

#### Display Elements

| Type | Compose Component | Key Config Fields |
|------|------------------|-------------------|
| `header` | Rich text via `AnnotatedString` | content ({content, plainText}), fontSize. HTML/RTF parsed via `Html.fromHtml()` → `AnnotatedString`. Supports property/parameter chip substitution. |
| `text` | Rich text via `AnnotatedString` | content ({content, plainText}), fontSize. Same rendering as header, body-sized. |
| `image` | Coil `AsyncImage` | src, imageOid. Resolves via mediaMap: tries `{imageOid}-{src}`, then bare `src`. Tap for fullscreen. |
| `video` | Media3 ExoPlayer | src, posterUrl. Auto-detects YouTube for embed vs native player. Offline placeholder when no connection. MediaMap resolution for src and posterUrl. |
| `divider` | `HorizontalDivider` | thickness (default 1), color (default #ccc) |

### Form Layout Config (Breakpoints)

The `form_layout_config` field in the workflow spec is an array of breakpoint entries, each representing a responsive layout variant. Each entry contains an `elements` array and dimension metadata. The Android app selects the appropriate entry based on `WindowSizeClass`:

- **Compact (phone):** Select the phone/smallest breakpoint entry. Render elements in a flex column sorted by y-position, full-width.
- **Medium/Expanded (tablet):** Select the tablet/desktop breakpoint entry. Render elements using absolute x/y/width/height positioning scaled to container width.

If the config is a plain object instead of an array, treat it as a single breakpoint.

### Parameter Resolution for Form Elements

Form elements with `defaultSource` or `placeholderSource` fields resolve values dynamically from:
- **Properties:** via `engine.getProperties()`
- **Input parameters:** via `engine.getActiveInputParameters()`

The Coordinator's `CoordinatorState` must expose both properties and active input parameters so the form rendering layer can resolve these sources. The `header` and `text` elements also use chip substitution, replacing property/parameter placeholder tokens with live values.

### Step Type Rendering

**Note:** Step type strings use spaces (e.g., `WAIT ALL`, `SELECT 1`), not underscores. The engine's `canonicalStepType()` normalizes variants, but the canonical forms use spaces.

| Step Type | Behavior |
|-----------|----------|
| `USER INTERACTION` | Renders form layout via FormRenderer + ElementRegistry. Submit collects form values → `coordinator.submitAction()` |
| `YES NO` | Two buttons with labels from `yes_no_config` (yes_label, no_label). Optional form elements above. Tap submits yes/no value. |
| `START`, `END`, `PARALLEL`, `WAIT ANY`, `SCRIPT`, `MATH`, `SELECT 1` | Auto-complete types — processed by engine instantly, never shown in Active screen |
| `WAIT ALL` | **Not auto-completing.** Enters EXECUTING state and waits for all incoming parallel branches to arrive before completing. May briefly appear as a "waiting" step. Not typically shown to the user as it resolves once all branches complete. |
| `WORKFLOW PROXY` | Spawns a child workflow engine. Child workflow's active steps are surfaced via the parent engine's `getActiveSteps()` and are rendered in the Active screen like any other step. User actions on child steps are submitted via the parent engine's `submitAction()`, which delegates to the child. The Active screen handles this transparently — no special UI needed. |
| `WAIT ACTION PROXY` | External integration step. Not yet fully implemented in the engine — enters EXECUTING state and waits for external action. Render as a waiting indicator with the step label. |

## 6. File Handling

### Ingestion Entry Points

1. **File picker (SAF):** User taps "Load Workflow" on Home screen → system file picker opens → selects `.WFmasterX`, `.json`, or `.WFmaster` file
2. **Intent handler:** User taps a `.WFmasterX` file in email, browser downloads, file manager, or any other app → Android routes to TrajectoryRuntime

Both paths converge on `FileProcessor`.

### FileProcessor Pipeline

1. Copy file to app-internal temp storage (scoped storage compliance)
2. Detect format: ZIP (`.WFmasterX`) vs plain JSON (`.json` / `.WFmaster`)
3. If ZIP: extract `workflow.json` + media files to app-internal directory
4. If JSON: read spec directly, no media
5. Validate spec via KMP `Validator`
6. Build `mediaMap`: `{imageOid}-{filename}` → extracted file path
7. On success: `WorkflowManager.addWorkflow()` → insert into Room `loaded_workflows`

### Intent Handler Registration

```xml
<intent-filter>
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:mimeType="application/octet-stream" />
  <data android:mimeType="application/zip" />
  <data android:mimeType="application/json" />
  <data android:pathPattern=".*\\.WFmasterX" />
  <data android:pathPattern=".*\\.WFmaster" />
</intent-filter>
```

**Note:** Android's `pathPattern` matching is unreliable for content:// URIs. The app also registers for `application/zip` and `application/json` MIME types. `MainActivity.onCreate()` must verify the actual file extension from the `ContentResolver` display name before processing. Reject files that don't match `.WFmasterX`, `.WFmaster`, or `.json` extensions.

### File Storage Layout

```
/data/data/com.trajectoryruntime.android/files/
├── workflows/
│   ├── {workflow-id}/
│   │   ├── spec.json
│   │   └── media/
│   │       ├── {oid}-image1.jpg
│   │       └── ...
│   └── ...
└── exports/
    └── {export-id}.json
```

## 7. Storage & Persistence

### Room Database Schema

#### loaded_workflows

| Column | Type | Description |
|--------|------|-------------|
| id | String (PK) | Unique identifier |
| localId | String | Workflow local_id from spec |
| version | String | Workflow version from spec |
| name | String | Display name |
| specJson | String | Full workflow spec as JSON |
| mediaDir | String? | Path to extracted media directory |
| mediaMapJson | String? | JSON map of media keys to file paths |
| loadedAt | Long | Timestamp when loaded |

#### active_workflows

| Column | Type | Description |
|--------|------|-------------|
| id | String (PK) | Unique identifier |
| loadedWorkflowId | String (FK) | Reference to loaded_workflows row |
| traceJson | String | Execution trace as JSON |
| propertiesJson | String | Current properties as JSON |
| userActionsJson | String | Ordered list of user actions for replay |
| workflowState | String | Engine WorkflowState: IDLE, RUNNING, COMPLETED, ABORTED, STOPPED, ERRORED. For active workflows, typically RUNNING or ERRORED. |
| activeStepsJson | String | Quick-load cache of currently active step OIDs/types/labels. Used to display active step counts and labels on Home screen cards without rehydrating the engine. Rebuilt from engine state after replay on resume. |
| startedAt | Long | Timestamp when started |
| lastUpdatedAt | Long | Timestamp of last state change |

The `activeStepsJson` field handles multiple simultaneously active steps from PARALLEL/WAIT_ALL patterns. Example:

```json
[
  {"oid": "step-4", "stepType": "USER_INTERACTION", "label": "Check Pressure"},
  {"oid": "step-5", "stepType": "USER_INTERACTION", "label": "Log Temperature"},
  {"oid": "step-6", "stepType": "USER_INTERACTION", "label": "Verify Seal"}
]
```

One `active_workflows` row represents an entire workflow execution. Multiple active steps within that workflow (from parallel branches) are all tracked within that single row.

#### completed_workflows

| Column | Type | Description |
|--------|------|-------------|
| id | String (PK) | Unique identifier |
| localId | String | Workflow local_id from spec |
| version | String | Workflow version from spec |
| name | String | Display name |
| specJson | String | Full workflow spec as JSON |
| traceJson | String | Complete execution trace |
| propertiesJson | String | Final properties |
| workflowState | String | Terminal state: COMPLETED, ABORTED, STOPPED, or ERRORED |
| startedAt | Long | Timestamp when started |
| finishedAt | Long | Timestamp when finished |
| syncStatus | String | Sync status: "pending", "synced", "error" |
| syncedAt | Long? | Timestamp when synced (null if not synced) |
| externalId | String? | External system ID (null if not synced) |

### State Persistence & Resume

**Snapshot triggers:** After each `submitAction()` call, the Coordinator writes a snapshot to `active_workflows`. The snapshot includes the full trace and the ordered list of user actions. Debounced — if multiple auto-complete steps fire in sequence, only the final settled state is persisted.

**Resume on app restart:**
1. WorkflowManager queries `active_workflows`
2. For each row, load spec from the linked `loaded_workflows` row
3. Create fresh KMP engine with the spec
4. Replay stored `userActionsJson` to reconstruct state
5. Wrap in a new Coordinator, ready for user interaction

**Workflow completion:**
1. Move data from `active_workflows` to `completed_workflows`
2. Delete the `active_workflows` row
3. Keep `loaded_workflows` row (user may run it again)
4. Set `syncStatus = "pending"` for future sync capability

### Multiple Active Workflows

Users can run multiple workflows simultaneously. Each is its own `active_workflows` row with its own Coordinator and engine instance. The Active screen aggregates all active steps across all running workflows, grouped by workflow name.

## 8. Export / Share

From the History screen, each completed workflow has a share action:

- **JSON export:** Full result as JSON file shared via `ShareCompat.IntentBuilder` / `FileProvider`. The JSON envelope contains:
  ```json
  {
    "workflowName": "VRF Inspection",
    "workflowLocalId": "vrf-001",
    "workflowVersion": "1.0.0",
    "workflowState": "COMPLETED",
    "startedAt": "2026-03-18T10:00:00Z",
    "finishedAt": "2026-03-18T10:45:00Z",
    "properties": { ... },
    "trace": [ ... ]
  }
  ```
- **Summary text:** Plain text summary (workflow name, completion time, key properties) via `Intent.ACTION_SEND` with `text/plain`

## 9. Dependencies

| Category | Library | Purpose |
|----------|---------|---------|
| UI | Compose BOM 2025.01+ | Compose version management |
| UI | compose.material3 | Material 3 components |
| UI | compose.material3.adaptive | Adaptive layout utilities |
| UI | material3-window-size-class | Phone/tablet detection |
| UI | compose.foundation | HorizontalPager, gestures |
| Navigation | navigation-compose | Screen navigation + bottom nav |
| Architecture | lifecycle-viewmodel-compose | ViewModel integration |
| Coroutines | kotlinx-coroutines-android | Async operations |
| Serialization | kotlinx-serialization-json | JSON parsing |
| Persistence | room-runtime, room-ktx, room-compiler (KSP) | Local database |
| Images | coil3-compose | Image loading from extracted ZIPs |
| Video | media3-exoplayer, media3-ui | Remote video streaming |
| Engine | :engines:kmp-engine (project dep) | Workflow engine (JVM target) |
| Testing | junit5, kotlinx-coroutines-test, turbine | Unit tests |
| Testing | compose-ui-test, espresso | Instrumented tests |

## 10. File Structure

```
engines/android-app/
├── build.gradle.kts
├── proguard-rules.pro
└── src/
    ├── main/
    │   ├── AndroidManifest.xml
    │   ├── kotlin/com/trajectoryruntime/android/
    │   │   ├── TrajectoryRuntimeApp.kt
    │   │   ├── MainActivity.kt
    │   │   ├── ui/
    │   │   │   ├── navigation/
    │   │   │   │   └── AppNavigation.kt
    │   │   │   ├── screens/
    │   │   │   │   ├── HomeScreen.kt
    │   │   │   │   ├── ActiveScreen.kt
    │   │   │   │   ├── OverviewScreen.kt
    │   │   │   │   ├── HistoryScreen.kt
    │   │   │   │   └── SettingsScreen.kt
    │   │   │   ├── components/
    │   │   │   │   ├── StepRenderer.kt
    │   │   │   │   ├── FormRenderer.kt
    │   │   │   │   ├── ActiveStepCard.kt
    │   │   │   │   ├── WorkflowCard.kt
    │   │   │   │   └── WorkflowGraph.kt
    │   │   │   ├── elements/
    │   │   │   │   ├── ElementRegistry.kt
    │   │   │   │   ├── TextInputElement.kt
    │   │   │   │   ├── TextareaElement.kt
    │   │   │   │   ├── CheckboxElement.kt
    │   │   │   │   ├── RadioElement.kt
    │   │   │   │   ├── ButtonElement.kt
    │   │   │   │   ├── TimerElement.kt
    │   │   │   │   ├── HeaderElement.kt
    │   │   │   │   ├── TextElement.kt
    │   │   │   │   ├── ImageElement.kt
    │   │   │   │   ├── VideoElement.kt
    │   │   │   │   └── DividerElement.kt
    │   │   │   └── theme/
    │   │   │       ├── Theme.kt
    │   │   │       ├── Color.kt
    │   │   │       └── Type.kt
    │   │   ├── coordinator/
    │   │   │   └── WorkflowCoordinator.kt
    │   │   ├── manager/
    │   │   │   └── WorkflowManager.kt
    │   │   ├── storage/
    │   │   │   ├── AppDatabase.kt
    │   │   │   ├── WorkflowDao.kt
    │   │   │   └── Entities.kt
    │   │   └── util/
    │   │       ├── FileProcessor.kt
    │   │       └── RtfRenderer.kt
    │   └── res/
    │       ├── values/strings.xml, themes.xml, colors.xml
    │       ├── mipmap-*/ic_launcher.*
    │       └── xml/file_paths.xml, backup_rules.xml
    ├── test/                              ← JVM unit tests
    │   └── kotlin/com/trajectoryruntime/android/
    │       ├── coordinator/WorkflowCoordinatorTest.kt
    │       ├── manager/WorkflowManagerTest.kt
    │       ├── util/FileProcessorTest.kt
    │       └── ResumeReplayTest.kt
    ├── androidTest/                       ← Instrumented tests
    │   └── kotlin/com/trajectoryruntime/android/
    │       ├── storage/WorkflowDaoTest.kt
    │       ├── ui/elements/ElementRenderingTest.kt
    │       ├── ui/screens/HomeScreenTest.kt
    │       ├── ui/screens/ActiveScreenTest.kt
    │       ├── ui/NavigationTest.kt
    │       └── IntentHandlerTest.kt
    └── testFixtures/resources/
        ├── fixtures/                      ← Reuse from web-ui/fixtures/
        └── test-workflows/*.WFmasterX
```

## 11. Testing Strategy

### Layer 1: Engine Conformance (Done)
56/56 KMP JVM conformance tests covering linear, branching, parallel, scripts, resources, parameters, and validation.

### Layer 2: Coordinator & Manager Unit Tests
JVM unit tests (JUnit 5 + kotlinx-coroutines-test + Turbine):
- WorkflowCoordinator: loadAndStart, submitAction, state transitions, snapshot generation
- WorkflowManager: add/start/complete lifecycle, multiple concurrent workflows
- FileProcessor: ZIP extraction, JSON parsing, mediaMap building, format detection
- State resume: serialize actions, replay on fresh engine, verify identical state

### Layer 3: Room Database Tests
Instrumented tests (Room testing artifact + in-memory database):
- CRUD operations on all three tables
- Active workflow snapshot write/read round-trip
- Concurrent access patterns (multiple workflows updating simultaneously)

### Layer 4: Compose UI Tests
Instrumented tests (Compose UI Test + Espresso):
- Each of the 11 form element types renders correctly
- FormRenderer phone layout vs tablet layout
- Navigation: bottom nav switches screens, back stack
- Active screen: pager swipe (phone), list+detail tap (tablet)

### Layer 5: Manual Testing on Physical Devices
End-to-end on physical phone and tablet:
- Load .WFmasterX via file picker and via intent
- Run workflows: linear, branching, parallel
- Kill app mid-workflow, reopen, verify resume
- Multiple simultaneous workflows
- Adaptive layout: phone vs tablet
- Dark/light/system theme
- Export completed results via share sheet
- Offline: airplane mode, bundled images work, video shows placeholder
- Large workflows (many steps, many images)

## 12. Build & Release Notes

### ProGuard / R8 Rules

The `proguard-rules.pro` must include keep rules for:
- **kotlinx.serialization**: Keep `@Serializable` annotated classes and their generated serializers
- **GraalVM Polyglot**: Keep reflection-based classes used by the KMP engine's JVM ScriptExecutor
- **Room**: Standard Room keep rules (handled by the Room annotation processor)

### Database Migration Strategy

For v1, use `fallbackToDestructiveMigration()` since there is no existing user data to preserve. Starting from v1.1+, write explicit `Migration` objects for each schema change to preserve user data (active workflows, history).

### Overview Screen Renderer

The workflow graph visualization should use **Compose Canvas** drawing primitives, reimplementing the web-ui's SVG node+edge layout in Kotlin. This avoids an SVG library dependency and integrates natively with Compose's drawing and gesture system (pinch-to-zoom, pan). The layout algorithm (node positioning, edge routing) can be ported from the web-ui's `WorkflowGraph.tsx`.

## 13. Relationship to Existing Code

### `engines/android-ui/` (existing scaffold)

The existing `engines/android-ui/` directory contains an early Jetpack Compose scaffold with basic WorkflowRunner, FormRenderer, StepRenderer, and element components. **This code is superseded by this design** — the new `engines/android-app/` module is a fresh implementation. The existing scaffold may be used as reference for patterns but is not the starting point. It should not be deleted until the new module reaches feature parity.

### `engines/android/` (engine source)

The `engines/android/` directory contains the original pure-Kotlin engine files that were the source for the KMP engine's `commonMain`. It is no longer the active engine — the KMP engine at `engines/kmp-engine/` is the single source of truth.
