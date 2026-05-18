# TrajectoryRuntime Web UI

## What This Is

A cross-platform workflow runtime UI that renders Trajectory JSON workflow specifications. The web UI simulates phone, tablet, and desktop device frames so workflows can be previewed and tested across form factors. Built on a pure-function workflow engine (`@engine/engine-web`) that handles execution, branching, parallelism, and state management.

## Core Value

Users can load, execute, and interact with Trajectory workflows through a responsive UI that faithfully simulates the mobile/tablet experience in a web browser.

## Current Milestone: v2.0 Full Web UI

**Goal:** Rebuild the UI layer from scratch with device-frame simulation, 5-tab bottom navigation, workflow state commands, and full screen architecture — reusing only the engine core.

**Target features:**
- Device frame switching (phone, tablet, small desktop rectangles)
- Header bar with workflow/step name and state commands (PAUSE, RESUME, ABANDON, RESTART, REPEAT)
- Active step carousel as main content area (swipe-able)
- 5-tab bottom navigation: Home, Active, Overview, History, Settings
- Home screen: list of available master workflows
- Active screen: list of active workflows
- Overview screen: scrollable workflow thumbnail with color-coded step states
- History screen: time-ordered execution log with step detail drill-down
- Settings screen: notification preferences and configuration

## Requirements

### Validated

<!-- Shipped and confirmed valuable. Phases 1-3. -->

- ✓ Pure-function workflow engine with state overlay pattern — Phase 1
- ✓ Step type handling (START, END, YES_NO, USER_INTERACTION, PARALLEL, WAIT ALL, WAIT ANY, SELECT 1, TEXT_INPUT) — Phase 1
- ✓ Branching, parallelism, and cycle support — Phase 1
- ✓ Schema validation with Ajv — Phase 1
- ✓ Expo app scaffold with file-based routing — Phase 2
- ✓ WorkflowCoordinator with React Context + useSyncExternalStore — Phase 3
- ✓ Active step carousel with state cards — Phase 3
- ✓ Pause/Resume step states — Phase 3
- ✓ Form element rendering (text, checkbox, radio, button, header, image, video, timer) — Phase 3
- ✓ Viewport switching (phone/tablet/desktop CSS classes) — Phase 3

### Active

<!-- v2.0 scope — see REQUIREMENTS.md -->

(Defined in REQUIREMENTS.md)

### Out of Scope

- Native mobile app deployment — web-first, native later (Phase 4)
- Real-time multi-user collaboration — single-user workflow execution
- Workflow editor/designer — runtime only, not authoring
- Backend/server integration — client-side execution only

## Context

- Engine core lives in `../web/src/` as `@engine/engine-web` package
- Current Phase 3 UI uses React 19.1.0 + Vite 6.3.5 + single App.css
- WorkflowCoordinator wraps engine with pub/sub pattern (no Zustand)
- `.WFmasterX` (ZIP) and raw JSON workflow loading via WorkflowLoader
- Form elements use a registry pattern (`elements/registry.ts`)
- v2.0 will rebuild UI layer fresh, keeping engine core and coordinator pattern

## Constraints

- **Stack**: React 19 + Vite + TypeScript — must stay compatible with engine package
- **Engine**: Pure-function engine is frozen — UI adapts to engine API, not vice versa
- **Platform**: Web-only for this milestone; device frames simulate native experience
- **Styling**: Fresh CSS/styling approach for v2.0 (Phase 3 App.css will not carry forward)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Fresh UI rebuild for v2.0 | Phase 3 UI was prototype-quality; new architecture needs proper screen/nav structure | — Pending |
| Keep engine core + coordinator | Engine is stable (119 tests); coordinator pattern works well with React | ✓ Good |
| Device frame simulation | Web UI must preview how workflows look on actual devices | — Pending |

---
*Last updated: 2026-03-13 after v2.0 milestone initialization*
