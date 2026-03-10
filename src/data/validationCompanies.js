// Curated company test list for EDGAR validation.
// ~90 companies, no financials (banks/insurance skipped).
// Each entry: { ticker, name, categories[], fyEnd, notes }

const VALIDATION_COMPANIES = [
  // ─── User's own research companies ─────────────────────────
  { ticker: 'SFM', name: 'Sprouts Farmers Market', categories: ['user', 'retail', 'non-calendar-fy'], fyEnd: 'Jan', notes: 'Already validated vs Toolbox' },
  { ticker: 'LULU', name: 'Lululemon Athletica', categories: ['user', 'retail', 'non-calendar-fy'], fyEnd: 'Jan', notes: 'LULU example in knowledge/' },
  { ticker: 'CELH', name: 'Celsius Holdings', categories: ['user', 'consumer'], fyEnd: 'Dec', notes: '' },
  { ticker: 'EW', name: 'Edwards Lifesciences', categories: ['user', 'healthcare'], fyEnd: 'Dec', notes: 'EW example in knowledge/' },
  { ticker: 'TPL', name: 'Texas Pacific Land', categories: ['user', 'energy'], fyEnd: 'Dec', notes: '' },
  { ticker: 'AMAT', name: 'Applied Materials', categories: ['user', 'semis', 'non-calendar-fy'], fyEnd: 'Oct', notes: 'Score validated (92)' },
  { ticker: 'MNST', name: 'Monster Beverage', categories: ['user', 'consumer'], fyEnd: 'Dec', notes: 'Score validated (72)' },
  { ticker: 'ILMN', name: 'Illumina', categories: ['user', 'healthcare'], fyEnd: 'Dec', notes: 'Score validated (35)' },
  { ticker: 'ODFL', name: 'Old Dominion Freight Line', categories: ['user', 'industrials'], fyEnd: 'Dec', notes: 'ODFL example in knowledge/' },
  { ticker: 'MU', name: 'Micron Technology', categories: ['user', 'semis', 'non-calendar-fy'], fyEnd: 'Aug', notes: 'MU example in knowledge/, cyclical' },

  // ─── Mega-cap Tech ─────────────────────────────────────────
  { ticker: 'AAPL', name: 'Apple Inc', categories: ['mega-tech', 'splits'], fyEnd: 'Sep', notes: 'Already validated vs Toolbox. 4:1 split 2020, 7:1 split 2014' },
  { ticker: 'MSFT', name: 'Microsoft Corp', categories: ['mega-tech'], fyEnd: 'Jun', notes: '' },
  { ticker: 'GOOGL', name: 'Alphabet Inc', categories: ['mega-tech', 'splits', 'net-cash'], fyEnd: 'Dec', notes: '20:1 split 2022, multi-class shares' },
  { ticker: 'AMZN', name: 'Amazon.com Inc', categories: ['mega-tech', 'splits'], fyEnd: 'Dec', notes: '20:1 split 2022' },
  { ticker: 'META', name: 'Meta Platforms', categories: ['mega-tech', 'net-cash'], fyEnd: 'Dec', notes: '' },
  { ticker: 'NVDA', name: 'NVIDIA Corp', categories: ['mega-tech', 'splits', 'semis'], fyEnd: 'Jan', notes: '10:1 split 2024' },
  { ticker: 'TSLA', name: 'Tesla Inc', categories: ['mega-tech', 'splits'], fyEnd: 'Dec', notes: '3:1 split 2022, 5:1 split 2020' },
  { ticker: 'AVGO', name: 'Broadcom Inc', categories: ['mega-tech', 'semis', 'splits', 'non-calendar-fy'], fyEnd: 'Oct', notes: '10:1 split 2024' },

  // ─── Healthcare ────────────────────────────────────────────
  { ticker: 'JNJ', name: 'Johnson & Johnson', categories: ['healthcare'], fyEnd: 'Dec', notes: 'Consumer health spinoff (Kenvue)' },
  { ticker: 'UNH', name: 'UnitedHealth Group', categories: ['healthcare'], fyEnd: 'Dec', notes: '' },
  { ticker: 'PFE', name: 'Pfizer Inc', categories: ['healthcare'], fyEnd: 'Dec', notes: 'COVID revenue spike/decline' },
  { ticker: 'ABBV', name: 'AbbVie Inc', categories: ['healthcare'], fyEnd: 'Dec', notes: 'Large goodwill from Allergan' },
  { ticker: 'LLY', name: 'Eli Lilly', categories: ['healthcare'], fyEnd: 'Dec', notes: '' },
  { ticker: 'MRK', name: 'Merck & Co', categories: ['healthcare'], fyEnd: 'Dec', notes: '' },
  { ticker: 'TMO', name: 'Thermo Fisher Scientific', categories: ['healthcare'], fyEnd: 'Dec', notes: 'Acquisition-heavy' },
  { ticker: 'ISRG', name: 'Intuitive Surgical', categories: ['healthcare'], fyEnd: 'Dec', notes: '' },

  // ─── Retail / Consumer ─────────────────────────────────────
  { ticker: 'WMT', name: 'Walmart Inc', categories: ['retail', 'non-calendar-fy'], fyEnd: 'Jan', notes: '' },
  { ticker: 'COST', name: 'Costco Wholesale', categories: ['retail', 'non-calendar-fy'], fyEnd: 'Aug', notes: '' },
  { ticker: 'HD', name: 'Home Depot', categories: ['retail', 'non-calendar-fy'], fyEnd: 'Jan', notes: '' },
  { ticker: 'TGT', name: 'Target Corp', categories: ['retail', 'non-calendar-fy'], fyEnd: 'Jan', notes: '' },
  { ticker: 'NKE', name: 'Nike Inc', categories: ['retail', 'non-calendar-fy'], fyEnd: 'May', notes: '' },
  { ticker: 'SBUX', name: 'Starbucks Corp', categories: ['retail', 'non-calendar-fy', 'heavy-debt'], fyEnd: 'Sep', notes: 'Negative equity' },
  { ticker: 'DG', name: 'Dollar General', categories: ['retail', 'non-calendar-fy'], fyEnd: 'Jan', notes: '' },
  { ticker: 'ROST', name: 'Ross Stores', categories: ['retail', 'non-calendar-fy'], fyEnd: 'Jan', notes: '' },

  // ─── Energy ────────────────────────────────────────────────
  { ticker: 'XOM', name: 'Exxon Mobil', categories: ['energy'], fyEnd: 'Dec', notes: 'Large CapEx, cyclical' },
  { ticker: 'CVX', name: 'Chevron Corp', categories: ['energy'], fyEnd: 'Dec', notes: '' },
  { ticker: 'COP', name: 'ConocoPhillips', categories: ['energy'], fyEnd: 'Dec', notes: '' },
  { ticker: 'SLB', name: 'Schlumberger', categories: ['energy'], fyEnd: 'Dec', notes: '' },
  { ticker: 'OXY', name: 'Occidental Petroleum', categories: ['energy', 'heavy-debt'], fyEnd: 'Dec', notes: '' },
  { ticker: 'EOG', name: 'EOG Resources', categories: ['energy'], fyEnd: 'Dec', notes: '' },
  { ticker: 'PSX', name: 'Phillips 66', categories: ['energy'], fyEnd: 'Dec', notes: '' },
  { ticker: 'VLO', name: 'Valero Energy', categories: ['energy'], fyEnd: 'Dec', notes: '' },

  // ─── Industrials ───────────────────────────────────────────
  { ticker: 'HON', name: 'Honeywell Intl', categories: ['industrials'], fyEnd: 'Dec', notes: '' },
  { ticker: 'CAT', name: 'Caterpillar', categories: ['industrials'], fyEnd: 'Dec', notes: '' },
  { ticker: 'GE', name: 'GE Aerospace', categories: ['industrials'], fyEnd: 'Dec', notes: 'Spinoffs (Vernova, HealthCare)' },
  { ticker: 'MMM', name: '3M Company', categories: ['industrials'], fyEnd: 'Dec', notes: 'Litigation liabilities' },
  { ticker: 'UPS', name: 'United Parcel Service', categories: ['industrials'], fyEnd: 'Dec', notes: '' },
  { ticker: 'DE', name: 'Deere & Co', categories: ['industrials', 'non-calendar-fy'], fyEnd: 'Oct', notes: '' },
  { ticker: 'RTX', name: 'RTX Corp', categories: ['industrials'], fyEnd: 'Dec', notes: 'Formerly Raytheon' },
  { ticker: 'LMT', name: 'Lockheed Martin', categories: ['industrials'], fyEnd: 'Dec', notes: '' },

  // ─── Semiconductors ────────────────────────────────────────
  { ticker: 'INTC', name: 'Intel Corp', categories: ['semis'], fyEnd: 'Dec', notes: 'High CapEx, struggling' },
  { ticker: 'AMD', name: 'Advanced Micro Devices', categories: ['semis'], fyEnd: 'Dec', notes: 'Xilinx acquisition' },
  { ticker: 'QCOM', name: 'Qualcomm', categories: ['semis', 'non-calendar-fy'], fyEnd: 'Sep', notes: '' },
  { ticker: 'TXN', name: 'Texas Instruments', categories: ['semis'], fyEnd: 'Dec', notes: '' },
  { ticker: 'LRCX', name: 'Lam Research', categories: ['semis', 'non-calendar-fy'], fyEnd: 'Jun', notes: '' },
  { ticker: 'MRVL', name: 'Marvell Technology', categories: ['semis', 'non-calendar-fy'], fyEnd: 'Jan', notes: '' },
  { ticker: 'ON', name: 'ON Semiconductor', categories: ['semis'], fyEnd: 'Dec', notes: '' },
  { ticker: 'KLAC', name: 'KLA Corp', categories: ['semis', 'non-calendar-fy'], fyEnd: 'Jun', notes: '' },

  // ─── Media / Communications ────────────────────────────────
  { ticker: 'NFLX', name: 'Netflix Inc', categories: ['media'], fyEnd: 'Dec', notes: 'Content amortization' },
  { ticker: 'DIS', name: 'Walt Disney Co', categories: ['media', 'non-calendar-fy'], fyEnd: 'Sep', notes: 'Complex segments' },
  { ticker: 'CMCSA', name: 'Comcast Corp', categories: ['media'], fyEnd: 'Dec', notes: 'NCI (NBCUniversal)' },
  { ticker: 'T', name: 'AT&T Inc', categories: ['media', 'heavy-debt'], fyEnd: 'Dec', notes: 'Very heavy debt' },
  { ticker: 'CHTR', name: 'Charter Communications', categories: ['media', 'heavy-debt'], fyEnd: 'Dec', notes: '' },
  { ticker: 'TMUS', name: 'T-Mobile US', categories: ['media'], fyEnd: 'Dec', notes: '' },

  // ─── Mid-cap ───────────────────────────────────────────────
  { ticker: 'POOL', name: 'Pool Corp', categories: ['mid-cap'], fyEnd: 'Dec', notes: '' },
  { ticker: 'DECK', name: 'Deckers Outdoor', categories: ['mid-cap', 'non-calendar-fy'], fyEnd: 'Mar', notes: '' },
  { ticker: 'IDXX', name: 'IDEXX Laboratories', categories: ['mid-cap'], fyEnd: 'Dec', notes: '' },
  { ticker: 'PAYC', name: 'Paycom Software', categories: ['mid-cap', 'software'], fyEnd: 'Dec', notes: '' },
  { ticker: 'WSO', name: 'Watsco Inc', categories: ['mid-cap'], fyEnd: 'Dec', notes: '' },
  { ticker: 'CASY', name: "Casey's General Stores", categories: ['mid-cap', 'non-calendar-fy'], fyEnd: 'Apr', notes: '' },
  { ticker: 'DKNG', name: 'DraftKings Inc', categories: ['mid-cap'], fyEnd: 'Dec', notes: 'Unprofitable, high SBC' },
  { ticker: 'WDAY', name: 'Workday Inc', categories: ['mid-cap', 'software', 'non-calendar-fy'], fyEnd: 'Jan', notes: '' },

  // ─── Software / Cloud ──────────────────────────────────────
  { ticker: 'CRM', name: 'Salesforce Inc', categories: ['software', 'non-calendar-fy'], fyEnd: 'Jan', notes: '' },
  { ticker: 'ADBE', name: 'Adobe Inc', categories: ['software', 'non-calendar-fy'], fyEnd: 'Nov', notes: '' },
  { ticker: 'NOW', name: 'ServiceNow Inc', categories: ['software'], fyEnd: 'Dec', notes: '' },
  { ticker: 'PANW', name: 'Palo Alto Networks', categories: ['software', 'non-calendar-fy'], fyEnd: 'Jul', notes: '' },
  { ticker: 'CRWD', name: 'CrowdStrike', categories: ['software', 'non-calendar-fy'], fyEnd: 'Jan', notes: '' },
  { ticker: 'ZS', name: 'Zscaler Inc', categories: ['software', 'non-calendar-fy'], fyEnd: 'Jul', notes: '' },
  { ticker: 'ANET', name: 'Arista Networks', categories: ['software', 'net-cash'], fyEnd: 'Dec', notes: '' },
  { ticker: 'FTNT', name: 'Fortinet Inc', categories: ['software'], fyEnd: 'Dec', notes: '' },

  // ─── Heavy Debt / Negative Equity ──────────────────────────
  { ticker: 'F', name: 'Ford Motor Co', categories: ['heavy-debt', 'industrials'], fyEnd: 'Dec', notes: '' },
  { ticker: 'BA', name: 'Boeing Co', categories: ['heavy-debt', 'industrials'], fyEnd: 'Dec', notes: 'Negative equity' },
  { ticker: 'CCL', name: 'Carnival Corp', categories: ['heavy-debt'], fyEnd: 'Nov', notes: 'COVID-era debt surge' },
  { ticker: 'DAL', name: 'Delta Air Lines', categories: ['heavy-debt'], fyEnd: 'Dec', notes: '' },
  { ticker: 'AAL', name: 'American Airlines', categories: ['heavy-debt'], fyEnd: 'Dec', notes: 'Negative equity' },
  { ticker: 'KHC', name: 'Kraft Heinz Co', categories: ['heavy-debt', 'consumer'], fyEnd: 'Dec', notes: 'Large goodwill, heavy debt. Replaced PARA (delisted after Skydance merger 2025)' },

  // ─── Non-Calendar FY (extras) ──────────────────────────────
  { ticker: 'FDX', name: 'FedEx Corp', categories: ['industrials', 'non-calendar-fy'], fyEnd: 'May', notes: '' },
  { ticker: 'ORCL', name: 'Oracle Corp', categories: ['software', 'non-calendar-fy'], fyEnd: 'May', notes: '' },
  { ticker: 'ACN', name: 'Accenture plc', categories: ['software', 'non-calendar-fy'], fyEnd: 'Aug', notes: '' },
];

export default VALIDATION_COMPANIES;
