// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
package io.saturnis.trajectory.ui

import io.saturnis.trajectory.ui.components.FormLayoutComputation
import io.saturnis.trajectory.ui.components.ViewportClass
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test

/**
 * Tests for FormLayoutComputation.pickLayout. Picks the editor layout matching
 * the runtime viewport class: PORTRAIT → "phone", TABLET_LANDSCAPE → "tablet".
 */
class FormLayoutComputationTest {

    private val json = Json { ignoreUnknownKeys = true }

    private val tabletLayout = json.parseToJsonElement("""
    { "deviceType": "tablet", "canvasWidth": 1340, "canvasHeight": 800, "elements": [] }
    """.trimIndent()).jsonObject

    private val phoneLayout = json.parseToJsonElement("""
    { "deviceType": "phone", "canvasWidth": 360, "canvasHeight": 800, "elements": [] }
    """.trimIndent()).jsonObject

    private val desktopLayout = json.parseToJsonElement("""
    { "deviceType": "desktop", "canvasWidth": 1200, "canvasHeight": 1024, "elements": [] }
    """.trimIndent()).jsonObject

    @Test
    fun `pickLayout selects tablet layout for TABLET_LANDSCAPE`() {
        val layouts = JsonArray(listOf(phoneLayout, tabletLayout))
        val picked = FormLayoutComputation.pickLayout(layouts, ViewportClass.TABLET_LANDSCAPE)
        assertNotNull(picked)
        assertEquals("tablet", picked!!["deviceType"]?.jsonPrimitive?.content)
    }

    @Test
    fun `pickLayout selects phone layout for PORTRAIT`() {
        val layouts = JsonArray(listOf(phoneLayout, tabletLayout))
        val picked = FormLayoutComputation.pickLayout(layouts, ViewportClass.PORTRAIT)
        assertNotNull(picked)
        assertEquals("phone", picked!!["deviceType"]?.jsonPrimitive?.content)
    }

    @Test
    fun `pickLayout falls back to desktop for TABLET_LANDSCAPE when tablet missing`() {
        val layouts = JsonArray(listOf(phoneLayout, desktopLayout))
        val picked = FormLayoutComputation.pickLayout(layouts, ViewportClass.TABLET_LANDSCAPE)
        assertNotNull(picked)
        assertEquals("desktop", picked!!["deviceType"]?.jsonPrimitive?.content)
    }

    @Test
    fun `pickLayout falls back to first available when nothing matches`() {
        val layouts = JsonArray(listOf(desktopLayout))
        val picked = FormLayoutComputation.pickLayout(layouts, ViewportClass.PORTRAIT)
        assertNotNull(picked)
        assertEquals("desktop", picked!!["deviceType"]?.jsonPrimitive?.content)
    }

    @Test
    fun `pickLayout PORTRAIT prefers tablet over desktop when phone missing`() {
        // Spec rule: target → "tablet" → "desktop" → first.
        // With [desktop, tablet] order and PORTRAIT, the chain must prefer the
        // tablet entry over both the desktop entry and the leading-array entry.
        val layouts = JsonArray(listOf(desktopLayout, tabletLayout))
        val picked = FormLayoutComputation.pickLayout(layouts, ViewportClass.PORTRAIT)
        assertNotNull(picked)
        assertEquals("tablet", picked!!["deviceType"]?.jsonPrimitive?.content)
    }

    @Test
    fun `pickLayout returns null for empty array`() {
        val picked = FormLayoutComputation.pickLayout(JsonArray(emptyList()), ViewportClass.PORTRAIT)
        assertNull(picked)
    }
}
