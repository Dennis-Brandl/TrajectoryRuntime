# Overview Screen Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Overview screen placeholder with an SVG workflow graph visualization showing color-coded step states, zoom/pan controls, and multi-workflow carousel.

**Architecture:** Pure SVG + React, no new dependencies. WorkflowGraph renders nodes (rects/diamonds) and edges (bezier paths) from the workflow spec's authored positions. State colors come from merging coordinator trace + activeSteps. Embla Carousel enables swiping between active workflows.

**Tech Stack:** React, SVG, Embla Carousel (already installed), CSS Modules, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-17-overview-screen-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `engines/web-ui/src/components/screens/WorkflowGraph.tsx` | Create | SVG graph rendering: nodes, edges, tooltip, zoom/pan, state-to-color mapping |
| `engines/web-ui/src/components/screens/OverviewScreen.tsx` | Replace | Embla Carousel wrapping WorkflowGraph per active workflow, empty state, focus sync |
| `engines/web-ui/src/components/screens/OverviewScreen.module.css` | Create | Screen layout, tooltip positioning, zoom controls, dot indicators |

---

## Chunk 1: WorkflowGraph Component

### Task 1: Create WorkflowGraph with static SVG rendering (nodes + edges)

**Files:**
- Create: `engines/web-ui/src/components/screens/WorkflowGraph.tsx`

- [ ] **Step 1: Create WorkflowGraph component with types and props**

```tsx
// engines/web-ui/src/components/screens/WorkflowGraph.tsx
import { useState, useRef, useCallback, useEffect } from 'react';
import type { MasterWorkflowSpecification, MasterWorkflowStep, WorkflowConnection } from '@engine/types.js';
import type { CoordinatorSnapshot } from '../../coordinator/WorkflowCoordinator';
import styles from './OverviewScreen.module.css';

const NODE_W = 60;
const NODE_H = 36;
const PADDING = 40;
const DIAMOND_STEP_TYPES = new Set(['SELECT 1', 'WAIT ANY', 'WAIT ALL', 'PARALLEL']);

interface StepColor {
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
}

function resolveStepColor(state: string): StepColor {
  switch (state) {
    case 'COMPLETED':
      return { fill: '#4ade80', opacity: 0.9 };
    case 'EXECUTING':
      return { fill: '#3b82f6', stroke: '#93c5fd', strokeWidth: 3 };
    case 'WAITING':
      return { fill: '#93c5fd' };
    case 'PAUSED':
      return { fill: '#eab308' };
    case 'ERRORED':
      return { fill: '#ef4444' };
    default: // IDLE, STARTING, COMPLETING, etc.
      return { fill: '#6b7280', opacity: 0.7 };
  }
}

function resolveStepStates(
  spec: MasterWorkflowSpecification,
  snapshot: CoordinatorSnapshot | null,
): Map<string, string> {
  const stateMap = new Map<string, string>();
  // 1. Default all to IDLE
  for (const step of spec.steps) {
    stateMap.set(step.oid, 'IDLE');
  }
  if (!snapshot) return stateMap;
  // 2. Scan trace for most recent state per step
  for (const entry of snapshot.trace) {
    stateMap.set(entry.step_oid, entry.state);
  }
  // 3. Override with activeSteps (takes precedence)
  for (const active of snapshot.activeSteps) {
    stateMap.set(active.step.oid, active.step.state);
  }
  return stateMap;
}

function computeViewBox(steps: MasterWorkflowStep[]): { x: number; y: number; w: number; h: number } {
  if (steps.length === 0) return { x: 0, y: 0, w: 400, h: 300 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const step of steps) {
    const px = step.position?.x ?? 0;
    const py = step.position?.y ?? 0;
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (px + NODE_W > maxX) maxX = px + NODE_W;
    if (py + NODE_H > maxY) maxY = py + NODE_H;
  }
  return {
    x: minX - PADDING,
    y: minY - PADDING,
    w: maxX - minX + PADDING * 2,
    h: maxY - minY + PADDING * 2,
  };
}

function fallbackLayout(steps: MasterWorkflowStep[], connections: WorkflowConnection[]): MasterWorkflowStep[] {
  // Build adjacency from connections
  const children = new Map<string, string[]>();
  const parents = new Map<string, string[]>();
  for (const c of connections) {
    children.set(c.from_step_id, [...(children.get(c.from_step_id) ?? []), c.to_step_id]);
    parents.set(c.to_step_id, [...(parents.get(c.to_step_id) ?? []), c.from_step_id]);
  }
  // Assign layers via longest path from roots (steps with no parents)
  const layers = new Map<string, number>();
  const visited = new Set<string>();
  function dfs(oid: string, depth: number) {
    if (visited.has(oid)) { // cycle — break back-edge
      layers.set(oid, Math.max(layers.get(oid) ?? 0, depth));
      return;
    }
    visited.add(oid);
    layers.set(oid, Math.max(layers.get(oid) ?? 0, depth));
    for (const child of children.get(oid) ?? []) {
      dfs(child, depth + 1);
    }
    visited.delete(oid);
  }
  // Find roots (no parents)
  const roots = steps.filter(s => !(parents.get(s.oid)?.length));
  if (roots.length === 0 && steps.length > 0) {
    // All steps have parents (cycle) — pick first as root
    dfs(steps[0].oid, 0);
  } else {
    for (const root of roots) dfs(root.oid, 0);
  }
  // Group by layer
  const layerGroups = new Map<number, MasterWorkflowStep[]>();
  for (const step of steps) {
    const layer = layers.get(step.oid) ?? 0;
    layerGroups.set(layer, [...(layerGroups.get(layer) ?? []), step]);
  }
  // Assign positions
  const result: MasterWorkflowStep[] = [];
  for (const [layer, group] of [...layerGroups.entries()].sort((a, b) => a[0] - b[0])) {
    const totalWidth = group.length * NODE_W + (group.length - 1) * 80;
    const startX = (400 - totalWidth) / 2; // center around 400px width
    for (let i = 0; i < group.length; i++) {
      result.push({
        ...group[i],
        position: { x: Math.max(0, startX + i * (NODE_W + 80)), y: layer * 100 },
      });
    }
  }
  return result;
}

interface WorkflowGraphProps {
  spec: MasterWorkflowSpecification;
  snapshot: CoordinatorSnapshot | null;
  isActive: boolean; // whether this slide is the currently visible carousel slide
  onZoomChange?: (isZoomed: boolean) => void;
}

export function WorkflowGraph({ spec, snapshot, isActive, onZoomChange }: WorkflowGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Ensure all steps have positions
  const layoutSteps = spec.steps.every(s => s.position)
    ? spec.steps
    : fallbackLayout(spec.steps, spec.connections);

  const baseVB = computeViewBox(layoutSteps);

  // Zoom/pan state in refs for performance
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const [, forceRender] = useState(0);

  // Tooltip state
  const [tooltip, setTooltip] = useState<{ x: number; y: number; localId: string; stepType: string } | null>(null);

  const getViewBox = useCallback(() => {
    const z = zoomRef.current;
    const p = panRef.current;
    const w = baseVB.w / z;
    const h = baseVB.h / z;
    const cx = baseVB.x + baseVB.w / 2 + p.x;
    const cy = baseVB.y + baseVB.h / 2 + p.y;
    return `${cx - w / 2} ${cy - h / 2} ${w} ${h}`;
  }, [baseVB]);

  const applyViewBox = useCallback(() => {
    if (svgRef.current) {
      svgRef.current.setAttribute('viewBox', getViewBox());
    }
  }, [getViewBox]);

  // Zoom controls
  const zoom = useCallback((direction: 1 | -1) => {
    const factor = direction === 1 ? 1.3 : 1 / 1.3;
    zoomRef.current = Math.min(3, Math.max(0.5, zoomRef.current * factor));
    applyViewBox();
    onZoomChange?.(zoomRef.current > 1.05);
    forceRender(n => n + 1); // re-render to update carousel drag state
  }, [applyViewBox, onZoomChange]);

  const resetZoom = useCallback(() => {
    zoomRef.current = 1;
    panRef.current = { x: 0, y: 0 };
    applyViewBox();
    onZoomChange?.(false);
    forceRender(n => n + 1);
  }, [applyViewBox, onZoomChange]);

  // Pan via mouse/touch drag (only when zoomed)
  const dragState = useRef<{ startX: number; startY: number; startPanX: number; startPanY: number } | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (zoomRef.current <= 1) return; // no pan at default zoom
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPanX: panRef.current.x,
      startPanY: panRef.current.y,
    };
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragState.current || !svgRef.current) return;
    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    const scaleX = (baseVB.w / zoomRef.current) / rect.width;
    const scaleY = (baseVB.h / zoomRef.current) / rect.height;
    panRef.current = {
      x: dragState.current.startPanX - (e.clientX - dragState.current.startX) * scaleX,
      y: dragState.current.startPanY - (e.clientY - dragState.current.startY) * scaleY,
    };
    requestAnimationFrame(applyViewBox);
  }, [baseVB, applyViewBox]);

  const onPointerUp = useCallback(() => {
    dragState.current = null;
  }, []);

  // Scroll wheel zoom
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    zoom(e.deltaY < 0 ? 1 : -1);
  }, [zoom]);

  // Reset zoom/pan when slide becomes active
  useEffect(() => {
    if (isActive) resetZoom();
  }, [isActive, resetZoom]);

  // Resolve step states for coloring
  const stateMap = resolveStepStates(spec, snapshot);

  // Build step position lookup for edge rendering
  const stepPos = new Map<string, { x: number; y: number }>();
  for (const step of layoutSteps) {
    stepPos.set(step.oid, step.position ?? { x: 0, y: 0 });
  }

  // Node click/hover for tooltip
  const showTooltip = useCallback((step: MasterWorkflowStep, e: React.MouseEvent | React.TouchEvent) => {
    if (!containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const target = e.currentTarget as SVGElement;
    const nodeRect = target.getBoundingClientRect();
    setTooltip({
      x: nodeRect.left + nodeRect.width / 2 - containerRect.left,
      y: nodeRect.top - containerRect.top - 8,
      localId: step.local_id,
      stepType: step.step_type,
    });
  }, []);

  const hideTooltip = useCallback(() => setTooltip(null), []);

  const isZoomed = zoomRef.current > 1.05;

  return (
    <div className={styles.graphContainer} ref={containerRef}>
      <svg
        ref={svgRef}
        className={styles.graphSvg}
        viewBox={getViewBox()}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
        style={{ touchAction: isZoomed ? 'none' : 'pan-x' }}
      >
        {/* Edges (rendered first, behind nodes) */}
        {spec.connections.map((conn, i) => {
          const from = stepPos.get(conn.from_step_id);
          const to = stepPos.get(conn.to_step_id);
          if (!from || !to) return null;
          const x1 = from.x + NODE_W / 2;
          const y1 = from.y + NODE_H;
          const x2 = to.x + NODE_W / 2;
          const y2 = to.y;
          const midY = (y1 + y2) / 2;
          return (
            <path
              key={`edge-${i}`}
              d={`M ${x1},${y1} C ${x1},${midY} ${x2},${midY} ${x2},${y2}`}
              stroke="#475569"
              strokeWidth={2}
              fill="none"
            />
          );
        })}

        {/* Nodes */}
        {layoutSteps.map((step) => {
          const pos = step.position ?? { x: 0, y: 0 };
          const state = stateMap.get(step.oid) ?? 'IDLE';
          const color = resolveStepColor(state);
          const isDiamond = DIAMOND_STEP_TYPES.has(step.step_type);

          if (isDiamond) {
            // Diamond: 4 points inscribed in the 60x36 bounding box
            const cx = pos.x + NODE_W / 2;
            const cy = pos.y + NODE_H / 2;
            const points = `${cx},${pos.y} ${pos.x + NODE_W},${cy} ${cx},${pos.y + NODE_H} ${pos.x},${cy}`;
            return (
              <polygon
                key={step.oid}
                points={points}
                fill={color.fill}
                stroke={color.stroke ?? 'none'}
                strokeWidth={color.strokeWidth ?? 0}
                opacity={color.opacity ?? 1}
                onMouseEnter={(e) => showTooltip(step, e)}
                onMouseLeave={hideTooltip}
                onClick={(e) => showTooltip(step, e)}
                style={{ cursor: 'pointer' }}
              />
            );
          }

          return (
            <rect
              key={step.oid}
              x={pos.x}
              y={pos.y}
              width={NODE_W}
              height={NODE_H}
              rx={6}
              fill={color.fill}
              stroke={color.stroke ?? 'none'}
              strokeWidth={color.strokeWidth ?? 0}
              opacity={color.opacity ?? 1}
              onMouseEnter={(e) => showTooltip(step, e)}
              onMouseLeave={hideTooltip}
              onClick={(e) => showTooltip(step, e)}
              style={{ cursor: 'pointer' }}
            />
          );
        })}
      </svg>

      {/* Tooltip overlay */}
      {tooltip && (
        <div
          className={styles.tooltip}
          style={{ left: tooltip.x, top: tooltip.y }}
          onClick={hideTooltip}
        >
          <div className={styles.tooltipId}>{tooltip.localId}</div>
          <div className={styles.tooltipType}>{tooltip.stepType}</div>
        </div>
      )}

      {/* Zoom controls */}
      <div className={styles.zoomControls}>
        <button className={styles.zoomBtn} onClick={() => zoom(1)} aria-label="Zoom in">+</button>
        <button className={styles.zoomBtn} onClick={() => zoom(-1)} aria-label="Zoom out">−</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the file compiles (no syntax errors)**

Run: `cd engines/web-ui && npx tsc --noEmit src/components/screens/WorkflowGraph.tsx 2>&1 | head -20`
Expected: May show errors for missing CSS module — that's expected until Task 2.

- [ ] **Step 3: Commit**

```bash
git add engines/web-ui/src/components/screens/WorkflowGraph.tsx
git commit -m "feat: add WorkflowGraph SVG component with nodes, edges, zoom, pan, tooltip"
```

---

### Task 2: Create OverviewScreen.module.css

**Files:**
- Create: `engines/web-ui/src/components/screens/OverviewScreen.module.css`

- [ ] **Step 1: Write the CSS module**

```css
/* engines/web-ui/src/components/screens/OverviewScreen.module.css */

.screen {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.emptyState {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 40px;
  color: #999;
  gap: 8px;
}

.emptyIcon { color: #ccc; }
.emptyText { font-size: 16px; margin: 0; }

/* Carousel */
.viewport {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.carouselContainer {
  display: flex;
  flex: 1;
  min-height: 0;
}

.slide {
  flex: 0 0 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.slideTitle {
  text-align: center;
  font-size: 13px;
  font-weight: 600;
  color: #555;
  padding: 6px 0 2px;
  flex-shrink: 0;
}

.dots {
  display: flex;
  justify-content: center;
  gap: 6px;
  padding: 8px;
  flex-shrink: 0;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #d0d0d0;
  transition: background 0.2s;
}

.dotActive { background: #2980b9; }

/* Graph container */
.graphContainer {
  flex: 1;
  min-height: 0;
  position: relative;
  overflow: hidden;
}

.graphSvg {
  width: 100%;
  height: 100%;
  display: block;
}

/* Tooltip */
.tooltip {
  position: absolute;
  transform: translate(-50%, -100%);
  background: #1e293b;
  color: #e2e8f0;
  border: 1px solid #475569;
  border-radius: 6px;
  padding: 6px 10px;
  pointer-events: auto;
  z-index: 5;
  white-space: nowrap;
  font-size: 12px;
}

.tooltipId {
  font-weight: 600;
}

.tooltipType {
  font-size: 11px;
  color: #94a3b8;
}

/* Zoom controls */
.zoomControls {
  position: absolute;
  bottom: 12px;
  right: 12px;
  display: flex;
  flex-direction: column;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 8px;
  overflow: hidden;
  z-index: 5;
}

.zoomBtn {
  width: 36px;
  height: 36px;
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 18px;
  font-weight: bold;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.zoomBtn:hover {
  background: #334155;
  color: #e2e8f0;
}

.zoomBtn + .zoomBtn {
  border-top: 1px solid #334155;
}
```

- [ ] **Step 2: Commit**

```bash
git add engines/web-ui/src/components/screens/OverviewScreen.module.css
git commit -m "feat: add OverviewScreen CSS module with graph, tooltip, zoom styles"
```

---

## Chunk 2: OverviewScreen Component + Integration

### Task 3: Replace OverviewScreen placeholder with carousel + WorkflowGraph

**Files:**
- Replace: `engines/web-ui/src/components/screens/OverviewScreen.tsx`

- [ ] **Step 1: Write the OverviewScreen component**

```tsx
// engines/web-ui/src/components/screens/OverviewScreen.tsx
import { useEffect, useMemo, useState, useCallback } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import type { EmblaCarouselType } from 'embla-carousel';
import { GitBranch } from 'lucide-react';
import { useWorkflowManager, useManagerSnapshot } from '../../manager/useWorkflowManager';
import type { CoordinatorSnapshot } from '../../coordinator/WorkflowCoordinator';
import type { MasterWorkflowSpecification } from '@engine/types.js';
import type { WorkflowManager } from '../../manager/WorkflowManager';
import { WorkflowGraph } from './WorkflowGraph';
import styles from './OverviewScreen.module.css';

function DotIndicator({ count, selected }: { count: number; selected: number }) {
  if (count <= 1) return null;
  return (
    <div className={styles.dots}>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className={`${styles.dot}${i === selected ? ` ${styles.dotActive}` : ''}`} />
      ))}
    </div>
  );
}

interface SlideData {
  id: string;
  localId: string;
  spec: MasterWorkflowSpecification;
  snapshot: CoordinatorSnapshot;
}

/** Build current slide data from all active workflows. */
function buildSlides(manager: WorkflowManager): SlideData[] {
  const managerSnap = manager.getSnapshot();
  return managerSnap.active
    .map(wf => {
      const coordinator = manager.getCoordinator(wf.id);
      if (!coordinator) return null;
      const spec = coordinator.getSpec();
      if (!spec) return null;
      return {
        id: wf.id,
        localId: wf.localId,
        spec,
        snapshot: coordinator.getSnapshot(),
      };
    })
    .filter((s): s is SlideData => s !== null);
}

export function OverviewScreen() {
  const manager = useWorkflowManager();
  const managerSnap = useManagerSnapshot();
  const [selected, setSelected] = useState(0);
  const [isZoomed, setIsZoomed] = useState(false);
  const [slides, setSlides] = useState<SlideData[]>(() => buildSlides(manager));

  const emblaOptions = useMemo(() => ({
    loop: false,
    align: 'start' as const,
    containScroll: false as const,
    watchDrag: !isZoomed,
  }), [isZoomed]);
  const [emblaRef, emblaApi] = useEmblaCarousel(emblaOptions);

  // Subscribe to both manager AND each active coordinator for live state updates.
  // Pattern from useAllActiveSteps.ts — dynamically manages coordinator subscriptions.
  const refresh = useCallback(() => {
    setSlides(buildSlides(manager));
  }, [manager]);

  useEffect(() => {
    const coordUnsubs = new Map<string, () => void>();

    const syncCoordinatorSubs = () => {
      const snap = manager.getSnapshot();
      const currentIds = new Set<string>();
      for (const wf of snap.active) {
        currentIds.add(wf.id);
        if (!coordUnsubs.has(wf.id)) {
          const coord = manager.getCoordinator(wf.id);
          if (coord) {
            coordUnsubs.set(wf.id, coord.subscribe(refresh));
          }
        }
      }
      for (const [id, unsub] of coordUnsubs) {
        if (!currentIds.has(id)) {
          unsub();
          coordUnsubs.delete(id);
        }
      }
    };

    const managerUnsub = manager.subscribe(() => {
      syncCoordinatorSubs();
      refresh();
    });

    syncCoordinatorSubs();
    refresh();

    return () => {
      managerUnsub();
      for (const unsub of coordUnsubs.values()) unsub();
      coordUnsubs.clear();
    };
  }, [manager, refresh]);

  // Sync Embla selection
  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = (api: EmblaCarouselType) => {
      setSelected(api.selectedScrollSnap());
    };
    emblaApi.on('select', onSelect);
    onSelect(emblaApi);
    return () => { emblaApi.off('select', onSelect); };
  }, [emblaApi]);

  // Scroll to focused workflow when focus changes externally
  useEffect(() => {
    if (!emblaApi || !managerSnap.focusedActiveId) return;
    const idx = slides.findIndex(s => s.id === managerSnap.focusedActiveId);
    if (idx >= 0 && idx !== selected) {
      emblaApi.scrollTo(idx);
    }
  }, [managerSnap.focusedActiveId, emblaApi, slides, selected]);

  // Update manager focus when carousel slide changes
  useEffect(() => {
    const slide = slides[selected];
    if (slide) manager.focusWorkflow(slide.id);
  }, [selected, slides, manager]);

  // Reinit carousel when slides change
  useEffect(() => {
    if (emblaApi && slides.length > 0) emblaApi.reInit();
  }, [emblaApi, slides.length, isZoomed]);

  // Clamp selected if slides shrink
  useEffect(() => {
    if (slides.length > 0 && selected >= slides.length) {
      setSelected(slides.length - 1);
    }
  }, [slides.length, selected]);

  const onZoomChange = useCallback((zoomed: boolean) => {
    setIsZoomed(zoomed);
  }, []);

  if (slides.length === 0) {
    return (
      <div className={styles.screen}>
        <div className={styles.emptyState}>
          <GitBranch size={48} className={styles.emptyIcon} />
          <p className={styles.emptyText}>No active workflows</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      <div className={styles.viewport} ref={emblaRef}>
        <div className={styles.carouselContainer}>
          {slides.map((slide, i) => (
            <div className={styles.slide} key={slide.id}>
              <div className={styles.slideTitle}>{slide.localId}</div>
              <WorkflowGraph
                spec={slide.spec}
                snapshot={slide.snapshot}
                isActive={i === selected}
                onZoomChange={onZoomChange}
              />
            </div>
          ))}
        </div>
      </div>
      <DotIndicator count={slides.length} selected={selected} />
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript compilation**

Run: `cd engines/web-ui && npx tsc --noEmit 2>&1 | head -30`
Expected: No errors (or only pre-existing ones).

- [ ] **Step 4: Commit**

```bash
git add engines/web-ui/src/components/screens/OverviewScreen.tsx engines/web-ui/src/components/screens/WorkflowGraph.tsx
git commit -m "feat: replace Overview placeholder with SVG graph carousel"
```

---

### Task 4: Manual verification

- [ ] **Step 1: Start the dev server**

Run: `cd engines/web-ui && npm run dev`

- [ ] **Step 2: Verify in browser**

Open the app. Load a workflow (e.g. any fixture JSON) and start it. Navigate to the Overview tab. Verify:

1. Graph renders with nodes at correct positions
2. Nodes are color-coded (green for completed, blue for executing, gray for pending)
3. Diamond shapes appear for PARALLEL, WAIT ALL, WAIT ANY, SELECT 1 step types
4. Edges connect steps with bezier curves
5. Hovering a node shows tooltip with local_id and step_type
6. +/- zoom buttons work
7. Drag-to-pan works when zoomed in
8. Scroll wheel zooms
9. Empty state shows "No active workflows" when no workflows are running
10. With multiple workflows active, carousel dots appear and swiping switches between graphs

- [ ] **Step 3: Fix any issues found during verification**

- [ ] **Step 4: Commit any fixes**

```bash
git add -u
git commit -m "fix: address Overview screen verification issues"
```
