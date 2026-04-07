import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  computeAffinities,
  totalDevotionSpent,
  isConstellationUnlockable,
  isNodeAllocatable,
  applyNodeDelta,
  toggleConstellationAll,
} from './devotion-rules.js';
import type { DevotionsData } from './devotion-types.js';
import { emptyDevotionState, nodeKey } from './devotion-types.js';

// Minimal test data
const testData: DevotionsData = {
  gdVersion: '1.0',
  affinities: ['Ascendant', 'Chaos', 'Eldritch', 'Order', 'Primordial'],
  constellations: [
    {
      id: 'bat',
      name: 'Bat',
      tier: 1,
      requires: [{ affinity: 2, amount: 1 }],           // 1 Eldritch
      bonus: [{ affinity: 1, amount: 2 }, { affinity: 2, amount: 3 }], // +2 Chaos, +3 Eldritch
      nodes: [
        { index: 1, parent: null, stats: [], skill: null },
        { index: 2, parent: 1, stats: [], skill: null },
        { index: 3, parent: 2, stats: [], skill: null },
      ],
    },
    {
      id: 'hawk',
      name: 'Hawk',
      tier: 1,
      requires: [{ affinity: 2, amount: 1 }],           // 1 Eldritch
      bonus: [{ affinity: 2, amount: 3 }],               // +3 Eldritch
      nodes: [
        { index: 1, parent: null, stats: [], skill: null },
        { index: 2, parent: 1, stats: [], skill: null },
        { index: 3, parent: 2, stats: [], skill: null },
      ],
    },
    {
      id: 'branch',
      name: 'Branch',
      tier: 1,
      requires: [],
      bonus: [{ affinity: 0, amount: 1 }],
      nodes: [
        { index: 1, parent: null, stats: [], skill: null },
        { index: 2, parent: 1, stats: [], skill: null },
        { index: 3, parent: 1, stats: [], skill: null },  // branches from 1
      ],
    },
  ],
  crossroads: [
    { id: 'xr_eldritch', affinity: 2 },
    { id: 'xr_chaos', affinity: 1 },
  ],
};

describe('computeAffinities', () => {
  test('empty state returns all zeros', () => {
    const state = emptyDevotionState();
    const aff = computeAffinities(state, testData);
    assert.deepStrictEqual(aff, [0, 0, 0, 0, 0]);
  });

  test('crossroads add affinity', () => {
    const state = emptyDevotionState();
    state.crossroads.add('xr_eldritch');
    const aff = computeAffinities(state, testData);
    assert.deepStrictEqual(aff, [0, 0, 1, 0, 0]);
  });

  test('completed constellation adds bonus', () => {
    const state = emptyDevotionState();
    state.crossroads.add('xr_eldritch');
    // Complete bat (all 3 nodes)
    state.allocatedNodes.add(nodeKey('bat', 1));
    state.allocatedNodes.add(nodeKey('bat', 2));
    state.allocatedNodes.add(nodeKey('bat', 3));
    const aff = computeAffinities(state, testData);
    // 1 Eldritch (crossroads) + 2 Chaos + 3 Eldritch (bat bonus)
    assert.deepStrictEqual(aff, [0, 2, 4, 0, 0]);
  });

  test('partially completed constellation gives no bonus', () => {
    const state = emptyDevotionState();
    state.allocatedNodes.add(nodeKey('bat', 1));
    state.allocatedNodes.add(nodeKey('bat', 2));
    // Only 2 of 3 nodes allocated
    const aff = computeAffinities(state, testData);
    assert.deepStrictEqual(aff, [0, 0, 0, 0, 0]);
  });
});

describe('totalDevotionSpent', () => {
  test('empty state is 0', () => {
    assert.strictEqual(totalDevotionSpent(emptyDevotionState()), 0);
  });

  test('counts nodes and crossroads', () => {
    const state = emptyDevotionState();
    state.crossroads.add('xr_eldritch');
    state.allocatedNodes.add(nodeKey('bat', 1));
    state.allocatedNodes.add(nodeKey('bat', 2));
    assert.strictEqual(totalDevotionSpent(state), 3);
  });
});

describe('isConstellationUnlockable', () => {
  test('no requirements always unlockable', () => {
    const state = emptyDevotionState();
    const branch = testData.constellations.find(c => c.id === 'branch')!;
    assert.strictEqual(isConstellationUnlockable(branch, state, testData), true);
  });

  test('unmet requirement blocks unlock', () => {
    const state = emptyDevotionState();
    const bat = testData.constellations.find(c => c.id === 'bat')!;
    assert.strictEqual(isConstellationUnlockable(bat, state, testData), false);
  });

  test('met requirement allows unlock', () => {
    const state = emptyDevotionState();
    state.crossroads.add('xr_eldritch');  // +1 Eldritch
    const bat = testData.constellations.find(c => c.id === 'bat')!;
    assert.strictEqual(isConstellationUnlockable(bat, state, testData), true);
  });
});

describe('isNodeAllocatable', () => {
  test('root node is allocatable if constellation unlockable', () => {
    const state = emptyDevotionState();
    state.crossroads.add('xr_eldritch');
    const bat = testData.constellations.find(c => c.id === 'bat')!;
    assert.strictEqual(isNodeAllocatable(bat, 1, state, testData), true);
  });

  test('child node requires parent allocated', () => {
    const state = emptyDevotionState();
    state.crossroads.add('xr_eldritch');
    const bat = testData.constellations.find(c => c.id === 'bat')!;
    assert.strictEqual(isNodeAllocatable(bat, 2, state, testData), false);
    state.allocatedNodes.add(nodeKey('bat', 1));
    assert.strictEqual(isNodeAllocatable(bat, 2, state, testData), true);
  });
});

describe('applyNodeDelta', () => {
  test('allocate root node', () => {
    const state = emptyDevotionState();
    state.crossroads.add('xr_eldritch');
    const result = applyNodeDelta(state, 'bat', 1, 1, testData);
    assert.strictEqual(result.state.allocatedNodes.has(nodeKey('bat', 1)), true);
    assert.deepStrictEqual(result.refunds, []);
  });

  test('deallocate leaf node', () => {
    const state = emptyDevotionState();
    state.crossroads.add('xr_eldritch');
    state.allocatedNodes.add(nodeKey('bat', 1));
    state.allocatedNodes.add(nodeKey('bat', 2));
    const result = applyNodeDelta(state, 'bat', 2, -1, testData);
    assert.strictEqual(result.state.allocatedNodes.has(nodeKey('bat', 2)), false);
    assert.strictEqual(result.state.allocatedNodes.has(nodeKey('bat', 1)), true);
  });

  test('deallocate parent cascades children', () => {
    const state = emptyDevotionState();
    state.crossroads.add('xr_eldritch');
    state.allocatedNodes.add(nodeKey('bat', 1));
    state.allocatedNodes.add(nodeKey('bat', 2));
    state.allocatedNodes.add(nodeKey('bat', 3));
    const result = applyNodeDelta(state, 'bat', 1, -1, testData);
    assert.strictEqual(result.state.allocatedNodes.size, 0);
    assert.strictEqual(result.refunds.length, 2);  // nodes 2 and 3 refunded
  });

  test('reject allocate when constellation not unlockable', () => {
    const state = emptyDevotionState();
    // No eldritch affinity, bat requires 1
    const result = applyNodeDelta(state, 'bat', 1, 1, testData);
    assert.strictEqual(result.state.allocatedNodes.size, 0);
  });
});

describe('toggleConstellationAll', () => {
  test('fill empty constellation', () => {
    const state = emptyDevotionState();
    state.crossroads.add('xr_eldritch');
    const result = toggleConstellationAll(state, 'bat', testData);
    assert.strictEqual(result.allocatedNodes.size, 3);
    assert.strictEqual(result.allocatedNodes.has(nodeKey('bat', 1)), true);
    assert.strictEqual(result.allocatedNodes.has(nodeKey('bat', 2)), true);
    assert.strictEqual(result.allocatedNodes.has(nodeKey('bat', 3)), true);
  });

  test('clear completed constellation', () => {
    const state = emptyDevotionState();
    state.allocatedNodes.add(nodeKey('bat', 1));
    state.allocatedNodes.add(nodeKey('bat', 2));
    state.allocatedNodes.add(nodeKey('bat', 3));
    const result = toggleConstellationAll(state, 'bat', testData);
    assert.strictEqual(result.allocatedNodes.has(nodeKey('bat', 1)), false);
    assert.strictEqual(result.allocatedNodes.has(nodeKey('bat', 2)), false);
    assert.strictEqual(result.allocatedNodes.has(nodeKey('bat', 3)), false);
  });
});
