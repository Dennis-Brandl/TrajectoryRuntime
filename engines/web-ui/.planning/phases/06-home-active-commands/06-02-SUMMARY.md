---
phase: 06-home-active-commands
plan: 02
subsystem: ui
tags: [react, embla-carousel, css-modules, active-screen, carousel, step-card]

# Dependency graph
requires:
  - phase: 05-multi-workflow-data-layer
    provides: WorkflowManager, useManagerSnapshot, useCoordinatorById, CoordinatorSnapshot
  - phase: 06-home-active-commands
    plan: 01
    provides: HomeScreen with workflow loading
provides:
  - ActiveScreen with dual-level Embla Carousel (workflow + step)
  - ActiveStepCard with interactive, disabled, and info card rendering modes
  - DotIndicator component for carousel navigation
affects: [06-03]

# Tech tracking
tech-stack:
  added:
    - embla-carousel-react
  patterns:
    - "Dual-level Embla Carousel: outer workflow swipe + inner step swipe"
    - "Bidirectional sync between Embla selection and manager focusWorkflow"
    - "useRef for Embla callback values to avoid stale closures"
    - "Three rendering modes in ActiveStepCard: interactive/disabled/info"

key-files:
  created:
    - src/components/ActiveStepCard.module.css
  modified:
    - src/components/screens/ActiveScreen.tsx
    - src/components/screens/ActiveScreen.module.css
    - src/components/ActiveStepCard.tsx
    - src/components/WorkflowRunner.tsx

key-decisions:
  - id: 06-02-01
    decision: "ActiveStepCard dispatches on (state, stepType) tuple rather than separate components"
    rationale: "Single component with clear branching is simpler than factory pattern for 4 modes"
  - id: 06-02-02
    decision: "Timestamp tracking via useRef<Map<string, number>> keyed by oid:state"
    rationale: "Captures first-seen time per state without re-renders or external state"

metrics:
  duration: ~3min
  completed: 2026-03-13
---

# Phase 06 Plan 02: Active Screen with Dual Embla Carousel Summary

**Dual Embla Carousel active screen with ActiveStepCard rendering interactive forms, disabled overlays, and info cards**

## What Was Built

### Task 1: ActiveStepCard Component
- Installed `embla-carousel-react` dependency (3 packages added)
- Rewrote `ActiveStepCard` with four rendering modes:
  - **Interactive**: EXECUTING + YES_NO/USER_INTERACTION -> renders StepRenderer with full form interaction
  - **Disabled**: WAITING/PAUSED + interactive types -> StepRenderer wrapped with pointer-events:none, opacity 0.5, status banner
  - **Info card**: HELD/POSTED/RECEIVED/IN_PROGRESS/ABORTED -> calm light blue card with label, state, timestamp
  - **Processing**: EXECUTING + non-interactive types -> info card with "Processing..." text
- Timestamp tracking via `useRef<Map<string, number>>` keyed by `${oid}:${state}`
- Updated WorkflowRunner to use new ActiveStepCard props interface (breaking change from old `info` prop)

### Task 2: ActiveScreen with Dual Carousel
- **Outer carousel**: Workflow-level horizontal swipe using `useEmblaCarousel`
  - Each slide contains one workflow with header showing workflow name
  - Bidirectional sync: Embla select -> `manager.focusWorkflow()`, and focusedId change -> `emblaApi.scrollTo()`
  - useRef pattern for callback values to avoid stale closures
- **Inner carousel**: Step-level swipe per workflow
  - Uses `useCoordinatorById(workflowId)` to get step data
  - Renders ActiveStepCard for each active step
  - Step dot indicators below step carousel
- **DotIndicator**: Shared component rendering 8px circles, active=blue (#2980b9), inactive=gray
- **Empty state**: "No active workflows" centered muted text
- CSS with Embla required styles, container query support, composes for DRY slide patterns

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated WorkflowRunner to match new ActiveStepCard props**
- **Found during:** Task 1
- **Issue:** Existing WorkflowRunner used old `info` prop that no longer exists on ActiveStepCard
- **Fix:** Updated call site to pass `step`, `properties`, `inputParameters`, `mediaMap` props
- **Files modified:** src/components/WorkflowRunner.tsx
- **Commit:** 5daa65b

## Verification

- `npx tsc --noEmit` passes
- `npx vite build` succeeds (508.71 kB bundle)
- ActiveScreen imports and uses useEmblaCarousel from embla-carousel-react
- ActiveStepCard dispatches between interactive, disabled, and info card modes
- Dot indicators render for both workflow and step carousels
- StepRenderer is used for YES_NO and USER_INTERACTION steps
- embla-carousel-react is in package.json dependencies
