# Roadmap: TrajectoryRuntime Web UI

## Milestones

- ✅ **v1.0 Core Engine + App Scaffold + UI Screens** - Phases 1-3 (shipped 2026-03-13)
- 🚧 **v2.0 Full Web UI** - Phases 4-8 (in progress)

## Phases

<details>
<summary>v1.0 Core Engine + App Scaffold + UI Screens (Phases 1-3) - SHIPPED 2026-03-13</summary>

- Phase 1: Core Engine -- 119 tests, 38/38 must-haves
- Phase 2: App Scaffold -- Expo + routing + state
- Phase 3: UI Screens -- carousel, pause/resume, form elements, viewport switching

</details>

### v2.0 Full Web UI

**Milestone Goal:** Rebuild the UI layer with device-frame simulation, 5-tab navigation, multi-workflow support, state commands, and full screen architecture -- reusing only the engine core.

**Phase Numbering:**
- Integer phases (4, 5, 6, 7, 8): Planned milestone work
- Decimal phases (e.g., 5.1): Urgent insertions (marked with INSERTED)

- [x] **Phase 4: Shell + Device Frame** - Navigable app shell inside phone/tablet/desktop device frames
- [x] **Phase 5: Multi-Workflow Data Layer** - WorkflowManager with N concurrent WorkflowCoordinator instances
- [x] **Phase 6: Home + Active Screens + State Commands** - Core interaction loop: load, run, and control workflows
- [ ] **Phase 7: History + Overview Screens** - Read-only views: execution log and SVG workflow graph
- [ ] **Phase 8: Polish + REPEAT Command** - REPEAT step picker, visual refinements, Settings placeholder

## Phase Details

### Phase 4: Shell + Device Frame
**Goal**: Users see a realistic device frame (phone, tablet, or desktop) with a working 5-tab navigation bar and header -- the structural container for all future screens
**Depends on**: Nothing (first phase of v2.0; engine core and coordinator carry forward from v1.0)
**Requirements**: FRAME-01, FRAME-02, FRAME-03, FRAME-04, FRAME-05, NAV-01, NAV-02, NAV-03, NAV-04, NAV-05, HEAD-01, HEAD-02
**Success Criteria** (what must be TRUE):
  1. User can see the app rendered inside a phone-shaped bordered rectangle (430x932px) and switch to tablet (768x1024px) and desktop (1200x800px) frames via a control outside the frame
  2. Five labeled icon tabs (Home, Active, Overview, History, Settings) appear at the bottom of the device frame, and tapping a tab switches the visible screen content
  3. Switching tabs preserves the previous tab's state (screens are not unmounted), and the active tab is visually highlighted
  4. Header bar displays placeholder workflow name and step name areas that will later be populated by real data
  5. Content inside the frame uses CSS container queries (not media queries) for responsive layout, verified by rendering at all three frame sizes
**Plans:** 2 plans

Plans:
- [x] 04-01-PLAN.md — DeviceFrame + FrameSwitcher + useLocalStorage hook
- [x] 04-02-PLAN.md — AppShell + TabBar + HeaderBar + placeholder screens + App.tsx integration

### Phase 5: Multi-Workflow Data Layer
**Goal**: The app can manage multiple concurrent workflow instances through a WorkflowManager that wraps N WorkflowCoordinator instances with two-layer pub/sub subscription
**Depends on**: Phase 4
**Requirements**: LOAD-01, LOAD-02
**Success Criteria** (what must be TRUE):
  1. User can load multiple workflows (from .WFmasterX ZIP and raw JSON files) and all remain active simultaneously
  2. WorkflowManager tracks which workflow is "focused" and screens can subscribe to manager-level changes (workflow added/removed/focused) independently from coordinator-level changes (step transitions)
  3. Selector-based hooks prevent unnecessary re-renders -- components only update when their selected slice of state changes
**Plans:** 2 plans

Plans:
- [x] 05-01-PLAN.md — Core data layer: types, WorkflowManager, HistoryStore, browser validation, file processing
- [x] 05-02-PLAN.md — React integration: hooks, context provider, App.tsx wiring

### Phase 6: Home + Active Screens + State Commands
**Goal**: Users can load workflows from the Home screen, view and interact with running workflows on the Active screen, and control workflow execution through state commands
**Depends on**: Phase 5
**Requirements**: HOME-01, HOME-02, HOME-03, ACTV-01, ACTV-02, ACTV-03, ACTV-04, ACTV-05, HEAD-03, HEAD-04, CMD-01, CMD-02, CMD-03, CMD-04, CMD-07, CMD-08
**Success Criteria** (what must be TRUE):
  1. Home screen displays a list of available master workflows and user can select one to load and start it, navigating automatically to the Active screen
  2. Active screen shows a list of currently active workflows; tapping one shows its active step carousel with swipe navigation (Embla Carousel) and form element rendering
  3. Header shows a three-dot menu on phone/tablet (or button on desktop) that opens state commands; menu shows only contextually valid commands (PAUSE when executing, RESUME when paused)
  4. PAUSE puts active steps into PAUSED state, RESUME returns them to EXECUTING, ABANDON aborts the workflow, and RESTART restarts at the START step -- with confirmation dialogs for ABANDON and RESTART
**Plans:** 3 plans

Plans:
- [x] 06-01-PLAN.md — Home screen: file loading (picker + drag-drop), workflow list, empty state
- [x] 06-02-PLAN.md — Active screen: dual Embla Carousel (workflow + step), step cards with interactive/disabled/info modes
- [x] 06-03-PLAN.md — State commands menu, coordinator abort/pause/resume, cross-screen navigation, completion card

### Phase 7: History + Overview Screens
**Goal**: Users can review workflow execution history in time order and visualize the workflow graph structure with color-coded step states
**Depends on**: Phase 6
**Requirements**: HIST-01, HIST-02, HIST-03, HIST-04, OVER-01, OVER-02, OVER-03, OVER-04
**Success Criteria** (what must be TRUE):
  1. History screen shows a scrollable list of executed steps in time order (oldest on top), starting scrolled to the bottom, with step name and execution time per entry
  2. Tapping a history entry opens a detail page showing full step execution info
  3. Overview screen displays a scrollable SVG graph of the workflow with steps as color-coded rectangles (completed=green, executing=blue, pending=gray) connected by edges
  4. User can swipe left/right on the Overview screen to view other active workflows' graphs
**Plans**: TBD

Plans:
- [ ] 07-01: TBD
- [ ] 07-02: TBD

### Phase 8: Polish + REPEAT Command
**Goal**: REPEAT command allows re-entering at a previously executed step, and visual polish brings the app to finished quality
**Depends on**: Phase 7
**Requirements**: CMD-05, CMD-06
**Success Criteria** (what must be TRUE):
  1. REPEAT command in the state commands menu shows a list of previously executed steps for the current workflow
  2. User can select a step from the REPEAT list and execution restarts at that step (engine stub -- basic reset-to-step, not full rollback)
  3. Settings tab shows placeholder content that is navigable (deferred detail to v2.1)
**Plans**: TBD

Plans:
- [ ] 08-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 4 → 5 → 6 → 7 → 8

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 4. Shell + Device Frame | v2.0 | 2/2 | ✓ Complete | 2026-03-13 |
| 5. Multi-Workflow Data Layer | v2.0 | 2/2 | ✓ Complete | 2026-03-13 |
| 6. Home + Active + Commands | v2.0 | 3/3 | ✓ Complete | 2026-03-13 |
| 7. History + Overview | v2.0 | 0/TBD | Not started | - |
| 8. Polish + REPEAT | v2.0 | 0/TBD | Not started | - |
