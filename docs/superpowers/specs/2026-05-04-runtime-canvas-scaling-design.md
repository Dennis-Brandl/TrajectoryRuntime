# Runtime Canvas Scaling — Design

Date: 2026-05-04
Status: Draft (awaiting user review)
Scope: `engines/web-ui/` runtime + editor preview, `engines/android-app/` runtime
Out of scope: iOS, KMP-engine, web/desktop standalone runtime layouts beyond what already exists

## Background

Part 1 of the UI redesign (`refactor(android-ui): Part 1 — render forms exactly as the editor recommends`, `7a7cabb`) made the android runtime render the editor's recommended `(x, y, width, height)` 1:1, where each editor pixel becomes 1 dp. That works on a phone whose width matches the editor's 360-wide phone canvas, but leaves whitespace on wider phones and overflows on a tablet showing the 1340-wide tablet canvas in portrait orientation.

Part 2 of the UI refactor (`refactor(ui): Part 2 — drop scaling dead code, resize device frames, wire viewport override`, `7507c9d`) cleaned up dead scaling code in web-ui and resized the DeviceFrame previews to match real-world devices.

This spec defines Part 2 of the UI **update**: explicit canvas scaling so the editor's design fills the physical inner canvas area on every device, with the right editor layout chosen per orientation.

## Goals

- Phone hardware: editor PHONE layout, scaled uniformly to fill the form's inner canvas area, vertical overflow scrolls.
- Tablet hardware in landscape: editor TABLET layout, scaled uniformly to fill the form's inner canvas area.
- Tablet hardware in portrait: editor PHONE layout, scaled uniformly to fill the form's inner canvas area.
- Web-ui editor preview: same rule — phone DeviceFrame uses PHONE layout; tablet-horizontal uses TABLET; tablet-vertical (new option) uses PHONE; desktop unchanged.
- One scale formula across surfaces: `scale = innerCanvasWidth / layout.canvasWidth`.

## Non-goals

- Phone-landscape rendering. Android phones are pinned to portrait at runtime; web-ui best-effort renders PHONE layout if it happens.
- Per-element font/size opt-out. Everything inside the form scales together.
- Letterboxing or centering. Scale is fit-width; vertical overflow scrolls.
- Editor canvas size changes. The editor still designs at 360×800 / 1340×800 / 1200×1024.
- Schema changes. The editor export (`deviceType`, `canvasWidth`, `elements`) is unchanged.

## Layout selection rule

A single decision used by both runtimes and the editor preview.

| Viewport class | Source signal | Editor layout used |
|---|---|---|
| PORTRAIT | `height > width` | `phone` |
| TABLET_LS | `landscape`, `min(W, H) ≥ 600`, `min(W, H) < 1024` | `tablet` |
| DESKTOP | `landscape`, `min(W, H) ≥ 1024` | `desktop` |
| (phone-landscape) | `landscape`, `min(W, H) < 600` | unsupported (locked on android, degraded to `phone` on web) |

Android is mobile-only — only PORTRAIT and TABLET_LS apply there; the DESKTOP branch is web-only.

Source-of-truth per surface:

- **Android runtime:** `LocalConfiguration.current.orientation` and `LocalConfiguration.current.smallestScreenWidthDp` (Compose recomposes on configuration change).
- **Web-ui runtime:** the form's container dimensions via `ResizeObserver` — portrait if `containerHeight > containerWidth`; class by `min(containerW, containerH)` against the 600 / 1024 thresholds.
- **Editor preview:** the `DeviceFrame` type the user selected — `phone | tablet-vertical → PHONE layout`; `tablet-horizontal → TABLET layout`; `desktop → DESKTOP layout`.

Existing fallback chain in `pickLayout` (try preferred → "tablet" → "desktop" → first available) is kept unchanged for missing-layout cases.

## Editor preview — tablet-vertical frame

A fourth DeviceFrame option is added to the editor preview.

**`DeviceFrame.tsx`:** `DeviceType` becomes `'phone' | 'tablet-vertical' | 'tablet-horizontal' | 'desktop'`. The previous `'tablet'` literal is renamed to `'tablet-horizontal'` (same dimensions and styling).

**`DeviceFrame.module.css`:** add

```css
.frame--tablet-vertical {
  width: 800px;
  height: 1280px;
  border-radius: 18px;
  border: 10px solid var(--frame-bezel-color, #1a1a1a);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
}
```

Dimensions match common Android tablet portrait (Galaxy Tab S7, Pixel Tablet).

**`FrameSwitcher.tsx`:** four-segment switch — `[Desktop | Tablet H | Tablet V | Phone]`. The pill-highlight math (`offset = activeIndex * 100`) already supports any segment count.

**Saved-size memory:** the `savedDesktopSize` ref logic in `DeviceFrame.tsx` (preserves the user's resized desktop dimensions across switches) is unchanged — only desktop has `resize: both`.

## Form scaling implementation

Same scale formula across both runtimes:

```
scale = innerCanvasWidth / layout.canvasWidth
```

`innerCanvasWidth` is the form's measured container width (after card padding on android, after `.content` on web). Vertical overflow scrolls in the parent.

### Web-ui

`engines/web-ui/src/components/FormRenderer.tsx`: drop the column-flow phone branch (current lines 69–100). Single code path for all viewports — absolute-positioned canvas with `transform: scale()`:

```tsx
const scale = containerWidth / Math.max(contentRight + 16, layout.canvasWidth);
return (
  <div ref={containerRef} className="form-renderer" style={{
    position: 'relative', width: '100%', height: effectiveHeight * scale,
  }}>
    <div className="form-canvas" style={{
      width: effectiveWidth, height: effectiveHeight,
      transform: `scale(${scale})`, transformOrigin: 'top left',
      position: 'absolute', top: 0, left: 0,
    }}>
      {layout.elements.map(...)}
    </div>
  </div>
);
```

`viewportOverride` becomes a four-value union (`phone | tablet-vertical | tablet-horizontal | desktop`); `pickLayout` maps tablet-vertical → "phone" layout; otherwise picks the matching `deviceType`.

### Android

`engines/android-app/.../ui/components/FormRenderer.kt`: wrap the absolute-positioned canvas Box in a density override.

```kotlin
@Composable
fun FormRenderer(...) {
    // ... existing layout pick + minY/totalHeight calc ...
    BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
        val parentDensity = LocalDensity.current
        val innerWidthDp = maxWidth.value                  // dp from constraints
        val scale = innerWidthDp / canvasWidth             // e.g. 411/360 = 1.14
        val newDensity = Density(
            density = parentDensity.density * scale,
            fontScale = parentDensity.fontScale,           // user font-scale preserved
        )
        CompositionLocalProvider(LocalDensity provides newDensity) {
            Box(
                modifier = Modifier
                    .width(canvasWidth.dp)                 // 360.dp at NEW density = innerWidthDp px
                    .height(totalHeight.dp),
            ) {
                elements.forEach { /* unchanged literal x/y/w/h.dp at new density */ }
            }
        }
    }
}
```

**Why density override and not `graphicsLayer`:** density override re-lays out the subtree at the new dp-to-px ratio — text, hit targets, IME insets, and `TextField` cursor positioning all work natively. `graphicsLayer { scaleX/scaleY }` is a visual-only transform and has known issues with IME positioning, text-selection handles, and TalkBack focus rectangles for forms that contain `TextField`.

`fontScale` from system accessibility is preserved (only `density.density` is multiplied), so users with large-text accessibility see proportionally larger text inside the form, as elsewhere.

## Phone orientation lock

Android phones are pinned to portrait at runtime in `MainActivity.onCreate`:

```kotlin
val smallestWidth = resources.configuration.smallestScreenWidthDp
requestedOrientation = if (smallestWidth < 600) {
    ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
} else {
    ActivityInfo.SCREEN_ORIENTATION_FULL_USER
}
```

`smallestScreenWidthDp` is hardware-stable across rotations; one-shot decision at activity creation.

Web-ui has no equivalent — browsers can be any size. Phone-landscape on web degrades to PHONE layout (scale-to-fit-width, vertical scroll), imperfect but not broken.

## Affected files

Web-ui:
- `engines/web-ui/src/components/shell/DeviceFrame.tsx` — `DeviceType` union widened.
- `engines/web-ui/src/components/shell/DeviceFrame.module.css` — add `.frame--tablet-vertical`; rename `.frame--tablet` → `.frame--tablet-horizontal`.
- `engines/web-ui/src/components/shell/FrameSwitcher.tsx` — 4-segment switcher.
- `engines/web-ui/src/components/FormRenderer.tsx` — drop phone column-flow branch, extend `viewportOverride` to 4 values, single scaled-canvas path.
- `engines/web-ui/src/components/StepRenderer.tsx`, `engines/web-ui/src/components/ActiveStepCard.tsx` — propagate the widened `viewportOverride` type through the prop chain.

Android:
- `engines/android-app/.../ui/components/FormLayoutComputation.kt` — replace `isCompact: Boolean` parameter with `ViewportClass` enum (PORTRAIT, TABLET_LS).
- `engines/android-app/.../ui/components/FormRenderer.kt` — `BoxWithConstraints` + `CompositionLocalProvider(LocalDensity provides ...)` wrapper.
- `engines/android-app/.../ui/screens/ActiveScreen.kt` — derive `ViewportClass` from `LocalConfiguration` and pass it down.
- `engines/android-app/.../ui/components/StepRenderer.kt`, `ActiveStepCard.kt` — propagate `ViewportClass` through the prop chain (replace existing `isCompact`).
- `engines/android-app/.../MainActivity.kt` — phone orientation lock.
- `engines/android-app/.../app/src/test/.../FormLayoutComputationTest.kt` — update tests.

## Edge cases

- **Layout missing from export.** Existing fallback chain in `pickLayout` (preferred → "tablet" → "desktop" → first) keeps working unchanged.
- **`canvasWidth` missing in a layout.** Existing default of `800f` (android) / `layout.canvasWidth` falsy (web) stays.
- **Initial measurement: `innerWidthDp == 0`.** `BoxWithConstraints` doesn't compose children until measured; on web the first `ResizeObserver` callback fires with the measured width. No special guard needed.
- **System font-scale (accessibility).** Preserved via `Density(density * scale, fontScale)` — only `density` is multiplied.
- **Element coordinates outside canvas bounds.** Same as Part 1 — vertical overflow scrolls; horizontal overflow is clipped by `width(canvasWidth.dp)`. Editor responsibility to keep elements in bounds.
- **Scale factor extremes.** No clamp. A 360-wide design on a 1600-wide inner canvas produces 4.4× scale; visually large but not broken. Revisit a max-scale clamp if real devices show problems.

## Audit risk

Any composable in the element registry that bypasses `LocalDensity` and reads `Resources.displayMetrics.density` directly will render at the wrong scale. Per Part 1 the registry composables use `.dp` / `.sp` / Compose modifiers exclusively, but each must be spot-checked during implementation. The audit is bounded — about 10 elements in the registry.

## Testing

Unit:
- `FormLayoutComputationTest.kt` — replace `isCompact: Boolean` cases with `ViewportClass` cases: PORTRAIT picks "phone", TABLET_LS picks "tablet", missing-layout fallback chain preserved.
- New web-ui test for `pickLayout` covering the four `viewportOverride` values plus the auto-detect path (portrait/landscape, width threshold).

Manual / device verification:

| Surface | Devices |
|---|---|
| Android phone portrait | Pixel 6 (411×860 dp), Pixel 4 (360×740 dp) |
| Android phone landscape | should not be reachable — verify orientation lock |
| Android tablet portrait | Galaxy Tab S7 / Pixel Tablet (~800×1140 dp) → PHONE layout, ~2.22× scale |
| Android tablet landscape | Galaxy Tab S7 / Pixel Tablet (~1280×720 dp) → TABLET layout, ~0.95× scale |
| Web-ui editor preview | All four DeviceFrames render the right layout at the right scale |
| Web-ui runtime in mobile browser | Chrome on a real phone — auto-detection picks PHONE |

Visual checks per device: a representative form (text input + checkboxes + buttons + image) renders without horizontal overflow, text is legible, hit targets register correctly, IME on android shows over the right field, vertical scroll works for tall forms.
