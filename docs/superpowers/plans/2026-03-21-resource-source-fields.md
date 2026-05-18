# Resource Source Fields Implementation Plan (TrajectoryRuntime)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `resource_source_type` and `resource_source_oid` to `ResourceCommandSpecification` across all platforms (TypeScript, Kotlin KMP, Swift) so resource commands self-describe whether they target a workflow or environment resource.

**Architecture:** Each resource command now carries `resource_source_type` ("workflow" | "environment") and `resource_source_oid` (the OID of the defining workflow or environment). The engine uses these fields to determine which resource scope to operate on, eliminating the need for step-level lookups. Environment resources are registered using environment OID as owner ID. Workflow resources continue using workflow instance ID as owner ID.

**Tech Stack:** TypeScript (Vitest), Kotlin (KMP), Swift

**Spec:** See `C:\TrajectoryMobile\docs\superpowers\specs\2026-03-21-resource-scope-redesign-design.md` for the design rationale. The JSON schema changes in the workflow/step library files define the new fields.

---

## Context: How TrajectoryRuntime Differs from TrajectoryMobile

TrajectoryRuntime uses an **in-memory ResourceManager** — no SQLite tables for resource pools/queues. Resources are registered via `registerResource(spec, ownerId)` and accessed by resource name + requesterId. The ownerId is currently always the workflow instance ID.

The key change: environment resources should use the **environment OID** as the ownerId, and the engine should register environment resources during workflow start. The `resource_source_type` field on commands tells the engine which scope the resource lives in.

TrajectoryRuntime already has working SYNC (send/receive/synchronize), named pools, countable pools, etc. The SYNC system does NOT need replacement (unlike TrajectoryMobile).

---

## File Structure

| File | Role | Action |
|------|------|--------|
| `engines/web/src/types.ts` | TypeScript type definitions | Modify (add 2 fields to ResourceCommandSpecification) |
| `engines/web/src/engine.ts` | TypeScript WorkflowEngine | Modify (register env resources, use source fields for scope) |
| `engines/web/src/validator.ts` | Schema validator | Modify (validate new fields) |
| `engines/web/src/resource-helpers.test.ts` | Resource helper tests | Modify (add new fields to fixtures) |
| `engines/web/src/engine-waiting.test.ts` | Engine waiting state tests | Modify (add new fields to fixtures) |
| `engines/kmp-engine/src/commonMain/kotlin/.../Types.kt` | Kotlin type definitions | Modify (add 2 fields to ResourceCommandSpecification) |
| `engines/kmp-engine/src/commonMain/kotlin/.../WorkflowEngine.kt` | Kotlin engine | Modify (register env resources, use source fields) |
| `engines/kmp-engine/src/commonMain/kotlin/.../ResourceHelpers.kt` | Kotlin resource helpers | Review (may not need changes) |
| `spec/workflow-schema.json` | JSON schema | Modify (add new fields if not already present) |
| `spec/environment-schema.json` | Environment JSON schema | Review |
| `spec/conformance/resources/*.json` | Conformance test fixtures | Modify (add new fields to resource commands) |

---

### Task 1: Add Source Fields to TypeScript Types

**Files:**
- Modify: `engines/web/src/types.ts:238-245`

- [ ] **Step 1: Add resource_source_type and resource_source_oid**

In `engines/web/src/types.ts`, update `ResourceCommandSpecification`:

```typescript
export interface ResourceCommandSpecification {
  oid?: string;
  command_type: ResourceCommandType;
  resource_name: string;
  resource_source_type: 'workflow' | 'environment';
  resource_source_oid: string;
  amount?: number;
  target?: string;
  source?: string;
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd engines/web && npx tsc --noEmit 2>&1 | head -20`
Expected: Errors in test fixtures that construct ResourceCommandSpecification objects (expected — fixed in later tasks).

- [ ] **Step 3: Commit**

```bash
git add engines/web/src/types.ts
git commit -m "feat(web): add resource_source_type and resource_source_oid to ResourceCommandSpecification"
```

---

### Task 2: Register Environment Resources in TypeScript Engine

**Files:**
- Modify: `engines/web/src/engine.ts:105-125`

- [ ] **Step 1: Add environment resource registration after workflow registration**

In `engines/web/src/engine.ts`, after the existing workflow resource registration block (line ~125), add environment resource registration:

```typescript
    // Register environment-scoped resources
    if (this.resourceManager && this.workflow.environment_specifications) {
      for (const envSpec of this.workflow.environment_specifications) {
        if (envSpec.resource_property_specifications) {
          for (const spec of envSpec.resource_property_specifications) {
            this.resourceManager.registerResource(spec, envSpec.oid);
          }
        }
      }
    }
```

Note: Environment resources use `envSpec.oid` as the ownerId (stable across workflow instances). Workflow resources continue using `this.instanceId`.

- [ ] **Step 2: Also check for environment resources when deciding whether to create ResourceManager**

Update the auto-creation check (lines 107-115) to also check environment specs:

```typescript
      const hasEnvResources = this.workflow.environment_specifications?.some(
        env => env.resource_property_specifications?.length
      );
      if (hasResourceSpecs || hasResourceCmds || childHasResourceCmds || hasEnvResources) {
        this.resourceManager = new InMemoryResourceManager();
      }
```

- [ ] **Step 3: Update resource command execution to use source fields for requesterId**

Currently, `requesterId` is always `${this.instanceId}:${target.oid}` (line 614). For environment-scoped resources, the resource was registered with `envSpec.oid` as ownerId — but the requesterId pattern doesn't need to change because requesterId identifies the *requester* (always a step in a workflow instance), not the resource owner.

However, the resource *name lookup* is already by name, and `registerResource` handles scoping via ownerId. So the command execution flow already works correctly once environment resources are registered.

**No changes needed to `executeActivationCommands`** — the resource manager looks up by resource_name, and environment resources will be found because they were registered.

- [ ] **Step 4: Verify compilation**

Run: `cd engines/web && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 5: Commit**

```bash
git add engines/web/src/engine.ts
git commit -m "feat(web): register environment resources during workflow start"
```

---

### Task 3: Update TypeScript Test Fixtures

**Files:**
- Modify: `engines/web/src/resource-helpers.test.ts`
- Modify: `engines/web/src/engine-waiting.test.ts`
- Modify: any other test files with ResourceCommandSpecification objects

- [ ] **Step 1: Update resource-helpers.test.ts fixtures**

Add `resource_source_type: 'workflow'` and `resource_source_oid: 'wf-oid-001'` to all ResourceCommandSpecification objects in the test file.

- [ ] **Step 2: Update engine-waiting.test.ts fixtures**

Same pattern — add the two new fields to all resource command specification objects.

- [ ] **Step 3: Run tests**

Run: `cd engines/web && npm test 2>&1 | tail -20`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add engines/web/src/resource-helpers.test.ts engines/web/src/engine-waiting.test.ts
git commit -m "test(web): add resource source fields to test fixtures"
```

---

### Task 4: Update Conformance Test Fixtures

**Files:**
- Modify: `spec/conformance/resources/*.json`

- [ ] **Step 1: Add source fields to all resource command specs in conformance tests**

For each JSON file in `spec/conformance/resources/`, find all `resource_command_specifications` arrays and add:
```json
"resource_source_type": "workflow",
"resource_source_oid": "<matching workflow oid>"
```

Use the workflow's OID from each fixture. For environment-scoped resources in conformance tests (if any), use `"resource_source_type": "environment"` and the environment OID.

- [ ] **Step 2: Run conformance tests**

Run: `cd engines/web && npm test 2>&1 | tail -20`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add spec/conformance/resources/
git commit -m "test: add resource source fields to conformance test fixtures"
```

---

### Task 5: Add Source Fields to Kotlin KMP Types

**Files:**
- Modify: `engines/kmp-engine/src/commonMain/kotlin/com/trajectoryruntime/engine/Types.kt`

- [ ] **Step 1: Add fields to ResourceCommandSpecification data class**

```kotlin
@Serializable
data class ResourceCommandSpecification(
    val oid: String? = null,
    val command_type: String,
    val resource_name: String,
    val resource_source_type: String? = null,  // "workflow" or "environment"
    val resource_source_oid: String? = null,
    val amount: Double? = null,
    val target: String? = null,
    val source: String? = null,
)
```

Note: Made nullable with defaults for backward compatibility with existing serialized data. The engine code should treat missing values as workflow-scoped.

- [ ] **Step 2: Verify compilation**

Run: `cd engines/kmp-engine && ./gradlew build 2>&1 | tail -10`

- [ ] **Step 3: Commit**

```bash
git add engines/kmp-engine/
git commit -m "feat(kmp): add resource_source_type and resource_source_oid to ResourceCommandSpecification"
```

---

### Task 6: Register Environment Resources in Kotlin KMP Engine

**Files:**
- Modify: `engines/kmp-engine/src/commonMain/kotlin/com/trajectoryruntime/engine/WorkflowEngine.kt`

- [ ] **Step 1: Add environment resource registration**

Find the workflow resource registration block in WorkflowEngine and add environment registration after it, using the same pattern as Task 2 but in Kotlin:

```kotlin
// Register environment-scoped resources
workflow.environment_specifications?.forEach { envSpec ->
    envSpec.resource_property_specifications?.forEach { spec ->
        resourceManager.registerResource(spec, envSpec.oid)
    }
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd engines/kmp-engine && ./gradlew build 2>&1 | tail -10`

- [ ] **Step 3: Commit**

```bash
git add engines/kmp-engine/
git commit -m "feat(kmp): register environment resources during workflow start"
```

---

### Task 7: Update JSON Schema (if needed)

**Files:**
- Review: `spec/workflow-schema.json`
- Review: `spec/environment-schema.json`

- [ ] **Step 1: Check if schema already has the new fields**

The JSON schema files in the TrajectoryMobile repo (`master-workflow-library.json`, `master-workflow-step-library.json`) already have the fields. Check if `spec/workflow-schema.json` in TrajectoryRuntime also has them.

- [ ] **Step 2: Add fields if missing**

If not present, add to the resource_command_specifications schema:
```json
"resource_source_type": {
  "type": "string",
  "enum": ["workflow", "environment"],
  "description": "Whether the resource is defined on a workflow or an environment."
},
"resource_source_oid": {
  "type": "string",
  "description": "OID of the workflow or environment that defines the resource."
}
```

- [ ] **Step 3: Commit**

```bash
git add spec/
git commit -m "schema: add resource_source_type and resource_source_oid to resource command spec"
```

---

### Task 8: Update Validator (TypeScript)

**Files:**
- Modify: `engines/web/src/validator.ts`

- [ ] **Step 1: Add validation for new fields**

In the resource command validation section (around line 206), add checks that `resource_source_type` is present and valid, and `resource_source_oid` is a non-empty string.

- [ ] **Step 2: Run tests**

Run: `cd engines/web && npm test 2>&1 | tail -20`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add engines/web/src/validator.ts
git commit -m "feat(web): validate resource_source_type and resource_source_oid"
```

---

### Task 9: Final Verification

- [ ] **Step 1: Run TypeScript tests**

Run: `cd engines/web && npm test 2>&1 | tail -20`
Expected: ALL PASS

- [ ] **Step 2: Run Kotlin KMP build**

Run: `cd engines/kmp-engine && ./gradlew build 2>&1 | tail -10`
Expected: BUILD SUCCESSFUL

- [ ] **Step 3: Type check TypeScript**

Run: `cd engines/web && npx tsc --noEmit`
Expected: Clean

- [ ] **Step 4: Verify no stale references**

Run: `grep -r "resource_source_type" engines/ spec/ --include="*.ts" --include="*.kt" --include="*.json" -l`
Expected: All modified files listed

- [ ] **Step 5: Final commit if cleanup needed**

```bash
git add -A
git commit -m "chore: final cleanup for resource source fields"
```

---

## Not In Scope

- **iOS/Swift engine** — needs same changes but may be deferred if Swift engine is not actively developed
- **Android app UI** — no UI changes needed
- **ResourceManager API changes** — the in-memory resource manager already supports environment resources via ownerId; no API changes needed
- **Database schema** — TrajectoryRuntime resources are in-memory, no DB changes needed
