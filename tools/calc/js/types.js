export function emptyBuildState(versionId) {
    return {
        versionId,
        masteries: [null, null],
        level: null,
        customPoints: null,
        questRewards: true,
        masteryBar: [0, 0],
        allocations: new Map(),
    };
}
//# sourceMappingURL=types.js.map