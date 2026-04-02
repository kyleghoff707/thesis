#!/usr/bin/env python3
"""
Shared helpers for Thes1s-branded Word document generation.

Provides reusable building blocks for all 3 Word doc generators:
- Document creation with Thes1s font/color styles
- Title pages with branding
- Styled tables with teal headers and alternating row shading
- Verdict tables with color-coded cells
- Checklist tables for Full Story
- Chart image embedding
- Red flag rendering
- Citations section
- Temporary chart cleanup

Usage:
    from scripts.pdf.docx_helpers import create_thes1s_doc, add_title_page, add_styled_table
"""

import os
import re

from docx import Document
from docx.shared import Inches, Pt, RGBColor, Cm, Emu
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import nsdecls
from docx.oxml import parse_xml


# ── Thes1s Colors as RGBColor objects ────────────────────────────────────────

TEAL_500 = RGBColor(15, 118, 110)
TEAL_100 = RGBColor(204, 251, 241)
TEAL_50 = RGBColor(240, 253, 250)
SLATE_800 = RGBColor(30, 41, 59)
SLATE_600 = RGBColor(71, 85, 105)
SLATE_200 = RGBColor(226, 232, 240)
RED_500 = RGBColor(239, 68, 68)
AMBER_500 = RGBColor(245, 158, 11)
GREEN_500 = RGBColor(34, 197, 94)
WHITE = RGBColor(255, 255, 255)

# ── Hex strings for cell shading XML ─────────────────────────────────────────

TEAL_500_HEX = '0F766E'
TEAL_50_HEX = 'F0FDFA'
RED_500_HEX = 'EF4444'
AMBER_500_HEX = 'F59E0B'
GREEN_500_HEX = '22C55E'
SLATE_100_HEX = 'F1F5F9'

VERDICT_COLORS_HEX = {
    'PASS': GREEN_500_HEX,
    'FAIL': RED_500_HEX,
    'PARTIAL': AMBER_500_HEX,
    'WATCHLIST': AMBER_500_HEX,
    'CONTEXT': AMBER_500_HEX,
}

VERDICT_COLORS_RGB = {
    'PASS': GREEN_500,
    'FAIL': RED_500,
    'PARTIAL': AMBER_500,
    'WATCHLIST': AMBER_500,
    'CONTEXT': AMBER_500,
}


def create_thes1s_doc():
    """
    Create a Word Document with Thes1s branding applied to default styles.

    Sets Arial font, Thes1s color palette for headings and body text,
    and consistent paragraph spacing.

    Returns:
        Document: A configured python-docx Document instance
    """
    doc = Document()

    # Normal style: Arial, 10pt, slate-800
    style = doc.styles['Normal']
    font = style.font
    font.name = 'Arial'
    font.size = Pt(10)
    font.color.rgb = SLATE_800
    pf = style.paragraph_format
    pf.space_after = Pt(6)

    # Heading 1: Arial, 14pt, Bold, Teal-500
    h1 = doc.styles['Heading 1']
    h1.font.name = 'Arial'
    h1.font.size = Pt(14)
    h1.font.bold = True
    h1.font.color.rgb = TEAL_500
    h1.paragraph_format.space_before = Pt(12)
    h1.paragraph_format.space_after = Pt(6)

    # Heading 2: Arial, 12pt, Bold, Slate-800
    h2 = doc.styles['Heading 2']
    h2.font.name = 'Arial'
    h2.font.size = Pt(12)
    h2.font.bold = True
    h2.font.color.rgb = SLATE_800
    h2.paragraph_format.space_before = Pt(10)
    h2.paragraph_format.space_after = Pt(4)

    # Heading 3: Arial, 10pt, Bold, Slate-600
    h3 = doc.styles['Heading 3']
    h3.font.name = 'Arial'
    h3.font.size = Pt(10)
    h3.font.bold = True
    h3.font.color.rgb = SLATE_600
    h3.paragraph_format.space_before = Pt(8)
    h3.paragraph_format.space_after = Pt(4)

    return doc


def add_title_page(doc, ticker, company_name, stage_title, subtitle='', verdict=''):
    """
    Add a branded title page with company info, stage title, and optional verdict.

    Args:
        doc: Document instance
        ticker: Stock ticker symbol
        company_name: Full company name
        stage_title: E.g., 'One Pager', 'Pitch Deck', 'Full Story'
        subtitle: Optional subtitle text
        verdict: Optional verdict string (PASS/FAIL/PARTIAL/WATCHLIST)
    """
    # Spacer
    for _ in range(3):
        doc.add_paragraph('')

    # Company name — large centered teal
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run(company_name)
    run.font.size = Pt(18)
    run.font.bold = True
    run.font.color.rgb = TEAL_500
    run.font.name = 'Arial'

    # Ticker
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run(f'({ticker})')
    run.font.size = Pt(14)
    run.font.color.rgb = SLATE_600
    run.font.name = 'Arial'

    # Stage title
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run(stage_title)
    run.font.size = Pt(16)
    run.font.bold = True
    run.font.color.rgb = SLATE_800
    run.font.name = 'Arial'

    # Subtitle
    if subtitle:
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = p.add_run(subtitle)
        run.font.size = Pt(11)
        run.font.italic = True
        run.font.color.rgb = SLATE_600
        run.font.name = 'Arial'

    # Verdict
    if verdict:
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        v_upper = str(verdict).upper().strip()
        run = p.add_run(f'Overall Verdict: {v_upper}')
        run.font.size = Pt(14)
        run.font.bold = True
        run.font.name = 'Arial'
        run.font.color.rgb = VERDICT_COLORS_RGB.get(v_upper, SLATE_600)

    # Spacer
    doc.add_paragraph('')

    # Generated by footer
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run('Generated by Thes1s')
    run.font.size = Pt(9)
    run.font.italic = True
    run.font.color.rgb = SLATE_600
    run.font.name = 'Arial'

    # Page break
    doc.add_page_break()


def _set_cell_shading(cell, hex_color):
    """Apply background shading to a table cell."""
    shading = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{hex_color}"/>')
    cell._tc.get_or_add_tcPr().append(shading)


def _set_cell_font(cell, size_pt=9, bold=False, color=None, name='Arial'):
    """Set font properties on all runs in a cell paragraph."""
    for paragraph in cell.paragraphs:
        for run in paragraph.runs:
            run.font.size = Pt(size_pt)
            run.font.bold = bold
            run.font.name = name
            if color:
                run.font.color.rgb = color


def add_styled_table(doc, headers, rows, col_widths=None):
    """
    Create a table with teal header row and alternating row shading.

    Args:
        doc: Document instance
        headers: List of header strings
        rows: List of row lists (each inner list = one row of cell values)
        col_widths: Optional list of Inches values for column widths

    Returns:
        Table: The created table object
    """
    if not headers:
        return None

    n_rows = len(rows) if rows else 0
    table = doc.add_table(rows=1 + n_rows, cols=len(headers))
    table.style = 'Table Grid'
    table.alignment = WD_TABLE_ALIGNMENT.CENTER

    # Header row
    for i, header in enumerate(headers):
        cell = table.rows[0].cells[i]
        cell.text = str(header)
        _set_cell_shading(cell, TEAL_500_HEX)
        _set_cell_font(cell, size_pt=9, bold=True, color=WHITE)

    # Data rows
    for row_idx, row_data in enumerate(rows or []):
        for col_idx in range(len(headers)):
            cell = table.rows[row_idx + 1].cells[col_idx]
            val = str(row_data[col_idx]) if col_idx < len(row_data) else ''
            cell.text = val
            _set_cell_font(cell, size_pt=9, color=SLATE_800)
            # Alternating row shading
            if row_idx % 2 == 0:
                _set_cell_shading(cell, TEAL_50_HEX)

    # Apply column widths if provided
    if col_widths and len(col_widths) == len(headers):
        for i, width in enumerate(col_widths):
            for row in table.rows:
                row.cells[i].width = width

    # Add spacing after table
    doc.add_paragraph('')

    return table


def add_verdict_table(doc, sections):
    """
    Create a verdict scorecard table with color-coded verdict cells.

    Args:
        doc: Document instance
        sections: List of (name, verdict, confidence, signal) tuples
    """
    if not sections:
        return

    headers = ['Section', 'Verdict', 'Confidence', 'Signal']
    table = doc.add_table(rows=1 + len(sections), cols=4)
    table.style = 'Table Grid'
    table.alignment = WD_TABLE_ALIGNMENT.CENTER

    # Header row
    for i, header in enumerate(headers):
        cell = table.rows[0].cells[i]
        cell.text = header
        _set_cell_shading(cell, TEAL_500_HEX)
        _set_cell_font(cell, size_pt=9, bold=True, color=WHITE)

    # Data rows
    for row_idx, (name, verdict, confidence, signal) in enumerate(sections):
        row = table.rows[row_idx + 1]

        # Section name
        row.cells[0].text = str(name)
        _set_cell_font(row.cells[0], size_pt=9, color=SLATE_800)

        # Verdict cell with color-coded background
        v_str = str(verdict).upper().strip()
        row.cells[1].text = v_str
        v_hex = VERDICT_COLORS_HEX.get(v_str, SLATE_100_HEX)
        _set_cell_shading(row.cells[1], v_hex)
        # White text on colored backgrounds
        v_text_color = WHITE if v_hex != SLATE_100_HEX else SLATE_800
        _set_cell_font(row.cells[1], size_pt=9, bold=True, color=v_text_color)

        # Confidence
        row.cells[2].text = str(confidence)
        _set_cell_font(row.cells[2], size_pt=9, color=SLATE_600)

        # Signal
        row.cells[3].text = str(signal)
        _set_cell_font(row.cells[3], size_pt=9, color=SLATE_600)

        # Alternating row background (only on non-verdict cells)
        if row_idx % 2 == 0:
            _set_cell_shading(row.cells[0], TEAL_50_HEX)
            _set_cell_shading(row.cells[2], TEAL_50_HEX)
            _set_cell_shading(row.cells[3], TEAL_50_HEX)

    doc.add_paragraph('')


def add_section_heading(doc, title, level=1):
    """
    Add a heading at the specified level.

    Args:
        doc: Document instance
        title: Heading text
        level: 1, 2, or 3

    Returns:
        Paragraph: The heading paragraph
    """
    return doc.add_heading(title, level=level)


def add_body_paragraphs(doc, text):
    """
    Split text on double newlines into paragraphs with bold formatting support.

    Handles **bold** markdown syntax by creating bold runs.
    Skips empty paragraphs.

    Args:
        doc: Document instance
        text: Multi-paragraph text string
    """
    if not text or not isinstance(text, str):
        return

    paragraphs = text.split('\n\n')
    for para_text in paragraphs:
        para_text = para_text.strip()
        if not para_text:
            continue

        p = doc.add_paragraph()

        # Parse markdown bold (**text**) into runs
        parts = re.split(r'(\*\*[^*]+\*\*)', para_text)
        for part in parts:
            if part.startswith('**') and part.endswith('**'):
                # Bold text
                run = p.add_run(part[2:-2])
                run.bold = True
                run.font.name = 'Arial'
                run.font.size = Pt(10)
                run.font.color.rgb = SLATE_800
            else:
                if part:
                    run = p.add_run(part)
                    run.font.name = 'Arial'
                    run.font.size = Pt(10)
                    run.font.color.rgb = SLATE_800


def embed_chart(doc, chart_path, width_inches=5.5):
    """
    Embed a PNG chart image in the document.

    Args:
        doc: Document instance
        chart_path: Path to the PNG file
        width_inches: Image width in inches (default 5.5 fits within margins)
    """
    if not chart_path or not os.path.exists(chart_path):
        return

    try:
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = p.add_run()
        run.add_picture(chart_path, width=Inches(width_inches))
        # Add small spacing after
        doc.add_paragraph('')
    except Exception:
        # Skip silently if image can't be embedded
        pass


def add_red_flags(doc, flags):
    """
    Render red flags as a bulleted list with red triangle prefix.

    Args:
        doc: Document instance
        flags: List of flag strings
    """
    if not flags:
        return

    doc.add_heading('Red Flags', level=3)

    for flag in flags:
        p = doc.add_paragraph()
        # Red triangle prefix
        run = p.add_run('\u26A0 ')
        run.font.color.rgb = RED_500
        run.font.size = Pt(10)
        run.font.name = 'Arial'
        # Flag text
        run = p.add_run(str(flag))
        run.font.size = Pt(10)
        run.font.name = 'Arial'
        run.font.color.rgb = SLATE_800


def add_citations_section(doc, all_citations):
    """
    Add a numbered citations/sources section.

    Args:
        doc: Document instance
        all_citations: List of {ref, text, source} dicts
    """
    if not all_citations:
        return

    doc.add_heading('Citations & Sources', level=1)

    for i, cite in enumerate(all_citations, 1):
        if not isinstance(cite, dict):
            continue
        ref = cite.get('ref', '')
        text = cite.get('text', '')
        source = cite.get('source', '')

        p = doc.add_paragraph()
        # Number
        run = p.add_run(f'[{i}] ')
        run.font.bold = True
        run.font.size = Pt(9)
        run.font.color.rgb = TEAL_500
        run.font.name = 'Arial'

        # Ref text
        if ref:
            run = p.add_run(f'{ref}')
            run.font.size = Pt(9)
            run.font.bold = True
            run.font.color.rgb = SLATE_800
            run.font.name = 'Arial'

        if text:
            run = p.add_run(f' = {text}')
            run.font.size = Pt(9)
            run.font.color.rgb = SLATE_600
            run.font.name = 'Arial'

        if source:
            run = p.add_run(f' ({source})')
            run.font.size = Pt(9)
            run.font.italic = True
            run.font.color.rgb = SLATE_600
            run.font.name = 'Arial'


def add_checklist_table(doc, items):
    """
    Create a checklist table for Full Story sections with color-coded verdict cells.

    Args:
        doc: Document instance
        items: List of {number, item, verdict, confidence, evidence} dicts
    """
    if not items:
        return

    headers = ['#', 'Item', 'Verdict', 'Confidence']
    table = doc.add_table(rows=1 + len(items), cols=4)
    table.style = 'Table Grid'
    table.alignment = WD_TABLE_ALIGNMENT.CENTER

    # Header row
    for i, header in enumerate(headers):
        cell = table.rows[0].cells[i]
        cell.text = header
        _set_cell_shading(cell, TEAL_500_HEX)
        _set_cell_font(cell, size_pt=9, bold=True, color=WHITE)

    # Data rows
    for row_idx, item in enumerate(items):
        if not isinstance(item, dict):
            continue

        row = table.rows[row_idx + 1]

        # Number
        row.cells[0].text = str(item.get('number', row_idx + 1))
        _set_cell_font(row.cells[0], size_pt=9, color=SLATE_800)

        # Item text
        item_text = str(item.get('item', ''))
        row.cells[1].text = item_text
        _set_cell_font(row.cells[1], size_pt=9, color=SLATE_800)

        # Verdict with color-coded background
        verdict = str(item.get('verdict', 'N/A')).upper().strip()
        row.cells[2].text = verdict
        v_hex = VERDICT_COLORS_HEX.get(verdict, SLATE_100_HEX)
        _set_cell_shading(row.cells[2], v_hex)
        v_text_color = WHITE if v_hex != SLATE_100_HEX else SLATE_800
        _set_cell_font(row.cells[2], size_pt=9, bold=True, color=v_text_color)

        # Confidence
        row.cells[3].text = str(item.get('confidence', ''))
        _set_cell_font(row.cells[3], size_pt=9, color=SLATE_600)

        # Alternating row shading on non-verdict cells
        if row_idx % 2 == 0:
            _set_cell_shading(row.cells[0], TEAL_50_HEX)
            _set_cell_shading(row.cells[1], TEAL_50_HEX)
            _set_cell_shading(row.cells[3], TEAL_50_HEX)

    doc.add_paragraph('')

    # Evidence detail paragraphs for items with substantial evidence
    evidence_items = [item for item in items
                      if isinstance(item, dict)
                      and isinstance(item.get('evidence', ''), str)
                      and len(item.get('evidence', '')) > 100]

    if evidence_items:
        doc.add_heading('Evidence Details', level=3)
        for item in evidence_items:
            num = item.get('number', '?')
            item_name = str(item.get('item', ''))[:80]
            p = doc.add_paragraph()
            run = p.add_run(f'#{num}: {item_name}')
            run.font.bold = True
            run.font.size = Pt(9)
            run.font.color.rgb = TEAL_500
            run.font.name = 'Arial'

            p = doc.add_paragraph()
            run = p.add_run(str(item.get('evidence', '')))
            run.font.size = Pt(9)
            run.font.color.rgb = SLATE_600
            run.font.name = 'Arial'


def cleanup_temp_charts(chart_paths):
    """
    Delete temporary PNG chart files after they have been embedded.

    Args:
        chart_paths: List of file paths to remove
    """
    if not chart_paths:
        return

    for path in chart_paths:
        if path and os.path.exists(path):
            try:
                os.unlink(path)
            except OSError:
                pass
