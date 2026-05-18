// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
package io.saturnis.trajectory.ui.elements

import androidx.compose.runtime.Composable

typealias ElementComposable = @Composable (ElementProps) -> Unit

object ElementRegistry {
    private val registry = mutableMapOf<String, ElementComposable>()

    fun register(type: String, composable: ElementComposable) {
        registry[type] = composable
    }

    fun get(type: String): ElementComposable? = registry[type]

    fun registerDefaults() {
        register("textInput") { TextInputElement(it) }
        register("textarea") { TextareaElement(it) }
        register("checkbox") { CheckboxElement(it) }
        register("radio") { RadioElement(it) }
        register("button") { ButtonElement(it) }
        register("timer") { TimerElement(it) }
        register("header") { HeaderElement(it) }
        register("text") { TextElement(it) }
        register("image") { ImageElement(it) }
        register("video") { VideoElement(it) }
        register("divider") { DividerElement(it) }
    }
}
