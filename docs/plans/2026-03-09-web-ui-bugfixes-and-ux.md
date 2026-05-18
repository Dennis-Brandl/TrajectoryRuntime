# Web-UI Bugfixes & UX Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 10 reported issues in the web-ui: engine bugs (output params, routing), UI gaps (timer controls, Yes/No rendering, WAIT ALL visibility), UX improvements (step carousel, viewport selector, image loading, responsive layout), and a child workflow click bug.

**Architecture:** Pure-function engine changes for bugs 3/9. React component changes for UI/UX. Coordinator stores extracted media blobs. FormRenderer gains viewport override. WorkflowRunner gets step carousel with swipe navigation.

**Tech Stack:** TypeScript, React 19, Vite, CSS (no additional dependencies — use native touch events for swipe)

---

## Issue Analysis & Root Causes

| # | Issue | Root Cause | Fix Location |
|---|-------|-----------|--------------|
| 1 | Timer has no controls | TimerElement only renders display, no stop/reset/continue | `web-ui/src/components/elements/TimerElement.tsx` |
| 2 | Yes/No step renders empty | YesNoRenderer ignores `form_layout_config`, only shows 2 bare buttons | `web-ui/src/components/StepRenderer.tsx` |
| 3 | Output params not captured for button_press | `handleUserAction` only calls `captureFormOutputs` on `submit`, not `button_press` | `web/src/step-handlers.ts:114-118` |
| 4 | Shows all active steps at once | WorkflowRunner maps all `executingSteps` vertically | `web-ui/src/components/WorkflowRunner.tsx:50-62` |
| 5 | No viewport selection on startup | FormRenderer auto-detects from container width, no user override | `web-ui/src/components/FormRenderer.tsx`, `WorkflowLoader.tsx` |
| 6 | Images show empty boxes | `ImageElement` uses `el.src` directly; archive images are relative paths, not URLs | `web-ui/src/components/WorkflowLoader.tsx`, `ImageElement.tsx` |
| 7 | Too much empty space in layouts | Canvas scaling preserves original canvas dimensions; no collapsing | `web-ui/src/components/FormRenderer.tsx` |
| 8 | WAIT ALL steps visible in UI | Engine `getExecutingSteps` includes WAIT ALL in EXECUTING state | `web/src/engine.ts:156-168` |
| 9 | YES_NO activates both connections | `getRoutedConnections` falls back to ALL connections when no condition match (line 446) | `web/src/engine.ts:439-446` |
| 10 | Can't click Continue in child workflow | Checkbox fieldset has no constrained height, overflows into button below | `web-ui/src/App.css`, `CheckboxElement.tsx` |

---

## Task 1: Fix output parameter capture for button_press (Issue 3)

**Files:**
- Modify: `engines/web/src/step-handlers.ts:102-130`
- Test: `engines/web/src/step-handlers.test.ts` (create)

**Step 1: Write the failing test**

Create `engines/web/src/step-handlers.test.ts`:

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { handleUserAction } from './step-handlers.js';
import { PropertyStore } from './properties.js';
import type { MasterWorkflowStep, UserAction } from './types.js';

describe('handleUserAction', () => {
  it('captures form outputs on button_press for USER_INTERACTION', () => {
    const step: MasterWorkflowStep = {
      oid: 's1',
      step_type: 'USER_INTERACTION',
      description: 'Test',
      form_layout_config: [{
        deviceType: 'phone',
        canvasWidth: 390,
        canvasHeight: 844,
        elements: [
          {
            type: 'textInput',
            x: 0, y: 0, width: 300, height: 40,
            fieldName: 'name',
            label: 'Name',
            outputParameter: 'Response.Name',
          },
          {
            type: 'button',
            x: 0, y: 60, width: 300, height: 40,
            label: 'Continue',
            outputValue: 'continue',
          },
        ],
      }],
    } as unknown as MasterWorkflowStep;

    const store = new PropertyStore();
    const action: UserAction = {
      step_oid: 's1',
      action: 'button_press',
      button_output: 'continue',
      form_values: { name: 'Alice' },
    };

    handleUserAction(step, action, store);
    assert.equal(store.get('Response.Name'), 'Alice');
  });

  it('captures form outputs on YES_NO with output_parameter_specifications', () => {
    const step: MasterWorkflowStep = {
      oid: 's1',
      step_type: 'YES_NO',
      description: 'Confirm?',
      yes_no_config: {
        yes_label: 'Yes', no_label: 'No',
        yes_value: 'true', no_value: 'false',
      },
      output_parameter_specifications: [
        { id: 'answer', target: 'Response.Answer' },
      ],
    } as unknown as MasterWorkflowStep;

    const store = new PropertyStore();
    const action: UserAction = {
      step_oid: 's1',
      action: 'button_press',
      button_output: 'true',
    };

    handleUserAction(step, action, store);
    assert.equal(store.get('Response.Answer'), 'true');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd engines/web && npm run build && node --test dist/step-handlers.test.js`
Expected: FAIL — `store.get('Response.Name')` returns undefined

**Step 3: Fix handleUserAction to capture form outputs on button_press**

In `engines/web/src/step-handlers.ts`, modify `handleUserAction`:

```typescript
export function handleUserAction(
  step: MasterWorkflowStep,
  action: UserAction,
  propertyStore: PropertyStore,
): RoutingResult {
  const stepType = step.step_type;

  if (stepType === 'YES_NO') {
    // Capture button output to output_parameter_specifications target
    if (action.button_output && step.output_parameter_specifications) {
      for (const spec of step.output_parameter_specifications) {
        if (spec.target) {
          propertyStore.set(spec.target, action.button_output);
        }
      }
    }
    return { conditionValue: action.button_output };
  }

  if (stepType === 'USER_INTERACTION') {
    // Always capture form outputs when form_values are present
    if (action.form_values) {
      const elements = getFormElements(step);
      propertyStore.captureFormOutputs(elements, action.form_values);
    }

    if (action.action === 'button_press') {
      return { conditionValue: action.button_output };
    }

    return {};
  }

  return {};
}
```

**Step 4: Run test to verify it passes**

Run: `cd engines/web && npm run build && node --test dist/step-handlers.test.js`
Expected: PASS

**Step 5: Run full conformance suite**

Run: `cd engines/web && npm run conformance`
Expected: All existing tests still pass

**Step 6: Commit**

```bash
git add engines/web/src/step-handlers.ts engines/web/src/step-handlers.test.ts
git commit -m "fix: capture form outputs on button_press and YES_NO output params"
```

---

## Task 2: Fix YES_NO routing fallback activating all connections (Issue 9)

**Files:**
- Modify: `engines/web/src/engine.ts:428-450`

**Step 1: Analyze the bug**

In `getRoutedConnections`, line 446: `return matched.length > 0 ? matched : all` — when no condition matches the button output, ALL outgoing connections fire. This causes both Yes and No branches to activate.

The fix: when a routing conditionValue is set (meaning the user explicitly chose a path), never fall back to all connections. Return empty array or throw.

**Step 2: Fix getRoutedConnections**

In `engines/web/src/engine.ts`, replace the condition matching block:

```typescript
  if (routing.conditionValue) {
    const val = routing.conditionValue;
    const matched = all.filter(c =>
      c.condition === val ||
      c.condition?.toLowerCase() === val.toLowerCase(),
    );
    // When routing by condition, only fire matched connections.
    // Do NOT fall back to all — that would activate both branches.
    return matched;
  }
```

**Step 3: Run conformance suite**

Run: `cd engines/web && npm run build && npm run conformance`
Expected: All tests pass (fixtures already have correct condition values)

**Step 4: Commit**

```bash
git add engines/web/src/engine.ts
git commit -m "fix: YES_NO routing no longer falls back to all connections on mismatch"
```

---

## Task 3: Filter WAIT ALL steps from UI (Issue 8)

**Files:**
- Modify: `engines/web/src/engine.ts:156-168`

**Step 1: Filter WAIT ALL from getExecutingSteps**

The WAIT ALL step enters EXECUTING state while waiting for branches. It should not appear in the UI. Add filter:

```typescript
getExecutingSteps(): StepInstance[] {
  const result: StepInstance[] = [];
  for (const step of this.steps.values()) {
    if (step.state === 'EXECUTING'
      && !this.activeChildEngines.has(step.oid)
      && step.stepType !== 'WAIT ALL') {
      result.push(step);
    }
  }
  for (const childEngine of this.activeChildEngines.values()) {
    result.push(...childEngine.getExecutingSteps());
  }
  return result;
}
```

**Step 2: Run conformance suite**

Run: `cd engines/web && npm run build && npm run conformance`
Expected: All pass (this only affects the UI-facing query, not engine state)

**Step 3: Commit**

```bash
git add engines/web/src/engine.ts
git commit -m "fix: hide WAIT ALL steps from executing steps UI query"
```

---

## Task 4: Add timer controls — stop, reset, continue (Issue 1)

**Files:**
- Modify: `engines/web-ui/src/components/elements/TimerElement.tsx`
- Modify: `engines/web-ui/src/App.css`

**Step 1: Rewrite TimerElement with controls**

```typescript
import { useEffect, useRef, useState, useCallback } from 'react';
import type { ElementProps } from './registry';
import type { FormElementTimer } from '@engine/types.js';

export function TimerElement({ element, onFormChange }: ElementProps) {
  const el = element as FormElementTimer;
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const startTimeRef = useRef(Date.now());
  const pausedElapsedRef = useRef(0);

  const stopTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = undefined;
    }
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    startTimeRef.current = Date.now();
    intervalRef.current = setInterval(() => {
      const secs = pausedElapsedRef.current + Math.floor((Date.now() - startTimeRef.current) / 1000);
      setElapsed(secs);
      const display = el.direction === 'countdown'
        ? Math.max(0, el.durationSeconds - secs)
        : secs;
      onFormChange(el.fieldName, String(display));
    }, 1000);
  }, [el.fieldName, el.durationSeconds, el.direction, onFormChange, stopTimer]);

  useEffect(() => {
    startTimer();
    return stopTimer;
  }, [startTimer, stopTimer]);

  const handleStop = () => {
    pausedElapsedRef.current = elapsed;
    stopTimer();
    setRunning(false);
  };

  const handleContinue = () => {
    startTimeRef.current = Date.now();
    startTimer();
    setRunning(true);
  };

  const handleReset = () => {
    pausedElapsedRef.current = 0;
    setElapsed(0);
    startTimeRef.current = Date.now();
    const resetDisplay = el.direction === 'countdown' ? el.durationSeconds : 0;
    onFormChange(el.fieldName, String(resetDisplay));
    if (!running) {
      stopTimer();
    } else {
      startTimer();
    }
  };

  const display = el.direction === 'countdown'
    ? Math.max(0, el.durationSeconds - elapsed)
    : elapsed;
  const mins = Math.floor(display / 60);
  const secs = display % 60;

  return (
    <div className="el-timer">
      <div className="el-timer-display">
        <span className="el-timer-label">{el.label}</span>
        <span className="el-timer-value">
          {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
        </span>
      </div>
      <div className="el-timer-controls">
        {running ? (
          <button type="button" className="btn-timer" onClick={handleStop}>Stop</button>
        ) : (
          <button type="button" className="btn-timer" onClick={handleContinue}>Continue</button>
        )}
        <button type="button" className="btn-timer" onClick={handleReset}>Reset</button>
      </div>
    </div>
  );
}
```

**Step 2: Add timer control styles to App.css**

Append to the timer section in `App.css`:

```css
.el-timer { display: flex; flex-direction: column; gap: 0.375rem; }
.el-timer-display { display: flex; align-items: center; gap: 0.5rem; }
.el-timer-controls { display: flex; gap: 0.375rem; }
.btn-timer {
  padding: 0.25rem 0.625rem; border: 1px solid #d1d5db; border-radius: 4px;
  background: #fff; cursor: pointer; font-size: 0.75rem; font-weight: 500;
}
.btn-timer:hover { background: #f3f4f6; }
```

**Step 3: Manual test**

Load a fixture with a timer element. Verify Stop pauses, Continue resumes, Reset goes to 0.

**Step 4: Commit**

```bash
git add engines/web-ui/src/components/elements/TimerElement.tsx engines/web-ui/src/App.css
git commit -m "feat: add stop, reset, continue controls to timer element"
```

---

## Task 5: Render Yes/No steps with form layout UI (Issue 2)

**Files:**
- Modify: `engines/web-ui/src/components/StepRenderer.tsx:28-48`

**Step 1: Enhance YesNoRenderer to use FormRenderer when form_layout_config exists**

The YES_NO step should render like USER_INTERACTION when it has a `form_layout_config`. When it doesn't, fall back to the current simple 2-button layout.

Replace `YesNoRenderer`:

```typescript
function YesNoRenderer({
  step,
  onAction,
  properties,
  inputParameters,
}: {
  step: StepInstance;
  onAction: (a: UserAction) => void;
  properties: Record<string, string>;
  inputParameters: Record<string, string>;
}) {
  const config = step.step.yes_no_config;
  const yesLabel = config?.yes_label ?? 'Yes';
  const noLabel = config?.no_label ?? 'No';
  const yesValue = config?.yes_value ?? 'yes';
  const noValue = config?.no_value ?? 'no';

  const initialValues = useMemo(
    () => computeInitialFormValues(step, properties, inputParameters),
    [step.oid],
  );
  const [formValues, setFormValues] = useState<Record<string, unknown>>(initialValues);

  const onFormChange = useCallback((fieldName: string, value: unknown) => {
    setFormValues((prev) => ({ ...prev, [fieldName]: value }));
  }, []);

  const press = (value: string) => {
    onAction({ step_oid: step.oid, action: 'button_press', button_output: value, form_values: formValues });
  };

  const layouts = step.step.form_layout_config;
  if (layouts && Array.isArray(layouts) && layouts.length > 0) {
    // Render form layout with yes/no buttons below
    return (
      <div className="step-yesno">
        <FormRenderer
          layouts={layouts as FormLayoutExportEntry[]}
          formValues={formValues}
          onFormChange={onFormChange}
          onButtonPress={(v) => press(v)}
          properties={properties}
          inputParameters={inputParameters}
        />
        <div className="step-yesno-buttons">
          <button className="btn btn-yes" onClick={() => press(yesValue)}>{yesLabel}</button>
          <button className="btn btn-no" onClick={() => press(noValue)}>{noLabel}</button>
        </div>
      </div>
    );
  }

  // Simple layout — no form
  return (
    <div className="step-yesno">
      <h3>{step.step.description ?? 'Yes / No'}</h3>
      <div className="step-yesno-buttons">
        <button className="btn btn-yes" onClick={() => press(yesValue)}>{yesLabel}</button>
        <button className="btn btn-no" onClick={() => press(noValue)}>{noLabel}</button>
      </div>
    </div>
  );
}
```

Update the `StepRenderer` dispatch to pass all props to `YesNoRenderer`:

```typescript
export function StepRenderer({ step, onAction, properties, inputParameters }: StepRendererProps) {
  if (step.stepType === 'YES_NO') {
    return <YesNoRenderer step={step} onAction={onAction} properties={properties} inputParameters={inputParameters} />;
  }
  // ... rest unchanged
}
```

Add `FormLayoutExportEntry` to the imports from `@engine/types.js`.

**Step 2: Manual test**

Load a YES_NO fixture. Verify it shows form content (if any) plus Yes/No buttons.

**Step 3: Commit**

```bash
git add engines/web-ui/src/components/StepRenderer.tsx
git commit -m "feat: render YES_NO steps with form layout when available"
```

---

## Task 6: Step carousel with swipe navigation (Issue 4)

**Files:**
- Modify: `engines/web-ui/src/components/WorkflowRunner.tsx`
- Modify: `engines/web-ui/src/App.css`

**Step 1: Add carousel state and swipe handling**

Replace the active steps section in WorkflowRunner:

```typescript
import { useState, useCallback, useRef, useEffect } from 'react';
// ... existing imports ...

export function WorkflowRunner() {
  // ... existing hooks ...
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartX = useRef(0);

  // Reset index when steps change
  useEffect(() => {
    if (activeIndex >= executingSteps.length) {
      setActiveIndex(Math.max(0, executingSteps.length - 1));
    }
  }, [executingSteps.length, activeIndex]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 50) {
      if (dx < 0 && activeIndex < executingSteps.length - 1) {
        setActiveIndex(i => i + 1);
      } else if (dx > 0 && activeIndex > 0) {
        setActiveIndex(i => i - 1);
      }
    }
  }, [activeIndex, executingSteps.length]);

  // ... in JSX, replace the executingSteps.map block:
  {executingSteps.length > 0 && (
    <section className="runner-steps">
      <div className="step-carousel-header">
        <h3>Active Steps</h3>
        {executingSteps.length > 1 && (
          <div className="step-carousel-nav">
            <button
              className="btn-carousel"
              onClick={() => setActiveIndex(i => Math.max(0, i - 1))}
              disabled={activeIndex === 0}
            >&larr;</button>
            <span className="step-carousel-count">
              {activeIndex + 1} / {executingSteps.length}
            </span>
            <button
              className="btn-carousel"
              onClick={() => setActiveIndex(i => Math.min(executingSteps.length - 1, i + 1))}
              disabled={activeIndex >= executingSteps.length - 1}
            >&rarr;</button>
          </div>
        )}
      </div>
      <div
        className="step-carousel"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {(() => {
          const step = executingSteps[activeIndex];
          if (!step) return null;
          return (
            <div key={step.oid} className="runner-step-card">
              <div className="step-card-header">
                <span className="step-type">{step.stepType}</span>
                <span className="step-oid">{step.oid}</span>
              </div>
              <StepRenderer step={step} onAction={handleAction} properties={properties} inputParameters={inputParameters} />
            </div>
          );
        })()}
      </div>
    </section>
  )}
```

**Step 2: Add carousel styles**

```css
.step-carousel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
.step-carousel-nav { display: flex; align-items: center; gap: 0.5rem; }
.step-carousel-count { font-size: 0.8125rem; color: #6b7280; }
.btn-carousel {
  padding: 0.25rem 0.5rem; border: 1px solid #d1d5db; border-radius: 4px;
  background: #fff; cursor: pointer; font-size: 0.875rem;
}
.btn-carousel:hover { background: #f3f4f6; }
.btn-carousel:disabled { opacity: 0.4; cursor: default; }
```

**Step 3: Manual test**

Load a parallel workflow fixture. Verify only one step shows at a time, arrows navigate, swipe works.

**Step 4: Commit**

```bash
git add engines/web-ui/src/components/WorkflowRunner.tsx engines/web-ui/src/App.css
git commit -m "feat: step carousel with swipe and arrow navigation"
```

---

## Task 7: Viewport selection on startup (Issue 5)

**Files:**
- Modify: `engines/web-ui/src/App.tsx`
- Modify: `engines/web-ui/src/components/FormRenderer.tsx`
- Modify: `engines/web-ui/src/App.css`

**Step 1: Add viewport context**

Add viewport state to App.tsx with a selector shown before WorkflowRunner:

```typescript
// In App.tsx, add state:
const [viewport, setViewport] = useState<'phone' | 'tablet' | 'desktop' | null>(null);

// Before WorkflowRunner, show selector if null:
{viewport === null ? (
  <div className="viewport-selector">
    <h2>Select View Mode</h2>
    <div className="viewport-options">
      <button className="btn viewport-btn" onClick={() => setViewport('phone')}>Phone</button>
      <button className="btn viewport-btn" onClick={() => setViewport('tablet')}>Tablet</button>
      <button className="btn viewport-btn" onClick={() => setViewport('desktop')}>Desktop</button>
    </div>
  </div>
) : (
  <WorkflowRunner viewportOverride={viewport} />
)}
```

**Step 2: Thread viewport override through to FormRenderer**

In `FormRenderer.tsx`, accept optional `viewportOverride` prop. When set, override the `pickLayout` logic to always select that device type:

```typescript
interface FormRendererProps {
  layouts: FormLayoutExportEntry[];
  formValues: Record<string, unknown>;
  onFormChange: (fieldName: string, value: unknown) => void;
  onButtonPress: (outputValue: string) => void;
  properties: Record<string, string>;
  inputParameters: Record<string, string>;
  viewportOverride?: 'phone' | 'tablet' | 'desktop';
}

// In pickLayout, add override parameter:
function pickLayout(
  layouts: FormLayoutExportEntry[],
  containerWidth: number,
  viewportOverride?: 'phone' | 'tablet' | 'desktop',
): FormLayoutExportEntry {
  if (viewportOverride) {
    const match = layouts.find((l) => l.deviceType === viewportOverride);
    if (match) return match;
  }
  // Fall back to width-based detection
  for (const bp of BREAKPOINTS) {
    if (containerWidth >= bp.minWidth) {
      const match = layouts.find((l) => l.deviceType === bp.type);
      if (match) return match;
    }
  }
  return layouts[0];
}
```

Thread `viewportOverride` through WorkflowRunner → StepRenderer → FormRenderer.

**Step 3: Constrain app container width based on viewport**

```css
.viewport-selector { text-align: center; padding: 3rem 1rem; }
.viewport-selector h2 { margin-bottom: 1.5rem; }
.viewport-options { display: flex; gap: 1rem; justify-content: center; }
.viewport-btn { padding: 1rem 2rem; font-size: 1rem; }

.app.viewport-phone { max-width: 430px; }
.app.viewport-tablet { max-width: 768px; }
.app.viewport-desktop { max-width: 1200px; }
```

**Step 4: Manual test**

Reload the app. Verify viewport selector appears. Each choice constrains the layout width and selects the right form layout breakpoint.

**Step 5: Commit**

```bash
git add engines/web-ui/src/App.tsx engines/web-ui/src/components/FormRenderer.tsx engines/web-ui/src/components/WorkflowRunner.tsx engines/web-ui/src/components/StepRenderer.tsx engines/web-ui/src/App.css
git commit -m "feat: viewport selection (phone/tablet/desktop) on startup"
```

---

## Task 8: Extract and display images from WFmasterX archives (Issue 6)

**Files:**
- Modify: `engines/web-ui/src/components/WorkflowLoader.tsx`
- Modify: `engines/web-ui/src/coordinator/WorkflowCoordinator.ts`
- Modify: `engines/web-ui/src/components/elements/ImageElement.tsx`
- Modify: `engines/web-ui/src/components/elements/VideoElement.tsx`

**Step 1: Extract media files from ZIP and create blob URL map**

In `WorkflowLoader.tsx`, when loading a `.WFmasterX` file, iterate all non-JSON files in the archive, create blob URLs, and pass them alongside the workflow:

```typescript
// In handleFile, after extracting the .WFmaster JSON from ZIP:
const mediaMap: Record<string, string> = {};
for (const [name, file] of Object.entries(zip.files)) {
  if (name.endsWith('.WFmaster') || file.dir) continue;
  const blob = await file.async('blob');
  mediaMap[name] = URL.createObjectURL(blob);
}
// Pass mediaMap to coordinator
```

**Step 2: Store media map in coordinator**

Add `mediaMap` field to `WorkflowCoordinator` and `CoordinatorSnapshot`:

```typescript
// In CoordinatorSnapshot:
mediaMap: Record<string, string>;

// In loadAndStart:
loadAndStart(workflow, setup, mediaMap?)
```

**Step 3: Resolve image src against media map in ImageElement**

```typescript
export function ImageElement({ element, properties }: ElementProps) {
  const el = element as FormElementImage;
  const mediaMap = properties.__mediaMap ? JSON.parse(properties.__mediaMap) : {};
  // Or better: thread mediaMap as a separate prop through FormRenderer

  // Simpler approach: resolve src at the FormRenderer level before passing to element
  const resolvedSrc = mediaMap[el.src] ?? el.src;
  return <img className="el-image" src={resolvedSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />;
}
```

**Better approach:** Thread `mediaMap` through the component tree as a new prop on FormRenderer → FormElementSlot → element components. Add `mediaMap` to `ElementProps`.

**Step 4: Manual test**

Load a `.WFmasterX` file containing images. Verify images render as blob URLs.

**Step 5: Commit**

```bash
git add engines/web-ui/src/components/WorkflowLoader.tsx engines/web-ui/src/coordinator/WorkflowCoordinator.ts engines/web-ui/src/coordinator/useWorkflow.ts engines/web-ui/src/components/FormRenderer.tsx engines/web-ui/src/components/elements/registry.ts engines/web-ui/src/components/elements/ImageElement.tsx engines/web-ui/src/components/elements/VideoElement.tsx
git commit -m "feat: extract and display images from WFmasterX archives"
```

---

## Task 9: Collapse form layouts to fit screen (Issue 7)

**Files:**
- Modify: `engines/web-ui/src/components/FormRenderer.tsx`

**Step 1: Auto-collapse canvas height to content bounds**

Instead of using the full `canvasHeight` from the spec, compute the actual content bounding box and use that:

```typescript
// After selecting layout, compute content bounds:
const contentBottom = layout.elements.reduce((max, el) => {
  return Math.max(max, el.y + el.height);
}, 0);
const contentRight = layout.elements.reduce((max, el) => {
  return Math.max(max, el.x + el.width);
}, 0);

// Use content bounds + small padding instead of canvasHeight
const effectiveHeight = contentBottom + 16; // 16px padding
const effectiveWidth = Math.max(contentRight + 16, layout.canvasWidth);

// Scale uses effective dimensions:
const scale = containerWidth / effectiveWidth;
```

Update the canvas div and spacer to use `effectiveHeight` instead of `layout.canvasHeight`.

**Step 2: Manual test**

Load a workflow. Verify form areas fit snugly without large empty areas below content.

**Step 3: Commit**

```bash
git add engines/web-ui/src/components/FormRenderer.tsx
git commit -m "feat: collapse form canvas to content bounds, reduce empty space"
```

---

## Task 10: Fix child workflow Continue button click (Issue 10)

**Files:**
- Modify: `engines/web-ui/src/App.css`
- Modify: `engines/web-ui/src/components/elements/CheckboxElement.tsx`

**Step 1: Diagnose the overlap**

The checkbox `<fieldset>` uses `flex-direction: column` and expands to fill its absolutely-positioned slot. If the slot overlaps with the button slot below (due to canvas z-index stacking), the fieldset captures clicks meant for the button.

**Step 2: Fix by constraining overflow and ensuring pointer-events**

```css
/* Ensure form element slots don't capture clicks outside their visual bounds */
.form-element-slot { overflow: visible; pointer-events: none; }
.form-element-slot > * { pointer-events: auto; }
```

Also add `overflow: hidden` on checkbox/radio fieldsets to prevent content overflow:

```css
.el-checkbox, .el-radio {
  border: none; display: flex; flex-direction: column; gap: 0.25rem;
  max-height: 100%; overflow-y: auto;
}
```

**Step 3: Manual test**

Load a child workflow fixture with checkbox above Continue button. Verify Continue is clickable.

**Step 4: Commit**

```bash
git add engines/web-ui/src/App.css
git commit -m "fix: prevent form element slot overflow from blocking sibling clicks"
```

---

## Execution Order & Dependencies

```
Task 1 (output params)     ──┐
Task 2 (routing fallback)  ──┼── Engine fixes (independent, do first)
Task 3 (WAIT ALL filter)   ──┘
Task 4 (timer controls)    ──── Independent
Task 5 (YES_NO rendering)  ──── Depends on Task 1 (uses form_values in button_press)
Task 6 (step carousel)     ──── Independent
Task 7 (viewport selector) ──── Independent (but do before Task 9)
Task 8 (image extraction)  ──── Independent
Task 9 (layout collapse)   ──── Pairs well with Task 7
Task 10 (click fix)        ──── Independent
```

**Recommended waves:**
- **Wave 1 (engine):** Tasks 1, 2, 3 (parallel)
- **Wave 2 (UI core):** Tasks 4, 5, 6, 10 (parallel)
- **Wave 3 (UX):** Tasks 7, 8, 9 (parallel, but 9 after 7 if touching same file)
