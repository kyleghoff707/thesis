// sliceDataPacket — per-agent DataPacket slicing, matching Claude Code behavior.
//
// The production one-pager (and eventually pitch-deck specialist agents via coordinator
// dispatch) receives a subset of the full DataPacket tailored to what that agent uses.
// Slicing reduces input tokens and noise; the REGISTRY of fields-per-agent is shared
// with scripts/slice-datapacket.js via ../data/datapacket-slice-registry.json.

import registry from '../data/datapacket-slice-registry.json';

const AGENTS = registry.agents;

/**
 * Return the array of DataPacket field names for an agent role, or throw if unknown.
 */
export function fieldsForAgent(agentRole) {
  const fields = AGENTS[agentRole];
  if (!fields) {
    throw new Error(
      `sliceDataPacket: unknown agentRole "${agentRole}". ` +
      `Known roles: ${Object.keys(AGENTS).join(', ')}`
    );
  }
  return fields;
}

/**
 * Slice a full DataPacket down to just the fields an agent needs.
 *
 * @param {object} dataPacket — full DataPacket object from src/engines/dataExport.js
 * @param {string} agentRole — key in the registry (e.g., "one-pager", "business-analyst")
 * @returns {object} sliced DataPacket with _sliceMetadata appended
 */
export function sliceDataPacket(dataPacket, agentRole) {
  if (!dataPacket || typeof dataPacket !== 'object') {
    throw new Error('sliceDataPacket: dataPacket must be an object');
  }

  const fields = fieldsForAgent(agentRole);

  const slice = {};
  const fieldsIncluded = [];
  const fieldsMissing = [];

  for (const field of fields) {
    if (dataPacket[field] !== undefined) {
      slice[field] = dataPacket[field];
      fieldsIncluded.push(field);
    } else {
      fieldsMissing.push(field);
    }
  }

  slice._sliceMetadata = {
    ticker: dataPacket.ticker ?? null,
    agentRole,
    fieldsIncluded,
    fieldsMissing,
    originalSize: JSON.stringify(dataPacket).length,
    sliceSize: JSON.stringify(slice).length,
  };

  return slice;
}

export { AGENTS as SLICE_REGISTRY };
