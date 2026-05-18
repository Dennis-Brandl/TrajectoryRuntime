# Phase 5: Multi-Workflow Data Layer - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Manage multiple concurrent workflow instances through a WorkflowManager that wraps N WorkflowCoordinator instances with two-layer pub/sub subscription. This phase builds the data/state layer — UI screens that consume it (Home, Active) are Phase 6.

</domain>

<decisions>
## Implementation Decisions

### Workflow loading
- Drag & drop on the Home screen + file picker as fallback (drop zone is Home screen only, not whole window)
- Accept both .WFmasterX ZIP files and raw .json workflow spec files
- Full schema validation on load via validateImport — reject non-conforming specs
- Invalid files show an error modal with validation details for diagnosis
- Loading adds workflow to manager in a "loaded" state — user explicitly starts it (no auto-start)
- One instance per spec — loading an already-loaded spec prompts "keep existing or replace with fresh instance"

### Focus & switching
- All workflows run independently in the background — focus is purely a UI concept
- Visual indicators: badge count on Active tab (e.g., "Active (3)") AND header bar shows focused workflow name with dropdown to switch
- When focused workflow is removed, focus shifts to first workflow in the active list

### Lifecycle & cleanup
- No max limit on concurrent active workflows
- Completed workflows (reached END step) move to history — removed from active list
- Abandoned workflows (via ABANDON command) also move to history with 'abandoned' status
- History stored in a separate HistoryStore, not in WorkflowManager

### Subscription design
- Separate hooks: useWorkflowManager() for list/focus changes, useWorkflowCoordinator(id) for individual workflow state
- WorkflowManager provided via React Context (WorkflowManagerProvider wraps the app) — consistent with existing patterns
- Separate HistoryStore for completed/abandoned workflows — manager only tracks active

### Claude's Discretion
- Auto-focus behavior on new workflow load
- Selector granularity for hooks (field-level vs slice-level)
- Focus persistence across page reloads (localStorage decision)
- HistoryStore hook API design

</decisions>

<specifics>
## Specific Ideas

- Two-layer pub/sub: manager-level events (workflow added/removed/focused) vs coordinator-level events (step transitions) — components subscribe to only what they need
- Existing WorkflowCoordinator subscribe/getSnapshot pattern carries forward from v1.0
- useSyncExternalStore pattern continues (no Zustand)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-multi-workflow-data-layer*
*Context gathered: 2026-03-13*
