---
phase: 05B-one-pager-display-components
plan: 02
type: execute
wave: 2
depends_on: ["05B-01"]
files_modified:
  - src/components/SectionRenderer.jsx
  - src/components/CitationTooltip.jsx
  - src/components/RedFlagCallout.jsx
autonomous: true
requirements: [ONEP-04, ONEP-03]
must_haves:
  truths:
    - "SectionRenderer renders verdictRationale as primary prose text for every COST section"
    - "SectionRenderer renders summary as a highlight callout box"
    - "SectionRenderer renders redFlags array in a warning callout box with amber/red tinting"
    - "SectionRenderer renders crossCuttingFindings as a distinct subsection"
    - "SectionRenderer renders structured data fields (valuation_summary buy prices) as formatted key-value display"
    - "SectionRenderer handles empty citations array without visual artifacts"
    - "SectionRenderer handles missing narrative field without errors"
    - "CitationTooltip renders superscript numbers with hover tooltip showing source and value"
    - "CitationTooltip handles all 3 citation types with distinct formatting"
  artifacts:
    - path: "src/components/SectionRenderer.jsx"
      provides: "Reusable report section display with narrative, data, citations, red flags, cross-cutting findings"
      exports: ["default"]
      min_lines: 100
    - path: "src/components/CitationTooltip.jsx"
      provides: "Inline citation superscript with tooltip and 3-type formatting"
      exports: ["default"]
    - path: "src/components/RedFlagCallout.jsx"
      provides: "Warning callout box for red flags at section bottom"
      exports: ["default"]
  key_links:
    - from: "src/components/SectionRenderer.jsx"
      to: "src/components/VerdictBadge.jsx"
      via: "import VerdictBadge"
      pattern: "import VerdictBadge"
    - from: "src/components/SectionRenderer.jsx"
      to: "src/components/ConfidenceBadge.jsx"
      via: "import ConfidenceBadge"
      pattern: "import ConfidenceBadge"
    - from: "src/components/SectionRenderer.jsx"
      to: "src/components/RedFlagCallout.jsx"
      via: "import RedFlagCallout"
      pattern: "import RedFlagCallout"
    - from: "src/components/SectionRenderer.jsx"
      to: "src/components/CitationTooltip.jsx"
      via: "import CitationTooltip"
      pattern: "import CitationTooltip"
---

<objective>
Build the reusable SectionRenderer component that transforms report section JSON into rich visual display, along with its sub-components for citations and red flags.

Purpose: SectionRenderer is the core rendering engine for all report sections. It takes a section object from the One Pager JSON and renders it as a complete visual block with verdict badge, confidence indicator, prose narrative, structured data, red flag callouts, cross-cutting findings, and inline citations. This component is reused for all 6 One Pager sections and will be reused for Pitch Deck and Full Story sections in later phases.

Output: SectionRenderer.jsx, CitationTooltip.jsx, RedFlagCallout.jsx
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/05B-one-pager-display-components/05B-CONTEXT.md
@.planning/phases/05B-one-pager-display-components/05B-RESEARCH.md
@.planning/phases/05B-one-pager-display-components/05B-01-SUMMARY.md

@src/theme.js
@src/components/VerdictBadge.jsx
@src/components/ConfidenceBadge.jsx
@src/components/CollapsibleSection.jsx
@.thes1s/reports/COST/one-pager.json
@src/schemas/reportSection.js

<interfaces>
<!-- The COST One Pager JSON section structure (verified from real data) -->

Each section object has these fields:
```javascript
{
  key: "company_info",           // Unique section identifier
  title: "Company Information",   // Display title
  sectionNumber: 1,              // Render order
  status: "pass",                // "pass" | "fail" | "review" | "pending"
  confidence: "HIGH",            // "HIGH" | "MEDIUM" | "LOW"
  verdict: "PASS",               // "PASS" | "FAIL" | "WATCHLIST" | null
  verdictRationale: "...",        // Primary prose text — ALWAYS present, multi-sentence
  summary: "...",                 // 1-2 sentence summary — ALWAYS present
  data: {},                       // Only valuation_summary has this (buy prices, FGR, currentPrice)
  narrative: undefined,           // NOT present in current output — handle gracefully
  citations: [],                  // Empty in current output — render only when non-empty
  tables: undefined,              // NOT present in current output — handle gracefully
  redFlags: ["...", "..."],       // Array of strings, ALWAYS present, ALWAYS >= 1
  crossCuttingFindings: [         // ALWAYS present, 2-3 items each
    { finding: "...", relevantAgents: [...], severity: "high"|"medium"|"low", source: "..." }
  ],
}
```

The valuation_summary section's `data` field structure:
```javascript
data: {
  mosBuyPrice: { low: 135.04, high: 177.16 },
  pbtBuyPrice: { low: 246.09, high: 282.01 },
  tenCapPrice: 309.17,
  equityBondBuyPrice: { low: 278.4, high: 335.57 },
  preliminaryFGR: { low: 0.09, high: 0.12 },
  currentPrice: 972.33,
  priceVsBuyRange: "190% above high end of buy range",
  convergence: "All 4 methods converge within $135-$345 buy range",
}
```

From src/schemas/reportSection.js — CitationSchema:
```javascript
{ id: number, ref: string, text: string, source: string }
// source examples: "DataPacket", "10-K FY2024 p.34", "https://..."
```

From Plan 01 outputs:
```javascript
// VerdictBadge: <VerdictBadge verdict="PASS" size="default" />
// ConfidenceBadge: <ConfidenceBadge confidence="HIGH" />
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: CitationTooltip and RedFlagCallout sub-components</name>
  <files>src/components/CitationTooltip.jsx, src/components/RedFlagCallout.jsx</files>
  <read_first>
    - src/theme.js (C palette — C.yellowBg, C.yellow, C.redBg, C.red, C.tooltipBg, C.tooltipText, C.accent, C.textSecondary)
    - src/schemas/reportSection.js (CitationSchema: { id, ref, text, source })
    - .thes1s/reports/COST/one-pager.json (verify citations are empty [], verify redFlags is array of strings)
    - src/components/CollapsibleSection.jsx (reference for inline style patterns and animation)
  </read_first>
  <action>
    **src/components/CitationTooltip.jsx — Inline superscript citations per D-07/D-08/D-09:**

    Props: `{ citation, onClick }` where citation is `{ id, ref, text, source }`.

    The component renders as an inline superscript number that shows a tooltip on hover.

    Three citation types detected by `source` field (per D-09):
    1. **Thes1s native** — `source` starts with "DataPacket" or matches known tab names ("Competitors Tab", "Growth Analysis", "Guru Holdings", etc.). Style: teal accent color, small app icon. onClick navigates to the corresponding Toolbox tab.
    2. **SEC filing** — `source` contains "10-K", "10-Q", "8-K", "proxy", or "SEC". Style: slate color, document icon. onClick opens SEC.gov link or Filings tab.
    3. **Web search** — all other sources (URLs, article references). Style: blue-ish color, external link icon. onClick opens URL in new tab.

    Helper function `getCitationType(source)` returns `'thes1s' | 'sec' | 'web'`.

    **Superscript rendering:**
    - The citation number renders as `<sup>` with `style={{ cursor: 'pointer', color: C.accent, fontSize: 10, fontWeight: 700, marginLeft: 1 }}`.
    - Text content: `[{citation.id}]`.

    **Tooltip on hover:**
    - Use `useState` for `showTooltip` boolean.
    - Wrapper `<span>` with `position: 'relative'`, `display: 'inline'`.
    - Tooltip `<div>` appears on hover with `position: 'absolute'`, `bottom: '100%'`, `left: '50%'`, `transform: 'translateX(-50%)'`.
    - Tooltip content: citation type icon + `source` on first line, `text` on second line (truncated to 120 chars).
    - Tooltip style: `background: C.tooltipBg`, `color: C.tooltipText`, `padding: '6px 10px'`, `borderRadius: 6`, `fontSize: 11`, `lineHeight: 1.4`, `whiteSpace: 'nowrap'` (with max-width 300px and text wrap for long content), `boxShadow: '0 2px 8px rgba(0,0,0,0.15)'`, `zIndex: 1000`.
    - Show on `onMouseEnter`, hide on `onMouseLeave`.

    **Click behavior:** Calls `onClick(citation)` prop — the parent (SectionRenderer/OnePager) handles navigation/scrolling to reference list.

    Export: `export default function CitationTooltip({ citation, onClick })`.

    **Also export a helper for rendering narrative text with inline citations:**
    `export function renderTextWithCitations(text, citations, onCitationClick)` — Takes a text string and citations array. Searches for `[N]` patterns in text. For each match where N corresponds to a citation.id, replaces with `<CitationTooltip citation={found} onClick={onCitationClick} />`. Returns array of React elements (strings and CitationTooltip components). If citations is empty or text has no `[N]` patterns, returns the text as-is.

    **src/components/RedFlagCallout.jsx — Warning callout box per D-06:**

    Props: `{ flags }` where flags is `string[]`.

    If `!flags || flags.length === 0`, return null.

    Renders as a callout box:
    - Outer div: `background: C.yellowBg`, `border: '1px solid ' + C.yellow + '40'` (40 = 25% opacity hex suffix), `borderRadius: 8`, `padding: '12px 16px'`, `marginTop: 16`.
    - Header row: warning triangle SVG icon (14x14, stroke: C.yellow) + "Red Flags" label in `fontSize: 12`, `fontWeight: 700`, `color: C.yellow`, `textTransform: 'uppercase'`, `letterSpacing: '0.04em'`.
    - Flags list: `<ul>` with `margin: '8px 0 0'`, `paddingLeft: 20`, `listStyleType: 'disc'`. Each `<li>` with `fontSize: 13`, `color: C.text`, `lineHeight: 1.5`, `marginBottom: 4`.

    Warning triangle SVG (viewBox="0 0 24 24", fill="none", stroke: C.yellow, strokeWidth="2"):
    ```
    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
    ```

    Export: `export default function RedFlagCallout({ flags })`.
  </action>
  <verify>
    <automated>grep -q "export default function CitationTooltip" src/components/CitationTooltip.jsx &amp;&amp; grep -q "export function renderTextWithCitations" src/components/CitationTooltip.jsx &amp;&amp; grep -q "export default function RedFlagCallout" src/components/RedFlagCallout.jsx &amp;&amp; grep -q "C.yellowBg" src/components/RedFlagCallout.jsx &amp;&amp; npm test &amp;&amp; echo "PASS" || echo "FAIL"</automated>
  </verify>
  <acceptance_criteria>
    - grep -q "export default function CitationTooltip" src/components/CitationTooltip.jsx
    - grep -q "export function renderTextWithCitations" src/components/CitationTooltip.jsx
    - grep -q "getCitationType" src/components/CitationTooltip.jsx (type detection helper)
    - grep -q "thes1s.*sec.*web" src/components/CitationTooltip.jsx (3 citation types)
    - grep -q "tooltipBg" src/components/CitationTooltip.jsx (uses C palette tooltip colors)
    - grep -q "export default function RedFlagCallout" src/components/RedFlagCallout.jsx
    - grep -q "C.yellowBg" src/components/RedFlagCallout.jsx (amber background)
    - grep -q "C.yellow" src/components/RedFlagCallout.jsx (amber accent)
    - grep -q "Red Flags" src/components/RedFlagCallout.jsx (label text)
    - grep -q "import { C } from" src/components/CitationTooltip.jsx
    - grep -q "import { C } from" src/components/RedFlagCallout.jsx
    - npm test passes
  </acceptance_criteria>
  <done>
    CitationTooltip renders superscript [N] with hover tooltip showing source/text, detects 3 citation types (thes1s/sec/web) with distinct formatting. renderTextWithCitations helper injects CitationTooltip components into narrative text. RedFlagCallout renders warning box with amber tinting, triangle icon, and bulleted flag list. Both handle empty/null gracefully.
  </done>
</task>

<task type="auto">
  <name>Task 2: SectionRenderer — the core report section display component</name>
  <files>src/components/SectionRenderer.jsx</files>
  <read_first>
    - .thes1s/reports/COST/one-pager.json (ALL 6 sections — understand what data is present/absent in each)
    - src/components/VerdictBadge.jsx (import and use for section verdict)
    - src/components/ConfidenceBadge.jsx (import and use for section confidence)
    - src/components/RedFlagCallout.jsx (import and use for red flags)
    - src/components/CitationTooltip.jsx (import renderTextWithCitations for narrative)
    - src/theme.js (C palette)
    - src/schemas/reportSection.js (ReportSectionSchema fields — the contract)
  </read_first>
  <action>
    **src/components/SectionRenderer.jsx — Reusable section display per ONEP-04:**

    Props: `{ section, sectionId, onCitationClick }` where section is a ReportSectionSchema object, sectionId is used for scroll anchoring (e.g., `id="section-company_info"`), onCitationClick is passed down to CitationTooltip.

    The component renders a complete section card. Layout from top to bottom:

    **1. Section Header:**
    - `id={sectionId}` for scroll anchor targeting (per D-02 sticky nav)
    - `scrollMarginTop: 120` (accounts for 52px nav + ~60px section nav, per research Pitfall 6)
    - Row layout: section number circle (small, muted) + title (fontSize: 16, fontWeight: 700) + VerdictBadge + ConfidenceBadge on the right
    - Section number: `sectionNumber` in a small circle (24x24, `borderRadius: '50%'`, `background: C.badge`, `color: C.badgeText`, `fontSize: 11`, `fontWeight: 700`, centered)
    - Separator line below header: `borderBottom: '1px solid ' + C.border`, `paddingBottom: 12`, `marginBottom: 16`

    **2. Summary Callout:**
    - Styled as a highlight box: `background: C.accentLight`, `borderLeft: '3px solid ' + C.accent`, `padding: '10px 14px'`, `borderRadius: '0 6px 6px 0'`, `marginBottom: 16`
    - Content: `section.summary` in `fontSize: 13`, `color: C.text`, `lineHeight: 1.6`

    **3. Verdict Rationale (Primary Prose):**
    - `section.verdictRationale` — this is the main body text
    - Render with `renderTextWithCitations(verdictRationale, section.citations, onCitationClick)` to inject any inline citation links
    - Style: `fontSize: 13`, `color: C.text`, `lineHeight: 1.7`, `marginBottom: 16`

    **4. Narrative (Optional — future-proofing):**
    - Only render if `section.narrative` exists and is non-empty string
    - Render with `renderTextWithCitations(narrative, section.citations, onCitationClick)`
    - Style same as verdictRationale but with a subtle top border separator

    **5. Structured Data (Only for sections with non-empty `data`):**
    - Only render if `section.data` is truthy and has keys: `Object.keys(section.data).length > 0`
    - Render as formatted key-value pairs in a grid layout
    - Grid: `display: 'grid'`, `gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))'`, `gap: 12`, `marginBottom: 16`
    - Each data item: card-like box with `background: C.bgCard`, `border: '1px solid ' + C.border`, `borderRadius: 6`, `padding: '10px 12px'`
    - Label: camelCase key converted to title case with helper `camelToTitle(key)` — e.g., "mosBuyPrice" -> "MOS Buy Price", "currentPrice" -> "Current Price"
    - Value: Format based on type:
      - If value is object with `low` and `high` keys: render as range "$X.XX - $Y.YY" using `fmtDollar` style (toLocaleString with 2 decimals)
      - If value is number and key contains "Price" or "price": format as dollar "$X.XX"
      - If value is number and key contains "FGR" or "fgr": format as percentage "X.X%"
      - If value is number: format with 2 decimals
      - If value is string: render as-is
    - Label style: `fontSize: 10`, `fontWeight: 600`, `color: C.textMuted`, `textTransform: 'uppercase'`, `letterSpacing: '0.04em'`, `marginBottom: 4`
    - Value style: `fontSize: 14`, `fontWeight: 700`, `color: C.text`

    **6. Tables (Optional — schema-defined but not in current data):**
    - Only render if `section.tables` exists and is non-empty array
    - For each table: render `table.title` as header, then an HTML `<table>` with `table.headers` as `<thead>` and `table.rows` as `<tbody>`
    - Table styles: `width: '100%'`, `borderCollapse: 'collapse'`, cells with `padding: '8px 12px'`, `borderBottom: '1px solid ' + C.borderLight`, `fontSize: 12`

    **7. Cross-Cutting Findings:**
    - Only render if `section.crossCuttingFindings` exists and is non-empty array
    - Header: "Cross-Cutting Findings" in `fontSize: 12`, `fontWeight: 600`, `color: C.textMuted`, `textTransform: 'uppercase'`, `marginBottom: 8`
    - Each finding as a small card: `background: C.bg`, `borderRadius: 6`, `padding: '8px 12px'`, `marginBottom: 6`
    - Finding text: `fontSize: 12`, `color: C.text`, `lineHeight: 1.5`
    - Severity indicator: small dot (6x6 circle) — high: `C.red`, medium: `C.yellow`, low: `C.green`
    - Source: `fontSize: 11`, `color: C.textMuted`, `marginTop: 2`

    **8. Red Flags:**
    - `<RedFlagCallout flags={section.redFlags} />`

    **Outer wrapper:** Card style matching existing CollapsibleSection: `border: '1px solid ' + C.border`, `borderRadius: 8`, `padding: '16px 20px'`, `marginBottom: 20`, `background: C.bgCard`, `boxShadow: '0 1px 3px 0 rgba(0,0,0,0.04)'`.

    **Helper function `camelToTitle(str)`:** Convert camelCase to Title Case. Split on capital letters, capitalize first letter of each word. Handle acronyms: "mos" -> "MOS", "pbt" -> "PBT", "fgr" -> "FGR". Implementation: `str.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim()`. Then apply acronym map: `{ mos: 'MOS', pbt: 'PBT', fgr: 'FGR', pe: 'P/E' }` for known financial terms.

    Export: `export default function SectionRenderer({ section, sectionId, onCitationClick })`.
  </action>
  <verify>
    <automated>grep -q "export default function SectionRenderer" src/components/SectionRenderer.jsx &amp;&amp; grep -q "import VerdictBadge" src/components/SectionRenderer.jsx &amp;&amp; grep -q "import ConfidenceBadge" src/components/SectionRenderer.jsx &amp;&amp; grep -q "import RedFlagCallout" src/components/SectionRenderer.jsx &amp;&amp; grep -q "renderTextWithCitations" src/components/SectionRenderer.jsx &amp;&amp; grep -q "crossCuttingFindings" src/components/SectionRenderer.jsx &amp;&amp; grep -q "scrollMarginTop" src/components/SectionRenderer.jsx &amp;&amp; npm test &amp;&amp; echo "PASS" || echo "FAIL"</automated>
  </verify>
  <acceptance_criteria>
    - grep -q "export default function SectionRenderer" src/components/SectionRenderer.jsx
    - grep -q "import VerdictBadge" src/components/SectionRenderer.jsx (uses VerdictBadge)
    - grep -q "import ConfidenceBadge" src/components/SectionRenderer.jsx (uses ConfidenceBadge)
    - grep -q "import RedFlagCallout" src/components/SectionRenderer.jsx (uses RedFlagCallout)
    - grep -q "renderTextWithCitations" src/components/SectionRenderer.jsx (citation rendering)
    - grep -q "verdictRationale" src/components/SectionRenderer.jsx (renders primary prose)
    - grep -q "summary" src/components/SectionRenderer.jsx (renders summary callout)
    - grep -q "crossCuttingFindings" src/components/SectionRenderer.jsx (renders findings)
    - grep -q "section.data" src/components/SectionRenderer.jsx (renders structured data)
    - grep -q "section.narrative" src/components/SectionRenderer.jsx (handles optional narrative)
    - grep -q "section.tables" src/components/SectionRenderer.jsx (handles optional tables)
    - grep -q "scrollMarginTop" src/components/SectionRenderer.jsx (scroll offset for sticky header)
    - grep -q "sectionId" src/components/SectionRenderer.jsx (anchor id for scroll nav)
    - grep -q "import { C } from" src/components/SectionRenderer.jsx (uses C palette)
    - npm test passes
  </acceptance_criteria>
  <done>
    SectionRenderer renders a complete report section card from JSON: header with section number + title + verdict badge + confidence badge, summary callout, verdict rationale as primary prose with inline citations, optional narrative, structured data grid (buy prices, FGR), optional tables, cross-cutting findings with severity dots, and red flag callout. Handles all 6 COST sections correctly, including valuation_summary which has structured data. Gracefully handles empty citations, missing narrative, and missing tables.
  </done>
</task>

</tasks>

<verification>
- SectionRenderer correctly renders all 6 COST One Pager sections (verified by visual inspection in Plan 03)
- Empty citations array produces no visual artifacts
- Missing narrative field produces no errors
- valuation_summary section shows formatted buy price data grid
- Red flags appear in amber callout boxes at section bottom
- Cross-cutting findings display with severity dots
- All components use C palette (no hardcoded colors)
</verification>

<success_criteria>
- SectionRenderer transforms report section JSON into rich visual display
- CitationTooltip renders 3 citation types with distinct formatting and hover tooltips
- RedFlagCallout renders amber warning boxes with bulleted flags
- All 6 COST sections render without errors when fed real JSON data
- Components handle empty/missing optional fields gracefully
- No new npm dependencies
</success_criteria>

<output>
After completion, create `.planning/phases/05B-one-pager-display-components/05B-02-SUMMARY.md`
</output>
