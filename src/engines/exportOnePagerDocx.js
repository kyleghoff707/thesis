// Browser-side One Pager DOCX generation using the docx npm package.
// Matches the visual output of scripts/pdf/generate_one_pager_docx.py.
// No server call needed — generates directly from report data in memory.

import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle, PageBreak, HeadingLevel,
  ShadingType, TableBorders, VerticalAlign,
} from 'docx';
import { saveAs } from 'file-saver';

// ─── Thes1s Color Palette (Hex) ──────────────────────────────

const TEAL_500 = '0F766E';
const TEAL_50 = 'F0FDFA';
const SLATE_800 = '1E293B';
const SLATE_600 = '475569';
const SLATE_500 = '64748B';
const RED_500 = 'EF4444';
const AMBER_500 = 'F59E0B';
const GREEN_500 = '22C55E';
const WHITE = 'FFFFFF';

function verdictColor(verdict) {
  if (!verdict) return SLATE_600;
  const v = verdict.toUpperCase();
  if (v === 'PASS') return GREEN_500;
  if (v === 'FAIL') return RED_500;
  if (v === 'WATCHLIST' || v === 'REVIEW') return AMBER_500;
  return SLATE_600;
}

function cleanNarrative(text) {
  if (!text) return '';
  return text
    .replace(/<cite[^>]*>(.*?)<\/cite>/gi, '$1')
    .replace(/<cite[^/]*\/>/gi, '')
    .replace(/DataPacket|data packet/gi, 'Thes1s toolbox')
    .replace(/ {2,}/g, ' ')
    .trim();
}

// ─── Helper: Parse narrative into paragraphs with bold support ─

function narrativeToParagraphs(text) {
  const cleaned = cleanNarrative(Array.isArray(text) ? text.join('\n\n') : text);
  if (!cleaned) return [];

  const paragraphs = cleaned.split(/\n\n+/).filter(p => p.trim());
  const result = [];

  for (const para of paragraphs) {
    const trimmed = para.trim();

    // Sub-header detection: short line, ends with colon, or wrapped in **
    const isHeader = trimmed.length < 120 && (trimmed.endsWith(':') || /^\*\*[^*]+\*\*$/.test(trimmed));

    if (isHeader) {
      result.push(new Paragraph({
        spacing: { before: 160, after: 80 },
        children: [new TextRun({
          text: trimmed.replace(/\*\*/g, ''),
          bold: true,
          size: 20, // 10pt
          color: SLATE_800,
          font: 'Arial',
        })],
      }));
    } else {
      // Parse **bold** segments within the paragraph
      const children = [];
      const parts = trimmed.split(/(\*\*[^*]+\*\*)/g);
      for (const part of parts) {
        if (part.startsWith('**') && part.endsWith('**')) {
          children.push(new TextRun({
            text: part.slice(2, -2),
            bold: true,
            size: 20,
            color: SLATE_800,
            font: 'Arial',
          }));
        } else if (part) {
          children.push(new TextRun({
            text: part,
            size: 20,
            color: SLATE_800,
            font: 'Arial',
          }));
        }
      }
      if (children.length > 0) {
        result.push(new Paragraph({ spacing: { after: 120 }, children }));
      }
    }
  }

  // Handle markdown tables in narrative
  return result;
}

// ─── Helper: Styled table ─────────────────────────────────────

function styledTable(headers, rows) {
  const noBorders = {
    top: { style: BorderStyle.NONE },
    bottom: { style: BorderStyle.NONE },
    left: { style: BorderStyle.NONE },
    right: { style: BorderStyle.NONE },
  };

  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map(h => new TableCell({
      shading: { fill: TEAL_500, type: ShadingType.CLEAR },
      borders: noBorders,
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 40, after: 40 },
        children: [new TextRun({ text: h, bold: true, size: 18, color: WHITE, font: 'Arial' })],
      })],
    })),
  });

  const dataRows = rows.map((row, idx) => new TableRow({
    children: row.map((cell, colIdx) => {
      const isVerdict = colIdx === 1;
      const cellColor = isVerdict ? verdictColor(cell) : SLATE_800;
      return new TableCell({
        shading: idx % 2 === 1 ? { fill: TEAL_50, type: ShadingType.CLEAR } : undefined,
        borders: noBorders,
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({
          alignment: colIdx > 0 ? AlignmentType.CENTER : AlignmentType.LEFT,
          spacing: { before: 30, after: 30 },
          children: [new TextRun({
            text: cell || '',
            bold: isVerdict,
            size: 18,
            color: cellColor,
            font: 'Arial',
          })],
        })],
      });
    }),
  }));

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: TableBorders.NONE,
    rows: [headerRow, ...dataRows],
  });
}

// ─── DOCX Generation ─────────────────────────────────────────

export async function generateOnePagerDocx(report, sections, ticker, companyName) {
  const overallVerdict = sections.find(s => s.key === 'overall_verdict')?.verdict || 'N/A';
  const generatedDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const docChildren = [];

  // ─── Title Page ────────────────────────────────────────────

  docChildren.push(
    new Paragraph({ spacing: { before: 600 }, children: [] }), // spacer
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [new TextRun({
        text: 'Thes1s',
        bold: true,
        size: 24,
        color: TEAL_500,
        font: 'Arial',
      })],
    }),
    new Paragraph({ spacing: { before: 200 }, children: [] }), // spacer
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [new TextRun({
        text: companyName || ticker,
        bold: true,
        size: 44,
        color: SLATE_800,
        font: 'Arial',
      })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({
        text: `(${ticker})`,
        size: 28,
        color: SLATE_600,
        font: 'Arial',
      })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [new TextRun({
        text: 'Rule One One Pager',
        bold: true,
        size: 28,
        color: SLATE_800,
        font: 'Arial',
      })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({
        text: 'Investment Screening Analysis',
        italics: true,
        size: 22,
        color: SLATE_600,
        font: 'Arial',
      })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [new TextRun({
        text: overallVerdict,
        bold: true,
        size: 32,
        color: verdictColor(overallVerdict),
        font: 'Arial',
      })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({
        text: `Generated ${generatedDate}`,
        size: 18,
        color: SLATE_500,
        font: 'Arial',
      })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [new TextRun({
        text: 'Generated by Thes1s — AI-powered Rule One investment research',
        italics: true,
        size: 16,
        color: SLATE_500,
        font: 'Arial',
      })],
    }),
    new Paragraph({
      children: [new PageBreak()],
    }),
  );

  // ─── Verdict Scorecard ─────────────────────────────────────

  docChildren.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 80, after: 120 },
      children: [new TextRun({
        text: 'Verdict Scorecard',
        bold: true,
        size: 28,
        color: TEAL_500,
        font: 'Arial',
      })],
    }),
  );

  const scorecardHeaders = ['Section', 'Verdict', 'Confidence', 'Red Flags'];
  const scorecardRows = sections.map(s => [
    s.title || s.key,
    s.verdict || 'N/A',
    s.confidence || 'N/A',
    s.redFlags?.length > 0 ? `${s.redFlags.length} flag${s.redFlags.length > 1 ? 's' : ''}` : 'None',
  ]);

  docChildren.push(styledTable(scorecardHeaders, scorecardRows));
  docChildren.push(new Paragraph({ spacing: { after: 200 }, children: [] }));

  // ─── Section Narratives ────────────────────────────────────

  for (const section of sections) {
    // Section heading
    docChildren.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 240, after: 60 },
        children: [new TextRun({
          text: `${section.sectionNumber || ''}. ${section.title || section.key}`,
          bold: true,
          size: 28,
          color: TEAL_500,
          font: 'Arial',
        })],
      }),
    );

    // Verdict line
    if (section.verdict) {
      docChildren.push(
        new Paragraph({
          spacing: { after: 60 },
          children: [
            new TextRun({
              text: `Verdict: ${section.verdict}`,
              bold: true,
              size: 20,
              color: verdictColor(section.verdict),
              font: 'Arial',
            }),
            ...(section.confidence ? [new TextRun({
              text: `  |  Confidence: ${section.confidence}`,
              size: 20,
              color: SLATE_600,
              font: 'Arial',
            })] : []),
          ],
        }),
      );
    }

    // Verdict rationale
    if (section.verdictRationale) {
      docChildren.push(
        new Paragraph({
          spacing: { after: 100 },
          children: [new TextRun({
            text: section.verdictRationale,
            italics: true,
            size: 18,
            color: SLATE_600,
            font: 'Arial',
          })],
        }),
      );
    }

    // Narrative paragraphs
    const narParagraphs = narrativeToParagraphs(section.narrative);
    docChildren.push(...narParagraphs);

    // Red Flags
    if (section.redFlags?.length > 0) {
      docChildren.push(
        new Paragraph({
          spacing: { before: 120, after: 60 },
          children: [new TextRun({
            text: 'Red Flags',
            bold: true,
            size: 20,
            color: RED_500,
            font: 'Arial',
          })],
        }),
      );

      for (const flag of section.redFlags) {
        docChildren.push(
          new Paragraph({
            spacing: { after: 40 },
            indent: { left: 200 },
            children: [
              new TextRun({ text: '\u26A0  ', size: 20, color: RED_500, font: 'Arial' }),
              new TextRun({ text: flag, size: 18, color: SLATE_800, font: 'Arial' }),
            ],
          }),
        );
      }
    }
  }

  // ─── Citations ─────────────────────────────────────────────

  const allCitations = sections.flatMap(s => s.citations || []);
  if (allCitations.length > 0) {
    docChildren.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 240, after: 120 },
        children: [new TextRun({
          text: 'Citations & Sources',
          bold: true,
          size: 28,
          color: TEAL_500,
          font: 'Arial',
        })],
      }),
      new Paragraph({
        spacing: { after: 80 },
        children: [new TextRun({
          text: 'All quantitative claims are traced to the following sources.',
          size: 18,
          color: SLATE_600,
          font: 'Arial',
        })],
      }),
    );

    for (let i = 0; i < allCitations.length; i++) {
      const c = allCitations[i];
      docChildren.push(
        new Paragraph({
          spacing: { after: 30 },
          indent: { left: 200 },
          children: [
            new TextRun({ text: `[${i + 1}] `, bold: true, size: 16, color: SLATE_600, font: 'Arial' }),
            new TextRun({ text: `${c.text || ''} `, size: 16, color: SLATE_800, font: 'Arial' }),
            new TextRun({ text: `— ${c.source || 'Unknown'}`, italics: true, size: 16, color: SLATE_500, font: 'Arial' }),
          ],
        }),
      );
    }
  }

  // ─── Build & Download ──────────────────────────────────────

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: 'Arial', size: 20, color: SLATE_800 },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          margin: { top: 720, bottom: 720, left: 720, right: 720 }, // 0.5 inch
        },
      },
      children: docChildren,
    }],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${ticker}-one-pager.docx`);
}
