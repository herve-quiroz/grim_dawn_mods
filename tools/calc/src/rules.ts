import type { BuildState, SkillsData, Mastery, Skill } from './types.js';

const DEFAULT_LEVEL = 100;

export function computeBudget(state: BuildState, data: SkillsData): number {
  if (state.customPoints !== null) return state.customPoints;
  const level = state.level ?? DEFAULT_LEVEL;
  let sum = 0;
  for (let L = 2; L <= level && L < data.pointsPerLevel.length; L++) {
    sum += data.pointsPerLevel[L];
  }
  if (state.questRewards) sum += data.questRewardPoints;
  return sum;
}

export function totalAllocated(state: BuildState): number {
  let sum = state.masteryBar[0] + state.masteryBar[1];
  for (const rank of state.allocations.values()) sum += rank;
  return sum;
}

export function findMastery(id: number, data: SkillsData): Mastery {
  const m = data.masteries.find(m => m.id === id);
  if (!m) throw new Error(`Unknown mastery id ${id}`);
  return m;
}

export function findSkill(id: string, data: SkillsData): Skill {
  for (const m of data.masteries) {
    const s = m.skills.find(s => s.id === id);
    if (s) return s;
  }
  throw new Error(`Unknown skill id ${id}`);
}

/**
 * Return true when the user can allocate at least rank 1 in this skill:
 * mastery bar is high enough, and (for modifiers) the parent skill has the
 * required rank.
 */
export function isSkillUnlocked(
  skill: Skill,
  slot: 0 | 1,
  state: BuildState,
): boolean {
  const minBar = Math.max(1, skill.prereqBar);
  if (state.masteryBar[slot] < minBar) return false;
  if (skill.parent !== null) {
    const parentRank = state.allocations.get(skill.parent) ?? 0;
    if (parentRank < skill.parentMinRank) return false;
  }
  return true;
}

export type DeltaTarget =
  | { kind: 'skill'; skillId: string; slot: 0 | 1 }
  | { kind: 'bar'; slot: 0 | 1 };

export interface RefundEntry {
  skillId: string;
  refunded: number;
}

export interface DeltaResult {
  state: BuildState;
  refunds: RefundEntry[];
}

/**
 * Apply a change to either a skill rank or mastery bar rank, with cascade
 * refunds for any allocated dependents whose requirements become broken.
 * Returns the original state object (by identity) if the change is not
 * legal (at cap, at zero, skill locked).
 */
export function applyDelta(
  state: BuildState,
  target: DeltaTarget,
  delta: number,
  data: SkillsData,
): DeltaResult {
  if (delta === 0) return { state, refunds: [] };

  if (target.kind === 'skill') {
    const skill = findSkill(target.skillId, data);
    const current = state.allocations.get(target.skillId) ?? 0;
    const next = current + delta;
    if (next < 0 || next > skill.maxRank) return { state, refunds: [] };
    if (delta > 0 && !isSkillUnlocked(skill, target.slot, state)) {
      return { state, refunds: [] };
    }
    const allocations = new Map(state.allocations);
    if (next === 0) allocations.delete(target.skillId);
    else allocations.set(target.skillId, next);
    const nextState: BuildState = { ...state, allocations };
    if (delta < 0) {
      const r = cascadeRefunds(nextState, data);
      return { state: r.state, refunds: r.refunds };
    }
    return { state: nextState, refunds: [] };
  }

  // kind === 'bar'
  const slot = target.slot;
  const masteryId = state.masteries[slot];
  if (masteryId === null) return { state, refunds: [] };
  const mastery = findMastery(masteryId, data);
  const current = state.masteryBar[slot];
  const next = current + delta;
  if (next < 0 || next > mastery.barMaxRank) return { state, refunds: [] };
  const masteryBar: [number, number] = [state.masteryBar[0], state.masteryBar[1]];
  masteryBar[slot] = next;
  const nextState: BuildState = { ...state, masteryBar };
  if (delta < 0) {
    const r = cascadeRefunds(nextState, data);
    return { state: r.state, refunds: r.refunds };
  }
  return { state: nextState, refunds: [] };
}

/**
 * Inspect all allocations; if any depends on something no longer satisfied
 * (mastery bar rank or parent rank), refund it. Repeat until fixed point.
 */
function cascadeRefunds(state: BuildState, data: SkillsData): DeltaResult {
  const allocations = new Map(state.allocations);
  const refunds: RefundEntry[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const [skillId, rank] of Array.from(allocations.entries())) {
      const skill = findSkill(skillId, data);
      const slot = skillSlot(skillId, state, data);
      if (slot === null) continue;
      const barOk = state.masteryBar[slot] >= Math.max(1, skill.prereqBar);
      const parentOk =
        skill.parent === null ||
        (allocations.get(skill.parent) ?? 0) >= skill.parentMinRank;
      if (!barOk || !parentOk) {
        allocations.delete(skillId);
        refunds.push({ skillId, refunded: rank });
        changed = true;
      }
    }
  }
  return { state: { ...state, allocations }, refunds };
}

function skillSlot(
  skillId: string,
  state: BuildState,
  data: SkillsData,
): 0 | 1 | null {
  for (let i = 0; i < 2; i++) {
    const mid = state.masteries[i];
    if (mid === null) continue;
    const mastery = findMastery(mid, data);
    if (mastery.skills.some(s => s.id === skillId)) return i as 0 | 1;
  }
  return null;
}
