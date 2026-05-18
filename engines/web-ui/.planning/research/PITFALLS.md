# Domain Pitfalls

**Domain:** Web UI rebuild with device-frame simulation, mobile-style navigation, and workflow visualization
**Project:** TrajectoryRuntime Web UI v2.0
**Researched:** 2026-03-13

## Critical Pitfalls

Mistakes that cause rewrites or major issues.

### Pitfall 1: CSS Transform Scale Breaks Scroll and Touch Inside Device Frames

**What goes wrong:** The obvious approach to device frame simulation is wrapping content in a container and using `transform: scale(0.5)` to shrink it to phone size. This breaks in three ways: (a) scroll events inside the frame have disproportional speed (the browser scrolls by real pixels, but scaled content moves by scaled pixels), (b) touch targets become misaligned because the browser processes click coordinates at the real DOM position, not the visually scaled position, and (c) the container still occupies its original unscaled dimensions in the layout, requiring `transform-origin` and manual height overrides to prevent layout collapse.

**Why it happens:** `transform: scale()` is a visual-only operation. The layout engine still thinks the element is its original size. Scroll containers inside scaled elements inherit browser-native scroll physics that do not account for the visual scaling factor.

**Consequences:** Users cannot reliably interact with workflows inside device frames. Scroll feels "floaty" or janky. Click targets miss. The entire device frame simulation feels broken.

**Prevention:** Do NOT use `transform: scale()` for the device frame content area. Instead:
- Set the device frame container to fixed pixel dimensions (e.g., 375x812 for iPhone) using `width`/`height` on the container.
- Let CSS inside the frame respond to the container width naturally (use `%`, `rem`, container queries).
- If the frame must visually shrink to fit the outer viewport, scale the entire frame CONTAINER (including the phone bezel chrome) as a non-interactive preview, but render the interactive version at native dimensions.
- Use CSS container queries (`container-type: inline-size`) so components inside the frame respond to the frame width, not the viewport width.

**Detection:** Test early by scrolling a long form inside the device frame and tapping buttons near the edges. If scroll speed feels wrong or taps miss, you hit this pitfall.

**Which phase:** Must be addressed in the very first phase that introduces device frames (likely Phase 1 of v2.0).

**Confidence:** HIGH - well-documented browser behavior with `transform: scale()`.

### Pitfall 2: Single WorkflowCoordinator Instance Cannot Support Multiple Active Workflows

**What goes wrong:** The current architecture uses a single `WorkflowCoordinator` instance via React Context (`useMemo(() => new WorkflowCoordinator(), [])`). The coordinator holds one `engine`, one `workflow`, one `snapshot`. The v2.0 design requires listing and switching between multiple active workflows (the "Active" tab shows a list of running workflows). If you try to make the single coordinator juggle multiple workflows, you either lose state when switching or create a tangled state machine.

**Why it happens:** The current coordinator was designed for Phase 3's single-workflow prototype. It directly holds `this.engine` as a singleton. The `reset()` method destroys the current workflow entirely.

**Consequences:** Cannot support the Active Workflows screen. Switching workflows destroys the previous one. No way to show a list of active workflow states simultaneously.

**Prevention:** Introduce a workflow instance manager that holds a `Map<string, WorkflowCoordinator>` keyed by instance ID. Each workflow gets its own coordinator. The React layer receives the active coordinator via context or a selector. The instance manager handles lifecycle (create, switch, abandon, restart). Design this before building any screens.

**Detection:** The moment you try to implement "Active Workflows" list and realize each item needs its own independent state.

**Which phase:** Must be the foundation of the new architecture (Phase 1). All screens depend on multi-instance support.

**Confidence:** HIGH - can be verified by reading the existing `WorkflowCoordinator.ts` and `WorkflowContext.tsx` which clearly hold single-instance state.

### Pitfall 3: useSyncExternalStore Re-renders Every Component on Any Snapshot Change

**What goes wrong:** The current `useWorkflowSnapshot()` hook returns the entire `CoordinatorSnapshot` object. Every call to `publish()` creates a new snapshot reference. Every component that calls `useWorkflowSnapshot()` re-renders on every state change, even if only `trace` changed but the component only cares about `activeSteps`. With multiple active workflows each publishing changes, this becomes a performance cliff.

**Why it happens:** `useSyncExternalStore` uses `Object.is()` to compare snapshots. A new object reference (even with identical data) triggers a re-render. The current design returns the full snapshot as a single object, so there is no way to subscribe to a slice.

**Consequences:** The Overview screen (rendering all step thumbnails), Active screen (listing all workflows), and step carousel all re-render on every property change in every workflow. With 3-5 active workflows each with 20+ steps, this creates visible jank.

**Prevention:** Implement selector-based snapshot access:
```typescript
function useWorkflowSelector<T>(selector: (snap: CoordinatorSnapshot) => T): T {
  const coordinator = useWorkflowCoordinator();
  return useSyncExternalStore(
    coordinator.subscribe,
    () => selector(coordinator.getSnapshot())
  );
}
```
IMPORTANT: The selector must return a referentially stable value (primitive, memoized array/object) or `useSyncExternalStore` will still trigger re-renders. For array/object selectors, use `JSON.stringify` comparison or a shallow-equal wrapper.

Alternatively, split the coordinator's publish into topic-based channels (e.g., `subscribeToSteps`, `subscribeToTrace`) so components only re-render for relevant changes.

**Detection:** Use React DevTools Profiler. If all workflow components flash on every action submission, you have this problem.

**Which phase:** Architect the selector pattern in Phase 1 alongside the multi-instance manager. Retrofitting selectors later means touching every component.

**Confidence:** HIGH - verified by reading `useWorkflow.ts` which returns the full snapshot object.

### Pitfall 4: ABANDON/RESTART Cascade Logic Missing from UI Layer

**What goes wrong:** The v2.0 UI adds state commands (ABANDON, RESTART, REPEAT) that affect workflow hierarchies. If workflow A spawned sub-workflow B, and ABANDON is issued on A, then B must also be abandoned. The pure-function engine handles single-workflow state transitions, but it does NOT manage parent-child relationships between workflow instances -- that is a UI/orchestration layer concern. If the cascade logic is forgotten, abandoning a parent leaves orphaned child workflows still running.

**Why it happens:** The engine is intentionally scoped to single-workflow execution. Parent-child relationships are a coordination concern. The current coordinator has no concept of workflow hierarchies.

**Consequences:** Orphaned workflows consuming memory and confusing users. The Active Workflows list shows child workflows still running after their parent was abandoned. State inconsistency between what the user expects and what is actually happening.

**Prevention:** The workflow instance manager (from Pitfall 2) must track parent-child relationships:
- When a workflow spawns a sub-workflow, record `parentId` on the child.
- ABANDON on a parent triggers ABANDON on all descendants (recursive).
- RESTART on a parent abandons children first, then restarts.
- Display the hierarchy in the Active Workflows screen so users understand relationships.

Define the cascade policies (ABANDON cascades down, RESTART cascades down then restarts root only, REPEAT restarts current only) before implementing any state commands.

**Detection:** Load a workflow that spawns a sub-workflow. Abandon the parent. Check if the sub-workflow is still in the active list.

**Which phase:** Define cascade policy in architecture phase. Implement when state commands are built.

**Confidence:** MEDIUM - depends on whether the workflow spec actually supports sub-workflows. The Temporal.io ecosystem documents this pattern extensively, confirming it is a real concern for any multi-workflow orchestrator.

## Moderate Pitfalls

Mistakes that cause delays or technical debt.

### Pitfall 5: Swipe Gestures on Carousel Conflict with Page Scroll and Tab Navigation

**What goes wrong:** The active step carousel supports horizontal swipe. The bottom tab bar may also support swipe-between-tabs. Vertical page scroll exists too. When a user swipes at a slight diagonal, all three gesture handlers compete. The browser's native scroll gets prevented by the carousel's touch handler, making the page feel "stuck." Or the carousel swipe accidentally triggers a tab switch.

**Why it happens:** Touch events do not natively disambiguate between horizontal swipe, vertical scroll, and diagonal gestures. The current implementation (`handleTouchStart`/`handleTouchEnd` with a 50px threshold) does not lock the gesture axis after detection. Multiple gesture surfaces on the same screen create ambiguity.

**Prevention:**
- Use a gesture library like `@use-gesture/react` that handles axis locking (once a horizontal swipe is detected, vertical scroll is suppressed, and vice versa).
- Set a minimum distance threshold (40-50px) AND an angle threshold (horizontal swipe only if angle < 30 degrees from horizontal).
- The bottom tab bar should NOT support swipe-between-tabs on web -- this is a mobile-native pattern that conflicts with in-page carousels. Use tap-only for tab switching.
- Use `touch-action: pan-y` CSS on the carousel container to tell the browser "I will handle horizontal, you handle vertical."

**Detection:** Test on a real touchscreen device (or Chrome DevTools mobile simulation). Try scrolling a page that has a carousel in the middle. If vertical scroll gets stuck, the gesture handling is wrong.

**Which phase:** Address when building the carousel (likely Phase 2 after navigation shell).

**Confidence:** HIGH - this is a well-known web touch handling issue, and the current code already shows a basic touch handler without axis locking.

### Pitfall 6: Bottom Tab Navigation State Lost on Device Frame Switch

**What goes wrong:** User is on the History tab viewing a specific trace entry inside the "phone" device frame. They switch to "tablet" frame. The app re-renders the frame contents, and navigation state resets to the Home tab because the tab state was local to the unmounted phone-frame component tree.

**Why it happens:** If tab navigation state lives inside the device frame component (e.g., `useState` in the frame's root), unmounting the phone frame and mounting the tablet frame creates a fresh component tree with fresh state.

**Consequences:** Frustrating UX -- users lose their place every time they switch device frames. This is especially bad for the overview/history screens where they may have drilled into a specific step.

**Prevention:** Lift ALL navigation and screen state above the device frame boundary:
- Tab selection state lives in the app-level store (not inside the frame).
- Screen-specific drill-down state (e.g., "viewing step X in history") lives in the store.
- The device frame is purely a visual wrapper that constrains dimensions and applies styling. It receives the current screen as children; it does not own the screen tree.

**Detection:** Switch device frames while on any non-Home tab. If you land on Home, the state was not lifted.

**Which phase:** Architecture decision in Phase 1. Must be enforced from the first screen implementation.

**Confidence:** HIGH - standard React state management issue, directly observable in the architecture.

### Pitfall 7: Workflow Graph Overview Becomes Unusable at Scale

**What goes wrong:** The Overview screen renders color-coded step thumbnails for the entire workflow graph. A simple linear workflow (10 steps) looks fine. A workflow with 50+ steps, parallel branches, and cycles becomes an unreadable mess of overlapping nodes. Layout algorithms like Dagre produce acceptable results for trees but struggle with cycles and wide parallel branches.

**Why it happens:** DAG layout is a hard problem. Workflows are not pure DAGs (they have cycles for retry loops). Most layout libraries assume acyclic graphs. Wide parallel branches (e.g., 5 parallel paths each with 3 steps) create very wide layouts that overflow the device frame, especially on phone-size.

**Consequences:** The Overview screen is unusable for complex workflows, which are exactly the workflows that benefit most from a visual overview.

**Prevention:**
- Start with a simple vertical list grouped by execution order, NOT a full graph layout. This works for 80% of workflows.
- If implementing graph visualization, use a library that handles cycles (React Flow with manual layout, or elkjs which supports cycles). Do not use dagre for cyclic graphs.
- Implement zoom and pan from the start (do not assume the graph fits in one screen).
- For phone-size frames, consider a simplified "step list with indentation for branches" instead of a spatial graph.
- Cache layout computations (layout is expensive; re-layouting on every state change causes jank). Only re-layout when the workflow structure changes, not when step states change (color updates should be in-place).

**Detection:** Load the most complex workflow fixture available. If the overview is unreadable or takes > 500ms to render, it needs work.

**Which phase:** Overview screen phase. Consider deferring full graph visualization to a later phase and starting with the simpler list-based view.

**Confidence:** MEDIUM - the complexity depends on actual workflow sizes. Dagster's blog post on scaling DAG visualization confirms this is a real issue at scale.

### Pitfall 8: CSS Media Queries Inside Device Frame Respond to Browser Viewport, Not Frame Size

**What goes wrong:** You build responsive step renderers using `@media (max-width: 375px)` expecting them to respond to the phone frame width. But media queries always respond to the browser viewport. In a desktop browser showing a phone-frame simulation, the viewport is 1920px wide, so the phone-specific media queries never fire.

**Why it happens:** CSS media queries are viewport-relative by specification. There is no way to make them respond to a parent container's size.

**Consequences:** Content inside the device frame renders in "desktop mode" despite being displayed in a phone-sized container. Layouts break; text overflows; buttons are too small or too large.

**Prevention:** Use CSS Container Queries exclusively for responsive styling inside device frames:
```css
.device-frame {
  container-type: inline-size;
  container-name: device;
}

@container device (max-width: 375px) {
  .step-card { /* phone-specific styles */ }
}
```
Container queries have 90%+ browser support in 2025+. Do NOT use `@media` queries for anything that must respond to frame size. Reserve `@media` for the outer shell (the desktop layout surrounding the frame).

**Detection:** Render a phone frame in a desktop browser. If the content looks desktop-sized inside the phone frame, media queries are being used instead of container queries.

**Which phase:** Must be established as a CSS convention in Phase 1. Every component built afterward must follow this rule.

**Confidence:** HIGH - CSS specification behavior; container queries are the documented solution.

## Minor Pitfalls

Mistakes that cause annoyance but are fixable.

### Pitfall 9: Blob URL Memory Leaks with Multiple Workflow Instances

**What goes wrong:** The current coordinator revokes blob URLs in `reset()` and when the workflow completes/aborts. With multiple simultaneous workflow instances, if a user abandons a workflow without calling reset(), or if the instance manager does not properly clean up, blob URLs accumulate. Each loaded `.WFmasterX` file creates blob URLs for media assets that persist until revoked.

**Prevention:** The instance manager must call `coordinator.reset()` (which revokes blobs) when removing a workflow instance. Add a `dispose()` method to the coordinator that is guaranteed to clean up all resources. Consider using `FinalizationRegistry` as a safety net for missed cleanups.

**Detection:** Load 10+ workflows, abandon them all, check browser memory in DevTools. If blob URLs are still listed in the Application tab, cleanup is failing.

**Which phase:** Address when building the multi-instance manager.

### Pitfall 10: Element Registry is Global Singleton -- Conflicts with Isolated Testing

**What goes wrong:** `registerDefaultElements()` is called once at module scope in `App.tsx`. The registry (`registry.ts`) is a module-level `Map`. This works for a single app instance but creates issues if tests need to run with different element configurations, or if the registry is accidentally double-registered.

**Prevention:** Accept the global registry for v2.0 (it works), but do not add instance-specific element configurations. If per-workflow custom elements are ever needed, refactor to a provider-based registry. For now, just ensure `registerDefaultElements()` is idempotent (register is a set operation, not append).

**Detection:** Not a visible issue unless testing surfaces it. Low priority.

**Which phase:** Not phase-critical. Monitor during testing.

### Pitfall 11: Fresh CSS Rebuild Loses Hard-Won Responsive Fixes

**What goes wrong:** The v2.0 plan calls for a fresh CSS approach (Phase 3 App.css will not carry forward). The current App.css contains responsive fixes for specific form elements (video sizing, image overflow, textarea heights) that were discovered through testing. A fresh rebuild may re-introduce fixed issues because the developer does not know they were problems in the first place.

**Prevention:** Before discarding App.css, catalog all responsive and element-specific CSS rules. Create a checklist of visual behaviors to verify (e.g., "video fits within phone frame," "long text in step descriptions wraps correctly," "timer element is legible at phone width"). Use this checklist as a visual regression test during the rebuild.

**Detection:** Side-by-side comparison of v1 and v2 rendering the same workflow fixtures.

**Which phase:** Phase 1 preparation, before any CSS is discarded.

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Device frame setup | Transform scale breaks interaction (P1) | Use fixed dimensions + container queries (P8) |
| Navigation shell | Tab state lost on frame switch (P6) | Lift state above frame boundary |
| Multi-workflow support | Single coordinator cannot manage multiple instances (P2) | Build instance manager from day one |
| Active step carousel | Swipe conflicts with scroll (P5) | Use gesture library with axis locking |
| State commands (ABANDON/RESTART) | Cascade logic missing (P4) | Define cascade policy before implementation |
| Overview screen | Graph unusable at scale (P7) | Start with list view, defer full graph |
| Snapshot subscriptions | Full re-render on any change (P3) | Selector pattern from day one |
| CSS architecture | Media queries ignore frame size (P8) | Container queries convention established early |
| Fresh CSS approach | Responsive regressions (P11) | Catalog existing fixes before discarding |

## Integration Pitfalls with Existing System

### Engine API is Frozen -- UI Must Adapt

The engine core is frozen (119 tests, Phase 1 complete). The coordinator wraps it. Any missing capability (e.g., hierarchical workflow tracking) must be built in the UI/coordination layer, not by modifying the engine. Do not be tempted to "just add a field" to the engine for UI convenience.

### Coordinator Snapshot Shape May Need Breaking Changes

The `CoordinatorSnapshot` interface was designed for single-workflow use. Adding multi-instance support may require changing the snapshot shape. Plan the migration: either extend the interface (backward-compatible) or introduce a new `InstanceSnapshot` type that wraps the existing one with instance metadata.

### Form Element Registry Must Survive the Rebuild

The element registry pattern (`registry.ts` with `registerElement`/`getElement`) is a good pattern. The rebuild should reuse the registry concept even if component implementations are rewritten. Do not accidentally replace it with a switch statement or lose the extensibility.

## Sources

- [CSS Transform Scale with Preview Containers](https://mudosdigital.com/css-transform-origin-and-scale-with-responsive-preview-containers/) - Device frame scaling issues
- [Scaling iframes with CSS Transforms](https://codepen.io/herschel666/post/scaling-iframes-css-transforms) - Iframe scaling pitfalls
- [Disproportional scroll speed with CSS transform scale](https://discourse.wicg.io/t/how-do-we-fix-disproportional-scroll-speed-when-css-transform-scale-is-applied/3071/) - Scroll physics under transform
- [CSS Container Queries Complete Guide](https://dev.to/blues-2025/css-container-queries-complete-guide-say-goodbye-to-media-query-pain-points-3m9m) - Container queries as solution
- [Scaling DAG Visualization (Dagster)](https://dagster.io/blog/scaling-dag-visualization) - Graph rendering at scale
- [React Flow Performance](https://reactflow.dev/learn/advanced-use/performance) - Node-based UI performance
- [Avoiding State Inconsistencies with Multiple React Context Providers](https://dev.to/rakshyak/avoiding-state-inconsistencies-the-pitfall-of-multiple-react-context-providers-4e29) - Multi-instance context
- [useSyncExternalStore - React Official Docs](https://react.dev/reference/react/useSyncExternalStore) - Snapshot comparison behavior
- [Temporal Child Workflows](https://docs.temporal.io/child-workflows) - Cascade termination patterns
- [Gesture Conflicts in React Navigation](https://medium.com/@mohantaankit2002/fixing-gesture-conflicts-between-react-navigation-and-other-ui-libraries-275ac5b5bf11) - Touch gesture conflicts
- [use-gesture](https://github.com/pmndrs/use-gesture) - Gesture library for axis locking
- [Handling Pan and Scroll Simultaneously](https://medium.com/@taitasciore/handling-pan-and-scroll-gestures-simultaneously-and-gracefully-with-gesture-handler-2-reanimated-63f0d8f72d3c) - Gesture disambiguation
- Existing source code: `WorkflowCoordinator.ts`, `WorkflowContext.tsx`, `useWorkflow.ts`, `App.tsx`, `WorkflowRunner.tsx`
