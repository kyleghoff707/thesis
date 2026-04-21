#!/usr/bin/env python3
"""
Multi-Agent Orchestration Alternatives — Thes1s Branded Research PDF.

Generates a publication-ready research report covering:
  - Why Managed Agents callable_agents is blocking the Pitch Deck pipeline
  - 11 alternative orchestration platforms (frameworks, cloud, durable)
  - Per-agent LLM model recommendations
  - Production patterns Thes1s is currently missing

Uses the shared Thes1s pdf_template_toolkit so the report carries the same
teal+slate palette and T1 logo as the One Pager / Pitch Deck / Full Story PDFs.
"""

import os
import sys
from datetime import date

# Add scripts/pdf to path for toolkit import
_HERE = os.path.dirname(os.path.abspath(__file__))
_REPO_ROOT = os.path.abspath(os.path.join(_HERE, '..', '..'))
sys.path.insert(0, os.path.join(_REPO_ROOT, 'scripts', 'pdf'))
from pdf_template_toolkit import ReportPDF  # noqa: E402


# ════════════════════════════════════════════════════════════════════════════
# THES1S-BRANDED PDF SUBCLASS
# ════════════════════════════════════════════════════════════════════════════

class Thes1sResearchPDF(ReportPDF):
    """Thes1s-branded PDF with teal/slate palette, T1 logo, and custom diagrams."""

    def __init__(self, title='Report', subtitle=''):
        super().__init__(title, subtitle)

        # Thes1s palette (teal-500 + slate-800)
        self.color_primary = (15, 118, 110)
        self.color_secondary = (30, 41, 59)
        self.color_text = (30, 41, 59)
        self.color_muted = (100, 116, 139)
        self.color_light_muted = (148, 163, 184)
        self.color_accent = (15, 118, 110)
        self.color_table_header = (15, 118, 110)
        self.color_table_alt_row = (240, 253, 250)

        # Extended palette for diagrams
        self.teal_500 = (15, 118, 110)
        self.teal_400 = (45, 212, 191)
        self.teal_300 = (94, 234, 212)
        self.teal_100 = (204, 251, 241)
        self.teal_50 = (240, 253, 250)
        self.slate_800 = (30, 41, 59)
        self.slate_700 = (51, 65, 85)
        self.slate_600 = (71, 85, 105)
        self.slate_500 = (100, 116, 139)
        self.slate_400 = (148, 163, 184)
        self.slate_300 = (203, 213, 225)
        self.slate_200 = (226, 232, 240)
        self.slate_100 = (241, 245, 249)
        self.slate_50 = (248, 250, 251)
        self.amber_500 = (245, 158, 11)
        self.amber_300 = (252, 211, 77)
        self.green_500 = (34, 197, 94)
        self.red_500 = (239, 68, 68)
        self.blue_500 = (59, 130, 246)
        self.purple_500 = (139, 92, 246)
        self.indigo_500 = (99, 102, 241)

    # ── Logo ────────────────────────────────────────────────────────────────

    def draw_logo(self, x, y, size=22):
        s = size / 32
        self.set_fill_color(*self.slate_800)
        self.set_draw_color(*self.slate_800)
        self.rect(x, y, 32 * s, 32 * s, 'DF')
        self.set_fill_color(20, 184, 166)
        cx, cy = x + 16 * s, y + 5 * s
        r = 2.5 * s
        self.ellipse(cx - r, cy - r, r * 2, r * 2, 'F')
        self.set_fill_color(203, 213, 225)
        self.rect(x + 4.5 * s, y + 10 * s, 23 * s, 2.8 * s, 'F')
        self.set_fill_color(20, 184, 166)
        self.rect(x + 14 * s, y + 10 * s, 4 * s, 17 * s, 'F')

    def add_title_page(self, info_lines=None, disclaimer=None):
        self.add_page()
        self.ln(20)
        logo_size = 28
        logo_x = (self.w - logo_size) / 2
        self.draw_logo(logo_x, self.get_y(), logo_size)
        self.ln(logo_size + 8)

        self.set_font('ArialUni', 'B', 12)
        self.set_text_color(*self.teal_500)
        self.cell(0, 6, 'Thes1s', align='C', new_x="LMARGIN", new_y="NEXT")
        self.ln(12)

        self.set_font('ArialUni', 'B', 22)
        self.set_text_color(*self.slate_800)
        self.multi_cell(0, 10, self.report_title, align='C')
        self.ln(4)

        if self.report_subtitle:
            self.set_font('ArialUni', '', 13)
            self.set_text_color(*self.slate_600)
            self.multi_cell(0, 7, self.report_subtitle, align='C')
            self.ln(10)

        self.set_draw_color(*self.teal_500)
        self.set_line_width(0.8)
        x_center = self.w / 2
        self.line(x_center - 40, self.get_y(), x_center + 40, self.get_y())
        self.ln(12)

        self.set_font('ArialUni', '', 11)
        self.set_text_color(*self.slate_500)
        if info_lines is None:
            info_lines = [date.today().strftime('%B %d, %Y')]
        for line in info_lines:
            self.cell(0, 7, line, align='C', new_x="LMARGIN", new_y="NEXT")

    def header(self):
        if self.page_no() > 1:
            self.draw_logo(self.l_margin, 5, 8)
            self.set_font('ArialUni', '', 8)
            self.set_text_color(*self.slate_500)
            self.set_xy(self.l_margin + 11, 5)
            self.cell(0, 8, self.report_title)
            self.set_draw_color(*self.teal_100)
            self.set_line_width(0.3)
            self.line(self.l_margin, 14, self.w - self.r_margin, 14)
            self.set_y(18)

    def footer(self):
        self.set_y(-12)
        self.set_font('ArialUni', '', 7.5)
        self.set_text_color(*self.slate_500)
        if self.page_no() > 1:
            self.cell(0, 10,
                      f'Thes1s  |  Multi-Agent Orchestration Research  |  Page {self.page_no() - 1}',
                      align='C')

    # ── Custom Diagrams ─────────────────────────────────────────────────────

    def draw_wave_diagram(self, title, waves):
        """
        Draw the Pitch Deck wave structure: numbered waves with parallel boxes.
        waves: list of (wave_label, [agent_name, ...]) tuples
        """
        if self.get_y() + 30 + len(waves) * 28 > self.h - 25:
            self.add_page()
        self.ln(3)
        self.set_font('ArialUni', 'B', 11)
        self.set_text_color(*self.teal_500)
        self.cell(0, 7, title, new_x="LMARGIN", new_y="NEXT")
        self.ln(3)

        wave_color_seq = [self.teal_500, self.teal_400, self.indigo_500,
                          self.purple_500, self.amber_500]

        available_w = self.w - self.l_margin - self.r_margin
        label_w = 35

        for w_idx, (wave_label, agents) in enumerate(waves):
            color = wave_color_seq[w_idx % len(wave_color_seq)]
            n = len(agents)
            box_h = 18
            box_w = min(45, (available_w - label_w - (n - 1) * 4) / max(n, 1))
            y = self.get_y()
            if y + box_h + 12 > self.h - 25:
                self.add_page()
                y = self.get_y()

            # Wave label on left
            self.set_font('ArialUni', 'B', 9)
            self.set_text_color(*color)
            self.set_xy(self.l_margin, y + box_h / 2 - 3)
            self.cell(label_w - 4, 6, wave_label, align='R')

            # Agent boxes
            x_start = self.l_margin + label_w
            for i, agent in enumerate(agents):
                x = x_start + i * (box_w + 4)
                self.set_fill_color(*self.teal_50)
                self.set_draw_color(*color)
                self.set_line_width(0.6)
                self.rect(x, y, box_w, box_h, 'DF')
                self.set_font('ArialUni', 'B', 7)
                self.set_text_color(*self.slate_800)
                self.set_xy(x + 1, y + 2)
                self.multi_cell(box_w - 2, 3.6, agent, align='C')

            # Arrow down to next wave
            if w_idx < len(waves) - 1:
                self.set_draw_color(*self.slate_400)
                self.set_line_width(0.5)
                arrow_x = self.l_margin + label_w + (available_w - label_w) / 2
                self.line(arrow_x, y + box_h, arrow_x, y + box_h + 5)
                self.line(arrow_x - 1.5, y + box_h + 3.5, arrow_x, y + box_h + 5)
                self.line(arrow_x + 1.5, y + box_h + 3.5, arrow_x, y + box_h + 5)

            self.set_y(y + box_h + 6)
        self.ln(4)

    def draw_architecture_diagram(self, title, layers):
        """Vertical layered diagram: list of (label, description, color) top to bottom."""
        box_w = 150
        box_h = 16
        gap = 3
        if self.get_y() + len(layers) * (box_h + gap) + 20 > self.h - 25:
            self.add_page()
        self.ln(3)
        self.set_font('ArialUni', 'B', 10)
        self.set_text_color(*self.teal_500)
        self.cell(0, 7, title, new_x="LMARGIN", new_y="NEXT")
        self.ln(3)
        x_center = self.w / 2
        x_box = x_center - box_w / 2
        for label, desc, fill_color in layers:
            y = self.get_y()
            if y + box_h + 5 > self.h - 25:
                self.add_page()
                y = self.get_y()
            self.set_fill_color(*fill_color)
            self.set_draw_color(*self.slate_700)
            self.set_line_width(0.4)
            self.rect(x_box, y, box_w, box_h, 'DF')
            # readable text color: light fills get dark text, dark fills get light text
            r, g, b = fill_color
            brightness = (r + g + b) / 3
            text_color = self.slate_800 if brightness > 130 else (255, 255, 255)
            self.set_font('ArialUni', 'B', 9)
            self.set_text_color(*text_color)
            self.set_xy(x_box + 2, y + 1.5)
            self.cell(box_w - 4, 5, label)
            self.set_font('ArialUni', '', 7.5)
            self.set_xy(x_box + 2, y + 7)
            self.cell(box_w - 4, 5, desc)
            self.set_y(y + box_h + gap)
        self.ln(4)

    def draw_decision_tree(self, title, root, branches):
        """Render a simple text-based decision tree as a code block with branding wrapper."""
        if self.get_y() + 20 > self.h - 25:
            self.add_page()
        self.ln(3)
        self.set_font('ArialUni', 'B', 10)
        self.set_text_color(*self.teal_500)
        self.cell(0, 7, title, new_x="LMARGIN", new_y="NEXT")
        self.ln(3)
        # Use code block with teal tinge
        text = root + '\n' + '\n'.join(branches)
        self.set_fill_color(*self.teal_50)
        self.set_draw_color(*self.teal_500)
        self.set_line_width(0.4)
        self.set_font('ArialUni', '', 7.5)
        self.set_text_color(*self.slate_800)
        x = self.l_margin
        y = self.get_y()
        w = self.w - self.l_margin - self.r_margin
        lines = text.split('\n')
        line_height = 4.4
        block_height = len(lines) * line_height + 6
        if y + block_height > self.h - 25:
            self.add_page()
            y = self.get_y()
        self.rect(x, y, w, block_height, 'DF')
        self.set_xy(x + 3, y + 3)
        for line in lines:
            self.set_x(x + 3)
            self.cell(w - 6, line_height, line)
            self.ln(line_height)
        self.ln(4)


# ════════════════════════════════════════════════════════════════════════════
# REPORT BUILDER
# ════════════════════════════════════════════════════════════════════════════

def build_pdf():
    pdf = Thes1sResearchPDF(
        title='Multi-Agent Orchestration Alternatives & Model Optimization',
        subtitle='Evaluating 11 platforms for the Pitch Deck pipeline blocked on Anthropic Managed Agents'
    )

    # ── Title Page ──────────────────────────────────────────────────────────
    pdf.add_title_page(info_lines=[
        date.today().strftime('%B %d, %Y'),
        'Thes1s Project — Internal Research Report',
        'Decision-support for the Pitch Deck pipeline',
    ])

    pdf.add_toc([
        'Executive Summary',
        'The Problem We Are Solving',
        'Current State of the Pipeline',
        'Evaluation Framework',
        'Platform Deep Dives',
        'Comparison Matrix',
        'Migration Effort by Platform',
        'Cost Analysis',
        'Model Optimization Per Agent',
        'Production Patterns We Are Missing',
        'Recommended Path Forward',
        'Appendix — Agent Inventory',
    ])

    # ════════════════════════════════════════════════════════════════════════
    # 1. EXECUTIVE SUMMARY
    # ════════════════════════════════════════════════════════════════════════

    pdf.add_section_header('1. Executive Summary', level=1)

    pdf.add_body_text(
        'You are 1.5 weeks into waiting for Anthropic\'s multiagent Research Preview '
        'approval. The One Pager pipeline is live. The Pitch Deck (10 specialists + '
        'coordinator across 5 dependency waves) and Full Story (7 agents across 2 '
        'phases) cannot ship without orchestrator-to-subagent dispatch. This report '
        'evaluates 11 alternative platforms across four categories, scores them '
        'against your specific constraints, and recommends a phased path forward.'
    )

    pdf.add_section_header('Top-Line Recommendations', level=2)

    pdf.add_numbered_item(1,
        'Primary path (~5 day migration): Move the Pitch Deck coordinator to Claude '
        'Agent SDK (Anthropic\'s open-source self-hosted agent loop). Subagent files '
        'are nearly identical to your current prompt.md + managed-agent.yaml format. '
        'Production parity preserved — when Managed Agents callable_agents opens, '
        'you can swap back without prompt changes.'
    )
    pdf.add_numbered_item(2,
        'Backup path if Claude Agent SDK is too immature: Inngest AgentKit. AI-first '
        'multi-agent framework on a durable execution backend. Free tier covers your '
        'volume. Wave structure maps to Network + Router pattern almost directly.'
    )
    pdf.add_numbered_item(3,
        'Long-term Cloudflare-native answer: Cloudflare Project Think (sub-agents '
        'on Durable Objects). Currently in preview. Once GA, this is the right home '
        'for Thes1s — same vendor as your Workers + D1 + R2 stack.'
    )
    pdf.add_numbered_item(4,
        'Model optimization is independent of platform choice and worth doing now. '
        'Mixing models per agent — Gemini 2.5 Pro for filing reading, GPT-5.4 for '
        'valuation math, Claude Opus 4.7 for synthesis and bear-case reasoning, '
        'Claude Haiku 4.5 for orchestration — saves ~40% per Pitch Deck and lifts '
        'quality on numerical sections.'
    )
    pdf.add_numbered_item(5,
        'What we are missing today: real observability (LangSmith / Langfuse / '
        'AgentOps trace + replay), structured eval harness against known verdicts, '
        'prompt versioning with measured impact, circuit breakers on cost + token '
        'spend, and typed structured output validation at agent boundaries.'
    )

    # ════════════════════════════════════════════════════════════════════════
    # 2. THE PROBLEM
    # ════════════════════════════════════════════════════════════════════════

    pdf.add_section_header('2. The Problem We Are Solving', level=1)

    pdf.add_body_text(
        'Your feedback_no_custom_orchestration memory is the load-bearing constraint: '
        'Workers, Durable Objects, and hand-rolled dispatch all failed in v1 of the '
        'pipeline. The pivot to Managed Agents was the right call. But "no custom '
        'orchestration" was always shorthand for "no DIY orchestration code I have to '
        'debug myself" — it was never a vote against using a battle-tested orchestration '
        'framework someone else maintains.'
    )

    pdf.add_section_header('The Two Functional Requirements', level=2)

    pdf.add_bullet(
        'Multi-agent callability with parallelism within waves. The Pitch Deck '
        'dispatches 10 specialist agents in 5 dependency waves. Within Wave 2, three '
        'agents (Moats, Financial Analyst, Management Evaluator) must run in parallel. '
        'Wave 3 cannot start until Wave 2 completes.'
    )
    pdf.add_bullet(
        'A smart, dynamic orchestrator that handles failures. Pitch Deck and Full '
        'Story runs take 10-30 minutes. Network blips, rate-limit 429s, malformed JSON, '
        'and partial section outputs happen in production. The orchestrator must retry '
        'transient failures, surface durable failures, and continue the pipeline when '
        'individual sections fail rather than aborting the whole 25-minute run.'
    )

    pdf.add_body_text(
        'Anything you adopt must satisfy both, and must not violate '
        'feedback_production_parity — the migration must be reversible if Managed '
        'Agents access lands tomorrow.'
    )

    # ════════════════════════════════════════════════════════════════════════
    # 3. CURRENT STATE
    # ════════════════════════════════════════════════════════════════════════

    pdf.add_section_header('3. Current State of the Pipeline', level=1)

    pdf.add_section_header('Pitch Deck Wave Structure', level=2)

    pdf.add_body_text(
        'The current pipeline is a 5-superstep DAG. Every modern multi-agent framework '
        'has a primitive for this — the question is which one we want to own.'
    )

    pdf.draw_wave_diagram('Pitch Deck — 5 Wave Dependency Graph', [
        ('Wave 0 (PSR)', ['Annual Reader', 'Quarterly Reader']),
        ('Wave 1 (Business)', ['Business Analyst', 'Market Position']),
        ('Wave 2 (Deep)', ['Moats', 'Financial', 'Management']),
        ('Wave 3 (Risk+Val)', ['Risk Analyst', 'Valuation']),
        ('Wave 4 (Synth)', ['Synthesis Writer']),
    ])

    pdf.add_section_header('Current Model Assignments (20 agents)', level=2)

    pdf.add_body_text(
        '19 of 20 agents are on Sonnet 4.6. Only risk-analyst-fullstory runs Opus. '
        'Total prompt corpus is ~98,000 words across 20 agents — roughly 130K tokens '
        'of system prompt content. This is a meaningful asset; any migration must '
        'preserve it byte-for-byte.'
    )

    pdf.add_table(
        ['Agent', 'Stage', 'Current Model', 'Prompt Words'],
        [
            ['coordinator-pitchdeck', 'Pitch Deck', 'Sonnet 4.6', '1,110'],
            ['coordinator-fullstory', 'Full Story', 'Sonnet 4.6', '1,926'],
            ['one-pager', 'One Pager', 'Sonnet 4.6', '2,625'],
            ['annual-reader', 'PSR (PD+FS)', 'Sonnet 4.6', '5,424'],
            ['quarterly-reader', 'PSR (PD+FS)', 'Sonnet 4.6', '4,424'],
            ['business-analyst-pitchdeck', 'PD §1-2', 'Sonnet 4.6', '6,077'],
            ['business-analyst-fullstory', 'FS §2', 'Sonnet 4.6', '6,239'],
            ['comp-eval-mkt-pos-pitchdeck', 'PD §3', 'Sonnet 4.6', '4,931'],
            ['comp-eval-moats-pitchdeck', 'PD §4', 'Sonnet 4.6', '3,691'],
            ['competitor-evaluator-fullstory', 'FS §3', 'Sonnet 4.6', '6,023'],
            ['financial-analyst-pitchdeck', 'PD §5,7,8', 'Sonnet 4.6', '5,625'],
            ['financial-analyst-fullstory', 'FS §6 Judge', 'Sonnet 4.6', '4,197'],
            ['management-evaluator-pitchdeck', 'PD §6', 'Sonnet 4.6', '4,851'],
            ['management-evaluator-fullstory', 'FS §4', 'Sonnet 4.6', '6,004'],
            ['risk-analyst-pitchdeck', 'PD §9', 'Sonnet 4.6', '4,842'],
            ['risk-analyst-fullstory', 'FS §1+Bear', 'Opus 4.6', '7,443'],
            ['valuation-specialist-pitchdeck', 'PD §10', 'Sonnet 4.6', '5,090'],
            ['valuation-specialist-fullstory', 'FS §5', 'Sonnet 4.6', '5,169'],
            ['synthesis-writer-pitchdeck', 'PD §11', 'Sonnet 4.6', '4,145'],
            ['synthesis-writer-fullstory', 'FS §6 Bull/Reb', 'Sonnet 4.6', '4,041'],
        ]
    )

    # ════════════════════════════════════════════════════════════════════════
    # 4. EVALUATION FRAMEWORK
    # ════════════════════════════════════════════════════════════════════════

    pdf.add_section_header('4. Evaluation Framework', level=1)

    pdf.add_body_text(
        'For each platform, the report scores on eight dimensions:'
    )

    pdf.add_table(
        ['Dimension', 'What it measures'],
        [
            ['Multi-agent fit', 'First-class abstraction for orchestrator + specialists + waves'],
            ['Parallelism within waves', 'Native parallel dispatch vs hand-rolled Promise.all'],
            ['Failure handling', 'Retries, replay, checkpoints, supervisor patterns, durable execution'],
            ['Multi-LLM support', 'Can we mix Claude / GPT-5 / Gemini per agent?'],
            ['Migration ease', '1 = rewrite required → 5 = drop in verbatim'],
            ['Production maturity', 'Who runs it in prod? When did it GA?'],
            ['Cost at our volume', '~50-100 Pitch Decks + 20 Full Stories per month'],
            ['Production parity', 'Reversible if Managed Agents callable_agents opens?'],
        ]
    )

    # ════════════════════════════════════════════════════════════════════════
    # 5. PLATFORM DEEP DIVES
    # ════════════════════════════════════════════════════════════════════════

    pdf.add_section_header('5. Platform Deep Dives', level=1)

    pdf.add_body_text(
        'Eleven platforms across four tiers. Tier 1 = Anthropic\'s own self-hosted '
        'stack. Tier 2 = open-source multi-agent frameworks. Tier 3 = managed cloud '
        'agent services. Tier 4 = lower-level durable workflow engines you would '
        'combine with one of the above.'
    )

    # ── Tier 1: Anthropic Self-Hosted ──
    pdf.add_section_header('Tier 1 — Anthropic Self-Hosted Stack', level=2)
    pdf.add_section_header('5.1 Claude Agent SDK  [TOP PICK]', level=3)

    pdf.add_body_text(
        'The Claude Agent SDK (formerly Claude Code SDK) is Anthropic\'s open-source '
        'library that runs the same agent loop as Claude Code in your own '
        'infrastructure. Subagents are defined as Markdown files with YAML '
        'frontmatter — name, description, tools, model, permissions — almost identical '
        'to your current managed-agent.yaml + prompt.md split.'
    )

    pdf.add_table(
        ['Property', 'Detail'],
        [
            ['Multi-agent', 'Subagents isolate context, run in parallel, parent dispatches via Task tool'],
            ['Parallelism', 'Subagents fire in parallel by design; you control fan-out from dispatch code'],
            ['Failure handling', 'You own retries (no managed supervisor); pair with Cloudflare Workflow for durability'],
            ['Multi-LLM', 'Native Claude only; LiteLLM proxy enables OpenAI / Gemini / Bedrock'],
            ['Migration', 'LOWEST. Drop prompts into .claude/agents/ with merged YAML frontmatter'],
            ['Cost', 'SDK free; pay tokens (same as today) + ~$10-25/mo runner hosting'],
            ['Production parity', 'HIGHEST. Same model access, same prompts, easy revert'],
            ['Gotchas', 'Re-implement session/event lifecycle; rewire web_search'],
        ]
    )

    # ── Tier 2: Frameworks ──
    pdf.add_section_header('Tier 2 — Multi-Agent Frameworks', level=2)
    pdf.add_section_header('5.2 LangGraph', level=3)

    pdf.add_body_text(
        'The most production-tested multi-agent framework in market. Used by Klarna, '
        'Replit, Uber, LinkedIn, Elastic, JP Morgan, BlackRock. Hit v1.0 in Oct 2025. '
        'Agents are nodes in a StateGraph; edges are control flow. Execution is '
        'superstep-based (Pregel/BEAM model) — your wave structure maps 1:1 to graph layers.'
    )

    pdf.add_bullet('Parallelism: static fanout (multiple edges) or dynamic Send API (runtime map-reduce)')
    pdf.add_bullet('Failure handling: per-node RetryPolicy, checkpointer (Postgres/SQLite/Dynamo), interrupt() for HITL')
    pdf.add_bullet('Multi-LLM: trivial — ChatAnthropic, ChatOpenAI, ChatGoogleGenerativeAI interchangeable per node')
    pdf.add_bullet('Cost: LangSmith Developer free (5K traces/mo); LangGraph self-hosted free for first 100K node executions')
    pdf.add_bullet('Caveat: checkpoints are persistence, not durable execution — you need PM2/k8s/systemd to respawn the host')

    pdf.add_section_header('5.3 Inngest AgentKit', level=3)

    pdf.add_body_text(
        'Best-fit AI-native abstraction for your specific pattern. Agent = single LLM '
        '+ tools; Network = multiple agents + a Router that decides which agent runs '
        'next; backed by step.run() and step.ai.infer() which are auto-checkpointed '
        'and retried.'
    )

    pdf.add_bullet('Parallelism: native via step.parallel(); wave dispatch via Router function (~50 LOC)')
    pdf.add_bullet('Failure handling: per-step retry, replay from last step on crash, throttling, concurrency limits')
    pdf.add_bullet('Multi-LLM: native — OpenAI, Anthropic, Gemini, any OpenAI-compatible')
    pdf.add_bullet('Cost: free tier 50K executions/mo (you live in free tier indefinitely)')
    pdf.add_bullet('Production parity: lower than Claude Agent SDK; different abstraction')

    pdf.add_section_header('5.4 OpenAI Agents SDK', level=3)
    pdf.add_body_text(
        'Production-ready open-source framework. Two coordination patterns: handoffs '
        '(control transfers) and agents-as-tools (orchestrator stays in control). '
        'Agents-as-tools fits your pipeline. LiteLLM adapter for non-OpenAI models is '
        'beta — for a Claude-heavy stack, Claude Agent SDK is a more direct fit.'
    )

    pdf.add_section_header('5.5 Frameworks to skip', level=3)
    pdf.add_bullet(
        'CrewAI — hierarchical mode produces circular delegation, off-topic tangents, '
        'infinite consensus loops. Exact failure mode that would break your 11-agent '
        'dependency graph.'
    )
    pdf.add_bullet(
        'Microsoft AutoGen v0.4 — conversation/group-chat mental model; does not match '
        'your fixed dependency-wave pipeline.'
    )
    pdf.add_bullet(
        'Pydantic AI — promising AgentSpec for YAML loading; smaller ecosystem; revisit '
        'in 6 months.'
    )
    pdf.add_bullet(
        'LlamaIndex AgentWorkflow — RAG-first lineage; multi-agent surface area is newer.'
    )

    # ── Tier 3: Cloud platforms ──
    pdf.add_section_header('Tier 3 — Cloud Platform Agent Services', level=2)
    pdf.add_section_header('5.6 Cloudflare Project Think', level=3)
    pdf.add_body_text(
        'The eventual right answer for Thes1s. April 2026 announcement adds sub-agents '
        'on Durable Objects, durable execution with fibers, persistent sessions, '
        'sandboxed code execution. AI Gateway brokers 70+ models with one API and no '
        'markup. Sub-agents are PREVIEW as of April 2026 — wait until GA before betting '
        'production on it.'
    )

    pdf.add_section_header('5.7 AWS Bedrock Multi-Agent Collaboration', level=3)
    pdf.add_body_text(
        'GA since early 2025, now part of Bedrock AgentCore. Hierarchical supervisor + '
        'collaborator agents. Sessions up to 8 hours. Claude Sonnet 4.6 GA in Bedrock '
        'Feb 2026 at same per-token price as Anthropic direct. Modest premium of '
        '$0.10-0.50/run for AgentCore Runtime. Most mature multi-agent platform in market.'
    )

    pdf.add_section_header('5.8 Vertex AI Agent Engine', level=3)
    pdf.add_body_text(
        'ADK (Agent Development Kit) — Python+Java. Hierarchical agent trees, explicit '
        'ParallelAgent primitive. Free tier covers all your dev runs. Higher migration '
        'effort than Bedrock or LangGraph (~100 LOC per agent in Python).'
    )

    pdf.add_section_header('5.9 Microsoft Foundry Agent Service', level=3)
    pdf.add_body_text(
        'Best semantic match for waves (declarative State-based workflows; multi-agent '
        'workflows GA early 2026). Caveat: Enterprise/MCA-E subscriptions only — likely '
        'a blocker for an indie account.'
    )

    # ── Tier 4: Durable workflow engines ──
    pdf.add_section_header('Tier 4 — Durable Workflow Engines', level=2)
    pdf.add_body_text(
        'Lower-level infrastructure. You would combine these with one of the agent '
        'frameworks above (or build a thin agent abstraction on top).'
    )

    pdf.add_bullet(
        'Cloudflare Workflows — native to Workers; instances run for months; included '
        'in your $5/mo plan. No agent abstraction. Best use: wrap a Claude Agent SDK '
        'runner in a Workflow step for durable execution.'
    )
    pdf.add_bullet(
        'Temporal — gold standard. Most powerful, slowest migration, most ops burden. '
        'Cloud: $50/M actions + $100/mo base. Right answer at hedge-fund scale.'
    )
    pdf.add_bullet(
        'Restate — newer Temporal-alike with simpler ops. Viable but no compelling '
        'edge over Inngest for your case.'
    )
    pdf.add_bullet(
        'DBOS — durable execution as Postgres pattern. You don\'t have Postgres — pass.'
    )

    # ════════════════════════════════════════════════════════════════════════
    # 6. COMPARISON MATRIX
    # ════════════════════════════════════════════════════════════════════════

    pdf.add_section_header('6. Comparison Matrix', level=1)

    pdf.add_body_text(
        'Scored 1-5 (5 = best for your specific Thes1s case). Higher total = better fit.'
    )

    pdf.add_table(
        ['Platform', 'Multi', 'Parl', 'Fail', 'LLM', 'Mig', 'Mat', 'Cost', 'Par', 'Total'],
        [
            ['Inngest AgentKit', '5', '5', '5', '5', '5', '4', '5', '3', '37'],
            ['Claude Agent SDK', '5', '4', '3', '4', '5', '5', '5', '5', '36'],
            ['LangGraph', '5', '5', '4', '5', '4', '5', '5', '3', '36'],
            ['Microsoft Foundry*', '5', '5', '4', '4', '4', '4', '5', '3', '34'],
            ['AWS Bedrock MAC', '5', '5', '5', '3', '3', '5', '4', '3', '33'],
            ['CF Project Think', '5', '4', '5', '5', '3', '2', '5', '3', '32'],
            ['Vertex Agent Engine', '4', '5', '4', '5', '3', '4', '4', '3', '32'],
            ['OpenAI Agents SDK', '4', '4', '3', '4', '3', '5', '5', '2', '30'],
            ['Cloudflare Workflows', '1', '4', '5', '5', '2', '4', '5', '4', '30'],
            ['Temporal', '1', '5', '5', '5', '1', '5', '3', '4', '29'],
            ['CrewAI', '3', '3', '2', '5', '2', '4', '4', '2', '25'],
        ]
    )

    pdf.add_body_text(
        '* Foundry score gated by Enterprise subscription requirement.'
    )

    pdf.add_body_text(
        'Top three: Inngest AgentKit (37), Claude Agent SDK (36), LangGraph (36). '
        'All within striking distance — pick by deployment philosophy:'
    )
    pdf.add_bullet('Maximum production parity with Managed Agents → Claude Agent SDK')
    pdf.add_bullet('Most AI-native abstraction with built-in durable execution → Inngest AgentKit')
    pdf.add_bullet('Most mature framework with best observability story → LangGraph')

    # Visual scoring chart
    pdf.draw_bar_chart(
        'Total Fit Score (out of 40)',
        ['Inngest AgentKit', 'Claude Agent SDK', 'LangGraph', 'MS Foundry*',
         'AWS Bedrock MAC', 'CF Project Think', 'Vertex Agent Engine',
         'OpenAI Agents SDK', 'CF Workflows', 'Temporal', 'CrewAI'],
        [37, 36, 36, 34, 33, 32, 32, 30, 30, 29, 25],
        colors=[
            pdf.teal_500, pdf.teal_500, pdf.teal_500,
            pdf.teal_400, pdf.teal_400, pdf.teal_400, pdf.teal_400,
            pdf.slate_500, pdf.slate_500, pdf.slate_500,
            pdf.slate_400,
        ],
        unit='', max_val=40
    )

    # ════════════════════════════════════════════════════════════════════════
    # 7. MIGRATION EFFORT
    # ════════════════════════════════════════════════════════════════════════

    pdf.add_section_header('7. Migration Effort by Platform', level=1)

    pdf.add_body_text(
        'For each platform, what specifically you need to do to port the Pitch Deck '
        'pipeline. Time estimates assume one focused engineer.'
    )

    pdf.add_section_header('Claude Agent SDK — ~5 days', level=2)
    pdf.add_table(
        ['Step', 'Days'],
        [
            ['Move prompt.md into .claude/agents/ with merged YAML frontmatter', '1'],
            ['Rewrite coordinator dispatch using Task tool', '1'],
            ['Re-wire web_search (Anthropic search API or Tavily)', '0.5'],
            ['Wrap pipeline in long-running Node service or Cloudflare Workflow', '1'],
            ['Port assembleDataPacket.js integration (mostly unchanged)', '0.5'],
            ['End-to-end test on LULU + 2 known-verdict tickers', '1'],
        ]
    )

    pdf.add_section_header('Inngest AgentKit — ~5-6 days', level=2)
    pdf.add_table(
        ['Step', 'Days'],
        [
            ['Convert each agent to Agent({system, model, tools}) constructor', '2'],
            ['Write Router function for wave dispatch (~50 LOC)', '1'],
            ['Wire step.ai.infer() for each agent invocation', '1'],
            ['Sign up for Inngest, deploy initial run', '0.5'],
            ['End-to-end test', '1'],
        ]
    )

    pdf.add_section_header('LangGraph — ~7 days', level=2)
    pdf.add_table(
        ['Step', 'Days'],
        [
            ['Define typed State TypedDict with reducers for parallel writes', '1'],
            ['Convert each agent to a node function', '2'],
            ['Wire StateGraph with explicit edges per wave', '1'],
            ['Set up Postgres checkpointer (or SQLite for dev)', '0.5'],
            ['Provision LangSmith for tracing', '0.5'],
            ['Stand up long-running runner (Fly.io / Render)', '1'],
            ['End-to-end test', '1'],
        ]
    )

    pdf.add_section_header('AWS Bedrock MAC — ~7-10 days + AWS approval delay', level=2)
    pdf.add_section_header('CF Project Think — blocked on sub-agents GA (preview Apr 2026)', level=2)

    # ════════════════════════════════════════════════════════════════════════
    # 8. COST ANALYSIS
    # ════════════════════════════════════════════════════════════════════════

    pdf.add_section_header('8. Cost Analysis', level=1)

    pdf.add_body_text(
        'Assumes 100 Pitch Decks + 20 Full Stories per month. Token costs are LLM-side '
        'and identical across platforms (same Anthropic API prices). Platform fees are '
        'the differentiator.'
    )

    pdf.add_section_header('Per-Run Cost (Pitch Deck)', level=2)
    pdf.add_body_text(
        'Today, with Sonnet-only on Managed Agents, a Pitch Deck costs roughly '
        '$5-6/run in tokens. The optimal mixed-model stack drops this to ~$3.30/run.'
    )

    pdf.draw_bar_chart(
        'Pitch Deck Cost Per Run ($USD)',
        ['Sonnet-only baseline', 'Phase A swaps (Anthropic-only)',
         'Phase B mixed-provider stack', 'Pure Opus 4.7 (worst case)'],
        [5.50, 4.10, 3.30, 12.00],
        colors=[pdf.slate_500, pdf.teal_400, pdf.teal_500, pdf.red_500],
        unit='$', max_val=14
    )

    pdf.add_section_header('Monthly Platform Fees at Your Volume', level=2)

    pdf.add_table(
        ['Platform', 'Monthly Fee', 'Notes'],
        [
            ['Anthropic Managed Agents', '$0', 'Pay tokens only (today)'],
            ['Claude Agent SDK', '$10-25', 'Hosting (Fly.io / Render) for runner'],
            ['Inngest AgentKit', '$0', 'Free tier (50K executions/mo) covers all runs'],
            ['LangGraph self-hosted', '$10-25', 'Hosting; LangSmith Dev free'],
            ['LangGraph Cloud', '$10-20', 'Per run-minute pricing'],
            ['AWS Bedrock MAC', '$15-50', 'AgentCore Runtime $0.10-0.50/run'],
            ['CF Project Think', '$0', 'Existing $5/mo Workers plan'],
            ['Vertex Agent Engine', '$0-100', 'Free tier covers dev; ~$50-100 prod'],
            ['Temporal Cloud', '$100+', 'Essentials base + per-action'],
        ]
    )

    pdf.add_body_text(
        'Verdict: at your volume, platform fees are <$50/mo for any reasonable choice. '
        'LLM token cost dominates and is roughly equal across platforms. Don\'t pick '
        'on platform fee — pick on capability fit.'
    )

    # ════════════════════════════════════════════════════════════════════════
    # 9. MODEL OPTIMIZATION
    # ════════════════════════════════════════════════════════════════════════

    pdf.add_section_header('9. Model Optimization Per Agent', level=1)

    pdf.add_body_text(
        'This section applies regardless of which orchestration platform you pick. '
        '19 of 20 agents on Sonnet is a missed opportunity. Mixing models per agent '
        'saves ~40% per Pitch Deck and lifts quality on numerical and adversarial '
        'sections.'
    )

    pdf.add_section_header('Why Mix Models?', level=2)
    pdf.add_numbered_item(1,
        'Specialization is real and benchmarked. GPT-5 leads FinanceReasoning at '
        '88.23% (Opus 4.6 at 87.82%). Opus 4.6 leads multi-needle retrieval at 1M '
        'tokens (76% MRCR v2). Gemini 3.1 Pro tops Arena Creative Writing and '
        'abstract reasoning. No model wins everything.'
    )
    pdf.add_numbered_item(2,
        'Cost spread is 50x. Haiku 4.5 input: $1/M tokens. Opus 4.7 output: $25/M. '
        'Using Opus everywhere pays 25x for tasks Haiku does equally well.'
    )
    pdf.add_numbered_item(3,
        'Failure modes differ. GPT-5.4 reportedly refuses to fabricate missing '
        'financial data. Gemini 3.1 Pro is not recommended for incomplete-data '
        'financial tasks. Claude is most transparent about limitations.'
    )

    pdf.add_section_header('Pricing Reference (April 2026)', level=2)
    pdf.add_table(
        ['Model', 'Input ($/M)', 'Output ($/M)', 'Context'],
        [
            ['Claude Opus 4.7', '$5', '$25', '1M'],
            ['Claude Sonnet 4.6', '$3', '$15', '1M'],
            ['Claude Haiku 4.5', '$1', '$5', '200K'],
            ['GPT-5 (standard)', '$1.25', '$10', '400K'],
            ['GPT-5.4 short-ctx', '$2.50', '$15', '—'],
            ['GPT-5.4 long-ctx', '$5.00', '$22.50', '—'],
            ['GPT-5 mini', '$0.25', '$2', '—'],
            ['Gemini 2.5 Pro ≤200K', '$1.25', '$10', '1M'],
            ['Gemini 2.5 Pro >200K', '$2.50', '$15', '—'],
        ]
    )

    pdf.add_section_header('Recommended Per-Agent Assignment', level=2)

    pdf.add_table(
        ['Agent', 'Current', 'Proposed', 'Why', 'Per-Run $'],
        [
            ['coordinator-pitchdeck', 'Sonnet 4.6', 'Haiku 4.5',
             'JSON dispatch + routing, no reasoning', '$0.10'],
            ['annual-reader', 'Sonnet 4.6', 'Gemini 2.5 Pro',
             'MRCR retrieval parity at half price >200K', '$0.45'],
            ['quarterly-reader', 'Sonnet 4.6', 'Gemini 2.5 Pro',
             'Same; 10-Q + transcripts often >200K', '$0.30'],
            ['business-analyst-pd', 'Sonnet 4.6', 'Sonnet 4.6 (keep)',
             'Best balance long-form writing + cost', '$0.20'],
            ['comp-mkt-position', 'Sonnet 4.6', 'GPT-5 (standard)',
             'Numerical comparison; 88% FinanceReasoning', '$0.15'],
            ['comp-moats', 'Sonnet 4.6', 'Sonnet 4.6 (keep)',
             'Web-search workflow; qualitative reasoning', '$0.20'],
            ['financial-analyst-pd', 'Sonnet 4.6', 'GPT-5.4 short',
             'Top FinanceReasoning; won\'t fabricate', '$0.40'],
            ['management-eval-pd', 'Sonnet 4.6', 'GPT-5 (standard)',
             'Mixed numerical (comp tables) + qualitative', '$0.15'],
            ['risk-analyst-pd', 'Sonnet 4.6', 'Opus 4.7',
             'Best Anthropic reasoning + extended thinking', '$0.50'],
            ['valuation-specialist-pd', 'Sonnet 4.6', 'GPT-5.4 short',
             'Highest accuracy on financial math', '$0.40'],
            ['synthesis-writer-pd', 'Sonnet 4.6', 'Opus 4.7',
             'Best long-form coherence with citation fidelity', '$0.45'],
            ['risk-analyst-fs (Bear)', 'Opus 4.6', 'Opus 4.7',
             'Adversarial reasoning + writing', '$0.40'],
            ['synthesis-writer-fs', 'Sonnet 4.6', 'Opus 4.7 (Judge)',
             'Final verdict needs highest reasoning', '$0.50'],
        ]
    )

    pdf.add_body_text(
        'Sonnet-only baseline: ~$5.50 per Pitch Deck. Mixed stack: ~$3.30. '
        'Savings: ~40%, plus measurable quality lift on Valuation, Financial, and Risk.'
    )

    pdf.add_section_header('The Production Parity Problem', level=2)
    pdf.add_body_text(
        'feedback_production_parity says: don\'t make agent changes that won\'t '
        'translate to production Managed Agents. Today, Managed Agents only routes to '
        'Claude. So:'
    )
    pdf.add_bullet(
        'Safe today (Anthropic-only swaps): Coordinator → Haiku 4.5, Risk Analyst PD → '
        'Opus 4.7, Synthesis Writer PD → Opus 4.7. Pure config changes that work in '
        'Managed Agents and any alternative platform.'
    )
    pdf.add_bullet(
        'Cross-provider (Gemini, GPT) swaps: only viable if you switch off Managed '
        'Agents. This is the strongest pragmatic argument for the migration.'
    )

    pdf.add_section_header('Phased Rollout', level=2)
    pdf.add_numbered_item(1,
        'Phase A (no platform migration): Move Coordinator to Haiku 4.5; Risk PD to '
        'Opus 4.7; Synthesis PD to Opus 4.7. Estimated ~25% per-deck savings. 1 day.'
    )
    pdf.add_numbered_item(2,
        'Phase B (after platform migration): Long-context readers → Gemini 2.5 Pro. '
        'Financial Analyst + Valuation Specialist → GPT-5.4. Another ~15% savings. '
        '~1 week of A/B testing across known-verdict tickers.'
    )
    pdf.add_numbered_item(3,
        'Phase C (calibration): Cross-model eval on ~10 known-verdict companies. '
        'Use Observatory wiki to track verdict-accuracy by model assignment.'
    )

    # ════════════════════════════════════════════════════════════════════════
    # 10. PRODUCTION PATTERNS WE ARE MISSING
    # ════════════════════════════════════════════════════════════════════════

    pdf.add_section_header('10. Production Patterns We Are Missing', level=1)

    pdf.add_body_text(
        'Modern multi-agent stacks come with capabilities that Managed Agents either '
        'doesn\'t expose or that you haven\'t wired up yet. Independent of platform '
        'choice. These raise the ceiling on what Thes1s can become.'
    )

    pdf.draw_architecture_diagram(
        'Production Capabilities Stack (top = highest leverage)',
        [
            ('Observability + Replay', 'LangSmith / Langfuse / AgentOps — trace, replay, time travel debug', pdf.teal_500),
            ('Structured Eval Harness', 'LangSmith Datasets / OpenAI Evals / Promptfoo — known verdict pass/fail', pdf.teal_400),
            ('Prompt Versioning', 'PromptHub / PromptLayer — measured impact per prompt change', pdf.teal_300),
            ('Circuit Breakers + Cost Guards', 'Helicone / Portkey / AI Gateway — token & cost caps', pdf.amber_300),
            ('Typed Output Validation', 'Pydantic AI / Zod / OpenAI strict mode — boundary enforcement', pdf.slate_300),
            ('Cross-Run Memory Layer', 'Mem0 / Letta / AgentCore Memory — agent learns across tickers', pdf.slate_200),
            ('A2A Agent Protocol', 'Standardized agent-to-agent for stickeR1 + 3rd party plug-ins', pdf.slate_100),
        ]
    )

    pdf.add_section_header('10.1 Observability with replay', level=2)
    pdf.add_body_text(
        'LangSmith, Langfuse, AgentOps, Pydantic Logfire — all let you trace every LLM '
        'call across a multi-agent run, see token counts and latency per agent, and '
        'replay a failed run from the exact superstep that broke. Time-travel debugging '
        'lets you rewind to any checkpoint, modify state, and re-run downstream nodes. '
        'Single biggest dev-velocity multiplier for multi-agent work. Your Observatory '
        'wiki is a half-step in this direction.'
    )

    pdf.add_section_header('10.2 Structured eval harness', level=2)
    pdf.add_body_text(
        'Your Observatory has known-verdicts.json and verdict-check scripts. Modern '
        'eval harnesses let you define a dataset of known-verdict tickers as a fixture, '
        'run a candidate prompt/model assignment across the dataset in one command, '
        'get pass/fail + per-criterion scoring, and compare two configurations side-by-'
        'side with statistical significance. This is the engine for the RL-style '
        'optimization that the agent optimization phase needs.'
    )

    pdf.add_section_header('10.3 Prompt versioning with measured impact', level=2)
    pdf.add_body_text(
        'Right now your prompts live in git. With versioned prompts + datasets, you '
        'can answer: did my Annual Reader prompt change improve verdict accuracy on '
        '10 calibration tickers? Today you have to manually run pipelines and eyeball '
        'verdict outcomes.'
    )

    pdf.add_section_header('10.4 Circuit breakers and cost guards', level=2)
    pdf.add_body_text(
        'Helicone / Portkey / AI Gateway — sit between your code and LLM APIs and '
        'enforce per-run token budget caps, per-month cost caps, automatic fallback '
        'to cheaper model on rate-limit, request deduplication and caching. For a '
        'hedge-fund-grade production system, these are not optional.'
    )

    pdf.add_section_header('10.5 Typed structured output validation at boundaries', level=2)
    pdf.add_body_text(
        'You already use Zod schemas for sections — that\'s the right pattern. '
        'Production-grade extension: validate at every agent boundary, retry with '
        '"Schema validation failed: <error>" appended to prompt when output is '
        'malformed. Pydantic AI typed agents and OpenAI strict mode make this '
        'enforceable at the API level.'
    )

    pdf.add_section_header('10.6 Memory layer (cross-run learnings)', level=2)
    pdf.add_body_text(
        'Mem0, Letta (formerly MemGPT), and the memory primitives in Claude Agent SDK + '
        'AgentCore Memory let agents accumulate cross-run knowledge. For Thes1s: an '
        'agent that processed AAPL last quarter remembers what surprised it, what it '
        'got wrong on the verdict check, and applies those learnings to MSFT. '
        'Real long-term competitive advantage.'
    )

    pdf.add_section_header('10.7 A2A Agent Protocol', level=2)
    pdf.add_body_text(
        'Google\'s A2A protocol (with broad industry adoption including Anthropic) lets '
        'agents from different vendors talk to each other in a standardized way. '
        'Important when Thes1s plugs into stickeR1\'s portfolio context, an external '
        'risk model, or a third-party valuation engine. Worth designing toward.'
    )

    # ════════════════════════════════════════════════════════════════════════
    # 11. RECOMMENDED PATH FORWARD
    # ════════════════════════════════════════════════════════════════════════

    pdf.add_section_header('11. Recommended Path Forward', level=1)

    pdf.add_section_header('Step 1 — Continue waiting on Anthropic, but set a deadline', level=2)
    pdf.add_body_text(
        'Email Anthropic again this week. Set an internal deadline of April 27. If '
        'callable_agents access hasn\'t landed by then, execute Step 2.'
    )

    pdf.add_section_header('Step 2 — Execute Phase A model optimization NOW', level=2)
    pdf.add_body_text(
        'Pure config change. Works on Managed Agents (One Pager) and any alternative.'
    )
    pdf.add_bullet('coordinator-pitchdeck → Haiku 4.5')
    pdf.add_bullet('coordinator-fullstory → Haiku 4.5')
    pdf.add_bullet('risk-analyst-pitchdeck → Opus 4.7')
    pdf.add_bullet('synthesis-writer-pitchdeck → Opus 4.7 (final synthesis only)')
    pdf.add_body_text(
        'Measure on the One Pager pipeline first. Run on 5 tickers. Compare verdict + '
        'cost vs current Sonnet baseline. Decide.'
    )

    pdf.add_section_header('Step 3 — Migrate to Claude Agent SDK if Anthropic deadline misses', level=2)
    pdf.add_body_text('Allocate 5 days the week of April 28:')
    pdf.add_numbered_item(1, 'Stand up long-running Node service on Fly.io or Render')
    pdf.add_numbered_item(2, 'Move prompts to .claude/agents/ format')
    pdf.add_numbered_item(3, 'Rewrite Pitch Deck coordinator using Task tool dispatch')
    pdf.add_numbered_item(4, 'Wire web_search via Anthropic search API or Tavily')
    pdf.add_numbered_item(5, 'End-to-end test on LULU + 2 calibration tickers')
    pdf.add_numbered_item(6, 'Wrap in Cloudflare Workflow for durable execution')
    pdf.add_body_text(
        'This preserves production parity. When Managed Agents callable_agents opens, '
        'you swap the dispatcher back without touching prompts.'
    )

    pdf.add_section_header('Step 4 — Add observability (week 2)', level=2)
    pdf.add_body_text(
        'Pick one: Langfuse (open source self-host), LangSmith (free tier 5K traces), '
        'or AgentOps. Wire as a passthrough on every LLM call. You will recoup the '
        'setup time on the first stuck pipeline run you can replay.'
    )

    pdf.add_section_header('Step 5 — Run agent optimization sprint (weeks 3-4)', level=2)
    pdf.add_body_text(
        'Now you have a platform that supports cross-provider routing. Execute Phase B: '
        'move readers to Gemini 2.5 Pro, Financial Analyst + Valuation Specialist to '
        'GPT-5.4. Run on all 10 known-verdict tickers. Use Observatory + tracing to '
        'track verdict accuracy per model assignment.'
    )

    pdf.add_section_header('Step 6 — Long-term: Cloudflare Project Think (H2 2026)', level=2)
    pdf.add_body_text(
        'Once Project Think exits preview, revisit. Your stack already lives on '
        'Cloudflare. This is the eventual home — single vendor, Durable Objects for '
        'state, AI Gateway for multi-LLM, all on infrastructure you understand.'
    )

    pdf.add_section_header('Decision Tree', level=2)
    pdf.draw_decision_tree(
        'Decision Tree',
        'Is Managed Agents callable_agents access live by Apr 27?',
        [
            '├── YES → stay on Managed Agents.',
            '│         Execute Phase A (Anthropic-only model swaps).',
            '│         Production parity preserved.',
            '│',
            '└── NO  → migrate.',
            '    │',
            '    Add a 5-day engineering project this sprint?',
            '    ├── YES → Claude Agent SDK [TOP PICK]',
            '    │           closest to current architecture',
            '    │',
            '    └── NO  → wait. Cost = One Pager-only revenue gap.',
            '        │',
            '        Once migrated, want cross-provider model mixing?',
            '        ├── YES → execute Phase B',
            '        │           (Gemini for readers, GPT-5.4 for valuation)',
            '        │',
            '        └── NO  → keep all-Anthropic, only Phase A',
            '            │',
            '            Long-term Cloudflare-native rebuild?',
            '            ├── YES → CF Project Think when sub-agents GA (H2 2026)',
            '            └── NO  → stay on Claude Agent SDK indefinitely',
        ]
    )

    # ════════════════════════════════════════════════════════════════════════
    # 12. APPENDIX
    # ════════════════════════════════════════════════════════════════════════

    pdf.add_section_header('12. Appendix — Agent Inventory', level=1)

    pdf.add_section_header('Pitch Deck Agents (10 specialists + coordinator)', level=2)
    pdf.add_table(
        ['Agent', 'Wave', 'Tools'],
        [
            ['coordinator-pitchdeck', 'dispatcher', 'callable_agents, agent_toolset'],
            ['annual-reader', 'Wave 0 (PSR)', 'filesystem'],
            ['quarterly-reader', 'Wave 0 (PSR)', 'filesystem'],
            ['business-analyst-pitchdeck', 'Wave 1', 'web_search'],
            ['comp-eval-mkt-position-pitchdeck', 'Wave 1', 'web_search'],
            ['comp-eval-moats-pitchdeck', 'Wave 2', 'web_search'],
            ['financial-analyst-pitchdeck', 'Wave 2', 'web_search'],
            ['management-evaluator-pitchdeck', 'Wave 2', 'web_search'],
            ['risk-analyst-pitchdeck', 'Wave 3', 'web_search'],
            ['valuation-specialist-pitchdeck', 'Wave 3', 'web_search'],
            ['synthesis-writer-pitchdeck', 'Wave 4', 'synthesis only'],
        ]
    )

    pdf.add_section_header('Full Story Agents (7 specialists + coordinator)', level=2)
    pdf.add_table(
        ['Agent', 'Phase', 'Tools'],
        [
            ['coordinator-fullstory', 'dispatcher', 'callable_agents, agent_toolset'],
            ['annual-reader', 'shared PSR', 'filesystem'],
            ['quarterly-reader', 'shared PSR', 'filesystem'],
            ['risk-analyst-fullstory', 'Phase 1 + Bear', 'web_search'],
            ['business-analyst-fullstory', 'Phase 1', 'web_search'],
            ['competitor-evaluator-fullstory', 'Phase 1', 'web_search'],
            ['management-evaluator-fullstory', 'Phase 1', 'web_search'],
            ['valuation-specialist-fullstory', 'Phase 1', 'web_search'],
            ['financial-analyst-fullstory', 'Phase 2 (Judge)', 'synthesis only'],
            ['synthesis-writer-fullstory', 'Phase 2 (Bull/Reb)', 'synthesis only'],
        ]
    )

    pdf.add_section_header('Source References', level=2)
    pdf.add_bullet('Multi-agent: LangGraph docs, Inngest AgentKit, Claude Agent SDK Subagents, OpenAI Agents SDK')
    pdf.add_bullet('Cloud platforms: AWS Bedrock MAC GA, CF Project Think, Vertex Agent Engine, MS Foundry Agent Service')
    pdf.add_bullet('Durable execution: Temporal AI workflows, CF Workflows GA, Diagrid checkpoints critique')
    pdf.add_bullet('Pricing: LangSmith, Inngest, Bedrock AgentCore, Anthropic, OpenAI, Vertex AI')
    pdf.add_bullet('Model benchmarks: LM Council Apr 2026, Patronus FinanceBench, EQ-Bench Longform, Vellum Leaderboard, Chroma Context Rot')

    # ── Output ──────────────────────────────────────────────────────────────
    out_path = os.path.join(_HERE, 'multi-agent-orchestration-research.pdf')
    pdf.output(out_path)
    print(f'PDF generated: {out_path}')
    return out_path


if __name__ == '__main__':
    build_pdf()
