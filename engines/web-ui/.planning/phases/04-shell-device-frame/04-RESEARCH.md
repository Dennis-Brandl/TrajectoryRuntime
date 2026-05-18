# Phase 4: Shell + Device Frame - Research

**Researched:** 2026-03-13
**Domain:** CSS layout (container queries, device frames), React component architecture (tab navigation, state preservation), Lucide React icons
**Confidence:** HIGH

## Summary

Phase 4 builds the structural container for all future v2.0 screens: a realistic device frame (phone/tablet/desktop) with a 5-tab bottom navigation bar, header bar, and an external frame switcher control. The phase introduces CSS Modules (replacing the current single App.css), CSS container queries (replacing media queries inside frames), and Lucide React for icons.

The current codebase uses a flat `App.css` with class-name-based styling, a simple viewport selector (three buttons), and renders workflow content directly. Phase 4 replaces this with a structured shell architecture: outer page (frame switcher + device bezel) wrapping an inner app shell (header + tab content area + tab bar). Content inside the frame uses CSS container queries keyed to the frame's container, not the browser viewport.

**Primary recommendation:** Build the shell as three layers -- `DeviceFrame` (bezel + sizing), `AppShell` (header + tab bar + content area), and individual tab screen placeholders -- using CSS Modules for scoping and CSS container queries for responsive layout inside frames.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| lucide-react | ^0.577.0 | Tab bar icons (outlined/filled) | Tree-shakable, 1500+ icons, SVG-based, first-class React support. Decided in v2.0 roadmap. |
| CSS Modules | built-in (Vite) | Component-scoped styling | Zero config in Vite -- any `.module.css` file auto-scopes. Decided in v2.0 roadmap. |
| CSS Container Queries | native CSS | Responsive layout inside device frames | No library needed -- `@container` is natively supported in all modern browsers (Chrome 105+, Firefox 110+, Safari 16+, >95% global coverage). Decided in v2.0 roadmap. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none) | -- | -- | No additional libraries needed for Phase 4. Segmented control and device frame are pure CSS + React. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| CSS Modules | Tailwind CSS | Tailwind adds build complexity and a new mental model; CSS Modules are simpler and already decided |
| Hand-built segmented control | Third-party component lib | No good web-only React segmented control exists; hand-building is straightforward with CSS variables + transitions |
| lucide-react | react-icons | react-icons bundles entire icon sets; lucide-react is tree-shakable by default |

**Installation:**
```bash
npm install lucide-react
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── components/
│   ├── shell/                    # NEW - Phase 4 shell components
│   │   ├── DeviceFrame.tsx       # Bezel, dynamic island, home indicator
│   │   ├── DeviceFrame.module.css
│   │   ├── FrameSwitcher.tsx     # Segmented control (Phone/Tablet/Desktop)
│   │   ├── FrameSwitcher.module.css
│   │   ├── AppShell.tsx          # Header + content area + tab bar
│   │   ├── AppShell.module.css
│   │   ├── HeaderBar.tsx         # Workflow name + step name
│   │   ├── HeaderBar.module.css
│   │   ├── TabBar.tsx            # 5 icon tabs
│   │   └── TabBar.module.css
│   ├── screens/                  # NEW - Tab screen placeholders
│   │   ├── HomeScreen.tsx
│   │   ├── ActiveScreen.tsx      # Will host WorkflowRunner content in Phase 5+
│   │   ├── OverviewScreen.tsx
│   │   ├── HistoryScreen.tsx
│   │   └── SettingsScreen.tsx
│   ├── elements/                 # Existing (unchanged)
│   ├── WorkflowRunner.tsx        # Existing (unchanged for now)
│   └── ...                       # Existing components
├── coordinator/                  # Existing (unchanged)
├── hooks/                        # NEW
│   └── useLocalStorage.ts        # Generic localStorage hook for frame persistence
├── App.tsx                       # Restructured: outer shell host
├── App.css                       # Existing global styles (kept, trimmed later)
└── main.tsx                      # Unchanged
```

### Pattern 1: Device Frame with CSS Container
**What:** The DeviceFrame component sets `container-type: inline-size` on the content area, making all children responsive to the frame width rather than the viewport.
**When to use:** Always -- this is the core pattern for the entire v2.0 UI.

```typescript
// DeviceFrame.module.css
.frameContent {
  container-type: inline-size;
  container-name: device;
  width: 100%;
  height: 100%;
  overflow: hidden;
  position: relative;
}

// Usage inside any child component's CSS module:
@container device (width > 600px) {
  .card {
    flex-direction: row;
  }
}
```

### Pattern 2: Tab State Preservation via CSS display
**What:** All five tab screens are always mounted in the DOM. The inactive tabs are hidden with `display: none`. This preserves component state (scroll position, form inputs, etc.) across tab switches.
**When to use:** Required by NAV-03 (tab state preserved across switches).

```tsx
// AppShell.tsx
function AppShell() {
  const [activeTab, setActiveTab] = useState<TabId>('home');

  return (
    <div className={styles.shell}>
      <HeaderBar />
      <div className={styles.content}>
        <div style={{ display: activeTab === 'home' ? 'contents' : 'none' }}>
          <HomeScreen />
        </div>
        <div style={{ display: activeTab === 'active' ? 'contents' : 'none' }}>
          <ActiveScreen />
        </div>
        {/* ... other tabs ... */}
      </div>
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}
```

**Note on `display: contents` vs `display: block`:** Using `display: contents` for the active tab wrapper lets the screen component participate directly in the parent's layout without an extra wrapper div affecting CSS. For hidden tabs, `display: none` removes them from layout entirely. An alternative is to use `visibility: hidden; position: absolute; height: 0; overflow: hidden` but `display: none` is simpler and sufficient since we only need to preserve React state, not scroll position (scroll preservation is a Phase 5+ concern).

### Pattern 3: Segmented Control with CSS Variables
**What:** The frame switcher uses a sliding highlight `::before` pseudo-element positioned via CSS custom properties (`--highlight-width`, `--highlight-x-pos`). React measures the active segment's `offsetWidth` and `offsetLeft` via refs and sets these CSS variables on the container. The `::before` has `transition: transform 0.3s ease` for smooth animation.
**When to use:** For the FrameSwitcher component.

```tsx
// FrameSwitcher.tsx (simplified)
const segments = [
  { value: 'phone', label: 'Phone' },
  { value: 'tablet', label: 'Tablet' },
  { value: 'desktop', label: 'Desktop' },
];

function FrameSwitcher({ value, onChange }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const segmentRefs = useRef<(HTMLDivElement | null)[]>([]);
  const activeIndex = segments.findIndex(s => s.value === value);

  useEffect(() => {
    const seg = segmentRefs.current[activeIndex];
    const container = containerRef.current;
    if (seg && container) {
      container.style.setProperty('--highlight-width', `${seg.offsetWidth}px`);
      container.style.setProperty('--highlight-x-pos', `${seg.offsetLeft}px`);
    }
  }, [activeIndex]);

  return (
    <div className={styles.container} ref={containerRef}>
      <div className={styles.controls}>
        {segments.map((seg, i) => (
          <div
            key={seg.value}
            ref={el => { segmentRefs.current[i] = el; }}
            className={i === activeIndex ? styles.active : styles.inactive}
          >
            <input
              type="radio" name="frame" value={seg.value}
              checked={i === activeIndex}
              onChange={() => onChange(seg.value)}
            />
            <label>{seg.label}</label>
          </div>
        ))}
      </div>
    </div>
  );
}
```

```css
/* FrameSwitcher.module.css */
.controls {
  position: relative;
  display: flex;
  background: #e5e7eb;
  border-radius: 8px;
  padding: 3px;
}

.controls::before {
  content: '';
  position: absolute;
  top: 3px;
  bottom: 3px;
  left: 0;
  width: var(--highlight-width);
  transform: translateX(var(--highlight-x-pos));
  background: #fff;
  border-radius: 6px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  transition: transform 0.3s ease, width 0.3s ease;
  z-index: 0;
}
```

### Pattern 4: localStorage Persistence
**What:** A `useLocalStorage` hook wraps `useState` with read/write to localStorage. Used for persisting the selected frame device.
**When to use:** Frame switcher state (FRAME-04 requirement: persists last selected device).

```typescript
// hooks/useLocalStorage.ts
function useLocalStorage<T>(key: string, defaultValue: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored !== null ? JSON.parse(stored) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  const setAndPersist = useCallback((next: T) => {
    setValue(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch { /* quota exceeded -- ignore */ }
  }, [key]);

  return [value, setAndPersist];
}
```

### Pattern 5: Device Frame Sizing (Fixed Pixels, No Scale Transform)
**What:** Each device frame has fixed pixel dimensions applied as `width` and `height` on the frame container. The outer page scrolls if the browser window is smaller than the frame. No `transform: scale()` is used -- this avoids scroll/touch breakage (decided in v2.0 roadmap).

```css
/* DeviceFrame.module.css */
.frame {
  position: relative;
  margin: 0 auto;
  transition: width 0.3s ease, height 0.3s ease;
}

.phone {
  width: 430px;
  height: 932px;
}

.tablet {
  width: 768px;
  height: 1024px;
}

.desktop {
  width: 1200px;
  height: 800px;
}
```

### Anti-Patterns to Avoid
- **Media queries inside frames:** Use `@container` queries, never `@media` queries, for layout changes inside the device frame. Media queries respond to the browser viewport, not the frame.
- **Conditional rendering for tab switching:** Do not use `{activeTab === 'home' && <HomeScreen />}` -- this unmounts the component and loses state. Use CSS `display: none` instead.
- **transform: scale() on frames:** Breaks scroll events, touch targets, and text rendering. Use fixed pixel dimensions and let the page scroll.
- **Container query on the container itself:** `@container` queries apply to *descendants* of the container, not the container element itself. The element with `container-type` cannot query its own size.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Icon rendering | Custom SVG sprites or icon fonts | `lucide-react` components | Tree-shakable, accessible (aria-hidden), consistent 24px grid, TypeScript types |
| CSS scoping | BEM naming conventions in App.css | CSS Modules (`.module.css`) | Vite auto-scopes; no naming collisions; zero config |
| Responsive inside frames | JS-based resize observers | CSS `@container` queries | Native CSS, no JS overhead, declarative, broadly supported |

**Key insight:** The entire device frame concept is a layout problem, not a component library problem. There is no suitable off-the-shelf "device frame" component. The bezel, dynamic island, and home indicator are straightforward CSS (border-radius, background, pseudo-elements). Building these from scratch is the correct approach.

## Common Pitfalls

### Pitfall 1: Container Query Target Confusion
**What goes wrong:** Developers put `container-type: inline-size` on an element and then write `@container` rules targeting that same element's styles. The queries never match.
**Why it happens:** Misunderstanding that container queries measure the container but style its *descendants*.
**How to avoid:** The element with `container-type` is the measurement boundary. All `@container` rules must target child/descendant selectors.
**Warning signs:** Styles inside `@container` blocks never activate regardless of frame size.

### Pitfall 2: Container Sizing Collapse
**What goes wrong:** A container with `container-type: inline-size` collapses to zero width because it has no explicit width and its parent doesn't constrain it.
**Why it happens:** `container-type: inline-size` applies `contain: inline-size` which removes intrinsic sizing -- the element cannot be sized by its content.
**How to avoid:** Always give the container element an explicit width (e.g., `width: 100%`) or place it inside a parent that constrains its width (like the device frame with fixed pixel dimensions).
**Warning signs:** Frame content area renders as zero-width; nothing visible inside the frame.

### Pitfall 3: Flex Children and Container Queries
**What goes wrong:** Container queries on direct flex children don't work as expected because the flex item's container is the flex parent, not the item itself.
**Why it happens:** You need a wrapper element between the flex container and the queried content.
**How to avoid:** Add a wrapper `<div>` with `container-type: inline-size` inside the flex item, then query against that wrapper.
**Warning signs:** Layout breaks when nesting container queries inside flex/grid layouts.

### Pitfall 4: Tab State Lost on Re-render
**What goes wrong:** Tab screens unmount and lose form state, scroll position, or timer state when switching tabs.
**Why it happens:** Using conditional rendering (`{active && <Screen />}`) instead of CSS visibility.
**How to avoid:** Render all screens always; hide inactive ones with `display: none`.
**Warning signs:** User fills a form on one tab, switches away and back, form is empty.

### Pitfall 5: Segmented Control Highlight Flicker on Mount
**What goes wrong:** The sliding highlight pseudo-element jumps or flickers when the component first mounts because CSS variables are not yet set.
**Why it happens:** The `useEffect` that measures segment widths runs after first paint, causing a visible layout shift.
**How to avoid:** Initially render without the CSS transition class (e.g., `ready` class), then add it after the first measurement. The `::before` element positions instantly on mount, then animates on subsequent changes.
**Warning signs:** Highlight slides from position (0,0) to the correct position on page load.

### Pitfall 6: Lucide Filled vs Outlined Confusion
**What goes wrong:** Developer expects Lucide to have separate filled icon components (like Material Icons). Lucide does not have filled variants.
**Why it happens:** Lucide is a stroke-based icon library. Fill is an SVG property you apply manually.
**How to avoid:** For "filled when active" tab icons, use `fill="currentColor"` and `strokeWidth={0}` on the active icon, and default stroke rendering for inactive. Not all Lucide icons fill well -- test each icon. Good candidates: `House`, `Activity`, `LayoutDashboard`, `History`, `Settings`.
**Warning signs:** Filled icon looks broken (hollow interior, misaligned paths).

## Code Examples

### Device Frame Component (Phone variant)
```tsx
// DeviceFrame.tsx
import styles from './DeviceFrame.module.css';

type DeviceType = 'phone' | 'tablet' | 'desktop';

interface DeviceFrameProps {
  device: DeviceType;
  children: React.ReactNode;
}

export function DeviceFrame({ device, children }: DeviceFrameProps) {
  return (
    <div className={`${styles.frame} ${styles[device]}`}>
      {/* Phone: dynamic island + home indicator */}
      {device === 'phone' && <div className={styles.dynamicIsland} />}
      {/* Desktop: title bar with window buttons */}
      {device === 'desktop' && (
        <div className={styles.titleBar}>
          <div className={styles.windowButtons}>
            <span className={styles.dot} />
            <span className={styles.dot} />
            <span className={styles.dot} />
          </div>
        </div>
      )}

      <div className={styles.frameContent}>
        {children}
      </div>

      {device === 'phone' && <div className={styles.homeIndicator} />}
    </div>
  );
}
```

### Lucide Icons for Tab Bar (Outlined/Filled Pattern)
```tsx
// TabBar.tsx
import { House, Activity, LayoutDashboard, History, Settings } from 'lucide-react';
import styles from './TabBar.module.css';

const TABS = [
  { id: 'home', label: 'Home', icon: House },
  { id: 'active', label: 'Active', icon: Activity },
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'history', label: 'History', icon: History },
  { id: 'settings', label: 'Settings', icon: Settings },
] as const;

export type TabId = typeof TABS[number]['id'];

interface TabBarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

export function TabBar({ activeTab, onTabChange }: TabBarProps) {
  return (
    <nav className={styles.tabBar}>
      {TABS.map(({ id, label, icon: Icon }) => {
        const isActive = activeTab === id;
        return (
          <button
            key={id}
            className={`${styles.tab} ${isActive ? styles.active : ''}`}
            onClick={() => onTabChange(id)}
          >
            <Icon
              size={22}
              fill={isActive ? 'currentColor' : 'none'}
              strokeWidth={isActive ? 0 : 1.5}
            />
            <span className={styles.label}>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
```

### CSS Container Query Usage Inside Frame
```css
/* ActiveScreen.module.css (future Phase 5 example, validates the pattern) */
.stepList {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

@container device (width >= 768px) {
  .stepList {
    flex-direction: row;
    flex-wrap: wrap;
  }
  .stepCard {
    flex: 1 1 calc(50% - 0.375rem);
  }
}
```

### Tap Active Tab Scrolls to Top
```tsx
// In TabBar or AppShell
const contentRefs = useRef<Record<TabId, HTMLDivElement | null>>({});

function handleTabChange(tab: TabId) {
  if (tab === activeTab) {
    // Already active -- scroll to top
    contentRefs.current[tab]?.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    setActiveTab(tab);
  }
}
```

### Frame Resize Animation
```css
/* DeviceFrame.module.css */
.frame {
  transition: width 0.3s ease, height 0.3s ease;
}
```
The ~300ms transition on width/height creates a smooth resize when switching between phone/tablet/desktop. CSS container queries inside will automatically re-evaluate as the container resizes.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Media queries for responsive | Container queries for component-level responsive | Feb 2023 (baseline support) | Components respond to their container, not viewport -- essential for device frame pattern |
| BEM class naming | CSS Modules | Stable for years | Auto-scoped class names, no collisions |
| Icon fonts (Font Awesome) | SVG icon components (Lucide) | ~2020 onward | Tree-shakable, accessible, styleable per-instance |
| JS resize observer polyfills | Native @container | 2023+ | No JS needed for responsive layout inside containers |

**Deprecated/outdated:**
- `@media` queries inside device frames: Wrong abstraction. The frame is not the viewport.
- Manual BEM naming in shared CSS: Error-prone at scale. CSS Modules handle scoping automatically.

## Open Questions

1. **Lucide icon fill quality for all 5 tab icons**
   - What we know: `fill="currentColor" strokeWidth={0}` works on simple icons like `House` and `Settings`. More complex icons like `LayoutDashboard` may not fill cleanly.
   - What's unclear: Whether all 5 chosen icons produce good filled variants.
   - Recommendation: During implementation, test each icon with fill. If an icon doesn't fill well, keep it outlined and use a thicker `strokeWidth` (e.g., 2.5) plus the active color to differentiate active state. Alternatively, use a background pill highlight behind the active icon instead of fill.

2. **Dynamic island vs notch styling**
   - What we know: Context says "dynamic island" for the phone frame -- a pill-shaped cutout at top center, matching modern iPhone design.
   - What's unclear: Exact dimensions for visual fidelity.
   - Recommendation: Use a pill shape roughly 126px wide x 37px tall, centered horizontally, positioned at the top of the frame inside the bezel area. This is decorative only -- no functional purpose.

3. **Tab labels: always visible or active-only**
   - What we know: This is explicitly in Claude's discretion. Phone frame is 430px with 5 tabs = 86px per tab.
   - Recommendation: Always show all labels on all frame sizes. At 86px per tab on phone, short labels (Home, Active, Overview, History, Settings) fit comfortably with a small icon above each. This is standard iOS/Android pattern. No need for active-only labels.

4. **Tab switch transition: crossfade vs instant**
   - What we know: This is explicitly in Claude's discretion.
   - Recommendation: Instant transition (no crossfade). Crossfade adds complexity (opacity transitions, potential layout thrashing with multiple visible screens) for minimal UX benefit. Native iOS tab bars switch instantly. Keep it simple.

## Sources

### Primary (HIGH confidence)
- [MDN @container reference](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@container) -- full syntax, features, browser support
- [Lucide React official docs](https://lucide.dev/guide/packages/lucide-react) -- installation, props, tree-shaking
- [Lucide filled icons guide](https://lucide.dev/guide/advanced/filled-icons) -- fill technique (fill prop + strokeWidth={0})
- [Vite features: CSS Modules](https://vite.dev/guide/features) -- built-in .module.css support, configuration
- Existing codebase (`App.tsx`, `App.css`, `WorkflowCoordinator.ts`) -- current architecture and patterns

### Secondary (MEDIUM confidence)
- [Let's Build UI: Segmented Control](https://www.letsbuildui.dev/articles/building-a-segmented-control-component/) -- CSS variable + translateX pattern for sliding highlight, verified with working implementation
- [Container Queries on web.dev](https://web.dev/learn/css/container-queries) -- usage patterns, gotchas
- [Can I Use: Container Queries](https://caniuse.com/css-container-queries) -- >95% global browser support as of 2026

### Tertiary (LOW confidence)
- None -- all findings verified with primary or secondary sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- lucide-react, CSS Modules, and container queries are all decided and well-documented
- Architecture: HIGH -- patterns are straightforward React + CSS, verified against official docs
- Pitfalls: HIGH -- container query gotchas are well-documented in MDN and web.dev; tab preservation is a known React pattern

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable technologies, no fast-moving dependencies)
