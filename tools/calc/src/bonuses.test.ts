import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPassive, collectBonuses, categorizeBonuses } from './bonuses.js';
import type { Skill, SkillsData, BuildState } from './types.js';
import type { DevotionsData, DevotionState } from './devotion-types.js';
import type { BonusCategory as _BonusCategory } from './bonuses.js';

function makeSkill(overrides: Partial<Skill> & { stats?: { label: string; values: number[] }[] }): Skill {
  return {
    id: 'test.skill',
    name: 'Test',
    description: '',
    icon: '',
    maxRank: 10,
    ui: { row: 0, col: 0 },
    prereqBar: 0,
    parent: null,
    parentMinRank: 0,
    exclusive: false,
    stats: [],
    ...overrides,
  };
}

test('isPassive: true for Military Conditioning-like skill', () => {
  const s = makeSkill({ stats: [{ label: '+% Health', values: [3, 6] }, { label: '+% Physique', values: [1, 3] }] });
  assert.equal(isPassive(s), true);
});

test('isPassive: false when parent is set', () => {
  const s = makeSkill({ parent: 'playerclass01.cadence1', stats: [{ label: '+% Damage', values: [5] }] });
  assert.equal(isPassive(s), false);
});

test('isPassive: false when exclusive', () => {
  const s = makeSkill({ exclusive: true, stats: [{ label: '+% Physical Damage', values: [8] }] });
  assert.equal(isPassive(s), false);
});

test('isPassive: false when has Energy Cost', () => {
  const s = makeSkill({ stats: [{ label: 'Energy Cost', values: [10] }, { label: 'Physical Damage', values: [50] }] });
  assert.equal(isPassive(s), false);
});

test('isPassive: false when has Energy Reserved', () => {
  const s = makeSkill({ stats: [{ label: '+% Elemental Damage', values: [5] }, { label: 'Energy Reserved', values: [100] }] });
  assert.equal(isPassive(s), false);
});

test('isPassive: false when has Skill Recharge', () => {
  const s = makeSkill({ stats: [{ label: 'Skill Recharge', values: [7] }] });
  assert.equal(isPassive(s), false);
});

test('isPassive: false when has Duration', () => {
  const s = makeSkill({ stats: [{ label: 'Duration', values: [10] }, { label: '+% Total Damage', values: [25] }] });
  assert.equal(isPassive(s), false);
});

test('isPassive: false when has % Weapon Damage (WPS)', () => {
  const s = makeSkill({ stats: [{ label: '% Weapon Damage', values: [125] }, { label: 'Physical Damage', values: [16] }] });
  assert.equal(isPassive(s), false);
});

test('isPassive: false when has Meter Radius', () => {
  const s = makeSkill({ stats: [{ label: 'Meter Radius', values: [5] }, { label: '+ Offensive Ability', values: [10] }] });
  assert.equal(isPassive(s), false);
});

test('collectBonuses: sums skill stats at allocated rank', () => {
  const data: SkillsData = {
    gdVersion: 'test', pointsPerLevel: [], questRewardPoints: 0,
    masteries: [{
      id: 1, name: 'Soldier', barMaxRank: 50,
      skills: [makeSkill({
        id: 'passive1',
        stats: [
          { label: '+% Health', values: [3, 6, 8, 10] },
          { label: '+% Physique', values: [1, 3, 5, 6] },
        ],
      })],
    }],
  };
  const state: BuildState = {
    versionId: 0, masteries: [1, null], level: null,
    customPoints: null, questRewards: true, masteryBar: [0, 0],
    allocations: new Map([['passive1', 3]]),
  };
  const result = collectBonuses(state, data, { allocatedNodes: new Set(), crossroads: new Set(), devotionCap: 55 }, null);
  assert.deepEqual(result.get('+% Health'), 8);
  assert.deepEqual(result.get('+% Physique'), 5);
});

test('collectBonuses: sums devotion node stats', () => {
  const devData: DevotionsData = {
    gdVersion: 'test', affinities: ['Ascendant'],
    constellations: [{
      id: 'test_const', name: 'Test', tier: 1, requires: [], bonus: [],
      nodes: [
        { index: 1, parent: null, stats: [{ label: '+ Offensive Ability', value: '12' }], skill: null },
        { index: 2, parent: 1, stats: [{ label: '+ Offensive Ability', value: '18' }, { label: '+% Acid Damage', value: '15' }], skill: null },
      ],
    }],
    crossroads: [],
  };
  const devState: DevotionState = {
    allocatedNodes: new Set(['test_const:1', 'test_const:2']),
    crossroads: new Set(), devotionCap: 55,
  };
  const emptyBuild: BuildState = {
    versionId: 0, masteries: [null, null], level: null,
    customPoints: null, questRewards: true, masteryBar: [0, 0],
    allocations: new Map(),
  };
  const result = collectBonuses(emptyBuild, { gdVersion: 'test', pointsPerLevel: [], questRewardPoints: 0, masteries: [] }, devState, devData);
  assert.deepEqual(result.get('+ Offensive Ability'), 30);
  assert.deepEqual(result.get('+% Acid Damage'), 15);
});

test('collectBonuses: merges same label across skills and devotions', () => {
  const data: SkillsData = {
    gdVersion: 'test', pointsPerLevel: [], questRewardPoints: 0,
    masteries: [{
      id: 1, name: 'Test', barMaxRank: 50,
      skills: [makeSkill({ id: 'p1', stats: [{ label: '+% Physical Damage', values: [8, 16, 24] }] })],
    }],
  };
  const devData: DevotionsData = {
    gdVersion: 'test', affinities: [],
    constellations: [{
      id: 'c1', name: 'C', tier: 1, requires: [], bonus: [],
      nodes: [{ index: 1, parent: null, stats: [{ label: '+% Physical Damage', value: '15' }], skill: null }],
    }],
    crossroads: [],
  };
  const state: BuildState = {
    versionId: 0, masteries: [1, null], level: null,
    customPoints: null, questRewards: true, masteryBar: [0, 0],
    allocations: new Map([['p1', 2]]),
  };
  const devState: DevotionState = { allocatedNodes: new Set(['c1:1']), crossroads: new Set(), devotionCap: 55 };
  const result = collectBonuses(state, data, devState, devData);
  assert.deepEqual(result.get('+% Physical Damage'), 31);
});

test('collectBonuses: excludes non-passive skills', () => {
  const data: SkillsData = {
    gdVersion: 'test', pointsPerLevel: [], questRewardPoints: 0,
    masteries: [{
      id: 1, name: 'Test', barMaxRank: 50,
      skills: [
        makeSkill({ id: 'active1', stats: [{ label: 'Energy Cost', values: [10] }, { label: '+% Damage', values: [50] }] }),
        makeSkill({ id: 'passive1', stats: [{ label: '+% Health', values: [20] }] }),
      ],
    }],
  };
  const state: BuildState = {
    versionId: 0, masteries: [1, null], level: null,
    customPoints: null, questRewards: true, masteryBar: [0, 0],
    allocations: new Map([['active1', 1], ['passive1', 1]]),
  };
  const result = collectBonuses(state, data, { allocatedNodes: new Set(), crossroads: new Set(), devotionCap: 55 }, null);
  assert.equal(result.has('+% Damage'), false);
  assert.deepEqual(result.get('+% Health'), 20);
});

test('collectBonuses: excludes devotion nodes with skills', () => {
  const devData: DevotionsData = {
    gdVersion: 'test', affinities: [],
    constellations: [{
      id: 'c1', name: 'C', tier: 1, requires: [], bonus: [],
      nodes: [
        { index: 1, parent: null, stats: [{ label: '+ Physique', value: '15' }], skill: null },
        { index: 2, parent: 1, stats: [], skill: { name: 'Proc', description: '', maxLevel: 1, stats: [], petStats: [] } },
      ],
    }],
    crossroads: [],
  };
  const devState: DevotionState = { allocatedNodes: new Set(['c1:1', 'c1:2']), crossroads: new Set(), devotionCap: 55 };
  const emptyBuild: BuildState = {
    versionId: 0, masteries: [null, null], level: null,
    customPoints: null, questRewards: true, masteryBar: [0, 0],
    allocations: new Map(),
  };
  const result = collectBonuses(emptyBuild, { gdVersion: 'test', pointsPerLevel: [], questRewardPoints: 0, masteries: [] }, devState, devData);
  assert.deepEqual(result.get('+ Physique'), 15);
  assert.equal(result.size, 1);
});

test('collectBonuses: excludes mechanical labels', () => {
  const data: SkillsData = {
    gdVersion: 'test', pointsPerLevel: [], questRewardPoints: 0,
    masteries: [{
      id: 1, name: 'Test', barMaxRank: 50,
      skills: [makeSkill({
        id: 'p1',
        stats: [
          { label: '+% Physical Damage', values: [8] },
          { label: 'Projectiles', values: [1] },
          { label: 'Knockdown Chance', values: [10] },
          { label: 'Poison Damage Duration', values: [3] },
        ],
      })],
    }],
  };
  const state: BuildState = {
    versionId: 0, masteries: [1, null], level: null,
    customPoints: null, questRewards: true, masteryBar: [0, 0],
    allocations: new Map([['p1', 1]]),
  };
  const result = collectBonuses(state, data, { allocatedNodes: new Set(), crossroads: new Set(), devotionCap: 55 }, null);
  assert.deepEqual(result.get('+% Physical Damage'), 8);
  assert.equal(result.has('Projectiles'), false);
  assert.equal(result.has('Knockdown Chance'), false);
  assert.equal(result.has('Poison Damage Duration'), false);
});

test('categorizeBonuses: groups into correct categories', () => {
  const bonuses = new Map<string, number>([
    ['+% Health', 20],
    ['+ Physique', 15],
    ['+% Physical Damage', 64],
    ['+ Offensive Ability', 30],
    ['+ Armor', 50],
    ['+% Fire Resistance', 20],
    ['+ Energy', 100],
    ['Reduced Total Speed', 10],
  ]);
  const cats = categorizeBonuses(bonuses);
  const findCat = (name: string) => cats.find(c => c.name === name);

  const attr = findCat('Attributes');
  assert.ok(attr);
  assert.deepEqual(attr!.entries.map(e => e.label), ['+ Physique']);

  const offense = findCat('Offense');
  assert.ok(offense);
  assert.deepEqual(offense!.entries.map(e => e.label), ['+ Offensive Ability']);

  const damage = findCat('Damage');
  assert.ok(damage);
  assert.deepEqual(damage!.entries.map(e => e.label), ['+% Physical Damage']);

  const defense = findCat('Defense');
  assert.ok(defense);
  assert.deepEqual(defense!.entries.map(e => e.label), ['+ Armor']);

  const health = findCat('Health & Energy');
  assert.ok(health);
  assert.ok(health!.entries.some(e => e.label === '+% Health'));
  assert.ok(health!.entries.some(e => e.label === '+ Energy'));

  const resist = findCat('Resistances');
  assert.ok(resist);
  assert.deepEqual(resist!.entries.map(e => e.label), ['+% Fire Resistance']);

  const other = findCat('Other');
  assert.ok(other);
  assert.deepEqual(other!.entries.map(e => e.label), ['Reduced Total Speed']);
});

test('categorizeBonuses: omits empty categories', () => {
  const bonuses = new Map<string, number>([['+% Health', 10]]);
  const cats = categorizeBonuses(bonuses);
  assert.equal(cats.length, 1);
  assert.equal(cats[0].name, 'Health & Energy');
});

test('categorizeBonuses: sorts entries alphabetically within category', () => {
  const bonuses = new Map<string, number>([
    ['+% Pierce Damage', 20],
    ['+% Aether Damage', 15],
    ['+% Fire Damage', 30],
  ]);
  const cats = categorizeBonuses(bonuses);
  assert.equal(cats.length, 1);
  assert.deepEqual(cats[0].entries.map(e => e.label), ['+% Aether Damage', '+% Fire Damage', '+% Pierce Damage']);
});

test('categorizeBonuses: returns empty array for no bonuses', () => {
  const cats = categorizeBonuses(new Map());
  assert.deepEqual(cats, []);
});
