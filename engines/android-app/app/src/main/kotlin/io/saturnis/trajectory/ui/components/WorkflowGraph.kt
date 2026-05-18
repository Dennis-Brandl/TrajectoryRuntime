// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
package io.saturnis.trajectory.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.rememberTransformableState
import androidx.compose.foundation.gestures.transformable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.trajectoryruntime.engine.MasterWorkflowSpecification
import com.trajectoryruntime.engine.Position
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

// Node colors by step state
private val colorCompleted = Color(0xFF4ADE80)
private val colorExecuting = Color(0xFF3B82F6)
private val colorExecutingStroke = Color(0xFF93C5FD)
private val colorWaiting = Color(0xFF93C5FD)
private val colorPaused = Color(0xFFEAB308)
private val colorErrored = Color(0xFFEF4444)
private val colorIdle = Color(0xFF6B7280).copy(alpha = 0.7f)

private val edgeColor = Color(0xFF475569)

private val circleTypes = setOf("START", "END")

private val diamondTypes = setOf(
    "PARALLEL", "WAIT ALL", "WAIT ANY", "SELECT 1",
    "WAIT_ALL", "WAIT_ANY", "SELECT_1",
)

// Editor node dimensions (flowchart) — runtime renders at the same scale so
// connections meet the symbols. Matches TrajectoryEditor `notation-config.ts` and
// the web-ui's WorkflowGraph.tsx.
private const val EDITOR_RECT_W = 120f
private const val EDITOR_RECT_H = 50f
private const val EDITOR_GATEWAY_W = 60f
private const val EDITOR_GATEWAY_H = 60f
private const val EDITOR_CIRCLE_SIZE = 30f
private const val EDITOR_RECT_RX = 4f
private const val EDITOR_CIRCLE_R = 13f

// Routing constants — must match TrajectoryEditor ConditionalEdge.tsx exactly.
private const val ROUTE_OFFSET = 5f
private const val ROUTE_TURN = 20f
private const val ROUTE_NODE_CLEARANCE_V = 30f
private const val ROUTE_NODE_CLEARANCE_H = 50f

private fun editorNodeSize(stepType: String): Pair<Float, Float> = when {
    stepType in circleTypes -> Pair(EDITOR_CIRCLE_SIZE, EDITOR_CIRCLE_SIZE)
    stepType in diamondTypes -> Pair(EDITOR_GATEWAY_W, EDITOR_GATEWAY_H)
    else -> Pair(EDITOR_RECT_W, EDITOR_RECT_H)
}

private data class TooltipInfo(
    val localId: String,
    val stepType: String,
    val position: Offset,
)

@Composable
fun WorkflowGraph(
    spec: MasterWorkflowSpecification,
    stateMap: Map<String, String>,
    modifier: Modifier = Modifier,
) {
    val padding = 40f

    // Compute positions from spec or fallback layout (editor coords + padding).
    val positions: Map<String, Offset> = remember(spec) {
        computePositions(spec, padding)
    }

    val stepTypeMap: Map<String, String> = remember(spec) {
        spec.steps.associate { it.oid to it.step_type }
    }

    // Compute graph bounding box for auto-fit using per-step editor sizes.
    val graphBounds = remember(positions, stepTypeMap) {
        if (positions.isEmpty()) null
        else {
            var minX = Float.MAX_VALUE; var minY = Float.MAX_VALUE
            var maxX = Float.MIN_VALUE; var maxY = Float.MIN_VALUE
            for ((oid, pos) in positions) {
                val (w, h) = editorNodeSize(stepTypeMap[oid] ?: "")
                if (pos.x < minX) minX = pos.x
                if (pos.y < minY) minY = pos.y
                if (pos.x + w > maxX) maxX = pos.x + w
                if (pos.y + h > maxY) maxY = pos.y + h
            }
            floatArrayOf(minX - padding, minY - padding, maxX + padding, maxY + padding)
        }
    }

    // Zoom/pan state (user gesture on top of auto-fit)
    var userScale by remember { mutableFloatStateOf(1f) }
    var userOffset by remember { mutableStateOf(Offset.Zero) }

    // Tooltip state
    var tooltip by remember { mutableStateOf<TooltipInfo?>(null) }

    val transformableState = rememberTransformableState { zoomChange, panChange, _ ->
        userScale = (userScale * zoomChange).coerceIn(0.5f, 3f)
        userOffset += panChange
    }

    Box(modifier = modifier.fillMaxSize()) {
        Canvas(
            modifier = Modifier
                .fillMaxSize()
                .transformable(transformableState)
                .pointerInput(spec, positions, userScale, userOffset, graphBounds) {
                    detectTapGestures(
                        onDoubleTap = {
                            userScale = 1f
                            userOffset = Offset.Zero
                            tooltip = null
                        },
                        onTap = { tapOffset ->
                            // Compute auto-fit transform for hit-testing
                            val bounds = graphBounds ?: return@detectTapGestures
                            val graphW = bounds[2] - bounds[0]
                            val graphH = bounds[3] - bounds[1]
                            val canvasW = size.width.toFloat()
                            val canvasH = size.height.toFloat()
                            val fitScale = if (graphW > 0 && graphH > 0)
                                minOf(canvasW / graphW, canvasH / graphH) else 1f
                            val totalScale = fitScale * userScale
                            val fitOffX = (canvasW - graphW * fitScale) / 2f - bounds[0] * fitScale
                            val fitOffY = (canvasH - graphH * fitScale) / 2f - bounds[1] * fitScale

                            // Convert tap to graph coordinates
                            val graphX = (tapOffset.x - userOffset.x - fitOffX) / totalScale
                            val graphY = (tapOffset.y - userOffset.y - fitOffY) / totalScale

                            // Hit-test against nodes using per-step sizes
                            var hit: TooltipInfo? = null
                            for (step in spec.steps) {
                                val pos = positions[step.oid] ?: continue
                                val (w, h) = editorNodeSize(step.step_type)
                                if (graphX >= pos.x && graphX <= pos.x + w &&
                                    graphY >= pos.y && graphY <= pos.y + h
                                ) {
                                    hit = TooltipInfo(
                                        localId = step.local_id,
                                        stepType = step.step_type,
                                        position = Offset(tapOffset.x, tapOffset.y),
                                    )
                                    break
                                }
                            }
                            tooltip = if (hit != null && tooltip?.localId == hit.localId) null else hit
                        },
                    )
                },
        ) {
            // Compute auto-fit: scale graph to fill canvas, centered
            val bounds = graphBounds
            val fitScale: Float
            val fitOffX: Float
            val fitOffY: Float
            if (bounds != null) {
                val graphW = bounds[2] - bounds[0]
                val graphH = bounds[3] - bounds[1]
                fitScale = if (graphW > 0 && graphH > 0)
                    minOf(size.width / graphW, size.height / graphH) else 1f
                fitOffX = (size.width - graphW * fitScale) / 2f - bounds[0] * fitScale
                fitOffY = (size.height - graphH * fitScale) / 2f - bounds[1] * fitScale
            } else {
                fitScale = 1f; fitOffX = 0f; fitOffY = 0f
            }

            withTransform({
                // User pan/zoom on top of auto-fit
                translate(left = userOffset.x, top = userOffset.y)
                scale(userScale, userScale, pivot = Offset(size.width / 2, size.height / 2))
                // Auto-fit: scale and center
                translate(left = fitOffX, top = fitOffY)
                scale(fitScale, fitScale, pivot = Offset.Zero)
            }) {
                // Draw edges first (behind nodes) — port of editor's calculatePathPoints
                val displayStyle = spec.display_style ?: "flowchart"
                val isVerticalFlow = displayStyle != "bpmn"
                spec.connections.forEach { conn ->
                    val fromPos = positions[conn.from_step_id] ?: return@forEach
                    val toPos = positions[conn.to_step_id] ?: return@forEach
                    val fromType = stepTypeMap[conn.from_step_id] ?: ""
                    val toType = stepTypeMap[conn.to_step_id] ?: ""
                    val src = sourceHandlePos(fromPos, fromType, conn.source_handle_id, displayStyle)
                    val tgt = targetHandlePos(toPos, toType, displayStyle)
                    val points = calculatePathPoints(
                        src.x, src.y, tgt.x, tgt.y, isVerticalFlow, conn.waypoints,
                    )
                    drawConnection(points)
                }

                // Draw nodes at editor sizes
                spec.steps.forEach { step ->
                    val pos = positions[step.oid] ?: return@forEach
                    val state = stateMap[step.oid] ?: "IDLE"
                    val shapeType = when {
                        step.step_type in circleTypes && displayStyle == "isa88" ->
                            if (step.step_type == "START") ShapeType.TRIANGLE_UP else ShapeType.TRIANGLE_DOWN
                        step.step_type in circleTypes -> ShapeType.CIRCLE
                        step.step_type in diamondTypes -> ShapeType.DIAMOND
                        else -> ShapeType.ROUNDED_RECT
                    }
                    val (w, h) = editorNodeSize(step.step_type)
                    drawNode(pos, w, h, state, shapeType)
                }
            }
        }

        // Tooltip overlay
        tooltip?.let { tip ->
            Box(
                modifier = Modifier
                    .offset(
                        x = with(androidx.compose.ui.platform.LocalDensity.current) { tip.position.x.toDp() - 60.dp },
                        y = with(androidx.compose.ui.platform.LocalDensity.current) { tip.position.y.toDp() - 56.dp },
                    )
                    .background(
                        color = Color(0xFF1E293B),
                        shape = RoundedCornerShape(6.dp),
                    )
                    .padding(horizontal = 10.dp, vertical = 6.dp),
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        text = tip.localId,
                        color = Color(0xFFE2E8F0),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        textAlign = TextAlign.Center,
                    )
                    Text(
                        text = tip.stepType,
                        color = Color(0xFF94A3B8),
                        fontSize = 11.sp,
                        textAlign = TextAlign.Center,
                    )
                }
            }
        }
    }
}

private enum class ShapeType { CIRCLE, DIAMOND, ROUNDED_RECT, TRIANGLE_DOWN, TRIANGLE_UP }

/** Source handle position in editor coordinates. Honors YES_NO yes/no offsets. */
private fun sourceHandlePos(
    pos: Offset,
    stepType: String,
    sourceHandleId: String?,
    displayStyle: String,
): Offset {
    val (w, h) = editorNodeSize(stepType)
    if (displayStyle == "bpmn") {
        return Offset(pos.x + w, pos.y + h / 2f)
    }
    if (stepType == "YES_NO" && sourceHandleId == "yes") {
        return Offset(pos.x + 40f, pos.y + h)
    }
    if (stepType == "YES_NO" && sourceHandleId == "no") {
        return Offset(pos.x + 80f, pos.y + h)
    }
    return Offset(pos.x + w / 2f, pos.y + h)
}

/** Target handle position in editor coordinates. */
private fun targetHandlePos(
    pos: Offset,
    stepType: String,
    displayStyle: String,
): Offset {
    val (w, h) = editorNodeSize(stepType)
    if (displayStyle == "bpmn") {
        return Offset(pos.x, pos.y + h / 2f)
    }
    return Offset(pos.x + w / 2f, pos.y)
}

/** Direct port of TrajectoryEditor's calculatePathPoints. waypoints[0] is an offset
 *  from the default midpoint/bypass-lane; only its active component (per the
 *  flow-direction × forward/backward matrix) is applied. */
private fun calculatePathPoints(
    sourceX: Float,
    sourceY: Float,
    targetX: Float,
    targetY: Float,
    isVerticalFlow: Boolean,
    waypoints: List<Position>?,
): List<Offset> {
    val points = mutableListOf<Offset>()
    val wpX = waypoints?.firstOrNull()?.x?.toFloat() ?: 0f
    val wpY = waypoints?.firstOrNull()?.y?.toFloat() ?: 0f

    points.add(Offset(sourceX, sourceY))

    if (isVerticalFlow) {
        if (targetY < sourceY) {
            // Backward (loop) — bypass lane to the right of both nodes; wpX shifts it
            val routeX = max(sourceX, targetX) + ROUTE_NODE_CLEARANCE_H + wpX
            points.add(Offset(sourceX, sourceY + ROUTE_TURN))
            points.add(Offset(routeX, sourceY + ROUTE_TURN))
            points.add(Offset(routeX, targetY - ROUTE_TURN))
            points.add(Offset(targetX, targetY - ROUTE_TURN))
        } else {
            val dy = abs(targetY - sourceY)
            val dx = abs(targetX - sourceX)
            if (dy > 5f && dx > 5f) {
                val midY = (sourceY + targetY) / 2f + wpY
                points.add(Offset(sourceX, midY))
                points.add(Offset(targetX, midY))
            } else {
                val nearY = sourceY + ROUTE_OFFSET
                points.add(Offset(sourceX, nearY))
                points.add(Offset(targetX, nearY))
            }
        }
    } else {
        if (targetX < sourceX) {
            val routeY = max(sourceY, targetY) + ROUTE_NODE_CLEARANCE_V + wpY
            points.add(Offset(sourceX + ROUTE_TURN, sourceY))
            points.add(Offset(sourceX + ROUTE_TURN, routeY))
            points.add(Offset(targetX - ROUTE_TURN, routeY))
            points.add(Offset(targetX - ROUTE_TURN, targetY))
        } else {
            val dx = abs(targetX - sourceX)
            val dy = abs(targetY - sourceY)
            if (dx > 5f && dy > 5f) {
                val midX = (sourceX + targetX) / 2f + wpX
                points.add(Offset(midX, sourceY))
                points.add(Offset(midX, targetY))
            } else {
                val nearX = sourceX + ROUTE_OFFSET
                points.add(Offset(nearX, sourceY))
                points.add(Offset(nearX, targetY))
            }
        }
    }

    points.add(Offset(targetX, targetY))
    return points
}

private fun computePositions(
    spec: MasterWorkflowSpecification,
    padding: Float,
): Map<String, Offset> {
    val hasPositions = spec.steps.any { it.position != null }
    if (hasPositions) {
        val posMap = mutableMapOf<String, Offset>()
        for (step in spec.steps) {
            val p = step.position
            posMap[step.oid] = if (p != null) {
                Offset(p.x.toFloat() + padding, p.y.toFloat() + padding)
            } else {
                Offset(padding, padding)
            }
        }
        // Stagger any steps missing positions so they don't all collide
        var fallbackY = padding
        for (step in spec.steps) {
            if (step.position == null) {
                posMap[step.oid] = Offset(padding, fallbackY)
                fallbackY += EDITOR_RECT_H + 20f
            }
        }
        return posMap
    }

    // Fallback: layer-based layout via BFS from START node
    val adjacency = mutableMapOf<String, MutableList<String>>()
    for (conn in spec.connections) {
        adjacency.getOrPut(conn.from_step_id) { mutableListOf() }.add(conn.to_step_id)
    }

    val incomingCount = mutableMapOf<String, Int>()
    for (step in spec.steps) {
        incomingCount[step.oid] = 0
    }
    for (conn in spec.connections) {
        incomingCount[conn.to_step_id] = (incomingCount[conn.to_step_id] ?: 0) + 1
    }

    val startOid = spec.steps.find { it.step_type == "START" }?.oid
        ?: spec.steps.find { (incomingCount[it.oid] ?: 0) == 0 }?.oid
        ?: spec.steps.firstOrNull()?.oid
        ?: return emptyMap()

    val layerMap = mutableMapOf<String, Int>()
    val queue = ArrayDeque<String>()
    queue.add(startOid)
    layerMap[startOid] = 0

    while (queue.isNotEmpty()) {
        val current = queue.removeFirst()
        val currentLayer = layerMap[current] ?: 0
        for (next in adjacency[current].orEmpty()) {
            val existingLayer = layerMap[next]
            if (existingLayer == null || existingLayer < currentLayer + 1) {
                layerMap[next] = currentLayer + 1
                queue.add(next)
            }
        }
    }

    for (step in spec.steps) {
        if (step.oid !in layerMap) {
            layerMap[step.oid] = 0
        }
    }

    val layers = mutableMapOf<Int, MutableList<String>>()
    for ((oid, layer) in layerMap) {
        layers.getOrPut(layer) { mutableListOf() }.add(oid)
    }

    val horizontalSpacing = EDITOR_RECT_W + 80f
    val verticalSpacing = EDITOR_RECT_H + 64f

    val positions = mutableMapOf<String, Offset>()
    for ((layer, oids) in layers) {
        val totalWidth = oids.size * horizontalSpacing
        val startX = padding + (totalWidth / 2f) - (horizontalSpacing / 2f)
        oids.forEachIndexed { index, oid ->
            val x = padding + index * horizontalSpacing - totalWidth / 2f + startX
            val y = padding + layer * verticalSpacing
            positions[oid] = Offset(x, y)
        }
    }

    return positions
}

private fun stateColor(state: String): Color = when (state) {
    "COMPLETED", "COMPLETING" -> colorCompleted
    "EXECUTING", "STARTING" -> colorExecuting
    "WAITING" -> colorWaiting
    "PAUSED" -> colorPaused
    "ERRORED" -> colorErrored
    else -> colorIdle
}

private fun DrawScope.drawConnection(points: List<Offset>) {
    if (points.size < 2) return
    val path = Path().apply {
        moveTo(points[0].x, points[0].y)
        for (i in 1 until points.size) {
            lineTo(points[i].x, points[i].y)
        }
    }
    drawPath(path = path, color = edgeColor, style = Stroke(width = 2f))
}

private fun DrawScope.drawNode(
    pos: Offset,
    nodeWidth: Float,
    nodeHeight: Float,
    state: String,
    shapeType: ShapeType,
) {
    val fillColor = stateColor(state)
    val isActive = state == "EXECUTING" || state == "STARTING"

    when (shapeType) {
        ShapeType.CIRCLE -> {
            val cx = pos.x + nodeWidth / 2
            val cy = pos.y + nodeHeight / 2
            drawCircle(color = fillColor, radius = EDITOR_CIRCLE_R, center = Offset(cx, cy))
            if (isActive) {
                drawCircle(
                    color = colorExecutingStroke,
                    radius = EDITOR_CIRCLE_R,
                    center = Offset(cx, cy),
                    style = Stroke(width = 3f),
                )
            }
        }

        ShapeType.DIAMOND -> {
            val cx = pos.x + nodeWidth / 2
            val cy = pos.y + nodeHeight / 2
            val halfW = nodeWidth / 2
            val halfH = nodeHeight / 2

            val path = Path().apply {
                moveTo(cx, cy - halfH)
                lineTo(cx + halfW, cy)
                lineTo(cx, cy + halfH)
                lineTo(cx - halfW, cy)
                close()
            }

            drawPath(path = path, color = fillColor)
            if (isActive) {
                drawPath(path = path, color = colorExecutingStroke, style = Stroke(width = 3f))
            }
        }

        ShapeType.ROUNDED_RECT -> {
            drawRoundRect(
                color = fillColor,
                topLeft = pos,
                size = Size(nodeWidth, nodeHeight),
                cornerRadius = androidx.compose.ui.geometry.CornerRadius(EDITOR_RECT_RX, EDITOR_RECT_RX),
            )
            if (isActive) {
                drawRoundRect(
                    color = colorExecutingStroke,
                    topLeft = pos,
                    size = Size(nodeWidth, nodeHeight),
                    cornerRadius = androidx.compose.ui.geometry.CornerRadius(EDITOR_RECT_RX, EDITOR_RECT_RX),
                    style = Stroke(width = 3f),
                )
            }
        }

        ShapeType.TRIANGLE_DOWN -> {
            // ISA-88 START: inverted triangle (flat top, point at bottom)
            val cx = pos.x + nodeWidth / 2
            val cy = pos.y + nodeHeight / 2
            val r = min(nodeWidth, nodeHeight) / 2
            val path = Path().apply {
                moveTo(cx - r, cy - r)
                lineTo(cx + r, cy - r)
                lineTo(cx, cy + r)
                close()
            }
            drawPath(path = path, color = fillColor)
            if (isActive) {
                drawPath(path = path, color = colorExecutingStroke, style = Stroke(width = 3f))
            }
        }

        ShapeType.TRIANGLE_UP -> {
            // ISA-88 END: upright triangle (point at top, flat bottom)
            val cx = pos.x + nodeWidth / 2
            val cy = pos.y + nodeHeight / 2
            val r = min(nodeWidth, nodeHeight) / 2
            val path = Path().apply {
                moveTo(cx, cy - r)
                lineTo(cx + r, cy + r)
                lineTo(cx - r, cy + r)
                close()
            }
            drawPath(path = path, color = fillColor)
            if (isActive) {
                drawPath(path = path, color = colorExecutingStroke, style = Stroke(width = 3f))
            }
        }
    }
}
