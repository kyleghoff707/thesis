#!/usr/bin/env python3
"""
Section Renderers — Pure functions for extracting render-ready data from pipeline sections.

Handles the polymorphism across all 3 pipeline output formats (One Pager, Pitch Deck,
Final Thesis) where section data structures vary in shape and key names.

Usage:
    from scripts.pdf.section_renderers import get_narrative, get_tables, get_red_flags

    section = report_data.get_section('radar')
    text = get_narrative(section)
    tables = get_tables(section)
    flags = get_red_flags(section)
"""


def _clean_narrative(text):
    """Strip inline <cite> tags and replace internal jargon in narrative text.

    1. <cite index="...">visible text</cite> -> just the visible text
    2. Self-closing <cite .../> tags -> removed entirely
    3. "DataPacket" / "data packet" references -> "Thesis toolbox"
    """
    import re

    if not text:
        return text

    # Strip <cite index="...">content</cite> -> keep content
    text = re.sub(r'<cite\s+[^>]*>(.*?)</cite>', r'\1', text)

    # Strip self-closing <cite .../> tags
    text = re.sub(r'<cite\s+[^/]*/>', '', text)

    # Replace internal "DataPacket" terminology with user-facing name
    text = re.sub(r'(?i)\bthe\s+DataPacket\b', 'the Thesis toolbox', text)
    text = re.sub(r'(?i)\bDataPacket\b', 'Thesis toolbox', text)
    text = re.sub(r'(?i)\bdata\s+packet\b', 'Thesis toolbox', text)
    text = re.sub(r'(?i)\baccording to Thesis toolbox\b', 'according to the Thesis toolbox', text)

    # Clean up any double spaces left by tag removal
    text = re.sub(r'  +', ' ', text)

    return text.strip()


def get_narrative(section):
    """
    Return the best available text for a section.

    Priority:
    1. narrative field if substantial (>100 chars and not a stub like 'See full...')
    2. Join verdictRationale + summary as fallback
    3. Empty string if nothing available

    Inline <cite> tags are stripped and "DataPacket" references are replaced
    with "Thesis toolbox" for user-facing display.

    Args:
        section: Section dict from pipeline output

    Returns:
        str: Best available narrative text, cleaned for display
    """
    if not isinstance(section, dict):
        return ''

    narr = section.get('narrative', '')
    if isinstance(narr, str) and len(narr) > 100 and not narr.startswith('See full'):
        return _clean_narrative(narr)

    # Fall back to verdictRationale + summary
    parts = []
    vr = section.get('verdictRationale', '')
    if isinstance(vr, str) and vr:
        parts.append(vr)
    sm = section.get('summary', '')
    if isinstance(sm, str) and sm:
        parts.append(sm)

    return _clean_narrative('\n\n'.join(parts))


def get_tables(section):
    """
    Extract render-ready tables from a section.

    Looks for dicts with 'headers' or 'columns' key in the section's tables field,
    and also in the data field's nested structures.

    Returns:
        list of {title: str, headers: list, rows: list of lists}
    """
    if not isinstance(section, dict):
        return []

    result = []

    # Check section.tables (primary location)
    tables = section.get('tables', [])
    if isinstance(tables, list):
        for t in tables:
            if not isinstance(t, dict):
                continue
            hdrs = t.get('headers', t.get('columns', []))
            if not hdrs:
                continue
            result.append({
                'title': t.get('title', ''),
                'headers': hdrs,
                'rows': t.get('rows', []),
            })

    # Check section.data for nested tables
    data = section.get('data', {})
    if isinstance(data, dict):
        for key, val in data.items():
            if isinstance(val, list) and len(val) > 0 and isinstance(val[0], dict):
                # Could be a table-like array of objects
                if 'headers' in val[0] or 'columns' in val[0]:
                    for t in val:
                        hdrs = t.get('headers', t.get('columns', []))
                        if hdrs:
                            result.append({
                                'title': t.get('title', key),
                                'headers': hdrs,
                                'rows': t.get('rows', []),
                            })

    return result


def get_red_flags(section):
    """
    Extract red flags as a list of strings.

    Handles polymorphic input:
    - string -> pass through
    - dict -> extract .flag or .detail or str(dict)
    - int/float -> convert to string
    - None -> skip

    Returns:
        list of str
    """
    if not isinstance(section, dict):
        return []

    flags = section.get('redFlags', [])
    if not isinstance(flags, list):
        return []

    result = []
    for rf in flags:
        if isinstance(rf, str):
            result.append(rf)
        elif isinstance(rf, dict):
            text = rf.get('flag') or rf.get('detail') or rf.get('description') or str(rf)
            result.append(text)
        elif rf is not None:
            result.append(str(rf))
    return result


def _humanize_datapacket_ref(ref):
    """Convert internal DataPacket field paths to human-readable labels.

    e.g. "dataPacket.compensation.executives[1].compensation['2023'].total"
    -> "Executive #2 total compensation (2023)"
    """
    if not ref or not isinstance(ref, str):
        return ref
    if not ref.startswith('dataPacket.'):
        return ref

    # Strip the dataPacket. prefix
    path = ref[len('dataPacket.'):]

    # Extract year from path if present (e.g., ['2023'] or .2023)
    import re
    year_match = re.search(r"\['?(\d{4})'?\]", path)
    year_suffix = f' ({year_match.group(1)})' if year_match else ''

    # Common path humanizations
    if 'compensation.executives' in path:
        idx_match = re.search(r'executives\[(\d+)\]', path)
        idx = int(idx_match.group(1)) + 1 if idx_match else '?'
        field_match = re.search(r"\.(\w+)$", path)
        field = field_match.group(1) if field_match else 'compensation'
        field_label = field.replace('_', ' ').replace('nonEquityIncentive', 'non-equity incentive')
        # Convert camelCase to spaced
        field_label = re.sub(r'([a-z])([A-Z])', r'\1 \2', field_label).lower()
        return f'Executive #{idx} {field_label}{year_suffix}'

    if 'insiders.summary.' in path:
        field = path.split('.')[-1]
        field_label = re.sub(r'([a-z])([A-Z])', r'\1 \2', field).lower()
        field_label = field_label.replace('12 m', '(12M)').replace('open market ', 'open-market ')
        return f'Insider {field_label}'

    if 'financials.' in path:
        parts = path.split('.')
        statement = parts[1] if len(parts) > 1 else ''
        field = parts[-1] if len(parts) > 2 else ''
        field_label = field.replace('_', ' ')
        return f'{statement.capitalize()} — {field_label}{year_suffix}'

    if path == 'ticker':
        return 'Ticker'

    # Generic fallback: last segment, humanized
    last = path.split('.')[-1]
    label = re.sub(r'([a-z])([A-Z])', r'\1 \2', last).replace('_', ' ')
    return label.capitalize() + year_suffix


def get_citations(section):
    """
    Extract citations normalized to list of {ref, text, source}.

    Handles polymorphic input:
    - dict citations: extract ref/claim, text/value, source/url
    - string citations: use as ref with empty text/source
    - int citations: convert to string ref

    DataPacket field paths are humanized to readable labels.

    Returns:
        list of {ref: str, text: str, source: str}
    """
    if not isinstance(section, dict):
        return []

    cites = section.get('citations', [])
    if not isinstance(cites, list):
        return []

    result = []
    for c in cites:
        if isinstance(c, dict):
            ref = c.get('ref') or c.get('claim') or c.get('field') or ''
            text = str(c.get('text') or c.get('value') or c.get('label') or '')
            source = c.get('source') or c.get('url') or 'DataPacket'
            # Humanize internal DataPacket paths
            ref = _humanize_datapacket_ref(ref)
            result.append({'ref': ref, 'text': text, 'source': source})
        elif isinstance(c, str):
            result.append({'ref': c, 'text': '', 'source': ''})
        elif isinstance(c, (int, float)):
            result.append({'ref': str(c), 'text': '', 'source': ''})
    return result


def get_verdict_color(verdict):
    """
    Map verdict string to RGB color tuple.

    PASS -> green (34, 197, 94)
    FAIL -> red (239, 68, 68)
    PARTIAL/WATCHLIST -> amber (245, 158, 11)
    default -> slate (100, 116, 139)

    Returns:
        tuple of (r, g, b) ints
    """
    verdict = str(verdict).upper().strip()
    if verdict == 'PASS':
        return (34, 197, 94)
    elif verdict == 'FAIL':
        return (239, 68, 68)
    elif verdict in ('PARTIAL', 'WATCHLIST', 'CONTEXT', 'REVIEW', 'INSUFFICIENT_DATA'):
        return (245, 158, 11)
    else:
        return (100, 116, 139)


def truncate_text(text, max_chars=500):
    """Truncate text with '...' for summary displays."""
    if not isinstance(text, str):
        return ''
    if len(text) <= max_chars:
        return text
    return text[:max_chars - 3] + '...'


def format_currency(value):
    """
    Format a numeric value as currency string.

    $1.50B for billions, $150M for millions, $150K for thousands, $150.00 otherwise.
    Handles negative values.
    """
    if value is None or not isinstance(value, (int, float)):
        return 'N/A'

    negative = value < 0
    abs_val = abs(value)
    prefix = '-' if negative else ''

    if abs_val >= 1e9:
        return f'{prefix}${abs_val / 1e9:.2f}B'
    elif abs_val >= 1e6:
        return f'{prefix}${abs_val / 1e6:.1f}M'
    elif abs_val >= 1e3:
        return f'{prefix}${abs_val / 1e3:.1f}K'
    else:
        return f'{prefix}${abs_val:.2f}'


def format_pct(value):
    """
    Format a numeric value as percentage string (e.g., '15.2%').

    Handles both decimal (0.152) and already-percentage (15.2) formats.
    Values < 1 are treated as decimal fractions.
    """
    if value is None or not isinstance(value, (int, float)):
        return 'N/A'
    # If value looks like a decimal fraction, convert
    if -1 < value < 1 and value != 0:
        return f'{value * 100:.1f}%'
    return f'{value:.1f}%'


# =============================================================================
# Final Thesis section helpers (verdict box, trade plan, watchpoints,
# promise tracker). Used by generate_final_thesis_pdf.py.
# =============================================================================


def _section_data(section):
    """Return section['data'] as a dict, parsing JSON-string payloads safely."""
    if not isinstance(section, dict):
        return {}
    data = section.get('data', {})
    if isinstance(data, str):
        import json
        try:
            data = json.loads(data)
        except (json.JSONDecodeError, ValueError):
            return {}
    return data if isinstance(data, dict) else {}


def _camel_to_words(s):
    """Convert camelCase or snake_case to 'Title Words'."""
    import re
    s = str(s).replace('_', ' ')
    s = re.sub(r'([a-z])([A-Z])', r'\1 \2', s)
    return s[:1].upper() + s[1:] if s else s


def _format_verdict_value(value):
    """Flatten nested dicts/lists for safe single-line PDF rendering.

    FPDF's multi_cell cannot break on `{}` `[]` characters, and nested
    dict/list reprs also tend to overflow narrow callout cells. Convert
    to compact human-readable form (e.g. {'low':255,'high':380} -> 'low=255, high=380').
    """
    if isinstance(value, dict):
        return ', '.join(f'{_camel_to_words(k).lower()}={v}' for k, v in value.items())
    if isinstance(value, (list, tuple)):
        head = '; '.join(str(v) for v in list(value)[:3])
        return head + ('…' if len(value) > 3 else '')
    return str(value)


def render_verdict_box(pdf, section):
    """
    Render the prose-section verdict callout for Final Thesis prose sections.

    Reads `data.verdict` (a dict with an 'overall' field plus arbitrary
    extra keys describing the rationale) and draws a small bordered
    callout coloured by the overall verdict (PASS / WATCHLIST / FAIL).

    Renders nothing if `data.verdict` is missing or not a dict — graceful
    for legacy reports.
    """
    data = _section_data(section)
    verdict = data.get('verdict')
    if not isinstance(verdict, dict):
        return

    overall = str(verdict.get('overall', 'WATCHLIST')).upper().strip()
    color_map = {
        'PASS': pdf.green_500,
        'WATCHLIST': pdf.amber_500,
        'PARTIAL': pdf.amber_500,
        'CONTEXT': pdf.amber_500,
        'FAIL': pdf.red_500,
    }
    color = color_map.get(overall, pdf.slate_500)

    # Page-break if the box won't fit
    extras = [(k, v) for k, v in verdict.items() if k != 'overall']
    needed = 22 + 6 * len(extras)
    if pdf.get_y() + needed > pdf.h - 25:
        pdf.add_page()

    pdf.ln(2)

    # Border line above the box
    pdf.set_draw_color(*color)
    pdf.set_line_width(0.5)
    y = pdf.get_y()
    pdf.line(pdf.l_margin, y, pdf.w - pdf.r_margin, y)
    pdf.ln(2)

    # Heading
    title = section.get('title') or section.get('key', 'Section')
    pdf.set_font('ArialUni', 'B', 11)
    pdf.set_text_color(*color)
    pdf.cell(0, 6, f'{title} verdict', new_x="LMARGIN", new_y="NEXT")

    # Verdict-detail lines (skip the 'overall' key, render everything else).
    # `new_x="LMARGIN"` is required: fpdf2's multi_cell defaults to
    # XPos.RIGHT, which leaves the cursor at the right margin and gives the
    # next call zero available width (FPDFException: not enough horizontal space).
    pdf.set_font('ArialUni', '', 10)
    pdf.set_text_color(*pdf.slate_700)
    for key, value in extras:
        label = _camel_to_words(key)
        text = f'  {label}: {_format_verdict_value(value)}'
        pdf.multi_cell(0, 5, text, new_x="LMARGIN", new_y="NEXT")

    # Overall stamp
    pdf.ln(1)
    pdf.set_font('ArialUni', 'B', 11)
    pdf.set_text_color(*color)
    pdf.cell(0, 6, f'Verdict: {overall}', new_x="LMARGIN", new_y="NEXT")

    # Reset state for following content
    pdf.set_text_color(*pdf.slate_800)
    pdf.set_font('ArialUni', '', 10)
    pdf.ln(3)


def render_promise_tracker(pdf, section):
    """
    Render the Management Promise Tracker as a 5-column subsection table.

    Pulled from `data.promises` (list of dicts with quarterYear, category,
    quote, evidence, status). Renders nothing if missing.
    """
    data = _section_data(section)
    promises = data.get('promises', [])
    if not isinstance(promises, list) or not promises:
        return

    pdf.add_section_header('Management Promise Tracker', level=2)

    headers = ['Quarter', 'Category', 'Promise', 'Evidence', 'Status']
    rows = []
    for p in promises:
        if not isinstance(p, dict):
            continue
        rows.append([
            str(p.get('quarterYear', p.get('quarter', ''))),
            str(p.get('category', '')),
            str(p.get('quote', p.get('promise', '')))[:160],
            str(p.get('evidence', ''))[:160],
            str(p.get('status', '')),
        ])
    if rows:
        pdf.add_table(headers, rows)


def render_trade_plan(pdf, section):
    """
    Render Section 7 Trade Plan: position sizing, entry tranches table,
    sell rules list, PACE plan, forcing question.

    All sub-blocks render only if their backing data is present.
    """
    data = _section_data(section)

    # Position sizing
    sizing = data.get('positionSizing')
    if sizing:
        pdf.add_section_header('Position Sizing', level=2)
        if isinstance(sizing, str):
            pdf.add_body_text(sizing)
        elif isinstance(sizing, dict):
            for label, value in sizing.items():
                if value is None or value == '':
                    continue
                pdf.add_bullet(f'{_camel_to_words(label)}: {value}')

    # Entry tranches table
    tranches = data.get('tranches', data.get('entryTranches', []))
    if isinstance(tranches, list) and tranches:
        pdf.add_section_header('Entry Tranches', level=2)
        headers = ['Tranche', 'Size', 'Trigger Price', 'Rationale']
        rows = []
        for t in tranches:
            if not isinstance(t, dict):
                continue
            rows.append([
                str(t.get('tranche', t.get('label', ''))),
                str(t.get('size', t.get('sizePct', ''))),
                str(t.get('triggerPrice', t.get('trigger', ''))),
                str(t.get('rationale', ''))[:160],
            ])
        if rows:
            pdf.add_table(headers, rows)

    # Sell rules
    sell_rules = data.get('sellRules', [])
    if isinstance(sell_rules, list) and sell_rules:
        pdf.add_section_header('Sell Rules', level=2)
        for r in sell_rules:
            if isinstance(r, dict):
                trigger = r.get('trigger', '')
                action = r.get('action', '')
                threshold = r.get('threshold', '')
                line = f'{trigger}: {action}' if action else str(trigger)
                if threshold:
                    line += f' (threshold: {threshold})'
                pdf.add_bullet(line)
            elif isinstance(r, str):
                pdf.add_bullet(r)

    # PACE plan
    pace = data.get('pacePlan')
    if isinstance(pace, dict):
        pdf.add_section_header('PACE Plan', level=2)
        for label in ('primary', 'alternative', 'contingency', 'emergency'):
            value = pace.get(label, '')
            if value:
                pdf.add_bullet(f'{label.capitalize()}: {value}')

    # Forcing question
    fq = data.get('forcingQuestion')
    if fq:
        pdf.add_section_header('Forcing Question', level=2)
        pdf.set_font('ArialUni', 'I', 10)
        pdf.set_text_color(*pdf.slate_700)
        pdf.multi_cell(0, 5.5, str(fq))
        pdf.set_font('ArialUni', '', 10)
        pdf.set_text_color(*pdf.slate_800)
        pdf.ln(2)


def render_watchpoints(pdf, section):
    """
    Render the "What we're monitoring" subsection at the end of §6 Compose.

    Reads `data.watchpoints` (list of dicts with metric, currentValue,
    threshold, direction, sourceInversionId). Renders nothing if absent.
    """
    data = _section_data(section)
    watchpoints = data.get('watchpoints', [])
    if not isinstance(watchpoints, list) or not watchpoints:
        return

    pdf.add_section_header("What we're monitoring", level=2)
    for wp in watchpoints:
        if not isinstance(wp, dict):
            continue
        metric = wp.get('metric', '')
        current = wp.get('currentValue', wp.get('current', ''))
        threshold = wp.get('threshold', '')
        direction = str(wp.get('direction', '')).lower()
        if direction == 'below':
            change = 'drops below'
        elif direction == 'above':
            change = 'rises above'
        else:
            change = 'crosses'
        line = f'{metric}.'
        if current != '' and current is not None:
            line += f' Currently {current}.'
        if threshold != '' and threshold is not None:
            line += f' Re-evaluate if it {change} {threshold}.'
        src = wp.get('sourceInversionId')
        if src is not None and src != '':
            line += f' (Source: bear inversion #{src}.)'
        pdf.add_bullet(line)
    pdf.ln(2)
