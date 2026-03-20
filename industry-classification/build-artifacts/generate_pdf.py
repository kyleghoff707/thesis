#!/usr/bin/env python3
"""
Generate PDF version of the stock taxonomy research report.
Uses reportlab to convert the markdown research report into a styled PDF.
"""

import re
import os
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY

# Colors
TEAL = HexColor('#0f766e')
DARK = HexColor('#1e293b')
LIGHT_GRAY = HexColor('#f1f5f9')
MEDIUM_GRAY = HexColor('#94a3b8')
WHITE = HexColor('#ffffff')

def get_styles():
    styles = getSampleStyleSheet()

    styles.add(ParagraphStyle(
        'DocTitle',
        parent=styles['Title'],
        fontSize=24,
        leading=30,
        textColor=DARK,
        spaceAfter=6,
        alignment=TA_CENTER
    ))
    styles.add(ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontSize=12,
        leading=16,
        textColor=MEDIUM_GRAY,
        spaceAfter=20,
        alignment=TA_CENTER
    ))
    styles.add(ParagraphStyle(
        'SectionHead',
        parent=styles['Heading1'],
        fontSize=16,
        leading=22,
        textColor=TEAL,
        spaceBefore=20,
        spaceAfter=10,
        borderWidth=1,
        borderColor=TEAL,
        borderPadding=(0, 0, 4, 0),
    ))
    styles.add(ParagraphStyle(
        'SubHead',
        parent=styles['Heading2'],
        fontSize=13,
        leading=18,
        textColor=DARK,
        spaceBefore=14,
        spaceAfter=6
    ))
    styles.add(ParagraphStyle(
        'SubSubHead',
        parent=styles['Heading3'],
        fontSize=11,
        leading=15,
        textColor=DARK,
        spaceBefore=10,
        spaceAfter=4
    ))
    styles.add(ParagraphStyle(
        'BodyText2',
        parent=styles['Normal'],
        fontSize=9.5,
        leading=13,
        textColor=DARK,
        spaceAfter=6,
        alignment=TA_JUSTIFY
    ))
    styles.add(ParagraphStyle(
        'BulletItem',
        parent=styles['Normal'],
        fontSize=9.5,
        leading=13,
        textColor=DARK,
        leftIndent=20,
        spaceAfter=3
    ))
    styles.add(ParagraphStyle(
        'CodeBlock',
        parent=styles['Code'],
        fontSize=8,
        leading=10,
        textColor=DARK,
        backColor=LIGHT_GRAY,
        borderWidth=0.5,
        borderColor=MEDIUM_GRAY,
        borderPadding=6,
        leftIndent=10,
        spaceAfter=8
    ))
    styles.add(ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontSize=8,
        leading=10,
        textColor=DARK,
    ))
    styles.add(ParagraphStyle(
        'TableHeader',
        parent=styles['Normal'],
        fontSize=8,
        leading=10,
        textColor=WHITE,
        fontName='Helvetica-Bold'
    ))

    return styles


def parse_markdown_table(lines):
    """Parse a markdown table into header + rows."""
    if len(lines) < 3:
        return None, None

    def parse_row(line):
        cells = [c.strip() for c in line.strip().strip('|').split('|')]
        return cells

    header = parse_row(lines[0])
    # lines[1] is separator
    rows = []
    for line in lines[2:]:
        if line.strip() and '|' in line:
            row = parse_row(line)
            # Pad or trim to match header length
            while len(row) < len(header):
                row.append('')
            rows.append(row[:len(header)])

    return header, rows


def make_table(header, rows, styles):
    """Create a reportlab Table from parsed markdown table data."""
    s = styles

    table_data = []
    table_data.append([Paragraph(h, s['TableHeader']) for h in header])
    for row in rows:
        table_data.append([Paragraph(cell, s['TableCell']) for cell in row])

    col_count = len(header)
    available = 6.5 * inch
    col_width = available / col_count
    col_widths = [col_width] * col_count

    # First column wider if many columns
    if col_count > 4:
        col_widths[0] = min(1.8 * inch, available * 0.25)
        remaining = available - col_widths[0]
        for i in range(1, col_count):
            col_widths[i] = remaining / (col_count - 1)

    t = Table(table_data, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), TEAL),
        ('TEXTCOLOR', (0, 0), (-1, 0), WHITE),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('GRID', (0, 0), (-1, -1), 0.5, MEDIUM_GRAY),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [WHITE, LIGHT_GRAY]),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
    ]))

    return t


def clean_text(text):
    """Clean markdown formatting for PDF."""
    text = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', text)
    text = re.sub(r'\*(.+?)\*', r'<i>\1</i>', text)
    text = re.sub(r'`(.+?)`', r'<font face="Courier" size="8">\1</font>', text)
    text = re.sub(r'\[(.+?)\]\(.+?\)', r'\1', text)  # strip links
    text = text.replace('&', '&amp;')
    # Fix double-escaped ampersands
    text = text.replace('&amp;amp;', '&amp;')
    return text


def md_to_elements(md_text, styles):
    """Convert markdown text to reportlab flowable elements."""
    elements = []
    lines = md_text.split('\n')
    i = 0
    in_code_block = False
    code_lines = []
    in_table = False
    table_lines = []

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # Code blocks
        if stripped.startswith('```'):
            if in_code_block:
                code_text = '\n'.join(code_lines)
                elements.append(Paragraph(code_text.replace('\n', '<br/>'), styles['CodeBlock']))
                code_lines = []
                in_code_block = False
            else:
                # Flush any table
                if in_table and table_lines:
                    header, rows = parse_markdown_table(table_lines)
                    if header and rows:
                        elements.append(make_table(header, rows, styles))
                        elements.append(Spacer(1, 6))
                    table_lines = []
                    in_table = False
                in_code_block = True
            i += 1
            continue

        if in_code_block:
            code_lines.append(line)
            i += 1
            continue

        # Tables
        if '|' in stripped and stripped.startswith('|'):
            if not in_table:
                in_table = True
                table_lines = []
            table_lines.append(stripped)
            i += 1
            continue
        elif in_table:
            # Table ended
            header, rows = parse_markdown_table(table_lines)
            if header and rows:
                elements.append(make_table(header, rows, styles))
                elements.append(Spacer(1, 6))
            table_lines = []
            in_table = False

        # Skip metadata/frontmatter
        if stripped == '---':
            i += 1
            continue

        # Headings
        if stripped.startswith('# ') and not stripped.startswith('## '):
            # Title - skip (handled by title page)
            i += 1
            continue
        elif stripped.startswith('## '):
            text = clean_text(stripped[3:])
            elements.append(Paragraph(text, styles['SectionHead']))
            i += 1
            continue
        elif stripped.startswith('### '):
            text = clean_text(stripped[4:])
            elements.append(Paragraph(text, styles['SubHead']))
            i += 1
            continue
        elif stripped.startswith('#### '):
            text = clean_text(stripped[5:])
            elements.append(Paragraph(text, styles['SubSubHead']))
            i += 1
            continue

        # Bullet points
        if stripped.startswith('- ') or stripped.startswith('* '):
            text = clean_text(stripped[2:])
            elements.append(Paragraph(f'• {text}', styles['BulletItem']))
            i += 1
            continue

        # Numbered items
        if re.match(r'^\d+\.\s', stripped):
            text = clean_text(re.sub(r'^\d+\.\s', '', stripped))
            num = re.match(r'^(\d+)\.\s', stripped).group(1)
            elements.append(Paragraph(f'{num}. {text}', styles['BulletItem']))
            i += 1
            continue

        # Empty lines
        if not stripped:
            elements.append(Spacer(1, 4))
            i += 1
            continue

        # Regular paragraph
        text = clean_text(stripped)
        if text:
            elements.append(Paragraph(text, styles['BodyText2']))
        i += 1

    # Flush remaining table
    if in_table and table_lines:
        header, rows = parse_markdown_table(table_lines)
        if header and rows:
            elements.append(make_table(header, rows, styles))

    return elements


def add_page_number(canvas, doc):
    """Add page number and footer to each page."""
    canvas.saveState()
    canvas.setFont('Helvetica', 8)
    canvas.setFillColor(MEDIUM_GRAY)
    canvas.drawString(inch, 0.5 * inch, f'Thes1s Research — Stock Market Industry Taxonomy')
    canvas.drawRightString(7.5 * inch, 0.5 * inch, f'Page {doc.page}')
    canvas.restoreState()


def generate_pdf(md_path, pdf_path):
    """Generate PDF from markdown file."""
    print(f'Reading: {md_path}')
    with open(md_path, 'r') as f:
        md_text = f.read()

    styles = get_styles()

    doc = SimpleDocTemplate(
        pdf_path,
        pagesize=letter,
        leftMargin=inch,
        rightMargin=inch,
        topMargin=0.75 * inch,
        bottomMargin=0.75 * inch
    )

    elements = []

    # Title page
    elements.append(Spacer(1, 2 * inch))
    elements.append(Paragraph('Stock Market Industry Taxonomy', styles['DocTitle']))
    elements.append(Paragraph('Research Report', styles['DocTitle']))
    elements.append(Spacer(1, 0.5 * inch))
    elements.append(Paragraph('A comprehensive survey of classification systems and design<br/>'
                              'of a custom taxonomy for Rule One investment research', styles['DocSubtitle']))
    elements.append(Spacer(1, inch))
    elements.append(Paragraph('Thes1s Research — Claude Code', styles['DocSubtitle']))
    elements.append(Paragraph('March 17, 2026', styles['DocSubtitle']))
    elements.append(PageBreak())

    # Content
    content_elements = md_to_elements(md_text, styles)
    elements.extend(content_elements)

    print(f'Building PDF with {len(elements)} elements...')
    doc.build(elements, onFirstPage=add_page_number, onLaterPages=add_page_number)
    print(f'PDF saved: {pdf_path}')


if __name__ == '__main__':
    base_dir = os.path.dirname(os.path.abspath(__file__))
    md_path = os.path.join(base_dir, 'stock-taxonomy-research.md')
    pdf_path = os.path.join(base_dir, 'stock-taxonomy-research.pdf')

    if not os.path.exists(md_path):
        print(f'Error: {md_path} not found. Generate the research report first.')
        exit(1)

    generate_pdf(md_path, pdf_path)
