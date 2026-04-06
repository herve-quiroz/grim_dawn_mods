import type { BuildState, Mastery, Skill, SkillsData } from './types.js';
import { isSkillUnlocked } from './rules.js';

declare const bootstrap: {
  Popover: new (el: Element, opts: Record<string, unknown>) => void;
};

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
  versionName?: string,
  data?: SkillsData,
): void {
  // remove any open popovers before re-rendering (they're appended to body)
  document.querySelectorAll('.popover').forEach(el => el.remove());
  container.innerHTML = '';
  if (mastery === null) {
    const empty = document.createElement('div');
    empty.className = 'text-muted fst-italic p-3';
    empty.textContent = 'No mastery selected';
    container.appendChild(empty);
    return;
  }

  // Build tier mapping: equal-spaced positions for each prereqBar level
  const byPrereq = new Map<number, Skill[]>();
  for (const skill of mastery.skills) {
    const pb = Math.max(1, skill.prereqBar);
    const list = byPrereq.get(pb) ?? [];
    list.push(skill);
    byPrereq.set(pb, list);
  }
  const tiers = Array.from(byPrereq.keys()).sort((a, b) => a - b);
  const tierCount = tiers.length;
  const tierPos = new Map<number, number>(); // prereqBar → percent position
  for (let i = 0; i < tierCount; i++) {
    tierPos.set(tiers[i], tierCount > 1 ? (i / (tierCount - 1)) * 100 : 50);
  }

  // Aligned zone: skill grid + progress bar share the same horizontal reference
  const alignedZone = document.createElement('div');
  alignedZone.className = 'skill-aligned-zone';

  // Skill grid (above the bar)
  const maxStack = Math.max(...Array.from(byPrereq.values()).map(v => v.length));
  const grid = document.createElement('div');
  grid.className = 'skill-grid';
  grid.style.height = `${maxStack * 56 + 4}px`;

  for (const tier of tiers) {
    const skills = byPrereq.get(tier)!;
    const col = document.createElement('div');
    col.className = 'skill-tier-col';
    col.style.left = `${tierPos.get(tier)!}%`;

    for (const skill of skills) {
      const cell = renderSkillCell(skill, slot, state, over, cb, versionName, data);
      col.appendChild(cell);
    }
    grid.appendChild(col);
  }
  alignedZone.appendChild(grid);

  // Mastery bar at the bottom (like in-game)
  // Progress bar (full width of aligned zone, matching skill grid)
  const barOuter = document.createElement('div');
  barOuter.className = 'progress mt-2';
  barOuter.style.height = '14px';
  const barInner = document.createElement('div');
  barInner.className = 'progress-bar';
  barInner.style.width = `${tierBarPercent(state.masteryBar[slot], tiers, tierPos)}%`;
  barOuter.appendChild(barInner);
  alignedZone.appendChild(barOuter);

  // Mastery rank widget: rank + +/- below the bar, centered
  const barWidget = document.createElement('div');
  barWidget.className = 'mastery-bar-widget text-center mt-1';
  const barRank = document.createElement('div');
  barRank.className = state.masteryBar[slot] > 0 ? 'skill-rank active' : 'skill-rank';
  barRank.textContent = `${state.masteryBar[slot]}/${mastery.barMaxRank}`;
  const barBtns = document.createElement('div');
  barBtns.className = 'd-flex gap-1 justify-content-center';
  barBtns.appendChild(mkBtn('+', () => cb.onBarDelta(slot, 1), state.masteryBar[slot] >= mastery.barMaxRank || over));
  barBtns.appendChild(mkBtn('-', () => cb.onBarDelta(slot, -1), state.masteryBar[slot] <= 0));
  barWidget.append(barRank, barBtns);

  // Panel title
  const title = document.createElement('h6');
  title.className = 'mb-2';
  title.textContent = mastery.name;
  container.appendChild(title);

  container.appendChild(alignedZone);
  container.appendChild(barWidget);

  // initialize Bootstrap popovers on newly rendered skill icons
  container.querySelectorAll('[data-bs-toggle="popover"]').forEach(el => {
    new bootstrap.Popover(el, { container: 'body', html: true });
  });
}

/**
 * Map a mastery bar value to a display percentage using equal-spaced tiers.
 * Interpolates linearly between tier breakpoints.
 */
function tierBarPercent(
  barValue: number,
  tiers: number[],
  tierPos: Map<number, number>,
): number {
  if (barValue <= 0) return 0;
  // Find which two tiers the bar value falls between
  for (let i = 0; i < tiers.length; i++) {
    if (barValue <= tiers[i]) {
      if (i === 0) {
        // Below or at first tier
        return (barValue / tiers[0]) * tierPos.get(tiers[0])!;
      }
      const lo = tiers[i - 1];
      const hi = tiers[i];
      const loPos = tierPos.get(lo)!;
      const hiPos = tierPos.get(hi)!;
      const frac = (barValue - lo) / (hi - lo);
      return loPos + frac * (hiPos - loPos);
    }
  }
  // Beyond last tier
  return 100;
}

function formatStatValue(val: number): string {
  return val % 1 === 0 ? String(val) : val.toFixed(1);
}

function skillTooltipContent(skill: Skill, rank: number): string {
  let html = '<div class="skill-tooltip">';
  if (skill.description) html += `<div class="mb-2">${skill.description}</div>`;
  if (skill.stats && skill.stats.length > 0) {
    const displayRank = rank > 0 ? rank : 1;
    const rankLabel = rank > 0 ? `Rank ${rank}/${skill.maxRank}` : 'Rank 1';
    const textClass = rank > 0 ? 'text-info' : 'text-muted';
    html += `<div class="${textClass} small"><strong>${rankLabel}:</strong></div>`;
    for (const stat of skill.stats) {
      const idx = Math.min(displayRank - 1, stat.values.length - 1);
      const val = stat.values[idx];
      const formatted = formatStatValue(val);
      html += `<div class="small">${stat.label}: ${formatted}</div>`;
    }
  }
  html += '</div>';
  return html;
}

function renderSkillCell(
  skill: Skill,
  slot: 0 | 1,
  state: BuildState,
  over: boolean,
  cb: RenderCallbacks,
  versionName?: string,
  data?: SkillsData,
): HTMLElement {
  const cell = document.createElement('div');
  cell.className = 'skill-cell';
  cell.dataset.skillId = skill.id;

  const rank = state.allocations.get(skill.id) ?? 0;
  const unlocked = isSkillUnlocked(skill, slot, state, data);
  const isModifier = skill.parent !== null;

  // choose border texture
  let borderFile: string;
  if (!unlocked) {
    borderFile = isModifier ? 'skills_buttonborderroundgrayout01.png' : 'skills_buttonbordergrayout01.png';
  } else if (rank > 0) {
    borderFile = isModifier ? 'skills_buttonborderroundgold01.png' : 'skills_buttonbordergold01.png';
  } else {
    borderFile = isModifier ? 'skills_buttonborderround01.png' : 'skills_buttonborder01.png';
  }

  // border image
  const border = document.createElement('img');
  border.className = 'skill-border';
  border.src = `data/ui/${borderFile}`;
  border.alt = '';

  // skill icon
  const icon = document.createElement('img');
  icon.className = 'skill-icon';
  icon.width = 32;
  icon.height = 32;
  icon.alt = skill.name;
  if (skill.icon && versionName) icon.src = `data/icons/${versionName}/${skill.icon}`;

  // popover on the cell (triggers on icon, buttons, rank label)
  const hasContent = skill.description || (skill.stats && skill.stats.length > 0);
  if (hasContent) {
    const tooltipContent = skillTooltipContent(skill, rank);
    cell.setAttribute('data-bs-toggle', 'popover');
    cell.setAttribute('data-bs-trigger', 'hover focus');
    cell.setAttribute('data-bs-placement', 'top');
    cell.setAttribute('data-bs-title', skill.name);
    cell.setAttribute('data-bs-content', tooltipContent);
    cell.style.cursor = 'help';
  }

  // rank label
  const rankLabel = document.createElement('div');
  rankLabel.className = rank > 0 ? 'skill-rank active' : 'skill-rank';
  rankLabel.textContent = `${rank}/${skill.maxRank}`;

  // +/- controls (shown on hover via CSS)
  const controls = document.createElement('div');
  controls.className = 'skill-controls';
  const plusDisabled = !unlocked || rank >= skill.maxRank || over;
  const minusDisabled = rank <= 0;
  controls.appendChild(mkBtn('+', () => cb.onSkillDelta(skill.id, slot, 1), plusDisabled));
  controls.appendChild(mkBtn('-', () => cb.onSkillDelta(skill.id, slot, -1), minusDisabled));

  if (!unlocked) cell.classList.add('opacity-50');

  cell.append(border, icon, rankLabel, controls);
  return cell;
}

function mkBtn(label: string, handler: () => void, inactive: boolean): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = inactive ? 'btn btn-sm btn-outline-secondary' : 'btn btn-sm btn-outline-primary';
  b.textContent = label;
  b.addEventListener('click', (e) => {
    e.preventDefault();
    if (!inactive) handler();
  });
  return b;
}
