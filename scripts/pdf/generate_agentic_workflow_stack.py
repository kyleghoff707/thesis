#!/usr/bin/env python3
"""
Agentic Workflow Stack — Thes1s Branded PDF
Generates a publication-ready document explaining the Claude Code extension system.
Uses pdf_template_toolkit.py with Thes1s color palette and branding.
"""

import os
import sys

# Add scripts/pdf to path for toolkit import
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pdf_template_toolkit import ReportPDF

from datetime import date


class Thes1sPDF(ReportPDF):
    """Thes1s-branded PDF with teal/slate palette and logo."""

    def __init__(self, title='Report', subtitle=''):
        super().__init__(title, subtitle)

        # ── Thes1s Color Palette ──
        self.color_primary = (15, 118, 110)        # teal-500 (#0f766e)
        self.color_secondary = (30, 41, 59)         # slate-800 (#1e293b)
        self.color_text = (30, 41, 59)              # slate-800
        self.color_muted = (100, 116, 139)          # slate-500 (#64748b)
        self.color_light_muted = (148, 163, 184)    # slate-400 (#94a3b8)
        self.color_accent = (15, 118, 110)          # teal-500 (not red)
        self.color_table_header = (15, 118, 110)    # teal-500
        self.color_table_alt_row = (240, 253, 250)  # teal-50 (#f0fdfa)

        # Teal variants for diagrams
        self.teal_500 = (15, 118, 110)
        self.teal_400 = (45, 212, 191)
        self.teal_100 = (204, 251, 241)
        self.teal_50 = (240, 253, 250)
        self.slate_800 = (30, 41, 59)
        self.slate_700 = (51, 65, 85)
        self.slate_600 = (71, 85, 105)
        self.slate_500 = (100, 116, 139)
        self.slate_200 = (226, 232, 240)
        self.slate_100 = (241, 245, 249)
        self.slate_50 = (248, 250, 251)

    def draw_logo(self, x, y, size=22):
        """Draw the Thes1s T1 logo mark programmatically."""
        s = size / 32  # scale factor from 32x32 viewBox

        # Background rounded rect
        self.set_fill_color(*self.slate_800)
        self.set_draw_color(*self.slate_800)
        rx = 7 * s
        self.rect(x, y, 32 * s, 32 * s, 'DF')

        # Teal circle (dot)
        self.set_fill_color(20, 184, 166)  # teal-400 (#14b8a6)
        cx, cy = x + 16 * s, y + 5 * s
        r = 2.5 * s
        self.ellipse(cx - r, cy - r, r * 2, r * 2, 'F')

        # Horizontal bar (slate-300)
        self.set_fill_color(203, 213, 225)  # #cbd5e1
        self.rect(x + 4.5 * s, y + 10 * s, 23 * s, 2.8 * s, 'F')

        # Vertical teal bar
        self.set_fill_color(20, 184, 166)
        self.rect(x + 14 * s, y + 10 * s, 4 * s, 17 * s, 'F')

    def add_title_page(self, info_lines=None, disclaimer=None):
        """Thes1s-branded title page with logo."""
        self.add_page()
        self.ln(20)

        # Logo centered
        logo_size = 28
        logo_x = (self.w - logo_size) / 2
        self.draw_logo(logo_x, self.get_y(), logo_size)
        self.ln(logo_size + 8)

        # Brand name: "Thes1s" styled
        self.set_font('ArialUni', 'B', 12)
        self.set_text_color(*self.teal_500)
        self.cell(0, 6, 'Thes1s', align='C', new_x="LMARGIN", new_y="NEXT")
        self.ln(12)

        # Main title
        self.set_font('ArialUni', 'B', 24)
        self.set_text_color(*self.slate_800)
        self.multi_cell(0, 10, self.report_title, align='C')
        self.ln(4)

        # Subtitle
        if self.report_subtitle:
            self.set_font('ArialUni', '', 14)
            self.set_text_color(*self.slate_600)
            self.multi_cell(0, 8, self.report_subtitle, align='C')
            self.ln(10)

        # Decorative teal line
        self.set_draw_color(*self.teal_500)
        self.set_line_width(0.8)
        x_center = self.w / 2
        self.line(x_center - 40, self.get_y(), x_center + 40, self.get_y())
        self.ln(12)

        # Info lines
        self.set_font('ArialUni', '', 11)
        self.set_text_color(*self.slate_500)
        if info_lines is None:
            info_lines = [f'Date: {date.today().strftime("%B %d, %Y")}']
        for line in info_lines:
            self.cell(0, 7, line, align='C', new_x="LMARGIN", new_y="NEXT")

    def header(self):
        """Thes1s-branded page header with logo mark."""
        if self.page_no() > 1:
            # Small logo mark
            self.draw_logo(self.l_margin, 5, 8)
            # Title text
            self.set_font('ArialUni', '', 8)
            self.set_text_color(*self.slate_500)
            self.set_xy(self.l_margin + 11, 5)
            self.cell(0, 8, self.report_title)
            # Teal underline
            self.set_draw_color(*self.teal_100)
            self.set_line_width(0.3)
            self.line(self.l_margin, 14, self.w - self.r_margin, 14)
            self.set_y(18)

    def footer(self):
        """Thes1s-branded footer."""
        self.set_y(-12)
        self.set_font('ArialUni', '', 7.5)
        self.set_text_color(*self.slate_500)
        if self.page_no() > 1:
            self.cell(0, 10, f'Thes1s  |  Agentic Workflow Stack  |  Page {self.page_no() - 1}', align='C')

    def draw_labeled_flow_chart(self, title, steps, labels=None):
        """
        Draw a vertical flow chart with labeled steps.
        Each step can have a label (left side) and description (in box).
        """
        box_w = 130
        box_h = 16
        arrow_len = 10
        label_w = 30
        total_height = len(steps) * (box_h + arrow_len) + 30

        if self.get_y() + min(total_height, 120) > self.h - 30:
            self.add_page()
        self.ln(3)

        self.set_font('ArialUni', 'B', 10)
        self.set_text_color(*self.teal_500)
        self.cell(0, 7, title, new_x="LMARGIN", new_y="NEXT")
        self.ln(4)

        x_center = self.w / 2 + 10
        x_box = x_center - box_w / 2

        for i, step in enumerate(steps):
            y = self.get_y()
            if y + box_h + arrow_len + 5 > self.h - 25:
                self.add_page()
                y = self.get_y()

            # Left label
            if labels and i < len(labels) and labels[i]:
                self.set_font('ArialUni', 'B', 7.5)
                self.set_text_color(*self.teal_500)
                self.set_xy(self.l_margin, y + 3)
                self.cell(label_w, 5, labels[i], align='R')

            # Box with rounded appearance
            self.set_fill_color(*self.teal_50)
            self.set_draw_color(*self.teal_500)
            self.set_line_width(0.5)
            self.rect(x_box, y, box_w, box_h, 'DF')

            # Text
            self.set_font('ArialUni', '', 8.5)
            self.set_text_color(*self.slate_800)
            self.set_xy(x_box + 4, y + 2)
            self.multi_cell(box_w - 8, 5, step, align='C')
            y_bottom = y + box_h

            # Arrow
            if i < len(steps) - 1:
                self.set_draw_color(*self.teal_500)
                self.set_line_width(0.6)
                mid_x = x_center
                self.line(mid_x, y_bottom, mid_x, y_bottom + arrow_len)
                self.line(mid_x - 2.5, y_bottom + arrow_len - 3, mid_x, y_bottom + arrow_len)
                self.line(mid_x + 2.5, y_bottom + arrow_len - 3, mid_x, y_bottom + arrow_len)

            self.set_y(y_bottom + arrow_len + 1)
        self.ln(5)

    def draw_parallel_flow(self, title, wave_label, boxes, wave_color=None):
        """
        Draw parallel boxes side by side to represent wave execution.
        boxes: list of (label, description) tuples
        """
        if wave_color is None:
            wave_color = self.teal_500

        n = len(boxes)
        available_w = self.w - self.l_margin - self.r_margin
        box_w = min(55, (available_w - (n - 1) * 5) / n)
        box_h = 30
        total_w = n * box_w + (n - 1) * 5

        if self.get_y() + box_h + 30 > self.h - 30:
            self.add_page()

        self.ln(3)
        self.set_font('ArialUni', 'B', 10)
        self.set_text_color(*wave_color)
        self.cell(0, 7, title, new_x="LMARGIN", new_y="NEXT")
        self.ln(2)

        # Wave label
        self.set_font('ArialUni', 'I', 8)
        self.set_text_color(*self.slate_500)
        self.cell(0, 5, wave_label, new_x="LMARGIN", new_y="NEXT")
        self.ln(3)

        y = self.get_y()
        x_start = self.l_margin + (available_w - total_w) / 2

        for i, (label, desc) in enumerate(boxes):
            x = x_start + i * (box_w + 5)

            # Box
            self.set_fill_color(*self.teal_50)
            self.set_draw_color(*wave_color)
            self.set_line_width(0.5)
            self.rect(x, y, box_w, box_h, 'DF')

            # Label (bold)
            self.set_font('ArialUni', 'B', 7.5)
            self.set_text_color(*self.slate_800)
            self.set_xy(x + 2, y + 2)
            self.cell(box_w - 4, 5, label, align='C')

            # Description
            self.set_font('ArialUni', '', 7)
            self.set_text_color(*self.slate_600)
            self.set_xy(x + 2, y + 8)
            self.multi_cell(box_w - 4, 4, desc, align='C')

        self.set_y(y + box_h + 5)

    def draw_architecture_diagram(self, title, layers):
        """
        Draw a layered architecture diagram.
        layers: list of (label, description, color_tuple) from top to bottom
        """
        box_w = 150
        box_h = 18
        gap = 3
        total_h = len(layers) * (box_h + gap) + 30

        if self.get_y() + min(total_h, 100) > self.h - 30:
            self.add_page()
        self.ln(3)

        self.set_font('ArialUni', 'B', 10)
        self.set_text_color(*self.teal_500)
        self.cell(0, 7, title, new_x="LMARGIN", new_y="NEXT")
        self.ln(4)

        x_center = self.w / 2
        x_box = x_center - box_w / 2

        for i, (label, desc, fill_color) in enumerate(layers):
            y = self.get_y()
            if y + box_h + gap > self.h - 25:
                self.add_page()
                y = self.get_y()

            self.set_fill_color(*fill_color)
            self.set_draw_color(*self.slate_200)
            self.set_line_width(0.4)
            self.rect(x_box, y, box_w, box_h, 'DF')

            # Label
            self.set_font('ArialUni', 'B', 9)
            self.set_text_color(255, 255, 255) if sum(fill_color) < 400 else self.set_text_color(*self.slate_800)
            self.set_xy(x_box + 4, y + 2)
            self.cell(box_w / 3, 5, label)

            # Description
            self.set_font('ArialUni', '', 8)
            self.set_xy(x_box + 4, y + 8)
            self.cell(box_w - 8, 5, desc)

            # Connector arrow (except last)
            if i < len(layers) - 1:
                mid_x = x_center
                y_bottom = y + box_h
                self.set_draw_color(*self.slate_500)
                self.set_line_width(0.4)
                self.line(mid_x, y_bottom, mid_x, y_bottom + gap)

            self.set_y(y + box_h + gap)
        self.ln(5)


def build_pdf():
    pdf = Thes1sPDF(
        title='Agentic Workflow Stack',
        subtitle='A Plain-English Guide to Claude Code\'s Extension System'
    )

    # ── Title Page ──
    pdf.add_title_page(
        info_lines=[
            date.today().strftime('%B %d, %Y'),
            'Kyle Hoff',
            'Thes1s Project — Internal Reference',
        ]
    )

    # ── Table of Contents ──
    pdf.add_toc([
        'The Big Picture',
        'The Seven Building Blocks',
        'How They All Interact',
        'The Installed Stack: gstack + GSD',
        'GSD Deep Dive',
        'Current Setup Inventory',
        'Applied to Thes1s: Phase 5 Example',
        'Workflow Router — Validated Test Results',
    ])

    # ══════════════════════════════════════════════════════════════════════
    # SECTION 1: THE BIG PICTURE
    # ══════════════════════════════════════════════════════════════════════

    pdf.add_section_header('The Big Picture', level=1)

    pdf.add_body_text(
        'Claude Code out of the box is a very capable but generic employee — smart, '
        'but doesn\'t know your preferences, your workflows, or your SOPs. Seven '
        'extension mechanisms turn that generic employee into your employee.'
    )

    pdf.draw_architecture_diagram(
        'Claude Code Extension System',
        [
            ('RULES', 'Lab safety policies — always loaded, always followed', pdf.slate_800),
            ('MEMORY', 'Personal notebook — persists across conversations', pdf.slate_700),
            ('SKILLS', 'Detailed SOPs on a shelf — loaded only when relevant', pdf.teal_500),
            ('COMMANDS', 'Speed-dial buttons — you press, action happens', (13, 148, 136)),
            ('HOOKS', 'Automatic sensors — fire without anyone asking', pdf.slate_600),
            ('AGENTS', 'Your team — delegation to specialized workers', (45, 212, 191)),
            ('PLUGINS', 'Pre-packaged kits of all the above (gstack, GSD)', pdf.slate_200),
        ]
    )

    # ══════════════════════════════════════════════════════════════════════
    # SECTION 2: THE SEVEN BUILDING BLOCKS
    # ══════════════════════════════════════════════════════════════════════

    pdf.add_section_header('The Seven Building Blocks', level=1)

    # ── 1. Rules ──
    pdf.add_section_header('1. Rules — "Lab Safety Policies on the Wall"', level=2)
    pdf.add_body_text(
        'Instructions Claude reads at the start of every single conversation, no exceptions. '
        'Always loaded, always followed.'
    )
    pdf.add_body_text(
        'Where they live: CLAUDE.md in your project root (project-specific) or '
        '~/.claude/rules/*.md (global for all projects).'
    )
    pdf.add_body_text(
        'Metaphor: The safety poster on the lab wall. Doesn\'t matter what experiment you\'re '
        'running — "always wear safety glasses" applies every time.'
    )
    pdf.add_body_text(
        'Thes1s example: CLAUDE.md has 500+ lines — XBRL engine architecture, coding conventions, '
        'bug-fixing strategy, gstack output overrides. All read before every conversation.'
    )
    pdf.add_body_text(
        'Trade-off: Every rule eats context window tokens. 500 lines of rules = 500 lines less '
        'room for actual work. Keep rules short and high-level; move detailed docs to separate files.'
    )

    pdf.add_table(
        ['Rules', 'Skills'],
        [
            ['Always loaded', 'Loaded only when relevant'],
            ['Short, high-level policies', 'Long, detailed procedures'],
            ['Can\'t be invoked — just are', 'Invoked by name when needed'],
            ['Cost: always uses tokens', 'Cost: only uses tokens when active'],
        ]
    )

    # ── 2. Memory ──
    pdf.add_section_header('2. Memory — "Your Employee\'s Personal Notebook"', level=2)
    pdf.add_body_text(
        'Persistent notes Claude saves across conversations. Next time you start a fresh session, '
        'Claude reads these to remember who you are and what happened before.'
    )
    pdf.add_body_text(
        'Where it lives: ~/.claude/projects/{project-hash}/memory/'
    )
    pdf.add_body_text(
        'Metaphor: Your lab assistant keeps a personal notebook. "Kyle is a materials engineer. '
        'He prefers plain English. Last time, he told me not to mock databases in tests."'
    )

    pdf.add_table(
        ['Type', 'What It Stores', 'Example'],
        [
            ['User', 'Who you are, preferences, expertise', '"Materials engineer, not a programmer"'],
            ['Feedback', 'Corrections and confirmed approaches', '"Don\'t mock DBs in tests"'],
            ['Project', 'Ongoing work, goals, decisions', '"Merge freeze begins March 5"'],
            ['Reference', 'Pointers to external systems', '"Bugs tracked in Linear project INGEST"'],
        ]
    )

    # ── 3. Skills ──
    pdf.add_section_header('3. Skills — "Detailed SOPs on a Shelf"', level=2)
    pdf.add_body_text(
        'Markdown files containing detailed instructions for a specific type of work. Claude reads '
        'the title and description of every skill to decide which are relevant, then loads the full '
        'content only when needed.'
    )
    pdf.add_body_text(
        'Where they live: ~/.claude/skills/ (global) or .claude/skills/ (project-level).'
    )
    pdf.add_body_text(
        'Metaphor: A shelf of Standard Operating Procedures in your lab. Binders for "Running '
        'Tensile Tests," "Calibrating the SEM," "Sample Preparation for XRD." They sit on the '
        'shelf most of the time — pulled down only when needed.'
    )

    pdf.add_section_header('Skill Structure (Three Tiers)', level=3)
    pdf.add_table(
        ['Tier', 'Structure', 'When to Use'],
        [
            ['Self-contained', 'Just SKILL.md', 'Procedure fits in one file'],
            ['With reference', 'SKILL.md + docs', 'Heavy reference would bloat the main file'],
            ['With tools', 'SKILL.md + scripts', 'Includes executable helpers'],
        ]
    )

    pdf.add_section_header('Critical Insight: CSO (Claude Search Optimization)', level=3)
    pdf.add_body_text(
        'The SKILL.md description field should say WHEN to use the skill (triggering conditions), '
        'never WHAT it does (workflow summary). If the description summarizes the workflow, Claude '
        'takes a shortcut and follows the description instead of reading the full procedure.'
    )
    pdf.add_table(
        ['Quality', 'Description Example'],
        [
            ['BAD', 'Dispatches subagent per task with code review between tasks'],
            ['GOOD', 'Use when executing implementation plans with independent tasks'],
        ]
    )

    # ── 4. Commands ──
    pdf.add_section_header('4. Commands — "Speed-Dial Buttons on Your Desk"', level=2)
    pdf.add_body_text(
        'Slash commands you type to trigger an action. Usually a thin wrapper that loads '
        'a skill or runs a custom prompt. Where they live: ~/.claude/commands/ (global) '
        'or .claude/commands/ (project-level).'
    )

    pdf.add_table(
        ['Commands', 'Skills'],
        [
            ['User-triggered (you type /qa)', 'Can be auto-triggered by Claude'],
            ['Usually short — just a prompt', 'Can be long detailed procedures'],
            ['Always a slash command', 'May or may not have a slash command'],
            ['Think: "menu item"', 'Think: "recipe behind the menu item"'],
        ]
    )

    pdf.add_body_text(
        'Note: gstack blurs this line — its skills ARE the commands. GSD keeps them separate: '
        'commands in ~/.claude/commands/gsd/, workflows in ~/.claude/get-shit-done/workflows/.'
    )

    # ── 5. Hooks ──
    pdf.add_section_header('5. Hooks — "Automatic Sensors and Alarms"', level=2)
    pdf.add_body_text(
        'Scripts that run automatically when specific events happen. Nobody invokes them — '
        'they fire on their own. Where they live: ~/.claude/hooks/ (scripts), '
        'wired up in ~/.claude/settings.json.'
    )
    pdf.add_body_text(
        'Metaphor: The automatic systems in a lab. The fume hood interlock that won\'t let you '
        'run reactions unless the hood is on. The temperature alarm. The auto door lock at 6pm.'
    )

    pdf.draw_labeled_flow_chart(
        'Hook Trigger Points',
        [
            'SessionStart — when a session begins\n"Check for GSD updates"',
            'PreToolUse — BEFORE Claude uses a tool\n"Check for prompt injection before writing any file"',
            'Claude does the work (edits file, runs command, etc.)',
            'PostToolUse — AFTER Claude uses a tool\n"Check context window usage after every edit/write"',
        ],
        labels=['START', 'BEFORE', 'WORK', 'AFTER']
    )

    pdf.add_section_header('Currently Installed Hooks (from GSD)', level=3)
    pdf.add_table(
        ['Hook', 'Trigger', 'What It Does'],
        [
            ['gsd-check-update.js', 'SessionStart', 'Checks for new GSD versions'],
            ['gsd-context-monitor.js', 'PostToolUse', 'Warns before context window degrades'],
            ['gsd-prompt-guard.js', 'PreToolUse (Write/Edit)', 'Checks file writes for prompt injection'],
        ]
    )
    pdf.add_body_text('gstack uses zero hooks — it operates purely through skills/commands.')

    # ── 6. Agents ──
    pdf.add_section_header('6. Agents, Subagents, and Orchestrators — "Your Team"', level=2)
    pdf.add_body_text(
        'Three levels of delegation:'
    )
    pdf.add_bullet('Agent — Claude itself. The main employee. One conversation, one context window.')
    pdf.add_bullet(
        'Subagent — A separate Claude instance spawned to handle a specific task. '
        'Fresh context, works independently, reports back.'
    )
    pdf.add_bullet(
        'Orchestrator — A system that coordinates many subagents working in parallel '
        'on a larger plan. GSD\'s "wave execution" is an orchestrator.'
    )

    pdf.add_body_text(
        'Metaphor: You\'re working with your lab assistant (Claude). They say "I need to look up '
        'thermal conductivity data for 4 materials. Let me send 4 interns to the library simultaneously '
        'while I keep working with you." Each intern (subagent) works independently. The project manager '
        '(orchestrator) decides who can work in parallel and who needs to wait.'
    )

    pdf.draw_parallel_flow(
        'Wave-Based Parallel Execution',
        'Wave 1 — independent tasks run simultaneously, each with a fresh 200k context',
        [
            ('Agent 1', 'Task A\n(API engine)\n200k fresh context'),
            ('Agent 2', 'Task B\n(StatusBadge)\n200k fresh context'),
            ('Agent 3', 'Task C\n(Validation)\n200k fresh context'),
        ]
    )

    pdf.add_body_text(
        'Why fresh contexts matter: Claude\'s quality degrades as its context window fills up. '
        'After 30+ minutes of complex work, responses get sloppier. Subagents solve this — each '
        'one starts fresh with a full 200k-token context, focused on just one task.'
    )

    # ── 7. Plugins ──
    pdf.add_section_header('7. Plugins — "Pre-Packaged Kits"', level=2)
    pdf.add_body_text(
        'A bundle of skills + commands + rules + agents packaged together for one-click install. '
        'Like buying a complete lab kit instead of sourcing every reagent and tool individually.'
    )
    pdf.add_table(
        ['Plugin', 'What It Provides', 'Install Method'],
        [
            ['gstack', '25+ skills and commands (virtual team)', 'git clone'],
            ['GSD', 'Agents, commands, hooks, workflows', 'npx get-shit-done-cc'],
            ['Superpowers', 'TDD + process discipline skills', 'Plugin marketplace'],
        ]
    )

    # ══════════════════════════════════════════════════════════════════════
    # SECTION 3: HOW THEY ALL INTERACT
    # ══════════════════════════════════════════════════════════════════════

    pdf.add_section_header('How They All Interact', level=1)

    pdf.add_body_text(
        'A complete interaction flow when you type /qa — all seven mechanisms participate:'
    )

    pdf.draw_labeled_flow_chart(
        'Complete Interaction Flow: /qa',
        [
            'You type "/qa" (COMMAND triggers the skill)',
            'Claude checks RULES (CLAUDE.md)\n"Use /browse for all web browsing" "Follow bug-fixing strategy"',
            'Claude checks MEMORY\n"Kyle prefers plain English" "Project is at Phase 4"',
            'Claude loads the QA SKILL (gstack\'s /qa SKILL.md)\nFull procedure: open browser, test flows, find bugs',
            'Claude spawns SUBAGENTS to test different flows\nSubagent 1: Overview | Subagent 2: Financials | Subagent 3: Valuation',
            'HOOKS fire automatically during work\nContext monitor: "45% used" | Prompt guard: checks writes',
            'Results come back, Claude fixes bugs, commits',
            'Claude saves notable findings to MEMORY',
        ],
        labels=['INVOKE', 'RULES', 'MEMORY', 'SKILL', 'AGENTS', 'HOOKS', 'EXECUTE', 'PERSIST']
    )

    # ══════════════════════════════════════════════════════════════════════
    # SECTION 4: THE INSTALLED STACK
    # ══════════════════════════════════════════════════════════════════════

    pdf.add_section_header('The Installed Stack: gstack + GSD', level=1)

    pdf.add_section_header('gstack: The Virtual Team', level=2)
    pdf.add_body_text(
        'gstack transforms Claude into a virtual engineering team. Each skill is a persona — a '
        'specialist who makes judgment calls from their domain expertise.'
    )
    pdf.add_body_text('Philosophy: "Who should review this?"')
    pdf.add_body_text('Architecture: Skills-based. Each slash command loads a persona with deep domain knowledge.')

    pdf.add_table(
        ['Persona', 'Skill', 'What They Judge'],
        [
            ['CEO/Founder', '/plan-ceo-review', 'Is this ambitious enough? Right scope?'],
            ['Eng Manager', '/plan-eng-review', 'Is the architecture sound? Edge cases?'],
            ['Designer', '/plan-design-review', 'Is the UX right? Visual hierarchy?'],
            ['QA Lead', '/qa', 'Does it work? Browser testing + bug fixing'],
            ['Staff Engineer', '/review', 'Is the code safe? SQL injection? Side effects?'],
            ['DevOps', '/ship', 'Tests pass? Changelog updated? PR ready?'],
            ['Ops', '/land-and-deploy', 'Deploy healthy? Canary checks pass?'],
        ]
    )

    pdf.add_section_header('GSD: The Assembly Line', level=2)
    pdf.add_body_text(
        'GSD is a manufacturing system for code. It doesn\'t make judgment calls — it breaks '
        'work into tasks, executes them efficiently with fresh contexts, and verifies completion.'
    )
    pdf.add_body_text('Philosophy: "How do we build this without Claude getting confused halfway through?"')

    pdf.draw_architecture_diagram(
        'GSD Three-Layer Architecture',
        [
            ('COMMANDS', '/gsd:plan-phase, /gsd:execute-phase — what you invoke', pdf.teal_500),
            ('WORKFLOWS', 'Step-by-step procedures — the detailed how', pdf.slate_700),
            ('AGENTS', 'Specialized workers with fresh contexts — who does it', (45, 212, 191)),
            ('SUPPORTING', 'references/ + templates/ + bin/ — configuration and forms', pdf.slate_200),
        ]
    )

    pdf.add_section_header('Why They Complement Each Other', level=2)
    pdf.add_body_text(
        'gstack answers: "Is this the RIGHT thing to build?" and "Did we build it WELL?"'
    )
    pdf.add_body_text(
        'GSD answers: "How do we build it EFFICIENTLY?" and "How do we prevent quality rot?"'
    )

    pdf.add_table(
        ['Concern', 'gstack', 'GSD'],
        [
            ['Strategic planning', 'CEO/eng/design review personas', '—'],
            ['Task breakdown', '—', 'Wave-based parallel planning'],
            ['Execution', '—', 'Fresh-context subagents, atomic commits'],
            ['Context management', '—', 'Context monitor hook, fresh contexts'],
            ['QA testing', 'Real browser, screenshot verification', 'Verification agents'],
            ['Code review', 'Staff engineer persona', '—'],
            ['Visual design', 'Design review + consultation', '—'],
            ['Shipping', 'PR + deploy + canary pipeline', 'Basic PR creation'],
        ]
    )

    # ══════════════════════════════════════════════════════════════════════
    # SECTION 5: GSD DEEP DIVE
    # ══════════════════════════════════════════════════════════════════════

    pdf.add_section_header('GSD Deep Dive', level=1)

    pdf.add_section_header('Key GSD Commands', level=2)
    pdf.add_table(
        ['Command', 'Purpose'],
        [
            ['/gsd:new-project', 'Initialize a new project with research'],
            ['/gsd:map-codebase', 'Analyze existing codebase'],
            ['/gsd:discuss-phase', 'Capture preferences before planning'],
            ['/gsd:plan-phase', 'Create task plans for a phase'],
            ['/gsd:execute-phase', 'Build with parallel wave execution'],
            ['/gsd:verify-work', 'User acceptance testing'],
            ['/gsd:ship', 'Create pull requests'],
            ['/gsd:fast', 'Inline trivial tasks, skip planning'],
            ['/gsd:quick', 'Fast-track ad-hoc tasks'],
            ['/gsd:next', 'Auto-detect and run next step'],
            ['/gsd:debug', 'Diagnose and fix issues'],
            ['/gsd:progress', 'Show current status'],
        ]
    )

    pdf.add_section_header('The 18 GSD Agents', level=2)

    pdf.add_section_header('Project Initialization', level=3)
    pdf.add_table(
        ['Agent', 'Job', 'Spawned By'],
        [
            ['gsd-project-researcher', 'Investigate stack, features, architecture, pitfalls', '/gsd:new-project'],
            ['gsd-research-synthesizer', 'Combine 4 research streams into one summary', '/gsd:new-project'],
            ['gsd-roadmapper', 'Create phased roadmap from requirements', '/gsd:new-project'],
            ['gsd-user-profiler', 'Build profile of your preferences/experience', '/gsd:profile-user'],
            ['gsd-codebase-mapper', 'Map existing codebase structure', '/gsd:map-codebase'],
        ]
    )

    pdf.add_section_header('Planning', level=3)
    pdf.add_table(
        ['Agent', 'Job', 'Spawned By'],
        [
            ['gsd-phase-researcher', 'Research technical approach for one phase', '/gsd:plan-phase'],
            ['gsd-planner', 'Create PLAN.md files with task breakdowns', '/gsd:plan-phase'],
            ['gsd-plan-checker', 'Review plan quality, send back for revision', '/gsd:plan-phase'],
            ['gsd-assumptions-analyzer', 'Identify risky assumptions in plans', '/gsd:discuss-phase'],
            ['gsd-advisor-researcher', 'Research best practices for discussion topics', '/gsd:discuss-phase'],
        ]
    )

    pdf.add_section_header('Execution', level=3)
    pdf.add_table(
        ['Agent', 'Job', 'Spawned By'],
        [
            ['gsd-executor', 'Execute a single plan, commit each task', '/gsd:execute-phase'],
            ['gsd-verifier', 'Verify phase completion, check quality gates', '/gsd:verify-work'],
            ['gsd-debugger', 'Diagnose and fix issues', '/gsd:debug'],
            ['gsd-integration-checker', 'Check cross-phase integration', '/gsd:execute-phase'],
            ['gsd-nyquist-auditor', 'Validate test/verification coverage', '/gsd:plan-phase'],
        ]
    )

    pdf.add_section_header('UI-Specific', level=3)
    pdf.add_table(
        ['Agent', 'Job', 'Spawned By'],
        [
            ['gsd-ui-researcher', 'Research UI/UX approaches', '/gsd:ui-phase'],
            ['gsd-ui-checker', 'Review UI implementation quality', '/gsd:ui-review'],
            ['gsd-ui-auditor', 'Audit UI against design requirements', '/gsd:audit-uat'],
        ]
    )

    pdf.add_section_header('Supporting Files', level=2)

    pdf.add_section_header('References (get-shit-done/references/)', level=3)
    pdf.add_table(
        ['File', 'Purpose'],
        [
            ['planning-config.md', '.planning/ directory behavior, git branching'],
            ['git-integration.md', 'Commit conventions, branching rules'],
            ['tdd.md', 'Test-driven development rules for executors'],
            ['verification-patterns.md', 'How to verify work is complete'],
            ['model-profiles.md', 'Which Claude model for which agent (cost optimization)'],
            ['checkpoints.md', 'Human checkpoint protocols'],
        ]
    )

    pdf.add_section_header('Templates (get-shit-done/templates/)', level=3)
    pdf.add_table(
        ['Template', 'Becomes'],
        [
            ['project.md', 'PROJECT.md (vision doc)'],
            ['roadmap.md', 'ROADMAP.md (phased plan)'],
            ['state.md', 'STATE.md (decisions, blockers, memory)'],
            ['requirements.md', 'REQUIREMENTS.md (scoped requirements)'],
            ['phase-prompt.md', 'PLAN-xx.md (individual task plans)'],
            ['summary.md', 'SUMMARY.md (what was done per phase)'],
        ]
    )

    pdf.add_section_header('The .planning/ Directory', level=2)
    pdf.add_body_text(
        'When GSD is used on a project, it creates a .planning/ directory — '
        'this is GSD\'s "context engineering" in action. Instead of cramming everything '
        'into one conversation, each piece lives in a file that the right agent loads when it needs it.'
    )
    pdf.add_code_block(
        '.planning/\n'
        '  PROJECT.md               -- Vision document\n'
        '  REQUIREMENTS.md          -- Scoped requirements\n'
        '  ROADMAP.md               -- Phases with progress tracking\n'
        '  STATE.md                 -- Decisions, blockers, cross-session memory\n'
        '  CONTEXT.md               -- Locked decisions from /gsd:discuss-phase\n'
        '  codebase/                -- Output from /gsd:map-codebase\n'
        '    architecture.md\n'
        '    stack.md\n'
        '    structure.md\n'
        '  phases/\n'
        '    05-ai-report-generation/\n'
        '      RESEARCH.md          -- Technical research output\n'
        '      PLAN-01.md           -- Task breakdown for subtask 1\n'
        '      PLAN-02.md           -- Task breakdown for subtask 2\n'
        '      SUMMARY.md           -- What was done, what changed'
    )

    # ══════════════════════════════════════════════════════════════════════
    # SECTION 6: CURRENT SETUP INVENTORY
    # ══════════════════════════════════════════════════════════════════════

    pdf.add_section_header('Current Setup Inventory', level=1)

    pdf.add_table(
        ['Mechanism', 'Source', 'Count', 'Status'],
        [
            ['Rules', 'CLAUDE.md', '500+ lines', 'Active — every conversation'],
            ['Memory', 'Auto-memory system', '8 files', 'Active — growing each session'],
            ['Skills', 'gstack + custom', '30 skills', 'Active — heavy use'],
            ['Commands', 'gstack (via skills) + GSD', '30 + 60+', 'Active'],
            ['Hooks', 'GSD', '3 active', 'Just installed'],
            ['Agents', 'GSD', '18 agent definitions', 'Available — not yet used'],
            ['Plugins', 'None via marketplace', '—', 'gstack/GSD installed manually'],
        ]
    )

    pdf.add_section_header('Installed Skills (30)', level=2)
    pdf.add_body_text(
        'From gstack: benchmark, browse, canary, careful, codex, design-consultation, '
        'design-review, document-release, freeze, gstack-upgrade, guard, investigate, '
        'land-and-deploy, office-hours, plan-ceo-review, plan-design-review, plan-eng-review, '
        'qa, qa-only, retro, review, setup-browser-cookies, setup-deploy, ship, unfreeze'
    )
    pdf.add_body_text(
        'From custom installs: computer-learning, rca, research-dive, writing-skills'
    )

    pdf.add_section_header('File Locations', level=2)
    pdf.add_code_block(
        '~/.claude/\n'
        '  settings.json            -- Hook configuration (GSD hooks wired here)\n'
        '  hooks/                   -- Hook scripts (GSD)\n'
        '    gsd-check-update.js\n'
        '    gsd-context-monitor.js\n'
        '    gsd-prompt-guard.js\n'
        '  agents/                  -- GSD agent definitions (18 agents)\n'
        '  commands/gsd/            -- GSD slash commands (60+)\n'
        '  get-shit-done/           -- GSD core (workflows, references, templates, bin)\n'
        '  skills/                  -- Global skills directory\n'
        '    gstack/                -- gstack meta\n'
        '    browse/                -- gstack skill\n'
        '    qa/                    -- gstack skill\n'
        '    writing-skills/        -- From Superpowers (standalone)\n'
        '    computer-learning/     -- Custom skill\n'
        '    research-dive/         -- Custom skill\n'
        '    rca/                   -- Custom skill\n'
        '  projects/{hash}/memory/  -- Per-project persistent memory'
    )

    # ══════════════════════════════════════════════════════════════════════
    # SECTION 7: THES1S PHASE 5 EXAMPLE
    # ══════════════════════════════════════════════════════════════════════

    pdf.add_section_header('Applied to Thes1s: Phase 5 Example', level=1)

    pdf.add_body_text(
        'How the full stack works together for building AI Report Generation. '
        'gstack owns the bookends (strategic planning + quality/shipping). '
        'GSD owns the middle (task breakdown + parallel execution + verification).'
    )

    pdf.draw_labeled_flow_chart(
        'Phase 5 Workflow: AI Report Generation',
        [
            'STRATEGIC PLANNING (gstack)\n/plan-ceo-review  /plan-eng-review  /plan-design-review',
            'CODEBASE MAPPING (GSD)\n/gsd:map-codebase — Analyze what Thes1s already has',
            'TASK PLANNING (GSD)\n/gsd:plan-phase 5 — Break into parallel plans with dependencies',
            'WAVE EXECUTION (GSD)\n/gsd:execute-phase 5 — Parallel waves, fresh contexts, atomic commits',
            'VERIFICATION (GSD)\n/gsd:verify-work — Quality gates, acceptance testing',
            'QUALITY & POLISH (gstack)\n/qa  /review  /design-review — Browser QA, code review, visual polish',
            'SHIP (gstack)\n/ship  /land-and-deploy — PR, merge, deploy, canary verification',
        ],
        labels=['PLAN', 'MAP', 'TASKS', 'BUILD', 'VERIFY', 'POLISH', 'SHIP']
    )

    pdf.add_section_header('Wave Execution Detail', level=2)
    pdf.add_body_text(
        'GSD groups tasks by dependencies. Independent tasks run simultaneously in Wave 1, '
        'each with a fresh 200k-token context. Dependent tasks wait for their prerequisites.'
    )

    pdf.draw_parallel_flow(
        'Wave 1 — Parallel (independent tasks)',
        'Fresh 200k context per agent, atomic commits per task',
        [
            ('gsd-executor', 'Plan 1:\nClaude API\nintegration\n(aiResearch.js)'),
            ('gsd-executor', 'Plan 3:\nStatusBadge\ncomponent\n(independent)'),
        ]
    )

    pdf.draw_flow_chart(
        'Wave 2 — Sequential (depends on Wave 1)',
        [
            'Wave 1 completes: API engine + StatusBadge ready',
            'gsd-executor spawned for Plan 2: OnePager component\n(depends on API engine from Plan 1)',
            'Atomic commits for each task in Plan 2',
        ],
        arrow_color=pdf.teal_500,
        box_fill=pdf.teal_50,
        text_color=pdf.slate_800,
    )

    pdf.add_body_text(
        'The key insight: gstack owns the bookends (strategic planning + quality/shipping). '
        'GSD owns the middle (task breakdown + parallel execution + verification). Neither '
        'steps on the other.'
    )

    # ══════════════════════════════════════════════════════════════════════
    # SECTION 8: WORKFLOW ROUTER TEST RESULTS
    # ══════════════════════════════════════════════════════════════════════

    pdf.add_section_header('Workflow Router — Validated Test Results', level=1)

    pdf.add_body_text(
        'The workflow-router custom skill routes every task to the right workflow intensity '
        'using a 2-dimensional assessment: size (how much code?) x risk (what breaks if we '
        'get it wrong?). Five test scenarios were run against the router with zero explicit '
        'prompting — Claude read the skill and routed each task conversationally.'
    )

    pdf.add_section_header('Router Decision Matrix', level=2)

    pdf.add_code_block(
        '                        Low Risk          Medium Risk         High Risk\n'
        '                   +------------------+------------------+------------------+\n'
        '    Trivial        | L0: Just do it   | L0: Just do it   | L0: Just do it   |\n'
        '                   |                  |                  |   (but careful)  |\n'
        '                   +------------------+------------------+------------------+\n'
        '    Small          | L0: Just do it   | L1: Investigate  | L2: Plan first   |\n'
        '                   |                  |   if bug         |                  |\n'
        '                   +------------------+------------------+------------------+\n'
        '    Medium         | L2: Plan first   | L3: Full gstack  | L3: Full gstack  |\n'
        '                   |   (lite)         |   planning       |   planning       |\n'
        '                   +------------------+------------------+------------------+\n'
        '    Large          | L4: gstack +     | L5: gstack +     | L5: gstack +     |\n'
        '                   |   GSD (lite)     |   GSD (full)     |   GSD (full)     |\n'
        '                   +------------------+------------------+------------------+'
    )

    pdf.add_section_header('Test Results (5/5 correct routing)', level=2)

    pdf.add_table(
        ['#', 'Task', 'Size', 'Risk', 'Level', 'Skills/Commands Chosen'],
        [
            ['1', 'Fix hover color on tab header', 'Trivial', 'Low', 'L0', 'None — just do it'],
            ['2', 'REIT FFO returning NaN', 'Small', 'Med', 'L1', '/investigate > test > fix > npm test'],
            ['3', 'Add Dividend History sub-tab', 'Medium', 'Med', 'L3', '/plan-eng-review > build > /qa > /review'],
            ['4', 'Build OnePager component', 'Large', 'High', 'L5', '/plan-ceo > /plan-eng > /plan-design > /gsd:plan > /gsd:execute > /qa > /review'],
            ['5', 'Build entire Phase 5', 'Large', 'High', 'L5', '/plan-ceo > /plan-eng > /plan-design > /gsd:map > /gsd:discuss > /gsd:plan > /gsd:execute > /qa > /review'],
        ]
    )

    pdf.add_section_header('Key Observations', level=3)
    pdf.add_bullet('Tests 4 and 5 appropriately differentiated — Test 5 added /gsd:map-codebase and /gsd:discuss-phase for a full phase vs. single component')
    pdf.add_bullet('Test 2 correctly identified as a bug and routed to /investigate, not plan mode')
    pdf.add_bullet('Test 1 chose "no skills needed" — no over-engineering a trivial fix')
    pdf.add_bullet('No test over-planned or under-planned')

    # ── Final note ──
    pdf.ln(10)
    pdf.set_draw_color(*pdf.teal_500)
    pdf.set_line_width(0.5)
    x_center = pdf.w / 2
    pdf.line(x_center - 40, pdf.get_y(), x_center + 40, pdf.get_y())
    pdf.ln(5)
    pdf.set_font('ArialUni', 'I', 9)
    pdf.set_text_color(*pdf.slate_500)
    pdf.multi_cell(0, 5,
        'This document reflects the agentic workflow stack as configured on '
        f'{date.today().strftime("%B %d, %Y")}. As tools evolve and custom skills are added, '
        'update accordingly.',
        align='C'
    )

    # ── Output ──
    output_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                              '..', '..', 'knowledge', 'references', 'agentic-workflows')
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, 'agentic-workflow-stack.pdf')
    pdf.output(output_path)
    print(f'PDF generated: {output_path} ({pdf.page_no()} pages)')


if __name__ == '__main__':
    build_pdf()
