// Auto-generated from yahoo-to-thes1s-crosswalk.json + thes1s-taxonomy-tree.json
// Regenerate: node scripts/generate-crosswalk-constant.js
// 145 mappings, 176 taxonomy codes

// Major US exchanges (Yahoo Finance exchange codes)
export const MAJOR_EXCHANGES = new Set([
  'NMS',  // Nasdaq Global Select Market
  'NGM',  // Nasdaq Global Market
  'NCM',  // Nasdaq Capital Market
  'NYQ',  // NYSE
  'ASE',  // NYSE American (AMEX)
  'PCX',  // NYSE Arca
  'BTS',  // BATS/Cboe BZX
]);

// Non-common-stock ticker patterns (warrants, units, rights, preferred)
export const NON_COMMON_STOCK = [
  /[.\-\/]W[S]?$/,     // warrants
  /[.\-\/]U$/,          // units
  /[.\-\/]R[T]?$/,      // rights
  /[.\-\/]P[A-Z]?$/,    // preferred
  /[.\-\/]PR[.\-\/]?[A-Z]?$/, // preferred (alt)
];

// Yahoo sector|industry -> Thes1s classification
export const YAHOO_TO_THES1S = new Map([
  ['Technology|Semiconductors', { thes1sCode: '10301010', sector: 'Technology', industryGroup: 'Semiconductors', industry: 'Semiconductors', confidence: 0.85 }],
  ['Technology|Software - Infrastructure', { thes1sCode: '10101020', sector: 'Technology', industryGroup: 'Software', industry: 'Software - Infrastructure', confidence: 0.85 }],
  ['Technology|Consumer Electronics', { thes1sCode: '10201010', sector: 'Technology', industryGroup: 'Hardware', industry: 'Consumer Electronics', confidence: 0.85 }],
  ['Technology|Software - Application', { thes1sCode: '10101010', sector: 'Technology', industryGroup: 'Software', industry: 'Software - Application', confidence: 0.65 }],
  ['Technology|Semiconductor Equipment & Materials', { thes1sCode: '10301020', sector: 'Technology', industryGroup: 'Semiconductors', industry: 'Semiconductor Equipment & Materials', confidence: 0.85 }],
  ['Technology|Computer Hardware', { thes1sCode: '10201020', sector: 'Technology', industryGroup: 'Hardware', industry: 'Computer Hardware & Storage', confidence: 0.85 }],
  ['Technology|Communication Equipment', { thes1sCode: '10201030', sector: 'Technology', industryGroup: 'Hardware', industry: 'Communication Equipment', confidence: 0.85 }],
  ['Technology|Information Technology Services', { thes1sCode: '10501010', sector: 'Technology', industryGroup: 'IT Services', industry: 'Information Technology Services', confidence: 0.85 }],
  ['Technology|Electronic Components', { thes1sCode: '10401010', sector: 'Technology', industryGroup: 'Electronic Components', industry: 'Electronic Components', confidence: 0.85 }],
  ['Technology|Scientific & Technical Instruments', { thes1sCode: '10201040', sector: 'Technology', industryGroup: 'Hardware', industry: 'Scientific & Technical Instruments', confidence: 0.85 }],
  ['Technology|Solar', { thes1sCode: '45201010', sector: 'Energy', industryGroup: 'Renewable Energy', industry: 'Solar Energy', confidence: 0.85 }],
  ['Technology|Electronics & Computer Distributors', { thes1sCode: '10601010', sector: 'Technology', industryGroup: 'Technology Distributors', industry: 'Technology Distributors', confidence: 0.85 }],
  ['Communication Services|Internet Content & Information', { thes1sCode: '15301010', sector: 'Communication Services', industryGroup: 'Internet & Digital Media', industry: 'Internet Content & Information', confidence: 0.65 }],
  ['Communication Services|Telecom Services', { thes1sCode: '15101010', sector: 'Communication Services', industryGroup: 'Telecom', industry: 'Telecom - Diversified', confidence: 0.65 }],
  ['Communication Services|Entertainment', { thes1sCode: '15201010', sector: 'Communication Services', industryGroup: 'Media & Entertainment', industry: 'Entertainment - Diversified', confidence: 0.65 }],
  ['Communication Services|Advertising Agencies', { thes1sCode: '15201060', sector: 'Communication Services', industryGroup: 'Media & Entertainment', industry: 'Advertising & Marketing Services', confidence: 0.85 }],
  ['Communication Services|Electronic Gaming & Multimedia', { thes1sCode: '15201030', sector: 'Communication Services', industryGroup: 'Media & Entertainment', industry: 'Gaming & Interactive Entertainment', confidence: 0.85 }],
  ['Communication Services|Publishing', { thes1sCode: '15201050', sector: 'Communication Services', industryGroup: 'Media & Entertainment', industry: 'Publishing & Information Services', confidence: 0.85 }],
  ['Communication Services|Broadcasting', { thes1sCode: '15201040', sector: 'Communication Services', industryGroup: 'Media & Entertainment', industry: 'Broadcasting - TV & Radio', confidence: 0.85 }],
  ['Energy|Oil & Gas Integrated', { thes1sCode: '45101010', sector: 'Energy', industryGroup: 'Oil & Gas', industry: 'Oil & Gas - Integrated', confidence: 0.85 }],
  ['Energy|Oil & Gas Midstream', { thes1sCode: '45101040', sector: 'Energy', industryGroup: 'Oil & Gas', industry: 'Oil & Gas - Midstream', confidence: 0.85 }],
  ['Energy|Oil & Gas E&P', { thes1sCode: '45101020', sector: 'Energy', industryGroup: 'Oil & Gas', industry: 'Oil & Gas - Exploration & Production', confidence: 0.85 }],
  ['Energy|Oil & Gas Equipment & Services', { thes1sCode: '45101050', sector: 'Energy', industryGroup: 'Oil & Gas', industry: 'Oil & Gas - Equipment & Services', confidence: 0.85 }],
  ['Energy|Oil & Gas Refining & Marketing', { thes1sCode: '45101030', sector: 'Energy', industryGroup: 'Oil & Gas', industry: 'Oil & Gas - Refining & Marketing', confidence: 0.85 }],
  ['Energy|Uranium', { thes1sCode: '45301020', sector: 'Energy', industryGroup: 'Energy Storage & Distribution', industry: 'Coal & Consumable Fuels', confidence: 0.85 }],
  ['Energy|Oil & Gas Drilling', { thes1sCode: '45101060', sector: 'Energy', industryGroup: 'Oil & Gas', industry: 'Oil & Gas - Drilling', confidence: 0.85 }],
  ['Energy|Thermal Coal', { thes1sCode: '45301020', sector: 'Energy', industryGroup: 'Energy Storage & Distribution', industry: 'Coal & Consumable Fuels', confidence: 0.85 }],
  ['Healthcare|Drug Manufacturers - General', { thes1sCode: '30101010', sector: 'Healthcare', industryGroup: 'Pharmaceuticals', industry: 'Drug Manufacturers - Major', confidence: 0.85 }],
  ['Healthcare|Biotechnology', { thes1sCode: '30201010', sector: 'Healthcare', industryGroup: 'Biotechnology', industry: 'Biotechnology', confidence: 0.85 }],
  ['Healthcare|Medical Devices', { thes1sCode: '30301010', sector: 'Healthcare', industryGroup: 'Medical Devices & Equipment', industry: 'Medical Devices', confidence: 0.85 }],
  ['Healthcare|Diagnostics & Research', { thes1sCode: '30501010', sector: 'Healthcare', industryGroup: 'Diagnostics & Research', industry: 'Diagnostics & Research', confidence: 0.85 }],
  ['Healthcare|Healthcare Plans', { thes1sCode: '30401030', sector: 'Healthcare', industryGroup: 'Healthcare Services', industry: 'Healthcare Plans & Insurance', confidence: 0.85 }],
  ['Healthcare|Medical Instruments & Supplies', { thes1sCode: '30301020', sector: 'Healthcare', industryGroup: 'Medical Devices & Equipment', industry: 'Medical Instruments & Supplies', confidence: 0.85 }],
  ['Healthcare|Medical Distribution', { thes1sCode: '30401040', sector: 'Healthcare', industryGroup: 'Healthcare Services', industry: 'Medical Distribution', confidence: 0.85 }],
  ['Healthcare|Medical Care Facilities', { thes1sCode: '30401010', sector: 'Healthcare', industryGroup: 'Healthcare Services', industry: 'Healthcare Providers & Facilities', confidence: 0.85 }],
  ['Healthcare|Drug Manufacturers - Specialty & Generic', { thes1sCode: '30101020', sector: 'Healthcare', industryGroup: 'Pharmaceuticals', industry: 'Drug Manufacturers - Specialty & Generic', confidence: 0.85 }],
  ['Healthcare|Health Information Services', { thes1sCode: '30401020', sector: 'Healthcare', industryGroup: 'Healthcare Services', industry: 'Health Information Technology', confidence: 0.85 }],
  ['Healthcare|Pharmaceutical Retailers', { thes1sCode: '25301030', sector: 'Consumer Defensive', industryGroup: 'Retail - Defensive', industry: 'Retail - Pharmacy & Drug Stores', confidence: 0.85 }],
  ['Utilities|Utilities - Regulated Electric', { thes1sCode: '55101010', sector: 'Utilities', industryGroup: 'Electric Utilities', industry: 'Electric Utilities - Regulated', confidence: 0.85 }],
  ['Utilities|Utilities - Independent Power Producers', { thes1sCode: '55101020', sector: 'Utilities', industryGroup: 'Electric Utilities', industry: 'Electric Utilities - Independent Power', confidence: 0.85 }],
  ['Utilities|Utilities - Regulated Gas', { thes1sCode: '55201010', sector: 'Utilities', industryGroup: 'Gas & Water Utilities', industry: 'Gas Utilities', confidence: 0.85 }],
  ['Utilities|Utilities - Diversified', { thes1sCode: '55301010', sector: 'Utilities', industryGroup: 'Multi-Utilities', industry: 'Multi-Utilities', confidence: 0.85 }],
  ['Utilities|Utilities - Renewable', { thes1sCode: '55401010', sector: 'Utilities', industryGroup: 'Renewable Utilities', industry: 'Renewable Utilities', confidence: 0.85 }],
  ['Utilities|Utilities - Regulated Water', { thes1sCode: '55201020', sector: 'Utilities', industryGroup: 'Gas & Water Utilities', industry: 'Water Utilities', confidence: 0.85 }],
  ['Basic Materials|Gold', { thes1sCode: '50201010', sector: 'Basic Materials', industryGroup: 'Metals & Mining', industry: 'Gold Mining', confidence: 0.85 }],
  ['Basic Materials|Specialty Chemicals', { thes1sCode: '50101010', sector: 'Basic Materials', industryGroup: 'Chemicals', industry: 'Chemicals - Specialty', confidence: 0.85 }],
  ['Basic Materials|Copper', { thes1sCode: '50201030', sector: 'Basic Materials', industryGroup: 'Metals & Mining', industry: 'Copper & Base Metals Mining', confidence: 0.85 }],
  ['Basic Materials|Building Materials', { thes1sCode: '50301010', sector: 'Basic Materials', industryGroup: 'Building Materials', industry: 'Building Materials', confidence: 0.85 }],
  ['Basic Materials|Steel', { thes1sCode: '50201040', sector: 'Basic Materials', industryGroup: 'Metals & Mining', industry: 'Steel', confidence: 0.85 }],
  ['Basic Materials|Agricultural Inputs', { thes1sCode: '50101030', sector: 'Basic Materials', industryGroup: 'Chemicals', industry: 'Chemicals - Agricultural', confidence: 0.85 }],
  ['Basic Materials|Other Industrial Metals & Mining', { thes1sCode: '50201060', sector: 'Basic Materials', industryGroup: 'Metals & Mining', industry: 'Other Industrial Metals & Mining', confidence: 0.85 }],
  ['Basic Materials|Chemicals', { thes1sCode: '50101020', sector: 'Basic Materials', industryGroup: 'Chemicals', industry: 'Chemicals - Diversified', confidence: 0.85 }],
  ['Basic Materials|Other Precious Metals & Mining', { thes1sCode: '50201020', sector: 'Basic Materials', industryGroup: 'Metals & Mining', industry: 'Silver & Precious Metals Mining', confidence: 0.85 }],
  ['Basic Materials|Aluminum', { thes1sCode: '50201050', sector: 'Basic Materials', industryGroup: 'Metals & Mining', industry: 'Aluminum', confidence: 0.85 }],
  ['Basic Materials|Silver', { thes1sCode: '50201020', sector: 'Basic Materials', industryGroup: 'Metals & Mining', industry: 'Silver & Precious Metals Mining', confidence: 0.85 }],
  ['Basic Materials|Lumber & Wood Production', { thes1sCode: '50301020', sector: 'Basic Materials', industryGroup: 'Building Materials', industry: 'Lumber & Wood Products', confidence: 0.85 }],
  ['Basic Materials|Coking Coal', { thes1sCode: '45301020', sector: 'Energy', industryGroup: 'Energy Storage & Distribution', industry: 'Coal & Consumable Fuels', confidence: 0.85 }],
  ['Basic Materials|Paper & Paper Products', { thes1sCode: '50401010', sector: 'Basic Materials', industryGroup: 'Paper & Packaging', industry: 'Paper & Forest Products', confidence: 0.85 }],
  ['Industrials|Aerospace & Defense', { thes1sCode: '40101010', sector: 'Industrials', industryGroup: 'Aerospace & Defense', industry: 'Aerospace & Defense', confidence: 0.85 }],
  ['Industrials|Specialty Industrial Machinery', { thes1sCode: '40201010', sector: 'Industrials', industryGroup: 'Industrial Manufacturing', industry: 'Specialty Industrial Machinery', confidence: 0.85 }],
  ['Industrials|Farm & Heavy Construction Machinery', { thes1sCode: '40201050', sector: 'Industrials', industryGroup: 'Industrial Manufacturing', industry: 'Farm & Heavy Construction Machinery', confidence: 0.85 }],
  ['Industrials|Railroads', { thes1sCode: '40301020', sector: 'Industrials', industryGroup: 'Transportation', industry: 'Railroads', confidence: 0.85 }],
  ['Industrials|Engineering & Construction', { thes1sCode: '40401010', sector: 'Industrials', industryGroup: 'Construction & Engineering', industry: 'Engineering & Construction Services', confidence: 0.85 }],
  ['Industrials|Building Products & Equipment', { thes1sCode: '20501020', sector: 'Consumer Cyclical', industryGroup: 'Housing & Construction', industry: 'Building Products', confidence: 0.85 }],
  ['Industrials|Specialty Business Services', { thes1sCode: '40501030', sector: 'Industrials', industryGroup: 'Business Services', industry: 'Commercial Services & Supplies', confidence: 0.85 }],
  ['Industrials|Electrical Equipment & Parts', { thes1sCode: '40201030', sector: 'Industrials', industryGroup: 'Industrial Manufacturing', industry: 'Electrical Equipment', confidence: 0.85 }],
  ['Industrials|Conglomerates', { thes1sCode: '99101010', sector: 'Special Classifications', industryGroup: 'Conglomerates & Holding Companies', industry: 'Conglomerates', confidence: 0.85 }],
  ['Industrials|Industrial Distribution', { thes1sCode: '40501050', sector: 'Industrials', industryGroup: 'Business Services', industry: 'Industrial Distribution', confidence: 0.85 }],
  ['Industrials|Integrated Freight & Logistics', { thes1sCode: '40301050', sector: 'Industrials', industryGroup: 'Transportation', industry: 'Logistics & Supply Chain', confidence: 0.85 }],
  ['Industrials|Waste Management', { thes1sCode: '40601010', sector: 'Industrials', industryGroup: 'Environmental Services', industry: 'Waste Management', confidence: 0.85 }],
  ['Industrials|Rental & Leasing Services', { thes1sCode: '40701010', sector: 'Industrials', industryGroup: 'Rental & Leasing', industry: 'Rental & Leasing Services', confidence: 0.85 }],
  ['Industrials|Airlines', { thes1sCode: '40301010', sector: 'Industrials', industryGroup: 'Transportation', industry: 'Airlines', confidence: 0.85 }],
  ['Industrials|Trucking', { thes1sCode: '40301030', sector: 'Industrials', industryGroup: 'Transportation', industry: 'Trucking & Freight', confidence: 0.85 }],
  ['Industrials|Tools & Accessories', { thes1sCode: '40201060', sector: 'Industrials', industryGroup: 'Industrial Manufacturing', industry: 'Tools & Accessories', confidence: 0.85 }],
  ['Industrials|Metal Fabrication', { thes1sCode: '40201040', sector: 'Industrials', industryGroup: 'Industrial Manufacturing', industry: 'Metal Fabrication', confidence: 0.85 }],
  ['Industrials|Consulting Services', { thes1sCode: '40501010', sector: 'Industrials', industryGroup: 'Business Services', industry: 'Consulting & Professional Services', confidence: 0.85 }],
  ['Industrials|Marine Shipping', { thes1sCode: '40301040', sector: 'Industrials', industryGroup: 'Transportation', industry: 'Marine Shipping', confidence: 0.85 }],
  ['Industrials|Security & Protection Services', { thes1sCode: '40501040', sector: 'Industrials', industryGroup: 'Business Services', industry: 'Security & Protection Services', confidence: 0.85 }],
  ['Industrials|Pollution & Treatment Controls', { thes1sCode: '40601020', sector: 'Industrials', industryGroup: 'Environmental Services', industry: 'Environmental & Facilities Services', confidence: 0.85 }],
  ['Industrials|Airports & Air Services', { thes1sCode: '40301070', sector: 'Industrials', industryGroup: 'Transportation', industry: 'Airports & Air Services', confidence: 0.85 }],
  ['Industrials|Staffing & Employment Services', { thes1sCode: '40501020', sector: 'Industrials', industryGroup: 'Business Services', industry: 'Staffing & Employment Services', confidence: 0.85 }],
  ['Industrials|Business Equipment & Supplies', { thes1sCode: '40501030', sector: 'Industrials', industryGroup: 'Business Services', industry: 'Commercial Services & Supplies', confidence: 0.85 }],
  ['Industrials|Infrastructure Operations', { thes1sCode: '40401030', sector: 'Industrials', industryGroup: 'Construction & Engineering', industry: 'Infrastructure Operations', confidence: 0.85 }],
  ['Consumer Cyclical|Internet Retail', { thes1sCode: '20301010', sector: 'Consumer Cyclical', industryGroup: 'Retail - Cyclical', industry: 'Retail - Broadline & E-Commerce', confidence: 0.85 }],
  ['Consumer Cyclical|Auto Manufacturers', { thes1sCode: '20101010', sector: 'Consumer Cyclical', industryGroup: 'Auto & Vehicles', industry: 'Auto Manufacturers', confidence: 0.65 }],
  ['Consumer Cyclical|Restaurants', { thes1sCode: '20401020', sector: 'Consumer Cyclical', industryGroup: 'Travel & Leisure', industry: 'Restaurants & Dining', confidence: 0.85 }],
  ['Consumer Cyclical|Home Improvement Retail', { thes1sCode: '20301030', sector: 'Consumer Cyclical', industryGroup: 'Retail - Cyclical', industry: 'Retail - Home Improvement', confidence: 0.85 }],
  ['Consumer Cyclical|Travel Services', { thes1sCode: '20401030', sector: 'Consumer Cyclical', industryGroup: 'Travel & Leisure', industry: 'Travel & Booking Services', confidence: 0.85 }],
  ['Consumer Cyclical|Apparel Retail', { thes1sCode: '20301050', sector: 'Consumer Cyclical', industryGroup: 'Retail - Cyclical', industry: 'Retail - Apparel & Accessories', confidence: 0.85 }],
  ['Consumer Cyclical|Auto Parts', { thes1sCode: '20101030', sector: 'Consumer Cyclical', industryGroup: 'Auto & Vehicles', industry: 'Auto Parts & Equipment', confidence: 0.85 }],
  ['Consumer Cyclical|Specialty Retail', { thes1sCode: '20301020', sector: 'Consumer Cyclical', industryGroup: 'Retail - Cyclical', industry: 'Retail - Specialty', confidence: 0.85 }],
  ['Consumer Cyclical|Lodging', { thes1sCode: '20401010', sector: 'Consumer Cyclical', industryGroup: 'Travel & Leisure', industry: 'Lodging & Resorts', confidence: 0.85 }],
  ['Consumer Cyclical|Residential Construction', { thes1sCode: '20501010', sector: 'Consumer Cyclical', industryGroup: 'Housing & Construction', industry: 'Homebuilders', confidence: 0.85 }],
  ['Consumer Cyclical|Packaging & Containers', { thes1sCode: '50401020', sector: 'Basic Materials', industryGroup: 'Paper & Packaging', industry: 'Packaging & Containers', confidence: 0.85 }],
  ['Consumer Cyclical|Auto & Truck Dealerships', { thes1sCode: '20101040', sector: 'Consumer Cyclical', industryGroup: 'Auto & Vehicles', industry: 'Auto Dealerships', confidence: 0.85 }],
  ['Consumer Cyclical|Footwear & Accessories', { thes1sCode: '20201040', sector: 'Consumer Cyclical', industryGroup: 'Apparel & Luxury', industry: 'Footwear & Accessories', confidence: 0.85 }],
  ['Consumer Cyclical|Resorts & Casinos', { thes1sCode: '20401050', sector: 'Consumer Cyclical', industryGroup: 'Travel & Leisure', industry: 'Casinos & Gaming', confidence: 0.85 }],
  ['Consumer Cyclical|Leisure', { thes1sCode: '20401040', sector: 'Consumer Cyclical', industryGroup: 'Travel & Leisure', industry: 'Leisure Products & Activities', confidence: 0.85 }],
  ['Consumer Cyclical|Apparel Manufacturing', { thes1sCode: '20201030', sector: 'Consumer Cyclical', industryGroup: 'Apparel & Luxury', industry: 'Apparel - Mass Market', confidence: 0.65 }],
  ['Consumer Cyclical|Furnishings, Fixtures & Appliances', { thes1sCode: '20501030', sector: 'Consumer Cyclical', industryGroup: 'Housing & Construction', industry: 'Furnishings & Home Décor', confidence: 0.85 }],
  ['Consumer Cyclical|Gambling', { thes1sCode: '20401050', sector: 'Consumer Cyclical', industryGroup: 'Travel & Leisure', industry: 'Casinos & Gaming', confidence: 0.85 }],
  ['Consumer Cyclical|Personal Services', { thes1sCode: '20601010', sector: 'Consumer Cyclical', industryGroup: 'Consumer Services', industry: 'Personal Services', confidence: 0.85 }],
  ['Consumer Cyclical|Luxury Goods', { thes1sCode: '20201020', sector: 'Consumer Cyclical', industryGroup: 'Apparel & Luxury', industry: 'Apparel - Fashion & Luxury', confidence: 0.85 }],
  ['Consumer Cyclical|Recreational Vehicles', { thes1sCode: '20101050', sector: 'Consumer Cyclical', industryGroup: 'Auto & Vehicles', industry: 'Recreational Vehicles', confidence: 0.85 }],
  ['Consumer Cyclical|Department Stores', { thes1sCode: '20301010', sector: 'Consumer Cyclical', industryGroup: 'Retail - Cyclical', industry: 'Retail - Broadline & E-Commerce', confidence: 0.85 }],
  ['Consumer Cyclical|Textile Manufacturing', { thes1sCode: '20201050', sector: 'Consumer Cyclical', industryGroup: 'Apparel & Luxury', industry: 'Textile Manufacturing', confidence: 0.85 }],
  ['Consumer Defensive|Packaged Foods', { thes1sCode: '25101030', sector: 'Consumer Defensive', industryGroup: 'Food & Beverage', industry: 'Food - Packaged & Processed', confidence: 0.85 }],
  ['Consumer Defensive|Education & Training Services', { thes1sCode: '20601020', sector: 'Consumer Cyclical', industryGroup: 'Consumer Services', industry: 'Education & Training Services', confidence: 0.85 }],
  ['Consumer Defensive|Beverages - Wineries & Distilleries', { thes1sCode: '25101020', sector: 'Consumer Defensive', industryGroup: 'Food & Beverage', industry: 'Beverages - Alcoholic', confidence: 0.85 }],
  ['Consumer Defensive|Beverages - Brewers', { thes1sCode: '25101020', sector: 'Consumer Defensive', industryGroup: 'Food & Beverage', industry: 'Beverages - Alcoholic', confidence: 0.85 }],
  ['Consumer Defensive|Discount Stores', { thes1sCode: '20301040', sector: 'Consumer Cyclical', industryGroup: 'Retail - Cyclical', industry: 'Retail - Discount & Dollar Stores', confidence: 0.85 }],
  ['Consumer Defensive|Food Distribution', { thes1sCode: '25101030', sector: 'Consumer Defensive', industryGroup: 'Food & Beverage', industry: 'Food - Packaged & Processed', confidence: 0.85 }],
  ['Consumer Defensive|Grocery Stores', { thes1sCode: '25301010', sector: 'Consumer Defensive', industryGroup: 'Retail - Defensive', industry: 'Retail - Grocery & Supermarkets', confidence: 0.85 }],
  ['Consumer Defensive|Household & Personal Products', { thes1sCode: '25201010', sector: 'Consumer Defensive', industryGroup: 'Household & Personal Products', industry: 'Household Products', confidence: 0.65 }],
  ['Consumer Defensive|Beverages - Non-Alcoholic', { thes1sCode: '25101010', sector: 'Consumer Defensive', industryGroup: 'Food & Beverage', industry: 'Beverages - Non-Alcoholic', confidence: 0.85 }],
  ['Consumer Defensive|Farm Products', { thes1sCode: '25401010', sector: 'Consumer Defensive', industryGroup: 'Agriculture', industry: 'Agricultural Products & Processing', confidence: 0.85 }],
  ['Consumer Defensive|Confectioners', { thes1sCode: '25101030', sector: 'Consumer Defensive', industryGroup: 'Food & Beverage', industry: 'Food - Packaged & Processed', confidence: 0.85 }],
  ['Consumer Defensive|Tobacco', { thes1sCode: '25201030', sector: 'Consumer Defensive', industryGroup: 'Household & Personal Products', industry: 'Tobacco', confidence: 0.85 }],
  ['Financial Services|Banks - Diversified', { thes1sCode: '35101010', sector: 'Financial Services', industryGroup: 'Banks', industry: 'Banks - Diversified', confidence: 0.85 }],
  ['Financial Services|Credit Services', { thes1sCode: '35401010', sector: 'Financial Services', industryGroup: 'Diversified Financials', industry: 'Credit Services & Lending', confidence: 0.85 }],
  ['Financial Services|Asset Management', { thes1sCode: '35301010', sector: 'Financial Services', industryGroup: 'Capital Markets', industry: 'Asset Management', confidence: 0.85 }],
  ['Financial Services|Insurance - Diversified', { thes1sCode: '35201010', sector: 'Financial Services', industryGroup: 'Insurance', industry: 'Insurance - Life', confidence: 0.65 }],
  ['Financial Services|Capital Markets', { thes1sCode: '35301020', sector: 'Financial Services', industryGroup: 'Capital Markets', industry: 'Investment Banking & Brokerage', confidence: 0.85 }],
  ['Financial Services|Banks - Regional', { thes1sCode: '35101020', sector: 'Financial Services', industryGroup: 'Banks', industry: 'Banks - Regional', confidence: 0.85 }],
  ['Financial Services|Financial Data & Stock Exchanges', { thes1sCode: '35301030', sector: 'Financial Services', industryGroup: 'Capital Markets', industry: 'Financial Exchanges & Data', confidence: 0.85 }],
  ['Financial Services|Insurance - Property & Casualty', { thes1sCode: '35201020', sector: 'Financial Services', industryGroup: 'Insurance', industry: 'Insurance - Property & Casualty', confidence: 0.85 }],
  ['Financial Services|Insurance Brokers', { thes1sCode: '35201050', sector: 'Financial Services', industryGroup: 'Insurance', industry: 'Insurance Brokers & Services', confidence: 0.85 }],
  ['Financial Services|Insurance - Life', { thes1sCode: '35201010', sector: 'Financial Services', industryGroup: 'Insurance', industry: 'Insurance - Life', confidence: 0.85 }],
  ['Financial Services|Insurance - Specialty', { thes1sCode: '35201030', sector: 'Financial Services', industryGroup: 'Insurance', industry: 'Insurance - Specialty', confidence: 0.85 }],
  ['Financial Services|Mortgage Finance', { thes1sCode: '35401010', sector: 'Financial Services', industryGroup: 'Diversified Financials', industry: 'Credit Services & Lending', confidence: 0.85 }],
  ['Financial Services|Insurance - Reinsurance', { thes1sCode: '35201040', sector: 'Financial Services', industryGroup: 'Insurance', industry: 'Insurance - Reinsurance', confidence: 0.85 }],
  ['Financial Services|Financial Conglomerates', { thes1sCode: '35601010', sector: 'Financial Services', industryGroup: 'Financial Conglomerates', industry: 'Financial Conglomerates', confidence: 0.85 }],
  ['Financial Services|Shell Companies', { thes1sCode: '99101030', sector: 'Special Classifications', industryGroup: 'Conglomerates & Holding Companies', industry: 'Shell Companies', confidence: 0.85 }],
  ['Real Estate|REIT - Specialty', { thes1sCode: '60101080', sector: 'Real Estate', industryGroup: 'REITs', industry: 'REIT - Specialty', confidence: 0.85 }],
  ['Real Estate|REIT - Industrial', { thes1sCode: '60101030', sector: 'Real Estate', industryGroup: 'REITs', industry: 'REIT - Industrial', confidence: 0.85 }],
  ['Real Estate|REIT - Healthcare Facilities', { thes1sCode: '60101050', sector: 'Real Estate', industryGroup: 'REITs', industry: 'REIT - Healthcare', confidence: 0.85 }],
  ['Real Estate|REIT - Retail', { thes1sCode: '60101040', sector: 'Real Estate', industryGroup: 'REITs', industry: 'REIT - Retail', confidence: 0.85 }],
  ['Real Estate|REIT - Residential', { thes1sCode: '60101010', sector: 'Real Estate', industryGroup: 'REITs', industry: 'REIT - Residential', confidence: 0.85 }],
  ['Real Estate|Real Estate Services', { thes1sCode: '60201010', sector: 'Real Estate', industryGroup: 'Real Estate Services', industry: 'Real Estate Services & Brokerage', confidence: 0.85 }],
  ['Real Estate|REIT - Mortgage', { thes1sCode: '60101110', sector: 'Real Estate', industryGroup: 'REITs', industry: 'REIT - Mortgage', confidence: 0.85 }],
  ['Real Estate|REIT - Diversified', { thes1sCode: '60101090', sector: 'Real Estate', industryGroup: 'REITs', industry: 'REIT - Diversified', confidence: 0.85 }],
  ['Real Estate|REIT - Office', { thes1sCode: '60101020', sector: 'Real Estate', industryGroup: 'REITs', industry: 'REIT - Office', confidence: 0.85 }],
  ['Real Estate|REIT - Hotel & Motel', { thes1sCode: '60101070', sector: 'Real Estate', industryGroup: 'REITs', industry: 'REIT - Hotel & Resort', confidence: 0.85 }],
  ['Real Estate|Real Estate - Development', { thes1sCode: '60201020', sector: 'Real Estate', industryGroup: 'Real Estate Services', industry: 'Real Estate Development', confidence: 0.85 }],
  ['Real Estate|Real Estate - Diversified', { thes1sCode: '60201010', sector: 'Real Estate', industryGroup: 'Real Estate Services', industry: 'Real Estate Services & Brokerage', confidence: 0.85 }]
]);

/**
 * Classify a ticker using Yahoo Finance quoteSummary data.
 * Pure function, no side effects.
 *
 * @param {object} assetProfile - Yahoo assetProfile module data
 * @param {object} priceData - Yahoo price module data
 * @returns {{ status: string, ... }}
 */
export function classifyTicker(assetProfile, priceData) {
  const exchange = priceData?.exchange;
  if (!exchange || !MAJOR_EXCHANGES.has(exchange)) {
    return { status: 'excluded', reason: 'non-major-exchange', exchange };
  }

  const quoteType = priceData?.quoteType;
  if (quoteType && quoteType !== 'EQUITY') {
    return { status: 'excluded', reason: 'non-equity', quoteType };
  }

  const yahooSector = assetProfile?.sector;
  const yahooIndustry = assetProfile?.industry;
  if (!yahooSector || !yahooIndustry) {
    return { status: 'unmapped', reason: 'missing-yahoo-classification' };
  }

  const key = yahooSector + '|' + yahooIndustry;
  const match = YAHOO_TO_THES1S.get(key);
  if (!match) {
    return { status: 'unmapped', reason: 'no-crosswalk-match', yahooSector, yahooIndustry };
  }

  return {
    status: 'classified',
    thes1sCode: match.thes1sCode,
    sector: match.sector,
    industryGroup: match.industryGroup,
    industry: match.industry,
    confidence: match.confidence,
    exchange,
    yahooSector,
    yahooIndustry,
  };
}

export function isNonCommonStock(ticker) {
  return NON_COMMON_STOCK.some(re => re.test(ticker));
}
