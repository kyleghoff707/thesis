// ─── SIC-to-Sector/Industry Classification ───────────────────────────
// Maps 4-digit SIC codes to Morningstar-style sector/industry taxonomy
// with NAICS crosswalk. Covers ~250 most common SIC codes for publicly
// traded US companies. Falls back to 2-digit major group for unmapped codes.

export const SIC_MAP = {
  // ═══ TECHNOLOGY ═══════════════════════════════════════════════════

  // Hardware
  '3571': { sector: 'Technology', industryGroup: 'Hardware', industry: 'Consumer Electronics', naics: '334220' },
  '3572': { sector: 'Technology', industryGroup: 'Hardware', industry: 'Computer Storage Devices', naics: '334112' },
  '3575': { sector: 'Technology', industryGroup: 'Hardware', industry: 'Computer Terminals', naics: '334118' },
  '3577': { sector: 'Technology', industryGroup: 'Hardware', industry: 'Computer Peripherals', naics: '334118' },
  '3578': { sector: 'Technology', industryGroup: 'Hardware', industry: 'Calculating & Accounting Machines', naics: '334119' },
  '3579': { sector: 'Technology', industryGroup: 'Hardware', industry: 'Office Machines', naics: '333318' },

  // Semiconductors
  '3674': { sector: 'Technology', industryGroup: 'Semiconductors', industry: 'Semiconductors', naics: '334413' },
  '3672': { sector: 'Technology', industryGroup: 'Semiconductors', industry: 'Printed Circuit Boards', naics: '334412' },
  '3559': { sector: 'Technology', industryGroup: 'Semiconductors', industry: 'Semiconductor Equipment & Materials', naics: '334419' },

  // Software
  '7372': { sector: 'Technology', industryGroup: 'Software - Application', industry: 'Software - Application', naics: '511210' },
  '7371': { sector: 'Technology', industryGroup: 'Software - Infrastructure', industry: 'Information Technology Services', naics: '541512' },
  '7373': { sector: 'Technology', industryGroup: 'Software - Infrastructure', industry: 'Computer Systems Design', naics: '541512' },
  '7374': { sector: 'Technology', industryGroup: 'Software - Infrastructure', industry: 'Internet Services & Infrastructure', naics: '518210' },
  '7376': { sector: 'Technology', industryGroup: 'Software - Infrastructure', industry: 'Computer Facilities Management', naics: '541513' },
  '7377': { sector: 'Technology', industryGroup: 'Hardware', industry: 'Computer Rental & Leasing', naics: '532420' },
  '7378': { sector: 'Technology', industryGroup: 'Software - Infrastructure', industry: 'Computer Maintenance & Repair', naics: '811212' },
  '7379': { sector: 'Technology', industryGroup: 'Software - Infrastructure', industry: 'Computer Services', naics: '541519' },
  '5112': { sector: 'Technology', industryGroup: 'Software - Application', industry: 'Software - Application', naics: '511210' },

  // Electronic Components
  '3679': { sector: 'Technology', industryGroup: 'Electronic Components', industry: 'Electronic Components', naics: '334419' },
  '3678': { sector: 'Technology', industryGroup: 'Electronic Components', industry: 'Electronic Connectors', naics: '334417' },
  '3676': { sector: 'Technology', industryGroup: 'Electronic Components', industry: 'Electronic Resistors', naics: '334415' },
  '3677': { sector: 'Technology', industryGroup: 'Electronic Components', industry: 'Electronic Coils & Transformers', naics: '334416' },

  // Communication Equipment
  '3661': { sector: 'Technology', industryGroup: 'Communication Equipment', industry: 'Communication Equipment', naics: '334210' },
  '3663': { sector: 'Technology', industryGroup: 'Communication Equipment', industry: 'Radio & TV Broadcasting Equipment', naics: '334220' },
  '3669': { sector: 'Technology', industryGroup: 'Communication Equipment', industry: 'Communication Equipment', naics: '334290' },

  // Scientific & Technical Instruments
  '3825': { sector: 'Technology', industryGroup: 'Scientific & Technical Instruments', industry: 'Scientific & Technical Instruments', naics: '334516' },
  '3827': { sector: 'Technology', industryGroup: 'Scientific & Technical Instruments', industry: 'Optical Instruments & Lenses', naics: '333314' },
  '3812': { sector: 'Technology', industryGroup: 'Aerospace & Defense', industry: 'Aerospace & Defense Electronics', naics: '334511' },
  '3699': { sector: 'Technology', industryGroup: 'Electronic Components', industry: 'Electrical Equipment & Parts', naics: '335999' },

  // Technology Distributors
  '5045': { sector: 'Technology', industryGroup: 'Technology Distributors', industry: 'Technology Distributors', naics: '423430' },
  '5065': { sector: 'Technology', industryGroup: 'Technology Distributors', industry: 'Electronic Parts Distribution', naics: '423690' },
  '5734': { sector: 'Technology', industryGroup: 'Technology Distributors', industry: 'Computer & Software Stores', naics: '443142' },

  // ═══ CONSUMER DEFENSIVE ═══════════════════════════════════════════

  // Beverages
  '2080': { sector: 'Consumer Defensive', industryGroup: 'Beverages', industry: 'Beverages - Diversified', naics: '312100' },
  '2082': { sector: 'Consumer Defensive', industryGroup: 'Beverages - Alcoholic', industry: 'Beverages - Brewers', naics: '312120' },
  '2084': { sector: 'Consumer Defensive', industryGroup: 'Beverages - Alcoholic', industry: 'Beverages - Wineries & Distilleries', naics: '312130' },
  '2085': { sector: 'Consumer Defensive', industryGroup: 'Beverages - Alcoholic', industry: 'Beverages - Wineries & Distilleries', naics: '312140' },
  '2086': { sector: 'Consumer Defensive', industryGroup: 'Beverages - Non-Alcoholic', industry: 'Beverages - Non-Alcoholic', naics: '312111' },

  // Food Products
  '2000': { sector: 'Consumer Defensive', industryGroup: 'Food Products', industry: 'Packaged Foods', naics: '311000' },
  '2010': { sector: 'Consumer Defensive', industryGroup: 'Food Products', industry: 'Meat Products', naics: '311611' },
  '2011': { sector: 'Consumer Defensive', industryGroup: 'Food Products', industry: 'Meat Packing Plants', naics: '311611' },
  '2013': { sector: 'Consumer Defensive', industryGroup: 'Food Products', industry: 'Sausages & Prepared Meats', naics: '311612' },
  '2015': { sector: 'Consumer Defensive', industryGroup: 'Food Products', industry: 'Poultry Slaughtering & Processing', naics: '311615' },
  '2020': { sector: 'Consumer Defensive', industryGroup: 'Food Products', industry: 'Dairy Products', naics: '311500' },
  '2024': { sector: 'Consumer Defensive', industryGroup: 'Food Products', industry: 'Frozen Desserts', naics: '311520' },
  '2030': { sector: 'Consumer Defensive', industryGroup: 'Food Products', industry: 'Canned & Preserved Fruits & Vegetables', naics: '311421' },
  '2033': { sector: 'Consumer Defensive', industryGroup: 'Food Products', industry: 'Canned Fruits & Vegetables', naics: '311421' },
  '2040': { sector: 'Consumer Defensive', industryGroup: 'Food Products', industry: 'Grain Mill Products', naics: '311210' },
  '2041': { sector: 'Consumer Defensive', industryGroup: 'Food Products', industry: 'Flour & Grain Mill Products', naics: '311211' },
  '2043': { sector: 'Consumer Defensive', industryGroup: 'Food Products', industry: 'Cereal Breakfast Foods', naics: '311230' },
  '2050': { sector: 'Consumer Defensive', industryGroup: 'Food Products', industry: 'Bakery Products', naics: '311810' },
  '2052': { sector: 'Consumer Defensive', industryGroup: 'Food Products', industry: 'Cookies & Crackers', naics: '311821' },
  '2060': { sector: 'Consumer Defensive', industryGroup: 'Food Products', industry: 'Sugar & Confectionery', naics: '311300' },
  '2064': { sector: 'Consumer Defensive', industryGroup: 'Food Products', industry: 'Candy & Confectionery', naics: '311340' },
  '2070': { sector: 'Consumer Defensive', industryGroup: 'Food Products', industry: 'Fats & Oils', naics: '311225' },
  '2090': { sector: 'Consumer Defensive', industryGroup: 'Food Products', industry: 'Packaged Foods', naics: '311990' },
  '2095': { sector: 'Consumer Defensive', industryGroup: 'Food Products', industry: 'Coffee', naics: '311920' },
  '2099': { sector: 'Consumer Defensive', industryGroup: 'Food Products', industry: 'Packaged Foods', naics: '311999' },

  // Tobacco
  '2111': { sector: 'Consumer Defensive', industryGroup: 'Tobacco', industry: 'Tobacco', naics: '312230' },

  // Household & Personal Products
  '2840': { sector: 'Consumer Defensive', industryGroup: 'Household & Personal Products', industry: 'Household & Personal Products', naics: '325611' },
  '2841': { sector: 'Consumer Defensive', industryGroup: 'Household & Personal Products', industry: 'Soap & Cleaning Compounds', naics: '325611' },
  '2842': { sector: 'Consumer Defensive', industryGroup: 'Household & Personal Products', industry: 'Specialty Cleaning Products', naics: '325612' },
  '2844': { sector: 'Consumer Defensive', industryGroup: 'Household & Personal Products', industry: 'Perfumes, Cosmetics & Toiletries', naics: '325620' },

  // Retail - Defensive
  '5411': { sector: 'Consumer Defensive', industryGroup: 'Retail - Defensive', industry: 'Grocery Stores', naics: '445110' },
  '5331': { sector: 'Consumer Defensive', industryGroup: 'Retail - Defensive', industry: 'Discount Stores', naics: '452210' },
  '5912': { sector: 'Consumer Defensive', industryGroup: 'Retail - Defensive', industry: 'Pharmaceutical Retailers', naics: '446110' },
  '5399': { sector: 'Consumer Defensive', industryGroup: 'Retail - Defensive', industry: 'General Merchandise Stores', naics: '452990' },
  '5310': { sector: 'Consumer Defensive', industryGroup: 'Retail - Defensive', industry: 'Department Stores', naics: '452111' },
  '5141': { sector: 'Consumer Defensive', industryGroup: 'Food Distribution', industry: 'Food Distribution', naics: '424410' },
  '5140': { sector: 'Consumer Defensive', industryGroup: 'Food Distribution', industry: 'Food Distribution', naics: '424400' },
  '5149': { sector: 'Consumer Defensive', industryGroup: 'Food Distribution', industry: 'Grocery Distribution', naics: '424490' },

  // ═══ CONSUMER CYCLICAL ═════════════════════════════════════════════

  // Auto
  '3711': { sector: 'Consumer Cyclical', industryGroup: 'Auto Manufacturers', industry: 'Auto Manufacturers', naics: '336111' },
  '3713': { sector: 'Consumer Cyclical', industryGroup: 'Auto Manufacturers', industry: 'Truck & Bus Bodies', naics: '336211' },
  '3714': { sector: 'Consumer Cyclical', industryGroup: 'Auto Parts', industry: 'Auto Parts', naics: '336310' },
  '3716': { sector: 'Consumer Cyclical', industryGroup: 'Auto Manufacturers', industry: 'Motor Homes', naics: '336213' },
  '5010': { sector: 'Consumer Cyclical', industryGroup: 'Auto Parts', industry: 'Auto Parts & Supplies', naics: '423120' },
  '5013': { sector: 'Consumer Cyclical', industryGroup: 'Auto Parts', industry: 'Auto Parts & Supplies', naics: '423120' },
  '5511': { sector: 'Consumer Cyclical', industryGroup: 'Auto Dealers', industry: 'Auto Dealerships', naics: '441110' },
  '5521': { sector: 'Consumer Cyclical', industryGroup: 'Auto Dealers', industry: 'Used Car Dealers', naics: '441120' },
  '3592': { sector: 'Consumer Cyclical', industryGroup: 'Auto Parts', industry: 'Carburetors & Engine Parts', naics: '336310' },

  // Apparel
  '2300': { sector: 'Consumer Cyclical', industryGroup: 'Apparel Manufacturing', industry: 'Apparel Manufacturing', naics: '315000' },
  '2320': { sector: 'Consumer Cyclical', industryGroup: 'Apparel Manufacturing', industry: "Men's Furnishings", naics: '315220' },
  '2330': { sector: 'Consumer Cyclical', industryGroup: 'Apparel Manufacturing', industry: "Women's Outerwear", naics: '315240' },
  '3140': { sector: 'Consumer Cyclical', industryGroup: 'Apparel Manufacturing', industry: 'Footwear', naics: '316210' },
  '3021': { sector: 'Consumer Cyclical', industryGroup: 'Apparel Manufacturing', industry: 'Athletic Footwear', naics: '316210' },
  '5651': { sector: 'Consumer Cyclical', industryGroup: 'Apparel Retail', industry: 'Apparel Retail', naics: '448140' },
  '5600': { sector: 'Consumer Cyclical', industryGroup: 'Apparel Retail', industry: 'Apparel Retail', naics: '448100' },
  '5661': { sector: 'Consumer Cyclical', industryGroup: 'Apparel Retail', industry: 'Shoe Stores', naics: '448210' },

  // Restaurants
  '5812': { sector: 'Consumer Cyclical', industryGroup: 'Restaurants', industry: 'Restaurants', naics: '722513' },

  // Home Improvement
  '5211': { sector: 'Consumer Cyclical', industryGroup: 'Home Improvement Retail', industry: 'Home Improvement Retail', naics: '444110' },
  '5231': { sector: 'Consumer Cyclical', industryGroup: 'Home Improvement Retail', industry: 'Paint & Wallpaper Stores', naics: '444120' },

  // Specialty Retail
  '5944': { sector: 'Consumer Cyclical', industryGroup: 'Specialty Retail', industry: 'Jewelry Stores', naics: '448310' },
  '5940': { sector: 'Consumer Cyclical', industryGroup: 'Specialty Retail', industry: 'Sporting Goods', naics: '451110' },
  '5945': { sector: 'Consumer Cyclical', industryGroup: 'Specialty Retail', industry: 'Hobby, Toy & Game Shops', naics: '451120' },
  '5731': { sector: 'Consumer Cyclical', industryGroup: 'Specialty Retail', industry: 'Consumer Electronics Stores', naics: '443142' },
  '5700': { sector: 'Consumer Cyclical', industryGroup: 'Specialty Retail', industry: 'Home Furnishings Retail', naics: '442000' },
  '5712': { sector: 'Consumer Cyclical', industryGroup: 'Specialty Retail', industry: 'Furniture Stores', naics: '442110' },
  '5961': { sector: 'Consumer Cyclical', industryGroup: 'Internet Retail', industry: 'Internet Retail', naics: '454111' },

  // Leisure
  '3944': { sector: 'Consumer Cyclical', industryGroup: 'Leisure', industry: 'Toys & Games', naics: '339930' },
  '3949': { sector: 'Consumer Cyclical', industryGroup: 'Leisure', industry: 'Sporting & Athletic Goods', naics: '339920' },
  '7011': { sector: 'Consumer Cyclical', industryGroup: 'Lodging', industry: 'Lodging', naics: '721110' },
  '7990': { sector: 'Consumer Cyclical', industryGroup: 'Leisure', industry: 'Amusement & Recreation', naics: '713990' },
  '7941': { sector: 'Consumer Cyclical', industryGroup: 'Leisure', industry: 'Professional Sports Clubs', naics: '711211' },

  // Furnishings & Fixtures
  '2510': { sector: 'Consumer Cyclical', industryGroup: 'Furnishings, Fixtures & Appliances', industry: 'Household Furniture', naics: '337121' },
  '2520': { sector: 'Consumer Cyclical', industryGroup: 'Furnishings, Fixtures & Appliances', industry: 'Office Furniture', naics: '337211' },
  '3589': { sector: 'Consumer Cyclical', industryGroup: 'Furnishings, Fixtures & Appliances', industry: 'Appliances', naics: '333319' },
  '3631': { sector: 'Consumer Cyclical', industryGroup: 'Furnishings, Fixtures & Appliances', industry: 'Household Cooking Equipment', naics: '335221' },
  '3634': { sector: 'Consumer Cyclical', industryGroup: 'Furnishings, Fixtures & Appliances', industry: 'Housewares & Accessories', naics: '335211' },
  '3639': { sector: 'Consumer Cyclical', industryGroup: 'Furnishings, Fixtures & Appliances', industry: 'Household Appliances', naics: '335228' },

  // Textiles
  '2200': { sector: 'Consumer Cyclical', industryGroup: 'Textiles', industry: 'Textile Manufacturing', naics: '313000' },
  '2211': { sector: 'Consumer Cyclical', industryGroup: 'Textiles', industry: 'Broadwoven Fabric Mills', naics: '313210' },
  '2281': { sector: 'Consumer Cyclical', industryGroup: 'Textiles', industry: 'Yarn Throwing & Winding', naics: '313110' },

  // ═══ HEALTHCARE ════════════════════════════════════════════════════

  // Drug Manufacturers
  '2833': { sector: 'Healthcare', industryGroup: 'Drug Manufacturers', industry: 'Drug Manufacturers - General', naics: '325411' },
  '2834': { sector: 'Healthcare', industryGroup: 'Drug Manufacturers', industry: 'Drug Manufacturers - General', naics: '325411' },
  '2835': { sector: 'Healthcare', industryGroup: 'Diagnostics & Research', industry: 'Diagnostics & Research', naics: '325413' },
  '2836': { sector: 'Healthcare', industryGroup: 'Drug Manufacturers', industry: 'Drug Manufacturers - Specialty & Generic', naics: '325414' },

  // Medical Devices
  '3841': { sector: 'Healthcare', industryGroup: 'Medical Devices', industry: 'Medical Devices', naics: '339112' },
  '3842': { sector: 'Healthcare', industryGroup: 'Medical Devices', industry: 'Orthopedic & Prosthetic Appliances', naics: '339113' },
  '3845': { sector: 'Healthcare', industryGroup: 'Medical Devices', industry: 'Electromedical Equipment', naics: '334510' },
  '3844': { sector: 'Healthcare', industryGroup: 'Medical Devices', industry: 'X-Ray Apparatus', naics: '334517' },
  '3851': { sector: 'Healthcare', industryGroup: 'Medical Devices', industry: 'Ophthalmic Goods', naics: '339115' },

  // Healthcare Services
  '8000': { sector: 'Healthcare', industryGroup: 'Healthcare Plans', industry: 'Healthcare Services', naics: '621000' },
  '8011': { sector: 'Healthcare', industryGroup: 'Healthcare Plans', industry: 'Medical Services', naics: '621111' },
  '8049': { sector: 'Healthcare', industryGroup: 'Healthcare Plans', industry: 'Health Services', naics: '621399' },
  '8060': { sector: 'Healthcare', industryGroup: 'Healthcare Plans', industry: 'Hospitals', naics: '622110' },
  '8062': { sector: 'Healthcare', industryGroup: 'Healthcare Plans', industry: 'Hospitals - General', naics: '622110' },
  '8071': { sector: 'Healthcare', industryGroup: 'Healthcare Plans', industry: 'Medical Laboratories', naics: '621511' },
  '8082': { sector: 'Healthcare', industryGroup: 'Healthcare Plans', industry: 'Home Health Care', naics: '621610' },
  '8090': { sector: 'Healthcare', industryGroup: 'Healthcare Plans', industry: 'Health Services', naics: '621999' },
  '8093': { sector: 'Healthcare', industryGroup: 'Healthcare Plans', industry: 'Specialty Outpatient Facilities', naics: '621498' },

  // Healthcare Distribution
  '5122': { sector: 'Healthcare', industryGroup: 'Medical Distribution', industry: 'Medical Distribution', naics: '424210' },
  '5047': { sector: 'Healthcare', industryGroup: 'Medical Distribution', industry: 'Medical Equipment & Supplies', naics: '423450' },

  // ═══ FINANCIAL SERVICES ════════════════════════════════════════════

  // Banks
  '6020': { sector: 'Financial Services', industryGroup: 'Banks - Diversified', industry: 'Banks - Diversified', naics: '522110' },
  '6021': { sector: 'Financial Services', industryGroup: 'Banks - Diversified', industry: 'Banks - National Commercial', naics: '522110' },
  '6022': { sector: 'Financial Services', industryGroup: 'Banks - Regional', industry: 'Banks - Regional', naics: '522110' },
  '6035': { sector: 'Financial Services', industryGroup: 'Banks - Regional', industry: 'Savings Institutions', naics: '522120' },
  '6036': { sector: 'Financial Services', industryGroup: 'Banks - Regional', industry: 'Savings Institutions', naics: '522120' },

  // Credit Services
  '6141': { sector: 'Financial Services', industryGroup: 'Credit Services', industry: 'Credit Services', naics: '522210' },
  '6153': { sector: 'Financial Services', industryGroup: 'Credit Services', industry: 'Short-Term Business Credit', naics: '522220' },
  '6159': { sector: 'Financial Services', industryGroup: 'Credit Services', industry: 'Federal-Sponsored Credit Agencies', naics: '522294' },

  // Capital Markets
  '6200': { sector: 'Financial Services', industryGroup: 'Capital Markets', industry: 'Capital Markets', naics: '523000' },
  '6211': { sector: 'Financial Services', industryGroup: 'Capital Markets', industry: 'Security Brokers & Dealers', naics: '523110' },
  '6199': { sector: 'Financial Services', industryGroup: 'Financial Data & Stock Exchanges', industry: 'Financial Services', naics: '523999' },
  '6282': { sector: 'Financial Services', industryGroup: 'Capital Markets', industry: 'Investment Advice', naics: '523930' },

  // Insurance
  '6311': { sector: 'Financial Services', industryGroup: 'Insurance - Life', industry: 'Insurance - Life', naics: '524113' },
  '6321': { sector: 'Financial Services', industryGroup: 'Insurance - Diversified', industry: 'Insurance - Health', naics: '524114' },
  '6324': { sector: 'Financial Services', industryGroup: 'Insurance - Diversified', industry: 'Hospital & Medical Service Plans', naics: '524114' },
  '6331': { sector: 'Financial Services', industryGroup: 'Insurance - Property & Casualty', industry: 'Insurance - Property & Casualty', naics: '524126' },
  '6399': { sector: 'Financial Services', industryGroup: 'Insurance - Diversified', industry: 'Insurance - Diversified', naics: '524128' },
  '6411': { sector: 'Financial Services', industryGroup: 'Insurance - Brokers', industry: 'Insurance Brokers', naics: '524210' },

  // Investment / Holding Companies
  '6726': { sector: 'Financial Services', industryGroup: 'Conglomerates', industry: 'Conglomerates', naics: '551112' },
  '6710': { sector: 'Financial Services', industryGroup: 'Conglomerates', industry: 'Holding Offices', naics: '551111' },
  '6770': { sector: 'Financial Services', industryGroup: 'Conglomerates', industry: 'Blank Checks', naics: '523999' },

  // Mortgage / Real Estate Finance
  '6159': { sector: 'Financial Services', industryGroup: 'Credit Services', industry: 'Credit Agencies', naics: '522294' },
  '6162': { sector: 'Financial Services', industryGroup: 'Mortgage Finance', industry: 'Mortgage Finance', naics: '522310' },
  '6163': { sector: 'Financial Services', industryGroup: 'Mortgage Finance', industry: 'Loan Brokers', naics: '522390' },

  // ═══ INDUSTRIALS ═══════════════════════════════════════════════════

  // Aerospace & Defense
  '3721': { sector: 'Industrials', industryGroup: 'Aerospace & Defense', industry: 'Aerospace & Defense', naics: '336411' },
  '3724': { sector: 'Industrials', industryGroup: 'Aerospace & Defense', industry: 'Aircraft Engines & Parts', naics: '336412' },
  '3728': { sector: 'Industrials', industryGroup: 'Aerospace & Defense', industry: 'Aircraft Parts & Auxiliary Equipment', naics: '336413' },
  '3760': { sector: 'Industrials', industryGroup: 'Aerospace & Defense', industry: 'Guided Missiles & Space Vehicles', naics: '336414' },
  '3761': { sector: 'Industrials', industryGroup: 'Aerospace & Defense', industry: 'Guided Missiles & Space Vehicles', naics: '336414' },
  '3769': { sector: 'Industrials', industryGroup: 'Aerospace & Defense', industry: 'Guided Missile Parts', naics: '336419' },
  '3795': { sector: 'Industrials', industryGroup: 'Aerospace & Defense', industry: 'Tanks & Tank Components', naics: '336992' },

  // Farm & Heavy Equipment
  '3523': { sector: 'Industrials', industryGroup: 'Farm & Heavy Construction Machinery', industry: 'Farm & Heavy Construction Machinery', naics: '333111' },
  '3524': { sector: 'Industrials', industryGroup: 'Farm & Heavy Construction Machinery', industry: 'Lawn & Garden Equipment', naics: '333112' },
  '3531': { sector: 'Industrials', industryGroup: 'Farm & Heavy Construction Machinery', industry: 'Construction Machinery', naics: '333120' },

  // Specialty Industrial Machinery
  '3550': { sector: 'Industrials', industryGroup: 'Specialty Industrial Machinery', industry: 'Special Industry Machinery', naics: '333200' },
  '3556': { sector: 'Industrials', industryGroup: 'Specialty Industrial Machinery', industry: 'Food Products Machinery', naics: '333294' },
  '3560': { sector: 'Industrials', industryGroup: 'Specialty Industrial Machinery', industry: 'General Industrial Machinery', naics: '333900' },
  '3561': { sector: 'Industrials', industryGroup: 'Specialty Industrial Machinery', industry: 'Pumps & Pumping Equipment', naics: '333911' },
  '3562': { sector: 'Industrials', industryGroup: 'Specialty Industrial Machinery', industry: 'Ball & Roller Bearings', naics: '332991' },
  '3564': { sector: 'Industrials', industryGroup: 'Specialty Industrial Machinery', industry: 'Industrial Machinery', naics: '333994' },
  '3569': { sector: 'Industrials', industryGroup: 'Specialty Industrial Machinery', industry: 'General Industrial Machinery', naics: '333999' },
  '3580': { sector: 'Industrials', industryGroup: 'Specialty Industrial Machinery', industry: 'Special Industry Machinery', naics: '333200' },
  '3585': { sector: 'Industrials', industryGroup: 'Specialty Industrial Machinery', industry: 'HVAC & Refrigeration Equipment', naics: '333415' },
  '3590': { sector: 'Industrials', industryGroup: 'Specialty Industrial Machinery', industry: 'Miscellaneous Industrial Machinery', naics: '333999' },
  '3599': { sector: 'Industrials', industryGroup: 'Specialty Industrial Machinery', industry: 'Industrial Machinery', naics: '333999' },

  // Trucking & Transportation
  '4213': { sector: 'Industrials', industryGroup: 'Trucking', industry: 'Trucking', naics: '484121' },
  '4210': { sector: 'Industrials', industryGroup: 'Trucking', industry: 'Trucking', naics: '484100' },
  '4215': { sector: 'Industrials', industryGroup: 'Integrated Freight & Logistics', industry: 'Integrated Freight & Logistics', naics: '492110' },
  '4231': { sector: 'Industrials', industryGroup: 'Integrated Freight & Logistics', industry: 'Freight & Terminal Services', naics: '488510' },
  '4412': { sector: 'Industrials', industryGroup: 'Marine Shipping', industry: 'Marine Shipping', naics: '483111' },
  '4400': { sector: 'Industrials', industryGroup: 'Marine Shipping', industry: 'Water Transportation', naics: '483000' },

  // Airlines
  '4512': { sector: 'Industrials', industryGroup: 'Airlines', industry: 'Airlines', naics: '481111' },
  '4522': { sector: 'Industrials', industryGroup: 'Airlines', industry: 'Air Transportation - Nonscheduled', naics: '481212' },

  // Railroads
  '4011': { sector: 'Industrials', industryGroup: 'Railroads', industry: 'Railroads', naics: '482111' },

  // Waste Management / Environmental Services
  '4953': { sector: 'Industrials', industryGroup: 'Waste Management', industry: 'Waste Management', naics: '562111' },
  '4955': { sector: 'Industrials', industryGroup: 'Waste Management', industry: 'Hazardous Waste Management', naics: '562211' },

  // Business Services
  '7389': { sector: 'Industrials', industryGroup: 'Staffing & Employment Services', industry: 'Business Services', naics: '561499' },
  '7363': { sector: 'Industrials', industryGroup: 'Staffing & Employment Services', industry: 'Staffing & Employment Services', naics: '561320' },

  // Electrical Equipment
  '3612': { sector: 'Industrials', industryGroup: 'Electrical Equipment & Parts', industry: 'Power Transformers', naics: '335311' },
  '3613': { sector: 'Industrials', industryGroup: 'Electrical Equipment & Parts', industry: 'Switchgear & Switchboard', naics: '335313' },
  '3621': { sector: 'Industrials', industryGroup: 'Electrical Equipment & Parts', industry: 'Motors & Generators', naics: '335312' },
  '3629': { sector: 'Industrials', industryGroup: 'Electrical Equipment & Parts', industry: 'Electrical Industrial Apparatus', naics: '335314' },

  // Conglomerates (industrial)
  '3990': { sector: 'Industrials', industryGroup: 'Conglomerates', industry: 'Diversified Industrials', naics: '339999' },
  '3499': { sector: 'Industrials', industryGroup: 'Metal Fabrication', industry: 'Fabricated Metal Products', naics: '332999' },

  // Construction
  '1500': { sector: 'Industrials', industryGroup: 'Engineering & Construction', industry: 'General Building Contractors', naics: '236000' },
  '1520': { sector: 'Industrials', industryGroup: 'Engineering & Construction', industry: 'Residential Construction', naics: '236115' },
  '1521': { sector: 'Industrials', industryGroup: 'Engineering & Construction', industry: 'Residential Construction', naics: '236115' },
  '1522': { sector: 'Industrials', industryGroup: 'Engineering & Construction', industry: 'Residential Construction', naics: '236118' },
  '1531': { sector: 'Industrials', industryGroup: 'Engineering & Construction', industry: 'Operative Builders', naics: '236117' },
  '1540': { sector: 'Industrials', industryGroup: 'Engineering & Construction', industry: 'Industrial Buildings', naics: '236210' },
  '1600': { sector: 'Industrials', industryGroup: 'Engineering & Construction', industry: 'Heavy Construction', naics: '237000' },
  '1623': { sector: 'Industrials', industryGroup: 'Engineering & Construction', industry: 'Water, Sewer & Pipeline Construction', naics: '237110' },
  '1700': { sector: 'Industrials', industryGroup: 'Engineering & Construction', industry: 'Construction - Special Trade', naics: '238000' },
  '1731': { sector: 'Industrials', industryGroup: 'Engineering & Construction', industry: 'Electrical Work', naics: '238210' },

  // Tools & Accessories
  '3420': { sector: 'Industrials', industryGroup: 'Tools & Accessories', industry: 'Cutlery, Hand Tools & Hardware', naics: '332211' },
  '3423': { sector: 'Industrials', industryGroup: 'Tools & Accessories', industry: 'Hand & Edge Tools', naics: '332212' },
  '3460': { sector: 'Industrials', industryGroup: 'Metal Fabrication', industry: 'Metal Forgings & Stampings', naics: '332110' },

  // ═══ COMMUNICATION SERVICES ════════════════════════════════════════

  // Telecom
  '4813': { sector: 'Communication Services', industryGroup: 'Telecom Services', industry: 'Telecom Services', naics: '517311' },
  '4812': { sector: 'Communication Services', industryGroup: 'Telecom Services', industry: 'Telephone Communications', naics: '517311' },
  '4899': { sector: 'Communication Services', industryGroup: 'Telecom Services', industry: 'Communication Services', naics: '517919' },

  // Entertainment / Media
  '4841': { sector: 'Communication Services', industryGroup: 'Entertainment', industry: 'Cable & Satellite', naics: '515210' },
  '7812': { sector: 'Communication Services', industryGroup: 'Entertainment', industry: 'Entertainment', naics: '512110' },
  '7819': { sector: 'Communication Services', industryGroup: 'Entertainment', industry: 'Motion Picture Services', naics: '512191' },
  '7822': { sector: 'Communication Services', industryGroup: 'Entertainment', industry: 'Motion Picture Distribution', naics: '512120' },
  '4833': { sector: 'Communication Services', industryGroup: 'Broadcasting', industry: 'Television Broadcasting', naics: '515120' },
  '4832': { sector: 'Communication Services', industryGroup: 'Broadcasting', industry: 'Radio Broadcasting', naics: '515112' },

  // Publishing
  '2711': { sector: 'Communication Services', industryGroup: 'Publishing', industry: 'Newspapers', naics: '511110' },
  '2731': { sector: 'Communication Services', industryGroup: 'Publishing', industry: 'Book Publishing', naics: '511130' },
  '2741': { sector: 'Communication Services', industryGroup: 'Publishing', industry: 'Periodicals', naics: '511120' },

  // Advertising
  '7311': { sector: 'Communication Services', industryGroup: 'Advertising Agencies', industry: 'Advertising Agencies', naics: '541810' },
  '7312': { sector: 'Communication Services', industryGroup: 'Advertising Agencies', industry: 'Outdoor Advertising', naics: '541850' },

  // ═══ ENERGY ════════════════════════════════════════════════════════

  // Oil & Gas
  '1311': { sector: 'Energy', industryGroup: 'Oil & Gas E&P', industry: 'Oil & Gas E&P', naics: '211120' },
  '1381': { sector: 'Energy', industryGroup: 'Oil & Gas Equipment & Services', industry: 'Oil & Gas Drilling', naics: '213111' },
  '1382': { sector: 'Energy', industryGroup: 'Oil & Gas Equipment & Services', industry: 'Oil & Gas Equipment & Services', naics: '213112' },
  '1389': { sector: 'Energy', industryGroup: 'Oil & Gas Equipment & Services', industry: 'Oil & Gas Field Services', naics: '213112' },
  '2911': { sector: 'Energy', industryGroup: 'Oil & Gas Refining & Marketing', industry: 'Oil & Gas Refining & Marketing', naics: '324110' },
  '5171': { sector: 'Energy', industryGroup: 'Oil & Gas Refining & Marketing', industry: 'Petroleum Products Wholesalers', naics: '424710' },
  '5172': { sector: 'Energy', industryGroup: 'Oil & Gas Refining & Marketing', industry: 'Petroleum Products Wholesalers', naics: '424720' },

  // Oil & Gas Midstream
  '4610': { sector: 'Energy', industryGroup: 'Oil & Gas Midstream', industry: 'Oil & Gas Pipelines', naics: '486110' },
  '4612': { sector: 'Energy', industryGroup: 'Oil & Gas Midstream', industry: 'Crude Oil Pipelines', naics: '486110' },
  '4613': { sector: 'Energy', industryGroup: 'Oil & Gas Midstream', industry: 'Refined Petroleum Pipelines', naics: '486910' },
  '4619': { sector: 'Energy', industryGroup: 'Oil & Gas Midstream', industry: 'Pipelines', naics: '486990' },

  // Coal
  '1220': { sector: 'Energy', industryGroup: 'Thermal Coal', industry: 'Thermal Coal', naics: '212111' },
  '1221': { sector: 'Energy', industryGroup: 'Thermal Coal', industry: 'Thermal Coal', naics: '212111' },

  // ═══ BASIC MATERIALS ═══════════════════════════════════════════════

  // Chemicals
  '2810': { sector: 'Basic Materials', industryGroup: 'Chemicals', industry: 'Chemicals', naics: '325100' },
  '2812': { sector: 'Basic Materials', industryGroup: 'Chemicals', industry: 'Alkalies & Chlorine', naics: '325181' },
  '2813': { sector: 'Basic Materials', industryGroup: 'Chemicals', industry: 'Industrial Gases', naics: '325120' },
  '2816': { sector: 'Basic Materials', industryGroup: 'Chemicals', industry: 'Inorganic Pigments', naics: '325131' },
  '2819': { sector: 'Basic Materials', industryGroup: 'Chemicals', industry: 'Industrial Inorganic Chemicals', naics: '325199' },
  '2820': { sector: 'Basic Materials', industryGroup: 'Chemicals', industry: 'Plastics Materials & Synthetics', naics: '325200' },
  '2821': { sector: 'Basic Materials', industryGroup: 'Chemicals', industry: 'Plastics Materials & Resins', naics: '325211' },
  '2860': { sector: 'Basic Materials', industryGroup: 'Chemicals', industry: 'Industrial Chemicals', naics: '325100' },
  '2869': { sector: 'Basic Materials', industryGroup: 'Chemicals', industry: 'Industrial Organic Chemicals', naics: '325199' },
  '2890': { sector: 'Basic Materials', industryGroup: 'Chemicals', industry: 'Chemical Products', naics: '325998' },
  '2891': { sector: 'Basic Materials', industryGroup: 'Chemicals', industry: 'Adhesives & Sealants', naics: '325520' },
  '2899': { sector: 'Basic Materials', industryGroup: 'Chemicals', industry: 'Specialty Chemicals', naics: '325998' },
  '2850': { sector: 'Basic Materials', industryGroup: 'Chemicals', industry: 'Paints & Allied Products', naics: '325510' },
  '2851': { sector: 'Basic Materials', industryGroup: 'Chemicals', industry: 'Paints, Varnishes & Lacquers', naics: '325510' },
  '2870': { sector: 'Basic Materials', industryGroup: 'Chemicals', industry: 'Agricultural Chemicals', naics: '325310' },
  '2879': { sector: 'Basic Materials', industryGroup: 'Chemicals', industry: 'Pesticides & Agricultural Chemicals', naics: '325320' },

  // Steel
  '3310': { sector: 'Basic Materials', industryGroup: 'Steel', industry: 'Steel', naics: '331110' },
  '3312': { sector: 'Basic Materials', industryGroup: 'Steel', industry: 'Steel Works & Blast Furnaces', naics: '331111' },
  '3316': { sector: 'Basic Materials', industryGroup: 'Steel', industry: 'Cold-Rolled Steel', naics: '331221' },
  '3317': { sector: 'Basic Materials', industryGroup: 'Steel', industry: 'Steel Pipe & Tubes', naics: '331210' },

  // Other Metals
  '3330': { sector: 'Basic Materials', industryGroup: 'Other Industrial Metals & Mining', industry: 'Primary Nonferrous Metals', naics: '331400' },
  '3331': { sector: 'Basic Materials', industryGroup: 'Other Industrial Metals & Mining', industry: 'Primary Copper', naics: '331411' },
  '3334': { sector: 'Basic Materials', industryGroup: 'Other Industrial Metals & Mining', industry: 'Primary Aluminum', naics: '331313' },
  '3350': { sector: 'Basic Materials', industryGroup: 'Other Industrial Metals & Mining', industry: 'Nonferrous Metals Rolling & Drawing', naics: '331420' },
  '3356': { sector: 'Basic Materials', industryGroup: 'Other Industrial Metals & Mining', industry: 'Nonferrous Rolling & Drawing', naics: '331491' },

  // Mining
  '1040': { sector: 'Basic Materials', industryGroup: 'Gold', industry: 'Gold', naics: '212221' },
  '1090': { sector: 'Basic Materials', industryGroup: 'Other Industrial Metals & Mining', industry: 'Metal Mining Services', naics: '212299' },
  '1400': { sector: 'Basic Materials', industryGroup: 'Other Industrial Metals & Mining', industry: 'Mining & Quarrying', naics: '212310' },

  // Paper & Forest Products
  '2411': { sector: 'Basic Materials', industryGroup: 'Lumber & Wood Production', industry: 'Logging', naics: '113310' },
  '2421': { sector: 'Basic Materials', industryGroup: 'Lumber & Wood Production', industry: 'Sawmills', naics: '321113' },
  '2430': { sector: 'Basic Materials', industryGroup: 'Lumber & Wood Production', industry: 'Lumber & Wood Products', naics: '321900' },
  '2611': { sector: 'Basic Materials', industryGroup: 'Paper & Paper Products', industry: 'Pulp Mills', naics: '322110' },
  '2621': { sector: 'Basic Materials', industryGroup: 'Paper & Paper Products', industry: 'Paper Mills', naics: '322121' },
  '2650': { sector: 'Basic Materials', industryGroup: 'Paper & Paper Products', industry: 'Paperboard Containers', naics: '322210' },
  '2670': { sector: 'Basic Materials', industryGroup: 'Paper & Paper Products', industry: 'Converted Paper Products', naics: '322200' },

  // Rubber & Plastics
  '3011': { sector: 'Basic Materials', industryGroup: 'Rubber & Plastics', industry: 'Tires & Rubber', naics: '326211' },
  '3080': { sector: 'Basic Materials', industryGroup: 'Rubber & Plastics', industry: 'Plastics Products', naics: '326100' },
  '3089': { sector: 'Basic Materials', industryGroup: 'Rubber & Plastics', industry: 'Plastics Products', naics: '326199' },

  // Building Materials
  '3211': { sector: 'Basic Materials', industryGroup: 'Building Materials', industry: 'Flat Glass', naics: '327211' },
  '3220': { sector: 'Basic Materials', industryGroup: 'Building Materials', industry: 'Glass Products', naics: '327213' },
  '3241': { sector: 'Basic Materials', industryGroup: 'Building Materials', industry: 'Cement', naics: '327310' },
  '3250': { sector: 'Basic Materials', industryGroup: 'Building Materials', industry: 'Structural Clay Products', naics: '327120' },
  '3270': { sector: 'Basic Materials', industryGroup: 'Building Materials', industry: 'Concrete Products', naics: '327330' },
  '3290': { sector: 'Basic Materials', industryGroup: 'Building Materials', industry: 'Nonmetallic Mineral Products', naics: '327999' },
  '3411': { sector: 'Basic Materials', industryGroup: 'Packaging & Containers', industry: 'Metal Cans', naics: '332431' },
  '3412': { sector: 'Basic Materials', industryGroup: 'Packaging & Containers', industry: 'Metal Shipping Containers', naics: '332439' },

  // ═══ REAL ESTATE ═══════════════════════════════════════════════════

  '6500': { sector: 'Real Estate', industryGroup: 'Real Estate', industry: 'Real Estate Services', naics: '531000' },
  '6510': { sector: 'Real Estate', industryGroup: 'Real Estate Services', industry: 'Real Estate Operators', naics: '531100' },
  '6512': { sector: 'Real Estate', industryGroup: 'REIT - Residential', industry: 'REIT - Residential', naics: '531110' },
  '6531': { sector: 'Real Estate', industryGroup: 'Real Estate Services', industry: 'Real Estate Agents & Managers', naics: '531210' },
  '6552': { sector: 'Real Estate', industryGroup: 'Real Estate - Development', industry: 'Real Estate - Development', naics: '531390' },
  '6798': { sector: 'Real Estate', industryGroup: 'REIT - Diversified', industry: 'Real Estate Investment Trusts', naics: '525990' },

  // ═══ UTILITIES ═════════════════════════════════════════════════════

  '4911': { sector: 'Utilities', industryGroup: 'Utilities - Regulated Electric', industry: 'Utilities - Regulated Electric', naics: '221111' },
  '4922': { sector: 'Utilities', industryGroup: 'Utilities - Regulated Gas', industry: 'Utilities - Regulated Gas', naics: '221210' },
  '4923': { sector: 'Utilities', industryGroup: 'Utilities - Regulated Gas', industry: 'Natural Gas Distribution', naics: '221210' },
  '4924': { sector: 'Utilities', industryGroup: 'Utilities - Regulated Gas', industry: 'Natural Gas Distribution', naics: '221210' },
  '4931': { sector: 'Utilities', industryGroup: 'Utilities - Diversified', industry: 'Utilities - Diversified', naics: '221100' },
  '4932': { sector: 'Utilities', industryGroup: 'Utilities - Diversified', industry: 'Utilities - Diversified', naics: '221100' },
  '4941': { sector: 'Utilities', industryGroup: 'Utilities - Regulated Water', industry: 'Utilities - Regulated Water', naics: '221310' },
  '4950': { sector: 'Utilities', industryGroup: 'Utilities - Regulated Water', industry: 'Sanitary Services', naics: '221320' },
  '4953': { sector: 'Utilities', industryGroup: 'Waste Management', industry: 'Waste Management', naics: '562111' },
  '4991': { sector: 'Utilities', industryGroup: 'Utilities - Independent Power Producers', industry: 'Independent Power Producers', naics: '221118' },

  // ═══ AGRICULTURE ═══════════════════════════════════════════════════

  '0100': { sector: 'Consumer Defensive', industryGroup: 'Farm Products', industry: 'Farm Products', naics: '111000' },
  '0200': { sector: 'Consumer Defensive', industryGroup: 'Farm Products', industry: 'Livestock', naics: '112000' },
  '0700': { sector: 'Consumer Defensive', industryGroup: 'Farm Products', industry: 'Agricultural Services', naics: '115000' },
};


// ─── 2-Digit Major Group Fallback ────────────────────────────────────
// Used when a specific 4-digit SIC code is not in SIC_MAP.

const SIC_MAJOR_GROUP_MAP = {
  '01': { sector: 'Consumer Defensive', industryGroup: 'Farm Products' },
  '02': { sector: 'Consumer Defensive', industryGroup: 'Farm Products' },
  '07': { sector: 'Consumer Defensive', industryGroup: 'Farm Products' },
  '08': { sector: 'Basic Materials', industryGroup: 'Lumber & Wood Production' },
  '09': { sector: 'Consumer Defensive', industryGroup: 'Farm Products' },
  '10': { sector: 'Basic Materials', industryGroup: 'Other Industrial Metals & Mining' },
  '12': { sector: 'Energy', industryGroup: 'Thermal Coal' },
  '13': { sector: 'Energy', industryGroup: 'Oil & Gas E&P' },
  '14': { sector: 'Basic Materials', industryGroup: 'Other Industrial Metals & Mining' },
  '15': { sector: 'Industrials', industryGroup: 'Engineering & Construction' },
  '16': { sector: 'Industrials', industryGroup: 'Engineering & Construction' },
  '17': { sector: 'Industrials', industryGroup: 'Engineering & Construction' },
  '20': { sector: 'Consumer Defensive', industryGroup: 'Food Products' },
  '21': { sector: 'Consumer Defensive', industryGroup: 'Tobacco' },
  '22': { sector: 'Consumer Cyclical', industryGroup: 'Textiles' },
  '23': { sector: 'Consumer Cyclical', industryGroup: 'Apparel Manufacturing' },
  '24': { sector: 'Basic Materials', industryGroup: 'Lumber & Wood Production' },
  '25': { sector: 'Consumer Cyclical', industryGroup: 'Furnishings, Fixtures & Appliances' },
  '26': { sector: 'Basic Materials', industryGroup: 'Paper & Paper Products' },
  '27': { sector: 'Communication Services', industryGroup: 'Publishing' },
  '28': { sector: 'Basic Materials', industryGroup: 'Chemicals' },
  '29': { sector: 'Energy', industryGroup: 'Oil & Gas Refining & Marketing' },
  '30': { sector: 'Basic Materials', industryGroup: 'Rubber & Plastics' },
  '31': { sector: 'Consumer Cyclical', industryGroup: 'Apparel Manufacturing' },
  '32': { sector: 'Basic Materials', industryGroup: 'Building Materials' },
  '33': { sector: 'Basic Materials', industryGroup: 'Steel' },
  '34': { sector: 'Industrials', industryGroup: 'Metal Fabrication' },
  '35': { sector: 'Industrials', industryGroup: 'Specialty Industrial Machinery' },
  '36': { sector: 'Technology', industryGroup: 'Electronic Equipment' },
  '37': { sector: 'Industrials', industryGroup: 'Aerospace & Defense' },
  '38': { sector: 'Healthcare', industryGroup: 'Medical Devices' },
  '39': { sector: 'Industrials', industryGroup: 'Conglomerates' },
  '40': { sector: 'Industrials', industryGroup: 'Railroads' },
  '41': { sector: 'Industrials', industryGroup: 'Transportation' },
  '42': { sector: 'Industrials', industryGroup: 'Trucking' },
  '43': { sector: 'Industrials', industryGroup: 'Transportation' },
  '44': { sector: 'Industrials', industryGroup: 'Marine Shipping' },
  '45': { sector: 'Industrials', industryGroup: 'Airlines' },
  '46': { sector: 'Energy', industryGroup: 'Oil & Gas Midstream' },
  '47': { sector: 'Industrials', industryGroup: 'Transportation' },
  '48': { sector: 'Communication Services', industryGroup: 'Telecom Services' },
  '49': { sector: 'Utilities', industryGroup: 'Utilities - Diversified' },
  '50': { sector: 'Industrials', industryGroup: 'Industrial Distribution' },
  '51': { sector: 'Consumer Defensive', industryGroup: 'Food Distribution' },
  '52': { sector: 'Consumer Cyclical', industryGroup: 'Home Improvement Retail' },
  '53': { sector: 'Consumer Defensive', industryGroup: 'Retail - Defensive' },
  '54': { sector: 'Consumer Defensive', industryGroup: 'Retail - Defensive' },
  '55': { sector: 'Consumer Cyclical', industryGroup: 'Auto Dealers' },
  '56': { sector: 'Consumer Cyclical', industryGroup: 'Apparel Retail' },
  '57': { sector: 'Consumer Cyclical', industryGroup: 'Specialty Retail' },
  '58': { sector: 'Consumer Cyclical', industryGroup: 'Restaurants' },
  '59': { sector: 'Consumer Cyclical', industryGroup: 'Specialty Retail' },
  '60': { sector: 'Financial Services', industryGroup: 'Banks - Diversified' },
  '61': { sector: 'Financial Services', industryGroup: 'Credit Services' },
  '62': { sector: 'Financial Services', industryGroup: 'Capital Markets' },
  '63': { sector: 'Financial Services', industryGroup: 'Insurance - Diversified' },
  '64': { sector: 'Financial Services', industryGroup: 'Insurance - Brokers' },
  '65': { sector: 'Real Estate', industryGroup: 'Real Estate Services' },
  '66': { sector: 'Financial Services', industryGroup: 'Mortgage Finance' },
  '67': { sector: 'Financial Services', industryGroup: 'Conglomerates' },
  '70': { sector: 'Consumer Cyclical', industryGroup: 'Lodging' },
  '72': { sector: 'Consumer Cyclical', industryGroup: 'Personal Services' },
  '73': { sector: 'Technology', industryGroup: 'Software - Application' },
  '75': { sector: 'Consumer Cyclical', industryGroup: 'Auto Parts' },
  '76': { sector: 'Industrials', industryGroup: 'Specialty Industrial Machinery' },
  '78': { sector: 'Communication Services', industryGroup: 'Entertainment' },
  '79': { sector: 'Consumer Cyclical', industryGroup: 'Leisure' },
  '80': { sector: 'Healthcare', industryGroup: 'Healthcare Plans' },
  '81': { sector: 'Industrials', industryGroup: 'Consulting Services' },
  '82': { sector: 'Consumer Defensive', industryGroup: 'Education & Training Services' },
  '83': { sector: 'Consumer Defensive', industryGroup: 'Personal Services' },
  '84': { sector: 'Industrials', industryGroup: 'Consulting Services' },
  '86': { sector: 'Consumer Defensive', industryGroup: 'Personal Services' },
  '87': { sector: 'Industrials', industryGroup: 'Consulting Services' },
  '89': { sector: 'Industrials', industryGroup: 'Consulting Services' },
  '91': { sector: 'Industrials', industryGroup: 'Conglomerates' },
  '92': { sector: 'Industrials', industryGroup: 'Conglomerates' },
  '93': { sector: 'Industrials', industryGroup: 'Conglomerates' },
  '94': { sector: 'Industrials', industryGroup: 'Conglomerates' },
  '95': { sector: 'Industrials', industryGroup: 'Conglomerates' },
  '96': { sector: 'Industrials', industryGroup: 'Conglomerates' },
  '97': { sector: 'Industrials', industryGroup: 'Conglomerates' },
  '99': { sector: 'Industrials', industryGroup: 'Conglomerates' },
};


// ─── Public API ──────────────────────────────────────────────────────

/**
 * Get all SIC codes matching a given tier value.
 * tier: 'sector' | 'industryGroup' | 'industry'
 * value: e.g. 'Consumer Cyclical' or 'Apparel Retail'
 * Returns Set of SIC code strings.
 */
export function getSICCodesForTier(tier, value) {
  const codes = new Set();
  for (const [sic, entry] of Object.entries(SIC_MAP)) {
    if (entry[tier] === value) codes.add(sic);
  }
  return codes;
}

/**
 * Classify a company by its SIC code.
 * Returns { sector, industryGroup, industry, naics }.
 */
export function classifyBySIC(sicCode, sicDescription) {
  if (!sicCode) return { sector: '--', industryGroup: '--', industry: '--', naics: '--' };

  const code = String(sicCode).padStart(4, '0');

  // Tier 1: exact 4-digit match
  const exact = SIC_MAP[code];
  if (exact) return { ...exact };

  // Tier 2: 2-digit major group fallback
  const majorGroup = code.slice(0, 2);
  const mg = SIC_MAJOR_GROUP_MAP[majorGroup];
  if (mg) {
    return {
      sector: mg.sector,
      industryGroup: mg.industryGroup,
      industry: sicDescription || mg.industryGroup,
      naics: '--',
    };
  }

  // Tier 3: last resort — use EDGAR description
  return {
    sector: sicDescription || '--',
    industryGroup: sicDescription || '--',
    industry: sicDescription || '--',
    naics: '--',
  };
}
