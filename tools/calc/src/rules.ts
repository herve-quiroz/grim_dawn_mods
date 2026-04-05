import type { BuildState, SkillsData } from './types.js';

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
