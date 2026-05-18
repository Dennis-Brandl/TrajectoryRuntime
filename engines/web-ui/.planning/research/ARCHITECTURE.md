# Architecture Patterns

**Domain:** TrajectoryRuntime Web UI v2.0 rebuild
**Researched:** 2026-03-13
**Confidence:** HIGH (based on thorough reading of existing codebase)

## Executive Summary

The current architecture has a clean separation between engine (pure functions) and UI (coordinator + React context). The v2.0 rebuild introduces three major architectural shifts:

1. **Single-workflow to multi-workflow** -- the coordinator layer must manage N concurrent WorkflowCoordinator instances
2. **Single-screen to multi-screen** -- tab navigation with 5 screens replacing the monolithic WorkflowRunner
3. **CSS viewport classes to device-frame component** -- visual simulation of physical devices wrapping the entire app

The key insight: WorkflowCoordinator is already a self-contained pub/sub store per workflow. Multi-workflow support means introducing a **WorkflowManager** layer above it that owns a Map of coordinators, and a **React context restructure** where the manager is the top-level provider and individual screens select which coordinator(s) they need.

## Current Architecture (What Exists)

```
App.tsx
  +-- WorkflowProvider (single WorkflowCoordinator via React Context)
       +-- WorkflowRunner (monolithic: loader + step rendering + trace)
            +-- WorkflowLoader (file/JSON input)
            +-- StepRenderer (YES_NO, USER_INTERACTION dispatch)
            +-- ActiveStepCard (non-executing state display)
            +-- TraceView (execution history)
            +-- FormRenderer (absolute-positioned form elements)
                 +-- elements/ (registry pattern: 13 element types)
```

### What Works Well (Keep)
- **WorkflowCoordinator** -- clean pub/sub with `subscribe`/`getSnapshot` fitting `useSyncExternalStore` perfectly
- **CoordinatorSnapshot** -- immutable snapshot type with all UI-relevant data
- **Element registry** -- extensible form element components
- **FormRenderer** -- canvas-based layout with responsive scaling and viewport-aware layout selection

### What Must Change
- **WorkflowProvider** creates exactly one coordinator -- needs to become multi-workflow
- **WorkflowRunner** is monolithic -- its concerns must split across 5 screens
- **App.tsx** uses CSS class for viewport -- needs device frame component
- **No routing** -- currently renders one component tree, needs tab navigation

## Recommended Architecture

### Component Hierarchy

```
App.tsx
  +-- DeviceFrame (phone/tablet/desktop visual frame)
       +-- WorkflowManagerProvider (owns Map<id, WorkflowCoordinator>)
            +-- AppShell
                 +-- HeaderBar (workflow name, state badge, commands menu)
                 +-- ScreenRouter (active tab content)
                 |    +-- HomeScreen (list workflows, load new)
                 |    +-- ActiveScreen (active workflow list + step carousel)
                 |    +-- OverviewScreen (graph visualization)
                 |    +-- HistoryScreen (trace/log view)
                 |    +-- SettingsScreen (config)
                 +-- BottomTabBar (5 tabs)
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| **DeviceFrame** | Renders phone/tablet/desktop bezel around content; sets CSS custom properties for content area dimensions | AppShell (wraps it) |
| **WorkflowManagerProvider** | Owns `Map<string, WorkflowCoordinator>`; provides add/remove/select workflow; tracks which workflow is "focused" | All screens via context |
| **AppShell** | Layout shell: header + content + tabs | HeaderBar, ScreenRouter, BottomTabBar |
| **HeaderBar** | Shows focused workflow name + state badge; state commands menu (pause/resume/abandon/restart/repeat) | WorkflowManager (focused coordinator) |
| **BottomTabBar** | 5 tabs; manages active tab state | ScreenRouter (drives which screen renders) |
| **ScreenRouter** | Renders the active screen component | Individual screen components |
| **HomeScreen** | Lists loadable workflows; file/JSON import; starts new workflow | WorkflowManager (creates coordinators) |
| **ActiveScreen** | Lists all active workflows as cards; tapping selects focused; shows step carousel for focused workflow | WorkflowManager (all coordinators) |
| **OverviewScreen** | SVG/Canvas graph thumbnail of focused workflow spec; color-coded step nodes by state | WorkflowManager (focused coordinator snapshot + spec) |
| **HistoryScreen** | Execution trace table + step parameter details for focused workflow | WorkflowManager (focused coordinator snapshot) |
| **SettingsScreen** | Notification prefs, device frame selection, configuration | Local state / localStorage |

### New Components Needed

| Component | Purpose | Complexity |
|-----------|---------|------------|
| `DeviceFrame` | Visual phone/tablet/desktop bezel wrapper | Low |
| `WorkflowManager` (class) | Multi-coordinator container with focused selection | Medium |
| `WorkflowManagerProvider` + `useWorkflowManager` | React context for multi-workflow | Low |
| `AppShell` | Layout with header/content/tabs slots | Low |
| `HeaderBar` | Workflow name + state commands dropdown | Medium |
| `BottomTabBar` | 5-tab navigation | Low |
| `ScreenRouter` | Tab-to-screen dispatch | Low |
| `HomeScreen` | Workflow loading + listing | Medium (reuses WorkflowLoader logic) |
| `ActiveScreen` | Active workflow list + step carousel | Medium (reuses ActiveStepCard + StepRenderer) |
| `OverviewScreen` | Graph visualization of workflow spec | High |
| `HistoryScreen` | Trace + properties view | Low (reuses TraceView logic) |
| `SettingsScreen` | Configuration UI | Low |
| `StateCommandsMenu` | Dropdown with PAUSE/RESUME/ABANDON/RESTART/REPEAT | Medium |
| `WorkflowCard` | Summary card for a workflow (name, state, step count) | Low |

### Components Reused As-Is

| Component | Used In |
|-----------|---------|
| `FormRenderer` | ActiveScreen (step carousel) |
| `elements/*` | ActiveScreen via FormRenderer |
| `registry.ts` + `registerDefaults.ts` | Initialization |

### Components Reused With Modification

| Component | Changes Needed |
|-----------|---------------|
| `StepRenderer` | Extract from WorkflowRunner; props unchanged |
| `ActiveStepCard` | Add tap-to-focus behavior; existing rendering stays |
| `TraceView` | Extract from WorkflowRunner into HistoryScreen; existing rendering stays |
| `WorkflowLoader` | Extract file loading logic; UI may change for HomeScreen context |
| `WorkflowCoordinator` | No changes needed -- already correct abstraction |

## Data Flow

### Current (Single Workflow)

```
User loads file --> WorkflowCoordinator.loadAndStart() --> engine.start()
User interacts  --> WorkflowCoordinator.submitAction()  --> engine.submitAction()
Engine state    --> coordinator.sync()  --> snapshot updated --> listeners notified
React           --> useSyncExternalStore(coordinator.subscribe, coordinator.getSnapshot)
```

### New (Multi Workflow)

```
User loads file --> WorkflowManager.createWorkflow(id, spec, mediaMap, envs)
                    --> new WorkflowCoordinator() --> coordinator.loadAndStart()
                    --> manager.workflows.set(id, coordinator)
                    --> manager.focusedId = id
                    --> manager notifies listeners

Screen reads    --> useWorkflowManager() --> manager.getFocusedCoordinator()
                --> useSyncExternalStore(coordinator.subscribe, coordinator.getSnapshot)

User switches   --> manager.setFocused(otherId) --> manager notifies listeners
                --> screen re-renders with different coordinator

User removes    --> manager.removeWorkflow(id) --> coordinator.reset()
                --> manager.workflows.delete(id) --> manager notifies listeners
```

### Key Design Decision: Two Layers of Subscription

The manager itself needs to be a subscribable store (for the list of workflows and which is focused). Individual coordinators are also subscribable (for workflow state). This means:

```typescript
// Layer 1: Manager-level subscription (workflow list changes)
const manager = useWorkflowManager();
const workflowIds = useSyncExternalStore(manager.subscribe, manager.getWorkflowList);
const focusedId = useSyncExternalStore(manager.subscribe, manager.getFocusedId);

// Layer 2: Coordinator-level subscription (workflow state changes)
const coordinator = manager.getCoordinator(focusedId);
const snapshot = useSyncExternalStore(coordinator.subscribe, coordinator.getSnapshot);
```

This is correct because manager changes (add/remove/focus) are infrequent, while coordinator changes (step transitions) are frequent. Separating them avoids re-rendering the whole app on every step transition.

## WorkflowManager Class Design

```typescript
interface WorkflowEntry {
  id: string;
  coordinator: WorkflowCoordinator;
  spec: MasterWorkflowSpecification;  // retained for overview graph
  name: string;                        // display name
  loadedAt: number;                    // timestamp for ordering
}

class WorkflowManager {
  private workflows = new Map<string, WorkflowEntry>();
  private _focusedId: string | null = null;
  private listeners = new Set<() => void>();

  // Pub/sub (same pattern as WorkflowCoordinator)
  subscribe = (listener: () => void): (() => void) => { ... };
  getSnapshot = (): ManagerSnapshot => { ... };

  // Workflow lifecycle
  createWorkflow(spec, mediaMap?, envs?): string;  // returns generated ID
  removeWorkflow(id: string): void;
  restartWorkflow(id: string): void;

  // Focus management
  setFocused(id: string): void;
  getFocusedEntry(): WorkflowEntry | null;

  // Queries
  getAllEntries(): WorkflowEntry[];
  getCoordinator(id: string): WorkflowCoordinator | null;
}
```

### Why Not Zustand?

The existing project uses zero state management libraries. WorkflowCoordinator already implements the `subscribe`/`getSnapshot` pattern that `useSyncExternalStore` needs. Adding Zustand would introduce a dependency for something the codebase already does well. WorkflowManager follows the same pattern. Keep it consistent and dependency-free.

## DeviceFrame Component Design

The device frame is purely visual -- a CSS-only bezel with fixed dimensions that constrains the inner content area.

```typescript
interface DeviceFrameProps {
  mode: 'phone' | 'tablet' | 'desktop';
  children: ReactNode;
  onChangeMode: (mode: 'phone' | 'tablet' | 'desktop') => void;
}
```

**Implementation approach:**
- Outer div: fixed dimensions per mode (e.g., phone: 430x932, tablet: 820x1180, desktop: 1280x800)
- Border-radius, shadow, and bezel styling to look like a device
- Inner content area: overflow-y auto, full height minus bezel
- Mode switcher lives outside the frame (in the page background)
- Content inside the frame should behave as if it were a real viewport of that size

**Dimensions (CSS pixels, approximate):**
| Mode | Width | Height | Rationale |
|------|-------|--------|-----------|
| phone | 430 | 932 | iPhone 15 Pro Max logical size |
| tablet | 820 | 1180 | iPad Air logical portrait |
| desktop | 1280 | 800 | Common small desktop viewport |

The frame sits centered on the actual browser viewport. Browser viewport can be any size; the frame is the "simulated device."

## Screen Architecture Details

### Tab Navigation (No Router Library)

Since this is a simulated device, not a real multi-page app, use simple state-driven rendering rather than react-router:

```typescript
type TabId = 'home' | 'active' | 'overview' | 'history' | 'settings';

function ScreenRouter({ activeTab }: { activeTab: TabId }) {
  switch (activeTab) {
    case 'home': return <HomeScreen />;
    case 'active': return <ActiveScreen />;
    case 'overview': return <OverviewScreen />;
    case 'history': return <HistoryScreen />;
    case 'settings': return <SettingsScreen />;
  }
}
```

No URL routing needed. The device frame is self-contained. Tab state lives in AppShell.

### Screen-Specific Data Needs

| Screen | Manager Data | Coordinator Data | Spec Data |
|--------|-------------|-----------------|-----------|
| Home | workflow list (names) | - | - |
| Active | all entries | focused snapshot (activeSteps) | - |
| Overview | focused entry | focused snapshot (step states) | focused spec (steps, connections, positions) |
| History | focused entry | focused snapshot (trace, properties, stepParams) | - |
| Settings | - | - | - |

### HeaderBar + State Commands

The header bar is contextual:
- **No focused workflow:** Shows "TrajectoryRuntime" title only
- **Focused workflow:** Shows workflow name + state badge + commands menu

State commands dispatch to the focused coordinator:

| Command | Action | Coordinator Method |
|---------|--------|-------------------|
| PAUSE | Pause all executing steps | `coordinator.submitAction({ step_oid, action: 'pause' })` for each |
| RESUME | Resume all paused steps | `coordinator.submitAction({ step_oid, action: 'resume' })` for each |
| RESTART | Reset and re-run | `coordinator.restart()` |
| ABANDON | Stop workflow permanently | `coordinator.reset()` + `manager.removeWorkflow(id)` |
| REPEAT | Restart (same as restart for now) | `coordinator.restart()` |

Note: PAUSE/RESUME operate on individual steps in the engine. The header-level PAUSE means "pause all executing steps in this workflow." This requires iterating `snapshot.activeSteps` and calling pause for each EXECUTING step.

## Overview Graph Visualization

The overview screen renders the workflow spec's step graph as a visual diagram.

**Data source:** `MasterWorkflowSpecification.steps` (each has `position?: { x: number; y: number }`) and `MasterWorkflowSpecification.connections`.

**Rendering approach:** SVG is the right choice.
- Steps as rounded rectangles at their spec positions
- Connections as lines/curves between steps
- Color-coding by current state (from coordinator snapshot)
- The spec positions are authored in the Trajectory editor, so use them directly

**Color mapping (step state to fill):**
| State | Color | Meaning |
|-------|-------|---------|
| IDLE | #e5e7eb (gray-200) | Not yet reached |
| EXECUTING | #3b82f6 (blue-500) | Currently running |
| COMPLETED | #22c55e (green-500) | Finished |
| PAUSED | #eab308 (yellow-500) | Paused by user |
| WAITING | #f97316 (orange-500) | Blocked on resource |
| ABORTED | #ef4444 (red-500) | Failed/aborted |
| HELD/POSTED/RECEIVED/IN_PROGRESS | #60a5fa (blue-400) | Active sub-states |

**Viewport handling:** The graph has arbitrary dimensions. Use SVG viewBox to fit the entire graph into the overview panel, with optional pinch-to-zoom later.

## Patterns to Follow

### Pattern 1: Pub/Sub Store with useSyncExternalStore

**What:** Every reactive data source implements `subscribe(listener): unsubscribe` and `getSnapshot(): T`, consumed via `useSyncExternalStore`.

**Why:** Already proven in WorkflowCoordinator. Consistent pattern. No extra dependencies. React 19 has first-class support.

**Example:**
```typescript
class WorkflowManager {
  private snapshot: ManagerSnapshot = { ... };
  private listeners = new Set<() => void>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getSnapshot = () => this.snapshot;

  private publish(next: ManagerSnapshot) {
    this.snapshot = next;
    for (const l of this.listeners) l();
  }
}
```

### Pattern 2: Smart Context, Dumb Hooks

**What:** Context provides the store instance. Custom hooks select specific data.

**Why:** Prevents unnecessary re-renders. Each screen only subscribes to what it needs.

```typescript
// Context provides the manager instance (stable reference)
const WorkflowManagerContext = createContext<WorkflowManager | null>(null);

// Hooks select specific slices
function useFocusedSnapshot(): CoordinatorSnapshot | null {
  const manager = useContext(WorkflowManagerContext);
  const entry = useSyncExternalStore(manager.subscribe, manager.getSnapshot);
  const coordinator = entry.focused ? manager.getCoordinator(entry.focusedId) : null;
  if (!coordinator) return null;
  return useSyncExternalStore(coordinator.subscribe, coordinator.getSnapshot);
}
```

### Pattern 3: Composition over Monolith

**What:** Each screen is a standalone component that composes existing building blocks.

**Why:** The current WorkflowRunner is a 142-line monolith. Breaking it into screens makes each screen focused and testable.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Prop-Drilling Coordinator Through Screens

**What:** Passing the focused coordinator as a prop to each screen.
**Why bad:** When focus changes, every screen re-renders. Context + selective hooks are better.
**Instead:** Use the WorkflowManagerContext and per-screen hooks.

### Anti-Pattern 2: Single Global Snapshot for All Workflows

**What:** Merging all coordinator snapshots into one big state object.
**Why bad:** Any step transition in any workflow re-renders everything.
**Instead:** Two-layer subscription: manager for list/focus, coordinator for per-workflow state.

### Anti-Pattern 3: Router Library for In-Frame Navigation

**What:** Using react-router for the 5 tabs inside the device frame.
**Why bad:** The device frame is not a browser viewport. URL routing adds complexity with no benefit. There are no deep links to resolve.
**Instead:** Simple `activeTab` state in AppShell. Switch statement renders the active screen.

### Anti-Pattern 4: Storing Workflow Spec Separately from Coordinator

**What:** Having the spec in one place and the coordinator in another.
**Why bad:** They must stay paired. If you remove a workflow, both must go.
**Instead:** WorkflowEntry bundles coordinator + spec + metadata.

## Suggested Build Order

Based on dependency analysis, the recommended build order is:

### Phase 1: Shell + Frame (Foundation)

Build the structural skeleton that all screens render inside.

1. **DeviceFrame** -- visual bezel component
2. **AppShell** -- header + content + tabs layout
3. **BottomTabBar** -- tab navigation with state
4. **ScreenRouter** -- tab-to-screen dispatch (placeholder screens)
5. **HeaderBar** -- static title bar (no commands yet)

**Rationale:** Everything else renders inside this shell. Build it first, verify layout works at all three device sizes.

**Depends on:** Nothing new. Pure presentational.

### Phase 2: Multi-Workflow Layer

Replace single WorkflowProvider with WorkflowManager.

1. **WorkflowManager** class (pub/sub, Map<id, WorkflowEntry>)
2. **WorkflowManagerProvider** + context
3. **useWorkflowManager** hooks (useFocusedSnapshot, useWorkflowList, etc.)

**Rationale:** All screens need multi-workflow support. Build the data layer before the screens.

**Depends on:** WorkflowCoordinator (existing, unchanged).

### Phase 3: Home + Active Screens

The two screens that create and interact with workflows.

1. **HomeScreen** -- workflow loading (reuse WorkflowLoader logic, adapt for manager)
2. **WorkflowCard** -- summary card component
3. **ActiveScreen** -- active workflow list + step carousel (reuse StepRenderer, ActiveStepCard, FormRenderer)
4. **State commands menu** on HeaderBar

**Rationale:** These are the primary interaction screens. Home creates workflows, Active runs them. Together they prove the multi-workflow architecture works end-to-end.

**Depends on:** Phase 1 (shell), Phase 2 (manager).

### Phase 4: History + Overview Screens

The two secondary screens.

1. **HistoryScreen** -- execution trace (reuse TraceView logic)
2. **OverviewScreen** -- SVG graph visualization (new, most complex component)

**Rationale:** These are read-only views. They can be built after the core interaction loop works. Overview is the highest-complexity new component and benefits from being built last when the data flow is proven.

**Depends on:** Phase 2 (manager for focused workflow data), Phase 3 (needs active workflows to have data to display).

### Phase 5: Settings + Polish

1. **SettingsScreen** -- configuration UI
2. **CSS styling** -- final visual polish for all screens
3. **Device frame polish** -- bezel details, shadows, notch simulation

**Rationale:** Settings is low priority. Visual polish should happen after all functionality works.

**Depends on:** Everything else.

## Integration Points with Existing Components

| Existing Component | Integration Point | Changes Required |
|--------------------|--------------------|-----------------|
| `WorkflowCoordinator` | WorkflowManager wraps N instances | None |
| `CoordinatorSnapshot` | Used by all screen hooks | None |
| `WorkflowLoader` | HomeScreen reuses loading logic | Extract `handleFile`/`parseJson` into utility; UI changes |
| `StepRenderer` | ActiveScreen renders executing steps | None |
| `FormRenderer` | ActiveScreen renders form layouts | None |
| `ActiveStepCard` | ActiveScreen renders non-executing steps | Minor: add onTap for focus selection |
| `TraceView` | HistoryScreen renders trace | None (or minor refactor for styling) |
| `elements/*` | ActiveScreen via FormRenderer | None |
| `registry.ts` | App initialization | None |
| Engine types | All components via coordinator snapshot | None |

## File Structure (Recommended)

```
src/
  main.tsx                          -- entry point
  App.tsx                           -- DeviceFrame + providers
  manager/
    WorkflowManager.ts              -- multi-workflow store
    WorkflowManagerContext.tsx       -- React context + provider
    useWorkflowManager.ts           -- hooks
  shell/
    AppShell.tsx                     -- layout shell
    HeaderBar.tsx                    -- top bar with commands
    BottomTabBar.tsx                 -- 5-tab navigation
    ScreenRouter.tsx                 -- tab dispatch
    StateCommandsMenu.tsx            -- dropdown menu
  screens/
    HomeScreen.tsx                   -- workflow loading
    ActiveScreen.tsx                 -- active workflow interaction
    OverviewScreen.tsx               -- graph visualization
    HistoryScreen.tsx                -- execution trace
    SettingsScreen.tsx               -- configuration
  components/
    DeviceFrame.tsx                  -- device bezel wrapper
    WorkflowCard.tsx                 -- workflow summary card
    StepRenderer.tsx                 -- (moved from current)
    ActiveStepCard.tsx               -- (moved from current)
    TraceView.tsx                    -- (moved from current)
    FormRenderer.tsx                 -- (moved from current)
    WorkflowLoader.tsx               -- (moved, adapted for HomeScreen)
    elements/                        -- (unchanged)
  coordinator/
    WorkflowCoordinator.ts           -- (unchanged)
  utils/
    richText.ts                      -- (unchanged)
  styles/
    (CSS files per component or single stylesheet)
```

## Sources

- Direct codebase analysis of all files in `C:/TrajectoryRuntime/engines/web-ui/src/`
- Engine types from `C:/TrajectoryRuntime/engines/web/src/types.ts`
- Engine API from `C:/TrajectoryRuntime/engines/web/src/engine.ts`
- Project specification from `.planning/PROJECT.md`
- React 19 `useSyncExternalStore` is a stable API (HIGH confidence, verified in existing codebase usage)
