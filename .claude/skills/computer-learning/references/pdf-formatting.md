# PDF Formatting Reference — Computer Learning

Full reportlab boilerplate for generating technical research PDFs.
Copy and adapt this template when generating Output B.

---

## Full Builder Template

```python
import os
from datetime import datetime
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable, Preformatted
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT

# ── Config ────────────────────────────────────────────────────────────────────

TITLE = "Research Title"
DATE  = datetime.today().strftime("%B %d, %Y")
AUTHOR = "Research Dive — Claude"
OUTPUT_PATH = "/path/to/output/report.pdf"

# ── Styles ────────────────────────────────────────────────────────────────────

def build_styles():
    base = getSampleStyleSheet()
    styles = {}

    styles["title"] = ParagraphStyle(
        "title", parent=base["Title"],
        fontSize=24, spaceAfter=6, textColor=colors.HexColor("#1a1a2e"),
        fontName="Helvetica-Bold"
    )
    styles["subtitle"] = ParagraphStyle(
        "subtitle", parent=base["Normal"],
        fontSize=11, textColor=colors.HexColor("#555555"),
        spaceAfter=4, fontName="Helvetica"
    )
    styles["h1"] = ParagraphStyle(
        "h1", parent=base["Heading1"],
        fontSize=16, spaceBefore=18, spaceAfter=6,
        textColor=colors.HexColor("#1a1a2e"), fontName="Helvetica-Bold",
        borderPad=(0, 0, 2, 0)
    )
    styles["h2"] = ParagraphStyle(
        "h2", parent=base["Heading2"],
        fontSize=13, spaceBefore=12, spaceAfter=4,
        textColor=colors.HexColor("#2d2d2d"), fontName="Helvetica-Bold"
    )
    styles["h3"] = ParagraphStyle(
        "h3", parent=base["Heading3"],
        fontSize=11, spaceBefore=8, spaceAfter=3,
        textColor=colors.HexColor("#444444"), fontName="Helvetica-BoldOblique"
    )
    styles["body"] = ParagraphStyle(
        "body", parent=base["Normal"],
        fontSize=10, leading=15, spaceAfter=6,
        fontName="Helvetica", textColor=colors.HexColor("#222222")
    )
    styles["bullet"] = ParagraphStyle(
        "bullet", parent=styles["body"],
        leftIndent=18, bulletIndent=6, spaceAfter=3
    )
    styles["code"] = ParagraphStyle(
        "code", parent=base["Code"],
        fontSize=8.5, fontName="Courier",
        backColor=colors.HexColor("#f4f4f4"),
        leftIndent=12, rightIndent=12,
        spaceAfter=8, spaceBefore=4,
        leading=13, textColor=colors.HexColor("#1a1a1a")
    )
    styles["caption"] = ParagraphStyle(
        "caption", parent=styles["body"],
        fontSize=8.5, textColor=colors.grey, alignment=TA_CENTER
    )
    return styles

# ── Page Template (header/footer) ─────────────────────────────────────────────

def make_page_template(title):
    def on_page(canvas, doc):
        canvas.saveState()
        # Footer
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(colors.HexColor("#888888"))
        canvas.drawString(inch, 0.5 * inch, title)
        canvas.drawRightString(
            letter[0] - inch, 0.5 * inch,
            f"Page {doc.page}"
        )
        canvas.setStrokeColor(colors.HexColor("#dddddd"))
        canvas.line(inch, 0.65 * inch, letter[0] - inch, 0.65 * inch)
        canvas.restoreState()
    return on_page

# ── Table Helper ──────────────────────────────────────────────────────────────

def make_table(data, col_widths=None, header_bg=colors.HexColor("#1a1a2e")):
    """
    data: list of lists. First row is header.
    col_widths: list of widths in points, or None for auto.
    """
    table = Table(data, colWidths=col_widths, repeatRows=1)
    style = TableStyle([
        # Header
        ("BACKGROUND", (0, 0), (-1, 0), header_bg),
        ("TEXTCOLOR",  (0, 0), (-1, 0), colors.white),
        ("FONTNAME",   (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",   (0, 0), (-1, 0), 9),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
        ("TOPPADDING",    (0, 0), (-1, 0), 8),
        # Body rows
        ("FONTNAME",   (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE",   (0, 1), (-1, -1), 9),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1),
         [colors.white, colors.HexColor("#f8f8f8")]),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 6),
        ("TOPPADDING",    (0, 1), (-1, -1), 6),
        # Grid
        ("GRID",    (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
        ("VALIGN",  (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING",  (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ])
    table.setStyle(style)
    return table

# ── Title Page ────────────────────────────────────────────────────────────────

def title_page(styles, title, date, author, output_dir):
    story = []
    story.append(Spacer(1, 1.5 * inch))
    story.append(Paragraph(title, styles["title"]))
    story.append(HRFlowable(
        width="100%", thickness=2,
        color=colors.HexColor("#1a1a2e"), spaceAfter=12
    ))
    story.append(Paragraph(f"Generated: {date}", styles["subtitle"]))
    story.append(Paragraph(f"Author: {author}", styles["subtitle"]))
    story.append(Paragraph(f"Output: {output_dir}", styles["subtitle"]))
    story.append(PageBreak())
    return story

# ── Main Builder ──────────────────────────────────────────────────────────────

def build_pdf(sections, output_path, title, date, author, output_dir):
    """
    sections: list of dicts with keys:
      { "heading": str, "level": 1|2|3, "content": str | list[str] }
      For tables: { "table": [[row], ...], "col_widths": [...] }
      For code:   { "code": str }
      For hr:     { "hr": True }
    """
    styles = build_styles()
    doc = SimpleDocTemplate(
        output_path,
        pagesize=letter,
        leftMargin=inch, rightMargin=inch,
        topMargin=inch, bottomMargin=0.85 * inch,
        title=title, author=author
    )

    story = title_page(styles, title, date, author, output_dir)

    for block in sections:
        if "heading" in block:
            lvl = block.get("level", 1)
            style_key = {1: "h1", 2: "h2", 3: "h3"}.get(lvl, "h2")
            story.append(Paragraph(block["heading"], styles[style_key]))

        elif "content" in block:
            content = block["content"]
            if isinstance(content, list):
                for item in content:
                    story.append(Paragraph(f"• {item}", styles["bullet"]))
            else:
                # Split on newlines for multi-paragraph text
                for para in content.split("\n\n"):
                    if para.strip():
                        story.append(Paragraph(para.strip(), styles["body"]))

        elif "table" in block:
            story.append(Spacer(1, 6))
            story.append(make_table(
                block["table"],
                col_widths=block.get("col_widths")
            ))
            story.append(Spacer(1, 6))

        elif "code" in block:
            story.append(Preformatted(block["code"], styles["code"]))

        elif "hr" in block:
            story.append(HRFlowable(
                width="100%", thickness=0.5,
                color=colors.HexColor("#cccccc"),
                spaceBefore=6, spaceAfter=6
            ))

        elif "spacer" in block:
            story.append(Spacer(1, block["spacer"] * inch))

        elif "page_break" in block:
            story.append(PageBreak())

    doc.build(story, onFirstPage=make_page_template(title),
              onLaterPages=make_page_template(title))
    print(f"PDF written to: {output_path}")


# ── Usage Example ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    sections = [
        {"heading": "Executive Summary", "level": 1},
        {"content": "This report investigates..."},
        {"heading": "Technical Overview", "level": 1},
        {"heading": "Core Concepts", "level": 2},
        {"content": ["Concept A: description", "Concept B: description"]},
        {"heading": "Comparison", "level": 2},
        {"table": [
            ["Feature", "Option A", "Option B"],
            ["Performance", "High", "Medium"],
            ["Complexity", "Low", "High"],
        ]},
        {"heading": "Code Sample", "level": 2},
        {"code": "def example():\n    return 42"},
    ]

    build_pdf(
        sections=sections,
        output_path=OUTPUT_PATH,
        title=TITLE,
        date=DATE,
        author=AUTHOR,
        output_dir="/path/to/output"
    )
```

---

## Notes

- Always install deps first: `pip install reportlab pdfplumber --break-system-packages`
- Never use Unicode subscripts (₀¹²) — use `<sub>` / `<super>` in Paragraph text
- For very long code blocks, use `Preformatted` not `Paragraph`
- Title page is always page 1; page numbers start at 2

---

## PDF QA Check — Required After Every Build

After calling `doc.build(...)`, always run the QA checker. This is **mandatory** —
never deliver a PDF without passing the check first.

The checker lives at: `references/pdf_qa_checker.py`
Copy it alongside your build script, then call it like this:

```python
# ── After doc.build() ─────────────────────────────────────────────────────────

import sys
import shutil

# Copy checker next to build script if not already present
checker_src = os.path.join(os.path.dirname(__file__), "pdf_qa_checker.py")
# (or hardcode the path to where you copied it)

from pdf_qa_checker import check_pdf

passed, qa_report = check_pdf(
    output_path,
    margin_left=72,    # must match your SimpleDocTemplate leftMargin
    margin_right=72,   # must match your SimpleDocTemplate rightMargin
    margin_top=72,     # must match your SimpleDocTemplate topMargin
    margin_bottom=61,  # must match your SimpleDocTemplate bottomMargin
    verbose=True       # prints report to stdout
)

if not passed:
    print("\n[BUILD FAILED] PDF has formatting errors — see QA report above.")
    print("Fix the errors and regenerate before delivering the PDF.")
    sys.exit(1)
else:
    print("\n[BUILD OK] PDF passed QA checks.")
```

### What the checker catches

| Check | Severity | Description |
|---|---|---|
| Right margin overflow | ERROR | Text x1 > live area — content clipped |
| Left margin overflow | WARNING | Text x0 < live area — unexpected indent |
| Overlapping text | WARNING | Two lines share the same bounding box region |
| Empty page | WARNING | Page has < 40 chars (possible render failure) |
| Footer bleed | WARNING | Body text appears below footer boundary |
| Hard truncation | WARNING | Line ends at right edge mid-word (no punctuation) |
| Zero pages | ERROR | PDF is empty — build failure |

### Severity rules

- **ERRORS** → `passed = False` → do not deliver the PDF. Fix and rebuild.
- **WARNINGS** → `passed = True` → review them; most are false positives from
  justified text wrapping, but check any that mention unexpected content.
