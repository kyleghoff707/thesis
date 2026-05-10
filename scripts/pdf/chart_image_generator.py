#!/usr/bin/env python3
"""
Chart Image Generator — Matplotlib-based chart images for Word doc embedding.

Generates Thesis-branded PNG chart images that can be embedded in python-docx Word
documents. Mirrors the visual style of the fpdf2 PDF chart methods so that Word docs
and PDFs have a consistent look.

All functions:
- Accept an optional `output_path` parameter; if None, use tempfile
- Call plt.close('all') after saving to prevent memory leaks
- Use plt.tight_layout() before saving
- Save at 150 DPI for good quality without huge file sizes
- Return the path to the saved PNG file

Usage:
    from scripts.pdf.chart_image_generator import generate_bar_chart, generate_trend_chart

    path = generate_bar_chart(['Rev', 'NI', 'FCF'], [5.5, 1.2, 0.8], title='Key Metrics')
    # path is a PNG file that can be added to a Word document
"""

import matplotlib
matplotlib.use('Agg')  # Non-interactive backend — must be before pyplot import
import matplotlib.pyplot as plt
import matplotlib.ticker as mticker
import matplotlib.patches as mpatches
import os
import tempfile

# ── Thesis Color Palette (hex format for matplotlib) ─────────────────────────

TEAL_500 = '#0f766e'
TEAL_400 = '#2dd4bf'
TEAL_300 = '#5eead4'
TEAL_100 = '#ccfbf1'
TEAL_50 = '#f0fdfa'
SLATE_800 = '#1e293b'
SLATE_700 = '#334155'
SLATE_600 = '#475569'
SLATE_500 = '#64748b'
SLATE_200 = '#e2e8f0'
SLATE_100 = '#f1f5f9'
RED_500 = '#ef4444'
RED_400 = '#f87171'
AMBER_500 = '#f59e0b'
AMBER_400 = '#fbbf24'
GREEN_500 = '#22c55e'
GREEN_400 = '#4ade80'
BLUE_500 = '#3b82f6'
BLUE_400 = '#60a5fa'

# Series colors for multi-series charts
SERIES_COLORS = [TEAL_500, BLUE_500, AMBER_500, RED_500, GREEN_500]

# Verdict colors
VERDICT_COLORS = {
    'PASS': GREEN_500,
    'FAIL': RED_500,
    'WATCHLIST': AMBER_500,
    'PARTIAL': AMBER_500,
    'CONTEXT': AMBER_500,
    'N/A': SLATE_500,
}

# Default DPI for all chart outputs
DEFAULT_DPI = 150


def _setup_style():
    """Set matplotlib rcParams for Thesis look."""
    plt.rcParams.update({
        'font.family': 'sans-serif',
        'font.sans-serif': ['Arial', 'Helvetica', 'DejaVu Sans'],
        'font.size': 10,
        'axes.titlesize': 12,
        'axes.titleweight': 'bold',
        'axes.labelsize': 10,
        'axes.labelcolor': SLATE_600,
        'axes.edgecolor': SLATE_200,
        'axes.facecolor': 'white',
        'axes.grid': True,
        'grid.color': SLATE_200,
        'grid.alpha': 0.5,
        'grid.linewidth': 0.5,
        'figure.facecolor': 'white',
        'figure.edgecolor': 'white',
        'xtick.color': SLATE_600,
        'ytick.color': SLATE_600,
        'text.color': SLATE_800,
    })


def _get_output_path(output_path, suffix='_chart.png'):
    """Return output_path if provided, otherwise create a temp file."""
    if output_path:
        os.makedirs(os.path.dirname(output_path) or '.', exist_ok=True)
        return output_path
    return tempfile.mktemp(suffix=suffix)


def _save_and_close(fig, output_path):
    """Save figure, close all plots, return path."""
    fig.tight_layout()
    fig.savefig(output_path, dpi=DEFAULT_DPI, bbox_inches='tight', facecolor='white')
    plt.close('all')
    return output_path


def generate_bar_chart(labels, values, title='', unit='', output_path=None, colors=None):
    """
    Generate a horizontal bar chart PNG.

    Args:
        labels: List of label strings (one per bar)
        values: List of numeric values
        title: Chart title
        unit: Unit suffix for value labels (e.g., '%', '$')
        output_path: Path to save PNG (tempfile if None)
        colors: List of hex color strings or single string (defaults to teal_500)

    Returns:
        str: Path to saved PNG file
    """
    _setup_style()
    output_path = _get_output_path(output_path, '_bar.png')

    n = len(labels)
    fig_height = max(3, n * 0.6)
    fig, ax = plt.subplots(figsize=(8, fig_height))

    # Default colors: teal for positive, red for negative
    if colors is None:
        colors = [TEAL_500 if v >= 0 else RED_500 for v in values]
    elif isinstance(colors, str):
        colors = [colors] * n

    y_pos = range(n)
    bars = ax.barh(y_pos, values, color=colors, height=0.6, edgecolor='none')
    ax.set_yticks(y_pos)
    ax.set_yticklabels(labels)
    ax.invert_yaxis()  # Top-to-bottom like the PDF version

    # Value labels on bars
    for bar, val in zip(bars, values):
        if unit == '%':
            label = f'{val:.1f}%'
        elif unit == '$' or unit == 'B':
            label = f'${val:.1f}B' if abs(val) >= 1 else f'${val:.2f}B'
        elif unit == 'M':
            label = f'${val:.0f}M'
        else:
            label = f'{val:,.1f}' if isinstance(val, float) else f'{val:,}'
        ax.text(bar.get_width() + max(abs(v) for v in values) * 0.02, bar.get_y() + bar.get_height() / 2,
                label, va='center', fontsize=8, color=SLATE_600)

    if title:
        ax.set_title(title, color=TEAL_500, fontweight='bold', loc='left')

    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.spines['bottom'].set_visible(False)
    ax.xaxis.set_visible(False)

    return _save_and_close(fig, output_path)


def generate_comparison_chart(labels, series_data, series_names, title='', unit='',
                              output_path=None):
    """
    Generate a grouped horizontal bar chart PNG (2-3 series side by side).

    Args:
        labels: List of group labels
        series_data: List of value lists (one per series)
        series_names: List of series names for legend
        title: Chart title
        unit: Unit suffix
        output_path: Path to save PNG (tempfile if None)

    Returns:
        str: Path to saved PNG file
    """
    _setup_style()
    output_path = _get_output_path(output_path, '_comparison.png')

    n_groups = len(labels)
    n_series = len(series_data)
    bar_height = 0.8 / n_series
    fig_height = max(3, n_groups * 0.8)
    fig, ax = plt.subplots(figsize=(8, fig_height))

    for si, (s_data, s_name) in enumerate(zip(series_data, series_names)):
        y_pos = [y + si * bar_height for y in range(n_groups)]
        color = SERIES_COLORS[si % len(SERIES_COLORS)]
        ax.barh(y_pos, s_data, height=bar_height, label=s_name, color=color, edgecolor='none')

    ax.set_yticks([y + bar_height * (n_series - 1) / 2 for y in range(n_groups)])
    ax.set_yticklabels(labels)
    ax.invert_yaxis()
    ax.legend(loc='upper right', fontsize=8, framealpha=0.8)

    if title:
        ax.set_title(title, color=TEAL_500, fontweight='bold', loc='left')

    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)

    return _save_and_close(fig, output_path)


def generate_verdict_scorecard(sections, title='', output_path=None):
    """
    Generate a visual verdict scorecard as a table-style chart.

    Args:
        sections: List of (name, verdict, confidence, signal) tuples
        title: Chart title
        output_path: Path to save PNG (tempfile if None)

    Returns:
        str: Path to saved PNG file
    """
    _setup_style()
    output_path = _get_output_path(output_path, '_verdict.png')

    n = len(sections)
    fig_height = max(2, n * 0.5 + 1)
    fig, ax = plt.subplots(figsize=(8, fig_height))
    ax.set_xlim(0, 10)
    ax.set_ylim(0, n + 1)
    ax.invert_yaxis()
    ax.axis('off')

    # Header row
    header_y = 0.5
    headers = ['Section', 'Verdict', 'Confidence', 'Signal']
    header_x = [0.2, 5.0, 6.8, 8.5]
    for hx, h_text in zip(header_x, headers):
        ax.text(hx, header_y, h_text, fontsize=9, fontweight='bold', color=TEAL_500,
                va='center')

    # Draw header line
    ax.plot([0, 10], [1.0, 1.0], color=TEAL_500, linewidth=1)

    for i, (name, verdict, confidence, signal) in enumerate(sections):
        row_y = 1.5 + i * 0.9

        # Alternating row background
        if i % 2 == 0:
            rect = mpatches.FancyBboxPatch((0, row_y - 0.35), 10, 0.7,
                                            boxstyle='round,pad=0.05',
                                            facecolor=TEAL_50, edgecolor='none', alpha=0.5)
            ax.add_patch(rect)

        # Section name
        ax.text(0.2, row_y, name, fontsize=8, va='center', color=SLATE_800)

        # Verdict badge
        v_color = VERDICT_COLORS.get(str(verdict).upper(), SLATE_500)
        badge = mpatches.FancyBboxPatch((4.5, row_y - 0.2), 1.5, 0.4,
                                         boxstyle='round,pad=0.1',
                                         facecolor=v_color, edgecolor='none')
        ax.add_patch(badge)
        ax.text(5.25, row_y, str(verdict), fontsize=7, fontweight='bold',
                color='white', ha='center', va='center')

        # Confidence + Signal
        ax.text(6.8, row_y, str(confidence), fontsize=8, va='center', color=SLATE_600)
        ax.text(8.5, row_y, str(signal), fontsize=8, va='center', color=SLATE_600)

    if title:
        ax.set_title(title, color=TEAL_500, fontweight='bold', loc='left', fontsize=11)

    return _save_and_close(fig, output_path)


def generate_metric_gauges(gauges, title='', output_path=None):
    """
    Generate horizontal gauge bars showing metric values.

    Args:
        gauges: List of (label, value, target, unit) tuples
        title: Chart title
        output_path: Path to save PNG (tempfile if None)

    Returns:
        str: Path to saved PNG file
    """
    _setup_style()
    output_path = _get_output_path(output_path, '_gauges.png')

    n = len(gauges)
    fig, axes = plt.subplots(1, n, figsize=(max(8, n * 2.5), 2.5))
    if n == 1:
        axes = [axes]

    for i, (label, value, target, unit) in enumerate(gauges):
        ax = axes[i]
        ax.set_xlim(0, max(value, target) * 1.3)
        ax.set_ylim(0, 1)
        ax.axis('off')

        # Background bar
        ax.barh(0.5, max(value, target) * 1.3, height=0.3, color=SLATE_100, edgecolor='none')

        # Value bar
        if value >= target:
            bar_color = GREEN_500
        elif value >= target * 0.7:
            bar_color = AMBER_500
        else:
            bar_color = RED_500
        ax.barh(0.5, value, height=0.3, color=bar_color, edgecolor='none')

        # Target line
        ax.axvline(x=target, color=SLATE_600, linewidth=1.5, linestyle='--')

        # Labels
        val_str = f'{value:.1f}{unit}' if isinstance(value, float) else f'{value}{unit}'
        ax.text(0, 0.1, label, fontsize=8, fontweight='bold', color=SLATE_800)
        ax.text(max(value, target) * 1.3, 0.5, val_str, fontsize=9, fontweight='bold',
                va='center', ha='right', color=SLATE_800)

    if title:
        fig.suptitle(title, color=TEAL_500, fontweight='bold', fontsize=11, x=0.02, ha='left')

    return _save_and_close(fig, output_path)


def generate_price_range_chart(methods, current_price, title='', output_path=None):
    """
    Generate horizontal range bars for valuation methods with a current price line.

    Args:
        methods: List of (name, low, high, color_hex) tuples
        current_price: Current stock price (draws vertical dashed line)
        title: Chart title
        output_path: Path to save PNG (tempfile if None)

    Returns:
        str: Path to saved PNG file
    """
    _setup_style()
    output_path = _get_output_path(output_path, '_price_range.png')

    n = len(methods)
    fig_height = max(2.5, n * 0.7 + 1)
    fig, ax = plt.subplots(figsize=(8, fig_height))

    max_price = max(current_price, max(h for _, _, h, _ in methods)) * 1.15

    for i, (name, low, high, color_hex) in enumerate(methods):
        ax.barh(i, high - low, left=low, height=0.5, color=color_hex, edgecolor='none',
                alpha=0.85)
        # Low/High labels
        ax.text(low - max_price * 0.01, i, f'${low:.0f}', fontsize=7, ha='right', va='center',
                color=SLATE_600)
        ax.text(high + max_price * 0.01, i, f'${high:.0f}', fontsize=7, ha='left', va='center',
                color=SLATE_600)

    # Current price dashed line
    ax.axvline(x=current_price, color=RED_500, linewidth=1.5, linestyle='--', zorder=5)
    ax.text(current_price, -0.6, f'Current ${current_price:.0f}', fontsize=8, fontweight='bold',
            color=RED_500, ha='center', va='bottom')

    ax.set_yticks(range(n))
    ax.set_yticklabels([m[0] for m in methods], fontsize=9, fontweight='bold')
    ax.invert_yaxis()
    ax.set_xlim(0, max_price)
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.spines['left'].set_visible(False)

    if title:
        ax.set_title(title, color=TEAL_500, fontweight='bold', loc='left')

    return _save_and_close(fig, output_path)


def generate_checklist_summary(items, title='', output_path=None):
    """
    Generate a stacked horizontal bar showing PASS/FAIL/PARTIAL counts.

    Args:
        items: List of dicts with 'verdict' key
        title: Chart title
        output_path: Path to save PNG (tempfile if None)

    Returns:
        str: Path to saved PNG file
    """
    _setup_style()
    output_path = _get_output_path(output_path, '_checklist.png')

    # Count verdicts
    counts = {'PASS': 0, 'FAIL': 0, 'PARTIAL': 0, 'OTHER': 0}
    for item in items:
        v = str(item.get('verdict', '')).upper()
        if v == 'PASS':
            counts['PASS'] += 1
        elif v == 'FAIL':
            counts['FAIL'] += 1
        elif v in ('PARTIAL', 'WATCHLIST', 'CONTEXT'):
            counts['PARTIAL'] += 1
        else:
            counts['OTHER'] += 1

    fig, ax = plt.subplots(figsize=(8, 1.5))

    # Stacked horizontal bar
    left = 0
    bar_data = [
        ('Pass', counts['PASS'], GREEN_500),
        ('Partial', counts['PARTIAL'], AMBER_500),
        ('Fail', counts['FAIL'], RED_500),
    ]
    if counts['OTHER'] > 0:
        bar_data.append(('Other', counts['OTHER'], SLATE_500))

    for label, count, color in bar_data:
        if count > 0:
            ax.barh(0, count, left=left, height=0.6, color=color, edgecolor='none')
            # Label inside bar if wide enough
            if count >= 2:
                ax.text(left + count / 2, 0, f'{label}\n{count}', ha='center', va='center',
                        fontsize=8, fontweight='bold', color='white')
            left += count

    total = sum(counts.values())
    ax.set_xlim(0, total)
    ax.set_ylim(-0.5, 0.5)
    ax.axis('off')

    if title:
        ax.set_title(title, color=TEAL_500, fontweight='bold', loc='left', fontsize=11)

    return _save_and_close(fig, output_path)


def generate_trend_chart(years, values, title='', unit='', output_path=None):
    """
    Generate a line chart with markers for time series data.

    Args:
        years: List of year values (x-axis)
        values: List of numeric values (y-axis)
        title: Chart title
        unit: Unit suffix for y-axis labels
        output_path: Path to save PNG (tempfile if None)

    Returns:
        str: Path to saved PNG file
    """
    _setup_style()
    output_path = _get_output_path(output_path, '_trend.png')

    fig, ax = plt.subplots(figsize=(8, 4))

    ax.plot(years, values, color=TEAL_500, linewidth=2.5, marker='o', markersize=6,
            markerfacecolor=TEAL_500, markeredgecolor='white', markeredgewidth=1.5,
            zorder=5)

    # Fill area under the line
    ax.fill_between(years, values, alpha=0.1, color=TEAL_500)

    # Value labels on each point
    for x, y in zip(years, values):
        if unit == '%':
            label = f'{y:.1f}%'
        elif unit == 'B':
            label = f'${y:.1f}B'
        elif unit == 'M':
            label = f'${y:.0f}M'
        else:
            label = f'{y:,.1f}' if isinstance(y, float) else f'{y:,}'
        ax.annotate(label, (x, y), textcoords="offset points", xytext=(0, 10),
                    ha='center', fontsize=8, color=SLATE_600)

    ax.set_xticks(years)
    ax.set_xticklabels([str(int(y)) for y in years])
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)

    if title:
        ax.set_title(title, color=TEAL_500, fontweight='bold', loc='left')

    return _save_and_close(fig, output_path)


# ── Pipeline Flow (cover page) ────────────────────────────────────────────────

def generate_pipeline_flow(current_stage, output_path=None):
    """3-stage pipeline flow chart for DOCX cover pages."""
    _setup_style()
    output_path = _get_output_path(output_path, '_pipeline_flow.png')

    stages = ['One Pager', 'Pitch Deck', 'Final Thesis']
    fig, ax = plt.subplots(figsize=(8.0, 1.4))
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 1.5)
    ax.axis('off')

    box_w = 2.5
    gap = 0.75
    for i, stage in enumerate(stages):
        x = i * (box_w + gap)
        is_current = (stage == current_stage)
        face = TEAL_50 if is_current else 'white'
        edge = TEAL_500 if is_current else SLATE_200
        lw = 2.0 if is_current else 1.0
        text_color = TEAL_500 if is_current else SLATE_500
        rect = mpatches.FancyBboxPatch((x, 0.3), box_w, 0.9,
                                        boxstyle='round,pad=0.05',
                                        facecolor=face, edgecolor=edge, linewidth=lw)
        ax.add_patch(rect)
        ax.text(x + box_w / 2, 0.95, f'Stage {i+1}',
                ha='center', va='center', fontsize=9, fontweight='bold', color=text_color)
        ax.text(x + box_w / 2, 0.55, stage,
                ha='center', va='center', fontsize=10, color=text_color)

        if i < len(stages) - 1:
            arrow_x = x + box_w
            ax.annotate('', xy=(arrow_x + gap, 0.75), xytext=(arrow_x, 0.75),
                        arrowprops=dict(arrowstyle='->', color=SLATE_500, lw=1.2))
            ax.text(arrow_x + gap / 2, 0.4, 'gate',
                    ha='center', va='center', fontsize=7, color=SLATE_500, fontstyle='italic')

    return _save_and_close(fig, output_path)


def generate_donut(slices, title='', colors=None, output_path=None):
    """Donut chart. slices: list of (label, value) tuples."""
    _setup_style()
    output_path = _get_output_path(output_path, '_donut.png')

    labels = [s[0] for s in slices]
    values = [max(0, s[1]) for s in slices]
    if sum(values) <= 0:
        return None
    colors = colors or [TEAL_500, BLUE_500, AMBER_500, SLATE_600, TEAL_300]
    palette = [colors[i % len(colors)] for i in range(len(values))]

    fig, ax = plt.subplots(figsize=(6, 4))
    wedges, _ = ax.pie(values, colors=palette, startangle=90, counterclock=False,
                       wedgeprops=dict(width=0.42, edgecolor='white'))
    ax.set_aspect('equal')

    total = sum(values)
    legend_labels = [f'{l}: {v / total * 100:.0f}%' for l, v in zip(labels, values)]
    ax.legend(wedges, legend_labels, loc='center left',
              bbox_to_anchor=(1.0, 0.5), fontsize=10, frameon=False)

    if title:
        fig.suptitle(title, color=TEAL_500, fontweight='bold', x=0.05, ha='left')

    return _save_and_close(fig, output_path)


def generate_radar(axes_labels, values, title='', max_value=10, output_path=None):
    """Radar/spider chart with N axes."""
    _setup_style()
    output_path = _get_output_path(output_path, '_radar.png')

    import numpy as np
    n = len(axes_labels)
    angles = np.linspace(0, 2 * np.pi, n, endpoint=False).tolist()
    vals = list(values) + [values[0]]
    angles_closed = angles + [angles[0]]

    fig, ax = plt.subplots(figsize=(6, 5), subplot_kw=dict(polar=True))
    ax.set_theta_offset(np.pi / 2)
    ax.set_theta_direction(-1)

    ax.fill(angles_closed, vals, color=TEAL_300, alpha=0.5)
    ax.plot(angles_closed, vals, color=TEAL_500, linewidth=2)

    ax.set_xticks(angles)
    ax.set_xticklabels(axes_labels, fontsize=9, color=SLATE_700)
    ax.set_yticks([max_value * f for f in (0.25, 0.5, 0.75, 1.0)])
    ax.set_yticklabels([])
    ax.set_ylim(0, max_value)
    ax.spines['polar'].set_color(SLATE_200)

    if title:
        ax.set_title(title, color=TEAL_500, fontweight='bold', pad=18)

    return _save_and_close(fig, output_path)


def generate_stacked_bar(periods, stacks, stack_names, title='', unit='B',
                          colors=None, output_path=None):
    """Vertical stacked bar over multiple periods."""
    _setup_style()
    output_path = _get_output_path(output_path, '_stacked.png')

    colors = colors or [TEAL_500, TEAL_400, AMBER_500, BLUE_500, SLATE_600]

    fig, ax = plt.subplots(figsize=(7.5, 4))
    bottoms = [0] * len(periods)
    for i, (vals, name) in enumerate(zip(stacks, stack_names)):
        ax.bar(periods, vals, bottom=bottoms, label=name,
               color=colors[i % len(colors)], width=0.65, edgecolor='white', linewidth=0.5)
        bottoms = [b + v for b, v in zip(bottoms, vals)]

    ax.legend(loc='upper left', frameon=False, fontsize=9)
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)

    if unit == 'B':
        ax.yaxis.set_major_formatter(mticker.FuncFormatter(
            lambda v, _: f'${v / 1e9:.0f}B' if v >= 1e9 else f'${v / 1e6:.0f}M'))
    elif unit == '%':
        ax.yaxis.set_major_formatter(mticker.PercentFormatter(decimals=0))

    if title:
        ax.set_title(title, color=TEAL_500, fontweight='bold', loc='left')

    return _save_and_close(fig, output_path)


def generate_divergent_bar(bulls, bears, title='', output_path=None):
    """Bull (right, teal) vs Bear (left, red) divergent horizontal bars."""
    _setup_style()
    output_path = _get_output_path(output_path, '_divergent.png')

    n = max(len(bulls), len(bears))
    fig, ax = plt.subplots(figsize=(8, max(3.5, 0.55 * n + 1.5)))
    y_pos = list(range(n))[::-1]

    for i in range(n):
        if i < len(bulls):
            label, weight = bulls[i]
            ax.barh(y_pos[i], weight, left=0, color=TEAL_500, height=0.6, edgecolor='white')
            ax.text(weight + 0.15, y_pos[i], str(label)[:60], va='center', fontsize=8.5,
                    color=SLATE_800)
        if i < len(bears):
            label, weight = bears[i]
            ax.barh(y_pos[i], -weight, left=0, color=RED_500, height=0.6, edgecolor='white')
            ax.text(-weight - 0.15, y_pos[i], str(label)[:60], va='center', ha='right',
                    fontsize=8.5, color=SLATE_800)

    max_weight = max(([w for _, w in bulls] or [1]) + ([w for _, w in bears] or [1]))
    ax.set_xlim(-max_weight * 1.5, max_weight * 1.5)
    ax.axvline(0, color=SLATE_500, linewidth=0.8)
    ax.set_yticks([])
    ax.set_xticks([])
    for s in ('top', 'right', 'left', 'bottom'):
        ax.spines[s].set_visible(False)

    ax.text(-max_weight * 1.5, n + 0.4, 'BEAR THESIS',
            ha='left', fontsize=10, fontweight='bold', color=RED_500)
    ax.text(max_weight * 1.5, n + 0.4, 'BULL THESIS',
            ha='right', fontsize=10, fontweight='bold', color=TEAL_500)

    if title:
        ax.set_title(title, color=TEAL_500, fontweight='bold', loc='left', pad=24)

    return _save_and_close(fig, output_path)


def generate_price_ladder(current_price, levels, title='', output_path=None):
    """Vertical price ladder with entry/trim/exit zones."""
    _setup_style()
    output_path = _get_output_path(output_path, '_ladder.png')

    if not levels:
        return None

    zone_color = {'entry': TEAL_500, 'trim': AMBER_500, 'exit': RED_500}

    fig, ax = plt.subplots(figsize=(6.5, 5))
    all_prices = [current_price] + [low for _, low, _, _ in levels] + \
                 [high for _, _, high, _ in levels]
    pmin = min(all_prices) * 0.95
    pmax = max(all_prices) * 1.05

    for label, low, high, kind in levels:
        ax.barh(0, high - low, left=low, color=zone_color.get(kind, SLATE_500),
                height=0.4, alpha=0.7, edgecolor='white')
        ax.text((low + high) / 2, 0, f'{label}\n${low:.0f}-${high:.0f}',
                ha='center', va='center', fontsize=8.5, color='white', fontweight='bold')

    ax.axvline(current_price, color=SLATE_800, linewidth=1.5, linestyle='--')
    ax.text(current_price, 0.4, f'Current ${current_price:.0f}',
            ha='center', fontsize=9, fontweight='bold', color=SLATE_800)

    ax.set_xlim(pmin, pmax)
    ax.set_ylim(-0.5, 0.7)
    ax.set_yticks([])
    ax.set_xlabel('Share Price ($)', fontsize=9, color=SLATE_600)
    for s in ('top', 'right', 'left'):
        ax.spines[s].set_visible(False)
    ax.grid(axis='x', alpha=0.3)

    if title:
        ax.set_title(title, color=TEAL_500, fontweight='bold', loc='left')

    return _save_and_close(fig, output_path)


def generate_status_grid(rows, columns, statuses, title='', output_path=None):
    """Gantt-lite status heatmap."""
    _setup_style()
    output_path = _get_output_path(output_path, '_grid.png')

    color_map = {
        'delivered': GREEN_500, 'pass': GREEN_500,
        'partial': AMBER_500,
        'missed': RED_500, 'fail': RED_500,
        'pending': SLATE_200,
    }

    fig, ax = plt.subplots(figsize=(8, max(2.5, 0.5 * len(rows) + 1.5)))
    ax.set_xlim(0, len(columns))
    ax.set_ylim(0, len(rows))

    for ri in range(len(rows)):
        for ci in range(len(columns)):
            s = None
            if ri < len(statuses) and ci < len(statuses[ri]):
                v = statuses[ri][ci]
                s = str(v).lower() if v else None
            color = color_map.get(s, SLATE_100)
            rect = mpatches.Rectangle((ci, len(rows) - ri - 1), 0.92, 0.85,
                                       facecolor=color, edgecolor='white', linewidth=2)
            ax.add_patch(rect)

    ax.set_xticks([i + 0.5 for i in range(len(columns))])
    ax.set_xticklabels(columns, fontsize=9, color=SLATE_700)
    ax.set_yticks([len(rows) - i - 0.5 for i in range(len(rows))])
    ax.set_yticklabels([str(r)[:50] for r in rows], fontsize=9, color=SLATE_700)
    ax.tick_params(length=0)
    for s in ax.spines.values():
        s.set_visible(False)
    ax.grid(False)

    if title:
        ax.set_title(title, color=TEAL_500, fontweight='bold', loc='left')

    return _save_and_close(fig, output_path)


def generate_sparkline_trio(series, title='', output_path=None):
    """Stacked sparklines. series: list of (label, values, color) tuples."""
    _setup_style()
    output_path = _get_output_path(output_path, '_spark.png')

    fig, axes = plt.subplots(len(series), 1, figsize=(7, 0.8 * len(series) + 0.6),
                              sharex=True)
    if len(series) == 1:
        axes = [axes]

    for ax, (label, values, color) in zip(axes, series):
        ax.plot(values, color=color, linewidth=1.8)
        ax.fill_between(range(len(values)), values, min(values), color=color, alpha=0.15)
        ax.set_yticks([])
        ax.set_xticks([])
        for s in ax.spines.values():
            s.set_visible(False)
        if values:
            ax.text(-0.3, sum(values) / len(values), label, fontsize=9,
                    color=SLATE_700, fontweight='bold', ha='right',
                    transform=ax.transData)
            ax.text(len(values) - 1, values[-1],
                    f'  {values[0]:.1f}% -> {values[-1]:.1f}%',
                    fontsize=8, color=SLATE_600, va='center')

    if title:
        fig.suptitle(title, color=TEAL_500, fontweight='bold', x=0.05, ha='left')

    return _save_and_close(fig, output_path)


def generate_gate_grid(gates, title='', output_path=None):
    """2-column grid of pass/fail gate cards."""
    _setup_style()
    output_path = _get_output_path(output_path, '_gates.png')

    if not gates:
        return None

    color_map = {'PASS': GREEN_500, 'FAIL': RED_500, 'WARN': AMBER_500}

    n = len(gates)
    cols = 2
    rows = (n + cols - 1) // cols
    fig, axes = plt.subplots(rows, cols, figsize=(8, 0.9 * rows + 0.6))
    axes = axes.flatten() if hasattr(axes, 'flatten') else [axes]

    for i, ax in enumerate(axes):
        ax.set_xlim(0, 10)
        ax.set_ylim(0, 2)
        ax.axis('off')
        if i >= n:
            continue
        label, status, detail = gates[i]
        color = color_map.get(str(status).upper(), SLATE_500)
        circle = mpatches.Circle((0.5, 1.0), 0.4, facecolor=color, edgecolor=color)
        ax.add_patch(circle)
        ax.text(0.5, 1.0, {'PASS': 'OK', 'FAIL': 'X', 'WARN': '!'}.get(
                str(status).upper(), '?'),
                ha='center', va='center', fontsize=10, fontweight='bold', color='white')
        ax.text(1.2, 1.4, str(label), fontsize=10, fontweight='bold', color=SLATE_800)
        ax.text(1.2, 0.7, str(detail)[:80], fontsize=8.5, color=SLATE_600)

    if title:
        fig.suptitle(title, color=TEAL_500, fontweight='bold', x=0.05, ha='left')

    return _save_and_close(fig, output_path)
