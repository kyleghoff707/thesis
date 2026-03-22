import { describe, it, expect } from 'vitest';
import { formatCompanyName } from '../formatCompanyName';

describe('formatCompanyName', () => {
  // ─── Edge cases ──────────────────────────────────────────────
  it('returns empty string for falsy input', () => {
    expect(formatCompanyName(null)).toBe('');
    expect(formatCompanyName(undefined)).toBe('');
    expect(formatCompanyName('')).toBe('');
  });

  // ─── Already proper case (no changes needed) ────────────────
  it('preserves already-proper-case names', () => {
    expect(formatCompanyName('Apple Inc.')).toBe('Apple Inc.');
    expect(formatCompanyName('Broadcom Inc.')).toBe('Broadcom Inc.');
    expect(formatCompanyName('Marvell Technology, Inc.')).toBe('Marvell Technology, Inc.');
    expect(formatCompanyName('Shell plc')).toBe('Shell plc');
    expect(formatCompanyName('TotalEnergies SE')).toBe('TotalEnergies SE');
    expect(formatCompanyName('Oscar Health, Inc.')).toBe('Oscar Health, Inc.');
    expect(formatCompanyName('NXP Semiconductors N.V.')).toBe('NXP Semiconductors N.V.');
    expect(formatCompanyName('STMicroelectronics N.V.')).toBe('STMicroelectronics N.V.');
  });

  // ─── ALL CAPS → title case ──────────────────────────────────
  it('converts ALL CAPS names to title case', () => {
    expect(formatCompanyName('NVIDIA CORP')).toBe('Nvidia Corp');
    expect(formatCompanyName('INTEL CORP')).toBe('Intel Corp');
    expect(formatCompanyName('TARGET CORP')).toBe('Target Corp');
    expect(formatCompanyName('SAIA INC')).toBe('Saia Inc');
    expect(formatCompanyName('CENTENE CORP')).toBe('Centene Corp');
    expect(formatCompanyName('HUMANA INC')).toBe('Humana Inc');
    expect(formatCompanyName('CITIGROUP INC')).toBe('Citigroup Inc');
    expect(formatCompanyName('CHEVRON CORP')).toBe('Chevron Corp');
  });

  // ─── ALL CAPS with commas ────────────────────────────────────
  it('handles ALL CAPS with comma-separated suffixes', () => {
    expect(formatCompanyName('DIGITAL REALTY TRUST, INC.')).toBe('Digital Realty Trust, Inc.');
    expect(formatCompanyName('OLD DOMINION FREIGHT LINE, INC.')).toBe('Old Dominion Freight Line, Inc.');
    expect(formatCompanyName('GILEAD SCIENCES, INC.')).toBe('Gilead Sciences, Inc.');
    expect(formatCompanyName('DOLLAR TREE, INC.')).toBe('Dollar Tree, Inc.');
    expect(formatCompanyName('SKYWORKS SOLUTIONS, INC.')).toBe('Skyworks Solutions, Inc.');
    expect(formatCompanyName('MOLINA HEALTHCARE, INC.')).toBe('Molina Healthcare, Inc.');
  });

  // ─── Legal suffix stripping ──────────────────────────────────
  it('strips /DE/ style suffixes with space', () => {
    expect(formatCompanyName('BANK OF AMERICA CORP /DE/')).toBe('Bank of America Corp');
    expect(formatCompanyName('ARCBEST CORP /DE/')).toBe('Arcbest Corp');
    expect(formatCompanyName('AMERICAN TOWER CORP /MA/')).toBe('American Tower Corp');
    expect(formatCompanyName('BANK OF MONTREAL /CAN/')).toBe('Bank of Montreal');
    expect(formatCompanyName('ARM HOLDINGS PLC /UK')).toBe('ARM Holdings PLC');
  });

  it('strips suffixes without leading space', () => {
    expect(formatCompanyName('QUALCOMM INC/DE')).toBe('Qualcomm Inc');
    expect(formatCompanyName('WELLS FARGO & COMPANY/MN')).toBe('Wells Fargo & Company');
    expect(formatCompanyName('LAMAR ADVERTISING CO/NEW')).toBe('Lamar Advertising Co');
  });

  it('strips /NEW/ and /NEW suffixes', () => {
    expect(formatCompanyName('COSTCO WHOLESALE CORP /NEW')).toBe('Costco Wholesale Corp');
    expect(formatCompanyName('COSTCO WHOLESALE CORP /NEW/')).toBe('Costco Wholesale Corp');
  });

  // ─── Prepositions ────────────────────────────────────────────
  it('lowercases prepositions except when first word', () => {
    expect(formatCompanyName('BANK OF AMERICA CORP /DE/')).toBe('Bank of America Corp');
    expect(formatCompanyName('CANADIAN IMPERIAL BANK OF COMMERCE /CAN/')).toBe('Canadian Imperial Bank of Commerce');
    expect(formatCompanyName('GAS TRANSPORTER OF THE SOUTH INC')).toBe('Gas Transporter of the South Inc');
  });

  // ─── Known acronyms preserved ────────────────────────────────
  it('preserves known acronyms in ALL CAPS names', () => {
    expect(formatCompanyName('CVS HEALTH Corp')).toBe('CVS Health Corp');
    expect(formatCompanyName('ARM HOLDINGS PLC /UK')).toBe('ARM Holdings PLC');
    expect(formatCompanyName('SBA COMMUNICATIONS CORP')).toBe('SBA Communications Corp');
    expect(formatCompanyName('BBB FOODS INC')).toBe('BBB Foods Inc');
    expect(formatCompanyName('ING GROEP NV')).toBe('ING Groep NV');
    expect(formatCompanyName('EPR PROPERTIES')).toBe('EPR Properties');
    expect(formatCompanyName('HSBC HOLDINGS PLC')).toBe('HSBC Holdings PLC');
  });

  // ─── Mixed-case anomalies ────────────────────────────────────
  it('handles mixed-case names (mostly CAPS with proper suffix)', () => {
    expect(formatCompanyName('ELI LILLY & Co')).toBe('Eli Lilly & Co');
    expect(formatCompanyName('PROCTER & GAMBLE Co')).toBe('Procter & Gamble Co');
    expect(formatCompanyName('SYNAPTICS Inc')).toBe('Synaptics Inc');
    expect(formatCompanyName('GLADSTONE LAND Corp')).toBe('Gladstone Land Corp');
    expect(formatCompanyName('BOISE CASCADE Co')).toBe('Boise Cascade Co');
    expect(formatCompanyName('BALL Corp')).toBe('Ball Corp');
  });

  it('normalizes ALL CAPS suffixes in mostly-proper names', () => {
    expect(formatCompanyName('Silicon Motion Technology CORP')).toBe('Silicon Motion Technology Corp');
  });

  // ─── PLC and other entity suffixes ───────────────────────────
  it('keeps PLC, LLC, NV, SA, SE uppercase', () => {
    expect(formatCompanyName('BARCLAYS PLC')).toBe('Barclays PLC');
    expect(formatCompanyName('ENI SPA')).toBe('ENI Spa');
    expect(formatCompanyName('ING GROEP NV')).toBe('ING Groep NV');
  });

  // ─── Hyphenated names ────────────────────────────────────────
  it('handles hyphenated company names', () => {
    expect(formatCompanyName('Knight-Swift Transportation Holdings Inc.')).toBe('Knight-Swift Transportation Holdings Inc.');
  });

  // ─── Long names ──────────────────────────────────────────────
  it('handles long ALL CAPS names', () => {
    expect(formatCompanyName('ADVANCED MICRO DEVICES INC')).toBe('Advanced Micro Devices Inc');
    expect(formatCompanyName('MONOLITHIC POWER SYSTEMS INC')).toBe('Monolithic Power Systems Inc');
    expect(formatCompanyName('VISHAY INTERTECHNOLOGY INC')).toBe('Vishay Intertechnology Inc');
    expect(formatCompanyName('TEXAS INSTRUMENTS INC')).toBe('Texas Instruments Inc');
    expect(formatCompanyName('MICROCHIP TECHNOLOGY INC')).toBe('Microchip Technology Inc');
  });

  // ─── Names with periods ──────────────────────────────────────
  it('preserves N.V. and S.A. formatting', () => {
    expect(formatCompanyName('Banco Santander, S.A.')).toBe('Banco Santander, S.A.');
    expect(formatCompanyName('NXP Semiconductors N.V.')).toBe('NXP Semiconductors N.V.');
  });

  // ─── Power REIT edge case ────────────────────────────────────
  it('handles Power REIT correctly', () => {
    expect(formatCompanyName('Power REIT')).toBe('Power REIT');
  });

  // ─── Real-world examples from bug report ─────────────────────
  describe('bug report examples', () => {
    it('JPM competitors', () => {
      expect(formatCompanyName('JPMORGAN CHASE & CO')).toBe('Jpmorgan Chase & Co');
      expect(formatCompanyName('ROYAL BANK OF CANADA')).toBe('Royal Bank of Canada');
      expect(formatCompanyName('TORONTO DOMINION BANK')).toBe('Toronto Dominion Bank');
    });

    it('WMT competitors', () => {
      expect(formatCompanyName('DOLLAR GENERAL CORP')).toBe('Dollar General Corp');
      expect(formatCompanyName('PRICESMART INC')).toBe('Pricesmart Inc');
    });

    it('XOM competitors', () => {
      expect(formatCompanyName('EXXON MOBIL CORP')).toBe('Exxon Mobil Corp');
      expect(formatCompanyName('NATIONAL FUEL GAS CO')).toBe('National Fuel Gas Co');
      expect(formatCompanyName('SUNCOR ENERGY INC')).toBe('Suncor Energy Inc');
      expect(formatCompanyName('IMPERIAL OIL LTD')).toBe('Imperial Oil Ltd');
      expect(formatCompanyName('CENOVUS ENERGY INC.')).toBe('Cenovus Energy Inc.');
      expect(formatCompanyName('PETROBRAS - PETROLEO BRASILEIRO SA')).toBe('Petrobras - Petroleo Brasileiro SA');
    });

    it('UNH competitors', () => {
      expect(formatCompanyName('UNITEDHEALTH GROUP INC')).toBe('Unitedhealth Group Inc');
      expect(formatCompanyName('CLOVER HEALTH INVESTMENTS, CORP. /DE')).toBe('Clover Health Investments, Corp.');
    });

    it('AMT header and competitors', () => {
      expect(formatCompanyName('AMERICAN TOWER CORP /MA/')).toBe('American Tower Corp');
      expect(formatCompanyName('EQUINIX INC')).toBe('Equinix Inc');
      expect(formatCompanyName('WEYERHAEUSER CO')).toBe('Weyerhaeuser Co');
      expect(formatCompanyName('IRON MOUNTAIN INC')).toBe('Iron Mountain Inc');
      expect(formatCompanyName('CROWN CASTLE INC.')).toBe('Crown Castle Inc.');
    });

    it('MU competitors', () => {
      expect(formatCompanyName('MICRON TECHNOLOGY INC')).toBe('Micron Technology Inc');
      expect(formatCompanyName('ANALOG DEVICES INC')).toBe('Analog Devices Inc');
      expect(formatCompanyName('ON SEMICONDUCTOR CORP')).toBe('On Semiconductor Corp');
      expect(formatCompanyName('CIRRUS LOGIC, INC.')).toBe('Cirrus Logic, Inc.');
      expect(formatCompanyName('TOWER SEMICONDUCTOR LTD')).toBe('Tower Semiconductor Ltd');
      expect(formatCompanyName('DIODES INC /DEL/')).toBe('Diodes Inc');
      expect(formatCompanyName('WOLFSPEED, INC.')).toBe('Wolfspeed, Inc.');
    });

    it('ODFL competitors', () => {
      expect(formatCompanyName('WERNER ENTERPRISES INC')).toBe('Werner Enterprises Inc');
      expect(formatCompanyName('HEARTLAND EXPRESS INC')).toBe('Heartland Express Inc');
      expect(formatCompanyName('MARTEN TRANSPORT LTD')).toBe('Marten Transport Ltd');
    });
  });
});
