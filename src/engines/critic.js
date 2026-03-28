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
  'citations', 'redFlags', 'generatedAt', 'modelUsed', 'tokenCost',
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

  return {
    sectionKey: section.key,
    score,
    completeness,
    issues,
    passed: issues.filter(i => i.severity === 'high').length === 0,
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

  return {
    sections: sectionReports,
    overallScore,
    overallPassed,
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
};
