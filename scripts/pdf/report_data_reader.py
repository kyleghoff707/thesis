#!/usr/bin/env python3
"""
Unified Report Data Reader
Normalizes access to pipeline output across all 3 stages (One Pager, Pitch Deck, Full Story).
Each stage writes to a different JSON filename with slightly different top-level structures.
This class provides a consistent API for all PDF and Word generators.
"""

import os
import json


class ReportData:
    """Unified access to pipeline output data for any stage."""

    STAGE_FILES = {
        'one-pager': 'one-pager.json',
        'pitch-deck': 'pipeline-output.json',
        'full-story': 'full-story-api.json',
    }

    def __init__(self, ticker, stage):
        """
        ticker: Stock ticker (e.g., 'MNST')
        stage: 'one-pager' | 'pitch-deck' | 'full-story'
        Loads the appropriate JSON files from .thes1s/reports/{ticker}/
        """
        self.ticker = ticker
        self.stage = stage
        self._base_dir = self._find_base_dir()
        self.report = self._load_report()
        self.data_packet = self._load_data_packet()
        self.sections = {s['key']: s for s in self.report.get('sections', [])}

    def _find_base_dir(self):
        """Find the .thes1s/reports/{ticker} directory."""
        # Try relative to script location first (scripts/pdf/ -> project root)
        script_dir = os.path.dirname(os.path.abspath(__file__))
        proj_root = os.path.join(script_dir, '..', '..')
        base = os.path.join(proj_root, '.thes1s', 'reports', self.ticker)
        if os.path.isdir(base):
            return base
        # Try cwd
        base2 = os.path.join('.thes1s', 'reports', self.ticker)
        if os.path.isdir(base2):
            return base2
        raise FileNotFoundError(
            f'Report directory not found for {self.ticker}. '
            f'Looked at: {os.path.abspath(base)}'
        )

    def _load_report(self):
        """Load the stage-specific JSON report file."""
        filename = self.STAGE_FILES.get(self.stage)
        if not filename:
            raise ValueError(f'Unknown stage: {self.stage}')
        path = os.path.join(self._base_dir, filename)
        if not os.path.isfile(path):
            # Fallback: try pitch-deck.json for pitch-deck stage
            if self.stage == 'pitch-deck':
                alt = os.path.join(self._base_dir, 'pitch-deck.json')
                if os.path.isfile(alt):
                    path = alt
                else:
                    raise FileNotFoundError(f'Report file not found: {path}')
            else:
                raise FileNotFoundError(f'Report file not found: {path}')
        with open(path) as f:
            return json.load(f)

    def _load_data_packet(self):
        """Load the data-packet.json (shared across all stages)."""
        path = os.path.join(self._base_dir, 'data-packet.json')
        if not os.path.isfile(path):
            return {}  # DataPacket is optional for rendering
        with open(path) as f:
            return json.load(f)

    def get_company_name(self):
        """Get company name from report or DataPacket."""
        return (
            self.report.get('companyName')
            or self.data_packet.get('companyInfo', {}).get('name', '')
            or self.ticker
        )

    def get_overall_verdict(self):
        """Normalize overall verdict across stage formats.
        One Pager: top-level overallVerdict
        Pitch Deck / Full Story: inside overall_verdict section data
        """
        # Try top-level first (One Pager format)
        if 'overallVerdict' in self.report:
            return self.report['overallVerdict']
        # Try overall_verdict section data (PD/FS format)
        ov = self.sections.get('overall_verdict', {})
        data = ov.get('data', {})
        if isinstance(data, dict):
            v = data.get('overallVerdict')
            if v:
                return v
        # Fallback: use verdict from overall_verdict section
        v = ov.get('verdict', '')
        if v:
            return v
        return 'N/A'

    def get_section_keys(self):
        """Ordered list of section keys for this stage."""
        if 'sectionKeys' in self.report:
            return self.report['sectionKeys']
        return [s['key'] for s in self.report.get('sections', [])]

    def get_section(self, key):
        """Get a section by key, or None if not found."""
        return self.sections.get(key)

    def get_financial_years(self, n=5):
        """Get the last N fiscal years from the data packet."""
        years = self.data_packet.get('financials', {}).get('years', [])
        return years[:n]  # years are already sorted newest-first

    def get_financial_data(self, statement, field, years=None):
        """Get financial data for a field across years.
        Returns: list of (year, value) tuples, oldest first.
        """
        if years is None:
            years = self.get_financial_years(5)
        result = []
        stmt = self.data_packet.get('financials', {}).get(statement, {})
        for yr in reversed(years):  # oldest first for charts
            yr_data = stmt.get(str(yr), {})
            val = yr_data.get(field)
            if val is not None:
                result.append((yr, val))
        return result

    def get_debate_outputs(self):
        """Full Story only -- returns debateOutputs dict."""
        return self.report.get('debateOutputs', {})

    def get_scores(self):
        """Get Rule One scores from DataPacket."""
        return self.data_packet.get('ruleOneScore', {})

    def get_buy_prices(self):
        """Get buy price data from valuation_summary section.
        Returns dict with method names -> {low, high} or value.
        """
        vs = self.sections.get('valuation_summary', {})
        data = vs.get('data', {})
        if not isinstance(data, dict):
            return {}

        result = {}
        mos = data.get('mosBuyPrice', {})
        if isinstance(mos, dict) and ('low' in mos or 'high' in mos):
            result['MOS'] = mos

        pbt = data.get('pbtBuyPrice', {})
        if isinstance(pbt, dict) and ('low' in pbt or 'high' in pbt):
            result['PBT'] = pbt

        tc = data.get('tenCapPrice', {})
        if isinstance(tc, dict):
            result['Ten Cap'] = tc

        eb = data.get('equityBondBuyPrice', {})
        if isinstance(eb, dict) and ('low' in eb or 'high' in eb):
            result['Equity Bond'] = eb

        return result
