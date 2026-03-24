# stickeR1 UI Design System Reference

Use this document to replicate the stickeR1 visual style in a new React app. The design is Notion/Linear-inspired — clean, minimal, information-dense with strong use of color for meaning.

---

## Tech Stack

- **React 19** (functional components + hooks)
- **Vite** dev server
- **Inline styles** (no CSS framework, no Tailwind classes)
- **Recharts** for charts (pie, line, area)
- All styles reference a mutable color object `C` that switches between light/dark palettes

---

## Typography

```js
fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Helvetica, Arial, sans-serif"
```

| Element | Size | Weight | Extra |
|---------|------|--------|-------|
| App base | 13px | — | lineHeight: 1.5, antialiased |
| Page/brand title | 17px | 700 | letterSpacing: "-0.01em" |
| Section headers | 13px | 700 | letterSpacing: "0.02em" |
| Labels (uppercase) | 11px | 500-600 | textTransform: "uppercase", letterSpacing: "0.03-0.04em" |
| Table headers | 11px | 600 | uppercase, letterSpacing: "0.04em" |
| Table cells | 12px | — | — |
| Body text | 13px | 500 | — |
| Helper/caption text | 11px | 400 | muted color |
| Subtitle | 12px | 400 | muted color |
| Modal title | 16px | 700 | — |
| Login brand mark | 28px | 400/700 | letterSpacing: "-0.02em" |

---

## Color Palette

### Light Mode (`C_LIGHT`)
```js
{
  bg: "#f8f9fb",           // page background
  card: "#ffffff",         // card / surface background
  text: "#1e293b",         // primary text (slate-800)
  muted: "#94a3b8",        // secondary/label text (slate-400)
  headerBg: "#f8f9fb",     // table header background
  headerText: "#1e293b",   // table header text
  border: "#e2e8f0",       // all borders (slate-200)
  rowAlt: "#f8fafc",       // alternating row bg
  hoverBg: "#f1f5f9",      // row/item hover background
  inputBg: "#f8fafc",      // input highlight row bg
  strikeBg: "#f1f5f9",     // strike/key row bg

  // Semantic colors
  red: "#ef4444",
  blue: "#3b82f6",
  green: "#22c55e",
  amber: "#d97706",

  // Tooltip
  tooltipBg: "#1e293b",
  tooltipText: "#f1f5f9",

  // Code blocks
  codeBg: "#f1f5f9",
}
```

### Dark Mode (`C_DARK`)
```js
{
  bg: "#0f172a",           // page background (slate-900)
  card: "#1e293b",         // card / surface (slate-800)
  text: "#f1f5f9",         // primary text (slate-100)
  muted: "#64748b",        // secondary text (slate-500)
  headerBg: "#0f172a",     // table header bg
  headerText: "#f1f5f9",   // table header text
  border: "#334155",       // all borders (slate-700)
  rowAlt: "#1e293b",       // alternating row bg
  hoverBg: "#334155",      // row/item hover
  inputBg: "#1e293b",      // input row bg
  strikeBg: "#283548",     // key row bg

  // Semantic colors (brighter for dark bg)
  red: "#f87171",
  blue: "#60a5fa",
  green: "#4ade80",
  amber: "#fbbf24",

  // Tooltip (inverted)
  tooltipBg: "#f1f5f9",
  tooltipText: "#1e293b",

  codeBg: "#334155",
}
```

### Accent Colors (shared in both modes)
```js
blue:    "#3b82f6"   // primary brand, active states, links
green:   "#22c55e"   // success, positive values, toggles ON
red:     "#ef4444"   // danger, negative values
amber:   "#d97706"   // warnings
orange:  "#f59e0b"   // secondary accent
purple:  "#a855f7"   // tertiary accent
indigo:  "#6366f1"   // portfolio/nav accent
teal:    "#14b8a6"   // secondary positive
sky:     "#0ea5e9"   // info accent
pink:    "#ec4899"   // highlight accent
```

### Alert Banners (light / dark)
```js
// Red alert
alertRedBg:     "#fef2f2" / "#450a0a"
alertRedBorder: "#fca5a5" / "#991b1b"
alertRedText:   "#dc2626" / "#fca5a5"

// Amber alert
alertAmberBg:     "#fffbeb" / "#451a03"
alertAmberBorder: "#fcd34d" / "#92400e"
alertAmberText:   "#92400e" / "#fcd34d"

// Purple alert
alertPurpleBg:     "#faf5ff" / "#2e1065"
alertPurpleBorder: "#c084fc" / "#6d28d9"
alertPurpleText:   "#7c3aed" / "#c4b5fd"
```

### Dark Mode Switching
```js
const C = { ...C_LIGHT };
const applyDarkMode = (dark) => Object.assign(C, dark ? C_DARK : C_LIGHT);
```
All styles read from the mutable `C` object via ES6 getters, so toggling dark mode instantly updates everything.

---

## Spacing & Layout

| Element | Value |
|---------|-------|
| Page max-width | 1400px |
| Page padding | 16px 20px |
| Top bar padding | 14px 24px |
| Card/table border-radius | 8px |
| Modal border-radius | 12px (settings), 16px (login) |
| Button border-radius | 6px |
| Input border-radius | 6px |
| Badge border-radius | 9999px (pill) |
| Input padding | 6px 10px |
| Button padding | 7px 16px |
| Table cell padding | 8px 14px (normal), 4-6px 14px (compact) |
| Tab padding | 10px 20px |
| Section header margin-top | 24px |

---

## Core Component Styles

### Top Bar (Header)
```js
{
  background: C.card,
  padding: "14px 24px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  borderBottom: `1px solid ${C.border}`,
  boxShadow: "0 1px 3px 0 rgba(0,0,0,0.04)"
}
```

### Tabs (Underline Style)
```js
// Tab container
{ display: "flex", gap: 0, borderBottom: `1px solid ${C.border}`, background: C.card, paddingLeft: 24 }

// Individual tab
tab: (active) => ({
  padding: "10px 20px",
  cursor: "pointer",
  fontWeight: active ? 600 : 500,
  fontSize: 13,
  borderBottom: active ? `2px solid ${C.text}` : "2px solid transparent",
  color: active ? C.text : C.muted,
  background: "transparent",
  transition: "color .15s, border-color .15s",
  marginBottom: -1
})
```

### Buttons
```js
btn: (variant) => ({
  padding: "7px 16px",
  borderRadius: 6,
  border: variant === "primary" || variant === "danger" ? "none" : `1px solid ${C.border}`,
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 12,
  background: variant === "primary" ? C.blue
             : variant === "danger" ? "#ef4444"
             : C.card,                                  // "outline" default
  color: variant === "primary" || variant === "danger" ? "#fff" : C.text,
  transition: "all .15s",
  boxShadow: variant === "primary" || variant === "danger"
    ? "0 1px 2px 0 rgba(0,0,0,0.05)" : "none"
})
```

### Inputs
```js
{
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  padding: "6px 10px",
  fontSize: 13,
  width: "100%",
  maxWidth: 200,
  outline: "none",
  background: C.card,
  color: C.text,
  transition: "border-color .15s, box-shadow .15s"
}
```

### Selects
```js
{
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  padding: "6px 10px",
  fontSize: 13,
  outline: "none",
  background: C.card,
  color: C.text,
  minWidth: 120,
  transition: "border-color .15s"
}
```

### Tables
```js
// Table wrapper
{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 8, marginTop: 8, background: C.card }

// Table header cell
{
  padding: "10px 14px",     // or 6px 14px in compact mode
  background: C.headerBg,
  fontWeight: 600,
  fontSize: 11,
  textAlign: "left",
  whiteSpace: "nowrap",
  borderBottom: `1px solid ${C.border}`,
  position: "sticky", top: 0,
  color: C.muted,
  textTransform: "uppercase",
  letterSpacing: "0.04em"
}

// Table data cell
td: (color) => ({
  padding: "8px 14px",     // or 4px 14px in compact mode
  fontSize: 12,
  whiteSpace: "nowrap",
  borderBottom: `1px solid ${C.border}`,
  color: color || C.text
})
```

### Badges (Status Pills)
```js
badge: (status) => {
  const colors = {
    OPEN: "#22c55e",
    CLOSED: "#8b5cf6",
    EXPIRED: "#64748b",
    // etc.
  };
  const c = colors[status] || "#94a3b8";
  return {
    display: "inline-block",
    padding: "2px 10px",
    borderRadius: 9999,        // full pill
    fontSize: 11,
    fontWeight: 600,
    background: c + "14",      // color at 8% opacity
    color: c,
    border: "none"
  };
}
```

**Pattern**: Badge background = the status color hex + `"14"` (appended to make ~8% opacity). Text = the full color. This creates a subtle tinted pill.

### Toggle Switch
```js
toggle: (on) => ({
  width: 40,
  height: 22,
  borderRadius: 11,
  background: on ? "#22c55e" : "#cbd5e1",  // green when on, slate-300 when off
  cursor: "pointer",
  position: "relative",
  transition: "background .2s",
  border: "none",
  padding: 0
})

toggleKnob: (on) => ({
  width: 16,
  height: 16,
  borderRadius: 8,
  background: "#ffffff",
  position: "absolute",
  top: 3,
  left: on ? 21 : 3,
  transition: "left .2s",
  boxShadow: "0 1px 3px rgba(0,0,0,0.2)"
})
```

### Pill Selector (Segmented Control)
```js
pill: (selected) => ({
  padding: "3px 10px",
  fontSize: 11,
  fontWeight: 600,
  borderRadius: 4,
  cursor: "pointer",
  border: `1px solid ${selected ? C.blue : C.border}`,
  background: selected ? C.blue : C.card,
  color: selected ? "#fff" : C.muted,
  transition: "all 0.15s"
})
```

---

## Modal Pattern

### Settings-style Modal (sidebar nav)
```js
// Backdrop
{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 50,
  display: "flex", alignItems: "center", justifyContent: "center" }

// Modal container
{ background: C.card, borderRadius: 12, width: "100%", maxWidth: 720,
  maxHeight: "80vh", display: "flex", flexDirection: "column",
  boxShadow: "0 4px 24px rgba(0,0,0,0.15)", overflow: "hidden" }

// Header bar
{ display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "16px 24px", borderBottom: `1px solid ${C.border}` }

// Sidebar (left nav)
{ width: 180, borderRight: `1px solid ${C.border}`, padding: "8px 0",
  overflowY: "auto", background: C.headerBg }

// Sidebar item
sideItem: (active) => ({
  display: "flex", alignItems: "center", gap: 10,
  padding: "10px 16px", cursor: "pointer", fontSize: 13,
  fontWeight: active ? 600 : 400,
  color: active ? C.text : C.muted,
  background: active ? C.portfolioBg : "transparent",
  borderLeft: active ? `3px solid ${C.portfolioBorder}` : "3px solid transparent",
  transition: "all .15s"
})

// Content area
{ flex: 1, padding: "20px 24px", overflowY: "auto" }

// Save bar (footer)
{ padding: "12px 24px", borderTop: `1px solid ${C.border}`,
  display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12,
  background: C.headerBg }
```

### Login/Auth Modal (centered card)
```js
// Backdrop
{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 60,
  display: "flex", alignItems: "center", justifyContent: "center" }

// Card
{ background: C.card, borderRadius: 16, padding: "40px 36px",
  maxWidth: 420, width: "90%", boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
  textAlign: "center" }

// Input fields
{ width: "100%", padding: "10px 12px", borderRadius: 8,
  border: `1px solid ${C.border}`, background: C.inputBg,
  color: C.text, fontSize: 14, outline: "none" }

// Auth button (OAuth / submit)
{ display: "flex", alignItems: "center", justifyContent: "center",
  padding: "12px 28px", borderRadius: 8, border: `1px solid ${C.border}`,
  background: C.card, color: C.text, fontSize: 15, fontWeight: 600,
  cursor: "pointer", boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
  gap: 10, width: "100%" }

// "or" divider
<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
  <div style={{ flex: 1, height: 1, background: C.border }} />
  <span style={{ fontSize: 12, color: C.muted, fontWeight: 500 }}>or</span>
  <div style={{ flex: 1, height: 1, background: C.border }} />
</div>
```

---

## Interaction Patterns

### Hover Effects
All hover states use `onMouseEnter` / `onMouseLeave` with direct style manipulation (no CSS classes):
```js
onMouseEnter={(e) => e.currentTarget.style.background = C.hoverBg}
onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
```

### Transitions
Standard transition: `"all .15s"` or specific properties:
- Color/border: `"color .15s, border-color .15s"`
- Input focus: `"border-color .15s, box-shadow .15s"`
- Toggle: `"background .2s"` (switch), `"left .2s"` (knob)
- Expand/rotate: `"transform 0.15s"`

### No `alert()` / `confirm()`
All confirmations are **inline UI**. Pattern:
```js
// State
const [confirmDeleteId, setConfirmDeleteId] = useState(null);

// First click → show confirm
<button onClick={() => setConfirmDeleteId(item.id)}>Delete</button>

// Confirm state → show "Are you sure?" with Yes/Cancel
{confirmDeleteId === item.id && (
  <div>
    <span>Are you sure?</span>
    <button onClick={handleDelete}>Yes</button>
    <button onClick={() => setConfirmDeleteId(null)}>Cancel</button>
  </div>
)}
```

### Tooltips
Hover-triggered, absolutely positioned:
```js
const [show, setShow] = useState(false);
<span onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
  ⓘ
  {show && (
    <div style={{
      position: "absolute", top: 20, left: "50%", transform: "translateX(-50%)",
      background: C.tooltipBg, color: C.tooltipText,
      fontSize: 11, padding: "6px 10px", borderRadius: 6,
      whiteSpace: "normal", width: 220, lineHeight: 1.4,
      zIndex: 100, boxShadow: "0 4px 12px rgba(0,0,0,0.15)"
    }}>
      Tooltip text here
    </div>
  )}
</span>
```

### Form Field Pattern (Settings)
```js
<div style={{ marginBottom: 20 }}>
  <div style={{ fontSize: 11, fontWeight: 600, color: C.muted,
    textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
    Field Label
  </div>
  <input style={inputStyle} value={value} onChange={handler} />
  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
    Helper text
  </div>
</div>
```

---

## Chart Styling (Recharts)

- Use `ResponsiveContainer` with fixed height
- Grid: `<CartesianGrid strokeDasharray="3 3" stroke={C.border} />`
- Axis text: `fontSize: 11, fill: C.muted`
- Lines: 2px stroke width, smooth `type="monotone"`
- Custom tooltips matching the app's card style (background: C.card, border, borderRadius: 8, boxShadow)
- Pie chart labels: fontSize 11, fill C.text

---

## Icons

SVG stroke icons (Lucide/Feather style), rendered inline:
```js
<svg width={22} height={22} viewBox="0 0 24 24" fill="none"
  stroke="currentColor" strokeWidth="1.8"
  strokeLinecap="round" strokeLinejoin="round">
  {/* paths */}
</svg>
```

---

## Key Design Principles

1. **Information density** — small font sizes (11-13px), compact padding, lots of data visible at once
2. **Color = meaning** — red/green for profit/loss, colored badges for status, amber for warnings. Colors are the go/no-go gate, not decoration
3. **Minimal chrome** — no heavy shadows, no gradients. Borders are `1px solid` in subtle slate tones. Box shadows are barely-there (`0 1px 3px rgba(0,0,0,0.04)`)
4. **Uppercase labels** — field labels and table headers are always uppercase, small, muted, with letter-spacing
5. **Consistent transitions** — everything animates at 150ms (`"all .15s"`)
6. **Dark mode is first-class** — every element references the `C` palette object, never hardcoded colors
7. **Inline styles only** — no CSS files, no className. All styles are JS objects referencing the `C` palette
8. **No native dialogs** — never use `alert()`, `confirm()`, or `prompt()`. Always inline UI
