# Runtime Canvas Scaling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render every editor form layout scaled-to-fit-width on its target inner canvas, with orientation-aware layout selection across web-ui (runtime + editor preview) and android-app.

**Architecture:** A single rule picks which editor layout to render (PHONE / TABLET / DESKTOP) based on viewport orientation and size. The form is then rendered with absolute positioning and uniformly scaled to fill the inner canvas width via CSS `transform: scale()` on web-ui and a Compose `LocalDensity` override on android. Phone hardware is locked to portrait at android runtime; phone-landscape is unsupported.

**Tech Stack:** TypeScript / React (web-ui, Vite), Kotlin / Jetpack Compose (android-app), JUnit (android tests). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-04-runtime-canvas-scaling-design.md`

---

## File map

**Web-ui (modify):**
- `engines/web-ui/src/components/shell/DeviceFrame.tsx` — widen `DeviceType`, rename `'tablet'` → `'tablet-horizontal'`, add `'tablet-vertical'`.
- `engines/web-ui/src/components/shell/DeviceFrame.module.css` — rename `.frame--tablet` → `.frame--tablet-horizontal`, add `.frame--tablet-vertical`.
- `engines/web-ui/src/components/shell/FrameSwitcher.tsx` — 4-segment switch with rename + addition.
- `engines/web-ui/src/components/shell/TitleBar.tsx` — propagate widened `deviceType` literal union.
- `engines/web-ui/src/components/shell/AppShell.tsx` — uses `DeviceType` already; no logic change.
- `engines/web-ui/src/App.tsx` — localStorage migration from `'tablet'` to `'tablet-horizontal'`.
- `engines/web-ui/src/components/screens/ActiveScreen.tsx` — propagate widened `deviceType` literal union.
- `engines/web-ui/src/components/ActiveStepCard.tsx` — propagate widened `deviceType` literal union.
- `engines/web-ui/src/components/StepRenderer.tsx` — propagate widened `viewportOverride` literal union.
- `engines/web-ui/src/components/FormRenderer.tsx` — drop column-flow phone branch, single scaled-canvas path, extend `viewportOverride` to four values, orientation-aware auto-detect.

**Android (modify):**
- `engines/android-app/app/src/test/kotlin/io/saturnis/trajectory/ui/FormLayoutComputationTest.kt` — replace `isCompact: Boolean` cases with `ViewportClass` cases.
- `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/components/FormLayoutComputation.kt` — `ViewportClass` enum + new `pickLayout` signature.
- `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/components/FormRenderer.kt` — accept `ViewportClass`, wrap canvas Box in `BoxWithConstraints` + density override.
- `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/components/StepRenderer.kt` — replace `isCompact: Boolean` with `viewport: ViewportClass`.
- `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/components/ActiveStepCard.kt` — replace `isCompact: Boolean` with `viewport: ViewportClass`.
- `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/screens/ActiveScreen.kt` — derive `ViewportClass` from `LocalConfiguration` and pass it down.
- `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/MainActivity.kt` — phone hardware orientation lock at activity creation.

---

## Task 1 — Web-ui: Add `tablet-vertical` DeviceFrame option

**Files:**
- Modify: `engines/web-ui/src/components/shell/DeviceFrame.tsx`
- Modify: `engines/web-ui/src/components/shell/DeviceFrame.module.css`
- Modify: `engines/web-ui/src/components/shell/FrameSwitcher.tsx`
- Modify: `engines/web-ui/src/components/shell/TitleBar.tsx`
- Modify: `engines/web-ui/src/components/screens/ActiveScreen.tsx`
- Modify: `engines/web-ui/src/components/ActiveStepCard.tsx`
- Modify: `engines/web-ui/src/App.tsx`

This task adds the new preview frame and renames the existing `'tablet'` option to `'tablet-horizontal'` for clarity. Form rendering inside `tablet-vertical` falls through to the existing container-width auto-detect (picks `tablet` layout because the frame is 800 px wide ≥ 600 px breakpoint) until Task 2 maps it to the PHONE layout. That intermediate state is not visually correct but is not broken.

- [ ] **Step 1.1: Update `DeviceFrame.tsx` — widen the `DeviceType` union**

Replace line 6 in `engines/web-ui/src/components/shell/DeviceFrame.tsx`:

```tsx
export type DeviceType = 'phone' | 'tablet-vertical' | 'tablet-horizontal' | 'desktop';
```

The `frameClass` template literal on line 16 (`styles[\`frame--${deviceType}\`]`) handles hyphens transparently — no other changes in this file.

- [ ] **Step 1.2: Update `DeviceFrame.module.css` — rename and add CSS rules**

In `engines/web-ui/src/components/shell/DeviceFrame.module.css`:

Rename the existing `.frame--tablet` rule to `.frame--tablet-horizontal` (line 21).

Add a new `.frame--tablet-vertical` rule directly after the `.frame--tablet-horizontal` block:

```css
/* Tablet vertical (portrait) */
.frame--tablet-vertical {
  width: 800px;
  height: 1280px;
  border-radius: 18px;
  border: 10px solid var(--frame-bezel-color, #1a1a1a);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
}
```

- [ ] **Step 1.3: Update `FrameSwitcher.tsx` — 4-segment switch**

Replace lines 7–12 in `engines/web-ui/src/components/shell/FrameSwitcher.tsx`:

```tsx
const DEVICE_OPTIONS: DeviceType[] = ['desktop', 'tablet-horizontal', 'tablet-vertical', 'phone'];
const LABELS: Record<DeviceType, string> = {
  phone: 'Phone',
  'tablet-vertical': 'Tablet V',
  'tablet-horizontal': 'Tablet H',
  desktop: 'Desktop',
};
```

The pill-highlight math (`offset = activeIndex * 100`) auto-scales to four segments — no other change.

- [ ] **Step 1.4: Update `TitleBar.tsx` — widen literal union and update comparison**

In `engines/web-ui/src/components/shell/TitleBar.tsx`:

Replace `deviceType?: 'phone' | 'tablet' | 'desktop'` on lines 15 and 82 with:

```tsx
deviceType?: 'phone' | 'tablet-vertical' | 'tablet-horizontal' | 'desktop'
```

Replace line 84:

```tsx
const isLarge = deviceType === 'tablet-horizontal' || deviceType === 'tablet-vertical' || deviceType === 'desktop';
```

- [ ] **Step 1.5: Update `ActiveScreen.tsx` and `ActiveStepCard.tsx` — widen literal unions**

Replace `deviceType?: 'phone' | 'tablet' | 'desktop'` on:
- `engines/web-ui/src/components/screens/ActiveScreen.tsx` line 26
- `engines/web-ui/src/components/ActiveStepCard.tsx` line 15

with:

```tsx
deviceType?: 'phone' | 'tablet-vertical' | 'tablet-horizontal' | 'desktop'
```

- [ ] **Step 1.6: Migrate the persisted `deviceType` value in `App.tsx`**

The existing localStorage key `trajectory-device-type` may hold the old string `'tablet'`; map it to `'tablet-horizontal'` on load. Replace the existing `useLocalStorage` call on line 13 of `engines/web-ui/src/App.tsx`:

```tsx
const [deviceTypeRaw, setDeviceType] = useLocalStorage<string>('trajectory-device-type', 'desktop');
const deviceType: DeviceType = (deviceTypeRaw === 'tablet' ? 'tablet-horizontal' : deviceTypeRaw) as DeviceType;
```

Update the `FrameSwitcher` and `DeviceFrame` / `AppShell` usages (lines 23, 26, 28) to pass `deviceType` (the migrated value) — no further code change since they already read this variable.

- [ ] **Step 1.7: Verify TypeScript compiles**

Run: `npm --prefix engines/web-ui run build`
Expected: build succeeds (TypeScript phase reports no errors).

- [ ] **Step 1.8: Manually verify the new frame in the dev server**

Run: `npm --prefix engines/web-ui run dev`

In the browser:
- All four switcher buttons (`Desktop / Tablet H / Tablet V / Phone`) appear and switch the frame.
- Tablet V renders an 800 × 1280 frame.
- The previously-saved `'tablet'` localStorage value is migrated silently to `'tablet-horizontal'` (the same horizontal frame is shown).

- [ ] **Step 1.9: Commit**

```bash
git add engines/web-ui/src/components/shell/DeviceFrame.tsx \
        engines/web-ui/src/components/shell/DeviceFrame.module.css \
        engines/web-ui/src/components/shell/FrameSwitcher.tsx \
        engines/web-ui/src/components/shell/TitleBar.tsx \
        engines/web-ui/src/components/screens/ActiveScreen.tsx \
        engines/web-ui/src/components/ActiveStepCard.tsx \
        engines/web-ui/src/App.tsx
git commit -m "feat(web-ui): add tablet-vertical DeviceFrame option"
```

---

## Task 2 — Web-ui: Single scaled-canvas FormRenderer + viewport mapping

**Files:**
- Modify: `engines/web-ui/src/components/FormRenderer.tsx`
- Modify: `engines/web-ui/src/components/StepRenderer.tsx`

This task drops the column-flow phone branch in `FormRenderer` so every viewport uses the same scaled-canvas code path, extends `viewportOverride` to four values, maps `tablet-vertical` to the editor's PHONE layout, and switches the auto-detect logic from a width-only breakpoint table to an orientation + size rule that matches the design spec.

- [ ] **Step 2.1: Update `viewportOverride` type in `FormRenderer.tsx`**

In `engines/web-ui/src/components/FormRenderer.tsx`:

Replace `viewportOverride?: 'phone' | 'tablet' | 'desktop';` on lines 14 and 29 with:

```tsx
viewportOverride?: 'phone' | 'tablet-vertical' | 'tablet-horizontal' | 'desktop';
```

- [ ] **Step 2.2: Replace `pickLayout` and add viewport detection helper**

Replace lines 20–47 of `engines/web-ui/src/components/FormRenderer.tsx` (the `BREAKPOINTS` constant, `pickLayout` function, and `isPhoneMode` function) with:

```tsx
type ViewportOverride = 'phone' | 'tablet-vertical' | 'tablet-horizontal' | 'desktop';

/** Map a viewport (override or auto-detected) to the editor layout deviceType to look up. */
function viewportToLayoutType(viewport: ViewportOverride): 'phone' | 'tablet' | 'desktop' {
  switch (viewport) {
    case 'phone':
    case 'tablet-vertical':
      return 'phone';
    case 'tablet-horizontal':
      return 'tablet';
    case 'desktop':
      return 'desktop';
  }
}

/**
 * Auto-detect the viewport class from the form's container dimensions.
 * Portrait → phone layout; landscape size thresholds (smallest dim) at 600 / 1024.
 * Phone-landscape (smallest < 600 in landscape) degrades to phone layout.
 */
function detectViewport(width: number, height: number): ViewportOverride {
  const portrait = height > width;
  if (portrait) return 'phone';
  const smallest = Math.min(width, height);
  if (smallest >= 1024) return 'desktop';
  if (smallest >= 600) return 'tablet-horizontal';
  return 'phone';
}

function pickLayout(
  layouts: FormLayoutExportEntry[],
  containerWidth: number,
  containerHeight: number,
  viewportOverride?: ViewportOverride,
): FormLayoutExportEntry {
  const viewport = viewportOverride ?? detectViewport(containerWidth, containerHeight);
  const targetType = viewportToLayoutType(viewport);
  const exact = layouts.find((l) => l.deviceType === targetType);
  if (exact) return exact;
  // Fallback: try tablet → desktop → first.
  return (
    layouts.find((l) => l.deviceType === 'tablet') ??
    layouts.find((l) => l.deviceType === 'desktop') ??
    layouts[0]
  );
}
```

- [ ] **Step 2.3: Drop the phone column-flow branch and call `pickLayout` with both dimensions**

Replace lines 49–156 of `engines/web-ui/src/components/FormRenderer.tsx` (the entire body of `export function FormRenderer` through to its closing brace) with:

```tsx
export function FormRenderer({ layouts, formValues, onFormChange, onButtonPress, properties, inputParameters, viewportOverride, mediaMap, buttonsDisabled, disabledTooltip }: FormRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 360, height: 800 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(el);
    setContainerSize({ width: el.clientWidth, height: el.clientHeight });
    return () => observer.disconnect();
  }, []);

  const layout = pickLayout(layouts, containerSize.width, containerSize.height, viewportOverride);

  const contentBottom = layout.elements.reduce((max, el) => Math.max(max, el.y + el.height), 0);
  const contentRight = layout.elements.reduce((max, el) => Math.max(max, el.x + el.width), 0);
  const effectiveHeight = contentBottom + 16;
  const effectiveWidth = Math.max(contentRight + 16, layout.canvasWidth);
  const scale = containerSize.width / effectiveWidth;

  return (
    <div
      ref={containerRef}
      className="form-renderer"
      style={{ position: 'relative', width: '100%', height: effectiveHeight * scale }}
    >
      <div
        className="form-canvas"
        style={{
          width: effectiveWidth,
          height: effectiveHeight,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          position: 'absolute',
          top: 0,
          left: 0,
        }}
      >
        {layout.elements.map((el, i) => (
          <div
            key={elementKey(el, i)}
            className="form-element-slot"
            style={{
              position: 'absolute',
              left: el.x,
              top: el.y,
              width: el.width,
              height: el.height,
              zIndex: el.zIndex ?? 0,
            }}
          >
            <ElementRenderer
              element={el}
              formValues={formValues}
              onFormChange={onFormChange}
              onButtonPress={onButtonPress}
              properties={properties}
              inputParameters={inputParameters}
              mediaMap={mediaMap}
              buttonsDisabled={buttonsDisabled}
              disabledTooltip={disabledTooltip}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2.4: Update `viewportOverride` type in `StepRenderer.tsx`**

In `engines/web-ui/src/components/StepRenderer.tsx`, replace every occurrence of `viewportOverride?: 'phone' | 'tablet' | 'desktop'` (lines 46, 78, 201) with:

```tsx
viewportOverride?: 'phone' | 'tablet-vertical' | 'tablet-horizontal' | 'desktop'
```

(Use `replace_all` — there are three identical literal-union strings to update.)

- [ ] **Step 2.5: Verify TypeScript compiles**

Run: `npm --prefix engines/web-ui run build`
Expected: build succeeds.

- [ ] **Step 2.6: Manually verify scaled rendering in the dev server**

Run: `npm --prefix engines/web-ui run dev`

Load a workflow that has a multi-element interactive form. For each device option, the form should render with absolute positioning scaled uniformly to fit the inner canvas width:

| Frame | Inner width | Layout used | Expected scale |
|---|---|---|---|
| Phone | 360 px | phone | 1.0× |
| Tablet V | 800 px | phone | ~2.22× |
| Tablet H | 1340 px | tablet | 1.0× |
| Desktop | 1200 px | desktop | 1.0× |

Manually resize the Desktop frame (its handle still works) — the form rescales smoothly. No element wraps or column-stacks; everything is absolute-positioned and proportional.

- [ ] **Step 2.7: Commit**

```bash
git add engines/web-ui/src/components/FormRenderer.tsx \
        engines/web-ui/src/components/StepRenderer.tsx
git commit -m "feat(web-ui): scale-to-fit form canvas with orientation-aware layout pick"
```

---

## Task 3 — Android: `ViewportClass` enum + propagation through prop chain

**Files:**
- Modify: `engines/android-app/app/src/test/kotlin/io/saturnis/trajectory/ui/FormLayoutComputationTest.kt`
- Modify: `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/components/FormLayoutComputation.kt`
- Modify: `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/components/FormRenderer.kt`
- Modify: `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/components/StepRenderer.kt`
- Modify: `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/components/ActiveStepCard.kt`
- Modify: `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/screens/ActiveScreen.kt`

Replace `isCompact: Boolean` with `ViewportClass` end-to-end. The new class encodes both orientation and tablet/phone hardware so tablet-portrait correctly picks the PHONE layout (current `isCompact = false` bug picks TABLET on tablet-portrait). Density override and orientation lock land in subsequent tasks.

- [ ] **Step 3.1: Replace the unit tests with `ViewportClass` cases (failing first)**

Replace the entire body of `engines/android-app/app/src/test/kotlin/io/saturnis/trajectory/ui/FormLayoutComputationTest.kt` with:

```kotlin
// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
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
    fun `pickLayout returns null for empty array`() {
        val picked = FormLayoutComputation.pickLayout(JsonArray(emptyList()), ViewportClass.PORTRAIT)
        assertNull(picked)
    }
}
```

- [ ] **Step 3.2: Run the unit tests — expect compile failure**

Run: `./gradlew :app:testDebugUnitTest --tests io.saturnis.trajectory.ui.FormLayoutComputationTest`
(from `engines/android-app/`)

Expected: compilation fails because `ViewportClass` does not exist yet and `FormLayoutComputation.pickLayout` still has a `Boolean` parameter.

- [ ] **Step 3.3: Replace `FormLayoutComputation.kt` with the new API**

Replace the entire content of `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/components/FormLayoutComputation.kt` with:

```kotlin
// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
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
     * - PORTRAIT → "phone"
     * - TABLET_LANDSCAPE → "tablet", then "desktop", then first available
     * - Any class falls back to first available if nothing matches.
     */
    fun pickLayout(layouts: JsonArray, viewport: ViewportClass): JsonObject? {
        val targetType = when (viewport) {
            ViewportClass.PORTRAIT -> "phone"
            ViewportClass.TABLET_LANDSCAPE -> "tablet"
        }
        val match = layouts.firstOrNull {
            it.jsonObject["deviceType"]?.jsonPrimitive?.contentOrNull == targetType
        }?.jsonObject
        if (match != null) return match
        if (viewport == ViewportClass.TABLET_LANDSCAPE) {
            val desktop = layouts.firstOrNull {
                it.jsonObject["deviceType"]?.jsonPrimitive?.contentOrNull == "desktop"
            }?.jsonObject
            if (desktop != null) return desktop
        }
        return layouts.firstOrNull()?.jsonObject
    }
}
```

- [ ] **Step 3.4: Update `FormRenderer.kt` — accept `ViewportClass` (no scaling yet)**

In `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/components/FormRenderer.kt`:

Replace line 42 (`isCompact: Boolean,`) with:

```kotlin
    viewport: ViewportClass,
```

Replace line 54 (`val layout = FormLayoutComputation.pickLayout(layoutArray, isCompact) ?: return`) with:

```kotlin
    val layout = FormLayoutComputation.pickLayout(layoutArray, viewport) ?: return
```

Density override is added in Task 4; this task keeps the existing `Box(Modifier.width(canvasWidth.dp).height(totalHeight.dp))` rendering unchanged.

- [ ] **Step 3.5: Update `StepRenderer.kt` — accept `ViewportClass` and propagate it**

In `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/components/StepRenderer.kt`:

Replace `isCompact: Boolean` on lines 21, 89, 190 with `viewport: ViewportClass` (use `replace_all`).

Replace the inner usages on lines 26, 29, 133, 237 — every `isCompact = isCompact,` becomes `viewport = viewport,` — and the positional call on lines 26 and 29 (`YesNoRenderer(step, onAction, properties, inputParameters, mediaMap, isCompact)` and `UserInteractionRenderer(...)` ) becomes:

```kotlin
            YesNoRenderer(step, onAction, properties, inputParameters, mediaMap, viewport)
```

```kotlin
            UserInteractionRenderer(step, onAction, properties, inputParameters, mediaMap, viewport)
```

Add `import io.saturnis.trajectory.ui.components.ViewportClass` is unnecessary — same package; no change to imports.

- [ ] **Step 3.6: Update `ActiveStepCard.kt` — accept `ViewportClass` and propagate it**

In `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/components/ActiveStepCard.kt`:

Replace line 22 (`isCompact: Boolean,`) with:

```kotlin
    viewport: ViewportClass,
```

Replace `isCompact = isCompact,` on lines 43 and 66 with:

```kotlin
                        viewport = viewport,
```

(Indentation matches existing — same package; no import change needed.)

- [ ] **Step 3.7: Update `ActiveScreen.kt` — derive `ViewportClass` from `LocalConfiguration` and pass it down**

In `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/screens/ActiveScreen.kt`:

Add the imports (alphabetically with the existing imports, around line 17):

```kotlin
import android.content.res.Configuration
import androidx.compose.ui.platform.LocalConfiguration
import io.saturnis.trajectory.ui.components.ViewportClass
```

Replace line 72 (`val isCompact = widthSizeClass == WindowWidthSizeClass.Compact`) with:

```kotlin
    val configuration = LocalConfiguration.current
    val viewport = if (
        configuration.orientation == Configuration.ORIENTATION_LANDSCAPE &&
        configuration.smallestScreenWidthDp >= 600
    ) {
        ViewportClass.TABLET_LANDSCAPE
    } else {
        ViewportClass.PORTRAIT
    }
    val isCompact = widthSizeClass == WindowWidthSizeClass.Compact
```

(`isCompact` is kept for any other call sites in this file that still use it — verify none remain after step 3.8.)

Replace line 193 (`PagerActiveLayout(allSteps, onAction, isCompact = isCompact, pagerState = pagerState)`) with:

```kotlin
                PagerActiveLayout(allSteps, onAction, viewport = viewport, pagerState = pagerState)
```

- [ ] **Step 3.8: Update `PagerActiveLayout` and any remaining `isCompact` in `ActiveScreen.kt`**

In the same `ActiveScreen.kt`:

Replace line 308 (`isCompact: Boolean,`) — the `PagerActiveLayout` parameter — with:

```kotlin
    viewport: ViewportClass,
```

Replace line 345 (`isCompact = isCompact,` — passed to `ActiveStepCard`) with:

```kotlin
                                    viewport = viewport,
```

Then verify no further uses of `isCompact` remain in this file (the previous `widthSizeClass == WindowWidthSizeClass.Compact` derivation is no longer used by anything but can stay as-is for other callers if they exist; otherwise delete the unused `val isCompact` line).

- [ ] **Step 3.9: Run the unit tests — expect pass**

Run: `./gradlew :app:testDebugUnitTest --tests io.saturnis.trajectory.ui.FormLayoutComputationTest`
(from `engines/android-app/`)

Expected: 5 tests pass.

- [ ] **Step 3.10: Build the android app**

Run: `./gradlew :app:assembleDebug`
(from `engines/android-app/`)

Expected: build succeeds.

- [ ] **Step 3.11: Manually verify on tablet portrait (the bug fix)**

Install the debug APK on a tablet (or use an emulator with a Galaxy Tab S7 / Pixel Tablet profile) in **portrait** orientation. Open a workflow with a multi-element form.

Expected: the form renders the editor's PHONE layout (was previously rendering the TABLET layout and overflowing). No scaling has been applied yet, so it appears at its native 360-dp width on a wide tablet — visually small but correctly chosen. Task 4 makes it scale up.

- [ ] **Step 3.12: Commit**

```bash
git add engines/android-app/app/src/test/kotlin/io/saturnis/trajectory/ui/FormLayoutComputationTest.kt \
        engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/components/FormLayoutComputation.kt \
        engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/components/FormRenderer.kt \
        engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/components/StepRenderer.kt \
        engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/components/ActiveStepCard.kt \
        engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/screens/ActiveScreen.kt
git commit -m "refactor(android-ui): replace isCompact with ViewportClass for layout pick"
```

---

## Task 4 — Android: Density override scaling in `FormRenderer`

**Files:**
- Modify: `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/components/FormRenderer.kt`

Wraps the canvas Box in `BoxWithConstraints` + `CompositionLocalProvider(LocalDensity provides ...)`. The form subtree sees a scaled density so `360.dp` (or whatever `canvasWidth` is) resolves to exactly the available container width in pixels. Text, hit targets, IME insets, and `TextField` cursor positioning all reflow at the new density — no graphicsLayer hacks.

- [ ] **Step 4.1: Add the density override wrapper**

Replace lines 71–105 of `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/components/FormRenderer.kt` (the existing `Box(modifier = Modifier.width(canvasWidth.dp).height(totalHeight.dp)) { elements.forEach { ... } }` block) with:

```kotlin
    BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
        val parentDensity = LocalDensity.current
        val innerWidthDp = maxWidth.value
        if (innerWidthDp <= 0f || canvasWidth <= 0f) return@BoxWithConstraints
        val scale = innerWidthDp / canvasWidth
        val newDensity = Density(
            density = parentDensity.density * scale,
            fontScale = parentDensity.fontScale,
        )
        CompositionLocalProvider(LocalDensity provides newDensity) {
            Box(
                modifier = Modifier
                    .width(canvasWidth.dp)
                    .height(totalHeight.dp),
            ) {
                elements.forEach { el ->
                    val obj = el.jsonObject
                    val type = obj["type"]?.jsonPrimitive?.contentOrNull ?: return@forEach
                    val composable = ElementRegistry.get(type) ?: return@forEach
                    val x = obj["x"]?.jsonPrimitive?.floatOrNull ?: 0f
                    val y = (obj["y"]?.jsonPrimitive?.floatOrNull ?: 0f) - minY
                    val w = obj["width"]?.jsonPrimitive?.floatOrNull ?: 100f
                    val h = obj["height"]?.jsonPrimitive?.floatOrNull ?: 40f

                    Box(
                        modifier = Modifier
                            .offset(x = x.dp, y = y.dp)
                            .size(width = w.dp, height = h.dp),
                    ) {
                        composable(
                            ElementProps(
                                element = obj,
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
            }
        }
    }
```

- [ ] **Step 4.2: Add the imports for `BoxWithConstraints`, `CompositionLocalProvider`, `LocalDensity`, `Density`**

In the same file, ensure the following imports are present (most are already implied by the existing wildcard `androidx.compose.foundation.layout.*` and `androidx.compose.runtime.*`; add only those missing):

```kotlin
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density
```

`BoxWithConstraints` is in `androidx.compose.foundation.layout.*` (already imported on line 5). `CompositionLocalProvider` is in `androidx.compose.runtime.*` (already imported on line 6).

- [ ] **Step 4.3: Build the android app**

Run: `./gradlew :app:assembleDebug` (from `engines/android-app/`)

Expected: build succeeds.

- [ ] **Step 4.4: Run unit tests (sanity check)**

Run: `./gradlew :app:testDebugUnitTest` (from `engines/android-app/`)

Expected: all unit tests pass (no test changes; this is just a regression check).

- [ ] **Step 4.5: Manually verify scaling on real / emulated devices**

Install the debug APK and verify a form with a text input, checkbox, button, and image element renders correctly at the right scale on each:

| Device | Orientation | Expected layout | Expected scale |
|---|---|---|---|
| Pixel 4 (360 × 740 dp) | portrait | phone | 1.0× |
| Pixel 6 (411 × 860 dp) | portrait | phone | ~1.14× |
| Galaxy Tab S7 (~800 × 1140 dp inner) | portrait | phone | ~2.22× |
| Galaxy Tab S7 (~1280 × 720 dp inner) | landscape | tablet | ~0.95× |

Each element should remain readable, all text scales proportionally, the keyboard appears under the focused TextField with no offset issue, vertical overflow scrolls inside the parent.

- [ ] **Step 4.6: Commit**

```bash
git add engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/ui/components/FormRenderer.kt
git commit -m "feat(android-ui): scale-to-fit form canvas via LocalDensity override"
```

---

## Task 5 — Android: Lock phone hardware to portrait

**Files:**
- Modify: `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/MainActivity.kt`

Phone-landscape is unsupported per the spec. Lock at activity creation based on `smallestScreenWidthDp` (hardware-stable across rotations).

- [ ] **Step 5.1: Add the orientation lock in `onCreate`**

In `engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/MainActivity.kt`:

Add the import alphabetically (around the existing `android.*` imports near line 5):

```kotlin
import android.content.pm.ActivityInfo
```

Insert the orientation lock immediately after `enableEdgeToEdge()` on line 29, before the `val app = application as TrajectoryApp` line:

```kotlin
        val smallestWidth = resources.configuration.smallestScreenWidthDp
        requestedOrientation = if (smallestWidth < 600) {
            ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
        } else {
            ActivityInfo.SCREEN_ORIENTATION_FULL_USER
        }
```

- [ ] **Step 5.2: Build the android app**

Run: `./gradlew :app:assembleDebug` (from `engines/android-app/`)

Expected: build succeeds.

- [ ] **Step 5.3: Manually verify orientation lock**

Install the debug APK:

- On a phone (Pixel 4 / Pixel 6), rotate the device — the app stays in portrait.
- On a tablet (Galaxy Tab S7 / Pixel Tablet), rotate — the app rotates freely between portrait and landscape, picking PHONE / TABLET layout per orientation.

- [ ] **Step 5.4: Commit**

```bash
git add engines/android-app/app/src/main/kotlin/io/saturnis/trajectory/MainActivity.kt
git commit -m "feat(android): lock phone hardware to portrait orientation"
```

---

## Self-review checklist (run before handoff)

- [ ] Spec section "Layout selection rule" — covered by Task 2 (web) + Task 3 (android).
- [ ] Spec section "Editor preview — tablet-vertical frame" — covered by Task 1.
- [ ] Spec section "Form scaling implementation: web-ui" — covered by Task 2.
- [ ] Spec section "Form scaling implementation: android" — covered by Task 4.
- [ ] Spec section "Phone orientation lock" — covered by Task 5.
- [ ] Spec section "Affected files" — every listed file appears in at least one task's Files block.
- [ ] Spec section "Edge cases" — fallback chain preserved (Task 3 Step 3.3 keeps the desktop fallback for TABLET_LANDSCAPE), `innerWidthDp <= 0` guard in Task 4.5 wrapper, fontScale preserved in Task 4.1, schema unchanged.
- [ ] Spec section "Testing" — android unit tests in Task 3.1 / 3.9; manual device matrices in Task 4.5 and Task 5.3; web-ui visual matrix in Task 2.6.
