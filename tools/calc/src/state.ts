import { bytesToBase64Url, base64UrlToBytes } from './base64url.js';
import type { BuildState, SkillsData } from './types.js';
import type { DevotionsData, DevotionState } from './devotion-types.js';
import { emptyDevotionState, nodeKey } from './devotion-types.js';

const HEADER_BYTES = 9;

function skillsForMastery(masteryId: number, data: SkillsData) {
  const m = data.masteries.find(m => m.id === masteryId);
  if (!m) throw new Error(`Unknown mastery id ${masteryId}`);
  return m.skills;
}

/**
 * Canonicalize a state for encoding. The two slots carry no semantic meaning,
 * so we place the lower-id mastery in slot A. A single mastery always lands
 * in slot A.
 */
function canonicalize(state: BuildState): BuildState {
  const [mA, mB] = state.masteries;
  const [bA, bB] = state.masteryBar;

  const shouldSwap =
    (mA === null && mB !== null) ||
    (mA !== null && mB !== null && mA > mB);

  if (!shouldSwap) return state;

  return {
    ...state,
    masteries: [mB, mA],
    masteryBar: [bB, bA],
  };
}

export function encodeState(state: BuildState, data: SkillsData): string {
  const c = canonicalize(state);
  const [mA, mB] = c.masteries;
  const [bA, bB] = c.masteryBar;

  const ranksFor = (mid: number | null): number[] => {
    if (mid === null) return [];
    return skillsForMastery(mid, data).map(
      s => c.allocations.get(s.id) ?? 0
    );
  };

  const ranksA = ranksFor(mA);
  const ranksB = ranksFor(mB);
  const body = HEADER_BYTES + ranksA.length + ranksB.length;
  const bytes = new Uint8Array(body);

  bytes[0] = c.versionId & 0xff;
  bytes[1] = (mA ?? 0) & 0xff;
  bytes[2] = (mB ?? 0) & 0xff;
  bytes[3] = (c.level ?? 0) & 0xff;
  const cp = c.customPoints ?? 0xffff;
  bytes[4] = (cp >> 8) & 0xff;
  bytes[5] = cp & 0xff;
  bytes[6] = c.questRewards ? 1 : 0;
  bytes[7] = bA & 0xff;
  bytes[8] = bB & 0xff;

  let off = HEADER_BYTES;
  for (const r of ranksA) bytes[off++] = r & 0xff;
  for (const r of ranksB) bytes[off++] = r & 0xff;

  return bytesToBase64Url(bytes);
}

export function decodeState(encoded: string, data: SkillsData): BuildState {
  const bytes = base64UrlToBytes(encoded);
  if (bytes.length < HEADER_BYTES) {
    throw new Error(`Encoded state too short: ${bytes.length} bytes`);
  }

  const versionId = bytes[0];
  const mA = bytes[1] === 0 ? null : bytes[1];
  const mB = bytes[2] === 0 ? null : bytes[2];
  const level = bytes[3] === 0 ? null : bytes[3];
  const cpRaw = (bytes[4] << 8) | bytes[5];
  const customPoints = cpRaw === 0xffff ? null : cpRaw;
  const questRewards = bytes[6] !== 0;
  const barA = bytes[7];
  const barB = bytes[8];

  const ranksALen = mA === null ? 0 : skillsForMastery(mA, data).length;
  const ranksBLen = mB === null ? 0 : skillsForMastery(mB, data).length;
  const expected = HEADER_BYTES + ranksALen + ranksBLen;
  if (bytes.length !== expected) {
    throw new Error(
      `Encoded state length mismatch: got ${bytes.length}, expected ${expected}`
    );
  }

  const allocations = new Map<string, number>();
  let off = HEADER_BYTES;
  if (mA !== null) {
    const skills = skillsForMastery(mA, data);
    for (const s of skills) {
      const r = bytes[off++];
      if (r > 0) allocations.set(s.id, r);
    }
  }
  if (mB !== null) {
    const skills = skillsForMastery(mB, data);
    for (const s of skills) {
      const r = bytes[off++];
      if (r > 0) allocations.set(s.id, r);
    }
  }

  return {
    versionId,
    masteries: [mA, mB],
    level,
    customPoints,
    questRewards,
    masteryBar: [barA, barB],
    allocations,
  };
}

const DEFAULT_DEVOTION_CAP = 55;
const DEVOTION_HEADER = 3;

export function encodeDevotionState(state: DevotionState, data: DevotionsData): string {
  const cap = state.devotionCap;
  const capU16 = cap === DEFAULT_DEVOTION_CAP ? 0xffff : cap;
  let xrBits = 0;
  for (let i = 0; i < data.crossroads.length; i++) {
    if (state.crossroads.has(data.crossroads[i].id)) {
      xrBits |= (1 << i);
    }
  }
  const bytes = new Uint8Array(DEVOTION_HEADER + data.constellations.length);
  bytes[0] = (capU16 >> 8) & 0xff;
  bytes[1] = capU16 & 0xff;
  bytes[2] = xrBits;
  for (let ci = 0; ci < data.constellations.length; ci++) {
    const c = data.constellations[ci];
    let bits = 0;
    for (let ni = 0; ni < c.nodes.length; ni++) {
      if (state.allocatedNodes.has(nodeKey(c.id, c.nodes[ni].index))) {
        bits |= (1 << ni);
      }
    }
    bytes[DEVOTION_HEADER + ci] = bits;
  }
  return bytesToBase64Url(bytes);
}

export function decodeDevotionState(encoded: string, data: DevotionsData): DevotionState {
  if (!encoded) return emptyDevotionState();
  const bytes = base64UrlToBytes(encoded);
  if (bytes.length < DEVOTION_HEADER) return emptyDevotionState();
  const capRaw = (bytes[0] << 8) | bytes[1];
  const devotionCap = capRaw === 0xffff ? DEFAULT_DEVOTION_CAP : capRaw;
  const xrBits = bytes[2];
  const crossroads = new Set<string>();
  for (let i = 0; i < data.crossroads.length; i++) {
    if (xrBits & (1 << i)) {
      crossroads.add(data.crossroads[i].id);
    }
  }
  const allocatedNodes = new Set<string>();
  for (let ci = 0; ci < data.constellations.length; ci++) {
    if (DEVOTION_HEADER + ci >= bytes.length) break;
    const bits = bytes[DEVOTION_HEADER + ci];
    const c = data.constellations[ci];
    for (let ni = 0; ni < c.nodes.length; ni++) {
      if (bits & (1 << ni)) {
        allocatedNodes.add(nodeKey(c.id, c.nodes[ni].index));
      }
    }
  }
  return { allocatedNodes, crossroads, devotionCap };
}
