#!/usr/bin/env python3
"""
Report Data Reader — Unified pipeline output access for all 3 report stages.

Normalizes the 3 different pipeline output formats (one-pager.json, pipeline-output.json,
full-story-api.json) into one consistent API that all 6 export generators can use.

Usage:
    from scripts.pdf.report_data_reader import ReportData

    rd = ReportData('MNST', 'one-pager')
    print(rd.get_company_name())
    print(rd.get_overall_verdict())
    for key in rd.get_section_keys():
        sec = rd.get_section(key)
        print(sec.get('title'), sec.get('verdict'))
"""

import os
import json


# File mapping: stage -> JSON filename
STAGE_FILE_MAP = {
    'one-pager': 'one-pager.json',
    'pitch-deck': 'pipeline-output.json',
    'full-story': 'full-story-api.json',
}


class ReportData:
    """Unified access to any stage's pipeline output + data packet."""

    def __init__(self, ticker, stage, base_dir=None):
        """
        Load report data for a ticker and stage.

        Args:
            ticker: Stock ticker symbol (e.g., 'MNST')
            stage: 'one-pager' | 'pitch-deck' | 'full-story'
            base_dir: Optional base directory override (defaults to project root)
        """
        self.ticker = ticker
        self.stage = stage

        if base_dir is None:
            # Navigate from scripts/pdf/ up to project root
            base_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')

        self.report_dir = os.path.join(base_dir, '.thes1s', 'reports', ticker)

        # Load the stage-specific report JSON
        report_file = STAGE_FILE_MAP.get(stage)
        if not report_file:
            raise ValueError(f"Unknown stage: {stage}. Expected one of: {list(STAGE_FILE_MAP.keys())}")

        self.report = self._load_json(os.path.join(self.report_dir, report_file))

        # Also try pitch-deck.json as fallback for pitch-deck stage
        if stage == 'pitch-deck' and not self.report:
            self.report = self._load_json(os.path.join(self.report_dir, 'pitch-deck.json'))

        # Load data packet (shared financial data for charts)
        self.data_packet = self._load_json(os.path.join(self.report_dir, 'data-packet.json'))

        # Build sections dict keyed by section 'key' field
        self.sections = {}
        raw_sections = self.report.get('sections', [])
        if isinstance(raw_sections, list):
            for s in raw_sections:
                key = s.get('key', '')
                # Filter out reader sections for CC pipeline compatibility
                if 'reader' in key:
                    continue
                # Parse data field if it's a string (One Pager sometimes has "{}")
                if isinstance(s.get('data'), str):
                    try:
                        s['data'] = json.loads(s['data'])
                    except (json.JSONDecodeError, TypeError):
                        s['data'] = {}
                self.sections[key] = s

    def _load_json(self, path):
        """Load a JSON file, returning empty dict if missing or invalid."""
        try:
            with open(path, 'r') as f:
                return json.load(f)
        except (FileNotFoundError, json.JSONDecodeError, OSError):
            return {}

    def get_company_name(self):
        """Get company name from report or data packet."""
        # Check report-level companyName first
        name = self.report.get('companyName', '')
        if name:
            return name
        # Check data packet
        name = self.data_packet.get('companyInfo', {}).get('name', '')
        if name:
            return name
        # Fallback to ticker
        return self.ticker

    def get_overall_verdict(self):
        """
        Get the overall verdict string.

        One Pager: report['overallVerdict'] (top-level string like 'PASS')
        Pitch Deck: report['overallVerdict'] (top-level) or sections['overall_verdict'].data.overallVerdict
        Full Story: sections['overall_verdict'].data.overallVerdict or report-level
        """
        # Top-level overallVerdict (works for One Pager and Pitch Deck)
        verdict = self.report.get('overallVerdict', '')
        if verdict:
            return verdict

        # Check overall_verdict section
        ov_section = self.sections.get('overall_verdict', {})
        data = ov_section.get('data', {})
        if isinstance(data, dict):
            verdict = data.get('overallVerdict', '')
            if verdict:
                return verdict

        # Check section verdict
        verdict = ov_section.get('verdict', '')
        if verdict:
            return verdict

        return ''

    def get_section_keys(self):
        """
        Get ordered list of section keys.

        One Pager: report['sectionKeys'] (preserved order)
        Pitch Deck/Full Story: [s['key'] for s in report['sections']]
        """
        # One Pager has explicit sectionKeys
        keys = self.report.get('sectionKeys', [])
        if keys:
            # Filter out reader sections
            return [k for k in keys if 'reader' not in k]

        # Build from sections list
        raw_sections = self.report.get('sections', [])
        if isinstance(raw_sections, list):
            return [s.get('key', '') for s in raw_sections if 'reader' not in s.get('key', '')]

        return list(self.sections.keys())

    def get_section(self, key):
        """Return section dict by key, or empty dict."""
        return self.sections.get(key, {})

    def get_financial_years(self, n=5):
        """Get the most recent n financial years from data packet (ascending order)."""
        years = self.data_packet.get('financials', {}).get('years', [])
        if not years:
            return []
        # Years may be in descending order (2025, 2024, ...) — sort ascending, take last n
        sorted_years = sorted(years)
        return sorted_years[-n:]

    def get_financial_data(self, statement, field, years=None):
        """
        Pull specific field values from data packet financials.

        Args:
            statement: 'income' | 'balance' | 'cashFlow'
            field: Field name (e.g., 'revenues', 'net_income_loss')
            years: Optional list of years to filter; defaults to all available

        Returns:
            List of (year, value) tuples, sorted by year
        """
        fin = self.data_packet.get('financials', {})
        stmt_data = fin.get(statement, {})
        if not stmt_data:
            return []

        if years is None:
            years = sorted(stmt_data.keys(), key=lambda y: int(y))

        result = []
        for y in years:
            y_str = str(y)
            year_data = stmt_data.get(y_str, {})
            value = year_data.get(field)
            if value is not None:
                result.append((int(y_str), value))
        return result

    def get_debate_outputs(self):
        """Full Story only: return debate outputs dict (bull, bear, bull_rebuttal, judge)."""
        return self.report.get('debateOutputs', {})

    def get_scores(self):
        """Get Rule One scores and metrics from data packet."""
        return {
            'ruleOneScore': self.data_packet.get('ruleOneScore', {}),
            'growthRates': self.data_packet.get('growthRates', {}),
            'returnMetrics': self.data_packet.get('returnMetrics', {}),
            'debtMetrics': self.data_packet.get('debtMetrics', {}),
            'fcf': self.data_packet.get('fcf', {}),
            'keyMetrics': self.data_packet.get('keyMetrics', {}),
        }

    def get_buy_prices(self):
        """
        Get buy prices from the valuation section data.

        Returns dict with mosBuyPrice, pbtBuyPrice, tenCapPrice, equityBondBuyPrice,
        currentPrice, and buyPriceRange.
        """
        val_section = self.sections.get('valuation', self.sections.get('valuation_confirmation', {}))
        data = val_section.get('data', {})
        if not isinstance(data, dict):
            data = {}

        current_price = self.data_packet.get('currentPrice', {}).get('price', 0)

        return {
            'mosBuyPrice': data.get('mosBuyPrice'),
            'pbtBuyPrice': data.get('pbtBuyPrice'),
            'tenCapPrice': data.get('tenCapPrice'),
            'equityBondBuyPrice': data.get('equityBondBuyPrice'),
            'currentPrice': current_price,
            'buyPriceRange': data.get('buyPriceRange', {}),
        }

    def get_current_price(self):
        """Get the current stock price from data packet."""
        return self.data_packet.get('currentPrice', {}).get('price', 0)

    def get_company_info(self):
        """Get company info dict from data packet."""
        return self.data_packet.get('companyInfo', {})

    def get_synthesis_narrative(self):
        """Get the synthesis narrative (Pitch Deck top-level field)."""
        return self.report.get('synthesisNarrative', '')

    def get_fgr_derivation(self):
        """Get FGR derivation data (Pitch Deck)."""
        return self.report.get('fgrDerivation', {})
