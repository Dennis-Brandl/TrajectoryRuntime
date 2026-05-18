---
phase: 05-multi-workflow-data-layer
plan: 02
subsystem: ui
tags: [react, hooks, useSyncExternalStore, context, selector-memoization]

requires:
  - phase: 05-multi-workflow-data-layer (plan 01)
    provides: WorkflowManager, HistoryStore, types
provides:
  - WorkflowManagerProvider (React context wrapping manager + history store)
  - Selector-based hooks with Object.is memoization (useManagerSelector, useHistorySelector)
  - Individual coordinator subscription hook (useCoordinatorById)
  - Focused coordinator convenience hook (useActiveCoordinator)
  - History access hooks (useHistory, useHistoryCount)
affects: [06-home-active-screens, 07-overview-trace, 08-polish-deploy]

tech-stack:
  added: []
  patterns:
    - "useRef-based selector memoization for useSyncExternalStore (avoids shim package)"
    - "Dual context pattern (manager + history store in single provider)"
    - "useCoordinatorById with dynamic subscribe/getSnapshot keyed on [manager, id]"

key-files:
  created:
    - src/manager/WorkflowManagerContext.tsx
    - src/manager/useWorkflowManager.ts
    - src/manager/useActiveCoordinator.ts
    - src/manager/useHistory.ts
  modified:
    - src/App.tsx

key-decisions:
  - "useRef(undefined as T) for React 19 strict useRef typing (no optional initial value)"

patterns-established:
  - "Selector hooks: useRef for prev value + selectorRef, Object.is comparison in getSnapshot callback"
  - "Dual context: WorkflowManagerContext + HistoryStoreContext nested in single provider"

duration: 3min
completed: 2026-03-13
---

# Phase 5 Plan 2: React Hooks for Multi-Workflow Data Layer Summary

**Selector-based React hooks wiring WorkflowManager and HistoryStore into component tree via useSyncExternalStore with Object.is memoization**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-13T21:12:08Z
- **Completed:** 2026-03-13T21:15:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created 4 React hook files providing complete access to the multi-workflow data layer
- Selector-based hooks prevent unnecessary re-renders via useRef + Object.is memoization
- WorkflowManagerProvider integrated into App.tsx, making hooks available to all screens
- Full tsc + Vite build passes cleanly

## Task Commits

Each task was committed atomically:

1. **Task 1: React hooks for manager, coordinator, and history** - `81b36e1` (feat)
2. **Task 2: Wire WorkflowManagerProvider into App.tsx** - `791b2cf` (feat)

## Files Created/Modified
- `src/manager/WorkflowManagerContext.tsx` - Dual context provider (WorkflowManager + HistoryStore)
- `src/manager/useWorkflowManager.ts` - Manager hooks: useWorkflowManager, useManagerSnapshot, useManagerSelector, useActiveCount, useFocusedId
- `src/manager/useActiveCoordinator.ts` - Coordinator hooks: useCoordinatorById, useActiveCoordinator
- `src/manager/useHistory.ts` - History hooks: useHistory, useHistorySelector, useHistoryCount
- `src/App.tsx` - Added WorkflowManagerProvider wrapping AppShell inside DeviceFrame

## Decisions Made
- Used `useRef(undefined as T)` for initial ref values because React 19 types require an argument to `useRef()` (no optional overload for mutable refs)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] React 19 useRef typing requires initial value**
- **Found during:** Task 1 (hook creation)
- **Issue:** `useRef<T>()` without argument causes TS2554 in React 19 types
- **Fix:** Changed to `useRef<T>(undefined as T)` for mutable ref pattern
- **Files modified:** src/manager/useWorkflowManager.ts, src/manager/useHistory.ts
- **Verification:** `npx tsc --noEmit` passes cleanly
- **Committed in:** 81b36e1 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minor type-level fix required by React 19 stricter typing. No scope creep.

## Issues Encountered
None beyond the useRef typing fix documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All hooks exported and ready for Phase 6 component consumption
- Home screen can use useManagerSnapshot for workflow list + useHistoryCount for history badge
- Active screen can use useActiveCoordinator for focused workflow state
- Phase 5 complete -- both plans (data layer + hooks) delivered

---
*Phase: 05-multi-workflow-data-layer*
*Completed: 2026-03-13*
