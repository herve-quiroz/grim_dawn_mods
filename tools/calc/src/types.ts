export interface SkillUiPos {
  row: number;
  col: number;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  icon: string;
  maxRank: number;
  ui: SkillUiPos;
  prereqBar: number;
  parent: string | null;
  parentMinRank: number;
}

export interface Mastery {
  id: number;
  name: string;
  barMaxRank: number;
  skills: Skill[];
}

export interface SkillsData {
  gdVersion: string;
  pointsPerLevel: number[];
  questRewardPoints: number;
  masteries: Mastery[];
}

export interface VersionsData {
  versions: string[];
  latest: number;
}

export interface BuildState {
  versionId: number;
  masteries: [number | null, number | null];
  level: number | null;
  customPoints: number | null;
  questRewards: boolean;
  masteryBar: [number, number];
  allocations: Map<string, number>;
}

export function emptyBuildState(versionId: number): BuildState {
  return {
    versionId,
    masteries: [null, null],
    level: null,
    customPoints: null,
    questRewards: true,
    masteryBar: [0, 0],
    allocations: new Map(),
  };
}
