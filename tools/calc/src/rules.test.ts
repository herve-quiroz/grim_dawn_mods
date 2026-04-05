import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeBudget, totalAllocated } from './rules.js';
import type { BuildState, SkillsData } from './types.js';

// vanilla-like: index = level. level 1 = 0 pts, then 3/lvl to 50, 2/lvl 51-90, 1/lvl 91-100.
// Index 0 is unused (no level 0); index 1 holds the level-1 gain (0).
function vanillaPointsPerLevel(): number[] {
  const arr = [0, 0];
  for (let L = 2; L <= 50; L++) arr.push(3);
  for (let L = 51; L <= 90; L++) arr.push(2);
  for (let L = 91; L <= 100; L++) arr.push(1);
  return arr;
}

const data: SkillsData = {
  gdVersion: 'test',
  pointsPerLevel: vanillaPointsPerLevel(),
  questRewardPoints: 18,
  masteries: [],
};

const base = (): BuildState => ({
  versionId: 0,
  masteries: [null, null],
  level: null,
  customPoints: null,
  questRewards: true,
  masteryBar: [0, 0],
  allocations: new Map(),
});

test('computeBudget: level 1 with quest rewards = 18', () => {
  const s = { ...base(), level: 1 };
  assert.equal(computeBudget(s, data), 18);
});

test('computeBudget: level 50 with quest rewards = 3*49 + 18 = 165', () => {
  const s = { ...base(), level: 50 };
  assert.equal(computeBudget(s, data), 3 * 49 + 18);
});

test('computeBudget: level 90 with quest rewards = 3*49 + 2*40 + 18 = 245', () => {
  const s = { ...base(), level: 90 };
  assert.equal(computeBudget(s, data), 3 * 49 + 2 * 40 + 18);
});

test('computeBudget: level 100 with quest rewards = 3*49 + 2*40 + 1*10 + 18 = 255', () => {
  const s = { ...base(), level: 100 };
  assert.equal(computeBudget(s, data), 3 * 49 + 2 * 40 + 1 * 10 + 18);
});

test('computeBudget: no level + no custom → default level 100', () => {
  const s = base();
  assert.equal(computeBudget(s, data), 255);
});

test('computeBudget: customPoints overrides everything', () => {
  const s = { ...base(), level: 50, customPoints: 42 };
  assert.equal(computeBudget(s, data), 42);
});

test('computeBudget: questRewards off subtracts 18', () => {
  const s = { ...base(), level: 50, questRewards: false };
  assert.equal(computeBudget(s, data), 3 * 49);
});

test('totalAllocated: sums allocations + mastery bars', () => {
  const s: BuildState = {
    ...base(),
    masteryBar: [10, 5],
    allocations: new Map([['x.a', 3], ['x.b', 7]]),
  };
  assert.equal(totalAllocated(s), 10 + 5 + 3 + 7);
});

import { isSkillUnlocked, findMastery, findSkill } from './rules.js';

const testData: SkillsData = {
  gdVersion: 'test',
  pointsPerLevel: vanillaPointsPerLevel(),
  questRewardPoints: 18,
  masteries: [
    {
      id: 1, name: 'A', barMaxRank: 50,
      skills: [
        { id: 'a.swing', name: '', description: '', icon: '', maxRank: 16, ui: {row:0,col:0}, prereqBar: 1, parent: null, parentMinRank: 0 },
        { id: 'a.big', name: '', description: '', icon: '', maxRank: 5, ui: {row:0,col:1}, prereqBar: 3, parent: 'a.swing', parentMinRank: 2 },
        { id: 'a.huge', name: '', description: '', icon: '', maxRank: 5, ui: {row:0,col:2}, prereqBar: 5, parent: 'a.big', parentMinRank: 1 },
      ],
    },
  ],
};

test('isSkillUnlocked: base skill gated by mastery bar', () => {
  const s: BuildState = { ...base(), masteries: [1, null], masteryBar: [0, 0] };
  assert.equal(isSkillUnlocked(findSkill('a.swing', testData), 0, s), false);
  const s2 = { ...s, masteryBar: [1, 0] as [number, number] };
  assert.equal(isSkillUnlocked(findSkill('a.swing', testData), 0, s2), true);
});

test('isSkillUnlocked: modifier requires parent rank', () => {
  const skill = findSkill('a.big', testData);
  const s: BuildState = { ...base(), masteries: [1, null], masteryBar: [3, 0], allocations: new Map([['a.swing', 1]]) };
  assert.equal(isSkillUnlocked(skill, 0, s), false, 'parent only rank 1, needs 2');
  const s2 = { ...s, allocations: new Map([['a.swing', 2]]) };
  assert.equal(isSkillUnlocked(skill, 0, s2), true);
});

test('isSkillUnlocked: modifier also checks mastery bar', () => {
  const skill = findSkill('a.big', testData);
  const s: BuildState = { ...base(), masteries: [1, null], masteryBar: [2, 0], allocations: new Map([['a.swing', 5]]) };
  assert.equal(isSkillUnlocked(skill, 0, s), false, 'bar 2 < required 3');
});

test('findMastery/findSkill: helpers', () => {
  assert.equal(findMastery(1, testData).name, 'A');
  assert.throws(() => findMastery(99, testData));
  assert.equal(findSkill('a.swing', testData).id, 'a.swing');
  assert.throws(() => findSkill('nope', testData));
});
