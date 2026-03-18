"""
pdf_qa_checker.py
─────────────────
Post-generation quality-assurance layer for reportlab PDFs.

Checks performed:
  1. Text overflows right margin       — content past live area
  2. Text overflows left margin        — content before live area
  3. Overlapping text blocks           — lines whose bounding boxes collide
  4. Empty pages                       — pages with no extractable content
  5. Page count sanity                 — 0 pages means build failure
  6. Content bleeding into footer      — body text in reserved footer zone
  7. Hard truncation at right margin   — lines ending at edge mid-word
  8. Text touching drawn box borders   — text x1 too close to a rect, line,
                                         OR curve border (catches ParagraphStyle
                                         rounded-rect clipping)

Usage:
    from pdf_qa_checker import check_pdf
    passed, report = check_pdf("/path/to/report.pdf")
    if not passed:
        raise RuntimeError(f"PDF has formatting errors:\n{report}")

Returns:
    passed (bool)  — True only when zero ERRORS found (warnings are advisory)
    report (str)   — Human-readable QA summary
"""

import sys
from pathlib import Path

try:
    import pdfplumber
except ImportError:
    raise ImportError("pdfplumber required: pip install pdfplumber --break-system-packages")

# ── Default geometry ──────────────────────────────────────────────────────────
PAGE_W = 612
PAGE_H = 792
DEFAULT_ML = 72
DEFAULT_MR = 72
DEFAULT_MT = 72
DEFAULT_MB = 72

# Footer token vocabulary for is-this-a-footer heuristic
FOOTER_TOKENS = {
    "page", "of", "report", "dive", "research", "claude",
    "learning", "computer", "atrazine", "frogs", "march",
    "january", "february", "april", "may", "june", "july",
    "august", "september", "october", "november", "december",
    "2024", "2025", "2026",
}

OVERLAP_TOL        = 2.5   # pts — small leading overlaps are normal
MARGIN_OVER_TOL    = 5     # pts — right overflow must exceed this to be an error
MIN_CHARS_NONEMPTY = 40    # chars below which a page is "probably empty"

# Minimum clearance required between text x1 and any drawn border to its right.
# ParagraphStyle rounded-rect borders render as curves with 0pt inner padding;
# Table BOX borders with RIGHTPADDING=12 give ~11pt clearance (passes fine).
MIN_BORDER_GAP = 6         # pts


# ── Helpers ───────────────────────────────────────────────────────────────────

def _extract_lines(page):
    try:
        words = page.extract_words(x_tolerance=3, y_tolerance=3,
                                    keep_blank_chars=False, use_text_flow=False)
    except Exception:
        return []
    buckets = {}
    for w in words:
        key = round(w["top"] / 3) * 3
        if key not in buckets:
            buckets[key] = {"x0": w["x0"], "x1": w["x1"],
                            "top": w["top"], "bottom": w["bottom"],
                            "text": w["text"]}
        else:
            e = buckets[key]
            e["x0"]     = min(e["x0"],     w["x0"])
            e["x1"]     = max(e["x1"],     w["x1"])
            e["bottom"] = max(e["bottom"], w["bottom"])
            e["text"]  += " " + w["text"]
    return list(buckets.values())


def _looks_like_footer(text):
    t = text.strip()
    if t.replace(".", "").replace("|", "").replace("-", "").replace(" ", "").isdigit():
        return True
    if len(t) <= 2:
        return True
    tokens = t.lower().split()
    matches = sum(1 for tok in tokens if tok.strip(".,|—–") in FOOTER_TOKENS)
    return matches >= max(1, len(tokens) // 2)


def _overlapping(a, b):
    return (a[0] < b[2] - OVERLAP_TOL and a[2] > b[0] + OVERLAP_TOL and
            a[1] < b[3] - OVERLAP_TOL and a[3] > b[1] + OVERLAP_TOL)


def _hard_truncated(line, live_x1):
    if abs(line["x1"] - live_x1) > 2:
        return False
    last = line["text"].rstrip().split()[-1] if line["text"].strip() else ""
    return len(last) >= 5 and last[-1].islower()


def _get_right_borders(page):
    """
    Return right-edge x-coordinates of all box borders on this page.

    Collects from three sources:
      - Rectangles  (Table BOX → stored as rects by pdfplumber)
      - Vertical lines (x0 ≈ x1 → explicit vertical strokes)
      - Curves      (ParagraphStyle borderRadius → rounded rect stored as curve)
                    The curve bounding-box x1 is the right border edge.

    Returns list of (border_x, y_top, y_bottom) in pdfplumber coords
    (top = distance from page top, increases downward).
    """
    borders = []

    # Rectangles — right edge
    for r in page.rects:
        if r.get("x1") is not None and r.get("stroke"):
            borders.append((r["x1"], r["top"], r["bottom"]))

    # Explicit lines — vertical ones only
    for ln in page.lines:
        if abs(ln.get("x1", 0) - ln.get("x0", 0)) < 2 and ln.get("stroke"):
            x = (ln["x0"] + ln["x1"]) / 2
            borders.append((x, ln["top"], ln["bottom"]))

    # Curves — ParagraphStyle with borderRadius renders the border as a closed
    # rounded-rect curve path. pdfplumber stores these in page.curves.
    # The bounding box x1 of the curve is the right border wall.
    for cv in page.curves:
        if cv.get("stroke") and cv.get("x1") is not None:
            borders.append((cv["x1"], cv["top"], cv["bottom"]))

    return borders


def _text_too_close_to_border(line, borders):
    """
    Return (True, border_x, gap_pts) if line's right edge (x1) is within
    MIN_BORDER_GAP pts of any border whose y-range overlaps this line.
    """
    lx1  = line["x1"]
    ltop = line["top"]
    lbot = line["bottom"]

    for (bx, btop, bbot) in borders:
        if bx <= lx1:
            continue                        # border is to the left — skip
        if not (ltop < bbot and lbot > btop):
            continue                        # no vertical overlap — skip
        gap = bx - lx1
        if gap < MIN_BORDER_GAP:
            return True, bx, gap

    return False, None, None


# ── Main ─────────────────────────────────────────────────────────────────────

def check_pdf(pdf_path: str,
              margin_left:  int = DEFAULT_ML,
              margin_right: int = DEFAULT_MR,
              margin_top:   int = DEFAULT_MT,
              margin_bottom:int = DEFAULT_MB,
              verbose: bool = True) -> tuple:
    """
    Run all QA checks on a generated PDF.

    Parameters
    ----------
    pdf_path     : str  — path to the PDF file
    margin_*     : int  — margin sizes in pts (must match SimpleDocTemplate)
    verbose      : bool — print report to stdout

    Returns
    -------
    (passed: bool, report: str)
    passed is True only when there are zero errors.
    """
    live_x0        = margin_left
    live_x1        = PAGE_W - margin_right
    content_top    = margin_top
    content_bottom = PAGE_H - margin_bottom

    errors   = []
    warnings = []

    if not Path(pdf_path).exists():
        return False, f"[QA FAIL] File not found: {pdf_path}"

    with pdfplumber.open(pdf_path) as pdf:
        total = len(pdf.pages)

        if total == 0:
            errors.append("FATAL: PDF has zero pages — build failure.")
            return False, _format(pdf_path, total, errors, warnings, verbose)

        for pnum, page in enumerate(pdf.pages, 1):
            text  = page.extract_text() or ""
            lines = _extract_lines(page)

            # ── Empty page ───────────────────────────────────────────────────
            if pnum > 1 and len(text.strip()) < MIN_CHARS_NONEMPTY:
                warnings.append(
                    f"P{pnum}: Nearly empty ({len(text.strip())} chars). "
                    "Possible blank page or render failure."
                )

            if not lines:
                continue

            body_lines = [l for l in lines
                          if l["top"] < content_bottom - 5
                          and not _looks_like_footer(l["text"])]

            # ── Right margin overflow ────────────────────────────────────────
            for ln in body_lines:
                if ln["x1"] > live_x1 + MARGIN_OVER_TOL:
                    errors.append(
                        f"P{pnum}: RIGHT OVERFLOW x1={ln['x1']:.1f} > {live_x1} — "
                        f"'{ln['text'][:55]}'"
                    )

            # ── Left margin overflow ─────────────────────────────────────────
            for ln in body_lines:
                if ln["x0"] < live_x0 - MARGIN_OVER_TOL:
                    warnings.append(
                        f"P{pnum}: Left overflow x0={ln['x0']:.1f} < {live_x0} — "
                        f"'{ln['text'][:55]}'"
                    )

            # ── Footer bleed ─────────────────────────────────────────────────
            footer_lines = [l for l in lines if l["top"] >= content_bottom]
            for ln in footer_lines:
                if not _looks_like_footer(ln["text"]):
                    warnings.append(
                        f"P{pnum}: Body text in footer zone (top={ln['top']:.0f}) — "
                        f"'{ln['text'][:60]}'"
                    )

            # ── Overlapping lines ────────────────────────────────────────────
            checked = set()
            for i, a in enumerate(body_lines):
                for j, b in enumerate(body_lines):
                    if j <= i or (i, j) in checked:
                        continue
                    checked.add((i, j))
                    if _overlapping(
                        (a["x0"], a["top"], a["x1"], a["bottom"]),
                        (b["x0"], b["top"], b["x1"], b["bottom"])
                    ):
                        warnings.append(
                            f"P{pnum}: Overlapping lines — "
                            f"'{a['text'][:35]}' ↔ '{b['text'][:35]}'"
                        )

            # ── Hard truncation at page margin ───────────────────────────────
            for ln in body_lines:
                if _hard_truncated(ln, live_x1):
                    warnings.append(
                        f"P{pnum}: Possible hard truncation at right margin — "
                        f"'…{ln['text'][-45:]}'"
                    )

            # ── Text too close to box border (Check 8) ───────────────────────
            # Catches ParagraphStyle border clipping (curves) and Table borders
            # (rects/lines) with insufficient padding.
            borders = _get_right_borders(page)
            if borders:
                for ln in body_lines:
                    too_close, bx, gap_pts = _text_too_close_to_border(ln, borders)
                    if too_close:
                        errors.append(
                            f"P{pnum}: TEXT CLIPPED BY BOX — "
                            f"text ends at x1={ln['x1']:.1f}, border at x={bx:.1f}, "
                            f"gap={gap_pts:.1f}pt (need ≥{MIN_BORDER_GAP}pt). "
                            f"Use Table cell padding, not ParagraphStyle borders. "
                            f"Line: '…{ln['text'][-50:]}'"
                        )

    return _format(pdf_path, total, errors, warnings, verbose)


def _format(pdf_path, total, errors, warnings, verbose=True):
    sep = "═" * 62
    lines = [
        sep,
        "  PDF QA REPORT",
        sep,
        f"  File   : {pdf_path}",
        f"  Pages  : {total}",
        f"  Errors : {len(errors)}  (must fix — real formatting failures)",
        f"  Warns  : {len(warnings)}  (advisory — review recommended)",
        sep,
    ]
    if errors:
        lines.append("\n  ERRORS ───────────────────────────────────────────────")
        for e in errors:
            lines.append(f"    ✗  {e}")
    if warnings:
        lines.append("\n  WARNINGS ─────────────────────────────────────────────")
        for w in warnings:
            lines.append(f"    ⚠  {w}")
    if not errors and not warnings:
        lines.append("\n  ✓  All checks passed. PDF looks clean.")
    elif not errors:
        lines.append(f"\n  ✓  No errors. {len(warnings)} warning(s) to review above.")
    lines.append(sep)

    report = "\n".join(lines)
    passed = len(errors) == 0
    if verbose:
        print(report)
    return passed, report


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python pdf_qa_checker.py <path.pdf>")
        sys.exit(1)
    ok, _ = check_pdf(sys.argv[1])
    sys.exit(0 if ok else 1)
