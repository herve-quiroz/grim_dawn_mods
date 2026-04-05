import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeState, decodeState } from './state.js';
import { emptyBuildState } from './types.js';
import type { BuildState, SkillsData } from './types.js';

const fixture: SkillsData = {
  gdVersion: 'fixture',
  pointsPerLevel: [0, 3, 3],
  questRewardPoints: 2,
  masteries: [
    {
      id: 1, name: 'A', barMaxRank: 10,
      skills: [
        { id: 'a.one', name: 'One', description: '', icon: '', maxRank: 10, ui: {row:0,col:0}, prereqBar: 1, parent: null, parentMinRank: 0 },
        { id: 'a.two', name: 'Two', description: '', icon: '', maxRank: 5, ui: {row:0,col:1}, prereqBar: 3, parent: 'a.one', parentMinRank: 1 },
      ],
    },
    {
      id: 2, name: 'B', barMaxRank: 10,
      skills: [
        { id: 'b.one', name: 'One', description: '', icon: '', maxRank: 10, ui: {row:0,col:0}, prereqBar: 1, parent: null, parentMinRank: 0 },
      ],
    },
  ],
};

test('encode/decode: empty state roundtrips', () => {
  const s = emptyBuildState(0);
  const encoded = encodeState(s, fixture);
  const decoded = decodeState(encoded, fixture);
  assert.deepEqual(decoded, s);
});

test('encode/decode: state with allocations roundtrips', () => {
  const s: BuildState = {
    versionId: 0,
    masteries: [1, 2],
    level: 50,
    customPoints: null,
    questRewards: true,
    masteryBar: [6, 4],
    allocations: new Map([['a.one', 3], ['a.two', 2], ['b.one', 7]]),
  };
  const encoded = encodeState(s, fixture);
  const decoded = decodeState(encoded, fixture);
  assert.equal(decoded.versionId, 0);
  assert.deepEqual(decoded.masteries, [1, 2]);
  assert.equal(decoded.level, 50);
  assert.equal(decoded.customPoints, null);
  assert.equal(decoded.questRewards, true);
  assert.deepEqual(decoded.masteryBar, [6, 4]);
  assert.equal(decoded.allocations.get('a.one'), 3);
  assert.equal(decoded.allocations.get('a.two'), 2);
  assert.equal(decoded.allocations.get('b.one'), 7);
});

test('canonical form: swapping slots produces same URL', () => {
  const s1: BuildState = {
    versionId: 0,
    masteries: [1, 2],
    level: null, customPoints: null, questRewards: true,
    masteryBar: [5, 3],
    allocations: new Map([['a.one', 2], ['b.one', 4]]),
  };
  const s2: BuildState = {
    versionId: 0,
    masteries: [2, 1],         // swapped
    level: null, customPoints: null, questRewards: true,
    masteryBar: [3, 5],         // bars also swapped
    allocations: new Map([['a.one', 2], ['b.one', 4]]),
  };
  assert.equal(encodeState(s1, fixture), encodeState(s2, fixture));
});

test('canonical form: null mastery in slot A is normalized', () => {
  const s: BuildState = {
    versionId: 0,
    masteries: [null, 2],
    level: null, customPoints: null, questRewards: true,
    masteryBar: [0, 4],
    allocations: new Map([['b.one', 3]]),
  };
  const encoded = encodeState(s, fixture);
  const decoded = decodeState(encoded, fixture);
  // After canonicalization, single mastery lands in slot A.
  assert.deepEqual(decoded.masteries, [2, null]);
  assert.deepEqual(decoded.masteryBar, [4, 0]);
  assert.equal(decoded.allocations.get('b.one'), 3);
});

test('customPoints: 0 distinguishable from unset', () => {
  const s: BuildState = {
    versionId: 0,
    masteries: [null, null],
    level: null, customPoints: 0, questRewards: false,
    masteryBar: [0, 0],
    allocations: new Map(),
  };
  const decoded = decodeState(encodeState(s, fixture), fixture);
  assert.equal(decoded.customPoints, 0);
  assert.equal(decoded.questRewards, false);
});

test('customPoints: 65534 is valid, 0xFFFF means unset', () => {
  const s: BuildState = {
    versionId: 0, masteries: [null, null],
    level: null, customPoints: 65534, questRewards: true,
    masteryBar: [0, 0], allocations: new Map(),
  };
  const decoded = decodeState(encodeState(s, fixture), fixture);
  assert.equal(decoded.customPoints, 65534);
});

test('decode: truncated string throws', () => {
  assert.throws(() => decodeState('AA', fixture));
});
