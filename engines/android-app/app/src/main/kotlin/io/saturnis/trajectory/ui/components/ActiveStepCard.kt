// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
package io.saturnis.trajectory.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.unit.dp
import com.trajectoryruntime.engine.*

val INTERACTIVE_TYPES = setOf("YES NO", "YES_NO", "USER INTERACTION", "USER_INTERACTION")

@Composable
fun ActiveStepCard(
    step: ActiveStepInfo,
    onAction: (UserAction) -> Unit,
    properties: Map<String, String>,
    inputParameters: Map<String, String>,
    mediaMap: Map<String, String>,
    viewport: ViewportClass,
) {
    val instance = step.step
    val state = instance.state
    val stepType = instance.stepType
    val isInteractive = stepType in INTERACTIVE_TYPES

    ElevatedCard(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp),
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
        ) {
            when {
                state == StepState.EXECUTING && isInteractive -> {
                    StepRenderer(
                        step = instance,
                        onAction = onAction,
                        properties = properties,
                        inputParameters = inputParameters,
                        mediaMap = mediaMap,
                        viewport = viewport,
                    )
                }
                (state == StepState.WAITING || state == StepState.PAUSED) && isInteractive -> {
                    val bannerText = if (state == StepState.WAITING) "Waiting..." else "Paused"
                    Surface(
                        color = MaterialTheme.colorScheme.secondaryContainer,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(
                            text = bannerText,
                            modifier = Modifier.padding(8.dp),
                            style = MaterialTheme.typography.labelMedium,
                        )
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    Box(modifier = Modifier.alpha(0.5f)) {
                        StepRenderer(
                            step = instance,
                            onAction = { }, // disabled
                            properties = properties,
                            inputParameters = inputParameters,
                            mediaMap = mediaMap,
                            viewport = viewport,
                        )
                    }
                }
                else -> {
                    Text(
                        text = state.name.replace("_", " "),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}
