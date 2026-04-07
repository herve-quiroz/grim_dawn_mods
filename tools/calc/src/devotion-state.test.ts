import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { encodeDevotionState, decodeDevotionState } from './state.js';
import type { DevotionsData } from './devotion-types.js';
import { emptyDevotionState, nodeKey } from './devotion-types.js';

const testDevotionData: DevotionsData = {
  gdVersion: '1.0',
  affinities: ['Ascendant', 'Chaos', 'Eldritch', 'Order', 'Primordial'],
  constellations: [
    {
      id: 'bat', name: 'Bat', tier: 1, requires: [], bonus: [],
      nodes: [
        { index: 1, parent: null, stats: [], skill: null },
        { index: 2, parent: 1, stats: [], skill: null },
        { index: 3, parent: 2, stats: [], skill: null },
      ],
    },
    {
      id: 'hawk', name: 'Hawk', tier: 1, requires: [], bonus: [],
      nodes: [
        { index: 1, parent: null, stats: [], skill: null },
        { index: 2, parent: 1, stats: [], skill: null },
      ],
    },
  ],
  crossroads: [
    { id: 'xr_eldritch', affinity: 2 },
    { id: 'xr_chaos', affinity: 1 },
  ],
};

describe('devotion state encoding', () => {
  test('empty state roundtrips', () => {
    const state = emptyDevotionState();
    const encoded = encodeDevotionState(state, testDevotionData);
    const decoded = decodeDevotionState(encoded, testDevotionData);
    assert.strictEqual(decoded.allocatedNodes.size, 0);
    assert.strictEqual(decoded.crossroads.size, 0);
    assert.strictEqual(decoded.devotionCap, 55);
  });

  test('allocated nodes roundtrip', () => {
    const state = emptyDevotionState();
    state.crossroads.add('xr_eldritch');
    state.allocatedNodes.add(nodeKey('bat', 1));
    state.allocatedNodes.add(nodeKey('bat', 3));
    const encoded = encodeDevotionState(state, testDevotionData);
    const decoded = decodeDevotionState(encoded, testDevotionData);
    assert.strictEqual(decoded.crossroads.has('xr_eldritch'), true);
    assert.strictEqual(decoded.crossroads.has('xr_chaos'), false);
    assert.strictEqual(decoded.allocatedNodes.has(nodeKey('bat', 1)), true);
    assert.strictEqual(decoded.allocatedNodes.has(nodeKey('bat', 3)), true);
    assert.strictEqual(decoded.allocatedNodes.has(nodeKey('bat', 2)), false);
  });

  test('custom devotion cap roundtrips', () => {
    const state = emptyDevotionState();
    state.devotionCap = 1000;
    const encoded = encodeDevotionState(state, testDevotionData);
    const decoded = decodeDevotionState(encoded, testDevotionData);
    assert.strictEqual(decoded.devotionCap, 1000);
  });

  test('empty encoded string returns empty state', () => {
    const decoded = decodeDevotionState('', testDevotionData);
    assert.strictEqual(decoded.allocatedNodes.size, 0);
    assert.strictEqual(decoded.crossroads.size, 0);
    assert.strictEqual(decoded.devotionCap, 55);
  });
});
