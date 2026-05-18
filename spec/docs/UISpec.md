# Trajectory Mobile — UI Specification

## Overview

Trajectory Mobile provides a mobile-first UI for browsing, starting, and executing workflows. The interface adapts to phone, tablet, and desktop (web) form factors. Navigation uses a bottom tab bar with 5 primary screens.

---

## 1. Navigation Structure

### 1.1 Bottom Tab Bar

| Tab | Icon | Screen | Description |
|-----|------|--------|-------------|
| Home | Home | HomeScreen | Dashboard with downloaded workflows and active executions |
| Execute | Play | ExecutionScreen | Active workflow step display with carousel |
| Overview | Map | OverviewScreen | Minimap graph + linear step list |
| History | Clock | HistoryScreen | Executed steps and execution log |
| Settings | Gear | SettingsScreen | Server connections, notifications, preferences |

### 1.2 Secondary Screens (push navigation)

| Screen | Accessed From | Description |
|--------|--------------|-------------|
| WorkflowBrowserScreen | Home (Browse Server) | Browse/download workflows from Trajectory MD server |
| FileImportScreen | Home (Import File) | Import .WFmasterX from device storage |
| WorkflowDetailScreen | Home (tap workflow) | View workflow details, start execution |
| ExecutionLogScreen | History (Export Log) | Full execution log viewer + export |
| NotificationCenterScreen | Any (notification bell) | All notifications with filters |

---

## 2. Screen Designs

### 2.1 Home Screen

```
┌─────────────────────────────────┐
│  Trajectory Mobile        [🔔][⚙]│
├─────────────────────────────────┤
│                                 │
│  ┌─ Active Workflows ─────────┐│
│  │ ▶ Bolognese Recipe  [RUNNING]│
│  │   Step 3 of 12 • 2 active  ││
│  │                             ││
│  │ ⏸ Chicken Parm     [PAUSED] ││
│  │   Step 7 of 15 • held      ││
│  └─────────────────────────────┘│
│                                 │
│  ┌─ Downloaded Workflows ──────┐│
│  │ 📋 Bolognese Recipe    v1.2 ││
│  │ 📋 Chicken Parm        v2.0 ││
│  │ 📋 Safety Inspection   v1.0 ││
│  │ 📋 Equipment Startup   v3.1 ││
│  └─────────────────────────────┘│
│                                 │
│  [Browse Server]  [Import File] │
│                                 │
├─────────────────────────────────┤
│  Home   Execute  Overview  Hist │
└─────────────────────────────────┘
```

**Sections:**
- **Active Workflows**: Running/paused workflow instances with status badges, step counts, and tap-to-resume
- **Downloaded Workflows**: Master Workflow Specifications stored locally, tap to view details or start new execution
- **Action buttons**: Browse Server (connect to Trajectory MD) and Import File (load .WFmasterX from device)

### 2.2 Execution Screen

The main workflow execution screen with the active step carousel.

```
┌─────────────────────────────────┐
│  Bolognese Recipe          [⋮] │
│  Step: "Add Garlic"   3 of 5   │
├─────────────────────────────────┤
│                                 │
│  ┌─────────────────────────────┐│
│  │                             ││
│  │   (WYSIWYG Form Content)   ││
│  │                             ││
│  │   Form elements rendered    ││
│  │   with absolute positioning ││
│  │   matching Trajectory MD      ││
│  │   layout for this device    ││
│  │                             ││
│  │   [Text inputs]             ││
│  │   [Images]                  ││
│  │   [Checkboxes]              ││
│  │   [Headers]                 ││
│  │                             ││
│  └─────────────────────────────┘│
│                                 │
│  ┌─ State Controls ───────────┐│
│  │ [⏸ Pause] [⏹ Stop] [✕ Abort]│
│  └─────────────────────────────┘│
│                                 │
│  [Submit]                       │
│                                 │
├─────────────────────────────────┤
│ [◀ Previous]  ● ● ○ ●  [Next ▶]│
├─────────────────────────────────┤
│  Home   Execute  Overview  Hist │
└─────────────────────────────────┘
```

**Key elements:**
- **Header**: Workflow name, current step name, active step position (e.g., "3 of 5")
- **Form area**: WYSIWYG form content rendered from `form_layout_config` for the current device type
- **State controls**: PAUSE, STOP, ABORT buttons (enabled based on current step state)
- **Submit button**: Completes the current user interaction step
- **Step carousel**: Previous/Next buttons with dot indicators for active steps. Wraps around — pressing Next on the last step goes to the first, pressing Previous on the first goes to the last.

#### Step Carousel Behavior

- Only **active user interaction steps** appear in the carousel
- Non-interactive steps (action proxy, script, etc.) execute in the background and don't appear
- Dot indicators show: filled = has user input needed, hollow = informational/read-only
- Carousel position persists when navigating away and back
- When a step completes, it's removed from the carousel and the next step auto-advances

#### Yes/No Step Rendering

```
┌─────────────────────────────────┐
│  (WYSIWYG Form Content above)  │
│                                 │
│  ┌─────────────┬───────────────┐│
│  │    [ Yes ]   │     [ No ]   ││
│  │  (custom     │  (custom     ││
│  │   label)     │   label)     ││
│  └─────────────┴───────────────┘│
└─────────────────────────────────┘
```

### 2.3 Overview Screen

Two sub-views toggled by a segmented control at the top.

#### Minimap Graph View

```
┌─────────────────────────────────┐
│  Workflow Overview              │
│  [Graph] [List]                 │
├─────────────────────────────────┤
│                                 │
│  ┌─────────────────────────────┐│
│  │                             ││
│  │  [START]──►[Step1]──►[Step2]││
│  │      (green)   (green)      ││
│  │                    │        ││
│  │              ┌─────▼──────┐ ││
│  │              │ [Step3]    │ ││
│  │              │  (blue)    │ ││
│  │              └─────┬──────┘ ││
│  │                    │        ││
│  │              [Step4]──►[END]││
│  │              (gray)  (gray) ││
│  │                             ││
│  │  Pinch to zoom, drag to pan ││
│  └─────────────────────────────┘│
│                                 │
│  Legend:                        │
│  🟢 Completed  🔵 Active       │
│  ⚪ Future     🔴 Aborted/Held │
│                                 │
├─────────────────────────────────┤
│  Home   Execute  Overview  Hist │
└─────────────────────────────────┘
```

**Features:**
- Renders the workflow graph using node positions from the specification
- Color-coded nodes: green=COMPLETED, blue=active states, gray=IDLE/future, red=ABORTED/HELD
- Pinch-to-zoom and drag-to-pan gestures
- Tap a node to see step details or navigate to it (if active user step)
- Connection lines show the workflow flow direction

#### Linear Step List View

```
┌─────────────────────────────────┐
│  Workflow Overview              │
│  [Graph] [List]                 │
├─────────────────────────────────┤
│                                 │
│  ✅ START                       │
│     10:30:00 • Completed        │
│                                 │
│  ✅ Preheat Oven                │
│     10:30:01 • Completed        │
│     Duration: 45s               │
│                                 │
│  🔵 Add Garlic          [Go To]│
│     10:30:46 • Executing        │
│     Awaiting user input         │
│                                 │
│  🔵 Heat Sauce           [Go To]│
│     10:30:46 • Executing        │
│     Action: IN_PROGRESS         │
│                                 │
│  ⚪ Season to Taste              │
│     Pending                     │
│                                 │
│  ⚪ Plate and Serve              │
│     Pending                     │
│                                 │
│  ⚪ END                          │
│     Pending                     │
│                                 │
├─────────────────────────────────┤
│  Home   Execute  Overview  Hist │
└─────────────────────────────────┘
```

**Features:**
- Scrollable timeline of all steps in execution/graph order
- Status icons and timestamps
- "Go To" button on active user interaction steps (navigates to Execute tab + carousel position)
- Shows duration for completed steps
- Groups parallel branches visually (indented or labeled)

### 2.4 History Screen

```
┌─────────────────────────────────┐
│  Execution History              │
│  Bolognese Recipe          [📤]│
├─────────────────────────────────┤
│                                 │
│  ┌─ Step: Preheat Oven ───────┐│
│  │ Completed at 10:30:46      ││
│  │ Duration: 45 seconds       ││
│  │                            ││
│  │ Input: temperature = 200°C ││
│  │ Output: actual_temp = 198°C││
│  │                            ││
│  │ State transitions:         ││
│  │  IDLE → WAITING → STARTING ││
│  │  → EXECUTING → COMPLETING  ││
│  │  → COMPLETED               ││
│  └────────────────────────────┘│
│                                 │
│  ┌─ Step: Add Garlic ─────────┐│
│  │ Completed at 10:31:30      ││
│  │ Duration: 44 seconds       ││
│  │                            ││
│  │ User input:                ││
│  │  cloves = "4"              ││
│  │  minced = "yes"            ││
│  └────────────────────────────┘│
│                                 │
│  [Export Report (PDF)]          │
│  [Export Report (HTML)]         │
│                                 │
├─────────────────────────────────┤
│  Home   Execute  Overview  Hist │
└─────────────────────────────────┘
```

**Features:**
- Scrollable list of completed steps with full details
- Shows input/output parameters, user inputs, timestamps
- Expandable state transition history per step
- Export buttons for PDF and HTML reports

### 2.5 Settings Screen

```
┌─────────────────────────────────┐
│  Settings                       │
├─────────────────────────────────┤
│                                 │
│  ┌─ Server Connection ────────┐│
│  │ Current: factory.example.com│
│  │ Status: 🟢 Connected       ││
│  │ [Connect] [Disconnect]     ││
│  │                            ││
│  │ Recent servers:            ││
│  │  • factory.example.com     ││
│  │  • dev.trajectory.local      ││
│  │  • 192.168.1.100:3000      ││
│  └────────────────────────────┘│
│                                 │
│  ┌─ Notifications ────────────┐│
│  │ Step Attention      [ON]   ││
│  │ State Transitions   [OFF]  ││
│  │ Action Completed    [ON]   ││
│  │ Errors & Timeouts   [ON]   ││
│  │ Resource Events     [OFF]  ││
│  └────────────────────────────┘│
│                                 │
│  ┌─ Action Servers ───────────┐│
│  │ Kitchen Env    🟢 Connected ││
│  │ Bakery Env     🔴 Offline   ││
│  └────────────────────────────┘│
│                                 │
│  ┌─ Storage ──────────────────┐│
│  │ Downloaded: 4 workflows    ││
│  │ Active: 2 workflows        ││
│  │ Storage used: 12.4 MB      ││
│  │ [Clear Completed Workflows]││
│  └────────────────────────────┘│
│                                 │
├─────────────────────────────────┤
│  Home   Execute  Overview  Hist │
└─────────────────────────────────┘
```

### 2.6 Workflow Browser Screen

```
┌─────────────────────────────────┐
│  ◀ Browse Server                │
│  factory.example.com            │
├─────────────────────────────────┤
│  🔍 Search workflows...        │
│                                 │
│  ┌─ Workflow Libraries ────────┐│
│  │                             ││
│  │ 📁 Cooking Procedures       ││
│  │   📋 Bolognese Recipe  v1.2 ││
│  │      [Downloaded ✓]        ││
│  │   📋 Chicken Parm     v2.0 ││
│  │      [Download]             ││
│  │   📋 Risotto          v1.0 ││
│  │      [Download]             ││
│  │                             ││
│  │ 📁 Safety Procedures        ││
│  │   📋 Fire Drill       v3.0 ││
│  │      [Download]             ││
│  │   📋 Equipment Check  v1.5 ││
│  │      [Update Available ⬆]  ││
│  └─────────────────────────────┘│
│                                 │
├─────────────────────────────────┤
│  Home   Execute  Overview  Hist │
└─────────────────────────────────┘
```

**Features:**
- Browses the Trajectory MD server REST API (`GET /api/libraries`, `GET /api/specifications`)
- Shows download status (not downloaded, downloaded, update available)
- Downloads .WFmasterX packages and stores locally
- Search/filter by name

---

## 3. Form Rendering

### 3.1 Device Type Selection

The form renderer selects the appropriate layout from `form_layout_config`:

| Device | Layout Used | Detection |
|--------|-----------|-----------|
| Phone (< 600dp width) | `phone` | Screen width |
| Tablet (600-1024dp width) | `tablet` | Screen width |
| Desktop / Web | `desktop` | Platform detection |

If the target layout is not available, fall back: desktop → tablet → phone.

### 3.2 Form Element Rendering

Each `FormElementSpec` is rendered as an absolutely positioned React Native component. All 11 element types:

| Element Type | React Native Component | Notes |
|-------------|----------------------|-------|
| `text` | `<Text>` or HTML renderer | Rich text content (`RichTextContent`); respects `fontSize`, `color`, `fontWeight`, `align` |
| `header` | `<Text>` or HTML renderer | Large title (`RichTextContent`); defaults: `fontSize=24`, `fontWeight='bold'` |
| `textInput` | `<TextInput>` | Single-line input; supports `outputParameter`, `defaultSource`, `placeholderSource` |
| `textarea` | `<TextInput multiline>` | Multi-line input; `rows` sets visible lines (default 4); supports parameter binding |
| `image` | `<Image>` | Loaded from `package_images` store or HTTPS URL; `objectFit` maps to `resizeMode` |
| `video` | `<Video>` (expo-av) | HTTPS video URL; optional `posterUrl` thumbnail |
| `checkbox` | Checkbox group | Multi-select; renders `options[]` as labeled checkboxes; output is `string[]` |
| `radio` | Radio button group | Single-select; renders `options[]` as labeled radio buttons; output is `string` |
| `button` | `<Pressable>` | Tappable button; emits `outputValue` on press; `deletable=false` for Yes/No buttons |
| `divider` | `<View>` | Horizontal line; `thickness` (default 1), `color` (default `#e2e8f0`) |
| `timer` | Timer component | Countdown/countup display; `durationSeconds`, `direction`, `blockDone` |

### 3.3 Scaling

The form canvas has a fixed `canvasWidth` and `canvasHeight`. The renderer scales the canvas to fit the device screen while maintaining aspect ratio. All element positions and sizes scale proportionally.

### 3.4 Runtime Parameter Binding Behavior

Form elements with parameter bindings require special runtime handling in the UI layer.

#### On Step STARTING (Before Display)

1. **Resolve defaults**: For each `textInput`, `textarea`, or `timer` element with a `defaultSource`:
   - `mode: 'static'` → pre-populate the field with the literal `value`
   - `mode: 'property'` → resolve the Value Property reference and pre-populate with the result
   - If resolution fails (property not found), leave the field empty

2. **Resolve placeholders**: For each `textInput` or `textarea` element with a `placeholderSource`:
   - `mode: 'static'` → set placeholder text to `value`
   - `mode: 'property'` → resolve the Value Property reference and set as placeholder
   - If `placeholderSource` is absent, use the static `placeholder` field

#### On Form Display (EXECUTING)

- Pre-populated values appear in the input fields as editable defaults
- Resolved placeholders appear as hint text when field is empty
- Timer elements start counting immediately; if `blockDone: true`, the Done/Submit button is disabled until the timer expires (reaches 0 for countdown, or target for countup)

#### On Form Submit (COMPLETING)

1. **Collect values** from all interactive elements:
   - `textInput`: the entered text (string)
   - `textarea`: the entered text (string)
   - `radio`: the selected option label (string)
   - `timer`: elapsed or remaining time value (string)
   - `checkbox`: array of selected option labels (string[])

2. **Write outputs**: For each element with an `outputParameter`:
   - Parse `outputParameter` as `"PropertyName.EntryName"` dot notation
   - Write the collected value to the target Value Property entry

---

## 4. Responsive Behavior

### 4.1 Phone
- Single-column layout
- Bottom tab bar always visible
- Step carousel at bottom above tab bar
- Form content scrollable within the execution area

### 4.2 Tablet
- Optional split-view: step list on left, form content on right
- Larger form canvas area
- More visible step carousel dots

### 4.3 Desktop (Web)
- Full sidebar navigation option (in addition to bottom tabs)
- Side-by-side panels: overview graph + execution area
- Wider form canvas using desktop layout
- Keyboard shortcuts for state controls (P=Pause, R=Resume, etc.)

---

## 5. Accessibility

- All interactive elements have accessible labels
- State badges use both color AND icon/text (not color alone)
- Minimum touch target size: 44x44 dp
- Support for system font size preferences
- High contrast mode support via system settings
