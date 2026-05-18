# Gate 1: KMP JS Proof-of-Concept Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a Kotlin Multiplatform module that compiles the workflow engine to JS, with a JSON-in/JSON-out facade that passes all 56 conformance tests from Node.js.

**Architecture:** Copy the pure Kotlin engine files into a KMP module's commonMain. Extract the 2 JVM-specific pieces (script execution and JSON Schema validation) into expect/actual declarations. Provide JS-native implementations (eval for scripts, manual checks for validation). Build a @JsExport facade that accepts/returns JSON strings to avoid Kotlin type wrapper issues. Verify via a Node.js test script.

**Tech Stack:** Kotlin 2.1 KMP, Kotlin/JS (IR compiler, Node.js), kotlinx.serialization, GraalVM Polyglot (JVM), Node.js (testing)

---

## File Structure

```
engines/kmp-engine/
├── build.gradle.kts                    # KMP plugin: jvm + js(IR) targets
├── settings.gradle.kts                 # Module settings
├── src/
│   ├── commonMain/kotlin/com/trajectoryruntime/engine/
│   │   ├── Types.kt                    # Copy from android (pure)
│   │   ├── PropertyStore.kt            # Copy from android (pure)
│   │   ├── ResourceManager.kt          # Copy from android (pure)
│   │   ├── ResourceHelpers.kt          # Copy from android (pure)
│   │   ├── WorkflowEngine.kt           # Copy from android (pure)
│   │   ├── StepHandlers.kt             # Modified: expect fun for script execution
│   │   └── Validator.kt                # Rewritten: pure Kotlin validation (no JSON Schema dependency)
│   ├── jvmMain/kotlin/com/trajectoryruntime/engine/
│   │   └── ScriptExecutor.jvm.kt       # actual fun using GraalVM Polyglot
│   ├── jsMain/kotlin/com/trajectoryruntime/engine/
│   │   ├── ScriptExecutor.js.kt        # actual fun using native JS eval
│   │   └── JsApiFacade.kt              # @JsExport JSON-in/JSON-out facade
│   ├── jvmTest/kotlin/com/trajectoryruntime/engine/
│   │   └── ConformanceRunner.kt        # Copy from android (JUnit 5)
│   └── jsTest/                         # (empty — tested via Node.js script)
├── test-js/
│   ├── run-conformance.mjs             # Node.js script that tests the JS output
│   └── package.json                    # Node dependencies
```

---

## Chunk 1: KMP Module Scaffold + Pure Kotlin Files

### Task 1: Create KMP Module Build Configuration

**Files:**
- Create: `engines/kmp-engine/build.gradle.kts`
- Create: `engines/kmp-engine/settings.gradle.kts`

- [ ] **Step 1: Create settings.gradle.kts**

```kotlin
rootProject.name = "kmp-engine"
```

- [ ] **Step 2: Create build.gradle.kts**

```kotlin
plugins {
    kotlin("multiplatform") version "2.1.0"
    kotlin("plugin.serialization") version "2.1.0"
}

group = "com.trajectoryruntime"
version = "1.0.0"

repositories {
    mavenCentral()
}

kotlin {
    jvm {
        testRuns.named("test") {
            executionTask.configure {
                useJUnitPlatform()
            }
        }
    }

    js(IR) {
        nodejs()
        binaries.library()
    }

    sourceSets {
        val commonMain by getting {
            dependencies {
                implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
            }
        }

        val commonTest by getting {
            dependencies {
                implementation(kotlin("test"))
            }
        }

        val jvmMain by getting {
            dependencies {
                implementation("com.networknt:json-schema-validator:1.5.4")
                implementation("org.graalvm.polyglot:polyglot:24.1.1")
                implementation("org.graalvm.polyglot:js-community:24.1.1")
            }
        }

        val jvmTest by getting {
            dependencies {
                implementation("org.junit.jupiter:junit-jupiter:5.11.3")
                implementation("com.fasterxml.jackson.core:jackson-databind:2.17.0")
            }
        }

        val jsMain by getting
        val jsTest by getting
    }
}
```

- [ ] **Step 3: Verify Gradle sync**

Run: `cd engines/kmp-engine && ../../engines/android/gradlew tasks --no-daemon 2>&1 | head -20`

Note: Since there's no Gradle wrapper in kmp-engine yet, we need to create one or use the android one. Actually, create a gradle wrapper:

Run: `cd engines/kmp-engine && gradle wrapper --gradle-version 8.11.1`

Then: `cd engines/kmp-engine && ./gradlew tasks 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
git add engines/kmp-engine/build.gradle.kts engines/kmp-engine/settings.gradle.kts
git add engines/kmp-engine/gradle engines/kmp-engine/gradlew engines/kmp-engine/gradlew.bat
git commit -m "feat(kmp): create KMP module scaffold with jvm + js targets"
```

### Task 2: Copy Pure Kotlin Files to commonMain

**Files:**
- Create: `engines/kmp-engine/src/commonMain/kotlin/com/trajectoryruntime/engine/Types.kt`
- Create: `engines/kmp-engine/src/commonMain/kotlin/com/trajectoryruntime/engine/PropertyStore.kt`
- Create: `engines/kmp-engine/src/commonMain/kotlin/com/trajectoryruntime/engine/ResourceManager.kt`
- Create: `engines/kmp-engine/src/commonMain/kotlin/com/trajectoryruntime/engine/ResourceHelpers.kt`
- Create: `engines/kmp-engine/src/commonMain/kotlin/com/trajectoryruntime/engine/WorkflowEngine.kt`

These are exact copies from `engines/android/src/main/kotlin/com/trajectoryruntime/engine/`. The ONLY change needed is in WorkflowEngine.kt — it currently calls `executeScript()` which will become an expect/actual. The function signature is the same, so no code changes needed in WorkflowEngine.kt itself.

However, Types.kt needs the test fixture types REMOVED from commonMain (they reference Jackson-specific patterns in the conformance runner). Actually no — the test fixture types (`UserAction`, `TestFixtureSetup`, `TestFixtureExpected`, `TestFixture`) are pure `@Serializable` data classes using only `kotlinx.serialization`, so they CAN go to commonMain. They're consumed by the conformance runner but are themselves pure Kotlin.

- [ ] **Step 1: Create directory structure and copy files**

```bash
mkdir -p engines/kmp-engine/src/commonMain/kotlin/com/trajectoryruntime/engine
```

Copy these files exactly as-is from `engines/android/src/main/kotlin/com/trajectoryruntime/engine/`:
- `Types.kt`
- `PropertyStore.kt`
- `ResourceManager.kt`
- `ResourceHelpers.kt`
- `WorkflowEngine.kt`

- [ ] **Step 2: Commit**

```bash
git add engines/kmp-engine/src/commonMain/
git commit -m "feat(kmp): copy pure Kotlin engine files to commonMain"
```

### Task 3: Create StepHandlers with expect/actual for Script Execution

**Files:**
- Create: `engines/kmp-engine/src/commonMain/kotlin/com/trajectoryruntime/engine/StepHandlers.kt`
- Create: `engines/kmp-engine/src/commonMain/kotlin/com/trajectoryruntime/engine/ScriptExecutor.kt`
- Create: `engines/kmp-engine/src/jvmMain/kotlin/com/trajectoryruntime/engine/ScriptExecutor.jvm.kt`
- Create: `engines/kmp-engine/src/jsMain/kotlin/com/trajectoryruntime/engine/ScriptExecutor.js.kt`

The pure logic from StepHandlers.kt (everything except `executeScript`) goes to commonMain. The `executeScript` function signature stays in commonMain but delegates to an expect/actual `platformEvalScript`.

- [ ] **Step 1: Create commonMain StepHandlers.kt**

Copy `StepHandlers.kt` from android but REMOVE the `import org.graalvm.polyglot.Context` and REPLACE the `executeScript` function body with a call to `platformEvalScript`:

```kotlin
package com.trajectoryruntime.engine

import kotlinx.serialization.json.*

// All pure functions stay the same: canonicalStepType, isAutoCompleting, needsUserAction,
// getFormElements, handleSelect1, evaluateOperator, handleUserAction

// REPLACE executeScript body:
data class ScriptResult(
    val success: Boolean,
    val error: String? = null,
)

fun executeScript(
    step: MasterWorkflowStep,
    propertyStore: PropertyStore,
    inputParameters: Map<String, String>,
): ScriptResult {
    val config = step.script_config ?: return ScriptResult(success = true)
    val source = config.source ?: return ScriptResult(success = true)

    val result = platformEvalScript(source, inputParameters)
    if (!result.success) return result

    // Map output values to PropertyStore via output_parameter_specifications
    val outputSpecs = step.output_parameter_specifications
    if (outputSpecs != null && result.outputs != null) {
        for (spec in outputSpecs) {
            val target = spec.target ?: continue
            val value = result.outputs[spec.id]
            if (value != null) {
                propertyStore.set(target, value)
            }
        }
    }

    return ScriptResult(success = true)
}
```

- [ ] **Step 2: Create commonMain ScriptExecutor.kt (expect declaration)**

```kotlin
package com.trajectoryruntime.engine

data class ScriptEvalResult(
    val success: Boolean,
    val error: String? = null,
    val outputs: Map<String, String>? = null,
)

expect fun platformEvalScript(
    source: String,
    inputParameters: Map<String, String>,
): ScriptEvalResult
```

- [ ] **Step 3: Create jvmMain ScriptExecutor.jvm.kt (GraalVM implementation)**

```kotlin
package com.trajectoryruntime.engine

import org.graalvm.polyglot.Context

actual fun platformEvalScript(
    source: String,
    inputParameters: Map<String, String>,
): ScriptEvalResult {
    return try {
        Context.newBuilder("js")
            .allowAllAccess(false)
            .build().use { context ->
                val bindings = context.getBindings("js")
                for ((key, value) in inputParameters) {
                    bindings.putMember(key, value)
                }
                context.eval("js", "var output = {};")
                context.eval("js", source)

                val outputObj = context.eval("js", "output")
                val keys = context.eval("js", "Object.keys(output)")
                val outputs = mutableMapOf<String, String>()
                val len = keys.arraySize
                for (i in 0 until len) {
                    val key = keys.getArrayElement(i).asString()
                    val value = outputObj.getMember(key)
                    if (value != null && !value.isNull) {
                        outputs[key] = value.asString()
                    }
                }

                ScriptEvalResult(success = true, outputs = outputs)
            }
    } catch (e: Exception) {
        ScriptEvalResult(success = false, error = e.message ?: e.toString())
    }
}
```

- [ ] **Step 4: Create jsMain ScriptExecutor.js.kt (native JS eval)**

```kotlin
package com.trajectoryruntime.engine

actual fun platformEvalScript(
    source: String,
    inputParameters: Map<String, String>,
): ScriptEvalResult {
    return try {
        // Build a wrapper that injects inputs and captures output
        val inputDecls = inputParameters.entries.joinToString("\n") { (k, v) ->
            "var $k = ${JSON.stringify(v)};"
        }
        val wrappedSource = """
            (function() {
                $inputDecls
                var output = {};
                $source
                return output;
            })()
        """.trimIndent()

        val result = eval(wrappedSource)
        val outputs = mutableMapOf<String, String>()

        // Extract keys from the returned JS object
        val keys = js("Object.keys(result)").unsafeCast<Array<String>>()
        for (key in keys) {
            val value = js("result[key]")
            if (value != null && value != undefined) {
                outputs[key] = value.toString()
            }
        }

        ScriptEvalResult(success = true, outputs = outputs)
    } catch (e: Exception) {
        ScriptEvalResult(success = false, error = e.message ?: e.toString())
    }
}

// Helper: JSON.stringify equivalent for Kotlin/JS
private fun JSON.stringify(value: String): String {
    return js("JSON.stringify(value)").unsafeCast<String>()
}

private val JSON = object {
    fun stringify(value: String): String = js("JSON.stringify(value)").unsafeCast<String>()
}
```

Note: The JS implementation needs careful handling of Kotlin/JS interop. The exact syntax for `eval` and JS object access may need adjustment during implementation. The implementer should use `kotlin.js.eval()` and proper dynamic type handling.

- [ ] **Step 5: Verify JVM target compiles**

Run: `cd engines/kmp-engine && ./gradlew jvmMainClasses 2>&1 | tail -10`

- [ ] **Step 6: Commit**

```bash
git add engines/kmp-engine/src/commonMain/kotlin/com/trajectoryruntime/engine/StepHandlers.kt
git add engines/kmp-engine/src/commonMain/kotlin/com/trajectoryruntime/engine/ScriptExecutor.kt
git add engines/kmp-engine/src/jvmMain/kotlin/com/trajectoryruntime/engine/ScriptExecutor.jvm.kt
git add engines/kmp-engine/src/jsMain/kotlin/com/trajectoryruntime/engine/ScriptExecutor.js.kt
git commit -m "feat(kmp): add StepHandlers with expect/actual script execution"
```

## Chunk 2: Validator + JVM Tests

### Task 4: Create Pure-Kotlin Validator for commonMain

**Files:**
- Create: `engines/kmp-engine/src/commonMain/kotlin/com/trajectoryruntime/engine/Validator.kt`

The current Validator uses Jackson + networknt for JSON Schema validation. For KMP, we rewrite it as pure Kotlin using the same Map-based approach but with manual structural checks instead of JSON Schema. The pre-structural, semantic, and resource validation are already pure Kotlin. We just need to add manual step_type and form_element_type validation to replace JSON Schema.

- [ ] **Step 1: Create commonMain Validator.kt**

Copy the `preStructuralChecks`, `semanticValidation`, and `resourceValidation` functions from the android Validator.kt. Then add a manual `structuralValidation` that checks step_type enum values and form element types without needing a JSON Schema library:

```kotlin
package com.trajectoryruntime.engine

private fun normalizeStepType(t: String): String = t.replace('_', ' ')

// Valid step types per the workflow schema
private val VALID_STEP_TYPES = setOf(
    "START", "END", "PARALLEL", "WAIT ALL", "WAIT ANY",
    "SELECT 1", "SELECT_1", "SCRIPT", "MATH",
    "USER_INTERACTION", "YES_NO", "WORKFLOW PROXY",
    "WAIT ACTION PROXY",
)

private val VALID_FORM_ELEMENT_TYPES = setOf(
    "button", "text", "header", "textInput", "textarea",
    "image", "video", "checkbox", "radio", "divider", "timer",
)

// Copy preStructuralChecks exactly from android Validator.kt (it's pure Kotlin)
// Copy semanticValidation exactly from android Validator.kt (it's pure Kotlin)
// Copy resourceValidation exactly from android Validator.kt (it's pure Kotlin)
// Copy hasMatchingWaitAll exactly from android Validator.kt (it's pure Kotlin)

// NEW: Manual structural validation (replaces JSON Schema)
private fun structuralValidation(workflow: Map<String, Any?>): ValidationResult? {
    @Suppress("UNCHECKED_CAST")
    val steps = workflow["steps"] as? List<Map<String, Any?>> ?: return null

    for (step in steps) {
        // Validate step_type
        val stepType = step["step_type"] as? String ?: continue
        if (stepType !in VALID_STEP_TYPES) {
            return ValidationResult(false, "INVALID_STEP_TYPE", "Invalid step type: $stepType")
        }

        // Validate form elements if present
        @Suppress("UNCHECKED_CAST")
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

fun validate(workflow: Map<String, Any?>): ValidationResult {
    preStructuralChecks(workflow)?.let { return it }
    semanticValidation(workflow)?.let { return it }
    resourceValidation(workflow)?.let { return it }
    structuralValidation(workflow)?.let { return it }
    return ValidationResult(valid = true)
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd engines/kmp-engine && ./gradlew jvmMainClasses 2>&1 | tail -10`

- [ ] **Step 3: Commit**

```bash
git add engines/kmp-engine/src/commonMain/kotlin/com/trajectoryruntime/engine/Validator.kt
git commit -m "feat(kmp): add pure-Kotlin validator to commonMain (no JSON Schema dependency)"
```

### Task 5: Add ConformanceRunner for JVM Target

**Files:**
- Create: `engines/kmp-engine/src/jvmTest/kotlin/com/trajectoryruntime/engine/ConformanceRunner.kt`

Copy from `engines/android/src/test/kotlin/com/trajectoryruntime/engine/ConformanceRunner.kt`. The only change: the `validate` function now lives in commonMain (no Jackson conversion needed — the pure-Kotlin validator works on Map<String, Any?> which Jackson produces).

Actually, the conformance runner uses `jsonObjectToMap` which converts `kotlinx.serialization.json.JsonObject` to `Map<String, Any?>` via Jackson. For the KMP JVM target, we can keep this approach since Jackson is a jvmTest dependency.

- [ ] **Step 1: Copy ConformanceRunner.kt to jvmTest**

Copy the file exactly from `engines/android/src/test/kotlin/com/trajectoryruntime/engine/ConformanceRunner.kt`.

- [ ] **Step 2: Run JVM conformance tests**

Run: `cd engines/kmp-engine && ./gradlew jvmTest 2>&1 | tail -40`

Expected: 56/56 pass (same as the android module).

- [ ] **Step 3: Commit**

```bash
git add engines/kmp-engine/src/jvmTest/
git commit -m "feat(kmp): add JVM conformance test runner (56/56 passing)"
```

## Chunk 3: JS Facade + Node.js Verification

### Task 6: Create JS API Facade

**Files:**
- Create: `engines/kmp-engine/src/jsMain/kotlin/com/trajectoryruntime/engine/JsApiFacade.kt`

The facade accepts JSON strings and returns JSON strings, avoiding all Kotlin type wrapper issues at the JS boundary.

- [ ] **Step 1: Create JsApiFacade.kt**

```kotlin
@file:OptIn(ExperimentalJsExport::class)

package com.trajectoryruntime.engine

import kotlinx.serialization.json.*

@JsExport
class WorkflowEngineFacade {
    private var engine: WorkflowEngine? = null
    private var currentActionIndex: Int = 0

    /**
     * Validate a workflow specification.
     * @param workflowJson JSON string of the workflow spec
     * @return JSON string: {"valid": true} or {"valid": false, "error_code": "..."}
     */
    fun validate(workflowJson: String): String {
        return try {
            val json = Json { ignoreUnknownKeys = true }
            val jsonElement = json.parseToJsonElement(workflowJson)
            val workflowMap = jsonElementToMap(jsonElement)
            val result = com.trajectoryruntime.engine.validate(workflowMap)

            if (result.valid) {
                """{"valid":true}"""
            } else {
                val errorCode = result.error_code?.let { """"$it"""" } ?: "null"
                """{"valid":false,"error_code":$errorCode}"""
            }
        } catch (e: Exception) {
            """{"valid":false,"error_code":"PARSE_ERROR","error_message":"${e.message?.replace("\"", "\\\"")}"}"""
        }
    }

    /**
     * Create and start a workflow engine from a JSON spec.
     * @param workflowJson JSON string of the MasterWorkflowSpecification
     * @param setupJson Optional JSON string with starting_parameters and initial_properties
     */
    fun createAndStart(workflowJson: String, setupJson: String?) {
        val json = Json { ignoreUnknownKeys = true }
        val workflow = json.decodeFromString<MasterWorkflowSpecification>(workflowJson)
        val setup = if (setupJson != null) json.decodeFromString<TestFixtureSetup>(setupJson) else null
        engine = WorkflowEngine(workflow, setup)
        engine!!.start()
        currentActionIndex = 0
    }

    /**
     * Submit a user action to the running engine.
     * @param actionJson JSON string of the UserAction
     */
    fun submitAction(actionJson: String) {
        val json = Json { ignoreUnknownKeys = true }
        val action = json.decodeFromString<UserAction>(actionJson)
        engine!!.submitAction(action, currentActionIndex)
        currentActionIndex++
    }

    /**
     * Get the execution trace as a JSON array string.
     */
    fun getTrace(): String {
        val trace = engine!!.getTrace()
        val json = Json.encodeToString(trace)
        return json
    }

    /**
     * Get the workflow state as a string (e.g., "COMPLETED", "RUNNING").
     */
    fun getWorkflowState(): String {
        return engine!!.getWorkflowState().name
    }

    /**
     * Get the final properties as a JSON object string.
     */
    fun getProperties(): String {
        val props = engine!!.getProperties()
        val jsonObj = buildJsonObject {
            for ((key, value) in props) {
                put(key, value)
            }
        }
        return jsonObj.toString()
    }
}

/**
 * Convert a JsonElement to a Map<String, Any?> for the validator.
 * This replaces the Jackson-based conversion used in the JVM target.
 */
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
```

- [ ] **Step 2: Compile JS target**

Run: `cd engines/kmp-engine && ./gradlew jsNodeProductionLibraryDistribution 2>&1 | tail -10`

This should produce output in `build/js/packages/kmp-engine/kotlin/` or similar.

- [ ] **Step 3: Commit**

```bash
git add engines/kmp-engine/src/jsMain/kotlin/com/trajectoryruntime/engine/JsApiFacade.kt
git commit -m "feat(kmp): add @JsExport JS API facade (JSON-in/JSON-out)"
```

### Task 7: Create Node.js Conformance Test Script

**Files:**
- Create: `engines/kmp-engine/test-js/run-conformance.mjs`
- Create: `engines/kmp-engine/test-js/package.json`

A Node.js script that loads the KMP JS output and runs all 56 conformance fixtures through the facade.

- [ ] **Step 1: Create package.json**

```json
{
  "name": "kmp-engine-js-test",
  "version": "1.0.0",
  "private": true,
  "type": "module"
}
```

- [ ] **Step 2: Create run-conformance.mjs**

```javascript
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load the KMP JS output — adjust path based on actual Gradle output location
// Typically: build/js/packages/kmp-engine/kotlin/kmp-engine.mjs
const kmpPath = resolve(__dirname, '../build/js/packages/kmp-engine/kotlin/kmp-engine.mjs');
const kmpModule = await import(kmpPath);

// The facade class should be exported from the KMP module
const { WorkflowEngineFacade } = kmpModule.com.trajectoryruntime.engine;

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function findConformanceDir() {
  const candidates = [
    resolve(__dirname, '../../..', 'spec/conformance'),
    resolve(__dirname, '../../../..', 'spec/conformance'),
  ];
  for (const p of candidates) {
    try { readdirSync(p); return p; } catch { /* try next */ }
  }
  throw new Error('Cannot find conformance directory');
}

function discoverFixtures(baseDir) {
  const fixtures = [];
  for (const subdir of ['validation', 'execution', 'parameters', 'resources']) {
    const dir = join(baseDir, subdir);
    let files;
    try { files = readdirSync(dir).filter(f => f.endsWith('.json')).sort(); } catch { continue; }
    for (const file of files) {
      const content = readFileSync(join(dir, file), 'utf-8');
      fixtures.push(JSON.parse(content));
    }
  }
  return fixtures;
}

function runFixture(fixture) {
  const facade = new WorkflowEngineFacade();

  if (fixture.category === 'validation') {
    const result = JSON.parse(facade.validate(JSON.stringify(fixture.workflow)));
    if (result.valid !== fixture.expected.valid) {
      return { pass: false, error: `Expected valid=${fixture.expected.valid}, got valid=${result.valid}` };
    }
    if (!fixture.expected.valid && fixture.expected.error_code) {
      if (result.error_code !== fixture.expected.error_code) {
        return { pass: false, error: `Expected error_code="${fixture.expected.error_code}", got "${result.error_code}"` };
      }
    }
    return { pass: true };
  }

  // Execution / parameter / resource tests
  try {
    // Validate first
    const valResult = JSON.parse(facade.validate(JSON.stringify(fixture.workflow)));
    if (!valResult.valid) {
      return { pass: false, error: `Validation failed: ${valResult.error_code}` };
    }

    // Create and start engine
    const setupJson = fixture.setup ? JSON.stringify(fixture.setup) : null;
    facade.createAndStart(JSON.stringify(fixture.workflow), setupJson);

    // Submit user actions
    if (fixture.user_actions) {
      for (const action of fixture.user_actions) {
        facade.submitAction(JSON.stringify(action));
      }
    }

    // Compare trace
    if (fixture.expected.execution_trace) {
      const actualTrace = JSON.parse(facade.getTrace());
      const expectedTrace = fixture.expected.execution_trace;
      if (actualTrace.length !== expectedTrace.length) {
        return { pass: false, error: `Trace length: expected ${expectedTrace.length}, got ${actualTrace.length}` };
      }
      for (let i = 0; i < expectedTrace.length; i++) {
        if (expectedTrace[i].step_oid !== actualTrace[i].step_oid) {
          return { pass: false, error: `Trace[${i}] step_oid: expected "${expectedTrace[i].step_oid}", got "${actualTrace[i].step_oid}"` };
        }
        if (expectedTrace[i].state !== actualTrace[i].state) {
          return { pass: false, error: `Trace[${i}] state: expected "${expectedTrace[i].state}", got "${actualTrace[i].state}"` };
        }
      }
    }

    // Compare workflow state
    if (fixture.expected.workflow_state) {
      const actualState = facade.getWorkflowState();
      if (actualState !== fixture.expected.workflow_state) {
        return { pass: false, error: `State: expected "${fixture.expected.workflow_state}", got "${actualState}"` };
      }
    }

    // Compare properties
    if (fixture.expected.final_properties) {
      const actualProps = JSON.parse(facade.getProperties());
      for (const [key, expectedValue] of Object.entries(fixture.expected.final_properties)) {
        if (actualProps[key] !== expectedValue) {
          return { pass: false, error: `Property "${key}": expected "${expectedValue}", got "${actualProps[key] ?? '(undefined)'}"` };
        }
      }
    }

    return { pass: true };
  } catch (err) {
    return { pass: false, error: `Exception: ${err.message}` };
  }
}

// Main
const conformanceDir = findConformanceDir();
const fixtures = discoverFixtures(conformanceDir);

console.log(`${BOLD}Trajectory RT — KMP JS Conformance Test${RESET}\n`);
console.log(`Found ${fixtures.length} fixtures\n`);

let passed = 0;
let failed = 0;

for (const fixture of fixtures) {
  const result = runFixture(fixture);
  if (result.pass) {
    console.log(`  ${GREEN}PASS${RESET}  ${fixture.test_id}: ${fixture.name}`);
    passed++;
  } else {
    console.log(`  ${RED}FAIL${RESET}  ${fixture.test_id}: ${fixture.name}`);
    console.log(`        ${result.error}`);
    failed++;
  }
}

console.log(`\n${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);
```

- [ ] **Step 3: Build JS output and run Node.js test**

```bash
cd engines/kmp-engine && ./gradlew jsNodeProductionLibraryDistribution
cd engines/kmp-engine/test-js && node run-conformance.mjs
```

Expected: 56 passed, 0 failed.

Note: The exact import path for the KMP JS output may need adjustment. The Kotlin/JS IR compiler output path varies. Check `build/js/packages/` for the actual structure. The test script may need to be adjusted for the correct module path and export structure.

- [ ] **Step 4: Commit**

```bash
git add engines/kmp-engine/test-js/
git commit -m "feat(kmp): add Node.js conformance test script for JS target"
```

### Task 8: Write TypeScript Declarations

**Files:**
- Create: `engines/kmp-engine/test-js/kmp-engine.d.ts`

Handwritten TypeScript declarations for the JS facade.

- [ ] **Step 1: Create kmp-engine.d.ts**

```typescript
declare module 'kmp-engine' {
  export namespace com.trajectoryruntime.engine {
    class WorkflowEngineFacade {
      constructor();

      /** Validate a workflow spec. Returns JSON: {"valid": true/false, "error_code": "..."} */
      validate(workflowJson: string): string;

      /** Create and start a workflow engine from a JSON spec. */
      createAndStart(workflowJson: string, setupJson: string | null): void;

      /** Submit a user action JSON to the running engine. */
      submitAction(actionJson: string): void;

      /** Get execution trace as JSON array string. */
      getTrace(): string;

      /** Get workflow state as string (e.g., "COMPLETED"). */
      getWorkflowState(): string;

      /** Get final properties as JSON object string. */
      getProperties(): string;
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add engines/kmp-engine/test-js/kmp-engine.d.ts
git commit -m "feat(kmp): add TypeScript declarations for JS facade"
```

## Chunk 4: Final Verification

### Task 9: Full Verification

- [ ] **Step 1: Run JVM conformance suite**

Run: `cd engines/kmp-engine && ./gradlew jvmTest 2>&1 | grep -c PASSED`

Expected: 56

- [ ] **Step 2: Build JS target**

Run: `cd engines/kmp-engine && ./gradlew jsNodeProductionLibraryDistribution 2>&1 | tail -5`

Expected: BUILD SUCCESSFUL

- [ ] **Step 3: Run Node.js conformance test**

Run: `cd engines/kmp-engine/test-js && node run-conformance.mjs`

Expected: 56 passed, 0 failed

- [ ] **Step 4: Final commit**

```bash
git commit -m "chore(kmp): Gate 1 complete — KMP JS POC verified, 56/56 conformance tests passing on both JVM and JS"
```
