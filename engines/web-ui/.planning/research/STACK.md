# Technology Stack

**Project:** TrajectoryRuntime Web UI v2.0 Rebuild
**Researched:** 2026-03-13
**Mode:** Stack additions for new UI capabilities
**Overall Confidence:** HIGH

## Existing Stack (Unchanged)

These are validated and locked. Not re-researched.

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 19.1.0 | UI framework |
| react-dom | 19.1.0 | DOM rendering |
| Vite | 6.3.5 | Build tool / dev server |
| TypeScript | 5.7.0 | Type safety |
| JSZip | 3.10.1 | Workflow archive extraction |
| @engine/engine-web | local | Pure-function workflow engine |

## New Stack Additions

### 1. CSS Modules (Built-in to Vite) -- Styling

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| CSS Modules | N/A (Vite built-in) | Scoped component styling | Zero-dependency, zero-config, already works |

**Rationale:** Vite supports CSS Modules out of the box with zero configuration. Any file named `*.module.css` gets automatic class name scoping. This is the right choice because:

- **No new dependency** -- Vite handles it natively. Just name files `ComponentName.module.css`.
- **Familiar CSS** -- No utility-class learning curve (Tailwind), no runtime cost (CSS-in-JS).
- **Scoped by default** -- No class name collisions across components.
- **TypeScript support** -- Add a `css.d.ts` declaration file for type-safe imports.
- **Perfect for this project size** -- ~15-20 components. Tailwind's utility classes add cognitive overhead without proportional benefit at this scale.

**NOT Tailwind because:** The project has ~15-20 components with specific device-frame layouts. CSS Modules give full control over layout math (device frame sizing, responsive breakpoints) without fighting utility classes. Tailwind is better for large teams needing design consistency; this is a single-developer project where explicit CSS is clearer.

**NOT CSS-in-JS because:** Runtime overhead, React 19 server component concerns, and unnecessary complexity for a web-only app.

**Setup:** Zero. Just create `*.module.css` files and import them:
```typescript
// src/global.d.ts (one-time type declaration)
declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
```

**Confidence:** HIGH -- Verified via Vite official documentation that CSS Modules work with zero config.

---

### 2. Embla Carousel 8.6.0 -- Swipe/Carousel

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| embla-carousel-react | 8.6.0 | Swipe carousel for active steps, overview thumbnails | Lightweight, React 19 compatible, headless |
| embla-carousel | 8.6.0 | Core carousel engine (peer dep) | Required by embla-carousel-react |

**Rationale:** Embla Carousel is the best choice for this project because:

- **React 19 support verified** -- peerDependencies: `react: "^16.8.0 || ^17.0.1 || ^18.0.0 || ^19.0.0"` (verified via `npm info` on 2026-03-13).
- **Tiny footprint** -- ~50KB unpacked (vs Swiper at 300KB+). For 2 carousel instances (active steps, overview thumbnails), Embla is proportional.
- **Headless design** -- Returns hooks, you control the markup and styling. Perfect with CSS Modules; no style overriding battles.
- **Touch/swipe optimized** -- Fluid motion with great swipe precision, exactly what device-frame simulation needs.
- **No deprecated API concerns** -- Swiper is migrating from React components to Web Components (Swiper Element), creating API instability. Embla's React hooks API is stable.

**NOT Swiper because:** Swiper is deprecating its React components in favor of Swiper Element (web components). React doesn't natively support web components well, requiring manual `useRef`/`useEffect` initialization. This is an unnecessary complication. Embla's hooks-based API is cleaner and more React-idiomatic.

**NOT React Slick because:** jQuery heritage, heavier bundle, less modern API.

**Integration points:**
- Active Steps tab: horizontal carousel of step cards
- Overview tab: thumbnail carousel of workflow steps
- Both use the same Embla instance pattern with different styling

**Confidence:** HIGH -- Version and peer dependencies verified via npm registry.

---

### 3. Lucide React 0.577.0 -- Icons

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| lucide-react | 0.577.0 | Icons for tabs, buttons, step types, state commands | Tree-shakable, React 19 compatible, 1500+ icons |

**Rationale:**

- **React 19 support verified** -- peerDependencies: `react: "^16.5.1 || ^17.0.0 || ^18.0.0 || ^19.0.0"` (verified via `npm info` on 2026-03-13).
- **Tree-shakable** -- Only imported icons end up in the bundle. With ~20-30 icons needed, actual bundle impact is minimal (~30KB for the icons used).
- **Consistent visual language** -- Clean, modern line icons. Covers all needs: navigation tabs (Home, Activity, Grid, Clock, Settings), step types (Play, Pause, Square, etc.), state commands.
- **SVG-based** -- Renders as inline SVG, easily styled with CSS (color, size via `currentColor` and `width`/`height`).

**CRITICAL: Import pattern matters for dev server performance.** Use direct icon imports to avoid Vite dev server slowdowns (1600+ module resolution without tree-shaking in dev mode):

```typescript
// GOOD -- direct import, fast in dev
import { Home } from 'lucide-react';

// BAD -- barrel import, slow in dev (but both work in prod)
import * as Icons from 'lucide-react';
```

**NOT react-icons because:** react-icons bundles multiple icon sets; lucide-react is a single consistent set. Smaller install, consistent visual style.

**NOT custom SVGs because:** Maintaining 20-30 custom SVG icons is unnecessary work when a well-maintained library exists.

**Confidence:** HIGH -- Version and peer dependencies verified via npm registry.

---

### 4. Custom SVG Rendering -- Workflow Visualization

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| React + SVG (no library) | N/A | Workflow step graph / thumbnail | Our graph is simple; React Flow is overkill |

**Rationale:** The workflow visualization needs are simple: render color-coded rectangles (steps) connected by lines (connections), sized to fit a thumbnail or detail view. This does NOT need a graph library.

**Why NOT React Flow (@xyflow/react 12.10.1):**
- React Flow is 1.2MB unpacked, designed for interactive node editors (drag-drop, zoom, pan, edge routing).
- Our visualization is read-only: colored boxes with lines between them. No interaction needed beyond "tap to navigate."
- React Flow's styling system would conflict with our CSS Modules approach.
- Massive overhead for what amounts to ~100 lines of SVG rendering code.

**Why NOT D3:**
- D3 manipulates the DOM directly, conflicting with React's rendering model.
- Our data is already structured (WorkflowSpec has steps and connections). We just need to position and draw them.

**What to build instead:**
- A `<WorkflowGraph>` component that takes `steps[]` and `connections[]`
- Uses simple layout algorithm: topological sort, assign rows/columns, render SVG `<rect>` and `<line>` elements
- Color-code by step state (not-started, active, completed, paused, etc.)
- Two render modes: thumbnail (small, overview tab) and detail (larger, tappable)
- Total code: ~150-250 lines of TypeScript + SVG

**Confidence:** HIGH -- Based on analysis of the workflow spec structure (steps have defined connections, graph is a simple DAG) and React Flow's feature set being far beyond our needs.

---

### 5. Bottom Tab Navigation -- Custom CSS

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Custom implementation | N/A | 5-tab bottom navigation bar | Web app, not React Native; CSS is simpler than a library |

**Rationale:** Bottom tab navigation in a web app is a CSS layout problem, not a routing problem. The app has exactly 5 fixed tabs with no dynamic routing needs.

**What to build:**
- A `<TabBar>` component with 5 fixed tabs
- CSS: `position: fixed; bottom: 0; display: flex;` with equal-width children
- State: `useState<TabName>` in the app shell, passed as context
- Each tab renders its screen component (conditional rendering, not URL routing)

**Why NOT react-router:**
- The app is a single-page workflow viewer, not a multi-page site
- No URLs to bookmark, no back/forward navigation semantics
- Tab state is ephemeral (resets on reload is fine; workflow state is in the store)
- Adding react-router for 5 tabs is architectural overhead with no user benefit

**Why NOT a tab library:**
- Every tab library will fight our device-frame simulation layout
- The tab bar must render INSIDE the device frame for phone/tablet modes, OUTSIDE for desktop mode
- Custom CSS gives us this control; libraries assume standard layout

**Confidence:** HIGH -- Standard CSS pattern, no external dependencies needed.

---

### 6. Device Frame Simulation -- Custom CSS

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Custom CSS + React | N/A | Phone/tablet/desktop frame rectangles | Unique layout requirement, no library exists |

**Rationale:** Device frame simulation (rendering the app inside a bordered rectangle that looks like a phone/tablet screen) is a custom layout concern. No library exists for this because it's application-specific.

**What to build:**
- A `<DeviceFrame>` component that wraps the app content
- Three modes: phone (375x812), tablet (768x1024), desktop (full viewport)
- CSS: `width`, `height`, `border-radius`, `border`, `overflow: hidden`, centered on page
- Responsive: phone frame on large screens, full-bleed on actual phone screens
- The tab bar, header, and content all render INSIDE the frame

**Implementation approach:**
```css
/* Phone frame on desktop */
.deviceFrame--phone {
  width: 375px;
  height: 812px;
  border: 8px solid #1a1a1a;
  border-radius: 40px;
  overflow: hidden;
  margin: 0 auto;
}

/* Full viewport on actual mobile */
@media (max-width: 430px) {
  .deviceFrame--phone {
    width: 100vw;
    height: 100vh;
    border: none;
    border-radius: 0;
  }
}
```

**Confidence:** HIGH -- Pure CSS/React, no external dependencies.

---

## Complete New Dependencies

```bash
npm install embla-carousel-react embla-carousel lucide-react
```

That's it. Three packages. Everything else is custom code with CSS Modules (built into Vite).

## Alternatives Considered

| Category | Recommended | Alternative | Why Not Alternative |
|----------|-------------|-------------|---------------------|
| Styling | CSS Modules (built-in) | Tailwind CSS 4 | Overkill for ~15 components; obscures layout math for device frames |
| Carousel | Embla Carousel 8.6.0 | Swiper 11.x | Deprecating React components; migrating to web components |
| Icons | lucide-react 0.577.0 | react-icons 5.x | Multi-set bundle; inconsistent visual style across icon families |
| Graph viz | Custom SVG | React Flow 12.x | 1.2MB for read-only colored boxes; massive overkill |
| Navigation | Custom tabs + CSS | react-router 7.x | No URL routing needed; tabs must work inside device frame |
| Navigation | Custom tabs + CSS | Material UI BottomNavigation | Pulls in entire MUI; heavy for one component |

## What NOT to Add

| Library | Why Not |
|---------|---------|
| **Tailwind CSS** | Adds build complexity (PostCSS config), learning curve, and fights device-frame pixel math. CSS Modules are zero-config in Vite. |
| **React Router** | No multi-page routing needed. Tab switching is local state, not URL state. |
| **Material UI / Chakra / Ant Design** | Component libraries impose design systems. Device frame simulation requires full layout control. These fight more than they help. |
| **Framer Motion** | Animation library. Nice-to-have but not needed for v2.0 MVP. Can add later for tab transitions. |
| **React Flow / D3** | Workflow graph is simple colored boxes with lines. Custom SVG is ~200 lines vs a heavy dependency. |
| **Zustand / Redux** | WorkflowCoordinator with useSyncExternalStore already handles state. No additional state library needed. |
| **Styled Components / Emotion** | CSS-in-JS adds runtime overhead and React 19 compatibility concerns. CSS Modules are better. |

## Dev Dependencies (No Changes)

The existing dev stack (Vite, TypeScript, @vitejs/plugin-react) handles everything. No new dev dependencies needed.

## Version Pinning Strategy

Pin exact versions in package.json to avoid surprise breakage:

```json
{
  "dependencies": {
    "embla-carousel": "8.6.0",
    "embla-carousel-react": "8.6.0",
    "lucide-react": "0.577.0"
  }
}
```

## Sources

### Verified via npm registry (2026-03-13)
- embla-carousel-react: v8.6.0, peerDeps `react: ^16.8.0 || ^17.0.1 || ^18.0.0 || ^19.0.0`
- lucide-react: v0.577.0, peerDeps `react: ^16.5.1 || ^17.0.0 || ^18.0.0 || ^19.0.0`
- @xyflow/react: v12.10.1, peerDeps `react: >=17` (evaluated and rejected)

### Web Sources
- [Vite CSS Modules documentation](https://vite.dev/guide/features) -- confirms zero-config CSS Modules support
- [Embla Carousel React docs](https://www.embla-carousel.com/get-started/react/) -- headless carousel API
- [Lucide React docs](https://lucide.dev/guide/packages/lucide-react) -- tree-shaking guidance
- [Lucide React tree-shaking with Vite](https://javascript.plainenglish.io/tree-shaking-lucide-react-icons-with-vite-and-vitest-57bf4cfe6032) -- dev server performance tip
- [Swiper migration to Web Components](https://swiperjs.com/blog/using-swiper-element-in-react) -- why Swiper React is deprecated
- [React Flow](https://reactflow.dev) -- evaluated and rejected as overkill
