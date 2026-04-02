#!/usr/bin/env python3
"""
Chart Image Generator — Matplotlib-based chart images for Word doc embedding.

Generates Thes1s-branded PNG chart images that can be embedded in python-docx Word
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

# ── Thes1s Color Palette (hex format for matplotlib) ─────────────────────────

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
    """Set matplotlib rcParams for Thes1s look."""
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
