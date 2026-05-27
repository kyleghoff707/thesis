"""
citation_links — extract clickable URLs from citation source strings.

Citation source strings come from agents in many shapes:
    'fool.com 2026-01-30'                       → https://fool.com
    'cnbc.com/select/irs-direct-file/'          → https://cnbc.com/select/irs-direct-file/
    'https://www.sec.gov/cgi-bin/browse-edgar?…' → use as-is
    'investor.intuit.com/news/press-release.aspx' → https://investor.intuit.com/...
    'DataPacket'                                → None (not a website)
    'Web'                                       → None
    'Final Thesis Section 5'                    → None
    '10-K filing 2025-09-30'                    → None

extract_url() returns (canonical_url, display_text) or None.
"""

import re

URL_REGEX = re.compile(
    r'https?://[^\s)\],]+'
    r'|'
    r'(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?:/[^\s)\],]*)?',
    re.IGNORECASE,
)

NON_URL_TLDS = frozenset({
    'pdf', 'doc', 'docx', 'json', 'csv', 'xlsx', 'xml', 'txt', 'md',
    'png', 'jpg', 'jpeg', 'gif', 'svg',
})

NON_URL_LITERALS = frozenset({
    'datapacket', 'web', 'sec', 'edgar', 'web search', 'websearch',
})


def extract_url(source_str):
    """Return (url, display_text) tuple if source contains a URL, else None.

    url:          canonical https:// URL safe to use as a hyperlink target
    display_text: shortened domain-style label for inline rendering
    """
    if not source_str or not isinstance(source_str, str):
        return None

    s = source_str.strip()
    low = s.lower()
    if low in NON_URL_LITERALS:
        return None
    if low.startswith(('datapacket', 'final thesis section', 'pitch deck section',
                       'one pager section', '10-k filing', '10-q filing',
                       '8-k filing', 'def 14a', 'web search')):
        return None

    m = URL_REGEX.search(s)
    if not m:
        return None

    raw = m.group(0).rstrip('.,;:)')
    if '.' not in raw:
        return None

    last_segment = raw.split('/', 1)[0]
    tld = last_segment.rsplit('.', 1)[-1].lower()
    if tld in NON_URL_TLDS:
        return None

    if raw.lower().startswith(('http://', 'https://')):
        url = raw
    else:
        url = 'https://' + raw

    display = raw.split('://', 1)[-1]
    display = display[:60] + '…' if len(display) > 60 else display

    return (url, display)


def split_around_url(source_str):
    """Return (prefix, url_match, suffix) so callers can render mixed text + link.

    If no URL is detected, returns (source_str, None, '').
    The url_match is a (url, display_text) tuple.
    """
    if not source_str:
        return ('', None, '')
    m = URL_REGEX.search(source_str)
    if not m:
        return (source_str, None, '')

    info = extract_url(source_str)
    if not info:
        return (source_str, None, '')

    prefix = source_str[:m.start()]
    suffix = source_str[m.end():]
    return (prefix, info, suffix)
