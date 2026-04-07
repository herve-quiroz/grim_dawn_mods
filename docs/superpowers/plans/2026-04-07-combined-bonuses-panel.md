# Combined bonuses panel implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a collapsible panel between the controls bar and mastery panels that aggregates all passive skill bonuses and devotion node stats into a grouped summary.

**Architecture:** New `bonuses.ts` handles classification and aggregation logic (pure functions, fully testable). New `bonuses-render.ts` renders the collapsible panel DOM. Both are integrated into `main.ts`'s render loop. The panel reads from `BuildState.allocations` and `DevotionState.allocatedNodes` on every render.

**Tech Stack:** TypeScript, vanilla DOM, Bootstrap 5 dark theme, `node:test` for testing.

---

## File structure

| File | Responsibility |
|------|----------------|
| Create: `src/bonuses.ts` | `isPassive()`, `collectBonuses()`, `categorizeBonuses()` pure functions |
| Create: `src/bonuses.test.ts` | Tests for all aggregation logic |
| Create: `src/bonuses-render.ts` | `renderBonusesPanel()` DOM rendering |
| Modify: `index.html` | Add `<div id="bonuses-panel">` |
| Modify: `src/main.ts` | Import and call `renderBonusesPanel()` in render loop, add ref |
| Modify: `css/style.css` | Bonuses panel styles |

---

### Task 1: `isPassive()` and `collectBonuses()` with tests

**Files:**
- Create: `tools/calc/src/bonuses.ts`
- Create: `tools/calc/src/bonuses.test.ts`

- [ ] **Step 1: Write the failing test for `isPassive()`**

```typescript
// tools/calc/src/bonuses.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPassive } from './bonuses.js';
import type { Skill } from './types.js';

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
```

- [ ] **Step 2: Write the minimal `isPassive()` implementation**

```typescript
// tools/calc/src/bonuses.ts
import type { Skill, SkillsData, BuildState } from './types.js';
import type { DevotionsData, DevotionState } from './devotion-types.js';

const EXCLUDES_SKILL = new Set([
  'Energy Cost', 'Energy Reserved', 'Skill Recharge',
  'Duration', '% Weapon Damage', 'Meter Radius',
]);

export function isPassive(skill: Skill): boolean {
  if (skill.parent !== null) return false;
  if (skill.exclusive) return false;
  return !skill.stats.some(s => EXCLUDES_SKILL.has(s.label));
}
```

- [ ] **Step 3: Run tests to verify `isPassive()` passes**

Run: `cd tools/calc && npm test 2>&1 | grep -E '(PASS|FAIL|isPassive)'`
Expected: All `isPassive` tests pass.

- [ ] **Step 4: Write the failing test for `collectBonuses()`**

Append to `tools/calc/src/bonuses.test.ts`:

```typescript
import { collectBonuses } from './bonuses.js';
import type { SkillsData, BuildState } from './types.js';
import type { DevotionsData, DevotionState } from './devotion-types.js';

test('collectBonuses: sums skill stats at allocated rank', () => {
  const data: SkillsData = {
    gdVersion: 'test',
    pointsPerLevel: [],
    questRewardPoints: 0,
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
    gdVersion: 'test',
    affinities: ['Ascendant'],
    constellations: [{
      id: 'test_const', name: 'Test', tier: 1,
      requires: [], bonus: [],
      nodes: [
        { index: 1, parent: null, stats: [{ label: '+ Offensive Ability', value: '12' }], skill: null },
        { index: 2, parent: 1, stats: [{ label: '+ Offensive Ability', value: '18' }, { label: '+% Acid Damage', value: '15' }], skill: null },
      ],
    }],
    crossroads: [],
  };
  const devState: DevotionState = {
    allocatedNodes: new Set(['test_const:1', 'test_const:2']),
    crossroads: new Set(),
    devotionCap: 55,
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
  assert.deepEqual(result.get('+% Physical Damage'), 31); // 16 + 15
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
```

- [ ] **Step 5: Implement `collectBonuses()`**

Add to `tools/calc/src/bonuses.ts`:

```typescript
const EXCLUDED_LABELS = new Set(['Projectiles', 'Target Maximum', 'Knockdown Chance', 'Knockdown Duration']);

function isExcludedLabel(label: string): boolean {
  if (EXCLUDED_LABELS.has(label)) return true;
  if (label.endsWith('Duration')) return true;
  return false;
}

export function collectBonuses(
  state: BuildState,
  data: SkillsData,
  devState: DevotionState,
  devData: DevotionsData | null,
): Map<string, number> {
  const totals = new Map<string, number>();

  const add = (label: string, value: number) => {
    if (isExcludedLabel(label)) return;
    totals.set(label, (totals.get(label) ?? 0) + value);
  };

  // Mastery passives
  for (const mastery of data.masteries) {
    for (const skill of mastery.skills) {
      const rank = state.allocations.get(skill.id);
      if (!rank || !isPassive(skill)) continue;
      for (const stat of skill.stats) {
        const idx = Math.min(rank, stat.values.length) - 1;
        add(stat.label, stat.values[idx]);
      }
    }
  }

  // Devotion stat nodes
  if (devData) {
    for (const constellation of devData.constellations) {
      for (const node of constellation.nodes) {
        const key = `${constellation.id}:${node.index}`;
        if (!devState.allocatedNodes.has(key)) continue;
        if (node.skill !== null) continue;
        for (const stat of node.stats) {
          add(stat.label, parseFloat(stat.value));
        }
      }
    }
  }

  return totals;
}
```

- [ ] **Step 6: Run tests to verify all pass**

Run: `cd tools/calc && npm test`
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add tools/calc/src/bonuses.ts tools/calc/src/bonuses.test.ts
git commit -m "feat(calc): add isPassive() and collectBonuses() aggregation logic"
```

---

### Task 2: `categorizeBonuses()` with tests

**Files:**
- Modify: `tools/calc/src/bonuses.ts`
- Modify: `tools/calc/src/bonuses.test.ts`

- [ ] **Step 1: Write the failing test for `categorizeBonuses()`**

Append to `tools/calc/src/bonuses.test.ts`:

```typescript
import { categorizeBonuses } from './bonuses.js';
import type { BonusCategory } from './bonuses.js';

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
```

- [ ] **Step 2: Implement `categorizeBonuses()`**

Add to `tools/calc/src/bonuses.ts`:

```typescript
export interface BonusEntry {
  label: string;
  value: number;
}

export interface BonusCategory {
  name: string;
  entries: BonusEntry[];
}

const ATTRIBUTE_KEYWORDS = ['Physique', 'Cunning', 'Spirit', 'Constitution'];
const OFFENSE_KEYWORDS = ['Offensive Ability', 'Attack Speed', 'Casting Speed', 'Crit Damage', 'Total Damage', 'Movement Speed'];
const DAMAGE_KEYWORDS = [
  'Physical Damage', 'Fire Damage', 'Cold Damage', 'Lightning Damage',
  'Aether Damage', 'Chaos Damage', 'Vitality Damage', 'Bleeding Damage',
  'Pierce Damage', 'Poison Damage', 'Acid Damage', 'Burn Damage',
  'Frostburn Damage', 'Electrocute Damage', 'Internal Trauma',
  'Life Damage', 'Life Decay', 'Retaliation',
  'Elemental Damage',
];
const DEFENSE_KEYWORDS = ['Defensive Ability', 'Armor', 'Block Chance', 'Block Recovery', 'Armor Requirement'];
const HEALTH_KEYWORDS = ['Health', 'Energy'];

type CategoryDef = { name: string; test: (label: string) => boolean };

const CATEGORIES: CategoryDef[] = [
  { name: 'Attributes', test: l => ATTRIBUTE_KEYWORDS.some(k => l.includes(k)) },
  { name: 'Offense', test: l => OFFENSE_KEYWORDS.some(k => l.includes(k)) },
  { name: 'Damage', test: l => DAMAGE_KEYWORDS.some(k => l.includes(k)) },
  { name: 'Defense', test: l => DEFENSE_KEYWORDS.some(k => l.includes(k)) },
  { name: 'Health & Energy', test: l => HEALTH_KEYWORDS.some(k => l.includes(k)) },
  { name: 'Resistances', test: l => l.includes('Resistance') },
];

export function categorizeBonuses(bonuses: Map<string, number>): BonusCategory[] {
  if (bonuses.size === 0) return [];

  const buckets = new Map<string, BonusEntry[]>();
  for (const cat of CATEGORIES) buckets.set(cat.name, []);
  buckets.set('Other', []);

  for (const [label, value] of bonuses) {
    let placed = false;
    for (const cat of CATEGORIES) {
      if (cat.test(label)) {
        buckets.get(cat.name)!.push({ label, value });
        placed = true;
        break;
      }
    }
    if (!placed) buckets.get('Other')!.push({ label, value });
  }

  const result: BonusCategory[] = [];
  for (const name of [...CATEGORIES.map(c => c.name), 'Other']) {
    const entries = buckets.get(name)!;
    if (entries.length === 0) continue;
    entries.sort((a, b) => a.label.localeCompare(b.label));
    result.push({ name, entries });
  }
  return result;
}
```

- [ ] **Step 3: Run tests**

Run: `cd tools/calc && npm test`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add tools/calc/src/bonuses.ts tools/calc/src/bonuses.test.ts
git commit -m "feat(calc): add categorizeBonuses() grouping logic"
```

---

### Task 3: HTML, CSS, and `renderBonusesPanel()`

**Files:**
- Modify: `tools/calc/index.html:37-38` (add bonuses-panel div)
- Create: `tools/calc/src/bonuses-render.ts`
- Modify: `tools/calc/css/style.css` (append styles)

- [ ] **Step 1: Add the bonuses-panel div to `index.html`**

In `tools/calc/index.html`, insert a new div after the `over-banner` div (line 37) and before the mastery panels flex container (line 39):

```html
    <div id="bonuses-panel"></div>
```

The result should be:

```html
    <div id="over-banner" class="alert alert-warning py-2 d-none mb-2">Build exceeds current point budget.</div>

    <div id="bonuses-panel"></div>

    <div class="d-flex flex-column gap-3">
```

- [ ] **Step 2: Add CSS styles**

Append to `tools/calc/css/style.css`:

```css
/* === Combined bonuses panel === */

.bonuses-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 16px;
  cursor: pointer;
  background: rgba(255,255,255,0.03);
  border: 1px solid #333;
  border-radius: 6px;
  margin-bottom: 8px;
  user-select: none;
}

.bonuses-header:hover {
  background: rgba(255,255,255,0.06);
}

.bonuses-header-title {
  font-size: 13px;
  font-weight: 600;
  color: #e0e0e0;
}

.bonuses-header-count {
  font-size: 11px;
  color: #888;
}

.bonuses-body {
  padding: 8px 16px 12px;
  border: 1px solid #333;
  border-top: none;
  border-radius: 0 0 6px 6px;
  margin-top: -14px;
  margin-bottom: 8px;
  background: rgba(255,255,255,0.02);
}

.bonuses-header.expanded {
  border-radius: 6px 6px 0 0;
  margin-bottom: 0;
}

.bonuses-category-label {
  font-size: 10px;
  font-weight: 600;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 1px;
  padding: 6px 0 2px 0;
  border-bottom: 1px solid #2a2a2a;
  margin-bottom: 4px;
  grid-column: 1 / -1;
}

.bonuses-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2px 24px;
  font-size: 12px;
  color: #ccc;
}

@media (max-width: 992px) {
  .bonuses-grid { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 576px) {
  .bonuses-grid { grid-template-columns: 1fr; }
}

.bonuses-stat-value {
  color: #7cb7ff;
  font-weight: 600;
}
```

- [ ] **Step 3: Create `bonuses-render.ts`**

```typescript
// tools/calc/src/bonuses-render.ts
import type { BonusCategory } from './bonuses.js';

let expanded = false;

export function renderBonusesPanel(
  container: HTMLElement,
  categories: BonusCategory[],
  totalStats: number,
): void {
  container.innerHTML = '';
  if (categories.length === 0) return;

  const header = document.createElement('div');
  header.className = 'bonuses-header' + (expanded ? ' expanded' : '');

  const title = document.createElement('span');
  title.className = 'bonuses-header-title';
  title.textContent = (expanded ? '\u25BC' : '\u25B6') + ' Combined Bonuses';

  const count = document.createElement('span');
  count.className = 'bonuses-header-count';
  count.textContent = `${totalStats} stats`;

  header.append(title, count);
  container.appendChild(header);

  header.addEventListener('click', () => {
    expanded = !expanded;
    renderBonusesPanel(container, categories, totalStats);
  });

  if (!expanded) return;

  const body = document.createElement('div');
  body.className = 'bonuses-body';

  const grid = document.createElement('div');
  grid.className = 'bonuses-grid';

  for (const cat of categories) {
    const catLabel = document.createElement('div');
    catLabel.className = 'bonuses-category-label';
    catLabel.textContent = cat.name;
    grid.appendChild(catLabel);

    for (const entry of cat.entries) {
      const line = document.createElement('div');
      const valSpan = document.createElement('span');
      valSpan.className = 'bonuses-stat-value';
      valSpan.textContent = formatValue(entry.label, entry.value);
      line.append(valSpan, ' ', stripPrefix(entry.label));
      grid.appendChild(line);
    }
  }

  body.appendChild(grid);
  container.appendChild(body);
}

function formatValue(label: string, value: number): string {
  if (label.startsWith('+% ')) return `+${value}%`;
  if (label.startsWith('+ ')) return `+${value}`;
  if (label.startsWith('% ')) return `${value}%`;
  if (label.startsWith('-')) return `${value}`;
  // Flat values (e.g. "Physical Damage", "Chaos Damage")
  return String(value);
}

function stripPrefix(label: string): string {
  if (label.startsWith('+% ')) return label.slice(3);
  if (label.startsWith('+ ')) return label.slice(2);
  if (label.startsWith('% ')) return label.slice(2);
  return label;
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd tools/calc && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add tools/calc/index.html tools/calc/css/style.css tools/calc/src/bonuses-render.ts
git commit -m "feat(calc): add bonuses panel HTML, CSS, and render function"
```

---

### Task 4: Integrate into `main.ts`

**Files:**
- Modify: `tools/calc/src/main.ts`

- [ ] **Step 1: Add imports**

At the top of `tools/calc/src/main.ts`, after the existing imports (line 11), add:

```typescript
import { collectBonuses, categorizeBonuses } from './bonuses.js';
import { renderBonusesPanel } from './bonuses-render.js';
```

- [ ] **Step 2: Add `bonusesPanel` to `AppRefs`**

In the `AppRefs` interface, add after `devotionCap`:

```typescript
  bonusesPanel: HTMLElement;
```

In the `collectRefs()` function, add after `devotionCap`:

```typescript
    bonusesPanel: byId('bonuses-panel'),
```

- [ ] **Step 3: Call `renderBonusesPanel()` in the render loop**

In the `render()` function in `tools/calc/src/main.ts`, add after the devotion panel rendering block (after `renderDevotionPanel(...)`, around line 182) and before the devotion cap sync (line 185):

```typescript
    // Bonuses panel
    const bonuses = collectBonuses(state, data, devState, devotionData);
    const categories = categorizeBonuses(bonuses);
    renderBonusesPanel(refs.bonusesPanel, categories, bonuses.size);
```

- [ ] **Step 4: Verify TypeScript compiles and tests pass**

Run: `cd tools/calc && npm test`
Expected: All tests pass, no compile errors.

- [ ] **Step 5: Commit**

```bash
git add tools/calc/src/main.ts
git commit -m "feat(calc): integrate bonuses panel into render loop"
```

---

### Task 5: Manual smoke test

**Files:** None (verification only)

- [ ] **Step 1: Build and start dev server**

Run: `cd tools/calc && npm run build`

- [ ] **Step 2: Verify in browser**

Open the calculator, select Soldier mastery, allocate points to Military Conditioning (a passive), and allocate some devotion nodes. Verify:

1. The collapsible "Combined Bonuses" header appears between the controls and mastery panels
2. Clicking it expands to show grouped stats
3. Stats are grouped into correct categories
4. Values update when allocating/deallocating points
5. Panel hides when no passives or devotion nodes are allocated
6. Collapsing and expanding works correctly

- [ ] **Step 3: Commit any fixes if needed**
