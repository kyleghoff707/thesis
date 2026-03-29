// Quality Validation Engine — critic.js
// Pure validation: checks every generated report section for citation accuracy,
// completeness, confidence justification, multi-source verification, red flag
// quality, and data gap detection. No side effects, no network calls, no file I/O.
//
// Produces per-section QualityReport objects that flag issues without blocking
// report generation (per D-04).

// ─── Constants ──────────────────────────────────────────────────────

// Required fields from ReportSectionSchema (no .optional() in the schema)
const REQUIRED_FIELDS = [
  'key', 'title', 'sectionNumber', 'status', 'confidence',
  'verdict', 'verdictRationale', 'summary', 'data', 'narrative',
  'citations', 'redFlags', 'modelUsed', 'tokenCost',
];

// Weighted scoring formula for completeness
const QUALITY_WEIGHTS = {
  requiredFields: 40,    // 40% — all required fields present
  narrativeDepth: 25,    // 25% — narrative length and paragraph structure
  citationDensity: 20,   // 20% — citations per claim
  dataPopulation: 15,    // 15% — data object has meaningful content
};

// Canonical citation fields (CitationSchema: {id, ref, text, source})
const CANONICAL_CITATION_FIELDS = ['id', 'ref', 'text', 'source'];

// Fields that map section keys to DataPacket domains for gap detection
const SECTION_DATA_DOMAINS = {
  company_info: ['companyInfo', 'currentPrice'],
  minimum_standards: ['ruleOneScore', 'returnMetrics', 'debtMetrics'],
  meaning: ['companyInfo', 'ruleOneScore'],
  growth_metrics: ['growthRates', 'returnMetrics'],
  valuation_summary: ['currentPrice', 'growthRates', 'fcf'],
  overall_verdict: ['ruleOneScore', 'growthRates', 'currentPrice'],
};

// ─── Citation Classification (QUAL-01) ─────────────────────────────

/**
 * Classify a citation into one of 4 types per D-01/D-02/D-03/D-04.
 * @param {object} citation - Citation object (canonical or non-canonical format)
 * @returns {'datapacket' | 'sec_filing' | 'web_url' | 'untraceable'}
 */
function classifyCitation(citation) {
  const source = (citation.source || '').toLowerCase();
  const ref = (citation.ref || '').toLowerCase();

  // DataPacket/Computed/Toolbox citations
  if (source === 'datapacket' || source === 'computed' ||
      source.includes('rule one toolbox') || ref.includes('datapacket')) {
    return 'datapacket';
  }

  // SEC filing citations
  if (source.includes('sec') || source.includes('edgar') || source.includes('10-k') ||
      source.includes('10-q') || source.includes('8-k') || source.includes('13f')) {
    return 'sec_filing';
  }

  // Web URL citations (url field is non-empty and looks like a URL)
  if (citation.url && /^https?:\/\//.test(citation.url)) {
    return 'web_url';
  }

  return 'untraceable';
}

// ─── DataPacket Path Resolution (D-01) ──────────────────────────────

/**
 * Navigate a dot-separated path string to resolve a value from the DataPacket.
 * @param {object} dataPacket - The DataPacket object
 * @param {string} dotPath - Dot-separated path (e.g., "growthRates.earnings.10yr")
 * @returns {{ found: boolean, value: any }}
 */
function resolveDataPath(dataPacket, dotPath) {
  if (!dataPacket || !dotPath) return { found: false, value: undefined };
  const parts = dotPath.split('.');
  let current = dataPacket;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') {
      return { found: false, value: undefined };
    }
    current = current[part];
  }
  return { found: current !== undefined, value: current };
}

// ─── Numeric Value Matching ─────────────────────────────────────────

/**
 * Extract numeric values from citation text and compare against a DataPacket value.
 * Handles percentages, dollar abbreviations, comma-separated numbers.
 * @param {string} citationText - The text from the citation
 * @param {number} dataPacketValue - The value from the DataPacket
 * @returns {boolean} - True if any extracted number matches within 5% tolerance
 */
function matchNumericValue(citationText, dataPacketValue) {
  if (citationText == null || dataPacketValue == null) return false;
  if (typeof dataPacketValue !== 'number' || isNaN(dataPacketValue)) return false;

  const text = String(citationText);
  const extracted = extractNumbers(text);

  for (const num of extracted) {
    if (isWithinTolerance(num, dataPacketValue, 0.05)) return true;
  }
  return false;
}

/**
 * Extract all numeric values from text, handling formats:
 * - Plain: "88", "973.82"
 * - Percentage: "13.0%" -> 0.13 (decimal)
 * - Dollar abbreviation: "$432B" -> 432000000000, "$141M" -> 141000000
 * - Comma-separated: "341,000" -> 341000
 */
function extractNumbers(text) {
  const results = [];

  // Remove commas from numbers (e.g., "341,000" -> "341000")
  const cleaned = text.replace(/(\d),(\d)/g, '$1$2');

  // Match patterns: optional $, number with optional decimal, optional suffix
  const pattern = /\$?\s*(\d+(?:\.\d+)?)\s*([BMKbmk%])?/g;
  let match;

  while ((match = pattern.exec(cleaned)) !== null) {
    let value = parseFloat(match[1]);
    const suffix = (match[2] || '').toUpperCase();

    if (suffix === '%') {
      // Percentage to decimal: 13.0% -> 0.13
      results.push(value / 100);
      // Also push the raw percentage value for direct comparison
      results.push(value);
    } else if (suffix === 'B') {
      results.push(value * 1_000_000_000);
      results.push(value); // also raw
    } else if (suffix === 'M') {
      results.push(value * 1_000_000);
      results.push(value); // also raw
    } else if (suffix === 'K') {
      results.push(value * 1_000);
      results.push(value); // also raw
    } else {
      results.push(value);
    }
  }

  return results;
}

/**
 * Check if two numbers are within a relative tolerance.
 */
function isWithinTolerance(a, b, tolerance) {
  if (a === 0 && b === 0) return true;
  if (b === 0) return Math.abs(a) < tolerance;
  return Math.abs(a - b) / Math.abs(b) <= tolerance;
}

// ─── Citation Validation (QUAL-01) ──────────────────────────────────

/**
 * Validate an array of citations against the DataPacket.
 * Handles both canonical {id, ref, text, source} and non-canonical {id, source, url, note} formats.
 * @param {Array} citations - Array of citation objects
 * @param {object} dataPacket - The DataPacket for path resolution
 * @returns {Array} - Array of issue objects
 */
function validateCitations(citations, dataPacket) {
  const issues = [];
  if (!Array.isArray(citations)) return issues;

  for (const citation of citations) {
    // Check for non-canonical format
    const isCanonical = CANONICAL_CITATION_FIELDS.every(f => citation[f] !== undefined);
    if (!isCanonical) {
      issues.push({
        type: 'citation',
        severity: 'low',
        message: `Citation #${citation.id} uses non-canonical format (missing ref/text fields)`,
        field: `citation[${citation.id}]`,
      });
    }

    const type = classifyCitation(citation);

    switch (type) {
      case 'datapacket': {
        const ref = citation.ref || '';
        const text = citation.text || citation.note || '';

        // Check if ref is a DataPacket dot-path
        if (ref.startsWith('dataPacket.') || ref.startsWith('DataPacket.')) {
          const path = ref.replace(/^[Dd]ataPacket\./, '');
          const { found, value } = resolveDataPath(dataPacket, path);
          if (!found) {
            issues.push({
              type: 'citation',
              severity: 'high',
              message: `DataPacket path not found: ${ref}`,
              field: `citation[${citation.id}]`,
            });
          } else if (typeof value === 'number') {
            // Verify value match
            const matched = matchNumericValue(text, value);
            if (!matched) {
              issues.push({
                type: 'citation',
                severity: 'medium',
                message: `Value mismatch: citation says "${text}" but DataPacket has ${value}`,
                field: `citation[${citation.id}]`,
                expected: String(value),
                actual: text,
              });
            }
          }
        } else if (ref) {
          // Ref is human-readable, not a path — flag format but don't block
          issues.push({
            type: 'citation',
            severity: 'low',
            message: `DataPacket citation uses label "${ref}" instead of a field path`,
            field: `citation[${citation.id}]`,
          });
        }
        break;
      }

      case 'sec_filing': {
        const text = citation.source || citation.ref || '';
        const hasFilingType = /10-[KQ]|8-K|13[FD]|proxy|annual|S-1/i.test(text);
        const hasYear = /\b(19|20)\d{2}\b|FY\d{2,4}/i.test(text);
        if (!hasFilingType) {
          issues.push({
            type: 'citation',
            severity: 'medium',
            message: `SEC citation missing filing type: "${text}"`,
            field: `citation[${citation.id}]`,
          });
        }
        if (!hasYear) {
          issues.push({
            type: 'citation',
            severity: 'low',
            message: `SEC citation missing year: "${text}"`,
            field: `citation[${citation.id}]`,
          });
        }
        break;
      }

      case 'web_url': {
        try {
          new URL(citation.url);
        } catch {
          issues.push({
            type: 'citation',
            severity: 'medium',
            message: `Invalid URL format: "${citation.url}"`,
            field: `citation[${citation.id}]`,
          });
        }
        break;
      }

      case 'untraceable': {
        issues.push({
          type: 'citation',
          severity: 'low',
          message: `Untraceable citation: "${citation.source || citation.ref}"`,
          field: `citation[${citation.id}]`,
        });
        break;
      }
    }

    // If citation has a non-empty url field and wasn't already classified as web_url,
    // still validate the URL format (catches malformed URLs on non-web citations)
    if (type !== 'web_url' && citation.url && typeof citation.url === 'string' && citation.url.trim() !== '') {
      try {
        new URL(citation.url);
      } catch {
        issues.push({
          type: 'citation',
          severity: 'medium',
          message: `Invalid URL format: "${citation.url}"`,
          field: `citation[${citation.id}]`,
        });
      }
    }
  }

  return issues;
}

// ─── Completeness Scoring (QUAL-02) ─────────────────────────────────

/**
 * Score a section's completeness using a weighted formula.
 * @param {object} section - Report section object
 * @returns {{ requiredFieldsPresent: number, requiredFieldsTotal: number, narrativeLength: number, dataFieldsPopulated: number, score: number }}
 */
function scoreCompleteness(section) {
  // Required fields check
  const present = REQUIRED_FIELDS.filter(f => {
    const val = section[f];
    if (val == null) return false;
    if (typeof val === 'string' && val === '') return false;
    if (Array.isArray(val) && val.length === 0) return false;
    return true;
  });
  const requiredScore = (present.length / REQUIRED_FIELDS.length) * 100;

  // Narrative depth (length + paragraph structure)
  const narrative = section.narrative || '';
  const paragraphs = narrative.split(/\n\n/).filter(p => p.trim().length > 0).length;
  const sentenceCount = (narrative.match(/\.\s/g) || []).length + 1;
  const narrativeScore = Math.min(100,
    (narrative.length / 500) * 50 + (Math.min(paragraphs, 3) / 3) * 25 + (Math.min(sentenceCount, 5) / 5) * 25
  );

  // Citation density
  const citations = Array.isArray(section.citations) ? section.citations.length : 0;
  const citationScore = Math.min(100, (citations / 5) * 100);

  // Data population — handles both object (post-orchestrator) and string (raw API output)
  let dataObj = section.data;
  if (typeof dataObj === 'string') {
    try { dataObj = JSON.parse(dataObj); } catch { dataObj = null; }
  }
  const dataKeys = dataObj && typeof dataObj === 'object' && !Array.isArray(dataObj)
    ? Object.keys(dataObj).length : 0;
  const dataScore = Math.min(100, (dataKeys / 3) * 100);

  const composite = Math.round(
    requiredScore * (QUALITY_WEIGHTS.requiredFields / 100) +
    narrativeScore * (QUALITY_WEIGHTS.narrativeDepth / 100) +
    citationScore * (QUALITY_WEIGHTS.citationDensity / 100) +
    dataScore * (QUALITY_WEIGHTS.dataPopulation / 100)
  );

  return {
    requiredFieldsPresent: present.length,
    requiredFieldsTotal: REQUIRED_FIELDS.length,
    narrativeLength: narrative.length,
    dataFieldsPopulated: dataKeys,
    score: Math.min(100, composite),
  };
}

// ─── Confidence Validation (QUAL-03) ────────────────────────────────

/**
 * Validate that confidence level is justified by citation diversity and data completeness.
 * HIGH confidence requires 2+ citation source types.
 * @param {object} section - Report section object
 * @param {object} dataPacket - The DataPacket
 * @returns {Array} - Array of issue objects
 */
function validateConfidence(section, dataPacket) {
  const issues = [];
  const confidence = section.confidence;

  if (confidence === 'HIGH') {
    const citations = section.citations || [];
    const uniqueSources = new Set(citations.map(c => classifyCitation(c)));

    if (uniqueSources.size < 2) {
      issues.push({
        type: 'confidence',
        severity: 'medium',
        message: `HIGH confidence but only ${uniqueSources.size} citation type(s). Expected 2+.`,
        field: 'confidence',
      });
    }
  }

  // MEDIUM and LOW confidence: no additional checks required
  return issues;
}

// ─── Multi-Source Verification (QUAL-04) ────────────────────────────

/**
 * Check if citations demonstrate source diversity.
 * Financial claims from only one source category get flagged.
 * @param {Array} citations - Array of citation objects
 * @returns {Array} - Array of issue objects
 */
function checkMultiSource(citations) {
  const issues = [];
  if (!Array.isArray(citations) || citations.length === 0) return issues;

  const sourceTypes = new Set(citations.map(c => classifyCitation(c)));

  // If all citations are from datapacket-family sources (datapacket only), flag it
  if (sourceTypes.size === 1 && sourceTypes.has('datapacket')) {
    issues.push({
      type: 'multi_source',
      severity: 'medium',
      message: 'All citations are from DataPacket/Computed sources. Financial claims should have corroborating SEC or external sources.',
      field: 'citations',
    });
  }

  return issues;
}

// ─── Red Flag Quality (QUAL-05) ─────────────────────────────────────

/**
 * Validate red flags for presence and specificity.
 * @param {Array} redFlags - Array of red flag strings
 * @returns {Array} - Array of issue objects
 */
function validateRedFlags(redFlags) {
  const issues = [];

  if (!Array.isArray(redFlags) || redFlags.length === 0) {
    issues.push({
      type: 'red_flag',
      severity: 'high',
      message: 'No red flags provided. Every section must have at least one red flag.',
      field: 'redFlags',
    });
    return issues;
  }

  for (let i = 0; i < redFlags.length; i++) {
    const flag = redFlags[i];
    // Generic flags: under 20 chars or vague phrases
    if (flag.length < 20) {
      issues.push({
        type: 'red_flag',
        severity: 'medium',
        message: `Red flag #${i + 1} is too brief (${flag.length} chars): "${flag}"`,
        field: `redFlags[${i}]`,
      });
    } else if (/^(possible risk|potential issue|some concerns?)$/i.test(flag.trim())) {
      issues.push({
        type: 'red_flag',
        severity: 'medium',
        message: `Red flag #${i + 1} is too generic: "${flag}"`,
        field: `redFlags[${i}]`,
      });
    }
  }

  return issues;
}

// ─── Data Gap Detection (QUAL-06) ───────────────────────────────────

/**
 * Detect when narrative claims values that correspond to null DataPacket fields.
 * @param {object} section - Report section object
 * @param {object} dataPacket - The DataPacket
 * @returns {Array} - Array of issue objects
 */
function detectDataGaps(section, dataPacket) {
  const issues = [];
  if (!section.narrative || !dataPacket) return issues;

  const narrative = section.narrative;
  const sectionKey = section.key || '';

  // Check domain-specific null fields
  const domains = SECTION_DATA_DOMAINS[sectionKey] || [];

  for (const domain of domains) {
    const domainValue = dataPacket[domain];

    // If the top-level domain field is null/undefined
    if (domainValue == null) {
      // Check if narrative mentions this domain with specific values
      const domainPatterns = getDomainPatterns(domain);
      for (const { pattern, label } of domainPatterns) {
        if (pattern.test(narrative)) {
          issues.push({
            type: 'data_gap',
            severity: 'medium',
            message: `Narrative references ${label} but DataPacket.${domain} is null`,
            field: `narrative -> ${domain}`,
            expected: 'null (not available)',
            actual: `Narrative claims: "${narrative.match(pattern)?.[0]}"`,
          });
        }
      }
    }
  }

  return issues;
}

/**
 * Get regex patterns for detecting narrative claims about a DataPacket domain.
 */
function getDomainPatterns(domain) {
  switch (domain) {
    case 'currentPrice':
      return [
        { pattern: /\$([\d,.]+)\s*(stock|share|price|per share)/i, label: 'stock price' },
        { pattern: /current\s+(stock\s+)?price\s+(is|of|at)\s+\$[\d,.]+/i, label: 'current price' },
        { pattern: /price\s+(is|of|at)\s+\$[\d,.]+/i, label: 'price claim' },
      ];
    case 'growthRates':
      return [
        { pattern: /growth\s+rate\s+(of|is|at)\s+[\d.]+%/i, label: 'growth rate' },
      ];
    case 'returnMetrics':
      return [
        { pattern: /ROE\s+(of|is|at)\s+[\d.]+%/i, label: 'ROE' },
        { pattern: /ROIC\s+(of|is|at)\s+[\d.]+%/i, label: 'ROIC' },
      ];
    case 'ruleOneScore':
      return [
        { pattern: /rule\s+one\s+score\s+(of|is|at)\s+\d+/i, label: 'Rule One score' },
        { pattern: /moat\s+score\s+(of|is|at)\s+\d+/i, label: 'moat score' },
      ];
    default:
      return [];
  }
}

// ─── Search Compliance (QUAL-07 / D-06) ─────────────────────────────

/**
 * Check that an agent performed mandated web searches (QUAL-07 extension / D-06).
 * Two-layer verification:
 *   Layer 1: Self-report — does searchesPerformed have entries?
 *   Layer 2: Evidence — do web citations exist that corroborate the searches?
 *
 * @param {object} section - Validated report section
 * @returns {{ score: number, issues: Array }}
 */
function checkSearchCompliance(section) {
  const issues = [];
  const searches = section.searchesPerformed || [];
  const citations = section.citations || [];

  // PSR agents (annual-reader, quarterly-reader) read filings, not web
  // Synthesis writer reads section files, not web
  // These sections are exempt from web search requirements
  const EXEMPT_SECTIONS = ['psr_annual', 'psr_quarterly', 'synthesis', 'overall_verdict'];
  if (EXEMPT_SECTIONS.includes(section.key)) {
    return { score: 100, issues: [] };
  }

  // Count web citations
  const webCitations = citations.filter(c => classifyCitation(c) === 'web_url');

  // Layer 1: Self-report check
  if (searches.length === 0) {
    issues.push({
      type: 'search_compliance',
      severity: 'high',
      message: `Section "${section.title}" reports zero web searches. Curriculum mandates at least 3-5 web searches per analysis section.`,
      field: 'searchesPerformed',
    });
  }

  // Layer 2: Evidence check
  if (webCitations.length === 0) {
    issues.push({
      type: 'search_compliance',
      severity: 'high',
      message: `Section "${section.title}" has zero web-sourced citations. Web research is required for independent verification.`,
      field: 'citations',
    });
  }

  // Layer 3: Cross-check — searches reported but no web citations = suspicious
  if (searches.length > 0 && webCitations.length === 0) {
    issues.push({
      type: 'search_compliance',
      severity: 'medium',
      message: `Section "${section.title}" reports ${searches.length} searches but has zero web citations. Agent may have fabricated search activity.`,
      field: 'searchesPerformed',
    });
  }

  // Layer 4: Searches with resultCount: 0 are suspicious
  const emptySearches = searches.filter(s => s.resultCount === 0);
  if (emptySearches.length > searches.length / 2 && searches.length > 0) {
    issues.push({
      type: 'search_compliance',
      severity: 'low',
      message: `${emptySearches.length}/${searches.length} searches returned 0 results. Search queries may be too specific or fabricated.`,
      field: 'searchesPerformed',
    });
  }

  // Score: 100 if both layers pass, deduct per issue
  const highCount = issues.filter(i => i.severity === 'high').length;
  const medCount = issues.filter(i => i.severity === 'medium').length;
  const lowCount = issues.filter(i => i.severity === 'low').length;
  const score = Math.max(0, 100 - highCount * 30 - medCount * 15 - lowCount * 5);

  return { score, issues };
}

// ─── Methodology Scoring (D-01) ────────────────────────────────────

// Sections exempt from methodology checks — synthesis, PSR readers, overall verdict
const EXEMPT_METHODOLOGY_KEYS = [
  'overall_verdict', 'synthesis', 'psr_annual', 'psr_quarterly',
  'annual-reader', 'quarterly-reader',
];

function isExemptSection(section) {
  const key = section.key || '';
  return EXEMPT_METHODOLOGY_KEYS.some(k => key === k || key.startsWith(k));
}

// Per-section methodology checks derived from Rule One curriculum (pitch-deck-I through IV).
// Each check has: id, label, critical (weighted 2x if true, 1x if false), test function.
const METHODOLOGY_CHECKS = {
  // Radar / Company Info (pitch-deck-I: sections 1-2)
  company_info: [
    {
      id: 'radar-event',
      label: 'Event analysis present',
      critical: true,
      test: (s) => /event|price\s*drop|catalyst|dislocation|pullback|correction|sell.?off/i.test(s.narrative || ''),
    },
    {
      id: 'radar-3ms',
      label: '3 Ms coverage (Meaning, Moat, Management)',
      critical: true,
      test: (s) => {
        const n = (s.narrative || '').toLowerCase();
        return n.includes('meaning') && n.includes('moat') && n.includes('management');
      },
    },
    {
      id: 'radar-snapshot',
      label: 'Company snapshot with key metrics',
      critical: false,
      test: (s) => {
        const d = s.data;
        if (d && typeof d === 'object' && !Array.isArray(d) && Object.keys(d).length >= 2) return true;
        if (typeof d === 'string') {
          try { const parsed = JSON.parse(d); return typeof parsed === 'object' && Object.keys(parsed).length >= 2; } catch { return false; }
        }
        return false;
      },
    },
  ],

  // Simple & Predictable / Minimum Standards (pitch-deck-I)
  minimum_standards: [
    {
      id: 'simple-business-model',
      label: 'Business model clarity (how company makes money)',
      critical: true,
      test: (s) => /revenue\s*(source|stream|model|from|driv)|makes?\s*money|business\s*model|how\s*(it|the\s*company)\s*(earn|generat|mak)/i.test(s.narrative || ''),
    },
    {
      id: 'simple-predictability',
      label: 'Predictability assessment (revenue/earnings consistency)',
      critical: true,
      test: (s) => /predictab|consisten|stable|steady|recurr|trend|visib/i.test(s.narrative || ''),
    },
    {
      id: 'simple-cyclicality',
      label: 'Cyclicality addressed',
      critical: false,
      test: (s) => /cycli|recession|downturn|defensive|counter.?cycl|non.?cycl/i.test(s.narrative || ''),
    },
  ],

  // Market Position (pitch-deck-I: section 3)
  market_position: [
    {
      id: 'market-share',
      label: 'Market share data (percentage or ranking)',
      critical: true,
      test: (s) => /market\s*share|\d+%\s*(market|share|of\s*the\s*market)|#\d+\s*(player|position|rank)|leading|dominant|largest/i.test(s.narrative || ''),
    },
    {
      id: 'market-competitors',
      label: 'Competitor comparison (competitors named)',
      critical: true,
      test: (s) => /competitor|rival|compete|vs\.?|versus|compared\s*to|relative\s*to/i.test(s.narrative || ''),
    },
    {
      id: 'market-tam',
      label: 'Total Addressable Market referenced',
      critical: false,
      test: (s) => /TAM|total\s*addressable|market\s*size|\$\d+.*\s*(billion|trillion|B|T)\s*(market|industry|opportunity)/i.test(s.narrative || ''),
    },
  ],

  // Barriers & Moats (pitch-deck-II: section 4)
  barriers_and_moats: [
    {
      id: 'moat-type',
      label: 'Specific moat type identified',
      critical: true,
      test: (s) => /brand\s*moat|brand\s*advantage|switching\s*cost|toll\s*bridge|price\s*advantage|trade\s*secret|secret|patent|network\s*effect|brand\b.*\bmoat|moat\b.*\bbrand/i.test(s.narrative || ''),
    },
    {
      id: 'moat-durability',
      label: 'Moat durability assessment (10-20 year outlook)',
      critical: true,
      test: (s) => /durab|endur|sustain|10.?year|20.?year|long.?term|anti.?fragil|lasting|permanent|widening/i.test(s.narrative || ''),
    },
    {
      id: 'moat-multiple',
      label: 'Multiple moat types identified',
      critical: false,
      test: (s) => {
        const n = (s.narrative || '').toLowerCase();
        const types = ['brand', 'switching', 'toll bridge', 'price advantage', 'secret', 'patent', 'network'];
        return types.filter(t => n.includes(t)).length >= 2;
      },
    },
    {
      id: 'moat-threat',
      label: 'Competitor copying/threat assessment',
      critical: false,
      test: (s) => /cop(y|ied|ying)|replicate|imitat|threat|disrupt|erode|narrow|challenge/i.test(s.narrative || ''),
    },
  ],

  // Growth Metrics — disambiguated by sectionNumber at runtime.
  // When key is growth_metrics, sectionNumber determines which checks apply:
  //   sectionNumber 5 = FCF checks, sectionNumber 7 = ROE/ROIC/Debt checks
  // If sectionNumber unavailable, both are tried and higher score wins.
  growth_metrics: 'dynamic', // Sentinel: resolved at runtime in scoreMethodology

  // FCF checks (pitch-deck-II: section 5)
  _growth_metrics_5: [
    {
      id: 'fcf-calculation',
      label: 'FCF calculation present',
      critical: true,
      test: (s) => /FCF|free\s*cash\s*flow|operating\s*cash\s*flow\s*minus\s*capex|cash\s*from\s*operations?\s*(-|minus|less)\s*cap/i.test(s.narrative || ''),
    },
    {
      id: 'fcf-ratio',
      label: 'FCF ratio (FCF/earnings)',
      critical: true,
      test: (s) => /FCF\s*ratio|FCF\s*\/\s*(net\s*income|earnings)|FCF.{0,30}(ratio|multiple|x\s*earnings)/i.test(s.narrative || ''),
    },
    {
      id: 'fcf-maintenance-capex',
      label: 'Maintenance vs growth capex distinction',
      critical: false,
      test: (s) => /maintenance\s*cap|growth\s*cap|maintenance.*capex|capex.*maintenance|70%|owner\s*earnings/i.test(s.narrative || ''),
    },
    {
      id: 'fcf-shareholder-benefit',
      label: 'Shareholder benefit discussion (buybacks, dividends)',
      critical: false,
      test: (s) => /buyback|share\s*repurchas|dividend|return.*capital|shareholder.*benefit|capital\s*return/i.test(s.narrative || ''),
    },
  ],

  // ROE/ROIC/Debt checks (pitch-deck-III: section 7)
  _growth_metrics_7: [
    {
      id: 'returns-metrics',
      label: 'Return metrics present (ROE, ROIC, or ROA with values)',
      critical: true,
      test: (s) => /ROE\s*(of|is|at|:|\=)?\s*\d|ROIC\s*(of|is|at|:|\=)?\s*\d|ROA\s*(of|is|at|:|\=)?\s*\d|\d+%?\s*(ROE|ROIC|ROA)/i.test(s.narrative || ''),
    },
    {
      id: 'returns-debt',
      label: 'Debt analysis present',
      critical: true,
      test: (s) => /debt|leverage|debt.?to.?(equity|earnings|capital)|interest\s*coverage|zero.?debt|debt.?free/i.test(s.narrative || ''),
    },
    {
      id: 'returns-roe-roic-comparison',
      label: 'ROE vs ROIC comparison (debt distortion check)',
      critical: false,
      test: (s) => /(ROE.*ROIC|ROIC.*ROE|debt.?driven|not\s*debt.?driven|capital\s*efficien)/i.test(s.narrative || ''),
    },
    {
      id: 'returns-consistency',
      label: '10-year return consistency assessment',
      critical: false,
      test: (s) => /10.?year|consist|never\s*drop|historical|track\s*record|decade/i.test(s.narrative || ''),
    },
  ],

  // Management (pitch-deck-II: section 6)
  management: [
    {
      id: 'mgmt-ceo',
      label: 'CEO evaluation (named or track record)',
      critical: true,
      test: (s) => /CEO|chief\s*executive|[A-Z][a-z]+\s+[A-Z][a-z]+.*?(lead|CEO|chief|founder|tenure|joined|appointed)/i.test(s.narrative || ''),
    },
    {
      id: 'mgmt-insider',
      label: 'Insider ownership discussed',
      critical: true,
      test: (s) => /insider\s*(own|buy|sell|purchas|trad)|ownership\s*stake|skin\s*in\s*the\s*game|share\s*(own|purchas|buy)/i.test(s.narrative || ''),
    },
    {
      id: 'mgmt-capital-allocation',
      label: 'Capital allocation assessment',
      critical: false,
      test: (s) => /capital\s*alloc|buyback|dividend|reinvest|acquisit|return.*capital|share\s*repurchas/i.test(s.narrative || ''),
    },
    {
      id: 'mgmt-integrity',
      label: 'Integrity assessment (promises vs follow-through)',
      critical: false,
      test: (s) => /integrit|promis|follow.?through|deliver|credib|trustworth|transparen|accountab/i.test(s.narrative || ''),
    },
    {
      id: 'mgmt-bag',
      label: 'B.A.G. (Big Audacious Goal) or strategic vision',
      critical: false,
      test: (s) => /B\.?A\.?G\.?|big\s*audacious|strategic\s*vision|long.?term\s*(goal|vision|plan|strateg)/i.test(s.narrative || ''),
    },
  ],

  // Balance Sheet (pitch-deck-III: section 8)
  balance_sheet: [
    {
      id: 'bs-liquidity',
      label: 'Current ratio or liquidity assessment',
      critical: true,
      test: (s) => /current\s*ratio|liquidit|working\s*capital|quick\s*ratio|cash\s*position|cash\s*and\s*equivalents/i.test(s.narrative || ''),
    },
    {
      id: 'bs-equity-trend',
      label: 'Equity trend discussed (positive/growing)',
      critical: true,
      test: (s) => /equity\s*(trend|grow|increas|positive|strength)|shareholder.{0,20}equity|book\s*value\s*(grow|increas|trend)/i.test(s.narrative || ''),
    },
    {
      id: 'bs-assets-liabilities',
      label: 'Assets vs liabilities breakdown',
      critical: false,
      test: (s) => /asset|liabilit|balance\s*sheet\s*(strength|health|quality)|total\s*asset/i.test(s.narrative || ''),
    },
    {
      id: 'bs-downturn-resilience',
      label: 'Balance sheet strength across downturns',
      critical: false,
      test: (s) => /downturn|recession|crisis|covid|pandemic|stress|resilien|weather/i.test(s.narrative || ''),
    },
  ],

  // PEST Risks (pitch-deck-III: section 9)
  pest_risks: [
    {
      id: 'pest-all-categories',
      label: 'All 4 PEST categories covered',
      critical: true,
      test: (s) => {
        const n = (s.narrative || '').toLowerCase();
        return n.includes('political') && n.includes('economic') &&
               n.includes('social') && n.includes('technolog');
      },
    },
    {
      id: 'pest-rebuttal',
      label: 'Rebuttal or counter-argument present',
      critical: true,
      test: (s) => /rebuttal|counter.?argument|counter.?point|mitigat|however|on\s*the\s*other\s*hand|resilien|offset|defend|evidence.{0,20}(suggest|show|demonstrat)/i.test(s.narrative || ''),
    },
    {
      id: 'pest-historical-resilience',
      label: 'Historical resilience evidence',
      critical: false,
      test: (s) => /historical|track\s*record|past.*crisis|survived|weathered|through.*recession|through.*downturn/i.test(s.narrative || ''),
    },
  ],

  // Valuation (pitch-deck-IV: section 10)
  valuation_summary: [
    {
      id: 'val-4-methods',
      label: 'All 4 valuation methods present (MOS, PBT, Ten Cap, Equity Bond)',
      critical: true,
      test: (s) => {
        const n = (s.narrative || '').toLowerCase();
        const hasMOS = /mos|margin\s*of\s*safety|sticker\s*price/i.test(n);
        const hasPBT = /pbt|payback\s*time/i.test(n);
        const hasTenCap = /ten\s*cap|10.?cap|owner\s*earnings/i.test(n);
        const hasEquityBond = /equity\s*bond|buffettology/i.test(n);
        return hasMOS && hasPBT && hasTenCap && hasEquityBond;
      },
    },
    {
      id: 'val-fgr',
      label: 'FGR derivation with multiple inputs',
      critical: true,
      test: (s) => {
        const n = (s.narrative || '').toLowerCase();
        if (!/fgr|future\s*growth\s*rate/i.test(n)) return false;
        // Check for at least 2 of 5 FGR inputs
        const inputs = [
          /historical|rear\s*view|past\s*growth/i,
          /market\s*rel|stockholder|s&p\s*500/i,
          /guidance|management.{0,20}(guide|project|expect|target)/i,
          /sector|industry\s*(cagr|growth|rate)/i,
          /analyst|consensus|wall\s*street|seeking\s*alpha/i,
        ];
        return inputs.filter(p => p.test(n)).length >= 2;
      },
    },
    {
      id: 'val-buy-price',
      label: 'Buy price or price target present',
      critical: true,
      test: (s) => /buy\s*price|sticker\s*price|margin\s*of\s*safety\s*price|price\s*target|fair\s*value|\$\d+.*buy|intrinsic\s*value/i.test(s.narrative || ''),
    },
    {
      id: 'val-sensitivity',
      label: 'Sensitivity analysis or range of values',
      critical: false,
      test: (s) => /sensitiv|range\s*of|scenario|conservative.*optimistic|bull.*bear|low.*high.*case/i.test(s.narrative || ''),
    },
    {
      id: 'val-10yr-outlook',
      label: '10-year outlook assessment',
      critical: false,
      test: (s) => /10.?year\s*(outlook|projec|forecast|horizon|period|view)|decade|next\s*10/i.test(s.narrative || ''),
    },
  ],
};

/**
 * Score methodology compliance for a single section.
 * Returns { score: number, checks: Array<{ id, label, critical, passed }>, passed: boolean }.
 * Exempt sections (synthesis, PSR, overall_verdict) return score 100 with empty checks.
 *
 * For growth_metrics key, sectionNumber disambiguates: 5 = FCF, 7 = ROE/ROIC/Debt.
 * If sectionNumber is unavailable, both check sets are tried and the higher score wins.
 */
function scoreMethodology(section) {
  if (isExemptSection(section)) {
    return { score: 100, checks: [], passed: true };
  }

  const key = section.key || '';
  let checks;

  if (key === 'growth_metrics') {
    // Disambiguate by sectionNumber
    const num = section.sectionNumber;
    if (num === 5) {
      checks = METHODOLOGY_CHECKS._growth_metrics_5;
    } else if (num === 7) {
      checks = METHODOLOGY_CHECKS._growth_metrics_7;
    } else {
      // Unknown sectionNumber — try both, pick higher score
      const result5 = runMethodologyChecks(section, METHODOLOGY_CHECKS._growth_metrics_5);
      const result7 = runMethodologyChecks(section, METHODOLOGY_CHECKS._growth_metrics_7);
      return result5.score >= result7.score ? result5 : result7;
    }
  } else {
    checks = METHODOLOGY_CHECKS[key];
  }

  if (!checks || checks === 'dynamic') {
    // Unknown section key — no methodology checks defined
    return { score: 100, checks: [], passed: true };
  }

  return runMethodologyChecks(section, checks);
}

/**
 * Run a set of methodology checks against a section and compute the weighted score.
 * Critical checks are weighted 2, supplementary weighted 1.
 * Score = (sum of passed weights / sum of total weights) * 100, rounded.
 * passed = true if score >= 50.
 */
function runMethodologyChecks(section, checks) {
  const results = checks.map(check => ({
    id: check.id,
    label: check.label,
    critical: check.critical,
    passed: check.test(section),
  }));

  let totalWeight = 0;
  let passedWeight = 0;
  for (const r of results) {
    const weight = r.critical ? 2 : 1;
    totalWeight += weight;
    if (r.passed) passedWeight += weight;
  }

  const score = totalWeight > 0 ? Math.round((passedWeight / totalWeight) * 100) : 100;
  return { score, checks: results, passed: score >= 50 };
}

// ─── Overall Score Computation ──────────────────────────────────────

/**
 * Compute overall quality score from completeness and issues.
 * @param {{ score: number }} completeness - Completeness result
 * @param {Array} issues - Array of issue objects
 * @returns {number} - Score 0-100
 */
function computeOverallScore(completeness, issues) {
  const highCount = issues.filter(i => i.severity === 'high').length;
  const mediumCount = issues.filter(i => i.severity === 'medium').length;
  const lowCount = issues.filter(i => i.severity === 'low').length;

  const penalty = (highCount * 10) + (mediumCount * 3) + (lowCount * 1);
  return Math.max(0, Math.min(100, completeness.score - penalty));
}

// ─── Main Entry Point ───────────────────────────────────────────────

/**
 * Validate a single report section against the DataPacket.
 * Runs all 6 quality checks and produces a QualityReport.
 * @param {object} section - Report section object
 * @param {object} dataPacket - The DataPacket
 * @param {object} options - Optional configuration
 * @returns {{ sectionKey: string, score: number, completeness: object, issues: Array, passed: boolean, checkedAt: string }}
 */
export function validateSection(section, dataPacket, options = {}) {
  const issues = [];

  // 1. Citation validation (QUAL-01)
  const citationIssues = validateCitations(section.citations, dataPacket);
  issues.push(...citationIssues);

  // 2. Completeness scoring (QUAL-02)
  const completeness = scoreCompleteness(section);

  // 3. Confidence validation (QUAL-03)
  const confidenceIssues = validateConfidence(section, dataPacket);
  issues.push(...confidenceIssues);

  // 4. Multi-source verification (QUAL-04)
  const sourceIssues = checkMultiSource(section.citations);
  issues.push(...sourceIssues);

  // 5. Red flag quality (QUAL-05)
  const redFlagIssues = validateRedFlags(section.redFlags);
  issues.push(...redFlagIssues);

  // 6. Data gap detection (QUAL-06)
  const gapIssues = detectDataGaps(section, dataPacket);
  issues.push(...gapIssues);

  // 7. Search compliance (QUAL-07 / D-06)
  const searchCompliance = checkSearchCompliance(section);
  issues.push(...searchCompliance.issues);

  const score = computeOverallScore(completeness, issues);

  // 8. Methodology scoring (per D-01)
  const methodology = scoreMethodology(section);

  return {
    sectionKey: section.key,
    score,
    completeness,
    issues,
    passed: issues.filter(i => i.severity === 'high').length === 0,
    methodology,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Validate all sections in a stage, producing an aggregate quality report.
 * @param {Array} sections - Array of report section objects
 * @param {object} dataPacket - The DataPacket
 * @returns {{ sections: Array, overallScore: number, overallPassed: boolean, checkedAt: string }}
 */
export function validateStage(sections, dataPacket) {
  const sectionReports = sections.map(s => validateSection(s, dataPacket));
  const overallScore = sectionReports.length > 0
    ? Math.round(sectionReports.reduce((sum, r) => sum + r.score, 0) / sectionReports.length)
    : 0;
  const overallPassed = sectionReports.every(r => r.passed);

  const methodologyScores = sectionReports.map(r => r.methodology?.score ?? 100);
  const overallMethodologyScore = methodologyScores.length > 0
    ? Math.round(methodologyScores.reduce((a, b) => a + b, 0) / methodologyScores.length)
    : 0;

  return {
    sections: sectionReports,
    overallScore,
    overallPassed,
    overallMethodologyScore,
    checkedAt: new Date().toISOString(),
  };
}

// Test-only exports for unit testing individual functions
export const _testExports = {
  classifyCitation,
  resolveDataPath,
  matchNumericValue,
  validateCitations,
  scoreCompleteness,
  validateConfidence,
  checkMultiSource,
  validateRedFlags,
  detectDataGaps,
  checkSearchCompliance,
  scoreMethodology,
  METHODOLOGY_CHECKS,
};
