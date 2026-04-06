import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSearchIndex, matchQuery } from './search.js';
const data = {
    gdVersion: 't', pointsPerLevel: [], questRewardPoints: 0,
    masteries: [
        { id: 1, name: 'A', barMaxRank: 10, skills: [
                { id: 'a.fire', name: 'Fire Strike', description: 'A burning attack that deals fire damage', icon: '', maxRank: 10, ui: { row: 0, col: 0 }, prereqBar: 1, parent: null, parentMinRank: 0, exclusive: false, stats: [{ label: 'Fire Damage', values: [10, 20] }] },
                { id: 'a.cold', name: 'Cold Bolt', description: 'Freezes the enemy with cold damage', icon: '', maxRank: 10, ui: { row: 0, col: 1 }, prereqBar: 1, parent: null, parentMinRank: 0, exclusive: false, stats: [] },
                { id: 'a.shout', name: 'War Cry', description: 'A defensive shout', icon: '', maxRank: 5, ui: { row: 1, col: 0 }, prereqBar: 3, parent: null, parentMinRank: 0, exclusive: false, stats: [{ label: 'Physical Resistance', values: [5, 10] }] },
            ] },
    ],
};
test('matchQuery: empty query matches all', () => {
    const idx = buildSearchIndex(data);
    assert.equal(matchQuery('', idx).size, 0, 'empty query = no filter');
});
test('matchQuery: single term matches name', () => {
    const idx = buildSearchIndex(data);
    const m = matchQuery('fire', idx);
    assert.equal(m.has('a.fire'), true);
    assert.equal(m.has('a.cold'), false);
});
test('matchQuery: single term matches description', () => {
    const idx = buildSearchIndex(data);
    const m = matchQuery('cold', idx);
    assert.equal(m.has('a.cold'), true);
    assert.equal(m.has('a.fire'), false);
});
test('matchQuery: case-insensitive', () => {
    const idx = buildSearchIndex(data);
    assert.equal(matchQuery('FIRE', idx).has('a.fire'), true);
    assert.equal(matchQuery('Fire', idx).has('a.fire'), true);
});
test('matchQuery: multi-word is AND', () => {
    const idx = buildSearchIndex(data);
    assert.equal(matchQuery('fire damage', idx).has('a.fire'), true);
    assert.equal(matchQuery('fire cold', idx).size, 0, 'no skill has both');
});
test('matchQuery: substring match, not whole-word', () => {
    const idx = buildSearchIndex(data);
    assert.equal(matchQuery('burn', idx).has('a.fire'), true, 'burning');
});
//# sourceMappingURL=search.test.js.map