// Layer 2 XBRL Tag Resolution — Taxonomy Hierarchy Fallback
//
// Uses pre-built taxonomy hierarchy JSON (from FASB calculation linkbase)
// to find additional XBRL tags when Layer 1 (static tag map) misses.
//
// The hierarchy maps each Layer 1 concept to its descendants in the
// FASB calculation tree. At runtime, for fields that Layer 1 didn't
// resolve, we try these descendant tags as additional fallbacks.

import taxonomyData from '../data/taxonomy-hierarchy.json';

const { hierarchy } = taxonomyData;

/**
 * Augment a taxonomy array with Layer 2 fallback tags.
 *
 * Returns a new taxonomy array where each field's `tags` list is extended
 * with additional taxonomy-derived descendant tags. Layer 1 tags remain
 * first (highest priority); Layer 2 tags are appended after.
 *
 * The `_layer2Start` index marks where Layer 2 tags begin, so provenance
 * can distinguish which layer resolved a field.
 *
 * @param {Array} taxonomy - INCOME_TAXONOMY, BALANCE_TAXONOMY, or CASHFLOW_TAXONOMY
 * @returns {Array} Augmented taxonomy (new array, does not mutate input)
 */
export function augmentTaxonomy(taxonomy) {
  return taxonomy.map(fieldDef => {
    const layer2Tags = getLayer2Tags(fieldDef.tags);
    if (layer2Tags.length === 0) return fieldDef;

    return {
      ...fieldDef,
      tags: [...fieldDef.tags, ...layer2Tags],
      _layer2Start: fieldDef.tags.length,
    };
  });
}

/**
 * Get additional Layer 2 tags for a field's Layer 1 tag list.
 *
 * For each Layer 1 tag, looks up its descendants in the taxonomy hierarchy.
 * Returns only tags that aren't already in the Layer 1 list (no duplicates).
 * Tags are ordered shallowest-first (depth 1 before depth 2).
 *
 * @param {string[]} layer1Tags - The field's existing Layer 1 tags
 * @returns {string[]} Additional tags from taxonomy hierarchy
 */
export function getLayer2Tags(layer1Tags) {
  const layer1Set = new Set(layer1Tags);
  const seen = new Set();
  const additional = [];

  for (const rootTag of layer1Tags) {
    const descendants = hierarchy[rootTag];
    if (!descendants) continue;

    for (const tag of descendants) {
      if (!layer1Set.has(tag) && !seen.has(tag)) {
        seen.add(tag);
        additional.push(tag);
      }
    }
  }

  return additional;
}

/**
 * Check if a resolved tag index falls in the Layer 2 range.
 *
 * @param {number} tagIndex - Index of the resolved tag in the augmented tags array
 * @param {number|undefined} layer2Start - The _layer2Start index (undefined if no Layer 2 tags)
 * @returns {number} 1 for Layer 1, 2 for Layer 2
 */
export function getTagLayer(tagIndex, layer2Start) {
  if (layer2Start != null && tagIndex >= layer2Start) return 2;
  return 1;
}
