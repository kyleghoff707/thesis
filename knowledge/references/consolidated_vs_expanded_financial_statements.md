
# Morningstar Financial Statements: Consolidated vs Expanded

## Overview

Morningstar provides two different structural views of financial statements:

1. **Consolidated Financial Statements**
2. **Expanded Financial Statements**

These views do **not represent different data sources**.  
Instead, they represent **different levels of detail** in how the same financial data is presented.

Understanding the difference is important when designing a financial data engine or financial statement UI similar to Morningstar.

---

# 1. Consolidated Financial Statements

## Definition

**Consolidated financial statements present a summarized version of a company’s financials**, combining multiple detailed line items into broader categories.

They provide the **high‑level picture** of a company’s financial performance and position.

This is the format most commonly used by:

- Investment platforms
- Stock screeners
- Financial dashboards
- Analyst summaries

---

## Example: Consolidated Income Statement

A consolidated statement might look like:

| Item | Amount |
|-----|------|
| Revenue | $100B |
| Cost of Revenue | $60B |
| Gross Profit | $40B |
| Operating Expenses | $20B |
| Operating Income | $20B |
| Net Income | $15B |

Many detailed sub‑components are grouped together.

For example:

```
Operating Expenses =
    SG&A
    R&D
    Marketing
    Administrative expenses
```

---

## Advantages

### 1. Easier to read

The structure is simpler and easier for investors to interpret quickly.

### 2. Better for high‑level analysis

Most financial ratios only require consolidated values:

- Gross margin
- Operating margin
- Net margin
- ROE
- ROIC

### 3. Faster UI display

Applications like dashboards or screeners benefit from fewer line items.

---

## Limitations

Consolidated statements hide important details.

Example:

```
Operating Expenses = $20B
```

But we don't know:

- how much was **R&D**
- how much was **SG&A**
- how much was **marketing spend**

For deeper analysis, analysts need expanded statements.

---

# 2. Expanded Financial Statements

## Definition

**Expanded financial statements break down each consolidated line item into its underlying components.**

They show **all available sub‑line items reported by the company**.

This version is used for **deep financial analysis**.

---

## Example: Expanded Income Statement

| Item | Amount |
|-----|------|
| Revenue | $100B |
| Cost of Revenue | $60B |
| Gross Profit | $40B |
| SG&A | $10B |
| Research & Development | $8B |
| Other Operating Expenses | $2B |
| Total Operating Expenses | $20B |
| Operating Income | $20B |
| Interest Expense | $2B |
| Pretax Income | $18B |
| Tax Expense | $3B |
| Net Income | $15B |

Here we see the **true structure of the operating costs**.

---

## Advantages

### 1. Deeper financial insight

Expanded statements reveal the **drivers behind financial performance**.

Example:

```
R&D spending trends
Sales & marketing intensity
Administrative overhead
```

---

### 2. Industry analysis

Different industries prioritize different expenses.

Examples:

Tech companies:
- High **R&D**

Retail:
- High **SG&A**

Manufacturing:
- High **COGS**

Expanded statements allow better comparison.

---

### 3. Better modeling

Financial models often require detailed inputs:

Example:

```
Operating margin forecast
R&D % of revenue
SG&A growth
```

These require expanded financial statements.

---

# 3. Example: Balance Sheet Comparison

## Consolidated Balance Sheet

| Item | Amount |
|-----|------|
| Total Assets | $200B |
| Total Liabilities | $120B |
| Total Equity | $80B |

---

## Expanded Balance Sheet

| Item | Amount |
|-----|------|
| Cash | $40B |
| Short-Term Investments | $20B |
| Accounts Receivable | $15B |
| Inventory | $10B |
| Property Plant & Equipment | $60B |
| Goodwill | $30B |
| Intangible Assets | $25B |
| Total Assets | $200B |
| Current Liabilities | $50B |
| Long-Term Debt | $40B |
| Other Liabilities | $30B |
| Total Liabilities | $120B |
| Shareholders Equity | $80B |

Expanded view provides **asset composition insight**.

---

# 4. Why Morningstar Provides Both

Morningstar supports **two analytical workflows**.

### Consolidated View

Best for:

- quick investment screening
- high‑level analysis
- dashboards
- financial ratio calculations

---

### Expanded View

Best for:

- forensic accounting
- deep company analysis
- financial modeling
- competitive benchmarking

---

# 5. Relationship to EDGAR XBRL Data

EDGAR filings naturally resemble **expanded statements**.

Companies report many individual line items such as:

```
SellingGeneralAndAdministrativeExpense
ResearchAndDevelopmentExpense
MarketingExpense
```

Financial data providers then **aggregate these into consolidated views**.

Example:

```
Operating Expenses =
    SG&A
    R&D
    Marketing
    Other operating expenses
```

Therefore:

```
EDGAR data → Expanded financials
Consolidated financials → Derived aggregation
```

---

# 6. Implications for a Financial Data Engine

If building a Morningstar‑style financial statement system, the best architecture is:

```
EDGAR XBRL
      ↓
Expanded financial data model
      ↓
Consolidated aggregation layer
      ↓
UI rendering
```

This ensures:

- Maximum data fidelity
- Flexible financial statement presentation
- Future expansion capability

---

# 7. Recommended Internal Financial Schema

Example structure:

```javascript
financials = {

 incomeStatement: {

   revenue,

   costOfRevenue,

   grossProfit,

   operatingExpenses: {
        sga,
        rAndD,
        marketing,
        otherOperating
   },

   operatingIncome,

   interestExpense,

   pretaxIncome,

   taxExpense,

   netIncome

 },

 balanceSheet: {
   cash,
   receivables,
   inventory,
   ppe,
   goodwill,
   intangibles,
   totalAssets,
   debt,
   totalLiabilities,
   equity
 },

 cashFlow: {
   operatingCashFlow,
   capex,
   freeCashFlow,
   dividends,
   shareRepurchases
 }

}
```

Expanded view would show **all components**.

Consolidated view would **collapse groups**.

---

# 8. UI Design Pattern (Recommended)

Your financial statement UI could allow:

```
Consolidated | Expanded
```

Example:

### Consolidated Mode

```
Revenue
Cost of Revenue
Gross Profit
Operating Expenses
Operating Income
Net Income
```

---

### Expanded Mode

```
Revenue
Cost of Revenue
Gross Profit
SG&A
R&D
Marketing
Other Operating Expenses
Operating Income
Interest Expense
Pretax Income
Taxes
Net Income
```

---

# Summary

| Feature | Consolidated | Expanded |
|------|------|------|
| Detail level | Low | High |
| Purpose | Quick analysis | Deep analysis |
| Line items | Aggregated | Full breakdown |
| Source | Derived | Raw EDGAR |
| UI complexity | Simple | Complex |

---

**Key takeaway:**

Expanded statements represent the **true raw financial data**, while consolidated statements provide **simplified summaries for quick analysis**.

A well-designed financial data engine should **store expanded financial data internally and generate consolidated views dynamically.**
