// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
package io.saturnis.trajectory.ui.elements

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive
import java.util.concurrent.ConcurrentHashMap

/**
 * Process-scoped timer state that survives composable exits and navigation.
 * Keyed by stepOid + fieldName so each timer instance is unique.
 * Uses wall-clock timestamps so elapsed time is correct even when the
 * composable is not in composition.
 */
private data class TimerState(
    val startMs: Long,          // wall-clock millis when timer started (or resumed)
    val pausedElapsed: Int? = null, // elapsed seconds when paused; null = running
)

private val timerStore = ConcurrentHashMap<String, TimerState>()

/** Clear timer state for a given step (call when workflow completes or step is abandoned). */
fun clearTimerState(stepOid: String) {
    timerStore.keys.removeAll { it.startsWith("$stepOid:") }
}

@Composable
fun TimerElement(props: ElementProps) {
    val label = props.element["label"]?.jsonPrimitive?.contentOrNull ?: "Timer"
    val fieldName = props.element["fieldName"]?.jsonPrimitive?.contentOrNull
    val durationSeconds = props.element["durationSeconds"]?.jsonPrimitive?.intOrNull ?: 60
    val direction = props.element["direction"]?.jsonPrimitive?.contentOrNull ?: "countdown"
    val blockDone = props.element["blockDone"]?.jsonPrimitive?.booleanOrNull ?: false
    val isCountdown = direction == "countdown"
    val initialSeconds = if (isCountdown) durationSeconds else 0

    val storeKey = if (props.stepOid.isNotEmpty() && fieldName != null) "${props.stepOid}:$fieldName" else null

    // Initialize or restore timer state
    val timerState = storeKey?.let { key ->
        timerStore.getOrPut(key) { TimerState(startMs = System.currentTimeMillis()) }
    }

    val isPaused = timerState?.pausedElapsed != null
    val isRunning = timerState != null && !isPaused

    // Compute elapsed from wall clock (running) or stored value (paused)
    var elapsed by remember { mutableIntStateOf(0) }

    if (timerState != null) {
        elapsed = if (isPaused) {
            timerState.pausedElapsed ?: 0
        } else {
            ((System.currentTimeMillis() - timerState.startMs) / 1000).toInt()
        }
    }

    val displaySeconds = if (isCountdown) {
        (durationSeconds - elapsed).coerceAtLeast(0)
    } else {
        elapsed
    }

    val progress = if (durationSeconds > 0) {
        if (isCountdown) {
            displaySeconds.toFloat() / durationSeconds
        } else {
            (elapsed.toFloat() / durationSeconds).coerceAtMost(1f)
        }
    } else {
        0f
    }

    val isComplete = if (isCountdown) displaySeconds <= 0 else elapsed >= durationSeconds

    // Tick loop: updates display every second while running and visible
    LaunchedEffect(isRunning, isComplete) {
        if (!isRunning || isComplete) return@LaunchedEffect
        while (true) {
            delay(1000L)
            val ts = storeKey?.let { timerStore[it] } ?: break
            if (ts.pausedElapsed != null) break
            elapsed = ((System.currentTimeMillis() - ts.startMs) / 1000).toInt()
            val done = if (isCountdown) (durationSeconds - elapsed) <= 0 else elapsed >= durationSeconds
            if (done) {
                if (fieldName != null) {
                    val finalValue = if (isCountdown) 0 else durationSeconds
                    props.onFormChange(fieldName, finalValue)
                }
                break
            }
        }
    }

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            modifier = Modifier.padding(bottom = 4.dp),
        )

        CircularProgressIndicator(
            progress = { progress },
            modifier = Modifier.size(36.dp),
            strokeWidth = 3.dp,
        )

        val minutes = displaySeconds / 60
        val seconds = displaySeconds % 60
        Text(
            text = "%02d:%02d".format(minutes, seconds),
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(vertical = 4.dp),
        )

        Row(
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (!isComplete) {
                IconButton(
                    onClick = {
                        if (storeKey == null) return@IconButton
                        if (isRunning) {
                            timerStore[storeKey] = TimerState(
                                startMs = timerStore[storeKey]!!.startMs,
                                pausedElapsed = elapsed,
                            )
                        } else {
                            val resumeStart = System.currentTimeMillis() - (elapsed * 1000L)
                            timerStore[storeKey] = TimerState(startMs = resumeStart)
                        }
                    },
                    modifier = Modifier.size(40.dp),
                ) {
                    Icon(
                        imageVector = if (isRunning) Icons.Default.Pause else Icons.Default.PlayArrow,
                        contentDescription = if (isRunning) "Pause" else "Play",
                        modifier = Modifier.size(18.dp),
                    )
                }
            }
            IconButton(
                onClick = {
                    if (storeKey == null) return@IconButton
                    timerStore[storeKey] = TimerState(startMs = System.currentTimeMillis())
                    if (fieldName != null) {
                        props.onFormChange(fieldName, initialSeconds)
                    }
                },
                modifier = Modifier.size(40.dp),
            ) {
                Icon(
                    imageVector = Icons.Default.Refresh,
                    contentDescription = "Reset",
                    modifier = Modifier.size(18.dp),
                )
            }
        }

        if (isComplete) {
            Text(
                text = "Complete",
                color = MaterialTheme.colorScheme.primary,
                style = MaterialTheme.typography.labelSmall,
            )
        }
    }
}
