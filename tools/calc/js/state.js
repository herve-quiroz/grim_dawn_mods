import { bytesToBase64Url, base64UrlToBytes } from './base64url.js';
const HEADER_BYTES = 9;
function skillsForMastery(masteryId, data) {
    const m = data.masteries.find(m => m.id === masteryId);
    if (!m)
        throw new Error(`Unknown mastery id ${masteryId}`);
    return m.skills;
}
/**
 * Canonicalize a state for encoding. The two slots carry no semantic meaning,
 * so we place the lower-id mastery in slot A. A single mastery always lands
 * in slot A.
 */
function canonicalize(state) {
    const [mA, mB] = state.masteries;
    const [bA, bB] = state.masteryBar;
    const shouldSwap = (mA === null && mB !== null) ||
        (mA !== null && mB !== null && mA > mB);
    if (!shouldSwap)
        return state;
    return {
        ...state,
        masteries: [mB, mA],
        masteryBar: [bB, bA],
    };
}
export function encodeState(state, data) {
    const c = canonicalize(state);
    const [mA, mB] = c.masteries;
    const [bA, bB] = c.masteryBar;
    const ranksFor = (mid) => {
        if (mid === null)
            return [];
        return skillsForMastery(mid, data).map(s => c.allocations.get(s.id) ?? 0);
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
    for (const r of ranksA)
        bytes[off++] = r & 0xff;
    for (const r of ranksB)
        bytes[off++] = r & 0xff;
    return bytesToBase64Url(bytes);
}
export function decodeState(encoded, data) {
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
        throw new Error(`Encoded state length mismatch: got ${bytes.length}, expected ${expected}`);
    }
    const allocations = new Map();
    let off = HEADER_BYTES;
    if (mA !== null) {
        const skills = skillsForMastery(mA, data);
        for (const s of skills) {
            const r = bytes[off++];
            if (r > 0)
                allocations.set(s.id, r);
        }
    }
    if (mB !== null) {
        const skills = skillsForMastery(mB, data);
        for (const s of skills) {
            const r = bytes[off++];
            if (r > 0)
                allocations.set(s.id, r);
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
//# sourceMappingURL=state.js.map