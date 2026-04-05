import type { BuildState, Mastery, Skill } from './types.js';
import { isSkillUnlocked } from './rules.js';

export interface RenderCallbacks {
  onSkillDelta(skillId: string, slot: 0 | 1, delta: 1 | -1): void;
  onBarDelta(slot: 0 | 1, delta: 1 | -1): void;
}

export function renderMasteryPanel(
  container: HTMLElement,
  slot: 0 | 1,
  mastery: Mastery | null,
  state: BuildState,
  over: boolean,
  cb: RenderCallbacks,
): void {
  container.innerHTML = '';
  if (mastery === null) {
    const empty = document.createElement('div');
    empty.className = 'text-muted fst-italic p-3';
    empty.textContent = 'No mastery selected';
    container.appendChild(empty);
    return;
  }

  // mastery bar row
  const barRow = document.createElement('div');
  barRow.className = 'd-flex align-items-center gap-2 mb-3';
  const barLabel = document.createElement('strong');
  barLabel.textContent = `${mastery.name} bar`;
  const barCount = document.createElement('span');
  barCount.className = 'badge bg-secondary';
  barCount.textContent = `${state.masteryBar[slot]}/${mastery.barMaxRank}`;
  const barPlus = mkBtn('+', () => cb.onBarDelta(slot, 1), state.masteryBar[slot] >= mastery.barMaxRank || over);
  const barMinus = mkBtn('-', () => cb.onBarDelta(slot, -1), state.masteryBar[slot] <= 0);
  barRow.append(barLabel, barCount, barPlus, barMinus);
  container.appendChild(barRow);

  // skills
  const grid = document.createElement('div');
  grid.className = 'd-flex flex-column gap-2';
  for (const skill of mastery.skills) {
    grid.appendChild(renderSkillRow(skill, slot, state, over, cb));
  }
  container.appendChild(grid);
}

function renderSkillRow(
  skill: Skill,
  slot: 0 | 1,
  state: BuildState,
  over: boolean,
  cb: RenderCallbacks,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'd-flex align-items-center gap-2 skill-row';
  row.dataset.skillId = skill.id;
  if (skill.parent !== null) row.classList.add('ms-4');

  const rank = state.allocations.get(skill.id) ?? 0;
  const unlocked = isSkillUnlocked(skill, slot, state);
  if (!unlocked) row.classList.add('opacity-50');

  const name = document.createElement('span');
  name.className = 'flex-grow-1';
  name.textContent = skill.name;
  name.title = skill.description;

  const count = document.createElement('span');
  count.className = 'badge bg-secondary';
  count.textContent = `${rank}/${skill.maxRank}`;

  const reason = !unlocked ? lockReason(skill, slot, state) : '';
  if (reason) name.textContent = `${skill.name} (${reason})`;

  const plusDisabled = !unlocked || rank >= skill.maxRank || over;
  const minusDisabled = rank <= 0;
  const plus = mkBtn('+', () => cb.onSkillDelta(skill.id, slot, 1), plusDisabled);
  const minus = mkBtn('-', () => cb.onSkillDelta(skill.id, slot, -1), minusDisabled);

  row.append(name, count, plus, minus);
  return row;
}

function lockReason(skill: Skill, slot: 0 | 1, state: BuildState): string {
  if (state.masteryBar[slot] < skill.prereqBar) {
    return `needs bar ${skill.prereqBar}`;
  }
  if (skill.parent !== null) {
    const pr = state.allocations.get(skill.parent) ?? 0;
    if (pr < skill.parentMinRank) return `needs parent rank ${skill.parentMinRank}`;
  }
  return '';
}

function mkBtn(label: string, handler: () => void, disabled: boolean): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn btn-sm btn-outline-primary';
  b.textContent = label;
  b.disabled = disabled;
  b.addEventListener('click', handler);
  return b;
}
