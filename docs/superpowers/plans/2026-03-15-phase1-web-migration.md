# Phase 1: Web UI Migration to KMP JS Engine

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the TypeScript engine in the web-ui with the KMP JS engine, with a feature flag to switch between them.

**Architecture:** Add missing UI-integration methods to KMP commonMain (getActiveSteps, stepParameterSnapshots, pause/resume, etc.), expand the JS facade to expose them, then create a TypeScript adapter in the web-ui that wraps the KMP facade and provides the same interface as the TS engine. The coordinator switches between TS engine and KMP adapter via an env flag.

**Tech Stack:** Kotlin Multiplatform, Kotlin/JS, TypeScript, React, Vite

---

## Task 1: Add Missing Engine Methods to KMP commonMain

**Files:**
- Modify: `engines/kmp-engine/src/commonMain/kotlin/com/trajectoryruntime/engine/WorkflowEngine.kt`
- Modify: `engines/kmp-engine/src/commonMain/kotlin/com/trajectoryruntime/engine/Types.kt`

The web-ui coordinator calls these methods that don't exist in the KMP engine yet:
- `getActiveSteps()` — returns steps in EXECUTING/WAITING/PAUSED state (excludes WAIT ALL, auto-complete types)
- `getAllProperties()` — returns all properties (same as getProperties for now, no child workflows)
- `getActiveInputParameters()` — returns the current input parameters
- `getStepParameterSnapshots()` — returns per-step input/output parameter snapshots captured during execution
- pause/resume support in `submitAction()` — handle action: 'pause' / 'resume'

- [ ] **Step 1: Add ActiveStepInfo to Types.kt**

```kotlin
data class ActiveStepInfo(
    val step: StepInstance,
    val workflowName: String,
    val waitingOn: WaitingOnInfo? = null,
)

data class WaitingOnInfo(
    val resourceName: String,
    val commandType: String,
)

val ACTIVE_STEP_STATES = setOf(StepState.EXECUTING, StepState.WAITING, StepState.PAUSED)
```

- [ ] **Step 2: Add missing methods to WorkflowEngine.kt**

Add `stepParameterSnapshots` field:
```kotlin
private val stepParameterSnapshots = mutableMapOf<String, StepParameterSnapshot>()
```

Add data class (in Types.kt or inline):
```kotlin
data class StepParameterSnapshot(
    val inputParameters: Map<String, String>,
    val outputParameters: MutableMap<String, String>,
    val description: String,
    val label: String,
    val stepType: String,
)
```

Add snapshot capture in `activateStep()` (before resource processing):
```kotlin
stepParameterSnapshots[target.oid] = StepParameterSnapshot(
    inputParameters = propertyStore.getInputParameters().toMap(),
    outputParameters = mutableMapOf(),
    description = target.step.description ?: target.stepType,
    label = target.step.local_id,
    stepType = target.stepType,
)
```

Add snapshot output capture in `submitAction()` after `handleUserAction`:
```kotlin
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
```

Add pause/resume handling at the start of `submitAction()`:
```kotlin
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
```

Add query methods:
```kotlin
fun getActiveSteps(): List<ActiveStepInfo> {
    val result = mutableListOf<ActiveStepInfo>()
    for (step in steps.values) {
        if (step.state !in ACTIVE_STEP_STATES) continue
        if (step.stepType == "WAIT ALL") continue

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
    return result
}

fun getAllProperties(): Map<String, String> = propertyStore.toFlatMap()

fun getActiveInputParameters(): Map<String, String> = propertyStore.getInputParameters()

fun getStepParameterSnapshots(): Map<String, StepParameterSnapshot> = stepParameterSnapshots.toMap()
```

- [ ] **Step 3: Run JVM conformance tests to verify no regressions**

Run: `cd engines/kmp-engine && ./gradlew jvmTest 2>&1 | tail -10`

Expected: 56/56 pass.

- [ ] **Step 4: Commit**

```bash
git add engines/kmp-engine/src/commonMain/
git commit -m "feat(kmp): add getActiveSteps, stepParameterSnapshots, pause/resume, getAllProperties"
```

## Task 2: Expand JS Facade

**Files:**
- Modify: `engines/kmp-engine/src/jsMain/kotlin/com/trajectoryruntime/engine/JsApiFacade.kt`

Expose the new methods via JSON-in/JSON-out. Also split `createAndStart()` into separate `create()` and `start()` to match the coordinator's usage pattern.

- [ ] **Step 1: Update JsApiFacade.kt**

Add these methods:

```kotlin
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
                        // Include form_layout_config as raw JSON if present
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

fun getAllProperties(): String = getProperties()

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
```

- [ ] **Step 2: Rebuild JS output**

Run: `cd engines/kmp-engine && ./gradlew jsNodeProductionLibraryDistribution 2>&1 | tail -5`

- [ ] **Step 3: Verify Node.js conformance still passes**

Run: `cd engines/kmp-engine/test-js && node run-conformance.js`

Expected: 56/56 pass.

- [ ] **Step 4: Commit**

```bash
git add engines/kmp-engine/src/jsMain/
git commit -m "feat(kmp): expand JS facade with getActiveSteps, stepParams, pause/resume"
```

## Task 3: Create TypeScript Adapter + Wire Into Web-UI

**Files:**
- Create: `engines/web-ui/src/coordinator/KmpEngineAdapter.ts`
- Modify: `engines/web-ui/src/coordinator/WorkflowCoordinator.ts`
- Modify: `engines/web-ui/vite.config.ts`

The adapter wraps the KMP JS facade and presents the same interface the WorkflowCoordinator expects. The coordinator switches between TS engine and KMP adapter via a feature flag.

- [ ] **Step 1: Copy KMP JS output to web-ui**

The KMP JS output is at `engines/kmp-engine/build/dist/js/productionLibrary/`. Copy it to a location the web-ui can import.

Create a symlink or copy script. For simplicity, add a Vite alias:

In `engines/web-ui/vite.config.ts`, add an alias for the KMP output:
```typescript
'@kmp-engine': path.resolve(__dirname, '../kmp-engine/build/dist/js/productionLibrary'),
```

- [ ] **Step 2: Create KmpEngineAdapter.ts**

```typescript
// engines/web-ui/src/coordinator/KmpEngineAdapter.ts
import type {
  MasterWorkflowSpecification,
  WorkflowState,
  TraceEntry,
  UserAction,
  ActiveStepInfo,
  StepInstance,
} from '@engine/types.js';

// The KMP facade class — imported dynamically
let kmpModule: any = null;
let FacadeClass: any = null;

export async function initKmpEngine(): Promise<void> {
  if (kmpModule) return;
  kmpModule = await import('@kmp-engine/kmp-engine.js');
  FacadeClass = kmpModule.com?.trajectoryruntime?.engine?.WorkflowEngineFacade;
  if (!FacadeClass) {
    throw new Error('Could not find WorkflowEngineFacade in KMP module');
  }
}

/**
 * Adapter that wraps the KMP JS facade to match the TS WorkflowEngine interface
 * used by WorkflowCoordinator.
 */
export class KmpWorkflowEngine {
  private facade: any;

  constructor(
    workflow: MasterWorkflowSpecification,
    setup?: { starting_parameters?: Record<string, string>; initial_properties?: Record<string, string>; resourceManager?: any },
  ) {
    if (!FacadeClass) throw new Error('KMP engine not initialized. Call initKmpEngine() first.');
    this.facade = new FacadeClass();
    // Strip resourceManager from setup (KMP engine creates its own)
    const kmpSetup = setup ? { starting_parameters: setup.starting_parameters, initial_properties: setup.initial_properties } : null;
    this.facade.create(JSON.stringify(workflow), kmpSetup ? JSON.stringify(kmpSetup) : null);
  }

  start(): void {
    this.facade.start();
  }

  submitAction(action: UserAction, actionIndex: number): void {
    this.facade.submitAction(JSON.stringify(action));
  }

  getTrace(): TraceEntry[] {
    return JSON.parse(this.facade.getTrace());
  }

  getWorkflowState(): WorkflowState {
    return this.facade.getWorkflowState() as WorkflowState;
  }

  getProperties(): Record<string, string> {
    return JSON.parse(this.facade.getProperties());
  }

  getAllProperties(): Record<string, string> {
    return JSON.parse(this.facade.getAllProperties());
  }

  getActiveInputParameters(): Record<string, string> {
    return JSON.parse(this.facade.getActiveInputParameters());
  }

  getActiveSteps(): ActiveStepInfo[] {
    const raw = JSON.parse(this.facade.getActiveSteps());
    // Convert the JSON back to the ActiveStepInfo shape the coordinator expects
    return raw.map((info: any) => ({
      step: {
        oid: info.step.oid,
        stepType: info.step.stepType,
        state: info.step.state,
        step: info.step.step,
      } as StepInstance,
      workflowName: info.workflowName,
      waitingOn: info.waitingOn,
    }));
  }

  getStepParameterSnapshots(): Map<string, { inputParameters: Record<string, string>; outputParameters: Record<string, string>; description: string; label: string; stepType: string }> {
    const raw = JSON.parse(this.facade.getStepParameterSnapshots());
    const result = new Map<string, any>();
    for (const [oid, snap] of Object.entries(raw)) {
      result.set(oid, snap);
    }
    return result;
  }
}
```

- [ ] **Step 3: Update WorkflowCoordinator with feature flag**

In `WorkflowCoordinator.ts`, add KMP engine support:

At the top:
```typescript
import { KmpWorkflowEngine, initKmpEngine } from './KmpEngineAdapter.js';

const USE_KMP_ENGINE = import.meta.env.VITE_USE_KMP_ENGINE === 'true';
```

In `start()`, replace the engine creation:
```typescript
if (USE_KMP_ENGINE) {
    this.engine = new KmpWorkflowEngine(this.workflow, engineSetup) as any;
} else {
    this.engine = new WorkflowEngine(this.workflow, engineSetup);
}
```

Note: The `as any` cast is needed because KmpWorkflowEngine matches the interface but isn't literally a WorkflowEngine instance.

- [ ] **Step 4: Update vite.config.ts**

Add the `@kmp-engine` alias and ensure the KMP JS output is accessible.

- [ ] **Step 5: Test with TS engine (default)**

Run: `cd engines/web-ui && npm run dev`

Expected: Works as before (TS engine is the default).

- [ ] **Step 6: Test with KMP engine**

Run: `cd engines/web-ui && VITE_USE_KMP_ENGINE=true npm run dev`

Expected: Same behavior as TS engine.

- [ ] **Step 7: Commit**

```bash
git add engines/web-ui/src/coordinator/KmpEngineAdapter.ts
git add engines/web-ui/src/coordinator/WorkflowCoordinator.ts
git add engines/web-ui/vite.config.ts
git commit -m "feat(web-ui): add KMP engine adapter with VITE_USE_KMP_ENGINE feature flag"
```
