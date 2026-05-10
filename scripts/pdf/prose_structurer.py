"""
prose_structurer — convert flat agent narrative strings into typed render blocks.

Agents produce solid prose but emit it as monolithic paragraphs separated by
double-newlines. This module post-processes the prose into a list of typed
blocks the renderer can dispatch to {paragraph, bullets, subheader, numbered}.

Detection is conservative: when a paragraph doesn't clearly fit a list pattern
it stays a paragraph. Over-bulleting fragments good prose; this module only
extracts structure that the agent clearly intended.

Detection (per paragraph, first match wins):
    1. **Bold-only line** (≤120 chars, surrounded by **)               → subheader
    2. Markdown bullet block (every non-empty line starts with - / * / •) → bullets
    3. Markdown numbered block (every non-empty line matches '^\\d+\\.\\s') → numbered
    4. "First, X. Second, Y. Third/Finally, Z."                         → intro? + bullets
    5. "<intro>: clause; clause; clause."                               → intro + bullets
    6. "The first <noun> is X. The second <noun> is Y. The third…"      → intro? + bullets
    7. Default                                                          → paragraph
"""

import re

BLOCK_PARAGRAPH = 'paragraph'
BLOCK_BULLETS = 'bullets'
BLOCK_NUMBERED = 'numbered'
BLOCK_SUBHEADER = 'subheader'

# "First, X. Second, Y. Third/Finally, Z." — discourse markers at sentence start
DISCOURSE_PATTERN = re.compile(
    r'(?:^|(?<=[.!?]\s))\s*'
    r'(First|Second|Third|Fourth|Fifth|Finally|Lastly|Initially|Next|Then),\s+',
    re.IGNORECASE,
)

# "The first <noun> is …" / "The second <noun> is …"
ORDINAL_NOUN_PATTERN = re.compile(
    r'(?:^|(?<=[.!?]\s))\s*'
    r'The\s+(first|second|third|fourth|fifth|primary|main|next|last|final)\s+'
    r'(?:and\s+(?:dominant|biggest|largest|most\s+important)\s+)?'
    r'[a-z]+\s+is\b',
    re.IGNORECASE,
)

MD_BULLET_LINE = re.compile(r'^\s*[-*•]\s+(.+)$')
MD_NUMBERED_LINE = re.compile(r'^\s*(\d+)\.\s+(.+)$')


def structure_prose(narrative):
    """Convert a narrative string into a list of typed-block dicts.

    Returns a list of dicts with shape:
        {'kind': 'paragraph', 'text': str}
        {'kind': 'bullets',   'items': [str], 'intro': str|None}
        {'kind': 'numbered',  'items': [str], 'intro': str|None}
        {'kind': 'subheader', 'text': str}

    Falls back to a single 'paragraph' block on empty/None input.
    """
    if not narrative or not isinstance(narrative, str):
        return []

    blocks = []
    for raw_para in narrative.split('\n\n'):
        para = raw_para.strip()
        if not para:
            continue
        blocks.extend(_structure_paragraph(para))
    return blocks


def _structure_paragraph(para):
    if para.startswith('**') and para.endswith('**') and len(para) <= 120:
        return [{'kind': BLOCK_SUBHEADER, 'text': para[2:-2].strip()}]

    if len(para) <= 120 and (para.endswith(':') or '—' in para) and '\n' not in para and '. ' not in para:
        return [{'kind': BLOCK_SUBHEADER, 'text': para.rstrip(':').strip()}]

    md_bullets = _try_md_bullets(para)
    if md_bullets:
        return [md_bullets]

    md_numbered = _try_md_numbered(para)
    if md_numbered:
        return [md_numbered]

    discourse = _try_discourse_bullets(para)
    if discourse:
        return discourse

    ordinal = _try_ordinal_bullets(para)
    if ordinal:
        return ordinal

    semicolon = _try_semicolon_list(para)
    if semicolon:
        return semicolon

    return [{'kind': BLOCK_PARAGRAPH, 'text': para}]


def _try_md_bullets(para):
    lines = [ln for ln in para.split('\n') if ln.strip()]
    if len(lines) < 2:
        return None
    items = []
    for ln in lines:
        m = MD_BULLET_LINE.match(ln)
        if not m:
            return None
        items.append(m.group(1).strip())
    return {'kind': BLOCK_BULLETS, 'items': items, 'intro': None}


def _try_md_numbered(para):
    lines = [ln for ln in para.split('\n') if ln.strip()]
    if len(lines) < 2:
        return None
    items = []
    for ln in lines:
        m = MD_NUMBERED_LINE.match(ln)
        if not m:
            return None
        items.append(m.group(2).strip())
    return {'kind': BLOCK_NUMBERED, 'items': items, 'intro': None}


def _try_discourse_bullets(para):
    """Detect 'First, X. Second, Y. Third, Z.' patterns within a paragraph."""
    matches = list(DISCOURSE_PATTERN.finditer(para))
    if len(matches) < 2:
        return None
    markers = [m.group(1).lower() for m in matches]
    has_first = 'first' in markers or 'initially' in markers
    has_terminator = any(m in markers for m in ('finally', 'lastly', 'third', 'fourth', 'fifth'))
    if not (has_first and has_terminator):
        return None

    intro = para[:matches[0].start()].strip()
    items = []
    for i, m in enumerate(matches):
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(para)
        chunk = para[start:end].strip().rstrip('.')
        chunk = chunk[0].upper() + chunk[1:] if chunk else chunk
        items.append(chunk)

    if not items or not all(items):
        return None

    blocks = []
    if intro:
        blocks.append({'kind': BLOCK_PARAGRAPH, 'text': intro})
    blocks.append({'kind': BLOCK_BULLETS, 'items': items, 'intro': None})
    return blocks


def _try_ordinal_bullets(para):
    """Detect 'The first <noun> is X. The second is Y. The third is Z.' patterns."""
    matches = list(ORDINAL_NOUN_PATTERN.finditer(para))
    if len(matches) < 2:
        return None

    intro = para[:matches[0].start()].strip()
    items = []
    for i, m in enumerate(matches):
        start = m.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(para)
        items.append(para[start:end].strip().rstrip('.'))

    if any(len(it) < 20 for it in items):
        return None

    blocks = []
    if intro:
        blocks.append({'kind': BLOCK_PARAGRAPH, 'text': intro})
    blocks.append({'kind': BLOCK_BULLETS, 'items': items, 'intro': None})
    return blocks


def _try_semicolon_list(para):
    """Detect '<intro>: clause; clause; clause.' single-sentence patterns.

    Conservative: requires exactly one ':' as the intro/list separator and at
    least 2 ';' inside the list portion. Skips when the paragraph spans many
    sentences (the colon may not be intro:list).
    """
    if para.count('. ') > 2:
        return None
    if ':' not in para:
        return None
    head, _, tail = para.partition(':')
    if tail.count(';') < 2:
        return None
    items = [c.strip().rstrip('.') for c in tail.split(';') if c.strip()]
    if len(items) < 2:
        return None
    if any(len(it) < 8 for it in items):
        return None

    return [
        {'kind': BLOCK_PARAGRAPH, 'text': head.strip() + ':'},
        {'kind': BLOCK_BULLETS, 'items': items, 'intro': None},
    ]
