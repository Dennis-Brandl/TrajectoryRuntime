# Phase 4: Shell + Device Frame - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Structural container for all future screens: a realistic device frame (phone 430x932, tablet 768x1024, desktop 1200x800) with 5-tab navigation bar, header bar, and a frame switcher control outside the frame. Content inside uses CSS container queries. No real screen content — placeholders only.

</domain>

<decisions>
## Implementation Decisions

### Device frame appearance
- Moderate realism: rounded bezel with dynamic island for phone, home indicator bar at bottom
- Tablet gets iPad-like frame with bezel and rounded corners
- Desktop gets a browser-window-style rectangle with minimal title bar (no device chrome)
- Frame color adapts to app's light/dark mode (bezel matches theme)
- Background outside the frame is solid neutral (light gray or dark, no gradient)

### Frame switcher control
- Positioned centered above the device frame, always visible
- iOS-style segmented control: single rounded container with sliding highlight on active option
- Labels: Phone, Tablet, Desktop
- Smooth resize animation (~300ms) when switching between device sizes
- Persists last selected device to localStorage, restores on reload

### Tab bar design
- Outlined icons when inactive, filled icons when active (Lucide React)
- Tab bar elevated with subtle upward shadow (no border line)
- Tapping already-active tab scrolls its content to top
- Five tabs: Home, Active, Overview, History, Settings

### Header bar
- Solid background color (not transparent/blur)
- Placeholder areas for workflow name and step name (populated by later phases)

### Claude's Discretion
- Tab labels: whether to always show all labels or active-only (decide based on frame size fit)
- Tab switch transition: crossfade vs instant (pick what feels right)
- Exact bezel thickness, corner radius, shadow values
- Dynamic island vs notch styling for phone frame
- Title bar button styling for desktop frame window chrome

</decisions>

<specifics>
## Specific Ideas

- Segmented control should feel like a native iOS segmented control with sliding highlight animation
- Phone frame should evoke modern iPhone (dynamic island area, home indicator bar, no physical button)
- Active tab on the tab bar should have basic test content (sample text, a button) to verify container queries and frame sizing work
- Other 4 placeholder screens show centered icon + screen name + brief purpose hint + "(Coming in Phase N)"

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-shell-device-frame*
*Context gathered: 2026-03-13*
