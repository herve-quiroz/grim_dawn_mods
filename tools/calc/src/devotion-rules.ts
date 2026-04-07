import type { Constellation, DevotionsData, DevotionState } from './devotion-types.js';
import { nodeKey } from './devotion-types.js';

export interface DevotionRefundEntry {
  constellationId: string;
  nodeIndex: number;
}

export interface DevotionDeltaResult {
  state: DevotionState;
  refunds: DevotionRefundEntry[];
}

/** Check if every node in a constellation is allocated. */
function isComplete(constellationId: string, constellation: Constellation, state: DevotionState): boolean {
  return constellation.nodes.every(n => state.allocatedNodes.has(nodeKey(constellationId, n.index)));
}

/**
 * Compute current affinity totals.
 * Crossroads each give +1 of their affinity.
 * Completed constellations give their bonus affinities.
 */
export function computeAffinities(state: DevotionState, data: DevotionsData): number[] {
  const aff = new Array(data.affinities.length).fill(0);

  for (const xr of data.crossroads) {
    if (state.crossroads.has(xr.id)) {
      aff[xr.affinity] += 1;
    }
  }

  for (const c of data.constellations) {
    if (isComplete(c.id, c, state)) {
      for (const b of c.bonus) {
        aff[b.affinity] += b.amount;
      }
    }
  }

  return aff;
}

/** Total devotion points spent (nodes + crossroads). */
export function totalDevotionSpent(state: DevotionState): number {
  return state.allocatedNodes.size + state.crossroads.size;
}

/**
 * Check if a proposed state would break affinity requirements for any
 * constellation that still has allocated nodes.
 */
export function wouldBreakAffinities(proposed: DevotionState, data: DevotionsData): boolean {
  const aff = computeAffinities(proposed, data);
  for (const c of data.constellations) {
    const hasNodes = c.nodes.some(n => proposed.allocatedNodes.has(nodeKey(c.id, n.index)));
    if (!hasNodes) continue;
    if (!c.requires.every(r => aff[r.affinity] >= r.amount)) return true;
  }
  return false;
}

/** Check if a constellation's affinity requirements are met. */
export function isConstellationUnlockable(
  constellation: Constellation,
  state: DevotionState,
  data: DevotionsData,
): boolean {
  const aff = computeAffinities(state, data);
  return constellation.requires.every(r => aff[r.affinity] >= r.amount);
}

/** Check if a specific node can be allocated. */
export function isNodeAllocatable(
  constellation: Constellation,
  nodeIndex: number,
  state: DevotionState,
  data: DevotionsData,
): boolean {
  if (!isConstellationUnlockable(constellation, state, data)) return false;
  const node = constellation.nodes.find(n => n.index === nodeIndex);
  if (!node) return false;
  if (state.allocatedNodes.has(nodeKey(constellation.id, nodeIndex))) return false;
  if (node.parent === null) return true;
  return state.allocatedNodes.has(nodeKey(constellation.id, node.parent));
}

/**
 * Apply a +1 or -1 delta to a devotion node.
 * On removal, cascade-refunds children whose parent is no longer allocated.
 */
export function applyNodeDelta(
  state: DevotionState,
  constellationId: string,
  nodeIndex: number,
  delta: 1 | -1,
  data: DevotionsData,
): DevotionDeltaResult {
  const constellation = data.constellations.find(c => c.id === constellationId);
  if (!constellation) return { state, refunds: [] };

  const key = nodeKey(constellationId, nodeIndex);

  if (delta === 1) {
    if (state.allocatedNodes.has(key)) return { state, refunds: [] };
    if (!isNodeAllocatable(constellation, nodeIndex, state, data)) return { state, refunds: [] };
    const next: DevotionState = {
      ...state,
      allocatedNodes: new Set(state.allocatedNodes),
    };
    next.allocatedNodes.add(key);
    return { state: next, refunds: [] };
  }

  // delta === -1: remove node and cascade
  if (!state.allocatedNodes.has(key)) return { state, refunds: [] };
  const next: DevotionState = {
    ...state,
    allocatedNodes: new Set(state.allocatedNodes),
  };
  next.allocatedNodes.delete(key);

  // Cascade: repeatedly remove orphaned children within this constellation
  const refunds: DevotionRefundEntry[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of constellation.nodes) {
      const nk = nodeKey(constellationId, node.index);
      if (!next.allocatedNodes.has(nk)) continue;
      if (node.parent === null) continue;
      if (!next.allocatedNodes.has(nodeKey(constellationId, node.parent))) {
        next.allocatedNodes.delete(nk);
        refunds.push({ constellationId, nodeIndex: node.index });
        changed = true;
      }
    }
  }

  // Reject if removal would break affinity requirements for other constellations
  if (wouldBreakAffinities(next, data)) return { state, refunds: [] };

  return { state: next, refunds };
}

/**
 * Toggle all nodes in a constellation.
 * If all allocated: clear them all. Otherwise: fill all (in dependency order).
 */
export function toggleConstellationAll(
  state: DevotionState,
  constellationId: string,
  data: DevotionsData,
): DevotionState {
  const constellation = data.constellations.find(c => c.id === constellationId);
  if (!constellation) return state;

  const complete = isComplete(constellationId, constellation, state);
  const next: DevotionState = {
    ...state,
    allocatedNodes: new Set(state.allocatedNodes),
  };

  if (complete) {
    // Clear all (reject if it would break affinity requirements elsewhere)
    for (const node of constellation.nodes) {
      next.allocatedNodes.delete(nodeKey(constellationId, node.index));
    }
    if (wouldBreakAffinities(next, data)) return state;
  } else {
    // Fill all (only if constellation is unlockable)
    if (!isConstellationUnlockable(constellation, state, data)) return state;
    for (const node of constellation.nodes) {
      next.allocatedNodes.add(nodeKey(constellationId, node.index));
    }
  }

  return next;
}
