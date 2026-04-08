// Key Metrics — 61 derived metrics matching Rule One Toolbox Key Metrics export
// Computed from EDGAR financial statement data (edgarFinancials.js output).
//
// Categories: Per Share (15), Shares (3), Liquidity (5), Profitability (10),
//             Debt Ratios (8), Operating (12), Price (8)

// ─── Helpers ─────────────────────────────────────────────────

function pctChange(current, previous) {
  if (current == null || previous == null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function safeDiv(numerator, denominator) {
  if (numerator == null || denominator == null || denominator === 0) return null;
  return numerator / denominator;
}

// ─── Main Computation ────────────────────────────────────────

// Compute all key metrics for every year in the dataset.
// Input: { years, income, balance, cashFlow } from fetchEdgarStatements()
// Optional: latestPrice (current stock price for Price metrics)
// Returns: { years: [...], metrics: { [year]: { category: { metric: value } } } }
export function computeKeyMetrics(edgarData, latestPrice = null) {
  if (!edgarData) return null;
  const { years, income, balance, cashFlow } = edgarData;
  if (!years || years.length === 0) return null;

  const sortedYears = [...years].sort((a, b) => a - b);
  const metrics = {};

  for (let i = 0; i < sortedYears.length; i++) {
    const year = sortedYears[i];
    const prevYear = i > 0 ? sortedYears[i - 1] : null;

    const inc = income[year] || {};
    const bal = balance[year] || {};
    const cf = cashFlow[year] || {};
    const prevInc = prevYear ? (income[prevYear] || {}) : {};
    const prevBal = prevYear ? (balance[prevYear] || {}) : {};
    const prevCf = prevYear ? (cashFlow[prevYear] || {}) : {};

    // Common values
    const netIncome = inc.net_income_loss;
    const revenue = inc.revenues;
    const grossProfit = inc.gross_profit;
    const operatingIncome = inc.operating_income_loss;
    const preTaxIncome = inc.income_before_tax;
    const ebit = inc.ebit;
    const ebitda = inc.ebitda;
    const opCF = cf.net_cash_flow_from_operating_activities;
    const capEx = cf.capital_expenditures;
    const fcf = cf.free_cash_flow;
    const totalAssets = bal.assets;
    const currentAssets = bal.current_assets;
    const currentLiabilities = bal.current_liabilities;
    const equity = bal.equity_attributable_to_parent ?? bal.equity;
    const ltDebt = bal.long_term_debt ?? 0;
    const totalDebt = bal.total_debt ?? 0;
    const netDebt = bal.net_debt;
    const cash = bal.cash_and_marketable_securities ?? bal.cash ?? 0;
    const inventory = bal.inventory ?? 0;
    const tradeReceivables = bal.accounts_receivable ?? 0; // narrow trade receivables — for turnover ratios
    const payables = bal.accounts_payable ?? 0;
    const ppe = bal.property_plant_equipment ?? 0;
    const sharesBasicW = inc.basic_average_shares;
    const sharesDilutedW = inc.diluted_average_shares;
    const sharesEOP = bal.shares_outstanding;
    const dps = inc.dividends_per_share ?? cf.dividends_per_share ?? 0;
    const interestExpense = inc.interest_expense;

    // Per Share
    const bvps = safeDiv(equity, sharesEOP ?? sharesDilutedW);
    const prevBVPS = safeDiv(
      prevBal.equity_attributable_to_parent ?? prevBal.equity,
      prevBal.shares_outstanding ?? prevInc.diluted_average_shares
    );
    const epsBasic = inc.basic_earnings_per_share;
    const epsDiluted = inc.diluted_earnings_per_share;
    const prevEpsBasic = prevInc.basic_earnings_per_share;
    const prevEpsDiluted = prevInc.diluted_earnings_per_share;
    const opCFPerShare = safeDiv(opCF, sharesDilutedW ?? sharesEOP);
    const prevOpCFPerShare = safeDiv(
      prevCf.net_cash_flow_from_operating_activities,
      prevInc.diluted_average_shares ?? prevBal.shares_outstanding
    );
    const salesPerShare = safeDiv(revenue, sharesDilutedW ?? sharesEOP);
    const prevSalesPerShare = safeDiv(
      prevInc.revenues,
      prevInc.diluted_average_shares ?? prevBal.shares_outstanding
    );
    const buybacksTotal = cf.share_repurchases ? Math.abs(cf.share_repurchases) : 0;
    const buybacksPerShare = safeDiv(buybacksTotal, sharesDilutedW ?? sharesEOP);
    const prevBuybacksPerShare = safeDiv(
      prevCf.share_repurchases ? Math.abs(prevCf.share_repurchases) : 0,
      prevInc.diluted_average_shares ?? prevBal.shares_outstanding
    );

    // Payout Ratio (null when EPS <= 0 — negative payout ratio is meaningless)
    const payoutRatio = epsDiluted != null && epsDiluted > 0 ? safeDiv(dps, epsDiluted) : null;

    // Profitability
    const grossMargin = safeDiv(grossProfit, revenue);
    const ebitMargin = safeDiv(ebit, revenue);
    const ebitdaMargin = safeDiv(ebitda, revenue);
    const operatingMargin = safeDiv(operatingIncome, revenue);
    const profitMarginCont = safeDiv(netIncome, revenue);
    const roe = safeDiv(netIncome, equity);
    const roa = safeDiv(netIncome, totalAssets);
    const investedCapital = (equity ?? 0) + ltDebt;
    const roic = investedCapital !== 0 ? safeDiv(netIncome, investedCapital) : null;
    const totalCapital = (equity ?? 0) + totalDebt;
    const roc = totalCapital !== 0 ? safeDiv(preTaxIncome, totalCapital) : null;

    // Liquidity
    const quickAssets = (bal.cash ?? 0) + (bal.short_term_investments ?? 0) + tradeReceivables;
    const quickRatio = safeDiv(quickAssets, currentLiabilities);
    const cashRatio = safeDiv(cash, currentLiabilities);
    const currentRatio = safeDiv(currentAssets, currentLiabilities);
    const tie = safeDiv(operatingIncome, interestExpense);
    const workingCapital = (currentAssets != null && currentLiabilities != null)
      ? currentAssets - currentLiabilities : null;

    // Debt Ratios
    const netDebtVal = netDebt ?? 0;
    const netDebtToEarnings = netDebtVal <= 0 ? 0 : safeDiv(netDebtVal, netIncome);
    const netDebtToFCF = netDebtVal <= 0 ? 0 : safeDiv(netDebtVal, fcf);
    const netDebtToEquity = safeDiv(Math.max(netDebtVal, 0), equity);
    const ltDebtToEarnings = safeDiv(ltDebt, netIncome);
    const ltDebtToFCF = safeDiv(ltDebt, fcf);
    const ltDebtToEquity = safeDiv(ltDebt, equity);
    const ltDebtPlusEquity = (equity ?? 0) + ltDebt;
    const debtToTotalCapital = ltDebtPlusEquity > 0 ? safeDiv(ltDebt, ltDebtPlusEquity) : null;
    const ebitdaInterestCoverage = safeDiv(ebitda, interestExpense);

    // Operating
    const assetTurnover = safeDiv(revenue, totalAssets);
    const fixedAssetTurnover = safeDiv(revenue, ppe);
    const receivableTurnover = safeDiv(revenue, tradeReceivables);
    const inventoryTurnover = safeDiv(inc.cost_of_revenue, inventory);
    const payableTurnover = safeDiv(inc.cost_of_revenue, payables);
    const daysReceivables = receivableTurnover ? 365 / receivableTurnover : null;
    const daysInventory = inventoryTurnover ? 365 / inventoryTurnover : null;
    const daysPayable = payableTurnover ? 365 / payableTurnover : null;
    const cashConversionCycle = (daysReceivables != null && daysInventory != null && daysPayable != null)
      ? daysReceivables + daysInventory - daysPayable : null;
    const fcfRatio = safeDiv(fcf, netIncome);
    const fcfSalesRatio = safeDiv(fcf, revenue);
    const opCFToNetIncome = safeDiv(opCF, netIncome);

    // Price (only for latest year if price provided)
    const isLatest = (year === sortedYears[sortedYears.length - 1]);
    const price = isLatest ? latestPrice : null;
    const dividendYield = price ? safeDiv(dps, price) * 100 : null;
    const peRatio = price && epsDiluted && epsDiluted > 0 ? price / epsDiluted : null;
    const priceToSales = price ? safeDiv(price, salesPerShare) : null;
    const priceToBook = price && bvps && bvps > 0 ? price / bvps : null;
    const priceToCF = price && opCFPerShare && opCFPerShare > 0 ? price / opCFPerShare : null;
    const fcfPerShare = safeDiv(fcf, sharesDilutedW ?? sharesEOP);
    const priceToFCF = price && fcfPerShare && fcfPerShare > 0 ? price / fcfPerShare : null;
    const pegRatio = peRatio && epsBasic && prevEpsBasic && prevEpsBasic > 0
      ? safeDiv(peRatio, pctChange(epsBasic, prevEpsBasic)) : null;
    const dividendsPaidTotal = cf.dividends_paid ? Math.abs(cf.dividends_paid) : 0;
    const marketCap = price && sharesEOP ? price * sharesEOP : null;
    const shareholderYield = marketCap
      ? ((dividendsPaidTotal + buybacksTotal) / marketCap) * 100 : null;

    metrics[year] = {
      perShare: {
        bookValuePerShare: bvps,
        bookValuePerShareChange: pctChange(bvps, prevBVPS),
        basicEPS: epsBasic,
        basicEPSChange: pctChange(epsBasic, prevEpsBasic),
        dilutedEPS: epsDiluted,
        dilutedEPSChange: pctChange(epsDiluted, prevEpsDiluted),
        operatingCFPerShare: opCFPerShare,
        operatingCFPerShareChange: pctChange(opCFPerShare, prevOpCFPerShare),
        salesPerShare,
        salesPerShareChange: pctChange(salesPerShare, prevSalesPerShare),
        dividendPerShare: dps,
        dividendPerShareChange: pctChange(dps, prevInc.dividends_per_share ?? (prevCf.dividends_per_share ?? 0)),
        buybacksPerShare,
        buybacksPerShareChange: pctChange(buybacksPerShare, prevBuybacksPerShare),
        payoutRatio,
      },
      shares: {
        commonSharesOutstanding: sharesEOP,
        basicWeightedAvgShares: sharesBasicW,
        dilutedWeightedAvgShares: sharesDilutedW,
      },
      liquidity: {
        quickRatio,
        cashRatio,
        currentRatio,
        timesInterestEarned: tie,
        workingCapital,
      },
      profitability: {
        grossMargin: grossMargin != null ? grossMargin * 100 : null,
        ebitMargin: ebitMargin != null ? ebitMargin * 100 : null,
        ebitdaMargin: ebitdaMargin != null ? ebitdaMargin * 100 : null,
        operatingMargin: operatingMargin != null ? operatingMargin * 100 : null,
        profitMarginContinuing: profitMarginCont != null ? profitMarginCont * 100 : null,
        profitMarginTotal: profitMarginCont != null ? profitMarginCont * 100 : null,
        roe: roe != null ? roe * 100 : null,
        roic: roic != null ? roic * 100 : null,
        returnOnCapital: roc != null ? roc * 100 : null,
        roa: roa != null ? roa * 100 : null,
      },
      debtRatios: {
        netDebtToEarnings,
        netDebtToFCF,
        netDebtToEquity: netDebtToEquity != null ? netDebtToEquity : null,
        ltDebtToEarnings,
        ltDebtToFCF,
        ltDebtToEquity,
        debtToTotalCapital,
        ebitdaInterestCoverage,
      },
      operating: {
        assetTurnover,
        fixedAssetTurnover,
        receivableTurnover,
        inventoryTurnover,
        payableTurnover,
        daysInReceivables: daysReceivables,
        daysInInventory: daysInventory,
        daysInPayment: daysPayable,
        cashConversionCycle,
        fcfRatio,
        fcfSalesRatio,
        opCFToNetIncome,
      },
      price: {
        dividendYield,
        peRatio,
        pegRatio,
        priceToSales,
        priceToBook,
        priceToCashFlow: priceToCF,
        priceToFCF,
        shareholderYield,
      },
    };
  }

  return {
    years: [...years].sort((a, b) => b - a), // descending for display
    metrics,
  };
}

// ─── Row Definitions for UI ──────────────────────────────────
// Matches Rule One Toolbox Key Metrics CSV structure exactly

export const KEY_METRICS_ROWS = {
  perShare: {
    label: 'Per Share',
    rows: [
      { key: 'bookValuePerShare', label: 'Book Value per Share', format: 'dollar' },
      { key: 'bookValuePerShareChange', label: 'Book Value Per Share Change', format: 'pct' },
      { key: 'basicEPS', label: 'Basic Earnings per Share', format: 'dollar' },
      { key: 'basicEPSChange', label: 'Basic Earnings per Share Change', format: 'pct' },
      { key: 'dilutedEPS', label: 'Diluted Earnings per Share', format: 'dollar' },
      { key: 'dilutedEPSChange', label: 'Diluted Earnings per Share Change', format: 'pct' },
      { key: 'operatingCFPerShare', label: 'Operating Cash Flow per Share', format: 'dollar' },
      { key: 'operatingCFPerShareChange', label: 'Operating Cash Flow per Share Change', format: 'pct' },
      { key: 'salesPerShare', label: 'Sales per Share', format: 'dollar' },
      { key: 'salesPerShareChange', label: 'Sales per Share Change', format: 'pct' },
      { key: 'dividendPerShare', label: 'Dividend per Share', format: 'dollar' },
      { key: 'dividendPerShareChange', label: 'Dividend per Share Change', format: 'pct' },
      { key: 'buybacksPerShare', label: 'Buybacks per Share', format: 'dollar' },
      { key: 'buybacksPerShareChange', label: 'Buybacks per Share Change', format: 'pct' },
      { key: 'payoutRatio', label: 'Payout Ratio', format: 'ratio' },
    ],
  },
  shares: {
    label: 'Shares',
    rows: [
      { key: 'commonSharesOutstanding', label: 'Common Shares Outstanding (EOP)', format: 'shares' },
      { key: 'basicWeightedAvgShares', label: 'Basic Weighted Average Shares', format: 'shares' },
      { key: 'dilutedWeightedAvgShares', label: 'Diluted Weighted Average Shares', format: 'shares' },
    ],
  },
  liquidity: {
    label: 'Liquidity',
    rows: [
      { key: 'quickRatio', label: 'Quick Ratio', format: 'ratio' },
      { key: 'cashRatio', label: 'Cash Ratio', format: 'ratio' },
      { key: 'currentRatio', label: 'Current Ratio', format: 'ratio' },
      { key: 'timesInterestEarned', label: 'Times Interest Earned (TIE) Ratio', format: 'ratio' },
      { key: 'workingCapital', label: 'Working Capital', format: 'dollar' },
    ],
  },
  profitability: {
    label: 'Profitability',
    rows: [
      { key: 'grossMargin', label: 'Gross Margin', format: 'pct' },
      { key: 'ebitMargin', label: 'EBIT Margin', format: 'pct' },
      { key: 'ebitdaMargin', label: 'EBITDA Margin', format: 'pct' },
      { key: 'operatingMargin', label: 'Operating Profit Margin', format: 'pct' },
      { key: 'profitMarginContinuing', label: 'Profit Margin (Cont OP)', format: 'pct' },
      { key: 'profitMarginTotal', label: 'Profit Margin (Total OP)', format: 'pct' },
      { key: 'roe', label: 'Return on Equity', format: 'pct' },
      { key: 'roic', label: 'Return on Invested Capital', format: 'pct' },
      { key: 'returnOnCapital', label: 'Return on Capital', format: 'pct' },
      { key: 'roa', label: 'Return on Assets', format: 'pct' },
    ],
  },
  debtRatios: {
    label: 'Debt Ratios',
    rows: [
      { key: 'netDebtToEarnings', label: 'Net Debt to Earnings', format: 'ratio' },
      { key: 'netDebtToFCF', label: 'Net Debt to FCF', format: 'ratio' },
      { key: 'netDebtToEquity', label: 'Net Debt to Equity', format: 'ratio' },
      { key: 'ltDebtToEarnings', label: 'Long-term Debt to Earnings', format: 'ratio' },
      { key: 'ltDebtToFCF', label: 'Long-term Debt to FCF', format: 'ratio' },
      { key: 'ltDebtToEquity', label: 'Long-term Debt to Equity', format: 'ratio' },
      { key: 'debtToTotalCapital', label: 'Debt to Total Capital', format: 'ratio' },
      { key: 'ebitdaInterestCoverage', label: 'EBITDA Interest Coverage', format: 'ratio' },
    ],
  },
  operating: {
    label: 'Operating',
    rows: [
      { key: 'assetTurnover', label: 'Asset Turnover', format: 'ratio' },
      { key: 'fixedAssetTurnover', label: 'Fixed Assets Turnover', format: 'ratio' },
      { key: 'receivableTurnover', label: 'Receivable Turnover', format: 'ratio' },
      { key: 'inventoryTurnover', label: 'Inventory Turnover', format: 'ratio' },
      { key: 'payableTurnover', label: 'Payable Turnover', format: 'ratio' },
      { key: 'daysInReceivables', label: 'Days In Receivables', format: 'days' },
      { key: 'daysInInventory', label: 'Days In Inventory', format: 'days' },
      { key: 'daysInPayment', label: 'Days In Payment', format: 'days' },
      { key: 'cashConversionCycle', label: 'Cash Conversion Cycle', format: 'days' },
      { key: 'fcfRatio', label: 'Free Cash Flow Ratio', format: 'ratio' },
      { key: 'fcfSalesRatio', label: 'FCF Sales Ratio', format: 'ratio' },
      { key: 'opCFToNetIncome', label: 'Operating CF to Net Income', format: 'ratio' },
    ],
  },
  price: {
    label: 'Price',
    rows: [
      { key: 'dividendYield', label: 'Dividend Yield', format: 'pct' },
      { key: 'peRatio', label: 'Price to Earnings Ratio', format: 'ratio' },
      { key: 'pegRatio', label: 'PEG Ratio', format: 'ratio' },
      { key: 'priceToSales', label: 'Price to Sales', format: 'ratio' },
      { key: 'priceToBook', label: 'Price to Book', format: 'ratio' },
      { key: 'priceToCashFlow', label: 'Price to Cash Flow', format: 'ratio' },
      { key: 'priceToFCF', label: 'Price to Free Cash', format: 'ratio' },
      { key: 'shareholderYield', label: 'Shareholder Yield', format: 'pct' },
    ],
  },
};
