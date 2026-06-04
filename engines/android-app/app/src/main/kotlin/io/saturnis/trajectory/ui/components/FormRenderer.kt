// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
package io.saturnis.trajectory.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.runtime.Composable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import io.saturnis.trajectory.ui.elements.*
import kotlinx.serialization.json.*

/**
 * Available height the form may use. Provided by ActiveScreen so FormRenderer
 * can size itself to the visible viewport when content doesn't fill it (used
 * for the "anchor trailing buttons to bottom" pattern).
 */
val LocalAvailableFormHeight = compositionLocalOf<Dp> { Dp.Unspecified }

private data class FormRow(val elements: List<JsonObject>)

/**
 * Group elements into rows by transitive y-band overlap. Two elements share a
 * row when their y-ranges overlap by at least `threshold` of the shorter
 * element's height. Within each row, elements are sorted by x to determine
 * column order.
 *
 * Only used on tablet-horizontal — on phone and tablet-portrait every row has
 * one element (single-column flow).
 */
private fun clusterRows(
    sorted: List<JsonObject>,
    threshold: Float = 0.3f,
): List<FormRow> {
    if (sorted.isEmpty()) return emptyList()
    val groups = mutableListOf<MutableList<JsonObject>>()

    fun overlapsRow(el: JsonObject, row: List<JsonObject>): Boolean {
        val y = el["y"]?.jsonPrimitive?.floatOrNull ?: 0f
        val h = (el["height"]?.jsonPrimitive?.floatOrNull ?: 0f).coerceAtLeast(1f)
        val bot = y + h
        return row.any { other ->
            val oy = other["y"]?.jsonPrimitive?.floatOrNull ?: 0f
            val oh = (other["height"]?.jsonPrimitive?.floatOrNull ?: 0f).coerceAtLeast(1f)
            val obot = oy + oh
            val overlap = (minOf(bot, obot) - maxOf(y, oy)).coerceAtLeast(0f)
            overlap / minOf(h, oh) >= threshold
        }
    }

    for (el in sorted) {
        val match = groups.firstOrNull { overlapsRow(el, it) }
        if (match != null) match.add(el) else groups.add(mutableListOf(el))
    }

    return groups.map { g ->
        FormRow(g.sortedBy { it["x"]?.jsonPrimitive?.floatOrNull ?: 0f })
    }
}

private fun isButtonRow(row: FormRow): Boolean =
    row.elements.all { it["type"]?.jsonPrimitive?.contentOrNull == "button" }

/**
 * Renders the chosen device-specific form layout as a vertical flow with
 * optional column clustering on tablet-horizontal.
 *
 * The editor's per-device layout still picks a layout (phone / tablet /
 * desktop) via [FormLayoutComputation.pickLayout]. Within that layout, on
 * phone and tablet-portrait the elements are rendered single-column; on
 * tablet-horizontal they are clustered into rows by y-band overlap (Y-band
 * clustering — see [clusterRows]) and rendered with proportional column
 * widths derived from the editor's per-element `width`.
 *
 * Editor `height` becomes a min-height; `image` and `video` preserve the
 * editor's declared aspect ratio.
 *
 * Trailing rows that consist entirely of `button` elements anchor to the
 * bottom of the available form area when non-button content doesn't fill
 * it. When content overflows, layout falls back to top-aligned flow and
 * the parent's verticalScroll handles overflow.
 */
@Composable
fun FormRenderer(
    layouts: JsonElement?,
    formValues: Map<String, Any?>,
    onFormChange: (String, Any?) -> Unit,
    onButtonPress: (String) -> Unit,
    properties: Map<String, String>,
    inputParameters: Map<String, String>,
    mediaMap: Map<String, String>,
    viewport: ViewportClass,
    buttonsEnabled: Boolean = true,
    stepOid: String = "",
) {
    if (layouts == null) return

    val layoutArray = when (layouts) {
        is JsonArray -> layouts
        is JsonObject -> JsonArray(listOf(layouts))
        else -> return
    }

    val layout = FormLayoutComputation.pickLayout(layoutArray, viewport) ?: return
    val elements = layout["elements"]?.jsonArray ?: return

    val sortedObjects = elements.map { it.jsonObject }.sortedWith(
        compareBy(
            { it["y"]?.jsonPrimitive?.floatOrNull ?: 0f },
            { it["x"]?.jsonPrimitive?.floatOrNull ?: 0f },
        ),
    )

    val useColumns = viewport == ViewportClass.TABLET_LANDSCAPE
    val rows: List<FormRow> = if (useColumns) {
        clusterRows(sortedObjects)
    } else {
        sortedObjects.map { FormRow(listOf(it)) }
    }

    val trailingButtonRows = rows.takeLastWhile(::isButtonRow)
    val nonButtonRows = if (trailingButtonRows.isEmpty()) rows
    else rows.dropLast(trailingButtonRows.size)

    val available = LocalAvailableFormHeight.current
    val anchorButtons = trailingButtonRows.isNotEmpty() && available != Dp.Unspecified

    if (anchorButtons) {
        Column(
            modifier = Modifier.fillMaxWidth().heightIn(min = available),
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                nonButtonRows.forEach {
                    FormRowRenderer(
                        it, formValues, onFormChange, onButtonPress,
                        properties, inputParameters, mediaMap, buttonsEnabled, stepOid,
                    )
                }
            }
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                trailingButtonRows.forEach {
                    FormRowRenderer(
                        it, formValues, onFormChange, onButtonPress,
                        properties, inputParameters, mediaMap, buttonsEnabled, stepOid,
                    )
                }
            }
        }
    } else {
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            rows.forEach {
                FormRowRenderer(
                    it, formValues, onFormChange, onButtonPress,
                    properties, inputParameters, mediaMap, buttonsEnabled, stepOid,
                )
            }
        }
    }
}

@Composable
private fun FormRowRenderer(
    row: FormRow,
    formValues: Map<String, Any?>,
    onFormChange: (String, Any?) -> Unit,
    onButtonPress: (String) -> Unit,
    properties: Map<String, String>,
    inputParameters: Map<String, String>,
    mediaMap: Map<String, String>,
    buttonsEnabled: Boolean,
    stepOid: String,
) {
    if (row.elements.size == 1) {
        ElementSlot(
            row.elements[0], formValues, onFormChange, onButtonPress,
            properties, inputParameters, mediaMap, buttonsEnabled, stepOid,
        )
        return
    }
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.Top,
    ) {
        row.elements.forEach { el ->
            val w = (el["width"]?.jsonPrimitive?.floatOrNull ?: 1f).coerceAtLeast(1f)
            Box(modifier = Modifier.weight(w)) {
                ElementSlot(
                    el, formValues, onFormChange, onButtonPress,
                    properties, inputParameters, mediaMap, buttonsEnabled, stepOid,
                )
            }
        }
    }
}

@Composable
private fun ElementSlot(
    el: JsonObject,
    formValues: Map<String, Any?>,
    onFormChange: (String, Any?) -> Unit,
    onButtonPress: (String) -> Unit,
    properties: Map<String, String>,
    inputParameters: Map<String, String>,
    mediaMap: Map<String, String>,
    buttonsEnabled: Boolean,
    stepOid: String,
) {
    val type = el["type"]?.jsonPrimitive?.contentOrNull ?: return
    val composable = ElementRegistry.get(type) ?: return

    val declaredW = el["width"]?.jsonPrimitive?.floatOrNull ?: 0f
    val declaredH = el["height"]?.jsonPrimitive?.floatOrNull ?: 0f

    val slotModifier = when {
        (type == "image" || type == "video") && declaredW > 0f && declaredH > 0f ->
            Modifier.fillMaxWidth().aspectRatio(declaredW / declaredH)
        declaredH > 0f ->
            Modifier.fillMaxWidth().heightIn(min = declaredH.dp)
        else ->
            Modifier.fillMaxWidth()
    }

    Box(modifier = slotModifier) {
        composable(
            ElementProps(
                element = el,
                formValues = formValues,
                onFormChange = onFormChange,
                onButtonPress = onButtonPress,
                properties = properties,
                inputParameters = inputParameters,
                mediaMap = mediaMap,
                buttonsEnabled = buttonsEnabled,
                stepOid = stepOid,
            ),
        )
    }
}
