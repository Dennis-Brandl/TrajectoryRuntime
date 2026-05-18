# Feature Landscape

**Domain:** Web UI for workflow runtime with device simulation and mobile-style navigation
**Researched:** 2026-03-13
**Confidence:** MEDIUM-HIGH (patterns well-established, verified against multiple sources)

## Table Stakes

Features users expect. Missing = product feels incomplete or broken.

### Device Frame Simulation

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|-------------|------------|--------------|-------|
| Phone frame with rounded bezel border | Users selecting "phone view" expect a visual phone shape, not just a narrow column | Low | Existing `viewport-phone` CSS class | Pure CSS: `border-radius: 2.5rem`, `border: 14-16px solid #1a1a1a`, `box-shadow` for depth. No library needed. |
| Tablet frame with thinner bezels | Tablet feels different from phone visually | Low | Existing `viewport-tablet` CSS class | Wider border-radius (~1.5rem), thinner borders (~10px). Landscape or portrait toggle optional. |
| Desktop frame with browser chrome | Desktop should look like a browser window, not just wide content | Low | Existing `viewport-desktop` CSS class | Title bar with traffic-light dots or minimize/maximize/close circles. `border-radius: 0.5rem` top corners only. |
| Content area scrolls independently inside frame | App content must scroll within the device viewport, not the page | Low | None | `overflow-y: auto` on the inner content div with fixed frame height. Critical UX detail. |
| Frame centered on page with neutral background | Device should float on a neutral surface like device preview tools do | Low | None | Light gray or subtle grid background behind the device frame. Already close with `#f5f5f5` body background. |
| Viewport selector persists after selection | Currently works. User picks phone/tablet/desktop and stays there. | Already built | `App.tsx` state | Keep the viewport-change button in header for switching. |

### Bottom Tab Navigation

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|-------------|------------|--------------|-------|
| Fixed bottom bar with 5 tabs | Mobile apps universally use bottom tabs. 5 is the standard max (Material Design, Apple HIG). | Medium | None | Position: fixed at bottom of device frame viewport, not browser window. Tabs: Home, Active, Overview, History, Settings. |
| Active tab visual indicator | Users must know which tab they are on | Low | Tab bar component | Filled icon + colored label for active; outline icon + gray label for inactive. Standard pattern. |
| Tab icons with labels | Icons alone are ambiguous. Labels below icons are the mobile standard. | Low | Icon set (inline SVG or icon library) | Use simple inline SVGs to avoid dependency bloat. Home=house, Active=play-circle, Overview=grid/map, History=clock, Settings=gear. |
| Tab switching preserves screen state | Switching from Active to History and back should not reset Active screen scroll position or selected item | Medium | React state management | Keep each tab's state in parent or use display:none/block to preserve DOM. Do NOT unmount tab content on switch. |
| Touch-friendly tap targets | Tabs must be easy to tap. 48px minimum height per Material Design guidelines. | Low | None | `min-height: 48px` on each tab button. |

### State Commands Menu

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|-------------|------------|--------------|-------|
| Three-dot (kebab) menu on phone/tablet | Standard mobile pattern for secondary actions. Users expect overflow menu icon for contextual commands. | Medium | Active workflow context | Vertical three-dot icon, positioned in header/card area. Opens dropdown/popover with command list. |
| Inline buttons on desktop | Desktop has room for buttons. Hiding them in a menu wastes space. | Low | Responsive breakpoint | Show PAUSE, RESUME, ABANDON, RESTART as visible buttons when viewport is desktop. |
| PAUSE command | Pauses executing step | Low | Already built | Existing `pause` action in ActiveStepCard. Move into menu on phone/tablet. |
| RESUME command | Resumes paused step | Low | Already built | Existing `resume` action in ActiveStepCard. Move into menu. |
| ABANDON command | Stops workflow entirely | Medium | Coordinator API | Needs confirmation dialog. Destructive action = red text in menu + "Are you sure?" prompt. |
| RESTART command | Restarts workflow from beginning | Low | Already built | Existing `handleRestart` in WorkflowRunner. Move into menu. |
| Context-aware menu items | Only show applicable commands (e.g., RESUME only when paused, PAUSE only when executing) | Medium | Step state awareness | Filter menu items based on current step state. Gray out or hide inapplicable items. |
| Confirmation for destructive actions | ABANDON and RESTART should confirm before executing | Low | None | Simple modal or browser confirm(). Already using confirmation patterns. |

### Home Screen (Workflow List)

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|-------------|------------|--------------|-------|
| List of loaded master workflows | Users need to see what workflows are available | Medium | Workflow storage | Card or list-item per workflow showing name, description, step count. |
| Load workflow action (file picker or paste) | Users need to get workflows into the system | Already built | WorkflowLoader component | Refactor existing WorkflowLoader into Home screen context. |
| Tap to start workflow | Clear primary action per workflow card | Low | Coordinator API | "Start" button or tap entire card. |
| Empty state messaging | First-time users need guidance | Low | None | "No workflows loaded. Tap + to add one." with prominent add button. |

### Active Screen (Running Workflows)

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|-------------|------------|--------------|-------|
| List of running workflow instances | Users managing multiple workflows need overview | Medium | Multi-workflow coordinator | Card per running instance showing workflow name, current step, state badge. |
| Tap to view active step | Drill into running workflow to interact with current step | Low | Navigation state | Navigate to step detail view on tap. |
| State badges (RUNNING, PAUSED, WAITING) | Quick visual scan of workflow states | Low | Already built | Reuse existing `state-badge` CSS classes. |
| Swipe/carousel for multi-step | When workflow has parallel active steps, navigate between them | Already built | ActiveStepCard + carousel | Existing carousel in WorkflowRunner with touch swipe. |

### History Screen

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|-------------|------------|--------------|-------|
| Time-ordered execution log | Users need to see what happened and when | Medium | TraceView data | Reverse-chronological list. Each entry: timestamp, step name, state transition, duration. |
| Step detail drill-down | Tapping a history entry shows full details | Medium | Navigation | Show step parameters, input/output values, error details on tap. |
| Color-coded state entries | Visual scanning of success/failure/warning states | Low | Already built | TraceView already has STATE_COLORS. Reuse in History list items. |
| Scrollable with lazy loading feel | Long execution histories should not lag | Low | None | Virtual scroll not needed initially (few hundred entries max). Simple overflow-y scroll. |

### Settings Screen

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|-------------|------------|--------------|-------|
| Notification preferences toggle | Users expect settings screen to have something configurable | Low | Local state/storage | Toggle switches for "Show step completion notifications", "Sound on action required". Even if notifications are not implemented yet, the UI should exist. |
| About/version info | Standard settings screen element | Low | Package.json version | Display app name, version, engine version. |

## Differentiators

Features that set this product apart. Not expected, but valued.

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| Overview screen: scrollable workflow graph | Visualize entire workflow structure at a glance with color-coded step states. No competing workflow runners offer this as an embedded view. | High | Workflow spec graph data, canvas or SVG rendering | Use simple SVG rendering with dagre layout algorithm for auto-positioning. Color nodes by state (green=completed, blue=executing, gray=pending, red=errored, yellow=paused). No need for React Flow -- too heavy for read-only thumbnail. |
| REPEAT command with step picker | Selecting a previously executed step to re-enter is unique. Most workflow tools only offer full restart. | High | Engine support for rollback, step history | Show list of completed steps with checkboxes or radio buttons. User picks re-entry point. Engine must reset state for selected step and all downstream steps. |
| Device frame with realistic notch/camera cutout | Goes beyond simple border to look like an actual device. Professional preview tool feel. | Low | CSS pseudo-elements | `::before` element at top of phone frame for notch. Small detail, high polish. |
| Responsive kebab-to-buttons transition | Menu automatically switches from kebab on phone/tablet to inline buttons on desktop. Adaptive, not just responsive. | Medium | CSS media queries + component logic | Single component that renders differently based on viewport prop. |
| Workflow graph minimap on Overview | Small thumbnail of entire graph with viewport indicator showing current scroll position | High | SVG graph rendering | Only valuable if workflow graphs are large enough to need scrolling. Defer unless graphs commonly exceed screen size. |
| Cross-tab badge notifications | Active tab shows badge count (e.g., "Active (3)") indicating items needing attention | Low | Active step count | Simple count in tab label. High value, low effort. |

## Anti-Features

Features to explicitly NOT build. Common mistakes in this domain.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Full workflow graph editor | This is a runtime viewer, not a design tool. Adding drag-and-drop node editing massively increases complexity for zero value in this context. | Read-only graph visualization only. Workflow specs are authored externally as JSON. |
| Real browser-in-browser iframe embedding | Using iframes to simulate device viewports introduces security issues, communication complexity, and CSS isolation headaches. | Use CSS-only device frames with the app content rendered directly inside styled divs. Same React tree, just constrained visually. |
| Push notifications / service worker | Over-engineering for a development/testing tool. Service workers add caching complexity and debugging pain. | Simple in-page toast notifications for step completions and state changes. |
| User authentication / accounts | This is a local workflow runner, not a multi-tenant SaaS. Adding auth adds zero value and massive complexity. | All state is local. No server, no accounts, no login screen. |
| Drag-and-drop workflow reordering | Steps execute in spec-defined order. Letting users visually reorder them contradicts the runtime model. | Show steps in execution order. If users want different order, they edit the JSON spec. |
| Animated page transitions between tabs | Slide animations between tabs feel nice but add complexity, break scroll position preservation, and slow perceived navigation. Mobile apps are moving away from heavy transitions. | Instant tab switching. `display: none/block` swap. Fast > fancy. |
| Dark mode | Adds CSS complexity and testing burden for a development tool. Ship light mode, add dark mode only if users request it. | Single light theme. Neutral colors that work well on all screens. |
| Internationalization (i18n) | Workflow step content is already in the user's language (defined in JSON spec). The chrome/UI is minimal English labels. | English-only UI chrome. Workflow content renders in whatever language the spec defines. |
| Complex settings with many options | Settings screens that try to configure everything become maintenance burdens and confuse users. | Minimal settings: notification prefs and about info. Add settings only when users actually need them. |

## Feature Dependencies

```
WorkflowLoader (existing) ─── refactor into ──→ Home Screen
                                                    │
                                                    ▼
                                            Active Screen ◄── requires multi-workflow state
                                                    │
                                                    ▼
                                            Step Detail ◄── existing StepRenderer + ActiveStepCard
                                                    │
                                                    ▼
Bottom Tab Bar ──────────────── connects ──→ All 5 screens (Home, Active, Overview, History, Settings)
                                                    │
Device Frame ──────────────── wraps ──────→ Tab bar + screen content (frame is outermost visual container)
                                                    │
State Commands Menu ────────── appears on ──→ Active Screen + Step Detail (contextual to running workflow)
                                                    │
Overview (Graph) ──────────── requires ───→ Workflow spec graph structure + current state coloring
                                                    │
History Screen ────────────── requires ───→ TraceView data (existing) reformatted as timeline
                                                    │
REPEAT Command ────────────── requires ───→ Step history + engine rollback capability + step picker UI
```

**Build Order Implications:**

1. **Device Frame first** -- it wraps everything, establishes the visual container
2. **Tab Bar second** -- navigation infrastructure for all screens
3. **Home + Active screens** -- core navigation flow (load workflow, see running workflows)
4. **State Commands Menu** -- contextual actions on active workflows
5. **History screen** -- reformats existing TraceView data
6. **Overview screen** -- highest complexity, needs graph layout
7. **Settings screen** -- lowest priority, simplest implementation
8. **REPEAT command** -- highest complexity, needs engine-level support, do last

## MVP Recommendation

For MVP, prioritize:

1. **Device frame simulation** (all three: phone, tablet, desktop) -- defines the visual identity
2. **Bottom tab bar with 5 tabs** -- navigation backbone
3. **Home screen** (workflow list + loader) -- entry point
4. **Active screen** (running workflow list + step interaction) -- core functionality
5. **State commands menu** (kebab on phone/tablet, buttons on desktop) -- workflow control
6. **History screen** (timeline from trace data) -- visibility into execution

Defer to post-MVP:
- **Overview graph visualization**: High complexity, needs layout algorithm. Ship a simple step list first, upgrade to graph later.
- **REPEAT command**: Needs engine-level rollback support. Ship RESTART (already built) and add REPEAT as enhancement.
- **Settings beyond basic**: Start with about info only. Add notification prefs when notifications exist.
- **Workflow graph minimap**: Only needed if graphs are large enough to scroll significantly.

## Sources

- [W3Schools CSS Device Mockups](https://www.w3schools.com/howto/howto_css_devices.asp)
- [Flowbite Tailwind Device Mockups](https://flowbite.com/docs/components/device-mockups/) -- border widths, border-radius values, structural patterns
- [Devices.css library](https://github.com/picturepan2/devices.css/) -- pure CSS device frame reference
- [Conor Luddy: Anatomy of a CSS Phone Mockup](https://www.conor.fyi/writing/anatomy-of-a-css-phone-mockup) -- proportional sizing (border-radius = width * 0.12)
- [NN/g Contextual Menus Guidelines](https://www.nngroup.com/articles/contextual-menus-guidelines/) -- kebab menu UX patterns
- [AppMySite Bottom Navigation Guide](https://blog.appmysite.com/bottom-navigation-bar-in-mobile-apps-heres-all-you-need-to-know/) -- 3-5 tabs max, thumb zone placement
- [React Flow / XyFlow](https://reactflow.dev) -- graph visualization with minimap (considered but too heavy for read-only use)
- [UX Patterns: Timeline](https://uxpatterns.dev/patterns/data-display/timeline) -- history screen chronological display patterns
- [Flexera Workflow Rollback](https://docs.flexera.com/workflowmanager56/Content/aseshelplibrary/AMSRollback.htm) -- REPEAT/rollback resets downstream steps
