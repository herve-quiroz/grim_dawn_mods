const DEFAULT_LEVEL = 100;
export function computeBudget(state, data) {
    if (state.customPoints !== null)
        return state.customPoints;
    const level = state.level ?? DEFAULT_LEVEL;
    let sum = 0;
    for (let L = 2; L <= level && L < data.pointsPerLevel.length; L++) {
        sum += data.pointsPerLevel[L];
    }
    if (state.questRewards)
        sum += data.questRewardPoints;
    return sum;
}
export function totalAllocated(state) {
    let sum = state.masteryBar[0] + state.masteryBar[1];
    for (const rank of state.allocations.values())
        sum += rank;
    return sum;
}
export function findMastery(id, data) {
    const m = data.masteries.find(m => m.id === id);
    if (!m)
        throw new Error(`Unknown mastery id ${id}`);
    return m;
}
export function findSkill(id, data) {
    for (const m of data.masteries) {
        const s = m.skills.find(s => s.id === id);
        if (s)
            return s;
    }
    throw new Error(`Unknown skill id ${id}`);
}
/**
 * Return true when the user can allocate at least rank 1 in this skill:
 * mastery bar is high enough, and (for modifiers) the parent skill has the
 * required rank.
 */
export function isSkillUnlocked(skill, slot, state) {
    if (state.masteryBar[slot] < skill.prereqBar)
        return false;
    if (skill.parent !== null) {
        const parentRank = state.allocations.get(skill.parent) ?? 0;
        if (parentRank < skill.parentMinRank)
            return false;
    }
    return true;
}
//# sourceMappingURL=rules.js.map