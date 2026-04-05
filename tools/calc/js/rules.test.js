import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeBudget, totalAllocated } from './rules.js';
// vanilla-like: index = level. level 1 = 0 pts, then 3/lvl to 50, 2/lvl 51-90, 1/lvl 91-100.
// Index 0 is unused (no level 0); index 1 holds the level-1 gain (0).
function vanillaPointsPerLevel() {
    const arr = [0, 0];
    for (let L = 2; L <= 50; L++)
        arr.push(3);
    for (let L = 51; L <= 90; L++)
        arr.push(2);
    for (let L = 91; L <= 100; L++)
        arr.push(1);
    return arr;
}
const data = {
    gdVersion: 'test',
    pointsPerLevel: vanillaPointsPerLevel(),
    questRewardPoints: 18,
    masteries: [],
};
const base = () => ({
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
    const s = {
        ...base(),
        masteryBar: [10, 5],
        allocations: new Map([['x.a', 3], ['x.b', 7]]),
    };
    assert.equal(totalAllocated(s), 10 + 5 + 3 + 7);
});
//# sourceMappingURL=rules.test.js.map