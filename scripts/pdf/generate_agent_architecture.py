#!/usr/bin/env python3
"""
Thesis Agent Architecture — Visual Breakdown
=============================================
Generates a branded PDF documenting the complete agent system:
- 3-stage workflow overview
- Agent roster with roles, models, curriculum
- Pipeline flows for One Pager, Pitch Deck, Full Story
- DataPacket assembly and slicing
- Curriculum/context loading per agent
- Section-to-agent mapping

Usage:
    python scripts/pdf/generate_agent_architecture.py
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from pdf_template_toolkit import ReportPDF
from datetime import date


def build_pdf():
    pdf = ReportPDF(
        title='Thesis Agent Architecture',
        subtitle='Complete AI Analyst Team Breakdown'
    )

    # ── Branding colors ──
    TEAL = (15, 118, 110)       # teal-700
    TEAL_LIGHT = (45, 212, 191) # teal-400
    SLATE = (30, 41, 59)        # slate-800
    BLUE_ACCENT = (20, 100, 180)
    OPUS_COLOR = (130, 60, 160)  # purple for Opus
    SONNET_COLOR = (20, 120, 180) # blue for Sonnet
    CODE_COLOR = (60, 60, 60)
    GREEN = (34, 139, 34)
    ORANGE = (200, 120, 30)
    RED_ACCENT = (180, 50, 50)

    pdf.color_primary = TEAL
    pdf.color_secondary = SLATE
    pdf.color_table_header = TEAL

    # ═══════════════════════════════════════════════════════════════
    # TITLE PAGE
    # ═══════════════════════════════════════════════════════════════
    pdf.add_title_page(
        info_lines=[
            f'Date: {date.today().strftime("%B %d, %Y")}',
            'Version: Pre-v1.2 (Full Story Milestone)',
            '',
            'AI-Powered value investing Investment Research',
            '9 Specialist Agents | 3-Stage Gated Workflow'
        ]
    )

    # ═══════════════════════════════════════════════════════════════
    # TABLE OF CONTENTS
    # ═══════════════════════════════════════════════════════════════
    pdf.add_toc([
        '3-Stage Gated Workflow Overview',
        'Agent Roster — The Analyst Team',
        'Agent Model Assignment & Cost Profile',
        'One Pager Pipeline (Stage 1)',
        'Pitch Deck Pipeline (Stage 2)',
        'Full Story Pipeline (Stage 3)',
        'DataPacket Assembly & Slicing',
        'Curriculum & Context Loading',
        'Section-to-Agent Mapping (All Stages)',
        'Current Status & Gaps',
    ])

    # ═══════════════════════════════════════════════════════════════
    # 1. 3-STAGE GATED WORKFLOW
    # ═══════════════════════════════════════════════════════════════
    pdf.add_section_header('1. 3-Stage Gated Workflow Overview')

    pdf.add_body_text(
        'Thesis follows a 3-stage gated research workflow inspired by value investing. '
        'Each stage is a filter — the user (Portfolio Manager) must approve before the next '
        'stage unlocks. The stages increase in depth and conviction:'
    )

    pdf.draw_flow_chart(
        'Research Pipeline — 3 Gated Stages',
        [
            'STAGE 1: ONE PAGER  —  Quick filter: pass/fail on minimum standards\n'
            '6 sections | 4 agents | ~$1-2 per company | CC skill orchestration',

            'PM GATE: Approve / Reject / Watchlist\n'
            'Must pass minimum standards to proceed',

            'STAGE 2: PITCH DECK  —  Full business case with 10-section analysis\n'
            '10 sections | 7 agents | ~$8-12 per company | API orchestration (v1.1)',

            'PM GATE: Approve / Reject / Request deeper analysis\n'
            'FGR must be confirmed by PM before valuation',

            'STAGE 3: FULL STORY  —  Conviction engineering with adversarial debate\n'
            '8 sections | 7 agents | Bull/Bear/Judge debate | NOT YET BUILT',
        ],
        arrow_color=TEAL,
        box_fill=(230, 245, 243),
        text_color=SLATE
    )

    pdf.add_section_header('Key Principle: Inheritance', level=2)
    pdf.add_body_text(
        'Each stage inherits ALL findings from the previous stage. The Full Story doesn\'t '
        'redo the Pitch Deck — it deepens it. Pitch Deck findings flow into Full Story agents '
        'as prior context. The DataPacket is also refreshed with any new data.'
    )

    # ═══════════════════════════════════════════════════════════════
    # 2. AGENT ROSTER
    # ═══════════════════════════════════════════════════════════════
    pdf.add_section_header('2. Agent Roster — The Analyst Team')

    pdf.add_body_text(
        '9 AI specialist agents + 1 code-driven assembler. Each agent has a focused role, '
        'specific curriculum files, and a defined DataPacket slice. No agent sees all the data — '
        'they get exactly what they need for their analysis.'
    )

    pdf.add_section_header('Analysis Agents (7)', level=2)
    pdf.add_table(
        ['Agent', 'Role', 'Model', 'Stages Used'],
        [
            ['business-analyst', 'Qualitative business evaluator — moat, simplicity, meaning', 'Sonnet', 'OP, PD, FS'],
            ['financial-analyst', 'Quantitative expert — growth, returns, FCF, debt, balance sheet', 'Sonnet', 'OP, PD, FS'],
            ['valuation-specialist', 'Valuation — FGR derivation, MOS, PBT, Ten Cap, Equity Bond', 'Opus', 'OP, PD, FS'],
            ['competitor-evaluator', 'Moat validation — peer landscape, competitive positioning', 'Sonnet', 'PD, FS'],
            ['management-evaluator', 'Management quality — compensation, insiders, guru ownership', 'Sonnet', 'PD, FS'],
            ['risk-analyst', 'Risk identification — PEST, events, red flags, bear cases', 'Opus', 'PD, FS'],
            ['synthesis-writer', 'Final verdict — Buffett-style prose, overall thesis assembly', 'Opus', 'OP, PD, FS'],
        ],
        col_widths=[34, 72, 16, 22]
    )
    pdf.add_body_text('OP = One Pager | PD = Pitch Deck | FS = Full Story')

    pdf.add_section_header('Preprocessing Agents (3)', level=2)
    pdf.add_table(
        ['Agent', 'Role', 'Model', 'Used In'],
        [
            ['annual-reader', 'Extracts key insights from 10-K filings (full-year data)', 'Sonnet', 'PD, FS'],
            ['quarterly-reader', 'Extracts recent quarterly updates from 10-Q filings', 'Sonnet', 'PD, FS'],
            ['primary-source-reader', 'Deep filing/transcript analysis (Opus-level reasoning)', 'Opus', 'PD, FS'],
        ],
        col_widths=[34, 72, 16, 22]
    )
    pdf.add_body_text(
        'PSR agents run before analysis agents. They read SEC filings and earnings call '
        'transcripts, then pass their findings to downstream agents as context. This lets '
        'analysis agents focus on judgment, not extraction.'
    )

    pdf.add_section_header('Non-AI Components (1)', level=2)
    pdf.add_table(
        ['Component', 'Role', 'Implementation'],
        [
            ['data-assembler', 'DataPacket assembly from 20+ data engines', 'Pure code (nodeAdapter.js + dataExport.js)'],
        ],
        col_widths=[34, 55, 55]
    )

    # ═══════════════════════════════════════════════════════════════
    # 3. MODEL ASSIGNMENT & COST
    # ═══════════════════════════════════════════════════════════════
    pdf.add_section_header('3. Agent Model Assignment & Cost Profile')

    pdf.add_body_text(
        'Agents use either Sonnet (fast, cheap) or Opus (deep reasoning, expensive). '
        'The assignment follows a simple rule: Opus where judgment matters, Sonnet where '
        'thoroughness matters.'
    )

    pdf.draw_comparison_bar_chart(
        'Token Cost per 1M Tokens — Sonnet vs Opus',
        ['Input', 'Output', 'Cache Read', 'Cache Write'],
        [
            [3, 15, 0.30, 3.75],   # Sonnet
            [5, 25, 0.50, 6.25],   # Opus
        ],
        ['Sonnet', 'Opus'],
        [SONNET_COLOR, OPUS_COLOR],
        unit='$'
    )

    pdf.add_section_header('Why Opus for These Agents?', level=2)
    pdf.add_table(
        ['Agent', 'Reasoning'],
        [
            ['valuation-specialist', 'FGR derivation requires weighing 5 inputs + judgment calls. Getting valuation wrong = bad investment.'],
            ['risk-analyst', 'PEST analysis and event assessment need nuanced reasoning about macro trends and structural risks.'],
            ['synthesis-writer', 'Final verdict must synthesize all agent findings into coherent Buffett-style prose with conviction.'],
            ['primary-source-reader', 'Deep reading of 10-K filings requires Opus-level comprehension to extract non-obvious insights.'],
        ],
        col_widths=[34, 110]
    )

    # ═══════════════════════════════════════════════════════════════
    # 4. ONE PAGER PIPELINE
    # ═══════════════════════════════════════════════════════════════
    pdf.add_section_header('4. One Pager Pipeline (Stage 1)')

    pdf.add_body_text(
        'The One Pager is a quick filter. It answers: "Does this company pass minimum '
        'standards?" Uses 4 agents in 2 phases. Currently runs as a Claude Code skill (not API). '
        'Single-agent design — no inter-agent communication needed at this stage.'
    )

    pdf.draw_flow_chart(
        'One Pager Execution Flow',
        [
            'DATA ASSEMBLY\n'
            'assembleDataPacket(TICKER) — 20+ engines, ~30s',

            'PHASE 1 — PARALLEL (3 agents)\n'
            'business-analyst [S1: company_info, S2: minimum_standards]\n'
            'financial-analyst [S3: meaning, S4: growth_metrics]\n'
            'valuation-specialist [S5: valuation_summary]',

            'VALIDATION — Parse JSON, validate schema\n'
            'Retry failed sections once with error context',

            'POST-PROCESSING — synthesis-writer [S6: overall_verdict]\n'
            'Receives all analyst verdicts, confidence, red flags, citations',

            'OUTPUT — one-pager.json + one-pager.md\n'
            'Quality check via critic.js | Budget tracking'
        ],
        arrow_color=TEAL,
        box_fill=(235, 248, 245),
        text_color=SLATE
    )

    pdf.add_section_header('One Pager Section Map', level=2)
    pdf.add_table(
        ['#', 'Section Key', 'Agent', 'Model', 'What It Produces'],
        [
            ['1', 'company_info', 'business-analyst', 'Sonnet', 'Company snapshot, industry, revenue sources'],
            ['2', 'minimum_standards', 'business-analyst', 'Sonnet', 'Pass/fail on value investing minimums'],
            ['3', 'meaning', 'financial-analyst', 'Sonnet', 'Business understanding, KPIs'],
            ['4', 'growth_metrics', 'financial-analyst', 'Sonnet', 'Big 4 growth rates, consistency'],
            ['5', 'valuation_summary', 'valuation-specialist', 'Opus', 'Quick MOS/PBT check'],
            ['6', 'overall_verdict', 'synthesis-writer', 'Opus', 'PASS / FAIL / WATCHLIST verdict'],
        ],
        col_widths=[6, 30, 30, 14, 64]
    )

    # ═══════════════════════════════════════════════════════════════
    # 5. PITCH DECK PIPELINE
    # ═══════════════════════════════════════════════════════════════
    pdf.add_section_header('5. Pitch Deck Pipeline (Stage 2)')

    pdf.add_body_text(
        'The Pitch Deck is a full 10-part business case. It uses 7 agents across 3 phases '
        'plus preprocessing. Currently runs via Claude API (migrated from CC in v1.1). '
        'Proven at $8.53/company, 19-minute runtime, 94/100 mechanical quality.'
    )

    pdf.draw_flow_chart(
        'Pitch Deck Execution Flow',
        [
            'PREPROCESSING (sequential)\n'
            'data-assembler → annual-reader → quarterly-reader\n'
            'PSR findings formatted for downstream agents',

            'PHASE 1 — Business Fundamentals (3 agents, parallel)\n'
            'business-analyst [S1: radar, S2: simple_predictable]\n'
            'competitor-evaluator [S3: market_position]\n'
            '→ CHECKPOINT: findings, data gaps, questions, confidence',

            'PHASE 2 — Financial Deep-Dive (5 dispatches, parallel)\n'
            'competitor-evaluator [S4: barriers_moats] (needs Phase 1 context)\n'
            'financial-analyst [S5: fcf, S7: roe_roic_debt, S8: balance_sheet]\n'
            'management-evaluator [S6: management]\n'
            '→ CHECKPOINT: findings, data gaps, questions, confidence',

            'PHASE 3 — Risk & Valuation (2 agents, parallel)\n'
            'risk-analyst [S9: pest]\n'
            'valuation-specialist [S10: valuation] + FGR derivation sub-workflow\n'
            '→ CHECKPOINT: FGR confirmation required from PM',

            'POST-PROCESSING — synthesis-writer\n'
            'Polish pass across all sections → overall verdict',
        ],
        arrow_color=BLUE_ACCENT,
        box_fill=(230, 240, 255),
        text_color=(20, 40, 80)
    )

    pdf.add_section_header('Pitch Deck Section Map', level=2)
    pdf.add_table(
        ['#', 'Section Key', 'Agent', 'Model', 'Phase'],
        [
            ['1', 'radar', 'business-analyst', 'Sonnet', '1'],
            ['2', 'simple_predictable', 'business-analyst', 'Sonnet', '1'],
            ['3', 'market_position', 'competitor-evaluator', 'Sonnet', '1'],
            ['4', 'barriers_moats', 'competitor-evaluator', 'Sonnet', '2'],
            ['5', 'fcf', 'financial-analyst', 'Sonnet', '2'],
            ['6', 'management', 'management-evaluator', 'Sonnet', '2'],
            ['7', 'roe_roic_debt', 'financial-analyst', 'Sonnet', '2'],
            ['8', 'balance_sheet', 'financial-analyst', 'Sonnet', '2'],
            ['9', 'pest', 'risk-analyst', 'Opus', '3'],
            ['10', 'valuation', 'valuation-specialist', 'Opus', '3'],
        ],
        col_widths=[6, 30, 30, 14, 12]
    )

    pdf.add_section_header('SFM V4 Live Run Results (Phase 10)', level=2)
    pdf.draw_bar_chart(
        'Cost per Agent ($USD) — SFM Pipeline Run',
        [
            'financial-analyst (x3)',
            'valuation-specialist',
            'risk-analyst',
            'competitor-eval (x2)',
            'business-analyst (x2)',
            'mgmt-evaluator',
            'annual-reader',
            'synthesis-writer',
            'quarterly-reader',
        ],
        [2.46, 1.45, 1.12, 1.12, 0.96, 0.64, 0.29, 0.25, 0.23],
        colors=[
            SONNET_COLOR, OPUS_COLOR, OPUS_COLOR, SONNET_COLOR, SONNET_COLOR,
            SONNET_COLOR, SONNET_COLOR, OPUS_COLOR, SONNET_COLOR,
        ],
        unit='$',
        max_val=3.0
    )
    pdf.add_body_text('Total: $8.53 | Runtime: 19 min | Quality: 94 mechanical / 93 methodology')

    # ═══════════════════════════════════════════════════════════════
    # 6. FULL STORY PIPELINE
    # ═══════════════════════════════════════════════════════════════
    pdf.add_section_header('6. Full Story Pipeline (Stage 3) — NOT YET BUILT')

    pdf.add_body_text(
        'The Full Story is "conviction engineering." It is the final gate before capital '
        'deployment. It includes 43-item scored checklists, an adversarial Bull/Bear/Judge '
        'debate, and a complete trading + PACE strategy. The dispatch table is defined but '
        'NO implementation exists yet.'
    )

    pdf.draw_flow_chart(
        'Full Story Planned Execution Flow',
        [
            'PREPROCESSING\n'
            'Inherit ALL Pitch Deck findings + refreshed DataPacket\n'
            'All prior section narratives, citations, and red flags available',

            'PHASE 1 — Deep Analysis with Scored Checklists (5 agents)\n'
            'risk-analyst [S1: event_analysis] — Is there a price event?\n'
            'business-analyst [S2: meaning_checklist] — 15-point scored checklist\n'
            'business-analyst [S3: moat_checklist] — 15-point scored checklist\n'
            'management-evaluator [S4: management_checklist] — 13-point scored\n'
            'valuation-specialist [S5: valuation_confirmation]\n'
            '→ CHECKPOINT: checklist scores, confidence',

            'PHASE 2 — THE DEBATE (Adversarial, 3 agents)\n'
            'synthesis-writer (role: BULL) — Summarizes thesis from S1-S5\n'
            'risk-analyst (role: BEAR) — Attacks every bull point with evidence\n'
            'financial-analyst (role: JUDGE) — Scores each rebuttal, flags gaps\n'
            '→ CHECKPOINT: debate transcript, scored rebuttals',

            'PHASE 3 — Strategy & Conclusion (2 agents, parallel)\n'
            'valuation-specialist [S7: trading_strategy]\n'
            'synthesis-writer [S8: pace_plan]\n'
            'PACE = Primary, Alternative, Contingency, Emergency exit plan',

            'FINAL ASSEMBLY\n'
            'Overall thesis verdict from all 8 sections\n'
            'Final conviction: BUY / WATCHLIST / PASS / AVOID',
        ],
        arrow_color=RED_ACCENT,
        box_fill=(255, 235, 235),
        text_color=(80, 20, 20)
    )

    pdf.add_section_header('Full Story Section Map', level=2)
    pdf.add_table(
        ['#', 'Section Key', 'Agent', 'Model', 'Phase', 'Checklist Points'],
        [
            ['1', 'event_analysis', 'risk-analyst', 'Opus', '1', '—'],
            ['2', 'meaning_checklist', 'business-analyst', 'Sonnet', '1', '15 items'],
            ['3', 'moat_checklist', 'business-analyst / competitor-eval', 'Sonnet', '1', '15 items'],
            ['4', 'management_checklist', 'management-evaluator', 'Sonnet', '1', '13 items'],
            ['5', 'valuation_confirmation', 'valuation-specialist', 'Opus', '1', '—'],
            ['6', 'inversion_rebuttal', 'bull + bear + judge (debate)', 'Opus', '2', '—'],
            ['7', 'trading_strategy', 'valuation-specialist', 'Opus', '3', '—'],
            ['8', 'pace_plan', 'synthesis-writer', 'Opus', '3', '—'],
        ],
        col_widths=[6, 32, 38, 12, 12, 24]
    )

    pdf.add_section_header('The Debate — Phase 2 Detail', level=2)
    pdf.add_body_text(
        'Phase 2 is unique: three agents take adversarial roles on the SAME section (S6). '
        'This is inversion and rebuttal — a core value investing concept. The Bull summarizes the '
        'thesis, the Bear attacks it with evidence, and the Judge scores each rebuttal for '
        'strength and identifies gaps in reasoning.'
    )
    pdf.add_table(
        ['Role', 'Agent', 'Responsibility'],
        [
            ['BULL', 'synthesis-writer', 'Compile strongest case from all prior sections. Cite specific data.'],
            ['BEAR', 'risk-analyst', 'Attack each bull point with counter-evidence. Web search for bear theses.'],
            ['JUDGE', 'financial-analyst', 'Score each rebuttal (strong/weak/inconclusive). Identify unaddressed risks.'],
        ],
        col_widths=[14, 32, 98]
    )

    # ═══════════════════════════════════════════════════════════════
    # 6.5 TOKEN / CONTEXT BUDGET PER AGENT
    # ═══════════════════════════════════════════════════════════════
    pdf.add_section_header('6b. Token & Context Budget per Agent')

    pdf.add_body_text(
        'Every time an agent is spawned, its context window is loaded with: (1) system message '
        '(universal context + PSR findings + agent prompt + curriculum), (2) user message '
        '(field path block + DataPacket slice + section assignment + prior sections + PM feedback). '
        'Here is the breakdown of what each agent costs in context before it even starts thinking.'
    )

    pdf.add_section_header('System Message Components (fixed cost per agent)', level=2)
    pdf.add_table(
        ['Component', 'Size (chars)', 'Est. Tokens', 'Cached?', 'Notes'],
        [
            ['Universal Context', '18,349', '~4,600', 'Yes', 'rule-one-fundamentals + tools-for-analysis'],
            ['PSR Findings', 'varies', '~2,000-8,000', 'Yes', 'Annual + quarterly reader output'],
            ['Agent Prompt', '22-40K', '~5,500-10,000', 'No', 'Varies by agent (see below)'],
            ['Curriculum Files', '0-63K', '~0-15,700', 'No', 'Methodology files per agent role'],
        ],
        col_widths=[30, 22, 22, 14, 56]
    )
    pdf.add_body_text(
        'Cached components (universal context, PSR findings) are marked cache_control: ephemeral. '
        'They count toward input tokens only once per pipeline run — subsequent agents pay '
        'the much cheaper cache_read rate ($0.30/1M for Sonnet, $0.50/1M for Opus).'
    )

    pdf.add_section_header('Per-Agent Context Breakdown (System Message Only)', level=2)
    pdf.add_table(
        ['Agent', 'Prompt', 'Curriculum', 'Fixed Context', 'Total System'],
        [
            ['business-analyst', '~8,000', '~10,600', '~4,600', '~23,200 tokens'],
            ['financial-analyst', '~9,500', '~5,900', '~4,600', '~20,000 tokens'],
            ['valuation-specialist', '~7,800', '~15,700', '~4,600', '~28,100 tokens'],
            ['competitor-evaluator', '~8,800', '~10,700', '~4,600', '~24,100 tokens'],
            ['management-evaluator', '~9,600', '~6,200*', '~4,600', '~20,400 tokens'],
            ['risk-analyst', '~10,100', '~9,100', '~4,600', '~23,800 tokens'],
            ['synthesis-writer', '~5,600', '~0*', '~4,600', '~10,200 tokens'],
            ['annual-reader', '~7,300', '0', '~4,600', '~11,900 tokens'],
            ['quarterly-reader', '~7,600', '0', '~4,600', '~12,200 tokens'],
        ],
        col_widths=[32, 16, 20, 20, 30]
    )
    pdf.add_body_text(
        '* management-evaluator and synthesis-writer reference buffett_letters_claude_training_set/ '
        'directory in their config, but loadCurriculum() reads files — not directories. This reference '
        'silently fails in the API pipeline. The Buffett style comes from the prompt text instead. '
        'This is a gap to address in v1.2 — either load specific letter excerpts or remove the reference.'
    )

    pdf.add_section_header('User Message Components (varies by company)', level=2)
    pdf.add_table(
        ['Component', 'Typical Size', 'Notes'],
        [
            ['Field Path Block', '~500-1,500 tokens', '2-level depth, 20-key cap per top-level field'],
            ['DataPacket Slice', '~2,000-40,000 tokens', 'financial-analyst gets largest slice (7 fields)'],
            ['Section Assignment', '~200-500 tokens', 'Which sections to generate, format instructions'],
            ['Prior Section Context', '~0-15,000 tokens', 'Phase 2+ gets Phase 1 findings as context'],
            ['PM Feedback', '~0-500 tokens', 'From checkpoint reviews (if any)'],
        ],
        col_widths=[32, 30, 82]
    )

    pdf.add_section_header('SFM Live Run — Actual Token Usage per Agent', level=2)
    pdf.add_body_text(
        'From the Phase 10 live SFM pipeline run ($8.53 total). These are actual API usage '
        'numbers, not estimates. Total: 518,907 input + 129,668 output = 648,575 tokens.'
    )
    pdf.draw_comparison_bar_chart(
        'Actual Token Usage — SFM Pipeline Run (thousands)',
        [
            'financial-analyst (x3)',
            'valuation-specialist',
            'quarterly-reader',
            'annual-reader',
            'management-evaluator',
            'risk-analyst',
            'competitor-eval (x2)',
            'business-analyst (x2)',
            'synthesis-writer',
        ],
        [
            [201, 67, 41.2, 40.8, 37.5, 28.4, 48, 44, 15.8],   # Input
            [37.5, 11.3, 7, 9.2, 12.1, 10.8, 20.8, 15, 6.6],   # Output
        ],
        ['Input Tokens (K)', 'Output Tokens (K)'],
        [SONNET_COLOR, OPUS_COLOR],
        unit='K',
        max_val=220
    )

    pdf.add_section_header('Prompt Cache Performance', level=2)
    pdf.add_body_text(
        'Cache hit rate on SFM: 53% (938K cache_read tokens out of 1.77M total input). '
        'Target is 70%. The three-block system message structure (universal context + PSR '
        'findings + agent-specific) enables caching of shared content across agents. '
        'The 53% rate was below target because filing content was not yet included in the '
        'cached DataPacket.'
    )

    # ═══════════════════════════════════════════════════════════════
    # 7. DATAPACKET ASSEMBLY & SLICING
    # ═══════════════════════════════════════════════════════════════
    pdf.add_section_header('7. DataPacket Assembly & Slicing')

    pdf.add_body_text(
        'The DataPacket is the canonical data source for all agents. Assembled from 20+ '
        'engines (EDGAR XBRL, Yahoo Finance, Finviz, SEC filings, etc.), it contains '
        'everything an agent might need. Each agent receives only its slice — never the full packet.'
    )

    pdf.draw_flow_chart(
        'DataPacket Assembly Pipeline',
        [
            'Stage 1: Core Financial Data\n'
            'EDGAR XBRL → financials, statements, industryType\n'
            'Company Details → companyInfo, CIK, SIC',

            'Stage 2: Computed Metrics (parallel)\n'
            'growthRates, returnMetrics, debtMetrics, fcf, keyMetrics\n'
            'All derived from EDGAR statements',

            'Stage 3: External Data (parallel)\n'
            'gurus (13F), insiders, compensation, peers, analystEstimates,\n'
            'events, prices, transcripts, filings',

            'Stage 4: Dependent Data\n'
            'peerFrameData, peerMetrics, peerScores\n'
            '(requires peers from Stage 3)',

            'Stage 5: Composite Scores\n'
            'moatScore, managementScore, thesisScore\n'
            '(requires growth + returns from Stage 2)',

            'Stage 6-7: Classification + Enrichment\n'
            'Thesis taxonomy, batch quotes, TTM rollup\n'
            '→ Final DataPacket JSON (~200-500KB)',
        ],
        arrow_color=TEAL,
        box_fill=(235, 245, 240),
        text_color=SLATE
    )

    pdf.add_section_header('DataPacket Slicing per Agent', level=2)
    pdf.add_body_text(
        'Each agent receives only the DataPacket fields listed in its config. '
        'This focuses the agent\'s context and prevents cross-contamination.'
    )
    pdf.add_table(
        ['Agent', 'DataPacket Slice'],
        [
            ['business-analyst', 'companyInfo, classification, thesisScore, peers'],
            ['financial-analyst', 'financials, ttm, growthRates, returnMetrics, debtMetrics, fcf, keyMetrics'],
            ['valuation-specialist', 'growthRates, returnMetrics, fcf, analystEstimates, ttm, currentPrice, keyMetrics'],
            ['competitor-evaluator', 'peers, peerMetrics, classification, companyInfo'],
            ['management-evaluator', 'compensation, insiders, gurus, companyInfo'],
            ['risk-analyst', 'companyInfo, events, analystEstimates, classification'],
            ['synthesis-writer', '(none — receives analyst summaries instead)'],
            ['annual-reader', 'companyInfo, classification, financials, ttm, filings, filingContent'],
            ['quarterly-reader', 'companyInfo, classification, financials, ttm, filings, filingContent, transcripts'],
        ],
        col_widths=[34, 110]
    )

    # ═══════════════════════════════════════════════════════════════
    # 8. CURRICULUM & CONTEXT LOADING
    # ═══════════════════════════════════════════════════════════════
    pdf.add_section_header('8. Curriculum & Context Loading')

    pdf.add_body_text(
        'Every agent receives: (1) Universal context — value investing fundamentals + tools, '
        '(2) Agent-specific curriculum — methodology files relevant to their role, '
        '(3) PSR findings — insights from preprocessing agents. Universal context is '
        'cached across agents for cost savings.'
    )

    pdf.add_section_header('Universal Context (All Agents)', level=2)
    pdf.add_table(
        ['File', 'Content'],
        [
            ['rule-one-fundamentals.md', 'Investment philosophy, compound returns, margin of safety, event investing, 3 Ms'],
            ['tools-for-analysis.md', 'Financial formulas, data source commands, calculation examples'],
        ],
        col_widths=[50, 94]
    )
    pdf.add_body_text('These are cached (cache_control: ephemeral) so they only count toward input tokens once per pipeline run.')

    pdf.add_section_header('Agent-Specific Curriculum', level=2)
    pdf.add_table(
        ['Agent', 'Curriculum Files', 'Why'],
        [
            ['business-analyst', 'pitch-deck-I, one-pager, story-form-I, advanced-financial-analysis', 'Moat definitions, business evaluation, meaning analysis'],
            ['financial-analyst', 'advanced-financial-analysis, fgr, capex-cash-flow-explained', 'Financial formulas, growth rate methodology, capex analysis'],
            ['valuation-specialist', 'pitch-deck-IV, fgr, equity-bond-research, advanced-financial, capex', 'All 4 valuation methods, FGR derivation, Buffettology'],
            ['competitor-evaluator', 'pitch-deck-I, pitch-deck-II, story-form-I, advanced-financial', 'Competitive positioning, moat validation framework'],
            ['management-evaluator', 'pitch-deck-II, advanced-financial, buffett_letters/, guru-list', 'Leadership evaluation, compensation analysis, guru context'],
            ['risk-analyst', 'pitch-deck-III, story-form-II, advanced-financial, fgr', 'PEST analysis, inversion methodology, event framework'],
            ['synthesis-writer', 'buffett_letters_claude_training_set/', 'Buffett writing style for prose quality'],
            ['PSR agents (3)', '(none — universal context only)', 'Raw extraction, not analysis'],
        ],
        col_widths=[30, 60, 54]
    )

    pdf.add_section_header('Contamination Boundary', level=2)
    pdf.add_body_text(
        'CRITICAL: Agents must NEVER access example files. These directories are excluded '
        'from all agent configs:'
    )
    pdf.add_bullet('knowledge/stage-1-one-pager/examples/ (LULU One Pager)')
    pdf.add_bullet('knowledge/stage-2-pitch-deck/examples/ (LULU Pitch Deck)')
    pdf.add_bullet('knowledge/stage-3-full-story/examples/ (LULU Full Story)')
    pdf.add_bullet('knowledge/pre-course-examples/ (EW, SFM, MU, ODFL)')
    pdf.add_body_text(
        'These exist only for the PM to compare output quality after generation. '
        'If agents see examples, they pattern-match instead of independently analyzing.'
    )

    # ═══════════════════════════════════════════════════════════════
    # 9. SECTION-TO-AGENT MAPPING (ALL STAGES)
    # ═══════════════════════════════════════════════════════════════
    pdf.add_section_header('9. Section-to-Agent Mapping (All Stages)')

    pdf.add_body_text(
        'Complete mapping from the orchestrator config. Shows which agent handles which '
        'section number in each stage. Agents are reused across stages with different '
        'section assignments.'
    )

    pdf.add_section_header('Cross-Stage Agent Usage', level=2)
    pdf.add_table(
        ['Agent', 'One Pager Sections', 'Pitch Deck Sections', 'Full Story Sections'],
        [
            ['business-analyst', 'S1, S2', 'S1, S2', 'S2 (meaning), S3 (moat)'],
            ['financial-analyst', 'S3, S4', 'S5, S7, S8', 'S5 (valuation), S6 (judge)'],
            ['valuation-specialist', 'S5', 'S10', 'S5, S7 (trading strategy)'],
            ['competitor-evaluator', '—', 'S3, S4', 'S3 (moat checklist)'],
            ['management-evaluator', '—', 'S6', 'S4 (management checklist)'],
            ['risk-analyst', '—', 'S9', 'S1 (events), S6 (bear)'],
            ['synthesis-writer', 'S6', '(polish pass)', 'S6 (bull), S8 (PACE plan)'],
        ],
        col_widths=[30, 30, 34, 50]
    )

    pdf.add_section_header('Agent Reuse Across Stages', level=2)
    pdf.draw_bar_chart(
        'Number of Section Assignments per Agent (All 3 Stages)',
        [
            'financial-analyst',
            'business-analyst',
            'valuation-specialist',
            'synthesis-writer',
            'risk-analyst',
            'competitor-evaluator',
            'management-evaluator',
        ],
        [7, 6, 4, 3, 3, 3, 2],
        colors=[SONNET_COLOR, SONNET_COLOR, OPUS_COLOR, OPUS_COLOR, OPUS_COLOR, SONNET_COLOR, SONNET_COLOR],
        max_val=8
    )

    # ═══════════════════════════════════════════════════════════════
    # 10. CURRENT STATUS & GAPS
    # ═══════════════════════════════════════════════════════════════
    pdf.add_section_header('10. Current Status & Gaps for Full Story')

    pdf.add_section_header('What EXISTS Today', level=2)
    pdf.add_bullet('All 10 agent configs (config.json) — roles, models, curriculum, DataPacket slices defined')
    pdf.add_bullet('All 10 agent prompts (prompt.md) — investigation mandate, web research, curriculum sections')
    pdf.add_bullet('Dispatch table — Full Story workflow defined in dispatch-table.json (3 phases + debate)')
    pdf.add_bullet('Section keys defined: event_analysis, meaning_checklist, moat_checklist, management_checklist, valuation_confirmation, inversion_rebuttal, trading_strategy, pace_plan')
    pdf.add_bullet('ReportSectionSchema — output format already defined and validated')
    pdf.add_bullet('API dispatch engine (aiResearch.js) — proven on Pitch Deck, ready for Full Story')
    pdf.add_bullet('Pipeline manager (pipelineManager.js) — wave orchestration, checkpoints, budget tracking')
    pdf.add_bullet('Quality system (critic.js) — mechanical + methodology scoring')
    pdf.add_bullet('Curriculum files — story-form-I.md (sections 1-4) and story-form-II.md (sections 5-8)')
    pdf.ln(3)

    pdf.add_section_header('What NEEDS to Be Built', level=2)
    pdf.add_bullet('Full Story CC skill orchestration — like generate-one-pager but for Stage 3')
    pdf.add_bullet('Checklist scoring mechanism — 43-item checklists (15+15+13) need scored output format')
    pdf.add_bullet('Debate orchestration — Bull/Bear/Judge sequential dispatch with role switching')
    pdf.add_bullet('Pitch Deck inheritance — loading prior PD findings as context for FS agents')
    pdf.add_bullet('Full Story methodology checks in critic.js — new curriculum-derived checks')
    pdf.add_bullet('Trading strategy + PACE plan prompt engineering — new section types')
    pdf.add_bullet('Growth ceiling analysis — market share ceiling validation')
    pdf.add_bullet('Inversion protocol — structured "for every reason, create counter-argument"')
    pdf.ln(3)

    pdf.add_section_header('Key Questions for v1.2 Planning', level=2)
    pdf.add_numbered_item(1, 'Are the existing agent prompts sufficient for Full Story, or do they need '
                            'Full Story-specific prompt sections?')
    pdf.add_numbered_item(2, 'The dispatch table shows competitor-evaluator on Full Story S3 (moat_checklist) '
                            'but the orchestrator mapping shows business-analyst. Which is correct?')
    pdf.add_numbered_item(3, 'Phase 2 debate: should Bull → Bear → Judge be strictly sequential, or can '
                            'Bull and Bear run in parallel with Judge receiving both?')
    pdf.add_numbered_item(4, 'Do we need new agents for the Full Story, or just new prompts for existing ones?')
    pdf.add_numbered_item(5, 'How should checklist items be scored? Binary pass/fail? 1-5 scale? Narrative + score?')

    # ═══════════════════════════════════════════════════════════════
    # OUTPUT
    # ═══════════════════════════════════════════════════════════════
    output_path = os.path.join(os.path.dirname(__file__), '..', '..', 'Thesis-Agent-Architecture.pdf')
    output_path = os.path.abspath(output_path)
    pdf.output(output_path)
    print(f'PDF generated: {output_path}')
    return output_path


if __name__ == '__main__':
    build_pdf()
