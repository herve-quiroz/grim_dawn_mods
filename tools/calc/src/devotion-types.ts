export interface DevotionStat {
  label: string;
  value: string;
}

export interface DevotionSkillStat {
  label: string;
  level1: string;
  levelMax: string;
}

export interface DevotionSkill {
  name: string;
  description: string;
  maxLevel: number;
  stats: DevotionSkillStat[];
  petStats: DevotionSkillStat[];
}

export interface DevotionNode {
  index: number;
  parent: number | null;
  stats: DevotionStat[];
  skill: DevotionSkill | null;
}

export interface AffinityAmount {
  affinity: number;  // index into DevotionsData.affinities
  amount: number;
}

export interface Constellation {
  id: string;
  name: string;
  tier: number;
  requires: AffinityAmount[];
  bonus: AffinityAmount[];
  nodes: DevotionNode[];
}

export interface CrossroadsEntry {
  id: string;
  affinity: number;  // index into DevotionsData.affinities
}

export interface DevotionsData {
  gdVersion: string;
  affinities: string[];
  constellations: Constellation[];
  crossroads: CrossroadsEntry[];
}

export interface DevotionState {
  allocatedNodes: Set<string>;   // "constellationId:nodeIndex"
  crossroads: Set<string>;       // crossroads entry id
  devotionCap: number;           // default 55
}

export function emptyDevotionState(): DevotionState {
  return {
    allocatedNodes: new Set(),
    crossroads: new Set(),
    devotionCap: 55,
  };
}

export function nodeKey(constellationId: string, nodeIndex: number): string {
  return `${constellationId}:${nodeIndex}`;
}
