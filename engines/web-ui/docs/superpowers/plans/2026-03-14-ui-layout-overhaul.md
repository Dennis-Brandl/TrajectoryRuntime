# UI Layout Overhaul Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the entire UI into fixed-height zones (Reserved, Title, Top Buffer, Working, Bottom Buffer, Bottom Buttons) with per-device-type pixel dimensions, redesign Home and Active screens, and unify the step carousel across all workflows.

**Architecture:** The DeviceFrame renders visual bezels; inside, AppShell uses CSS custom properties (set per device type via a class or data attribute) to size each zone to exact pixel heights. The Title Area replaces the current HeaderBar with an app-branded header (icon + "Trajectory V1.0.0" + three-dot menu). The Active screen collapses the two-level carousel into a single looping step carousel spanning all active workflows, with the Title Area dynamically updating to show the current step's workflow. The Home screen gets a start dialog with input parameter fields and swipe-to-delete on loaded workflows.

**Tech Stack:** React 19, TypeScript, Vite, CSS Modules, Embla Carousel, Lucide React

---

## Chunk 1: Layout Zone System

### Task 1: DeviceFrame — pass device type into content via CSS custom properties

The content inside the device frame needs to know which device type it's in so zones can be sized correctly. We'll add a `data-device` attribute on the content div.

**Files:**
- Modify: `src/components/shell/DeviceFrame.tsx`
- Modify: `src/components/shell/DeviceFrame.module.css`

- [ ] **Step 1: Add data-device attribute to content div in DeviceFrame.tsx**

In `DeviceFrame.tsx`, change the content div to include the device type:

```tsx
<div className={styles.content} data-device={deviceType}>
```

- [ ] **Step 2: Replace padding-top approach with CSS custom properties per device type**

In `DeviceFrame.module.css`, remove the old `.frame--phone .content` rule and add nothing in its place (the Reserved Area in AppShell will handle spacing):

Remove:
```css
/* Phone content needs padding-top to clear dynamic island */
.frame--phone .content {
  padding-top: 20px;
}
```

- [ ] **Step 3: Verify — run `npx tsc --noEmit` and check dev server renders**

Run: `npx tsc --noEmit`
Expected: No errors

---

### Task 2: AppShell — implement fixed-height zone layout

Replace the current flex-based shell with explicit zone heights driven by the device type.

**Files:**
- Modify: `src/components/shell/AppShell.tsx`
- Modify: `src/components/shell/AppShell.module.css`

- [ ] **Step 1: Restructure AppShell.tsx to render all six zones**

The shell needs a `deviceType` prop. Since AppShell is rendered inside DeviceFrame's content div which has `data-device`, we can read it from context or pass it as prop. The simplest approach: lift `deviceType` into a React context or pass through AppShell. Since `App.tsx` has `deviceType` state already, pass it through WorkflowManagerProvider or add a small context.

Create a lightweight context. Add to `App.tsx`:

```tsx
// In App.tsx, wrap AppShell to pass deviceType
<AppShell deviceType={deviceType} />
```

Update `AppShell.tsx`:

```tsx
import { useState, useCallback, useRef } from 'react';
import { TitleBar } from './TitleBar';
import { TabBar, type TabId } from './TabBar';
import { HomeScreen } from '../screens/HomeScreen';
import { ActiveScreen } from '../screens/ActiveScreen';
import { OverviewScreen } from '../screens/OverviewScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import type { DeviceType } from './DeviceFrame';
import styles from './AppShell.module.css';

const TAB_IDS: TabId[] = ['home', 'active', 'overview', 'history', 'settings'];

interface AppShellProps {
  deviceType: DeviceType;
}

export function AppShell({ deviceType }: AppShellProps) {
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const screenRefs = useRef<Record<TabId, HTMLDivElement | null>>({
    home: null, active: null, overview: null, history: null, settings: null,
  });

  const handleTabChange = useCallback((tab: TabId) => {
    setActiveTab((current) => {
      if (current === tab) {
        const el = screenRefs.current[tab];
        if (el) el.scrollTop = 0;
        return current;
      }
      return tab;
    });
  }, []);

  const handleNavigateToActive = useCallback(() => {
    setActiveTab('active');
  }, []);

  return (
    <div className={`${styles.shell} ${styles[`shell--${deviceType}`]}`}>
      <div className={styles.reservedArea} />
      <TitleBar activeTab={activeTab} />
      <div className={styles.topBuffer} />
      <div className={styles.workingArea}>
        {TAB_IDS.map((id) => (
          <div
            key={id}
            ref={(el) => { screenRefs.current[id] = el; }}
            className={styles.screen}
            style={{ display: activeTab === id ? 'flex' : 'none' }}
          >
            {id === 'home' && <HomeScreen onNavigateToActive={handleNavigateToActive} />}
            {id === 'active' && <ActiveScreen />}
            {id === 'overview' && <OverviewScreen />}
            {id === 'history' && <HistoryScreen />}
            {id === 'settings' && <SettingsScreen />}
          </div>
        ))}
      </div>
      <div className={styles.bottomBuffer} />
      <TabBar activeTab={activeTab} onTabChange={handleTabChange} />
    </div>
  );
}
```

- [ ] **Step 2: Write AppShell.module.css with per-device zone heights**

```css
.shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* Zone heights — Phone (default) */
.reservedArea { height: 60px; flex-shrink: 0; }
.topBuffer    { height: 3px;  flex-shrink: 0; }
.bottomBuffer { height: 3px;  flex-shrink: 0; }

.workingArea {
  height: 706px;
  flex-shrink: 0;
  overflow: hidden;
  position: relative;
}

.screen {
  height: 100%;
  overflow-y: auto;
  flex-direction: column;
}

/* Tablet overrides */
.shell--tablet .reservedArea { height: 60px; }
.shell--tablet .workingArea  { height: 788px; }
.shell--tablet .bottomBuffer { height: 3px; }

/* Desktop overrides */
.shell--desktop .reservedArea { height: 40px; }
.shell--desktop .workingArea  { height: 600px; }
.shell--desktop .bottomBuffer { height: 2px; }
```

Note: The Title Area height is controlled by TitleBar itself (100px phone/tablet, 90px desktop). The TabBar height is controlled by TabBar itself (60px phone, 70px tablet, 65px desktop).

- [ ] **Step 3: Update App.tsx to pass deviceType to AppShell**

In `App.tsx`, change `<AppShell />` to `<AppShell deviceType={deviceType} />`.

- [ ] **Step 4: Verify — `npx tsc --noEmit`**

Run: `npx tsc --noEmit`
Expected: No errors (TitleBar doesn't exist yet — will be created next task)

---

### Task 3: TitleBar — new branded title area component

Replace the current HeaderBar with a new TitleBar that shows the app icon, "Trajectory V1.0.0", and a three-dot menu. On the Active tab, it instead shows workflow/step info and state commands.

**Files:**
- Create: `src/components/shell/TitleBar.tsx`
- Create: `src/components/shell/TitleBar.module.css`
- Modify: `src/components/shell/HeaderBar.tsx` (will be removed or gutted)

- [ ] **Step 1: Create TitleBar.module.css**

```css
.titleBar {
  height: 100px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background: var(--header-bg, #fff);
}

/* Desktop: shorter title */
.titleBar--desktop {
  height: 90px;
}

.titleLeft {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.appIcon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: linear-gradient(135deg, #2980b9, #6dd5fa);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 700;
  font-size: 18px;
  flex-shrink: 0;
}

.titleText {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.appName {
  font-size: 17px;
  font-weight: 600;
  color: var(--header-title-color, #000);
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.subtitle {
  font-size: 13px;
  color: var(--header-subtitle-color, #666);
  line-height: 1.3;
  font-style: italic;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.titleRight {
  flex-shrink: 0;
  margin-left: 8px;
}
```

- [ ] **Step 2: Create TitleBar.tsx**

The TitleBar shows different content depending on the active tab:
- **Active tab:** workflow local_id + version (line 1), step local_id italic (line 2), state command menu
- **All other tabs:** app icon + "Trajectory V1.0.0" (line 1), placeholder three-dot menu

```tsx
import { EllipsisVertical } from 'lucide-react';
import { useFocusedId, useManagerSnapshot } from '../../manager/useWorkflowManager';
import { useCoordinatorById } from '../../manager/useActiveCoordinator';
import { StateCommandMenu } from '../StateCommandMenu';
import type { TabId } from './TabBar';
import styles from './TitleBar.module.css';

interface TitleBarProps {
  activeTab: TabId;
}

export function TitleBar({ activeTab }: TitleBarProps) {
  if (activeTab === 'active') {
    return <ActiveTitleBar />;
  }
  return <DefaultTitleBar activeTab={activeTab} />;
}

function DefaultTitleBar({ activeTab }: { activeTab: TabId }) {
  return (
    <div className={styles.titleBar}>
      <div className={styles.titleLeft}>
        <div className={styles.appIcon}>B</div>
        <div className={styles.titleText}>
          <div className={styles.appName}>Trajectory V1.0.0</div>
        </div>
      </div>
      <div className={styles.titleRight}>
        <button className={styles.menuButton} aria-label="Menu">
          <EllipsisVertical size={20} />
        </button>
      </div>
    </div>
  );
}

function ActiveTitleBar() {
  const focusedId = useFocusedId();
  const managerSnap = useManagerSnapshot();
  const coordSnap = useCoordinatorById(focusedId);

  const focusedWf = focusedId
    ? managerSnap.workflows.find(w => w.id === focusedId)
    : null;

  const workflowLabel = focusedWf
    ? `${focusedWf.localId} v${focusedWf.version}`
    : 'No Workflow';

  let stepLabel = '';
  if (coordSnap && coordSnap.activeSteps.length > 0) {
    const first = coordSnap.activeSteps[0];
    stepLabel = first.step.step.local_id;
  }

  return (
    <div className={styles.titleBar}>
      <div className={styles.titleLeft}>
        <div className={styles.appIcon}>B</div>
        <div className={styles.titleText}>
          <div className={styles.appName}>{workflowLabel}</div>
          {stepLabel && <div className={styles.subtitle}>{stepLabel}</div>}
        </div>
      </div>
      <div className={styles.titleRight}>
        <StateCommandMenu workflowId={focusedId} />
      </div>
    </div>
  );
}
```

Add to `TitleBar.module.css`:
```css
.menuButton {
  display: block;
  background: none;
  border: none;
  cursor: pointer;
  padding: 8px;
  color: var(--header-title-color, #000);
  border-radius: 6px;
}

.menuButton:hover {
  background: rgba(0, 0, 0, 0.06);
}
```

- [ ] **Step 3: Remove old HeaderBar import from AppShell**

The old `HeaderBar` component is no longer used. Remove its import and usage from `AppShell.tsx` (already replaced by `TitleBar` in the new AppShell code from Task 2).

- [ ] **Step 4: Update TabBar.module.css with per-device heights**

```css
.tabBar {
  display: flex;
  justify-content: space-around;
  align-items: center;
  height: 60px;
  flex-shrink: 0;
  background: var(--tab-bar-bg, #fff);
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.06);
}
```

The TabBar height varies by device. Since TabBar doesn't know the device type, use the parent's class. Add to `AppShell.module.css`:

```css
/* TabBar height overrides */
.shell--tablet :global(.tabBar) { height: 70px; }
.shell--desktop :global(.tabBar) { height: 65px; }
```

Alternatively, since we're using CSS modules, a simpler approach is to set CSS custom properties on the shell:

In `AppShell.module.css`, add at the top of `.shell`:
```css
--tab-height: 60px;
```
And in overrides:
```css
.shell--tablet { --tab-height: 70px; }
.shell--desktop { --tab-height: 65px; }
```

Then in `TabBar.module.css`:
```css
.tabBar {
  height: var(--tab-height, 60px);
}
```

- [ ] **Step 5: Verify — `npx tsc --noEmit` and visually check all three device sizes**

Run: `npx tsc --noEmit`
Expected: No errors. Visual check: six zones visible at correct heights.

- [ ] **Step 6: Commit**

```bash
git add src/components/shell/DeviceFrame.tsx src/components/shell/DeviceFrame.module.css \
  src/components/shell/AppShell.tsx src/components/shell/AppShell.module.css \
  src/components/shell/TitleBar.tsx src/components/shell/TitleBar.module.css \
  src/components/shell/TabBar.module.css src/App.tsx
git commit -m "feat: implement fixed-height zone layout with TitleBar

Replace flex-based shell with explicit zone heights per device type.
Six zones: Reserved, Title, Top Buffer, Working, Bottom Buffer, Bottom Buttons.
New TitleBar component with app branding and Active tab context display.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Chunk 2: Home Screen Redesign

### Task 4: Home screen — two stacked lists with section headers

Replace the current single list with separate "Loaded Workflows" and "Active Workflows" sections. Phone and tablet get a Load Workflow button only; desktop also gets a drag-drop zone.

**Files:**
- Modify: `src/components/screens/HomeScreen.tsx`
- Modify: `src/components/screens/HomeScreen.module.css`

- [ ] **Step 1: Separate workflow filtering into loaded vs active**

The manager snapshot has `wf.status` which is `'loaded'` or `'running'`. Split into two arrays:

```tsx
const loaded = snapshot.workflows.filter(wf => wf.status === 'loaded');
const active = snapshot.workflows.filter(wf => wf.status === 'running');
```

- [ ] **Step 2: Rewrite HomeScreen.tsx with two sections**

```tsx
import { useState, useRef, useCallback } from 'react';
import { Plus, Upload, Trash2 } from 'lucide-react';
import { processWorkflowFile, isProcessingError } from '../../manager/fileProcessing';
import { useWorkflowManager, useManagerSnapshot } from '../../manager/useWorkflowManager';
import { WorkflowStartDialog } from '../WorkflowStartDialog';
import type { ManagedWorkflow } from '../../manager/types';
import styles from './HomeScreen.module.css';

interface HomeScreenProps {
  onNavigateToActive: () => void;
}

export function HomeScreen({ onNavigateToActive }: HomeScreenProps) {
  const manager = useWorkflowManager();
  const snapshot = useManagerSnapshot();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [startTarget, setStartTarget] = useState<ManagedWorkflow | null>(null);
  const [swipedId, setSwipedId] = useState<string | null>(null);
  const touchStartX = useRef(0);

  const loaded = snapshot.workflows.filter(wf => wf.status === 'loaded');
  const active = snapshot.workflows.filter(wf => wf.status === 'running');

  const handleFiles = useCallback(
    async (files: FileList) => {
      for (const file of files) {
        const result = await processWorkflowFile(file);
        if (isProcessingError(result)) {
          setError(result.error + (result.details ? `: ${result.details}` : ''));
          return;
        }
        const addResult = manager.addWorkflow(result.workflow, result.mediaMap, result.environments);
        if ('duplicateId' in addResult) {
          setError('This workflow is already loaded');
          return;
        }
      }
      setError(null);
    },
    [manager],
  );

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) handleFiles(e.target.files);
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [handleFiles],
  );

  const handleLoadClick = useCallback(() => { fileInputRef.current?.click(); }, []);

  // Desktop-only drag and drop
  const [dragOver, setDragOver] = useState(false);
  const handleDragEnter = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }, []);
  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); }, []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragOver(false);
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleWorkflowClick = useCallback((wf: ManagedWorkflow) => {
    setStartTarget(wf);
  }, []);

  const handleStartConfirm = useCallback((id: string, startingParams?: Record<string, string>) => {
    manager.startWorkflow(id, startingParams);
    setStartTarget(null);
    onNavigateToActive();
  }, [manager, onNavigateToActive]);

  const handleStartCancel = useCallback(() => { setStartTarget(null); }, []);

  // Swipe-to-delete handlers for loaded workflows
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent, id: string) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 80) {
      setSwipedId(id);
    }
  }, []);

  const handleDelete = useCallback((id: string) => {
    manager.removeWorkflow(id);
    setSwipedId(null);
  }, [manager]);

  const handleCancelSwipe = useCallback(() => { setSwipedId(null); }, []);

  return (
    <div className={styles.screen}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <button className={styles.loadButton} onClick={handleLoadClick}>
          <Plus size={16} />
          Load Workflow
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".WFmasterX,.json,.WFmaster"
          className={styles.hiddenInput}
          onChange={handleFileInputChange}
        />
      </div>

      {/* Desktop-only drop zone */}
      <div
        className={`${styles.dropZone}${dragOver ? ` ${styles.dropZoneDragOver}` : ''}`}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <Upload size={20} className={styles.dropIcon} />
        <span>Drop .WFmasterX or .json file here</span>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {/* Loaded Workflows Section */}
      <div className={styles.section}>
        <h3 className={styles.sectionHeader}>Loaded Workflows</h3>
        {loaded.length > 0 ? (
          <ul className={styles.workflowList}>
            {loaded.map(wf => (
              <li
                key={wf.id}
                className={styles.workflowItem}
                onClick={() => handleWorkflowClick(wf)}
                onTouchStart={handleTouchStart}
                onTouchEnd={(e) => handleTouchEnd(e, wf.id)}
              >
                {swipedId === wf.id ? (
                  <div className={styles.swipeActions}>
                    <button className={styles.deleteButton} onClick={(e) => { e.stopPropagation(); handleDelete(wf.id); }}>
                      <Trash2 size={16} /> Delete
                    </button>
                    <button className={styles.cancelSwipeButton} onClick={(e) => { e.stopPropagation(); handleCancelSwipe(); }}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <span className={styles.workflowName}>
                    {wf.localId} <span className={styles.workflowVersion}>v{wf.version}</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.emptySection}>No workflows loaded</p>
        )}
      </div>

      {/* Active Workflows Section */}
      <div className={styles.section}>
        <h3 className={styles.sectionHeader}>Active Workflows</h3>
        {active.length > 0 ? (
          <ul className={styles.workflowList}>
            {active.map(wf => (
              <li key={wf.id} className={styles.workflowItem}>
                <span className={styles.workflowName}>
                  {wf.localId} <span className={styles.workflowVersion}>v{wf.version}</span>
                </span>
                <span className={styles.runningBadge}>Running</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.emptySection}>No active workflows</p>
        )}
      </div>

      {/* Start Dialog */}
      {startTarget && (
        <WorkflowStartDialog
          workflow={startTarget}
          onStart={handleStartConfirm}
          onCancel={handleStartCancel}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Rewrite HomeScreen.module.css**

```css
.screen {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 12px 16px;
  overflow-y: auto;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  flex-shrink: 0;
}

.loadButton {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  background: #007aff;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 150ms ease;
}

.loadButton:hover { background: #005ecb; }
.loadButton:active { background: #004aaa; }

.hiddenInput { display: none; }

/* Desktop-only drop zone — hidden on phone/tablet */
.dropZone {
  display: none;
  align-items: center;
  gap: 8px;
  padding: 16px;
  margin-bottom: 12px;
  border: 2px dashed #ccc;
  border-radius: 8px;
  color: #888;
  font-size: 13px;
  text-align: center;
  justify-content: center;
  transition: border-color 200ms ease, background 200ms ease;
}

.dropZoneDragOver {
  border-color: #007aff;
  background: rgba(0, 122, 255, 0.05);
}

.dropIcon { color: #ccc; }

@container device-frame (min-width: 1000px) {
  .dropZone { display: flex; }
}

.error {
  font-size: 13px;
  color: #d32f2f;
  margin-bottom: 12px;
  padding: 8px 12px;
  background: #fdecea;
  border-radius: 6px;
  flex-shrink: 0;
}

/* Section */
.section {
  margin-bottom: 16px;
}

.sectionHeader {
  font-size: 13px;
  font-weight: 600;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0 0 8px;
}

.workflowList {
  list-style: none;
  margin: 0;
  padding: 0;
}

.workflowItem {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid #eee;
  cursor: pointer;
}

.workflowItem:last-child { border-bottom: none; }

.workflowName {
  font-size: 15px;
  font-weight: 500;
  color: #222;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workflowVersion {
  font-size: 12px;
  font-weight: 400;
  color: #888;
}

.runningBadge {
  font-size: 12px;
  font-weight: 600;
  color: #007aff;
  padding: 4px 10px;
  background: rgba(0, 122, 255, 0.1);
  border-radius: 12px;
  flex-shrink: 0;
}

.emptySection {
  font-size: 13px;
  color: #aaa;
  margin: 0;
  padding: 8px 0;
}

/* Swipe-to-delete actions */
.swipeActions {
  display: flex;
  gap: 8px;
  width: 100%;
}

.deleteButton {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border: none;
  border-radius: 6px;
  background: #e74c3c;
  color: #fff;
  font-size: 13px;
  cursor: pointer;
}

.cancelSwipeButton {
  padding: 6px 12px;
  border: none;
  border-radius: 6px;
  background: #e0e0e0;
  color: #333;
  font-size: 13px;
  cursor: pointer;
}

/* Container query responsive adjustments */
@container device-frame (min-width: 769px) {
  .screen { padding: 16px 24px; }
  .workflowName { font-size: 16px; }
}
```

- [ ] **Step 4: Verify — `npx tsc --noEmit`**

WorkflowStartDialog doesn't exist yet — this step will have compile errors. That's expected; it's created in Task 5.

---

### Task 5: WorkflowStartDialog — start dialog with input parameters

Create a dialog that shows workflow details (local_id, description, version) and input parameter fields.

**Files:**
- Create: `src/components/WorkflowStartDialog.tsx`
- Create: `src/components/WorkflowStartDialog.module.css`
- Modify: `src/manager/WorkflowManager.ts` (extend startWorkflow to accept starting params)
- Modify: `src/manager/types.ts` (add spec to ManagedWorkflow for accessing starting_parameter_specifications)

- [ ] **Step 1: Add spec reference to ManagedWorkflow**

In `src/manager/types.ts`, add:

```typescript
import type { MasterWorkflowSpecification } from '@engine/types.js';
```

Add to `ManagedWorkflow`:
```typescript
spec: MasterWorkflowSpecification;
```

In `WorkflowManager.ts`, populate it in `addWorkflow`:
```typescript
spec: spec,
```

- [ ] **Step 2: Extend WorkflowManager.startWorkflow to accept starting parameters**

In `WorkflowManager.ts`, change `startWorkflow`:

```typescript
startWorkflow(id: string, startingParams?: Record<string, string>): void {
  const managed = this._workflows.find(w => w.id === id);
  if (!managed) return;
  if (startingParams) {
    // Re-load with starting parameters before starting
    managed.coordinator.load(
      managed.spec,
      { starting_parameters: startingParams },
      managed.coordinator.getSnapshot().mediaMap,
    );
  }
  managed.coordinator.start();
  managed.status = 'running';
  this._workflows = [...this._workflows];
  this.publish();
}
```

- [ ] **Step 3: Create WorkflowStartDialog.module.css**

```css
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.card {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  max-width: 360px;
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
}

.title {
  font-size: 18px;
  font-weight: 700;
  margin: 0 0 4px;
  color: #000;
}

.version {
  font-size: 13px;
  color: #888;
  margin: 0 0 8px;
}

.description {
  font-size: 14px;
  color: #555;
  margin: 0 0 16px;
  line-height: 1.4;
}

.paramSection {
  margin-bottom: 16px;
}

.paramLabel {
  font-size: 12px;
  font-weight: 500;
  color: #555;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0 0 8px;
}

.paramField {
  margin-bottom: 12px;
}

.paramField label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: #333;
  margin-bottom: 4px;
}

.paramField input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ccc;
  border-radius: 6px;
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
}

.paramField input:focus {
  border-color: #2980b9;
}

.actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.cancelBtn {
  background: #e0e0e0;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
}

.startBtn {
  background: #34c759;
  color: #fff;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
}
```

- [ ] **Step 4: Create WorkflowStartDialog.tsx**

```tsx
import { useState, useCallback } from 'react';
import type { ManagedWorkflow } from '../manager/types';
import type { ParameterSpecification } from '@engine/types.js';
import styles from './WorkflowStartDialog.module.css';

interface WorkflowStartDialogProps {
  workflow: ManagedWorkflow;
  onStart: (id: string, startingParams?: Record<string, string>) => void;
  onCancel: () => void;
}

export function WorkflowStartDialog({ workflow, onStart, onCancel }: WorkflowStartDialogProps) {
  const params: ParameterSpecification[] = workflow.spec.starting_parameter_specifications ?? [];
  const [paramValues, setParamValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const p of params) {
      initial[p.id] = p.default_value ?? '';
    }
    return initial;
  });

  const handleParamChange = useCallback((id: string, value: string) => {
    setParamValues(prev => ({ ...prev, [id]: value }));
  }, []);

  const handleStart = useCallback(() => {
    const startingParams = params.length > 0 ? paramValues : undefined;
    onStart(workflow.id, startingParams);
  }, [workflow.id, params.length, paramValues, onStart]);

  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.card} onClick={e => e.stopPropagation()}>
        <h2 className={styles.title}>{workflow.localId}</h2>
        <p className={styles.version}>Version {workflow.version}</p>
        {workflow.spec.description && (
          <p className={styles.description}>{workflow.spec.description}</p>
        )}

        {params.length > 0 && (
          <div className={styles.paramSection}>
            <p className={styles.paramLabel}>Input Parameters</p>
            {params.map(p => (
              <div key={p.id} className={styles.paramField}>
                <label>{p.description || p.id}</label>
                <input
                  type="text"
                  value={paramValues[p.id] ?? ''}
                  onChange={e => handleParamChange(p.id, e.target.value)}
                  placeholder={p.default_value || ''}
                />
              </div>
            ))}
          </div>
        )}

        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          <button className={styles.startBtn} onClick={handleStart}>Start</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify — `npx tsc --noEmit` and visually test Home screen**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/components/screens/HomeScreen.tsx src/components/screens/HomeScreen.module.css \
  src/components/WorkflowStartDialog.tsx src/components/WorkflowStartDialog.module.css \
  src/manager/types.ts src/manager/WorkflowManager.ts
git commit -m "feat: redesign Home screen with two-section list and start dialog

Loaded Workflows and Active Workflows as separate sections.
Click loaded workflow to see details and start (with input parameter fields).
Swipe-to-delete on loaded workflows.
Desktop-only drag-drop zone.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Chunk 3: Active Screen — Unified Step Carousel

### Task 6: Flatten all active steps into a single looping carousel

Replace the two-level carousel (workflows → steps) with a single step carousel that spans all active workflows. The TitleBar updates dynamically as the user swipes.

**Files:**
- Rewrite: `src/components/screens/ActiveScreen.tsx`
- Modify: `src/components/screens/ActiveScreen.module.css`
- Modify: `src/manager/useWorkflowManager.ts` (add hook to get all active steps across workflows)

- [ ] **Step 1: Create useAllActiveSteps hook**

Add to `src/manager/useWorkflowManager.ts` (or a new file `src/manager/useAllActiveSteps.ts`):

Create `src/manager/useAllActiveSteps.ts`:

```tsx
import { useMemo } from 'react';
import { useManagerSnapshot, useWorkflowManager } from './useWorkflowManager';
import type { ActiveStepInfo } from '@engine/types.js';
import type { CoordinatorSnapshot } from '../coordinator/WorkflowCoordinator';
import { useSyncExternalStore, useCallback } from 'react';

export interface FlatActiveStep {
  workflowId: string;
  workflowLocalId: string;
  workflowVersion: string;
  stepInfo: ActiveStepInfo;
  properties: Record<string, string>;
  inputParameters: Record<string, string>;
  mediaMap: Record<string, string>;
  stepParams: CoordinatorSnapshot['stepParams'];
}

/**
 * Subscribes to all coordinators and returns a flat list of active steps
 * across all running workflows.
 */
export function useAllActiveSteps(): FlatActiveStep[] {
  const manager = useWorkflowManager();
  const managerSnap = useManagerSnapshot();

  // Subscribe to all coordinators — rebuild when any changes
  const subscribe = useCallback((cb: () => void) => {
    const unsubs: (() => void)[] = [];
    // Subscribe to manager for workflow list changes
    unsubs.push(manager.subscribe(cb));
    // Subscribe to each coordinator
    for (const wf of managerSnap.workflows) {
      const coord = manager.getCoordinator(wf.id);
      if (coord) unsubs.push(coord.subscribe(cb));
    }
    return () => unsubs.forEach(u => u());
  }, [manager, managerSnap.workflows]);

  const getSnapshot = useCallback((): FlatActiveStep[] => {
    const result: FlatActiveStep[] = [];
    for (const wf of managerSnap.workflows) {
      if (wf.status !== 'running') continue;
      const coord = manager.getCoordinator(wf.id);
      if (!coord) continue;
      const snap = coord.getSnapshot();
      for (const stepInfo of snap.activeSteps) {
        result.push({
          workflowId: wf.id,
          workflowLocalId: wf.localId,
          workflowVersion: wf.version,
          stepInfo,
          properties: snap.properties,
          inputParameters: snap.stepParams[stepInfo.step.oid]?.inputParameters ?? snap.inputParameters,
          mediaMap: snap.mediaMap,
          stepParams: snap.stepParams,
        });
      }
    }
    return result;
  }, [manager, managerSnap.workflows]);

  return useSyncExternalStore(subscribe, getSnapshot);
}
```

- [ ] **Step 2: Rewrite ActiveScreen.tsx**

```tsx
import { useCallback, useEffect, useState, useRef } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import type { EmblaCarouselType } from 'embla-carousel';
import { Check } from 'lucide-react';
import type { UserAction } from '@engine/types.js';
import { useWorkflowManager, useManagerSnapshot } from '../../manager/useWorkflowManager';
import { useAllActiveSteps } from '../../manager/useAllActiveSteps';
import type { ManagedWorkflow } from '../../manager/types';
import { ActiveStepCard } from '../ActiveStepCard';
import styles from './ActiveScreen.module.css';

function DotIndicator({ count, selected }: { count: number; selected: number }) {
  if (count <= 1) return null;
  return (
    <div className={styles.dots}>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className={`${styles.dot}${i === selected ? ` ${styles.dotActive}` : ''}`} />
      ))}
    </div>
  );
}

export function ActiveScreen() {
  const manager = useWorkflowManager();
  const managerSnap = useManagerSnapshot();
  const allSteps = useAllActiveSteps();
  const [selected, setSelected] = useState(0);
  const [completedWf, setCompletedWf] = useState<{ name: string; id: string } | null>(null);

  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true, align: 'start', containScroll: false });

  // Track workflow removals for completion overlay
  const prevWorkflowsRef = useRef<ManagedWorkflow[]>(managerSnap.workflows);
  useEffect(() => {
    const prev = prevWorkflowsRef.current;
    prevWorkflowsRef.current = managerSnap.workflows;
    for (const pw of prev) {
      if (pw.status === 'running' && !managerSnap.workflows.some(w => w.id === pw.id)) {
        setCompletedWf({ name: pw.localId, id: pw.id });
        const timer = setTimeout(() => setCompletedWf(null), 3000);
        return () => clearTimeout(timer);
      }
    }
  }, [managerSnap.workflows]);

  // Sync Embla selection
  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = (api: EmblaCarouselType) => {
      setSelected(api.selectedScrollSnap());
    };
    emblaApi.on('select', onSelect);
    onSelect(emblaApi);
    return () => { emblaApi.off('select', onSelect); };
  }, [emblaApi]);

  // Update manager focus when selected step changes
  useEffect(() => {
    const currentStep = allSteps[selected];
    if (currentStep) {
      manager.focusWorkflow(currentStep.workflowId);
    }
  }, [selected, allSteps, manager]);

  // Reindex when steps change
  useEffect(() => {
    if (emblaApi) emblaApi.reInit();
  }, [emblaApi, allSteps.length]);

  // Clamp selected if steps shrink
  useEffect(() => {
    if (allSteps.length > 0 && selected >= allSteps.length) {
      setSelected(allSteps.length - 1);
    }
  }, [allSteps.length, selected]);

  const onAction = useCallback(
    (action: UserAction) => {
      const currentStep = allSteps[selected];
      if (!currentStep) return;
      manager.getCoordinator(currentStep.workflowId)?.submitAction(action);
    },
    [manager, allSteps, selected],
  );

  const completionOverlay = completedWf && (
    <div className={styles.completionOverlay}>
      <div className={styles.completionCard}>
        <Check size={32} className={styles.completionIcon} />
        <p className={styles.completionTitle}>Workflow Complete</p>
        <p className={styles.completionName}>{completedWf.name}</p>
      </div>
    </div>
  );

  if (allSteps.length === 0) {
    return (
      <div className={styles.activeScreen}>
        <div className={styles.emptyState}>No active steps</div>
        {completionOverlay}
      </div>
    );
  }

  return (
    <div className={styles.activeScreen}>
      <div className={styles.stepViewport} ref={emblaRef}>
        <div className={styles.stepContainer}>
          {allSteps.map((flat, i) => (
            <div className={styles.stepSlide} key={`${flat.workflowId}-${flat.stepInfo.step.oid}`}>
              <ActiveStepCard
                step={flat.stepInfo}
                onAction={onAction}
                properties={flat.properties}
                inputParameters={flat.inputParameters}
                mediaMap={flat.mediaMap}
              />
            </div>
          ))}
        </div>
      </div>
      <DotIndicator count={allSteps.length} selected={selected} />
      {completionOverlay}
    </div>
  );
}
```

- [ ] **Step 3: Update TitleBar ActiveTitleBar to use selected step from carousel**

The TitleBar currently reads the focused workflow and its first active step. Now it needs to show whichever step is currently selected in the carousel.

Option: Store the selected flat step index in a shared context or derive from focused workflow. Simplest approach: expose selected step info via a small context.

Create `src/components/screens/ActiveStepContext.tsx`:

```tsx
import { createContext, useContext } from 'react';

interface ActiveStepContextValue {
  workflowLocalId: string;
  workflowVersion: string;
  stepLocalId: string;
}

export const ActiveStepContext = createContext<ActiveStepContextValue | null>(null);

export function useActiveStepContext(): ActiveStepContextValue | null {
  return useContext(ActiveStepContext);
}
```

In `ActiveScreen.tsx`, wrap the return in the provider:

```tsx
const currentStep = allSteps[selected];
const stepCtx = currentStep ? {
  workflowLocalId: currentStep.workflowLocalId,
  workflowVersion: currentStep.workflowVersion,
  stepLocalId: currentStep.stepInfo.step.step.local_id,
} : null;

return (
  <ActiveStepContext.Provider value={stepCtx}>
    <div className={styles.activeScreen}>
      ...
    </div>
  </ActiveStepContext.Provider>
);
```

Note: The provider must wrap the `activeScreen` div, but TitleBar is outside ActiveScreen in the AppShell tree. So the context must be higher up. Better approach: lift the context provider into AppShell, and have ActiveScreen set it. Use a callback pattern:

In `AppShell.tsx`, add state for activeStepInfo and pass setter to ActiveScreen:

```tsx
const [activeStepInfo, setActiveStepInfo] = useState<{ workflowLocalId: string; workflowVersion: string; stepLocalId: string } | null>(null);
```

Pass to ActiveScreen: `<ActiveScreen onStepChange={setActiveStepInfo} />`
Pass to TitleBar: `<TitleBar activeTab={activeTab} activeStepInfo={activeStepInfo} />`

ActiveScreen calls `onStepChange` whenever selected step changes.

TitleBar reads `activeStepInfo` when on the active tab.

- [ ] **Step 4: Clean up ActiveScreen.module.css**

Remove workflow carousel styles. Keep step carousel + dots + completion:

```css
.activeScreen {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.stepViewport {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 0 8px;
}

.stepContainer {
  display: flex;
  touch-action: pan-y pinch-zoom;
  height: 100%;
  align-items: stretch;
}

.stepSlide {
  flex: 0 0 100%;
  min-width: 0;
  height: 100%;
  padding: 0 4px;
}

.dots {
  display: flex;
  justify-content: center;
  gap: 6px;
  padding: 8px;
  flex-shrink: 0;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #d0d0d0;
  transition: background 0.2s;
}

.dotActive { background: #2980b9; }

.emptyState {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 40px;
  color: #999;
  font-size: 16px;
  text-align: center;
}

.completionOverlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.7);
  z-index: 10;
}

.completionCard {
  background: #e8f8e8;
  border-radius: 12px;
  padding: 24px 32px;
  text-align: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.completionIcon { color: #27ae60; margin-bottom: 8px; }
.completionTitle { font-size: 16px; font-weight: 600; color: #2d3436; margin: 0 0 4px; }
.completionName { font-size: 13px; color: #636e72; margin: 0; }
```

- [ ] **Step 5: Verify — `npx tsc --noEmit` and test carousel with loaded workflows**

Run: `npx tsc --noEmit`
Expected: No errors. Carousel loops. TitleBar updates on swipe.

- [ ] **Step 6: Commit**

```bash
git add src/components/screens/ActiveScreen.tsx src/components/screens/ActiveScreen.module.css \
  src/components/screens/ActiveStepContext.tsx \
  src/manager/useAllActiveSteps.ts \
  src/components/shell/AppShell.tsx src/components/shell/TitleBar.tsx
git commit -m "feat: unified looping step carousel across all workflows

Single Embla carousel with loop:true for all active steps from all workflows.
TitleBar dynamically updates workflow/step info on swipe.
Remove two-level workflow+step carousel architecture.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Chunk 4: FormRenderer Vertical Distribution

### Task 7: Distribute form elements vertically to fill working area

Ignore the layout's y-positions and distribute elements evenly top-to-bottom with spacing.

**Files:**
- Modify: `src/components/FormRenderer.tsx`
- Modify: `src/App.css` (step layout adjustments)

- [ ] **Step 1: Rewrite FormRenderer to use vertical distribution**

Instead of absolute positioning at y-coordinates, render elements in a flex column with even spacing. Keep x/width for horizontal positioning but ignore y/height for vertical layout — let each element take its natural height and distribute space between them.

```tsx
import { useRef, useEffect, useState } from 'react';
import type { FormLayoutExportEntry, FormElement } from '@engine/types.js';
import { getElementComponent } from './elements/registry';

interface FormRendererProps {
  layouts: FormLayoutExportEntry[];
  formValues: Record<string, unknown>;
  onFormChange: (fieldName: string, value: unknown) => void;
  onButtonPress: (outputValue: string) => void;
  properties: Record<string, string>;
  inputParameters: Record<string, string>;
  viewportOverride?: 'phone' | 'tablet' | 'desktop';
  mediaMap: Record<string, string>;
}

const BREAKPOINTS: { type: 'phone' | 'tablet' | 'desktop'; minWidth: number }[] = [
  { type: 'desktop', minWidth: 1024 },
  { type: 'tablet', minWidth: 600 },
  { type: 'phone', minWidth: 0 },
];

function pickLayout(
  layouts: FormLayoutExportEntry[],
  containerWidth: number,
  viewportOverride?: 'phone' | 'tablet' | 'desktop',
): FormLayoutExportEntry {
  if (viewportOverride) {
    const match = layouts.find((l) => l.deviceType === viewportOverride);
    if (match) return match;
  }
  for (const bp of BREAKPOINTS) {
    if (containerWidth >= bp.minWidth) {
      const match = layouts.find((l) => l.deviceType === bp.type);
      if (match) return match;
    }
  }
  return layouts[0];
}

export function FormRenderer({ layouts, formValues, onFormChange, onButtonPress, properties, inputParameters, viewportOverride, mediaMap }: FormRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(390);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    setContainerWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  const layout = pickLayout(layouts, containerWidth, viewportOverride);

  // Sort elements by original y-position (top to bottom)
  const sortedElements = [...layout.elements].sort((a, b) => a.y - b.y);

  return (
    <div ref={containerRef} className="form-renderer" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: '100%', height: '100%', padding: '8px 0' }}>
      {sortedElements.map((el, i) => (
        <FormElementSlot
          key={i}
          element={el}
          formValues={formValues}
          onFormChange={onFormChange}
          onButtonPress={onButtonPress}
          properties={properties}
          inputParameters={inputParameters}
          mediaMap={mediaMap}
        />
      ))}
    </div>
  );
}

function FormElementSlot({
  element,
  formValues,
  onFormChange,
  onButtonPress,
  properties,
  inputParameters,
  mediaMap,
}: {
  element: FormElement;
  formValues: Record<string, unknown>;
  onFormChange: (fieldName: string, value: unknown) => void;
  onButtonPress: (outputValue: string) => void;
  properties: Record<string, string>;
  inputParameters: Record<string, string>;
  mediaMap: Record<string, string>;
}) {
  const Component = getElementComponent(element.type);
  if (!Component) return null;
  return (
    <div className="form-element-slot" style={{ width: '100%' }}>
      <Component
        element={element}
        formValues={formValues}
        onFormChange={onFormChange}
        onButtonPress={onButtonPress}
        properties={properties}
        inputParameters={inputParameters}
        mediaMap={mediaMap}
      />
    </div>
  );
}
```

- [ ] **Step 2: Update step wrapper CSS for full-height flex**

In `src/App.css`, ensure `.step-yesno` and `.step-ui` fill their container:

```css
.step-yesno,
.step-ui {
  display: flex;
  flex-direction: column;
  height: 100%;
  flex: 1;
}

.form-renderer {
  flex: 1;
}

.step-yesno-buttons {
  display: flex;
  gap: 12px;
  padding: 12px 0;
  flex-shrink: 0;
}
```

Remove the `margin-top: auto` from `.step-yesno-buttons` (no longer needed — the flex `space-between` on the form renderer handles distribution, and buttons sit after the form naturally).

- [ ] **Step 3: Update ActiveStepCard.module.css**

Ensure the card passes full height to its children:

```css
.card {
  padding: 2px 16px 16px;
  border-radius: 8px;
  background: #fff;
  height: 100%;
  display: flex;
  flex-direction: column;
}
```

Keep `min-height: 200px` removed (the working area defines the available space now).

- [ ] **Step 4: Verify — `npx tsc --noEmit` and test with a multi-element form**

Run: `npx tsc --noEmit`
Expected: No errors. Form elements distributed vertically filling the working area.

- [ ] **Step 5: Commit**

```bash
git add src/components/FormRenderer.tsx src/App.css src/components/ActiveStepCard.module.css
git commit -m "feat: distribute form elements vertically to fill working area

Replace absolute y-position layout with flex column space-between.
Elements sorted by original y-position and spread to fill available height.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Chunk 5: Cleanup and Polish

### Task 8: Remove old HeaderBar, clean up unused code

**Files:**
- Delete: `src/components/shell/HeaderBar.tsx` (replaced by TitleBar)
- Delete: `src/components/shell/HeaderBar.module.css`
- Modify: any remaining imports of HeaderBar

- [ ] **Step 1: Remove HeaderBar files and verify no imports reference them**

Search for `HeaderBar` imports across the codebase. Remove the files and fix any remaining references.

```bash
grep -r "HeaderBar" src/
```

Remove the files:
```bash
rm src/components/shell/HeaderBar.tsx src/components/shell/HeaderBar.module.css
```

- [ ] **Step 2: Remove old WorkflowLoader.tsx and WorkflowRunner.tsx if unused**

Check if `WorkflowLoader.tsx` and `WorkflowRunner.tsx` are imported anywhere. These are Phase 3 components that may no longer be used:

```bash
grep -r "WorkflowLoader\|WorkflowRunner" src/
```

If unused, remove them.

- [ ] **Step 3: Set default tab to 'home' in AppShell**

Verify that `useState<TabId>('home')` is the default (changed from 'active' in the new AppShell).

- [ ] **Step 4: Final verification**

Run: `npx tsc --noEmit`
Run: `npx vite build`
Expected: Both succeed with no errors.

Visually test all three device sizes:
- Phone (430x932): Reserved 60px, Title 100px, Working 706px, Buttons 60px
- Tablet (768x1024): Reserved 60px, Title 100px, Working 788px, Buttons 70px
- Desktop (1200x800): Reserved 40px, Title 90px, Working 600px, Buttons 65px

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove old HeaderBar and unused Phase 3 components

Clean up replaced components after UI layout overhaul.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```
