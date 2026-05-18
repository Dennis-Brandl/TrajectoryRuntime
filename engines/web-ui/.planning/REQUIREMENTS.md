# Requirements: TrajectoryRuntime Web UI v2.0

**Defined:** 2026-03-13
**Core Value:** Users can execute Trajectory workflows through a responsive UI simulating mobile/tablet/desktop experience

## v2.0 Requirements

### Device Frame

- [x] **FRAME-01**: App renders inside a phone-shaped bordered rectangle (430x932px)
- [x] **FRAME-02**: App renders inside a tablet-shaped bordered rectangle (768x1024px)
- [x] **FRAME-03**: App renders inside a desktop-shaped bordered rectangle (1200x800px)
- [x] **FRAME-04**: User can switch between phone/tablet/desktop frames via a control outside the frame
- [x] **FRAME-05**: Content inside frame uses CSS container queries (not media queries) for responsive layout

### Header Bar

- [x] **HEAD-01**: Header displays the workflow local_id as the workflow name
- [x] **HEAD-02**: Header displays the current step local_id below the workflow name
- [x] **HEAD-03**: Phone/tablet header shows three-dot icon that opens state commands dropdown
- [x] **HEAD-04**: Desktop header shows a button that opens state commands dropdown

### Bottom Navigation

- [x] **NAV-01**: Five icon tabs at bottom of device frame: Home, Active, Overview, History, Settings
- [x] **NAV-02**: Tapping a tab switches the visible screen (tap-only, no swipe between tabs)
- [x] **NAV-03**: Tab state is preserved across switches (screens are not unmounted)
- [x] **NAV-04**: Active tab is visually highlighted
- [x] **NAV-05**: Settings tab is present and navigable but shows placeholder content (deferred to v2.1)

### State Commands

- [x] **CMD-01**: PAUSE command puts the active step into PAUSED state (UI shows as active, no interaction allowed)
- [x] **CMD-02**: RESUME command returns a PAUSED step to EXECUTING state
- [x] **CMD-03**: ABANDON command aborts the entire workflow (including parent if called from child step), freeing resources
- [x] **CMD-04**: RESTART command stops the entire workflow and restarts at the top parent's START step
- [ ] **CMD-05**: REPEAT command shows a list of previously executed steps for the current workflow
- [ ] **CMD-06**: REPEAT allows user to select a step, then restarts execution at that step (engine stub -- basic reset-to-step)
- [x] **CMD-07**: Menu shows only contextually valid commands (e.g., RESUME only when paused, PAUSE only when executing)
- [x] **CMD-08**: Destructive commands (ABANDON, RESTART) require confirmation before executing

### Home Screen

- [x] **HOME-01**: Displays a list of available master workflows
- [x] **HOME-02**: User can select a workflow to load and start it
- [x] **HOME-03**: Navigates to Active screen after starting a workflow

### Active Screen

- [x] **ACTV-01**: Displays a list of currently active (running) workflows
- [x] **ACTV-02**: User can tap a workflow to view its active step carousel
- [x] **ACTV-03**: Active step carousel fills main area, laid out left-to-right, top-to-bottom
- [x] **ACTV-04**: Carousel supports swipe left/right navigation (rebuilt with Embla Carousel)
- [x] **ACTV-05**: Step cards render form elements (text input, checkbox, radio, button, etc.) via element registry

### Overview Screen

- [ ] **OVER-01**: Displays a scrollable SVG graph of the current workflow
- [ ] **OVER-02**: Steps are color-coded by state: completed, active/executing, and future/pending
- [ ] **OVER-03**: Steps are connected by edges showing workflow connections
- [ ] **OVER-04**: User can swipe left/right to view overview of other active workflows

### History Screen

- [ ] **HIST-01**: Displays a scrollable list of executed steps in time order (oldest on top)
- [ ] **HIST-02**: List starts scrolled to the bottom (most recent entry visible)
- [ ] **HIST-03**: Each entry shows step name and execution time
- [ ] **HIST-04**: User can tap a step to view a detail page with full step execution info

### Workflow Loading

- [x] **LOAD-01**: User can load workflows from .WFmasterX (ZIP) and raw JSON files
- [x] **LOAD-02**: Multiple workflows can be active simultaneously (WorkflowManager with N coordinators)

## v2.1 Requirements

### Settings Screen

- **SETT-01**: Settings screen with notification preferences (e.g., Notify on Active Step started)
- **SETT-02**: Configurable display options

### REPEAT Enhancement

- **RPT-01**: Full engine rollback support for REPEAT (reset step and all downstream state)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Native mobile deployment | Web-first for v2.0; Phase 4 future milestone |
| Workflow editor/designer | Runtime only, not authoring tool |
| Real-time multi-user | Single-user workflow execution |
| Backend/server integration | Client-side execution only |
| React Router / URL routing | Tabs are inside device frame, not browser pages |
| Transform scale for device frames | Breaks scroll/touch -- use fixed pixel dimensions |
| Swipe between tabs | Conflicts with carousel swipe gesture |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FRAME-01 | Phase 4 | Complete |
| FRAME-02 | Phase 4 | Complete |
| FRAME-03 | Phase 4 | Complete |
| FRAME-04 | Phase 4 | Complete |
| FRAME-05 | Phase 4 | Complete |
| HEAD-01 | Phase 4 | Complete |
| HEAD-02 | Phase 4 | Complete |
| HEAD-03 | Phase 6 | Complete |
| HEAD-04 | Phase 6 | Complete |
| NAV-01 | Phase 4 | Complete |
| NAV-02 | Phase 4 | Complete |
| NAV-03 | Phase 4 | Complete |
| NAV-04 | Phase 4 | Complete |
| NAV-05 | Phase 4 | Complete |
| CMD-01 | Phase 6 | Complete |
| CMD-02 | Phase 6 | Complete |
| CMD-03 | Phase 6 | Complete |
| CMD-04 | Phase 6 | Complete |
| CMD-05 | Phase 8 | Pending |
| CMD-06 | Phase 8 | Pending |
| CMD-07 | Phase 6 | Complete |
| CMD-08 | Phase 6 | Complete |
| HOME-01 | Phase 6 | Complete |
| HOME-02 | Phase 6 | Complete |
| HOME-03 | Phase 6 | Complete |
| ACTV-01 | Phase 6 | Complete |
| ACTV-02 | Phase 6 | Complete |
| ACTV-03 | Phase 6 | Complete |
| ACTV-04 | Phase 6 | Complete |
| ACTV-05 | Phase 6 | Complete |
| OVER-01 | Phase 7 | Pending |
| OVER-02 | Phase 7 | Pending |
| OVER-03 | Phase 7 | Pending |
| OVER-04 | Phase 7 | Pending |
| HIST-01 | Phase 7 | Pending |
| HIST-02 | Phase 7 | Pending |
| HIST-03 | Phase 7 | Pending |
| HIST-04 | Phase 7 | Pending |
| LOAD-01 | Phase 5 | Complete |
| LOAD-02 | Phase 5 | Complete |

**Coverage:**
- v2.0 requirements: 39 total
- Mapped to phases: 39
- Unmapped: 0

---
*Requirements defined: 2026-03-13*
*Last updated: 2026-03-13 after Phase 6 completion*
