# Phase 6: Home + Active Screens + State Commands - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can load master workflows from the Home screen, start runtime workflow instances, view and interact with active steps on the Active screen via a step carousel, and control workflow execution through state commands (PAUSE, RESUME, ABANDON, RESTART). History, Overview, and REPEAT are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Home screen layout
- Simple list layout — compact rows with workflow name and action indicator
- File picker button ("+ Load Workflow") as primary load mechanism, plus drag-and-drop as convenience
- Loading a workflow adds it to the list but stays on Home — user navigates to Active manually
- Loading creates a master workflow reference; starting creates a runtime workflow instance (copy)
- Empty state: instructional message explaining how to load a workflow, with prominent load button

### Active screen — workflow switching
- Horizontal swipe between active workflows (one workflow visible at a time)
- Dot indicators showing which workflow is focused
- Completed workflows auto-removed from the carousel

### Active screen — step carousel
- Within a workflow, active steps shown in an Embla Carousel (horizontal swipe, one step at a time)
- Phone-primary design: one step visible at a time
- Steps may come from different runtime workflow instances
- Only User Interaction (single button) and Yes/No (true/false buttons) steps require user input — all other step types auto-complete
- WAITING and PAUSED steps shown in carousel with inputs/buttons disabled
- HELD, POSTED, RECEIVED, IN PROGRESS, and ABORTED steps shown as calm light blue info cards displaying step label, step state, and timestamp of when the step entered that state

### State commands menu
- Phone/tablet: three vertical dots icon in top-right of header, opens a pull-down menu
- Desktop: "State Commands" button in top-right of header
- Menu shows all state commands with contextually invalid ones grayed out (e.g., RESUME grayed out when EXECUTING)
- Commands apply to the whole workflow, not individual steps
- ABANDON and RESTART require modal confirmation dialog ("Are you sure?")
- PAUSE and RESUME execute immediately with no extra feedback — step state change in carousel is sufficient

### Screen transitions
- Starting a workflow auto-switches to the Active tab showing the new workflow
- Workflow completion: brief "Workflow Complete" card shown for a few seconds before auto-removing
- After ABANDON: stay on Active screen, workflow removed from carousel, next workflow shown (or empty state)
- Active screen empty state: blank/minimal — no link back to Home

### Claude's Discretion
- Exact styling of light blue info cards for non-interactive states
- Duration of the completion card display
- Drag-and-drop visual feedback (drop zone highlight, etc.)
- Loading/error states during file processing
- Dot indicator styling for workflow and step carousels

</decisions>

<specifics>
## Specific Ideas

- Step types with user interaction are only: User Interaction (one button) and Yes/No (two buttons: true/false on click)
- Defined step types: Environment Action, User Interaction, Yes/No, Script, Child, Select 1, Wait Any, Parallel, Wait All
- Non-interactive active states (HELD, POSTED, RECEIVED, IN PROGRESS, ABORTED) should feel calm — light blue boxes, not alarming

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-home-active-commands*
*Context gathered: 2026-03-13*
