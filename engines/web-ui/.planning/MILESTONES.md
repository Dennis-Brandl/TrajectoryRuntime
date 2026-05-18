# Milestones: TrajectoryRuntime Web UI

## v1.0 — Core Engine + App Scaffold + UI Screens

**Completed:** 2026-03-13
**Phases:** 1-3 (managed outside GSD)

### What shipped:
- Phase 1: Pure-function workflow engine — 119 tests, 38/38 must-haves
- Phase 2: Expo app scaffold — file-based routing, Zustand/MMKV (later replaced with Context + useSyncExternalStore)
- Phase 3: UI screens — active step carousel, pause/resume, form elements, viewport switching

### Key decisions:
- State overlay pattern (immutable spec + mutable state)
- React Context + useSyncExternalStore over Zustand
- Element registry pattern for form components
- WorkflowCoordinator as engine wrapper

### Lessons learned:
- react-dom version must match react exactly
- queueMicrotask needed for synchronous localStorage rehydration
- Custom Metro transformer for import.meta.env → process.env
