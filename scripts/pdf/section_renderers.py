#!/usr/bin/env python3
"""
Section Rendering Helpers
Shared functions for extracting renderable content from pipeline output sections.
Handles agent output polymorphism (string/dict/int citations, string/dict red flags, etc.).
Used by both PDF and Word generators.
"""


def get_narrative(section):
    """Get best available text for a section.
    Priority: narrative > verdictRationale + summary.
    """
    if not section:
        return ''
    narr = section.get('narrative', '')
    if isinstance(narr, str) and len(narr) > 100 and not narr.startswith('See full'):
        return narr
    # Fallback: combine verdictRationale + summary
    parts = []
    vr = section.get('verdictRationale', '')
    if vr:
        parts.append(vr)
    sm = section.get('summary', '')
    if sm:
        parts.append(sm)
    fallback = '\n\n'.join(parts)
    # If narrative exists but is short, prefer it only if fallback is shorter
    if narr and len(narr) > len(fallback):
        return narr
    return fallback or narr or ''


def get_tables(section):
    """Get tables from a section, filtering out non-dict entries.
    Returns list of dicts with {headers, rows, title?}.
    """
    if not section:
        return []
    tables = section.get('tables', [])
    result = []
    for t in tables:
        if isinstance(t, dict) and t.get('headers'):
            result.append(t)
        elif isinstance(t, dict) and t.get('rows'):
            # Tables without explicit headers -- try to infer
            result.append(t)
    return result


def get_red_flags(section):
    """Normalize red flags to a list of strings.
    Handles: str, dict with {flag, detail}, dict with other keys.
    """
    if not section:
        return []
    flags = []
    for rf in section.get('redFlags', []):
        if isinstance(rf, str):
            flags.append(rf)
        elif isinstance(rf, dict):
            text = rf.get('flag', rf.get('detail', rf.get('description', '')))
            if text:
                flags.append(text)
            else:
                flags.append(str(rf))
    return flags


def get_citations(section):
    """Normalize citations to dicts with {ref, text, source}.
    Handles: dict (various key shapes), str, int.
    """
    if not section:
        return []
    cites = []
    for c in section.get('citations', []):
        if isinstance(c, dict):
            cites.append({
                'ref': c.get('ref', c.get('claim', c.get('field', ''))),
                'text': str(c.get('text', c.get('value', ''))),
                'source': c.get('source', c.get('url', 'DataPacket')),
            })
        elif isinstance(c, str):
            cites.append({'ref': c, 'text': '', 'source': ''})
        elif isinstance(c, (int, float)):
            cites.append({'ref': str(c), 'text': '', 'source': ''})
    return cites


def get_checklist_items(section):
    """Full Story checklist sections: extract scored items.
    Returns list of dicts with {number, item, verdict, evidence, confidence}.
    """
    if not section:
        return []
    data = section.get('data', {})
    if isinstance(data, str):
        try:
            data = __import__('json').loads(data)
        except (ValueError, TypeError):
            return []
    if not isinstance(data, dict):
        return []
    items = data.get('items', data.get('checklistItems', []))
    return items if isinstance(items, list) else []


def get_verdict_color(verdict):
    """Map a verdict string to an RGB tuple.
    Returns: (r, g, b) tuple.
    """
    verdict_upper = str(verdict).upper()
    colors = {
        'PASS': (34, 197, 94),       # green-500
        'FAIL': (239, 68, 68),       # red-500
        'WATCHLIST': (245, 158, 11), # amber-500
        'PARTIAL': (245, 158, 11),   # amber-500
        'CONTEXT': (245, 158, 11),   # amber-500
        'N/A': (100, 116, 139),      # slate-500
        'BULL': (34, 197, 94),       # green-500
        'BEAR': (239, 68, 68),       # red-500
        'MIXED': (245, 158, 11),     # amber-500
        'UNRESOLVED': (100, 116, 139), # slate-500
    }
    return colors.get(verdict_upper, (100, 116, 139))


def format_currency(value):
    """Format a number as currency with appropriate scale."""
    if value is None:
        return 'N/A'
    try:
        value = float(value)
    except (ValueError, TypeError):
        return str(value)
    if abs(value) >= 1e12:
        return f'${value / 1e12:.1f}T'
    elif abs(value) >= 1e9:
        return f'${value / 1e9:.1f}B'
    elif abs(value) >= 1e6:
        return f'${value / 1e6:.0f}M'
    elif abs(value) >= 1e3:
        return f'${value / 1e3:.0f}K'
    else:
        return f'${value:.2f}'


def format_pct(value):
    """Format a decimal as percentage."""
    if value is None:
        return 'N/A'
    try:
        return f'{float(value) * 100:.1f}%'
    except (ValueError, TypeError):
        return str(value)
