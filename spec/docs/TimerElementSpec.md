# Trajectory Mobile — Timer Element Specification

## Overview

This specification describes how Trajectory Mobile implements timer countdown and countup behavior, user controls (pause, resume, restart, stop), elapsed time capture, and the `blockDone` mechanism that optionally prevents step completion until the timer finishes. See **UISpec.md section 3 (Form Rendering)** for device layout and element positioning context.

---

## 1. Export Schema

### 1.1 Timer Element JSON

Timer elements appear in `form_layout_config.elements[]` alongside other form elements:

```json
{
  "type": "timer",
  "label": "Step Timer",
  "fieldName": "elapsed",
  "durationSeconds": 300,
  "direction": "countdown",
  "blockDone": true,
  "x": 20,
  "y": 40,
  "width": 300,
  "height": 140
}
```

### 1.2 Field Reference

| Field             | Type                       | Default       | Required | Semantics                                                                                                                                       |
| ----------------- | -------------------------- | ------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`            | `"timer"`                  | —             | yes      | Element type discriminant. Always `"timer"`.                                                                                                    |
| `label`           | `string`                   | `"Timer"`     | no       | Display label shown above the timer widget.                                                                                                     |
| `fieldName`       | `string`                   | —             | yes      | JSON key under which the captured elapsed time is stored in the step output object. Must be a valid JavaScript identifier (no spaces, no dots). |
| `durationSeconds` | `number`                   | `300`         | yes      | Total timer duration in whole seconds. Minimum value: 1. Default 5 minutes (300 seconds).                                                       |
| `direction`       | `"countdown" \| "countup"` | `"countdown"` | yes      | Counting direction. `"countdown"` starts at `durationSeconds` and counts to 0. `"countup"` starts at 0 and counts toward `durationSeconds`.     |
| `blockDone`       | `boolean`                  | `false`       | no       | When `true`, the step's Done/Submit button is disabled until the timer expires or the user explicitly stops it. See section 6.                  |

Position fields (`x`, `y`, `width`, `height`) follow the same logical pixel coordinate system as all form elements (see UISpec.md section 3.3).

---

## 2. Timer Display

### 2.1 Format

The timer display uses HH:MM:SS format at all times:

```
HH:MM:SS
00:05:00   ← 5 minutes (durationSeconds: 300, countdown, at start)
00:00:00   ← countdown complete
00:00:00   ← countup at start
00:05:00   ← countup complete (reached target)
```

Hours, minutes, and seconds are always shown with two digits and zero-padded. The display never truncates to MM:SS even for durations under one hour.

### 2.2 Countdown Display

For `direction: "countdown"`:

- Starts at `durationSeconds` (e.g., `00:05:00` for 300 seconds)
- Decrements by 1 each second
- Stops at `00:00:00`

### 2.3 Countup Display

For `direction: "countup"`:

- Starts at `00:00:00`
- Increments by 1 each second
- Stops when the display reaches the `durationSeconds` target (e.g., `00:05:00` for 300 seconds)

### 2.4 Label

The `label` field is displayed above the timer display widget. A visual indication of the direction (such as a directional arrow icon or a "Countdown" / "Countup" label beneath the timer) is recommended but not required.

---

## 3. Timer Controls

### 3.1 Available Controls

The timer widget provides three user controls:

| Control            | Function                                                                                   | Availability                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| **Pause / Resume** | Pauses the running timer; resumes a paused timer. A single toggle button.                  | Available while timer is running (shows "Pause") or paused (shows "Resume"). Disabled when timer is stopped or expired. |
| **Restart**        | Resets the timer to its initial value and begins counting again.                           | Always available (running, paused, stopped, or expired).                                                                |
| **Stop**           | Stops the timer at its current value. Timer cannot be resumed after stop (only restarted). | Available while timer is running or paused. Disabled when timer is already stopped or expired.                          |

Suggested button arrangement: `[Pause / Resume]  [Restart]  [Stop]`

### 3.2 State Transitions

```
Initial state: RUNNING (timer starts automatically on form render)

RUNNING  --[Pause]-->  PAUSED
PAUSED   --[Resume]--> RUNNING
RUNNING  --[Stop]-->   STOPPED
PAUSED   --[Stop]-->   STOPPED
RUNNING  --[expires]--> EXPIRED
STOPPED  --[Restart]--> RUNNING
PAUSED   --[Restart]--> RUNNING
EXPIRED  --[Restart]--> RUNNING
```

### 3.3 Automatic Start

The timer begins counting automatically when the step enters EXECUTING state and the form is rendered. The user does not need to press a Start button.

---

## 4. Timer Expiry

### 4.1 Natural Expiry

Natural expiry occurs when the timer reaches its terminal value without user intervention:

- **Countdown**: timer display reaches `00:00:00`
- **Countup**: timer display reaches the formatted `durationSeconds` target

On natural expiry:

1. The timer stops automatically (transitions to EXPIRED state)
2. Elapsed time is captured (see section 5)
3. If `blockDone` is `true`, the Done/Submit button becomes enabled (see section 6)
4. Restart remains available; Pause/Resume and Stop become disabled

### 4.2 Expiry Event

The runtime may emit a `TIMER_EXPIRED` event when natural expiry occurs. This event can be used by the UI layer to notify the user (e.g., a sound, vibration, or visual indicator). The event is optional and does not affect step state.

---

## 5. Elapsed Time Capture

### 5.1 Captured Value

The timer writes the elapsed time to the step output under `fieldName`. The captured value is the **total elapsed seconds as an integer**.

| Direction   | Captured Value                              | Formula                                        |
| ----------- | ------------------------------------------- | ---------------------------------------------- |
| `countdown` | How long the timer ran (not remaining time) | `elapsed = durationSeconds - remainingSeconds` |
| `countup`   | Current countup value                       | `elapsed = currentCountupSeconds`              |

Examples:

- A 5-minute countdown timer that ran for 3 minutes and was stopped: `elapsed = 300 - 120 = 180`
- A 5-minute countup timer stopped at 3 minutes: `elapsed = 180`
- A countdown timer that completed naturally: `elapsed = durationSeconds` (e.g., 300)
- A countup timer that completed naturally: `elapsed = durationSeconds` (e.g., 300)

### 5.2 Capture Moments

Elapsed time is captured at the following moments:

| Moment              | Description                                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Natural expiry**  | Timer reaches 0:00:00 (countdown) or target (countup). Capture the final elapsed value.                           |
| **Explicit stop**   | User taps the Stop button. Capture elapsed at the moment of stop.                                                 |
| **Step submission** | User taps Done/Submit. Capture the current elapsed value regardless of timer state (running, paused, or stopped). |

### 5.3 Restart Behavior

If the user restarts the timer and then submits, capture the elapsed time **from the last restart only**, not cumulative across restarts.

```
Example:
  Timer runs for 60s → user restarts → timer runs for 30s → user submits
  Captured elapsed: 30 (not 90)
```

### 5.4 Output Location

The elapsed time integer is stored under `fieldName` in the step's output object. This output is available alongside other field outputs (textInput values, checkbox selections, etc.) and is written to the step output at the same time as all other form field values.

---

## 6. blockDone Behavior

### 6.1 Default Behavior (blockDone: false)

When `blockDone` is absent or `false`, the step's Done/Submit button is always enabled regardless of timer state. The user can submit the step at any time, even before the timer has run.

### 6.2 Blocking Behavior (blockDone: true)

When `blockDone` is `true`, the step's Done/Submit button is **disabled** until one of these conditions is met:

| Unblock Condition  | Description                                                               |
| ------------------ | ------------------------------------------------------------------------- |
| **Natural expiry** | The timer expires naturally (countdown reaches 0, countup reaches target) |
| **Explicit stop**  | The user taps the Stop button                                             |

The button remains disabled in all other timer states: running, paused.

**Critical:** Pausing the timer does NOT unblock Done. The user must either wait for the timer to expire or explicitly stop it.

### 6.3 Explicit Stop Escape Hatch

The Stop button is intentionally available even when `blockDone` is `true`. This escape hatch allows users to complete the step early in emergency situations without waiting for the full timer duration. The design decision is deliberate: the Stop button gives the operator explicit control to override the blocking behavior when circumstances require it.

### 6.4 Behavior Matrix

| Timer State           | blockDone: false | blockDone: true |
| --------------------- | ---------------- | --------------- |
| Running               | Done enabled     | Done DISABLED   |
| Paused                | Done enabled     | Done DISABLED   |
| Stopped (user action) | Done enabled     | Done enabled    |
| Expired (natural)     | Done enabled     | Done enabled    |

### 6.5 Visual Feedback

When `blockDone` is `true` and the Done button is disabled, it is recommended to provide visual feedback indicating why the button is disabled (e.g., a label such as "Complete the timer to continue" or a progress indicator on the timer widget).

---

## 7. Integration with Step Lifecycle

### 7.1 Step State Interactions

The timer lifecycle is coupled to the step's execution state:

| Step Event                       | Timer Behavior                                                      |
| -------------------------------- | ------------------------------------------------------------------- |
| Step enters EXECUTING            | Timer starts automatically                                          |
| Step PAUSED (via state controls) | Timer should pause automatically (equivalent to user tapping Pause) |
| Step RESUMED from PAUSED         | Timer should resume automatically                                   |
| Step ABORTED                     | Timer stops immediately. No capture needed.                         |
| Step COMPLETING                  | Capture current elapsed time, then step proceeds                    |

### 7.2 Carousel Navigation

If the user navigates away from a step in the carousel (e.g., taps Next/Previous to view another active step), the timer continues running in the background. When the user returns to the step, the timer display reflects the current elapsed/remaining time, not the value shown when they navigated away.

Timer state (RUNNING, PAUSED, or STOPPED) and the current time value must be persisted when the user navigates away, so that returning to the step shows the correct state.

### 7.3 Multiple Timers per Form

A single form layout may contain more than one timer element (each with a distinct `fieldName`). Each timer operates independently with its own state and elapsed time tracking. The `blockDone` behavior applies as a logical OR: if any timer on the form has `blockDone: true` and has not yet expired or been stopped, the Done button is disabled.

```
Done button enabled only when:
  ALL timers with blockDone:true are in STOPPED or EXPIRED state
```
