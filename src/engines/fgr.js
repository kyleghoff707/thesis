// FGR (Future Growth Rate) — NOT a formula, an informed assessment
// 5 inputs averaged to derive a conservative growth estimate
// Feeds all 4 valuation calculators

// FGR input structure
export function createFGR() {
  return {
    rearViewMirror: {
      value: null,      // percentage as decimal (0.15 = 15%)
      source: '',       // e.g., "value investing Toolbox composite: BVPS+Div 18%, EPS 22%, OpCash 20%, Rev 23%"
      notes: '',
    },
    marketRelativity: {
      value: null,      // qualitative — above/below/inline with S&P 500
      source: '',       // e.g., "10K cumulative stockholder return chart"
      notes: '',
    },
    companyGuidance: {
      value: null,
      source: '',       // e.g., "Power of Three strategy = 15% revenue growth target"
      notes: '',
    },
    sectorIndustry: {
      value: null,
      source: '',       // e.g., "Grand View Research: activewear CAGR 9.82%"
      notes: '',
    },
    analysts: {
      value: null,
      source: '',       // e.g., "SA quant 4.2, Wall St consensus 18% revenue growth"
      notes: '',
    },
  };
}

// Compute FGR from filled inputs
// Only averages inputs that have numeric values
export function computeFGR(fgrInputs) {
  const inputs = [
    fgrInputs.rearViewMirror,
    fgrInputs.companyGuidance,
    fgrInputs.sectorIndustry,
    fgrInputs.analysts,
  ];
  // marketRelativity is qualitative — included in notes but not averaged numerically

  const values = inputs
    .map(i => i?.value)
    .filter(v => v != null && typeof v === 'number');

  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// Rule of 72 — how many years to double at a given growth rate
export function ruleOf72(rate) {
  if (!rate || rate <= 0) return null;
  return 72 / (rate * 100);
}

// Summary object for display
export function fgrSummary(fgrInputs) {
  const fgr = computeFGR(fgrInputs);
  return {
    fgr,
    fgrPercent: fgr != null ? (fgr * 100).toFixed(1) + '%' : null,
    yearsToDouble: ruleOf72(fgr),
    inputs: {
      rearViewMirror: fgrInputs.rearViewMirror?.value,
      marketRelativity: fgrInputs.marketRelativity?.value,
      companyGuidance: fgrInputs.companyGuidance?.value,
      sectorIndustry: fgrInputs.sectorIndustry?.value,
      analysts: fgrInputs.analysts?.value,
    },
  };
}
