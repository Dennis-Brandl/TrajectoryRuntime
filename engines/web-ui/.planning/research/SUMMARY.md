# Project Research Summary

**Project:** TrajectoryRuntime Web UI v2.0 Rebuild
**Domain:** Mobile-style web app with device-frame simulation, multi-workflow orchestration, and workflow visualization
**Researched:** 2026-03-13
**Confidence:** HIGH

## Executive Summary

The v2.0 rebuild transforms a single-workflow prototype into a multi-workflow runtime viewer that looks and behaves like a native mobile app running inside a browser. The core design insight is to treat the device frame as a purely visual CSS container — fixed pixel dimensions with no transform scaling — while lifting all navigation and workflow state above the frame boundary. This avoids the most common pitfall in device-simulation UIs (transform-scale breaking scroll and touch) and ensures switching between phone/tablet/desktop views never loses the user's place. The entire shell is three new npm packages (Embla Carousel, Lucide React, and CSS Modules, which is already built into Vite), with everything else built from custom components.

The recommended architecture introduces a `WorkflowManager` layer above the existing `WorkflowCoordinator` that holds a `Map<id, WorkflowCoordinator>` and tracks which workflow is "focused." This is a natural extension of the existing pub/sub pattern (`subscribe`/`getSnapshot`/`useSyncExternalStore`) that already works in production — the manager becomes a second subscribable store sitting above the per-workflow stores. Building this data layer before any screen is the single most important sequencing decision: all five screens depend on multi-workflow support, and retrofitting it would require touching every component.

The two highest-risk areas are CSS architecture and re-render performance. CSS container queries — not media queries — must be adopted as the convention from Phase 1 onward, because media queries respond to the browser viewport, not the device frame. Re-render performance requires a selector pattern on `useSyncExternalStore` from day one, since returning the full snapshot object (the current approach) causes every subscribed component to re-render on every state change. Both are cheap to establish early and expensive to retrofit.

## Key Findings

### Recommended Stack

The stack additions are minimal by design: only three packages need to be installed. Embla Carousel (8.6.0) handles the active-step swipe carousel with a headless React hooks API that pairs cleanly with CSS Modules and is confirmed React 19 compatible. Lucide React (0.577.0) provides 1500+ tree-shakable SVG icons covering all navigation, step-type, and command needs. CSS Modules requires zero installation (Vite already supports it) and is the right styling choice at this scale (~15-20 components) because it avoids the design-system lock-in of component libraries and the layout-control fights that come with Tailwind when doing device-frame pixel math.

All other UI concerns — device frame bezels, bottom tab navigation, workflow graph visualization — are custom React + CSS. The workflow graph is the only technically novel piece: the spec already includes authored step positions (`position: { x, y }`), so the overview graph is SVG `<rect>` and `<line>` elements color-coded by step state, requiring roughly 150-250 lines of code. React Flow is 1.2MB for a read-only display; it was evaluated and rejected.

**Core technologies:**
- CSS Modules (Vite built-in): Scoped component styling — zero-dependency, zero-config, pairs with device-frame pixel math
- embla-carousel-react 8.6.0: Active step carousel — headless, React 19 verified, ~50KB vs Swiper's 300KB+
- lucide-react 0.577.0: Icon set — tree-shakable, React 19 verified, consistent SVG visual language
- Custom SVG rendering: Workflow graph visualization — ~200 lines vs React Flow's 1.2MB for a read-only display
- Custom CSS + React: Device frame and tab navigation — unique layout requirements that libraries would fight against

### Expected Features

**Must have (table stakes):**
- Device frame simulation (phone/tablet/desktop) with fixed-dimension CSS bezels, content that scrolls independently inside the frame, and the frame centered on a neutral background
- Bottom tab bar with 5 tabs (Home, Active, Overview, History, Settings), touch-friendly targets, active-tab indicator, and state that persists across tab switches (do NOT unmount tab content on switch)
- State commands menu: kebab/three-dot on phone and tablet, inline buttons on desktop; context-aware visibility (RESUME only when paused, etc.); confirmation dialogs for ABANDON and RESTART
- Home screen: workflow card list, existing file/JSON loader refactored into this screen, empty-state guidance
- Active screen: list of running workflow instances with state badges, swipe carousel for multi-step workflows, tap to drill into step detail
- History screen: time-ordered execution log reusing existing TraceView data, color-coded state entries

**Should have (differentiators):**
- Overview screen with SVG workflow graph: color-coded step nodes by state — no competing workflow runners offer this as an embedded view
- Cross-tab badge notifications: count on the Active tab showing items needing attention (low effort, high value)
- Responsive kebab-to-buttons transition: single StateCommandsMenu component that adapts to viewport type
- Device frame notch/camera cutout: CSS `::before` pseudo-element for high-polish phone feel

**Defer to post-MVP:**
- REPEAT command: requires engine-level rollback support to re-enter at an arbitrary step; ship RESTART first
- Overview graph minimap: only valuable when graphs are large enough to scroll significantly
- Dark mode: CSS complexity and testing burden not justified for a development tool
- Full graph editor: this is a runtime viewer, not a design tool — read-only visualization only
- Push notifications and service workers: over-engineering for a local development tool

### Architecture Approach

The architecture is a two-layer pub/sub system inside a device-frame shell. `WorkflowManager` is a new class that owns `Map<string, WorkflowEntry>` (each entry bundling coordinator + spec + metadata), tracks which workflow is focused, and implements the same `subscribe`/`getSnapshot` pattern as `WorkflowCoordinator`. React context provides the manager instance; custom hooks (`useFocusedSnapshot`, `useWorkflowList`) select slices. Navigation state (active tab, screen drill-down) lives at app level, above the device frame, so switching device modes never resets screen position. No router library is needed — a switch statement in `ScreenRouter` dispatches to the five screen components.

**Major components (in build order):**
1. `DeviceFrame` — CSS bezel wrapper with fixed dimensions per mode; sets `container-type: inline-size` for container queries
2. `AppShell` + `BottomTabBar` + `ScreenRouter` + `HeaderBar` — navigation shell; tab state lives here, above the frame
3. `WorkflowManager` + `WorkflowManagerProvider` + hooks — multi-workflow data layer; all screens depend on this
4. `HomeScreen` + `ActiveScreen` + `StateCommandsMenu` — core interaction flow (load → run → control)
5. `HistoryScreen` + `OverviewScreen` — secondary read-only views; overview is highest complexity
6. `SettingsScreen` — lowest priority; about info and notification preference stubs

### Critical Pitfalls

1. **CSS transform scale breaks device frames** — Use fixed pixel dimensions (`width`/`height`) on the frame container, never `transform: scale()`. Scaled containers break scroll physics and misalign click targets. Test by scrolling a long form inside the phone frame on day one.

2. **Single coordinator cannot support multi-workflow** — Build `WorkflowManager` with `Map<id, WorkflowCoordinator>` before writing any screen. All screens depend on multi-instance support; retrofitting it later means touching every component.

3. **Media queries respond to browser viewport, not frame** — Establish the convention in Phase 1: use CSS container queries (`@container device (max-width: 375px)`) for all styling that must respond to device frame size. `@media` queries only for the outer page shell.

4. **Full snapshot re-renders every subscriber** — Implement a `useWorkflowSelector<T>(selector)` hook pattern before writing screen components. Returning the full `CoordinatorSnapshot` object causes all subscribed components to re-render on every step transition.

5. **Tab and screen state lost on device frame switch** — Lift tab selection and screen drill-down state above the `DeviceFrame` component in `AppShell` or a context. The device frame must be a purely visual wrapper with no state ownership.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Shell + Frame Foundation
**Rationale:** Device frame dimensions and CSS container-query conventions must be established before any screen component is written. Every other component renders inside this shell. Establishing container queries and the "no transform scale" rule here prevents a rewrite of all component CSS later. Tab state must live here to avoid Pitfall 6 (state lost on frame switch).
**Delivers:** Navigable 5-tab app shell rendered inside a phone/tablet/desktop device frame; placeholder screens behind each tab; working tab switching with preserved state
**Addresses:** Device frame simulation (table stakes), bottom tab navigation (table stakes)
**Avoids:** Transform-scale pitfall (P1), media-query pitfall (P8), tab-state-loss pitfall (P6), CSS regression pitfall (P11 — catalog existing App.css rules before discarding)

### Phase 2: Multi-Workflow Data Layer
**Rationale:** All five screens need multi-workflow support. This is a data-layer phase with zero UI — build and test `WorkflowManager` in isolation before hooking it to any screen. The two-layer subscription model (manager for list/focus, coordinator for per-workflow state) is the architectural pattern that makes the rest of the build tractable.
**Delivers:** `WorkflowManager` class, `WorkflowManagerProvider` context, `useFocusedSnapshot`/`useWorkflowList` hooks; selector hook pattern for slice subscriptions
**Uses:** Existing `WorkflowCoordinator` unchanged; existing `useSyncExternalStore` pattern extended
**Implements:** WorkflowManager component from ARCHITECTURE.md; selector pattern from PITFALLS.md P3
**Avoids:** Single-coordinator limitation (P2), full-snapshot re-render (P3)

### Phase 3: Home + Active Screens + State Commands
**Rationale:** These are the primary interaction screens. Home creates workflows; Active runs them. Together they prove the multi-workflow architecture end-to-end. The `StateCommandsMenu` (kebab vs. inline buttons) belongs here because it contextually appears on the Active screen and step detail.
**Delivers:** Loading workflows from file or JSON into the multi-workflow manager; running workflow list with state badges; step carousel (reusing existing `StepRenderer`, `ActiveStepCard`, `FormRenderer`); PAUSE/RESUME/RESTART/ABANDON commands with confirmation dialogs
**Uses:** Embla Carousel (active step swipe), Lucide React (tab and command icons), CSS Modules (component styling)
**Implements:** HomeScreen, ActiveScreen, StateCommandsMenu, WorkflowCard from ARCHITECTURE.md
**Avoids:** Swipe-scroll gesture conflict (P5 — use `touch-action: pan-y` on carousel), cascade logic gaps (P4 — define ABANDON cascade policy before implementation), blob URL leaks (P9 — call `coordinator.reset()` on workflow removal)

### Phase 4: History + Overview Screens
**Rationale:** These are read-only views that require active workflows to have data worth displaying. Build them after the core interaction loop works. History reuses existing `TraceView` logic with minimal changes. Overview (SVG graph) is the highest-complexity new component and benefits from being last, when the data flow is fully proven.
**Delivers:** Time-ordered execution trace (History); SVG color-coded workflow graph using spec `position` data (Overview); zoom/pan foundation for Overview
**Uses:** Custom SVG rendering (no React Flow); step state colors from ARCHITECTURE.md
**Implements:** HistoryScreen, OverviewScreen from ARCHITECTURE.md
**Avoids:** Graph-at-scale unusability (P7 — start with simple vertical step list fallback; full SVG graph only if spec has position data)

### Phase 5: Settings + Polish
**Rationale:** Settings is the lowest-priority screen and final pass. Visual polish — bezel shadows, notch pseudo-element, cross-tab badge counts — happens after all functionality works.
**Delivers:** Settings screen (notification prefs, about info); device frame polish (notch, shadows, realistic bezel proportions); cross-tab badge notification counts on Active tab
**Implements:** SettingsScreen; device frame differentiators from FEATURES.md

### Phase Ordering Rationale

- Shell before data layer because CSS architecture conventions (container queries, no transform scale) must be established before writing component CSS; changing the convention retroactively breaks all previous components.
- Data layer before screens because every screen depends on `WorkflowManager`; this is the single highest-risk architectural dependency.
- Home + Active before History + Overview because the latter screens require data that only exists when workflows are actually running; building read-only views first would require mock data scaffolding that would later be discarded.
- Settings last because it has no dependencies and no other component depends on it.
- CSS Modules as the styling approach is confirmed from Phase 1 onward; Tailwind was evaluated and rejected because it fights device-frame pixel math and adds a PostCSS build step with no proportional benefit at this component count.

### Research Flags

Phases with well-documented patterns (skip `/gsd:research-phase`):
- **Phase 1 (Shell + Frame):** CSS device frames and container queries are a solved problem with published references. Build directly.
- **Phase 2 (Data Layer):** The `subscribe`/`getSnapshot` pub/sub pattern is already working in the codebase. Extending it to a manager is straightforward.
- **Phase 5 (Settings + Polish):** Lowest complexity. No research needed.

Phases that may benefit from targeted research during planning:
- **Phase 3 (Active Screen / Gesture Handling):** Swipe gesture disambiguation (`touch-action: pan-y`, axis locking) on web is a known problem area with implementation-specific edge cases. If the existing carousel's touch handler proves insufficient, consider `@use-gesture/react`.
- **Phase 4 (Overview SVG Graph):** The graph layout question — whether authored `position` data is present on all workflow specs — is unresolved. If spec positions are absent, a fallback topological-sort layout is needed. Validate against actual workflow fixtures before implementing.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All packages version-verified against npm registry on 2026-03-13. React 19 peer deps confirmed for Embla and Lucide. CSS Modules confirmed in Vite official docs. |
| Features | MEDIUM-HIGH | Table-stakes features derived from established mobile UX patterns (Apple HIG, Material Design). Differentiators are well-motivated but untested with actual users. |
| Architecture | HIGH | Based on direct codebase analysis of existing files. WorkflowManager extension of existing coordinator pattern is low-risk. Two-layer subscription is a documented pattern. |
| Pitfalls | HIGH | Critical pitfalls are CSS/browser-specified behaviors (transform scale, media queries, container queries) with definitive documentation. Multi-instance coordinator issue is directly verifiable by reading existing source. |

**Overall confidence:** HIGH

### Gaps to Address

- **Workflow spec position data availability:** ARCHITECTURE.md assumes `MasterWorkflowSpecification.steps` have `position: { x, y }` for the overview graph. Not all specs may have this. Validate in Phase 4 planning by checking representative fixtures. If absent, budget for a topological-sort layout algorithm.
- **Sub-workflow cascade scope:** PITFALLS.md P4 (ABANDON cascade) assumes the engine supports parent-child workflow relationships. Confirm whether any existing workflow fixtures use sub-workflow spawning before implementing cascade logic in Phase 3. If not present in current spec corpus, ABANDON can safely target single coordinators only.
- **REPEAT command engine support:** FEATURES.md defers REPEAT to post-MVP with the note that engine-level rollback is required. Clarify the engine API surface before committing to a REPEAT implementation timeline. The coordinator's `restart()` covers full restart but not re-entry at an arbitrary step.

## Sources

### Primary (HIGH confidence)
- npm registry (2026-03-13) — embla-carousel-react 8.6.0 and lucide-react 0.577.0 peer dependencies verified
- [Vite CSS Modules documentation](https://vite.dev/guide/features) — zero-config CSS Modules confirmed
- Direct codebase analysis: `WorkflowCoordinator.ts`, `WorkflowContext.tsx`, `useWorkflow.ts`, `App.tsx`, `WorkflowRunner.tsx`
- React 19 `useSyncExternalStore` official docs — snapshot comparison and selector pattern
- CSS specification — media queries respond to viewport, not container (basis for container-query recommendation)

### Secondary (MEDIUM confidence)
- [Embla Carousel React docs](https://www.embla-carousel.com/get-started/react/) — headless API usage
- [Lucide React docs](https://lucide.dev/guide/packages/lucide-react) — tree-shaking guidance
- [Flowbite Device Mockups](https://flowbite.com/docs/components/device-mockups/) — bezel border widths and border-radius reference values
- [CSS Container Queries Complete Guide](https://dev.to/blues-2025/css-container-queries-complete-guide-say-goodbye-to-media-query-pain-points-3m9m) — container query browser support and usage patterns
- [Temporal Child Workflows](https://docs.temporal.io/child-workflows) — cascade termination policy pattern

### Tertiary (LOW confidence / context only)
- [Scaling DAG Visualization (Dagster blog)](https://dagster.io/blog/scaling-dag-visualization) — graph-at-scale issue confirmation
- [Swiper migration to Web Components](https://swiperjs.com/blog/using-swiper-element-in-react) — rationale for choosing Embla over Swiper

---
*Research completed: 2026-03-13*
*Ready for roadmap: yes*
