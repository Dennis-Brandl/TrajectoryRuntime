# Overview Screen Design Spec

**Date:** 2026-03-17
**Requirements:** OVER-01, OVER-02, OVER-03, OVER-04
**Phase:** 7 (partial — History already complete from v2.1)

## Summary

The Overview screen renders an SVG workflow graph showing all steps as color-coded rectangles connected by edges. Users can zoom in/out with buttons, drag to pan when zoomed, and swipe between active workflows via Embla Carousel. Node labels are hidden by default and revealed on hover/tap via tooltip.

## Component Architecture

```
OverviewScreen
  ├── EmptyState (inline) — "No active workflows" centered text + GitBranch icon
  └── Embla Carousel — one slide per active workflow
        └── WorkflowGraph — SVG graph for one workflow
              ├── GraphEdge — SVG cubic bezier path per connection
              ├── GraphNode — SVG rect per step, color-coded by state
              ├── NodeTooltip — HTML div overlay on hover/tap
              └── ZoomControls — +/- button overlay (bottom-right corner)
```

### Files

| File | Action | Purpose |
|------|--------|---------|
| `src/components/screens/OverviewScreen.tsx` | Replace | Carousel + empty state + coordinator wiring |
| `src/components/screens/OverviewScreen.module.css` | Create | Screen layout, tooltip, zoom control styles |
| `src/components/screens/WorkflowGraph.tsx` | Create | SVG rendering, zoom/pan state, node/edge/tooltip rendering |

GraphEdge, GraphNode, NodeTooltip, and ZoomControls are internal to WorkflowGraph (not separate files).

## Data Flow

```
WorkflowManager.getSnapshot()
  → active[]           — list of running workflows
  → focusedActiveId    — which carousel slide to show

WorkflowCoordinator.getSpec()
  → steps[]            — position {x, y}, step_type, local_id, oid
  → connections[]      — from_step_id, to_step_id

WorkflowCoordinator.getSnapshot()
  → activeSteps[]      — ONLY currently active steps (EXECUTING, PAUSED, WAITING)
  → trace[]            — all state transitions for all steps (completed, errored, etc.)
```

### State Resolution Algorithm

For each step in `spec.steps`:

1. Default state = `IDLE` (gray)
2. Scan `trace[]` for entries matching `step.oid`. Take the entry with the highest index (most recent transition). Use its `state` value.
3. If `step.oid` appears in `activeSteps[]`, use that state instead (activeSteps takes precedence since trace may lag behind the current snapshot).
4. Map resolved state → color using the table below.

### Step State → Color Mapping

| StepState | Color | Additional |
|-----------|-------|------------|
| COMPLETED | `#4ade80` (green) | opacity 0.9 |
| EXECUTING | `#3b82f6` (blue) | 3px stroke `#93c5fd` (glow border) |
| WAITING | `#93c5fd` (light blue) | — |
| PAUSED | `#eab308` (yellow) | — |
| ERRORED | `#ef4444` (red) | — |
| IDLE / STARTING / COMPLETING (default) | `#6b7280` (gray) | opacity 0.7 |

## SVG Rendering

### ViewBox Calculation

1. Read all step positions from spec
2. Calculate bounding box: `minX`, `minY`, `maxX + nodeWidth`, `maxY + nodeHeight`
3. Add 40px padding on all sides
4. Set `viewBox` to the bounding box
5. SVG element uses `preserveAspectRatio="xMidYMid meet"` to fit container

### Nodes

- Default shape: 60×36px rounded rectangles (`rx="6"`)
- **Diamond shape** for control-flow steps (`SELECT 1`, `WAIT ANY`, `WAIT ALL`, `PARALLEL`): rotated 45° square inscribed in the 60×36 bounding box, rendered as an SVG `<polygon>` with 4 points (top-center, right-center, bottom-center, left-center)
- Positioned at authored `position.x`, `position.y` from spec
- Fill color determined by state mapping above
- No text inside nodes

### Edges

- Cubic bezier curves for vertical flow: `M fromX,fromBottom C fromX,mid toX,mid toX,toTop`
- From center-bottom of source node to center-top of target node
- Stroke: `#475569`, width 2
- Rendered before nodes in SVG (nodes layer on top)

### Tooltip

- HTML `<div>` absolutely positioned over the SVG container
- Appears on node hover (mouse) or tap (touch)
- Shows: step `local_id` and `step_type`
- Dismissed on mouse leave or tap elsewhere
- Position calculated from SVG node coordinates → screen coordinates via `getBoundingClientRect` + viewBox transform

## Zoom & Pan

### Zoom Controls

- Two buttons (`+` / `−`) in a pill-shaped container, bottom-right corner of the graph area
- `+` zooms in (reduces viewBox dimensions by 30%)
- `−` zooms out (increases viewBox dimensions by 30%)
- Scale range: 0.5x to 3x of fit-to-screen size
- "Fit" button resets to default viewBox (optional — only if space permits)

### Pan

- Mouse: click-drag on SVG translates viewBox origin
- Touch: single-finger drag translates viewBox origin
- Only active when zoomed in (scale > 1x default)
- At default zoom, touch drag is captured by Embla Carousel for workflow switching
- Scroll wheel: zooms in/out (same as +/- buttons) when pointer is over the SVG area. Does not scroll the page since the graph is inside a fixed device frame.

### Zoom/Pan State

- Stored in `useRef` (not React state) to avoid re-renders during drag
- `requestAnimationFrame` for smooth pan updates
- Reset to fit-to-screen when switching workflows via carousel

## Multi-Workflow Carousel

- Embla Carousel wraps N `WorkflowGraph` components (one per active workflow)
- Workflow `local_id` displayed as title above each graph
- Dot indicators at bottom (count of active workflows)
- **Gesture conflict resolution:** At default zoom, horizontal swipe = carousel slide change. When zoomed in (scale > 1x), Embla's `watchDrag` option is set to `false` to disable carousel drag, and touch events go to SVG panning instead.
- Syncs with `focusedActiveId` from WorkflowManager — selecting a workflow on Active screen auto-scrolls here
- Single workflow: no dots, no swipe gesture

## Live State Updates

- `useSyncExternalStore` subscribes to coordinator snapshot changes
- Node colors update in real-time as steps transition states
- Graph structure (positions, connections) is static from spec — only node colors are reactive
- Screen stays mounted via `display:none` tab pattern — preserves zoom/pan state across tab switches

## Edge Cases

| Case | Behavior |
|------|----------|
| No active workflows | Centered empty state: GitBranch icon + "No active workflows" text |
| Steps without position data | Fallback auto-layout: simple layer assignment — assign each step a layer based on longest path from START, 100px vertical spacing between layers, distribute steps within a layer horizontally with 80px gaps. If cycles exist (WAIT ANY re-entry), break back-edges before layering. Best-effort; not pixel-perfect. |
| Single active workflow | Graph fills area, no carousel dots or swipe |
| Workflow completes mid-view | Graph stays visible with final state colors until removed from active list |
| Very large graph (20+ steps) | Fit-to-screen makes nodes small; user zooms in with +/- buttons |

## Requirements Traceability

| Requirement | How Addressed |
|-------------|---------------|
| OVER-01: Scrollable SVG graph | SVG with viewBox zoom/pan, fills screen |
| OVER-02: Color-coded by state | State → color mapping (green/blue/gray/yellow/red) |
| OVER-03: Steps connected by edges | Cubic bezier paths from spec.connections |
| OVER-04: Swipe left/right for other workflows | Embla Carousel, one graph per active workflow |

## Out of Scope

- Workflow editor / node dragging
- Animated step transitions (fade between colors)
- Connection labels or condition text on edges
- Minimap for large graphs
- Pinch-to-zoom (conflicts with browser zoom)
