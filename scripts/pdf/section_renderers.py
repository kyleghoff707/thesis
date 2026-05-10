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


def get_checklist_items(section):
    """
    Extract checklist items from Final Thesis checklist sections.

    Looks in section.data.items and section.data.checklistItems.
    Each item normalized to: {number, item, verdict, evidence, confidence}

    Returns:
        list of dicts
    """
    if not isinstance(section, dict):
        return []

    data = section.get('data', {})
    if not isinstance(data, dict):
        return []

    # Try multiple locations
    items = data.get('items') or data.get('checklistItems') or []
    if not isinstance(items, list):
        return []

    result = []
    for i, item in enumerate(items):
        if isinstance(item, dict):
            result.append({
                'number': item.get('number', item.get('itemNumber', i + 1)),
                'item': item.get('item') or item.get('question') or item.get('name', ''),
                'verdict': item.get('verdict', 'N/A'),
                'evidence': item.get('evidence') or item.get('rationale') or item.get('explanation', ''),
                'confidence': item.get('confidence', 'MEDIUM'),
            })
        elif isinstance(item, str):
            result.append({
                'number': i + 1,
                'item': item,
                'verdict': 'N/A',
                'evidence': '',
                'confidence': 'LOW',
            })
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
