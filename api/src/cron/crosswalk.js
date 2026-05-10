// Auto-generated from yahoo-to-thesis-crosswalk.json + thesis-taxonomy-tree.json
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

// Yahoo sector|industry -> Thesis classification
export const YAHOO_TO_THESIS = new Map([
  ['Technology|Semiconductors', { thesisCode: '10301010', sector: 'Technology', industryGroup: 'Semiconductors', industry: 'Semiconductors', confidence: 0.85 }],
  ['Technology|Software - Infrastructure', { thesisCode: '10101020', sector: 'Technology', industryGroup: 'Software', industry: 'Software - Infrastructure', confidence: 0.85 }],
  ['Technology|Consumer Electronics', { thesisCode: '10201010', sector: 'Technology', industryGroup: 'Hardware', industry: 'Consumer Electronics', confidence: 0.85 }],
  ['Technology|Software - Application', { thesisCode: '10101010', sector: 'Technology', industryGroup: 'Software', industry: 'Software - Application', confidence: 0.65 }],
  ['Technology|Semiconductor Equipment & Materials', { thesisCode: '10301020', sector: 'Technology', industryGroup: 'Semiconductors', industry: 'Semiconductor Equipment & Materials', confidence: 0.85 }],
  ['Technology|Computer Hardware', { thesisCode: '10201020', sector: 'Technology', industryGroup: 'Hardware', industry: 'Computer Hardware & Storage', confidence: 0.85 }],
  ['Technology|Communication Equipment', { thesisCode: '10201030', sector: 'Technology', industryGroup: 'Hardware', industry: 'Communication Equipment', confidence: 0.85 }],
  ['Technology|Information Technology Services', { thesisCode: '10501010', sector: 'Technology', industryGroup: 'IT Services', industry: 'Information Technology Services', confidence: 0.85 }],
  ['Technology|Electronic Components', { thesisCode: '10401010', sector: 'Technology', industryGroup: 'Electronic Components', industry: 'Electronic Components', confidence: 0.85 }],
  ['Technology|Scientific & Technical Instruments', { thesisCode: '10201040', sector: 'Technology', industryGroup: 'Hardware', industry: 'Scientific & Technical Instruments', confidence: 0.85 }],
  ['Technology|Solar', { thesisCode: '45201010', sector: 'Energy', industryGroup: 'Renewable Energy', industry: 'Solar Energy', confidence: 0.85 }],
  ['Technology|Electronics & Computer Distributors', { thesisCode: '10601010', sector: 'Technology', industryGroup: 'Technology Distributors', industry: 'Technology Distributors', confidence: 0.85 }],
  ['Communication Services|Internet Content & Information', { thesisCode: '15301010', sector: 'Communication Services', industryGroup: 'Internet & Digital Media', industry: 'Internet Content & Information', confidence: 0.65 }],
  ['Communication Services|Telecom Services', { thesisCode: '15101010', sector: 'Communication Services', industryGroup: 'Telecom', industry: 'Telecom - Diversified', confidence: 0.65 }],
  ['Communication Services|Entertainment', { thesisCode: '15201010', sector: 'Communication Services', industryGroup: 'Media & Entertainment', industry: 'Entertainment - Diversified', confidence: 0.65 }],
  ['Communication Services|Advertising Agencies', { thesisCode: '15201060', sector: 'Communication Services', industryGroup: 'Media & Entertainment', industry: 'Advertising & Marketing Services', confidence: 0.85 }],
  ['Communication Services|Electronic Gaming & Multimedia', { thesisCode: '15201030', sector: 'Communication Services', industryGroup: 'Media & Entertainment', industry: 'Gaming & Interactive Entertainment', confidence: 0.85 }],
  ['Communication Services|Publishing', { thesisCode: '15201050', sector: 'Communication Services', industryGroup: 'Media & Entertainment', industry: 'Publishing & Information Services', confidence: 0.85 }],
  ['Communication Services|Broadcasting', { thesisCode: '15201040', sector: 'Communication Services', industryGroup: 'Media & Entertainment', industry: 'Broadcasting - TV & Radio', confidence: 0.85 }],
  ['Energy|Oil & Gas Integrated', { thesisCode: '45101010', sector: 'Energy', industryGroup: 'Oil & Gas', industry: 'Oil & Gas - Integrated', confidence: 0.85 }],
  ['Energy|Oil & Gas Midstream', { thesisCode: '45101040', sector: 'Energy', industryGroup: 'Oil & Gas', industry: 'Oil & Gas - Midstream', confidence: 0.85 }],
  ['Energy|Oil & Gas E&P', { thesisCode: '45101020', sector: 'Energy', industryGroup: 'Oil & Gas', industry: 'Oil & Gas - Exploration & Production', confidence: 0.85 }],
  ['Energy|Oil & Gas Equipment & Services', { thesisCode: '45101050', sector: 'Energy', industryGroup: 'Oil & Gas', industry: 'Oil & Gas - Equipment & Services', confidence: 0.85 }],
  ['Energy|Oil & Gas Refining & Marketing', { thesisCode: '45101030', sector: 'Energy', industryGroup: 'Oil & Gas', industry: 'Oil & Gas - Refining & Marketing', confidence: 0.85 }],
  ['Energy|Uranium', { thesisCode: '45301020', sector: 'Energy', industryGroup: 'Energy Storage & Distribution', industry: 'Coal & Consumable Fuels', confidence: 0.85 }],
  ['Energy|Oil & Gas Drilling', { thesisCode: '45101060', sector: 'Energy', industryGroup: 'Oil & Gas', industry: 'Oil & Gas - Drilling', confidence: 0.85 }],
  ['Energy|Thermal Coal', { thesisCode: '45301020', sector: 'Energy', industryGroup: 'Energy Storage & Distribution', industry: 'Coal & Consumable Fuels', confidence: 0.85 }],
  ['Healthcare|Drug Manufacturers - General', { thesisCode: '30101010', sector: 'Healthcare', industryGroup: 'Pharmaceuticals', industry: 'Drug Manufacturers - Major', confidence: 0.85 }],
  ['Healthcare|Biotechnology', { thesisCode: '30201010', sector: 'Healthcare', industryGroup: 'Biotechnology', industry: 'Biotechnology', confidence: 0.85 }],
  ['Healthcare|Medical Devices', { thesisCode: '30301010', sector: 'Healthcare', industryGroup: 'Medical Devices & Equipment', industry: 'Medical Devices', confidence: 0.85 }],
  ['Healthcare|Diagnostics & Research', { thesisCode: '30501010', sector: 'Healthcare', industryGroup: 'Diagnostics & Research', industry: 'Diagnostics & Research', confidence: 0.85 }],
  ['Healthcare|Healthcare Plans', { thesisCode: '30401030', sector: 'Healthcare', industryGroup: 'Healthcare Services', industry: 'Healthcare Plans & Insurance', confidence: 0.85 }],
  ['Healthcare|Medical Instruments & Supplies', { thesisCode: '30301020', sector: 'Healthcare', industryGroup: 'Medical Devices & Equipment', industry: 'Medical Instruments & Supplies', confidence: 0.85 }],
  ['Healthcare|Medical Distribution', { thesisCode: '30401040', sector: 'Healthcare', industryGroup: 'Healthcare Services', industry: 'Medical Distribution', confidence: 0.85 }],
  ['Healthcare|Medical Care Facilities', { thesisCode: '30401010', sector: 'Healthcare', industryGroup: 'Healthcare Services', industry: 'Healthcare Providers & Facilities', confidence: 0.85 }],
  ['Healthcare|Drug Manufacturers - Specialty & Generic', { thesisCode: '30101020', sector: 'Healthcare', industryGroup: 'Pharmaceuticals', industry: 'Drug Manufacturers - Specialty & Generic', confidence: 0.85 }],
  ['Healthcare|Health Information Services', { thesisCode: '30401020', sector: 'Healthcare', industryGroup: 'Healthcare Services', industry: 'Health Information Technology', confidence: 0.85 }],
  ['Healthcare|Pharmaceutical Retailers', { thesisCode: '25301030', sector: 'Consumer Defensive', industryGroup: 'Retail - Defensive', industry: 'Retail - Pharmacy & Drug Stores', confidence: 0.85 }],
  ['Utilities|Utilities - Regulated Electric', { thesisCode: '55101010', sector: 'Utilities', industryGroup: 'Electric Utilities', industry: 'Electric Utilities - Regulated', confidence: 0.85 }],
  ['Utilities|Utilities - Independent Power Producers', { thesisCode: '55101020', sector: 'Utilities', industryGroup: 'Electric Utilities', industry: 'Electric Utilities - Independent Power', confidence: 0.85 }],
  ['Utilities|Utilities - Regulated Gas', { thesisCode: '55201010', sector: 'Utilities', industryGroup: 'Gas & Water Utilities', industry: 'Gas Utilities', confidence: 0.85 }],
  ['Utilities|Utilities - Diversified', { thesisCode: '55301010', sector: 'Utilities', industryGroup: 'Multi-Utilities', industry: 'Multi-Utilities', confidence: 0.85 }],
  ['Utilities|Utilities - Renewable', { thesisCode: '55401010', sector: 'Utilities', industryGroup: 'Renewable Utilities', industry: 'Renewable Utilities', confidence: 0.85 }],
  ['Utilities|Utilities - Regulated Water', { thesisCode: '55201020', sector: 'Utilities', industryGroup: 'Gas & Water Utilities', industry: 'Water Utilities', confidence: 0.85 }],
  ['Basic Materials|Gold', { thesisCode: '50201010', sector: 'Basic Materials', industryGroup: 'Metals & Mining', industry: 'Gold Mining', confidence: 0.85 }],
  ['Basic Materials|Specialty Chemicals', { thesisCode: '50101010', sector: 'Basic Materials', industryGroup: 'Chemicals', industry: 'Chemicals - Specialty', confidence: 0.85 }],
  ['Basic Materials|Copper', { thesisCode: '50201030', sector: 'Basic Materials', industryGroup: 'Metals & Mining', industry: 'Copper & Base Metals Mining', confidence: 0.85 }],
  ['Basic Materials|Building Materials', { thesisCode: '50301010', sector: 'Basic Materials', industryGroup: 'Building Materials', industry: 'Building Materials', confidence: 0.85 }],
  ['Basic Materials|Steel', { thesisCode: '50201040', sector: 'Basic Materials', industryGroup: 'Metals & Mining', industry: 'Steel', confidence: 0.85 }],
  ['Basic Materials|Agricultural Inputs', { thesisCode: '50101030', sector: 'Basic Materials', industryGroup: 'Chemicals', industry: 'Chemicals - Agricultural', confidence: 0.85 }],
  ['Basic Materials|Other Industrial Metals & Mining', { thesisCode: '50201060', sector: 'Basic Materials', industryGroup: 'Metals & Mining', industry: 'Other Industrial Metals & Mining', confidence: 0.85 }],
  ['Basic Materials|Chemicals', { thesisCode: '50101020', sector: 'Basic Materials', industryGroup: 'Chemicals', industry: 'Chemicals - Diversified', confidence: 0.85 }],
  ['Basic Materials|Other Precious Metals & Mining', { thesisCode: '50201020', sector: 'Basic Materials', industryGroup: 'Metals & Mining', industry: 'Silver & Precious Metals Mining', confidence: 0.85 }],
  ['Basic Materials|Aluminum', { thesisCode: '50201050', sector: 'Basic Materials', industryGroup: 'Metals & Mining', industry: 'Aluminum', confidence: 0.85 }],
  ['Basic Materials|Silver', { thesisCode: '50201020', sector: 'Basic Materials', industryGroup: 'Metals & Mining', industry: 'Silver & Precious Metals Mining', confidence: 0.85 }],
  ['Basic Materials|Lumber & Wood Production', { thesisCode: '50301020', sector: 'Basic Materials', industryGroup: 'Building Materials', industry: 'Lumber & Wood Products', confidence: 0.85 }],
  ['Basic Materials|Coking Coal', { thesisCode: '45301020', sector: 'Energy', industryGroup: 'Energy Storage & Distribution', industry: 'Coal & Consumable Fuels', confidence: 0.85 }],
  ['Basic Materials|Paper & Paper Products', { thesisCode: '50401010', sector: 'Basic Materials', industryGroup: 'Paper & Packaging', industry: 'Paper & Forest Products', confidence: 0.85 }],
  ['Industrials|Aerospace & Defense', { thesisCode: '40101010', sector: 'Industrials', industryGroup: 'Aerospace & Defense', industry: 'Aerospace & Defense', confidence: 0.85 }],
  ['Industrials|Specialty Industrial Machinery', { thesisCode: '40201010', sector: 'Industrials', industryGroup: 'Industrial Manufacturing', industry: 'Specialty Industrial Machinery', confidence: 0.85 }],
  ['Industrials|Farm & Heavy Construction Machinery', { thesisCode: '40201050', sector: 'Industrials', industryGroup: 'Industrial Manufacturing', industry: 'Farm & Heavy Construction Machinery', confidence: 0.85 }],
  ['Industrials|Railroads', { thesisCode: '40301020', sector: 'Industrials', industryGroup: 'Transportation', industry: 'Railroads', confidence: 0.85 }],
  ['Industrials|Engineering & Construction', { thesisCode: '40401010', sector: 'Industrials', industryGroup: 'Construction & Engineering', industry: 'Engineering & Construction Services', confidence: 0.85 }],
  ['Industrials|Building Products & Equipment', { thesisCode: '20501020', sector: 'Consumer Cyclical', industryGroup: 'Housing & Construction', industry: 'Building Products', confidence: 0.85 }],
  ['Industrials|Specialty Business Services', { thesisCode: '40501030', sector: 'Industrials', industryGroup: 'Business Services', industry: 'Commercial Services & Supplies', confidence: 0.85 }],
  ['Industrials|Electrical Equipment & Parts', { thesisCode: '40201030', sector: 'Industrials', industryGroup: 'Industrial Manufacturing', industry: 'Electrical Equipment', confidence: 0.85 }],
  ['Industrials|Conglomerates', { thesisCode: '99101010', sector: 'Special Classifications', industryGroup: 'Conglomerates & Holding Companies', industry: 'Conglomerates', confidence: 0.85 }],
  ['Industrials|Industrial Distribution', { thesisCode: '40501050', sector: 'Industrials', industryGroup: 'Business Services', industry: 'Industrial Distribution', confidence: 0.85 }],
  ['Industrials|Integrated Freight & Logistics', { thesisCode: '40301050', sector: 'Industrials', industryGroup: 'Transportation', industry: 'Logistics & Supply Chain', confidence: 0.85 }],
  ['Industrials|Waste Management', { thesisCode: '40601010', sector: 'Industrials', industryGroup: 'Environmental Services', industry: 'Waste Management', confidence: 0.85 }],
  ['Industrials|Rental & Leasing Services', { thesisCode: '40701010', sector: 'Industrials', industryGroup: 'Rental & Leasing', industry: 'Rental & Leasing Services', confidence: 0.85 }],
  ['Industrials|Airlines', { thesisCode: '40301010', sector: 'Industrials', industryGroup: 'Transportation', industry: 'Airlines', confidence: 0.85 }],
  ['Industrials|Trucking', { thesisCode: '40301030', sector: 'Industrials', industryGroup: 'Transportation', industry: 'Trucking & Freight', confidence: 0.85 }],
  ['Industrials|Tools & Accessories', { thesisCode: '40201060', sector: 'Industrials', industryGroup: 'Industrial Manufacturing', industry: 'Tools & Accessories', confidence: 0.85 }],
  ['Industrials|Metal Fabrication', { thesisCode: '40201040', sector: 'Industrials', industryGroup: 'Industrial Manufacturing', industry: 'Metal Fabrication', confidence: 0.85 }],
  ['Industrials|Consulting Services', { thesisCode: '40501010', sector: 'Industrials', industryGroup: 'Business Services', industry: 'Consulting & Professional Services', confidence: 0.85 }],
  ['Industrials|Marine Shipping', { thesisCode: '40301040', sector: 'Industrials', industryGroup: 'Transportation', industry: 'Marine Shipping', confidence: 0.85 }],
  ['Industrials|Security & Protection Services', { thesisCode: '40501040', sector: 'Industrials', industryGroup: 'Business Services', industry: 'Security & Protection Services', confidence: 0.85 }],
  ['Industrials|Pollution & Treatment Controls', { thesisCode: '40601020', sector: 'Industrials', industryGroup: 'Environmental Services', industry: 'Environmental & Facilities Services', confidence: 0.85 }],
  ['Industrials|Airports & Air Services', { thesisCode: '40301070', sector: 'Industrials', industryGroup: 'Transportation', industry: 'Airports & Air Services', confidence: 0.85 }],
  ['Industrials|Staffing & Employment Services', { thesisCode: '40501020', sector: 'Industrials', industryGroup: 'Business Services', industry: 'Staffing & Employment Services', confidence: 0.85 }],
  ['Industrials|Business Equipment & Supplies', { thesisCode: '40501030', sector: 'Industrials', industryGroup: 'Business Services', industry: 'Commercial Services & Supplies', confidence: 0.85 }],
  ['Industrials|Infrastructure Operations', { thesisCode: '40401030', sector: 'Industrials', industryGroup: 'Construction & Engineering', industry: 'Infrastructure Operations', confidence: 0.85 }],
  ['Consumer Cyclical|Internet Retail', { thesisCode: '20301010', sector: 'Consumer Cyclical', industryGroup: 'Retail - Cyclical', industry: 'Retail - Broadline & E-Commerce', confidence: 0.85 }],
  ['Consumer Cyclical|Auto Manufacturers', { thesisCode: '20101010', sector: 'Consumer Cyclical', industryGroup: 'Auto & Vehicles', industry: 'Auto Manufacturers', confidence: 0.65 }],
  ['Consumer Cyclical|Restaurants', { thesisCode: '20401020', sector: 'Consumer Cyclical', industryGroup: 'Travel & Leisure', industry: 'Restaurants & Dining', confidence: 0.85 }],
  ['Consumer Cyclical|Home Improvement Retail', { thesisCode: '20301030', sector: 'Consumer Cyclical', industryGroup: 'Retail - Cyclical', industry: 'Retail - Home Improvement', confidence: 0.85 }],
  ['Consumer Cyclical|Travel Services', { thesisCode: '20401030', sector: 'Consumer Cyclical', industryGroup: 'Travel & Leisure', industry: 'Travel & Booking Services', confidence: 0.85 }],
  ['Consumer Cyclical|Apparel Retail', { thesisCode: '20301050', sector: 'Consumer Cyclical', industryGroup: 'Retail - Cyclical', industry: 'Retail - Apparel & Accessories', confidence: 0.85 }],
  ['Consumer Cyclical|Auto Parts', { thesisCode: '20101030', sector: 'Consumer Cyclical', industryGroup: 'Auto & Vehicles', industry: 'Auto Parts & Equipment', confidence: 0.85 }],
  ['Consumer Cyclical|Specialty Retail', { thesisCode: '20301020', sector: 'Consumer Cyclical', industryGroup: 'Retail - Cyclical', industry: 'Retail - Specialty', confidence: 0.85 }],
  ['Consumer Cyclical|Lodging', { thesisCode: '20401010', sector: 'Consumer Cyclical', industryGroup: 'Travel & Leisure', industry: 'Lodging & Resorts', confidence: 0.85 }],
  ['Consumer Cyclical|Residential Construction', { thesisCode: '20501010', sector: 'Consumer Cyclical', industryGroup: 'Housing & Construction', industry: 'Homebuilders', confidence: 0.85 }],
  ['Consumer Cyclical|Packaging & Containers', { thesisCode: '50401020', sector: 'Basic Materials', industryGroup: 'Paper & Packaging', industry: 'Packaging & Containers', confidence: 0.85 }],
  ['Consumer Cyclical|Auto & Truck Dealerships', { thesisCode: '20101040', sector: 'Consumer Cyclical', industryGroup: 'Auto & Vehicles', industry: 'Auto Dealerships', confidence: 0.85 }],
  ['Consumer Cyclical|Footwear & Accessories', { thesisCode: '20201040', sector: 'Consumer Cyclical', industryGroup: 'Apparel & Luxury', industry: 'Footwear & Accessories', confidence: 0.85 }],
  ['Consumer Cyclical|Resorts & Casinos', { thesisCode: '20401050', sector: 'Consumer Cyclical', industryGroup: 'Travel & Leisure', industry: 'Casinos & Gaming', confidence: 0.85 }],
  ['Consumer Cyclical|Leisure', { thesisCode: '20401040', sector: 'Consumer Cyclical', industryGroup: 'Travel & Leisure', industry: 'Leisure Products & Activities', confidence: 0.85 }],
  ['Consumer Cyclical|Apparel Manufacturing', { thesisCode: '20201030', sector: 'Consumer Cyclical', industryGroup: 'Apparel & Luxury', industry: 'Apparel - Mass Market', confidence: 0.65 }],
  ['Consumer Cyclical|Furnishings, Fixtures & Appliances', { thesisCode: '20501030', sector: 'Consumer Cyclical', industryGroup: 'Housing & Construction', industry: 'Furnishings & Home Décor', confidence: 0.85 }],
  ['Consumer Cyclical|Gambling', { thesisCode: '20401050', sector: 'Consumer Cyclical', industryGroup: 'Travel & Leisure', industry: 'Casinos & Gaming', confidence: 0.85 }],
  ['Consumer Cyclical|Personal Services', { thesisCode: '20601010', sector: 'Consumer Cyclical', industryGroup: 'Consumer Services', industry: 'Personal Services', confidence: 0.85 }],
  ['Consumer Cyclical|Luxury Goods', { thesisCode: '20201020', sector: 'Consumer Cyclical', industryGroup: 'Apparel & Luxury', industry: 'Apparel - Fashion & Luxury', confidence: 0.85 }],
  ['Consumer Cyclical|Recreational Vehicles', { thesisCode: '20101050', sector: 'Consumer Cyclical', industryGroup: 'Auto & Vehicles', industry: 'Recreational Vehicles', confidence: 0.85 }],
  ['Consumer Cyclical|Department Stores', { thesisCode: '20301010', sector: 'Consumer Cyclical', industryGroup: 'Retail - Cyclical', industry: 'Retail - Broadline & E-Commerce', confidence: 0.85 }],
  ['Consumer Cyclical|Textile Manufacturing', { thesisCode: '20201050', sector: 'Consumer Cyclical', industryGroup: 'Apparel & Luxury', industry: 'Textile Manufacturing', confidence: 0.85 }],
  ['Consumer Defensive|Packaged Foods', { thesisCode: '25101030', sector: 'Consumer Defensive', industryGroup: 'Food & Beverage', industry: 'Food - Packaged & Processed', confidence: 0.85 }],
  ['Consumer Defensive|Education & Training Services', { thesisCode: '20601020', sector: 'Consumer Cyclical', industryGroup: 'Consumer Services', industry: 'Education & Training Services', confidence: 0.85 }],
  ['Consumer Defensive|Beverages - Wineries & Distilleries', { thesisCode: '25101020', sector: 'Consumer Defensive', industryGroup: 'Food & Beverage', industry: 'Beverages - Alcoholic', confidence: 0.85 }],
  ['Consumer Defensive|Beverages - Brewers', { thesisCode: '25101020', sector: 'Consumer Defensive', industryGroup: 'Food & Beverage', industry: 'Beverages - Alcoholic', confidence: 0.85 }],
  ['Consumer Defensive|Discount Stores', { thesisCode: '20301040', sector: 'Consumer Cyclical', industryGroup: 'Retail - Cyclical', industry: 'Retail - Discount & Dollar Stores', confidence: 0.85 }],
  ['Consumer Defensive|Food Distribution', { thesisCode: '25101030', sector: 'Consumer Defensive', industryGroup: 'Food & Beverage', industry: 'Food - Packaged & Processed', confidence: 0.85 }],
  ['Consumer Defensive|Grocery Stores', { thesisCode: '25301010', sector: 'Consumer Defensive', industryGroup: 'Retail - Defensive', industry: 'Retail - Grocery & Supermarkets', confidence: 0.85 }],
  ['Consumer Defensive|Household & Personal Products', { thesisCode: '25201010', sector: 'Consumer Defensive', industryGroup: 'Household & Personal Products', industry: 'Household Products', confidence: 0.65 }],
  ['Consumer Defensive|Beverages - Non-Alcoholic', { thesisCode: '25101010', sector: 'Consumer Defensive', industryGroup: 'Food & Beverage', industry: 'Beverages - Non-Alcoholic', confidence: 0.85 }],
  ['Consumer Defensive|Farm Products', { thesisCode: '25401010', sector: 'Consumer Defensive', industryGroup: 'Agriculture', industry: 'Agricultural Products & Processing', confidence: 0.85 }],
  ['Consumer Defensive|Confectioners', { thesisCode: '25101030', sector: 'Consumer Defensive', industryGroup: 'Food & Beverage', industry: 'Food - Packaged & Processed', confidence: 0.85 }],
  ['Consumer Defensive|Tobacco', { thesisCode: '25201030', sector: 'Consumer Defensive', industryGroup: 'Household & Personal Products', industry: 'Tobacco', confidence: 0.85 }],
  ['Financial Services|Banks - Diversified', { thesisCode: '35101010', sector: 'Financial Services', industryGroup: 'Banks', industry: 'Banks - Diversified', confidence: 0.85 }],
  ['Financial Services|Credit Services', { thesisCode: '35401010', sector: 'Financial Services', industryGroup: 'Diversified Financials', industry: 'Credit Services & Lending', confidence: 0.85 }],
  ['Financial Services|Asset Management', { thesisCode: '35301010', sector: 'Financial Services', industryGroup: 'Capital Markets', industry: 'Asset Management', confidence: 0.85 }],
  ['Financial Services|Insurance - Diversified', { thesisCode: '35201010', sector: 'Financial Services', industryGroup: 'Insurance', industry: 'Insurance - Life', confidence: 0.65 }],
  ['Financial Services|Capital Markets', { thesisCode: '35301020', sector: 'Financial Services', industryGroup: 'Capital Markets', industry: 'Investment Banking & Brokerage', confidence: 0.85 }],
  ['Financial Services|Banks - Regional', { thesisCode: '35101020', sector: 'Financial Services', industryGroup: 'Banks', industry: 'Banks - Regional', confidence: 0.85 }],
  ['Financial Services|Financial Data & Stock Exchanges', { thesisCode: '35301030', sector: 'Financial Services', industryGroup: 'Capital Markets', industry: 'Financial Exchanges & Data', confidence: 0.85 }],
  ['Financial Services|Insurance - Property & Casualty', { thesisCode: '35201020', sector: 'Financial Services', industryGroup: 'Insurance', industry: 'Insurance - Property & Casualty', confidence: 0.85 }],
  ['Financial Services|Insurance Brokers', { thesisCode: '35201050', sector: 'Financial Services', industryGroup: 'Insurance', industry: 'Insurance Brokers & Services', confidence: 0.85 }],
  ['Financial Services|Insurance - Life', { thesisCode: '35201010', sector: 'Financial Services', industryGroup: 'Insurance', industry: 'Insurance - Life', confidence: 0.85 }],
  ['Financial Services|Insurance - Specialty', { thesisCode: '35201030', sector: 'Financial Services', industryGroup: 'Insurance', industry: 'Insurance - Specialty', confidence: 0.85 }],
  ['Financial Services|Mortgage Finance', { thesisCode: '35401010', sector: 'Financial Services', industryGroup: 'Diversified Financials', industry: 'Credit Services & Lending', confidence: 0.85 }],
  ['Financial Services|Insurance - Reinsurance', { thesisCode: '35201040', sector: 'Financial Services', industryGroup: 'Insurance', industry: 'Insurance - Reinsurance', confidence: 0.85 }],
  ['Financial Services|Financial Conglomerates', { thesisCode: '35601010', sector: 'Financial Services', industryGroup: 'Financial Conglomerates', industry: 'Financial Conglomerates', confidence: 0.85 }],
  ['Financial Services|Shell Companies', { thesisCode: '99101030', sector: 'Special Classifications', industryGroup: 'Conglomerates & Holding Companies', industry: 'Shell Companies', confidence: 0.85 }],
  ['Real Estate|REIT - Specialty', { thesisCode: '60101080', sector: 'Real Estate', industryGroup: 'REITs', industry: 'REIT - Specialty', confidence: 0.85 }],
  ['Real Estate|REIT - Industrial', { thesisCode: '60101030', sector: 'Real Estate', industryGroup: 'REITs', industry: 'REIT - Industrial', confidence: 0.85 }],
  ['Real Estate|REIT - Healthcare Facilities', { thesisCode: '60101050', sector: 'Real Estate', industryGroup: 'REITs', industry: 'REIT - Healthcare', confidence: 0.85 }],
  ['Real Estate|REIT - Retail', { thesisCode: '60101040', sector: 'Real Estate', industryGroup: 'REITs', industry: 'REIT - Retail', confidence: 0.85 }],
  ['Real Estate|REIT - Residential', { thesisCode: '60101010', sector: 'Real Estate', industryGroup: 'REITs', industry: 'REIT - Residential', confidence: 0.85 }],
  ['Real Estate|Real Estate Services', { thesisCode: '60201010', sector: 'Real Estate', industryGroup: 'Real Estate Services', industry: 'Real Estate Services & Brokerage', confidence: 0.85 }],
  ['Real Estate|REIT - Mortgage', { thesisCode: '60101110', sector: 'Real Estate', industryGroup: 'REITs', industry: 'REIT - Mortgage', confidence: 0.85 }],
  ['Real Estate|REIT - Diversified', { thesisCode: '60101090', sector: 'Real Estate', industryGroup: 'REITs', industry: 'REIT - Diversified', confidence: 0.85 }],
  ['Real Estate|REIT - Office', { thesisCode: '60101020', sector: 'Real Estate', industryGroup: 'REITs', industry: 'REIT - Office', confidence: 0.85 }],
  ['Real Estate|REIT - Hotel & Motel', { thesisCode: '60101070', sector: 'Real Estate', industryGroup: 'REITs', industry: 'REIT - Hotel & Resort', confidence: 0.85 }],
  ['Real Estate|Real Estate - Development', { thesisCode: '60201020', sector: 'Real Estate', industryGroup: 'Real Estate Services', industry: 'Real Estate Development', confidence: 0.85 }],
  ['Real Estate|Real Estate - Diversified', { thesisCode: '60201010', sector: 'Real Estate', industryGroup: 'Real Estate Services', industry: 'Real Estate Services & Brokerage', confidence: 0.85 }]
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
  const match = YAHOO_TO_THESIS.get(key);
  if (!match) {
    return { status: 'unmapped', reason: 'no-crosswalk-match', yahooSector, yahooIndustry };
  }

  return {
    status: 'classified',
    thesisCode: match.thesisCode,
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
