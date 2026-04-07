import type { Skill, SkillsData, BuildState } from './types.js';
import type { DevotionsData, DevotionState } from './devotion-types.js';

const EXCLUDES_SKILL = new Set([
  'Energy Cost', 'Energy Reserved', 'Skill Recharge',
  'Duration', '% Weapon Damage', 'Meter Radius',
]);

export function isPassive(skill: Skill): boolean {
  if (skill.parent !== null) return false;
  if (skill.exclusive) return false;
  return !skill.stats.some(s => EXCLUDES_SKILL.has(s.label));
}

const EXCLUDED_LABELS = new Set(['Projectiles', 'Target Maximum', 'Knockdown Chance', 'Knockdown Duration']);

function isExcludedLabel(label: string): boolean {
  if (EXCLUDED_LABELS.has(label)) return true;
  if (label.endsWith('Duration')) return true;
  return false;
}

export function collectBonuses(
  state: BuildState,
  data: SkillsData,
  devState: DevotionState,
  devData: DevotionsData | null,
): Map<string, number> {
  const totals = new Map<string, number>();

  const add = (label: string, value: number) => {
    if (isExcludedLabel(label)) return;
    totals.set(label, (totals.get(label) ?? 0) + value);
  };

  for (const mastery of data.masteries) {
    for (const skill of mastery.skills) {
      const rank = state.allocations.get(skill.id);
      if (!rank || !isPassive(skill)) continue;
      for (const stat of skill.stats) {
        const idx = Math.min(rank, stat.values.length) - 1;
        add(stat.label, stat.values[idx]);
      }
    }
  }

  if (devData) {
    for (const constellation of devData.constellations) {
      for (const node of constellation.nodes) {
        const key = `${constellation.id}:${node.index}`;
        if (!devState.allocatedNodes.has(key)) continue;
        if (node.skill !== null) continue;
        for (const stat of node.stats) {
          add(stat.label, parseFloat(stat.value));
        }
      }
    }
  }

  return totals;
}

export interface BonusEntry {
  label: string;
  value: number;
}

export interface BonusCategory {
  name: string;
  entries: BonusEntry[];
}

const ATTRIBUTE_KEYWORDS = ['Physique', 'Cunning', 'Spirit', 'Constitution'];
const OFFENSE_KEYWORDS = ['Offensive Ability', 'Attack Speed', 'Casting Speed', 'Crit Damage', 'Total Damage', 'Movement Speed'];
const DAMAGE_KEYWORDS = [
  'Physical Damage', 'Fire Damage', 'Cold Damage', 'Lightning Damage',
  'Aether Damage', 'Chaos Damage', 'Vitality Damage', 'Bleeding Damage',
  'Pierce Damage', 'Poison Damage', 'Acid Damage', 'Burn Damage',
  'Frostburn Damage', 'Electrocute Damage', 'Internal Trauma',
  'Life Damage', 'Life Decay', 'Retaliation',
  'Elemental Damage',
];
const DEFENSE_KEYWORDS = ['Defensive Ability', 'Armor', 'Block Chance', 'Block Recovery', 'Armor Requirement'];
const HEALTH_KEYWORDS = ['Health', 'Energy'];

type CategoryDef = { name: string; test: (label: string) => boolean };

const CATEGORIES: CategoryDef[] = [
  { name: 'Attributes', test: l => ATTRIBUTE_KEYWORDS.some(k => l.includes(k)) },
  { name: 'Offense', test: l => OFFENSE_KEYWORDS.some(k => l.includes(k)) },
  { name: 'Damage', test: l => DAMAGE_KEYWORDS.some(k => l.includes(k)) },
  { name: 'Defense', test: l => DEFENSE_KEYWORDS.some(k => l.includes(k)) },
  { name: 'Health & Energy', test: l => HEALTH_KEYWORDS.some(k => l.includes(k)) },
  { name: 'Resistances', test: l => l.includes('Resistance') },
];

export function categorizeBonuses(bonuses: Map<string, number>): BonusCategory[] {
  if (bonuses.size === 0) return [];

  const buckets = new Map<string, BonusEntry[]>();
  for (const cat of CATEGORIES) buckets.set(cat.name, []);
  buckets.set('Other', []);

  for (const [label, value] of bonuses) {
    let placed = false;
    for (const cat of CATEGORIES) {
      if (cat.test(label)) {
        buckets.get(cat.name)!.push({ label, value });
        placed = true;
        break;
      }
    }
    if (!placed) buckets.get('Other')!.push({ label, value });
  }

  const result: BonusCategory[] = [];
  for (const name of [...CATEGORIES.map(c => c.name), 'Other']) {
    const entries = buckets.get(name)!;
    if (entries.length === 0) continue;
    entries.sort((a, b) => a.label.localeCompare(b.label));
    result.push({ name, entries });
  }
  return result;
}
