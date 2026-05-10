#!/usr/bin/env python3
"""
Generate a Thesis-branded PDF from a research markdown file.

Usage:
    python3 scripts/pdf/generate_research_report.py <input.md> <output.pdf> [--title "..."] [--subtitle "..."]
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from thesis_pdf import ThesisPDF
from pdf_template_toolkit import parse_and_render


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('input', help='Path to source markdown file')
    parser.add_argument('output', help='Path to output PDF')
    parser.add_argument('--title', default='Agent Harness Engineering for Thesis v3')
    parser.add_argument('--subtitle', default='Research Artifact - May 2026')
    parser.add_argument('--stage-label', default='Research')
    args = parser.parse_args()

    pdf = ThesisPDF(title=args.title, subtitle=args.subtitle, stage_label=args.stage_label)
    pdf.add_title_page(info_lines=['May 2, 2026', 'Thesis v3 Pipeline Architecture'])
    parse_and_render(pdf, args.input)
    pdf.output(args.output)
    print(f'Wrote {args.output}')


if __name__ == '__main__':
    main()
