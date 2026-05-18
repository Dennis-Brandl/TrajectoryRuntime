---
phase: 05-multi-workflow-data-layer
plan: 01
subsystem: state-management
tags: [typescript, pub-sub, ajv, jszip, workflow-manager, external-store]

requires:
  - phase: 04-shell-device-frame
    provides: AppShell with tab navigation and screen mounting
provides:
  - WorkflowManager class managing N WorkflowCoordinator instances
  - HistoryStore for completed/abandoned workflow records
  - Browser-compatible Ajv schema validation (no Node.js deps)
  - File processing utility for .WFmasterX ZIP and .json files
  - WorkflowCoordinator load/start split for loaded-but-not-started state
affects: [05-02-hooks-context, 06-home-active-screens]

tech-stack:
  added: [ajv]
  patterns: [two-layer-pub-sub, load-then-start-coordinator, duplicate-spec-detection]

key-files:
  created:
    - src/manager/types.ts
    - src/manager/WorkflowManager.ts
    - src/manager/HistoryStore.ts
    - src/manager/validation.ts
    - src/manager/fileProcessing.ts
  modified:
    - src/coordinator/WorkflowCoordinator.ts

key-decisions:
  - "WorkflowCoordinator split into load() + start() for loaded-but-not-started state"
  - "Ajv constructor handles CJS/ESM dual export via default fallback pattern"
  - "Schema prepared once at module load (deep clone, remove $schema, relax form elements)"
  - "Blob URLs revoked on validation failure in file processing (memory safety)"

patterns-established:
  - "Two-layer pub/sub: WorkflowManager subscribe/getSnapshot wraps N WorkflowCoordinator instances"
  - "Coordinator lifecycle monitoring: manager subscribes to each coordinator, auto-moves COMPLETED/ABORTED to history"
  - "Duplicate spec detection by OID before addWorkflow"
  - "ProcessResult union type with isProcessingError type guard"

duration: 5min
completed: 2026-03-13
---

# Phase 5 Plan 01: Multi-Workflow Data Layer Summary

**WorkflowManager with N-coordinator management, HistoryStore, browser Ajv validation, and ZIP/JSON file processing -- all using subscribe/getSnapshot external store pattern**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-13T21:04:43Z
- **Completed:** 2026-03-13T21:09:42Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- WorkflowManager manages N WorkflowCoordinator instances with add/remove/focus/start lifecycle
- Auto-moves completed (COMPLETED) and abandoned (ABORTED) workflows to HistoryStore
- Browser-compatible validation ported from engine validator with all 4 phases (pre-structural, semantic, resource, structural)
- File processing extracts workflow specs from .WFmasterX ZIP archives and .json files with validation

## Task Commits

Each task was committed atomically:

1. **Task 1: Types + WorkflowManager + HistoryStore** - `caa0491` (feat)
2. **Task 2: Browser validation + file processing** - `fab5547` (feat)

## Files Created/Modified

- `src/manager/types.ts` - ManagedWorkflow, ManagerSnapshot, HistoryEntry, ManagedWorkflowStatus types
- `src/manager/WorkflowManager.ts` - Multi-coordinator manager with focus tracking, lifecycle monitoring
- `src/manager/HistoryStore.ts` - Completed/abandoned workflow record store with subscribe/getSnapshot
- `src/manager/validation.ts` - Browser-compatible Ajv validation (all 4 phases from engine validator)
- `src/manager/fileProcessing.ts` - File-to-workflow extraction for .WFmasterX ZIP and .json/.WFmaster
- `src/coordinator/WorkflowCoordinator.ts` - Added load(), start(), getSpec(); refactored loadAndStart()

## Decisions Made

- Split WorkflowCoordinator into load() + start() to support "loaded but not started" state per CONTEXT.md
- Used `(Ajv as { default?: typeof Ajv }).default ?? Ajv` pattern for CJS/ESM dual export compatibility
- Schema prepared once at module load via IIFE (deep clone, $schema removal, form element relaxation)
- Blob URLs revoked on validation failure in processZipFile to prevent memory leaks

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed ajv as direct dependency**
- **Found during:** Task 2 (Browser validation)
- **Issue:** Ajv was described as a transitive dependency but was not resolvable from web-ui
- **Fix:** Ran `npm install ajv`
- **Files modified:** package.json, package-lock.json
- **Verification:** `npx tsc --noEmit` passes, Ajv import resolves
- **Committed in:** fab5547 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Expected and documented in research as a possibility. No scope creep.

## Issues Encountered

- Ajv TypeScript types: `Ajv.default` type assertion from engine code didn't work with direct ajv install. Resolved with fallback pattern `(Ajv as { default?: typeof Ajv }).default ?? Ajv`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Data layer complete and ready for Plan 02 (React hooks and context)
- WorkflowManager, HistoryStore, validation, and file processing all compile cleanly
- subscribe/getSnapshot pattern consistent across all stores for useSyncExternalStore integration

---
*Phase: 05-multi-workflow-data-layer*
*Completed: 2026-03-13*
