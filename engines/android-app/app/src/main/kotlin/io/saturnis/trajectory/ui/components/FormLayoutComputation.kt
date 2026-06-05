// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
package io.saturnis.trajectory.ui.components

import kotlinx.serialization.json.*

/**
 * Runtime viewport class — drives editor-layout selection.
 *
 * PORTRAIT: phone (any orientation, since phones are locked to portrait at
 * runtime) or tablet held vertically. Picks the editor PHONE layout.
 *
 * TABLET_LANDSCAPE: tablet hardware in landscape orientation. Picks the
 * editor TABLET layout.
 */
enum class ViewportClass { PORTRAIT, TABLET_LANDSCAPE }

/**
 * Layout selection for form rendering. Positioning and sizing come straight
 * from the editor's recommended layout; the renderer applies a uniform
 * scale-to-fit-width on top.
 */
object FormLayoutComputation {

    /**
     * Select the editor layout that matches the viewport class.
     *
     * Fallback chain (always): targetType → "tablet" → "desktop" → first available.
     *   - PORTRAIT targets "phone"
     *   - TABLET_LANDSCAPE targets "tablet"
     *
     * Returns null only when [layouts] is empty.
     */
    fun pickLayout(layouts: JsonArray, viewport: ViewportClass): JsonObject? {
        val targetType = when (viewport) {
            ViewportClass.PORTRAIT -> "phone"
            ViewportClass.TABLET_LANDSCAPE -> "tablet"
        }
        return findByDeviceType(layouts, targetType)
            ?: findByDeviceType(layouts, "tablet")
            ?: findByDeviceType(layouts, "desktop")
            ?: layouts.firstOrNull()?.jsonObject
    }

    private fun findByDeviceType(layouts: JsonArray, deviceType: String): JsonObject? =
        layouts.firstOrNull {
            it.jsonObject["deviceType"]?.jsonPrimitive?.contentOrNull == deviceType
        }?.jsonObject
}
