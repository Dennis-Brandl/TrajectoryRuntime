// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
// engines/web-ui/src/components/screens/WorkflowGraph.tsx
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { MasterWorkflowSpecification, MasterWorkflowStep, WorkflowConnection, DisplayStyle } from '@engine/types.js';
import type { CoordinatorSnapshot } from '../../coordinator/WorkflowCoordinator';
import styles from './OverviewScreen.module.css';

const PADDING = 40;
const DIAMOND_STEP_TYPES = new Set(['SELECT 1', 'WAIT ANY', 'WAIT ALL', 'PARALLEL']);
const CIRCLE_STEP_TYPES = new Set(['START', 'END']);

// Editor node dimensions (flowchart) — positions in the JSON assume these sizes,
// and the runtime renders at the same scale so connections meet the symbols
// without offset. Matches TrajectoryEditor `notation-config.ts`.
const EDITOR_RECT_W = 120;
const EDITOR_RECT_H = 50;
const EDITOR_GATEWAY_W = 60;
const EDITOR_GATEWAY_H = 60;
const EDITOR_CIRCLE_SIZE = 30;
const EDITOR_RECT_RX = 4;
const EDITOR_CIRCLE_R = 13;

function editorNodeSize(stepType: string): { w: number; h: number } {
  if (CIRCLE_STEP_TYPES.has(stepType)) return { w: EDITOR_CIRCLE_SIZE, h: EDITOR_CIRCLE_SIZE };
  if (DIAMOND_STEP_TYPES.has(stepType)) return { w: EDITOR_GATEWAY_W, h: EDITOR_GATEWAY_H };
  return { w: EDITOR_RECT_W, h: EDITOR_RECT_H };
}

/** Get the editor-intended center point for a step. */
function stepCenter(pos: { x: number; y: number }, stepType: string): { cx: number; cy: number } {
  const { w, h } = editorNodeSize(stepType);
  return { cx: pos.x + w / 2, cy: pos.y + h / 2 };
}

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
  const specOids = new Set<string>();
  for (const step of spec.steps) {
    stateMap.set(step.oid, 'IDLE');
    specOids.add(step.oid);
  }
  if (!snapshot) return stateMap;
  // 2. Scan trace — only apply entries for steps in this spec
  for (const entry of snapshot.trace) {
    if (specOids.has(entry.step_oid)) {
      stateMap.set(entry.step_oid, entry.state);
    }
  }
  // 3. Override with activeSteps (takes precedence)
  for (const active of snapshot.activeSteps) {
    if (specOids.has(active.step.oid)) {
      stateMap.set(active.step.oid, active.step.state);
    }
  }
  return stateMap;
}

function computeViewBox(steps: MasterWorkflowStep[]): { x: number; y: number; w: number; h: number } {
  if (steps.length === 0) return { x: 0, y: 0, w: 400, h: 300 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const step of steps) {
    const px = step.position?.x ?? 0;
    const py = step.position?.y ?? 0;
    const { w, h } = editorNodeSize(step.step_type);
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (px + w > maxX) maxX = px + w;
    if (py + h > maxY) maxY = py + h;
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
    const totalWidth = group.length * EDITOR_RECT_W + (group.length - 1) * 80;
    const startX = (400 - totalWidth) / 2;
    for (let i = 0; i < group.length; i++) {
      result.push({
        ...group[i],
        position: { x: Math.max(0, startX + i * (EDITOR_RECT_W + 80)), y: layer * 100 },
      });
    }
  }
  return result;
}

// ── Style-specific rendering helpers ──

/** Render an ISA-88 triangle for START (inverted) or END (upright). */
function renderIsa88Triangle(
  step: MasterWorkflowStep,
  pos: { x: number; y: number },
  color: StepColor,
  stroke: string,
  strokeW: number,
  showTooltip: (step: MasterWorkflowStep, e: React.MouseEvent | React.TouchEvent) => void,
  hideTooltip: () => void,
): React.ReactNode {
  const center = stepCenter(pos, step.step_type);
  const r = EDITOR_CIRCLE_SIZE / 2;
  // Triangle inscribed in the 30x30 bounding box
  const isStart = step.step_type === 'START';
  let points: string;
  if (isStart) {
    // Inverted triangle: flat top, point at bottom
    points = `${center.cx - r},${center.cy - r} ${center.cx + r},${center.cy - r} ${center.cx},${center.cy + r}`;
  } else {
    // Upright triangle: point at top, flat bottom
    points = `${center.cx},${center.cy - r} ${center.cx + r},${center.cy + r} ${center.cx - r},${center.cy + r}`;
  }
  return (
    <polygon
      key={step.oid}
      points={points}
      fill={color.fill}
      stroke={stroke}
      strokeWidth={strokeW}
      opacity={color.opacity ?? 1}
      onMouseEnter={(e) => showTooltip(step, e)}
      onMouseLeave={hideTooltip}
      onClick={(e) => showTooltip(step, e)}
      style={{ cursor: 'pointer' }}
    />
  );
}

// ── Editor-faithful waypoint routing ──────────────────────────────────────
//
// The editor (TrajectoryEditor) computes connection paths via the algorithm in
// `src/components/edges/ConditionalEdge.tsx::calculatePathPoints`, documented
// in `TrajectoryEditor/docs/specs/07-connection-waypoint-routing.md`. To render
// pixel-identical paths, the runtime ports that algorithm verbatim.
//
// YES_NO source handles in flowchart: 'yes' at left=40, 'no' at left=80.

const ROUTE_OFFSET = 5;
const ROUTE_TURN = 20;
const ROUTE_NODE_CLEARANCE_V = 30;
const ROUTE_NODE_CLEARANCE_H = 50;

/** Source handle position in editor coordinates. Honors YES_NO yes/no offsets. */
function sourceHandlePos(
  pos: { x: number; y: number },
  stepType: string,
  sourceHandleId: string | undefined,
  displayStyle: DisplayStyle,
): { x: number; y: number } {
  const { w, h } = editorNodeSize(stepType);
  if (displayStyle === 'bpmn') {
    return { x: pos.x + w, y: pos.y + h / 2 };
  }
  if (stepType === 'YES_NO' && sourceHandleId === 'yes') {
    return { x: pos.x + 40, y: pos.y + h };
  }
  if (stepType === 'YES_NO' && sourceHandleId === 'no') {
    return { x: pos.x + 80, y: pos.y + h };
  }
  return { x: pos.x + w / 2, y: pos.y + h };
}

/** Target handle position in editor coordinates. */
function targetHandlePos(
  pos: { x: number; y: number },
  stepType: string,
  displayStyle: DisplayStyle,
): { x: number; y: number } {
  const { w, h } = editorNodeSize(stepType);
  if (displayStyle === 'bpmn') {
    return { x: pos.x, y: pos.y + h / 2 };
  }
  return { x: pos.x + w / 2, y: pos.y };
}

/** Direct port of the editor's calculatePathPoints. waypoints[0] is an offset
 *  from the default midpoint/bypass-lane; only its active component (per the
 *  flow direction × forward/backward matrix in the spec) is applied. */
function calculatePathPoints(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  isVerticalFlow: boolean,
  waypoints: { x: number; y: number }[],
): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [{ x: sourceX, y: sourceY }];
  const wpX = waypoints[0]?.x ?? 0;
  const wpY = waypoints[0]?.y ?? 0;

  if (isVerticalFlow) {
    if (targetY < sourceY) {
      // Backward (loop) — bypass lane to the right of both nodes; wpX shifts it.
      const routeX = Math.max(sourceX, targetX) + ROUTE_NODE_CLEARANCE_H + wpX;
      points.push({ x: sourceX, y: sourceY + ROUTE_TURN });
      points.push({ x: routeX, y: sourceY + ROUTE_TURN });
      points.push({ x: routeX, y: targetY - ROUTE_TURN });
      points.push({ x: targetX, y: targetY - ROUTE_TURN });
    } else {
      const dy = Math.abs(targetY - sourceY);
      const dx = Math.abs(targetX - sourceX);
      if (dy > 5 && dx > 5) {
        const midY = (sourceY + targetY) / 2 + wpY;
        points.push({ x: sourceX, y: midY });
        points.push({ x: targetX, y: midY });
      } else {
        const nearY = sourceY + ROUTE_OFFSET;
        points.push({ x: sourceX, y: nearY });
        points.push({ x: targetX, y: nearY });
      }
    }
  } else {
    if (targetX < sourceX) {
      const routeY = Math.max(sourceY, targetY) + ROUTE_NODE_CLEARANCE_V + wpY;
      points.push({ x: sourceX + ROUTE_TURN, y: sourceY });
      points.push({ x: sourceX + ROUTE_TURN, y: routeY });
      points.push({ x: targetX - ROUTE_TURN, y: routeY });
      points.push({ x: targetX - ROUTE_TURN, y: targetY });
    } else {
      const dx = Math.abs(targetX - sourceX);
      const dy = Math.abs(targetY - sourceY);
      if (dx > 5 && dy > 5) {
        const midX = (sourceX + targetX) / 2 + wpX;
        points.push({ x: midX, y: sourceY });
        points.push({ x: midX, y: targetY });
      } else {
        const nearX = sourceX + ROUTE_OFFSET;
        points.push({ x: nearX, y: sourceY });
        points.push({ x: nearX, y: targetY });
      }
    }
  }

  points.push({ x: targetX, y: targetY });
  return points;
}

function pointsToPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  const parts: string[] = [`M ${points[0].x},${points[0].y}`];
  for (let i = 1; i < points.length; i++) {
    parts.push(`L ${points[i].x},${points[i].y}`);
  }
  return parts.join(' ');
}

interface WorkflowGraphProps {
  spec: MasterWorkflowSpecification;
  snapshot: CoordinatorSnapshot | null;
  isActive: boolean;
  onZoomChange?: (isZoomed: boolean) => void;
  highlightedStepOid?: string | null;
}

export function WorkflowGraph({ spec, snapshot, isActive, onZoomChange, highlightedStepOid }: WorkflowGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const displayStyle: DisplayStyle = spec.display_style || 'flowchart';

  // spec is already the active spec (parent or child) from getActiveSpec()
  const displaySpec = spec;

  // Ensure all steps have positions (memoized to stabilize callback chain)
  const layoutSteps = useMemo(() =>
    displaySpec.steps.every(s => s.position)
      ? displaySpec.steps
      : fallbackLayout(displaySpec.steps, displaySpec.connections),
    [displaySpec]);

  const baseVB = useMemo(() => computeViewBox(layoutSteps), [layoutSteps]);

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
    forceRender(n => n + 1);
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
    if (zoomRef.current <= 1) return;
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

  // Reset zoom/pan when slide becomes active (use inline logic to avoid resetZoom dep loop)
  useEffect(() => {
    if (isActive) {
      zoomRef.current = 1;
      panRef.current = { x: 0, y: 0 };
      if (svgRef.current) {
        const z = zoomRef.current;
        const w = baseVB.w / z;
        const h = baseVB.h / z;
        const cx = baseVB.x + baseVB.w / 2;
        const cy = baseVB.y + baseVB.h / 2;
        svgRef.current.setAttribute('viewBox', `${cx - w / 2} ${cy - h / 2} ${w} ${h}`);
      }
      onZoomChange?.(false);
    }
  }, [isActive, baseVB, onZoomChange]);

  // Resolve step states for coloring (use displaySpec which may be child)
  const stateMap = resolveStepStates(displaySpec, snapshot);

  // Build step position and type lookups for edge rendering
  const stepPos = new Map<string, { x: number; y: number }>();
  const stepTypeMap = new Map<string, string>();
  for (const step of layoutSteps) {
    stepPos.set(step.oid, step.position ?? { x: 0, y: 0 });
    stepTypeMap.set(step.oid, step.step_type);
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
        {/* Edges — port of the editor's calculatePathPoints algorithm so the
            runtime renders pixel-identical paths. Source/target handles are
            computed in editor coordinates (120×50 rect, 60×60 gateway,
            30×30 circle); YES_NO source uses left=40 for 'yes', left=80 for
            'no'. waypoints[0] is an offset from the default midpoint. */}
        {displaySpec.connections.map((conn, i) => {
          const fromPos = stepPos.get(conn.from_step_id);
          const toPos = stepPos.get(conn.to_step_id);
          if (!fromPos || !toPos) return null;
          const fromType = stepTypeMap.get(conn.from_step_id) ?? '';
          const toType = stepTypeMap.get(conn.to_step_id) ?? '';
          const src = sourceHandlePos(fromPos, fromType, conn.source_handle_id, displayStyle);
          const tgt = targetHandlePos(toPos, toType, displayStyle);
          const isVerticalFlow = displayStyle !== 'bpmn';
          const points = calculatePathPoints(
            src.x, src.y, tgt.x, tgt.y, isVerticalFlow, conn.waypoints ?? [],
          );
          return (
            <path
              key={`edge-${i}`}
              d={pointsToPath(points)}
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
          const isCircle = CIRCLE_STEP_TYPES.has(step.step_type);
          const isHighlighted = step.oid === highlightedStepOid;
          const stroke = isHighlighted ? '#000000' : (color.stroke ?? 'none');
          const strokeW = isHighlighted ? 4 : (color.strokeWidth ?? 0);

          // ISA-88: START and END are triangles instead of circles
          if (isCircle && displayStyle === 'isa88') {
            return renderIsa88Triangle(step, pos, color, stroke, strokeW, showTooltip, hideTooltip);
          }

          if (isCircle) {
            const center = stepCenter(pos, step.step_type);
            return (
              <circle
                key={step.oid}
                cx={center.cx}
                cy={center.cy}
                r={EDITOR_CIRCLE_R}
                fill={color.fill}
                stroke={stroke}
                strokeWidth={strokeW}
                opacity={color.opacity ?? 1}
                onMouseEnter={(e) => showTooltip(step, e)}
                onMouseLeave={hideTooltip}
                onClick={(e) => showTooltip(step, e)}
                style={{ cursor: 'pointer' }}
              />
            );
          }

          if (isDiamond) {
            const center = stepCenter(pos, step.step_type);
            const { w, h } = editorNodeSize(step.step_type);
            const hw = w / 2;
            const hh = h / 2;
            const points = `${center.cx},${center.cy - hh} ${center.cx + hw},${center.cy} ${center.cx},${center.cy + hh} ${center.cx - hw},${center.cy}`;
            return (
              <polygon
                key={step.oid}
                points={points}
                fill={color.fill}
                stroke={stroke}
                strokeWidth={strokeW}
                opacity={color.opacity ?? 1}
                onMouseEnter={(e) => showTooltip(step, e)}
                onMouseLeave={hideTooltip}
                onClick={(e) => showTooltip(step, e)}
                style={{ cursor: 'pointer' }}
              />
            );
          }

          // Rect — sized to match the editor (120×50, rx=4) so connection
          // endpoints land on the rendered shape edges.
          const center = stepCenter(pos, step.step_type);
          const { w, h } = editorNodeSize(step.step_type);
          return (
            <rect
              key={step.oid}
              x={center.cx - w / 2}
              y={center.cy - h / 2}
              width={w}
              height={h}
              rx={EDITOR_RECT_RX}
              fill={color.fill}
              stroke={stroke}
              strokeWidth={strokeW}
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
