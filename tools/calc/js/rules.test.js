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
import { isSkillUnlocked, findMastery, findSkill } from './rules.js';
const testData = {
    gdVersion: 'test',
    pointsPerLevel: vanillaPointsPerLevel(),
    questRewardPoints: 18,
    masteries: [
        {
            id: 1, name: 'A', barMaxRank: 50,
            skills: [
                { id: 'a.swing', name: '', description: '', icon: '', maxRank: 16, ui: { row: 0, col: 0 }, prereqBar: 1, parent: null, parentMinRank: 0, exclusive: false, stats: [] },
                { id: 'a.big', name: '', description: '', icon: '', maxRank: 5, ui: { row: 0, col: 1 }, prereqBar: 3, parent: 'a.swing', parentMinRank: 2, exclusive: false, stats: [] },
                { id: 'a.huge', name: '', description: '', icon: '', maxRank: 5, ui: { row: 0, col: 2 }, prereqBar: 5, parent: 'a.big', parentMinRank: 1, exclusive: false, stats: [] },
            ],
        },
    ],
};
test('isSkillUnlocked: base skill gated by mastery bar', () => {
    const s = { ...base(), masteries: [1, null], masteryBar: [0, 0] };
    assert.equal(isSkillUnlocked(findSkill('a.swing', testData), 0, s), false);
    const s2 = { ...s, masteryBar: [1, 0] };
    assert.equal(isSkillUnlocked(findSkill('a.swing', testData), 0, s2), true);
});
test('isSkillUnlocked: modifier requires parent rank', () => {
    const skill = findSkill('a.big', testData);
    const s = { ...base(), masteries: [1, null], masteryBar: [3, 0], allocations: new Map([['a.swing', 1]]) };
    assert.equal(isSkillUnlocked(skill, 0, s), false, 'parent only rank 1, needs 2');
    const s2 = { ...s, allocations: new Map([['a.swing', 2]]) };
    assert.equal(isSkillUnlocked(skill, 0, s2), true);
});
test('isSkillUnlocked: modifier also checks mastery bar', () => {
    const skill = findSkill('a.big', testData);
    const s = { ...base(), masteries: [1, null], masteryBar: [2, 0], allocations: new Map([['a.swing', 5]]) };
    assert.equal(isSkillUnlocked(skill, 0, s), false, 'bar 2 < required 3');
});
test('findMastery/findSkill: helpers', () => {
    assert.equal(findMastery(1, testData).name, 'A');
    assert.throws(() => findMastery(99, testData));
    assert.equal(findSkill('a.swing', testData).id, 'a.swing');
    assert.throws(() => findSkill('nope', testData));
});
import { applyDelta } from './rules.js';
test('applyDelta: simple + increments rank', () => {
    const s = { ...base(), masteries: [1, null], masteryBar: [1, 0] };
    const r = applyDelta(s, { kind: 'skill', skillId: 'a.swing', slot: 0 }, +1, testData);
    assert.equal(r.state.allocations.get('a.swing'), 1);
    assert.deepEqual(r.refunds, []);
});
test('applyDelta: - decrements, no cascade if no dependents', () => {
    const s = {
        ...base(), masteries: [1, null], masteryBar: [1, 0],
        allocations: new Map([['a.swing', 3]]),
    };
    const r = applyDelta(s, { kind: 'skill', skillId: 'a.swing', slot: 0 }, -1, testData);
    assert.equal(r.state.allocations.get('a.swing'), 2);
    assert.deepEqual(r.refunds, []);
});
test('applyDelta: - cascades refund when dependent requirement broken', () => {
    const s = {
        ...base(), masteries: [1, null], masteryBar: [5, 0],
        allocations: new Map([['a.swing', 2], ['a.big', 3]]),
    };
    const r = applyDelta(s, { kind: 'skill', skillId: 'a.swing', slot: 0 }, -1, testData);
    // a.swing drops to 1, a.big needs parent rank 2, so a.big refunds entirely.
    assert.equal(r.state.allocations.get('a.swing'), 1);
    assert.equal(r.state.allocations.has('a.big'), false);
    assert.deepEqual(r.refunds, [{ skillId: 'a.big', refunded: 3 }]);
});
test('applyDelta: cascade propagates through chain', () => {
    const s = {
        ...base(), masteries: [1, null], masteryBar: [5, 0],
        allocations: new Map([['a.swing', 2], ['a.big', 1], ['a.huge', 2]]),
    };
    const r = applyDelta(s, { kind: 'skill', skillId: 'a.swing', slot: 0 }, -1, testData);
    // a.swing:2→1, breaks a.big (needs 2). a.big refunds. That breaks a.huge
    // (needs a.big rank 1). a.huge refunds.
    assert.equal(r.state.allocations.has('a.big'), false);
    assert.equal(r.state.allocations.has('a.huge'), false);
    assert.equal(r.refunds.length, 2);
});
test('applyDelta: lowering mastery bar cascades skills', () => {
    const s = {
        ...base(), masteries: [1, null], masteryBar: [5, 0],
        allocations: new Map([['a.swing', 2], ['a.big', 3]]),
    };
    const r = applyDelta(s, { kind: 'bar', slot: 0 }, -3, testData);
    // bar 5→2. a.big requires bar 3 — refunds.
    assert.equal(r.state.masteryBar[0], 2);
    assert.equal(r.state.allocations.has('a.big'), false);
    assert.equal(r.state.allocations.get('a.swing'), 2);
    assert.equal(r.refunds.length, 1);
    assert.equal(r.refunds[0].skillId, 'a.big');
});
test('applyDelta: + fails when already at max', () => {
    const s = {
        ...base(), masteries: [1, null], masteryBar: [1, 0],
        allocations: new Map([['a.swing', 16]]),
    };
    const r = applyDelta(s, { kind: 'skill', skillId: 'a.swing', slot: 0 }, +1, testData);
    assert.equal(r.state, s, 'returns unchanged state');
});
test('applyDelta: - fails when already at 0', () => {
    const s = { ...base(), masteries: [1, null], masteryBar: [1, 0] };
    const r = applyDelta(s, { kind: 'skill', skillId: 'a.swing', slot: 0 }, -1, testData);
    assert.equal(r.state, s, 'returns unchanged state');
});
// ---- Exclusive skill tests ----
const exclusiveData = {
    gdVersion: 'test',
    pointsPerLevel: vanillaPointsPerLevel(),
    questRewardPoints: 18,
    masteries: [
        {
            id: 1, name: 'A', barMaxRank: 50,
            skills: [
                { id: 'a.normal', name: '', description: '', icon: '', maxRank: 10, ui: { row: 0, col: 0 }, prereqBar: 1, parent: null, parentMinRank: 0, exclusive: false, stats: [] },
                { id: 'a.excl1', name: '', description: '', icon: '', maxRank: 10, ui: { row: 0, col: 1 }, prereqBar: 50, parent: null, parentMinRank: 0, exclusive: true, stats: [] },
            ],
        },
        {
            id: 2, name: 'B', barMaxRank: 50,
            skills: [
                { id: 'b.normal', name: '', description: '', icon: '', maxRank: 10, ui: { row: 0, col: 0 }, prereqBar: 1, parent: null, parentMinRank: 0, exclusive: false, stats: [] },
                { id: 'b.excl1', name: '', description: '', icon: '', maxRank: 10, ui: { row: 0, col: 1 }, prereqBar: 50, parent: null, parentMinRank: 0, exclusive: true, stats: [] },
            ],
        },
    ],
};
test('isSkillUnlocked: exclusive skill allowed when no other exclusive active', () => {
    const s = { ...base(), masteries: [1, 2], masteryBar: [50, 50] };
    const skill = findSkill('a.excl1', exclusiveData);
    assert.equal(isSkillUnlocked(skill, 0, s, exclusiveData), true);
});
test('isSkillUnlocked: exclusive skill blocked when another exclusive is active', () => {
    const s = {
        ...base(), masteries: [1, 2], masteryBar: [50, 50],
        allocations: new Map([['a.excl1', 3]]),
    };
    const skill = findSkill('b.excl1', exclusiveData);
    assert.equal(isSkillUnlocked(skill, 1, s, exclusiveData), false);
});
test('isSkillUnlocked: exclusive skill not blocked by non-exclusive skills', () => {
    const s = {
        ...base(), masteries: [1, 2], masteryBar: [50, 50],
        allocations: new Map([['a.normal', 5], ['b.normal', 5]]),
    };
    const skill = findSkill('a.excl1', exclusiveData);
    assert.equal(isSkillUnlocked(skill, 0, s, exclusiveData), true);
});
test('isSkillUnlocked: non-exclusive skill not blocked by exclusive constraint', () => {
    const s = {
        ...base(), masteries: [1, 2], masteryBar: [50, 50],
        allocations: new Map([['a.excl1', 5]]),
    };
    const skill = findSkill('b.normal', exclusiveData);
    assert.equal(isSkillUnlocked(skill, 1, s, exclusiveData), true);
});
test('applyDelta: exclusive skill +1 blocked when another exclusive active', () => {
    const s = {
        ...base(), masteries: [1, 2], masteryBar: [50, 50],
        allocations: new Map([['a.excl1', 3]]),
    };
    const r = applyDelta(s, { kind: 'skill', skillId: 'b.excl1', slot: 1 }, +1, exclusiveData);
    assert.equal(r.state, s, 'returns unchanged state');
});
test('applyDelta: exclusive skill +1 allowed when no other exclusive active', () => {
    const s = { ...base(), masteries: [1, 2], masteryBar: [50, 50] };
    const r = applyDelta(s, { kind: 'skill', skillId: 'a.excl1', slot: 0 }, +1, exclusiveData);
    assert.equal(r.state.allocations.get('a.excl1'), 1);
});
//# sourceMappingURL=rules.test.js.map