// Tests for filingSections.js — Section extraction from SEC filing markdown
// Tests extractSection and extractAllSections against realistic 10-K markdown

import { describe, it, expect } from 'vitest';
import { extractSection, extractAllSections, SECTION_MAP } from '../filingSections.js';

// ─── Sample 10-K Markdown ─────────────────────────────────────────

const SAMPLE_10K_MARKDOWN = `# PART I

## Item 1. Business

Costco Wholesale Corporation ("Costco" or the "Company") and its subsidiaries began operations in 1983 in Seattle, Washington. The Company operates membership warehouses based on the concept that offering members low prices on a limited selection of nationally-branded and private-label products in a wide range of merchandise categories will produce high sales volumes and rapid inventory turnover. When combined with the operating efficiencies achieved by volume purchasing, efficient distribution and reduced handling of merchandise in no-frills, self-service warehouse facilities, these volumes and turnover enable Costco to operate profitably at significantly lower gross margins (relative to those of traditional wholesalers and retailers) than traditional retailers. The Company sells all types of products through its warehouse clubs and e-commerce websites.

The Company currently operates 897 warehouses worldwide: 607 in the United States and Puerto Rico, 109 in Canada, 40 in Mexico, 35 in Japan, 29 in the United Kingdom, 18 in South Korea, 15 in Australia, 14 in Taiwan, 7 in China, 4 in Spain, 4 in France, and other locations.

## Item 1A. Risk Factors

The following discussion of risk factors identifies the most significant factors that may adversely affect our business, operations, financial position, or future financial performance. This information should be read in conjunction with Management's Discussion and Analysis of Financial Condition and Results of Operations (MD&A) and the consolidated financial statements and related notes.

Our business is subject to a variety of risks, including but not limited to the following:

**General economic and industry conditions.** The Company's operations and results of operations are impacted by consumer spending. Changes in general or local economic conditions, consumer confidence, employment levels, inflation, housing values, energy costs, interest rate changes, geopolitical events, or other factors may adversely affect consumer demand for products and services offered by the Company. A general slowdown in the economy, significant increases in fuel and/or energy costs, or other economic conditions affecting disposable consumer income could negatively impact our business. A deterioration in economic conditions could also increase our merchandise costs or selling expenses and could adversely affect the ability of our members to pay their membership fees and purchase our products.

**Competition.** The retail business is highly competitive. We compete with other warehouse club operators, supermarkets, general merchandise chains, specialty chains, gasoline stations, and internet retailers. Some of these competitors may have greater financial resources, lower merchandise costs, or lower operating costs than we do.

## Item 2. Properties

The Company's executive offices are located in Issaquah, Washington (a suburb of Seattle). Most of the Company's warehouses are located in leased premises. The Company owns a significant number of warehouse buildings. The Company operates approximately 22.1 million square feet of warehouse floor space globally. The Company believes that its current properties are adequate for its present needs and foreseeable expansion plans.

# PART II

## Item 7. Management's Discussion and Analysis of Financial Condition and Results of Operations

The following discussion should be read in conjunction with the consolidated financial statements and notes included in this Annual Report. The Company's fiscal year ends on the Sunday closest to August 31.

**Overview.** Net sales increased 5% to $254.2 billion in fiscal 2024, compared to $242.3 billion in fiscal 2023. The increase was primarily attributable to an increase in comparable sales. Net income increased to $7.37 billion in fiscal 2024, compared to $6.29 billion in fiscal 2023. Diluted earnings per share increased to $16.56 in fiscal 2024, compared to $14.16 in fiscal 2023.

**Revenues.** Net sales for fiscal 2024 were $254.2 billion, an increase of $11.9 billion, or 5%, from $242.3 billion in fiscal 2023. Comparable sales for fiscal 2024 increased 5.0% in the United States. E-commerce comparable sales increased 15.7%.

**Cost of Goods Sold.** Cost of goods sold was $221.4 billion in fiscal 2024, compared to $212.6 billion in fiscal 2023, an increase of 4%. Gross margin as a percentage of net sales increased to 12.9% from 12.3%.

## Item 7A. Quantitative and Qualitative Disclosures About Market Risk

The Company is exposed to foreign currency exchange rate fluctuations relating to its international operations. We use foreign currency forward contracts to manage certain foreign currency risks. Additionally, the Company is exposed to interest rate changes primarily relating to investments, borrowings on the revolving credit facility, and the potential effect on the fair market value of the Company's fixed-rate Senior Notes.

Foreign currency exchange rate risk arises from our international operations in Canada, Mexico, the United Kingdom, Japan, South Korea, Taiwan, Australia, China, Spain, France, and Iceland. This risk is managed through the use of forward contracts with maturities generally not exceeding 12 months.

## Item 8. Financial Statements and Supplementary Data

The consolidated financial statements and notes thereto and the report of the independent registered public accounting firm are included in this Annual Report on Form 10-K.

See Index to Consolidated Financial Statements on page F-1.

## Item 9A. Controls and Procedures

**Evaluation of Disclosure Controls and Procedures.** Under the supervision and with the participation of the Company's management, including its Chief Executive Officer and Chief Financial Officer, the Company evaluated the effectiveness of the design and operation of its disclosure controls and procedures (as defined in Rules 13a-15(e) and 15d-15(e) under the Securities Exchange Act of 1934) as of the end of the period covered by this report. Based on that evaluation, the Chief Executive Officer and Chief Financial Officer concluded that the Company's disclosure controls and procedures were effective.

# PART III

## Item 11. Executive Compensation

Information required by this Item is incorporated by reference from the Company's Proxy Statement for its Annual Meeting of Shareholders to be held on January 23, 2025. The Company's executive compensation program is designed to attract, retain, and motivate key executives who are critical to our success and to align the interests of executives with those of our shareholders.

The Compensation Committee of the Board of Directors approves all compensation for the Company's named executive officers. The Committee considers multiple factors including company performance, individual contributions, market data, and internal equity.
`;

// ─── extractSection Tests ─────────────────────────────────────────

describe('extractSection', () => {
  it('extracts "Risk Factors" section from Item 1A header', () => {
    const section = extractSection(SAMPLE_10K_MARKDOWN, 'Risk Factors');
    expect(section).not.toBeNull();
    expect(section).toContain('risk factors');
    expect(section).toContain('General economic and industry conditions');
    expect(section).toContain('Competition');
    // Should NOT contain content from the next section (Properties)
    expect(section).not.toContain('executive offices are located in Issaquah');
  });

  it('extracts "Business" section from Item 1 header with period', () => {
    const section = extractSection(SAMPLE_10K_MARKDOWN, 'Business');
    expect(section).not.toBeNull();
    expect(section).toContain('Costco Wholesale Corporation');
    expect(section).toContain('897 warehouses worldwide');
    // Should NOT contain Risk Factors content
    expect(section).not.toContain('adversely affect our business, operations');
  });

  it('extracts "MD&A" section from Management Discussion header', () => {
    const section = extractSection(SAMPLE_10K_MARKDOWN, 'MD&A');
    expect(section).not.toBeNull();
    expect(section).toContain('Management\'s Discussion');
    expect(section).toContain('Net sales increased 5%');
    expect(section).toContain('$254.2 billion');
  });

  it('returns null when section header is not found', () => {
    const section = extractSection(SAMPLE_10K_MARKDOWN, 'Nonexistent Section XYZ');
    expect(section).toBeNull();
  });

  it('returns null when extracted section is too short (< 100 chars)', () => {
    const shortMarkdown = '## Item 1A. Risk Factors\n\nShort.\n\n## Item 2. Properties\n\nSome content here that is long enough to be a real section with more than a hundred characters of actual useful content about properties and real estate.';
    const section = extractSection(shortMarkdown, 'Risk Factors');
    expect(section).toBeNull();
  });

  it('handles case-insensitive matching for UPPERCASE headers', () => {
    const upperMarkdown = `## ITEM 1A: RISK FACTORS

This section describes the significant risk factors that could adversely affect our business, financial condition, operating results, and stock price. Investors should carefully consider these risks in addition to other information contained in this annual report. The risks described below are not the only ones facing our company, and there may be additional risks not presently known.

## ITEM 2: PROPERTIES

Our headquarters are in Seattle.`;
    const section = extractSection(upperMarkdown, 'Risk Factors');
    expect(section).not.toBeNull();
    expect(section).toContain('significant risk factors');
  });

  it('handles fuzzy match for section name not in SECTION_MAP', () => {
    const mdWithCustomSection = `## Executive Officers of the Registrant

The following table sets forth certain information with respect to the executive officers of the Company as of October 15, 2024. Officers serve at the discretion of the Board of Directors. There are no family relationships among any of the directors or executive officers of the Company, and they serve important roles in governance.

## Item 2. Properties

Our offices are in Washington state.`;
    const section = extractSection(mdWithCustomSection, 'Executive Officers');
    expect(section).not.toBeNull();
    expect(section).toContain('executive officers');
  });

  it('returns null for null/empty inputs', () => {
    expect(extractSection(null, 'Business')).toBeNull();
    expect(extractSection('', 'Business')).toBeNull();
    expect(extractSection(SAMPLE_10K_MARKDOWN, '')).toBeNull();
    expect(extractSection(SAMPLE_10K_MARKDOWN, null)).toBeNull();
  });

  it('extracts "Controls" section from Item 9A', () => {
    const section = extractSection(SAMPLE_10K_MARKDOWN, 'Controls');
    expect(section).not.toBeNull();
    expect(section).toContain('Disclosure Controls and Procedures');
    expect(section).toContain('Chief Executive Officer');
  });

  it('extracts "Executive Compensation" from Item 11', () => {
    const section = extractSection(SAMPLE_10K_MARKDOWN, 'Executive Compensation');
    expect(section).not.toBeNull();
    expect(section).toContain('Compensation Committee');
    expect(section).toContain('Proxy Statement');
  });
});

// ─── extractAllSections Tests ─────────────────────────────────────

describe('extractAllSections', () => {
  it('extracts multiple sections from a full 10-K markdown', () => {
    const sections = extractAllSections(SAMPLE_10K_MARKDOWN);
    expect(typeof sections).toBe('object');
    // Should have at least Business, Risk Factors, Properties, MD&A
    expect(sections['Business']).toBeTruthy();
    expect(sections['Risk Factors']).toBeTruthy();
    expect(sections['MD&A']).toBeTruthy();
    expect(sections['Controls']).toBeTruthy();
  });

  it('omits sections that are not present in the markdown', () => {
    const minimalMd = `## Item 1. Business

This is a business description section with enough content to pass the minimum character threshold for extraction. The company operates in various markets and has significant operations across multiple regions and segments that contribute to its overall financial performance.

## Item 2. Properties

Properties section content.`;
    const sections = extractAllSections(minimalMd);
    expect(sections['Business']).toBeTruthy();
    // Risk Factors, MD&A, etc. should NOT be present
    expect(sections['Risk Factors']).toBeUndefined();
    expect(sections['MD&A']).toBeUndefined();
    expect(sections['Financial Statements']).toBeUndefined();
  });

  it('returns empty object for null/empty markdown', () => {
    expect(extractAllSections(null)).toEqual({});
    expect(extractAllSections('')).toEqual({});
  });
});

// ─── SECTION_MAP Tests ────────────────────────────────────────────

describe('SECTION_MAP', () => {
  it('has at least 5 section patterns', () => {
    const keys = Object.keys(SECTION_MAP);
    expect(keys.length).toBeGreaterThanOrEqual(5);
  });

  it('includes all required sections', () => {
    const keys = Object.keys(SECTION_MAP);
    expect(keys).toContain('Business');
    expect(keys).toContain('Risk Factors');
    expect(keys).toContain('MD&A');
    expect(keys).toContain('Financial Statements');
    expect(keys).toContain('Executive Compensation');
  });

  it('all values are RegExp instances', () => {
    for (const value of Object.values(SECTION_MAP)) {
      expect(value).toBeInstanceOf(RegExp);
    }
  });
});
