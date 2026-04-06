import type { BuildState, Mastery, Skill, SkillsData } from './types.js';
import { isSkillUnlocked } from './rules.js';

declare const bootstrap: {
  Popover: {
    new (el: Element, opts: Record<string, unknown>): void;
    Default: { allowList: Record<string, string[]> };
  };
};

export interface RenderCallbacks {
  onSkillDelta(skillId: string, slot: 0 | 1, delta: 1 | -1): void;
  onBarDelta(slot: 0 | 1, delta: 1 | -1): void;
  onMasteryChange(slot: 0 | 1, newId: number | null): void;
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
  // Mastery dropdown (always rendered, even when no mastery selected)
  const otherSlot = slot === 0 ? 1 : 0;
  const otherMasteryId = state.masteries[otherSlot];
  const select = document.createElement('select');
  select.className = 'form-select form-select-sm mb-2';
  select.style.maxWidth = '200px';
  const noneOpt = document.createElement('option');
  noneOpt.value = '';
  noneOpt.textContent = '— none —';
  select.appendChild(noneOpt);
  if (data) {
    for (const m of data.masteries) {
      if (m.id === otherMasteryId) continue;
      const opt = document.createElement('option');
      opt.value = String(m.id);
      opt.textContent = m.name;
      if (mastery && m.id === mastery.id) opt.selected = true;
      select.appendChild(opt);
    }
  }
  select.addEventListener('change', () => {
    const raw = select.value;
    cb.onMasteryChange(slot, raw === '' ? null : parseInt(raw, 10));
  });
  container.appendChild(select);

  if (mastery === null) return;

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
  // Map each tier to the center of its CSS grid column: (i + 0.5) / N * 100%
  const tierPos = new Map<number, number>(); // prereqBar → percent position
  for (let i = 0; i < tierCount; i++) {
    tierPos.set(tiers[i], ((i + 0.5) / tierCount) * 100);
  }

  // Aligned zone: skill grid + progress bar share the same horizontal reference
  const alignedZone = document.createElement('div');
  alignedZone.className = 'skill-aligned-zone';

  // Skill grid — 2D CSS grid using ui.row for Y and prereqBar tier for X
  const maxRow = Math.max(...mastery.skills.map(s => s.ui.row));
  const grid = document.createElement('div');
  grid.className = 'skill-grid';
  grid.style.gridTemplateColumns = `repeat(${tierCount}, 1fr)`;
  grid.style.gridTemplateRows = `repeat(${maxRow}, 80px)`;

  // Build tier index lookup: prereqBar → column number (1-based for CSS grid)
  const tierIndex = new Map<number, number>();
  for (let i = 0; i < tiers.length; i++) tierIndex.set(tiers[i], i + 1);

  // Track cell positions for drawing dependency lines
  const cellPositions = new Map<string, { col: number; row: number }>();
  const seenIds = new Set<string>();
  for (const skill of mastery.skills) {
    if (seenIds.has(skill.id)) continue;
    seenIds.add(skill.id);
    const pb = Math.max(1, skill.prereqBar);
    const col = tierIndex.get(pb) ?? 1;
    const gridRow = maxRow + 1 - skill.ui.row;
    const cell = renderSkillCell(skill, slot, state, over, cb, versionName, data);
    cell.style.gridColumn = String(col);
    cell.style.gridRow = String(gridRow);
    grid.appendChild(cell);
    cellPositions.set(skill.id, { col, row: gridRow });
  }

  // SVG overlay for dependency lines
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('skill-lines');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');

  const dedupedSkills = mastery.skills.filter(s => {
    if (!cellPositions.has(s.id)) return false;
    return !Array.from(cellPositions.keys()).some(
      id => id === s.id && mastery.skills.indexOf(s) !== mastery.skills.findIndex(sk => sk.id === id)
    );
  });
  for (const skill of dedupedSkills) {
    if (!skill.parent) continue;
    const from = cellPositions.get(skill.parent);
    const to = cellPositions.get(skill.id);
    if (!from || !to) continue;

    // Convert grid col/row to percentage positions
    // X: center of column, Y: icon center (~25% from top of cell)
    const x1 = ((from.col - 0.5) / tierCount) * 100;
    const y1 = ((from.row - 0.75) / maxRow) * 100;
    const x2 = ((to.col - 0.5) / tierCount) * 100;
    const y2 = ((to.row - 0.75) / maxRow) * 100;

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', `${x1}%`);
    line.setAttribute('y1', `${y1}%`);
    line.setAttribute('x2', `${x2}%`);
    line.setAttribute('y2', `${y2}%`);
    svg.appendChild(line);
  }
  // Wrap grid + SVG in a positioned container so SVG sits behind the grid
  const gridWrapper = document.createElement('div');
  gridWrapper.className = 'skill-grid-wrapper';
  gridWrapper.appendChild(svg);
  gridWrapper.appendChild(grid);

  alignedZone.appendChild(gridWrapper);

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

  container.appendChild(alignedZone);
  container.appendChild(barWidget);

  // initialize Bootstrap popovers on newly rendered skill icons
  container.querySelectorAll('[data-bs-toggle="popover"]').forEach(el => {
    new bootstrap.Popover(el, {
      container: 'body',
      html: true,
      allowList: {
        ...bootstrap.Popover.Default.allowList,
        span: ['class'],
      },
    });
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
  if (barValue >= tiers[tiers.length - 1]) return 100;
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
  // Beyond last tier — interpolate from last tier position to 100%
  const lastTier = tiers[tiers.length - 1];
  const lastPos = tierPos.get(lastTier)!;
  // barMaxRank is the absolute max (typically 50)
  const barMax = lastTier; // last tier IS the max
  if (barValue >= barMax) return 100;
  const frac = (barValue - lastTier) / (barMax - lastTier);
  return lastPos + frac * (100 - lastPos);
}

/** Convert GD color codes (^o = gold, ^w = white) to HTML spans. */
function formatColorCodes(text: string): string {
  let result = '';
  let inGold = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '^' && i + 1 < text.length) {
      const code = text[i + 1];
      if (code === 'o') {
        if (!inGold) { result += '<span class="gd-gold">'; inGold = true; }
        i++;
        continue;
      }
      if (code === 'w') {
        if (inGold) { result += '</span>'; inGold = false; }
        i++;
        continue;
      }
    }
    result += text[i];
  }
  if (inGold) result += '</span>';
  return result;
}

function formatStatValue(val: number): string {
  return val % 1 === 0 ? String(val) : val.toFixed(1);
}

function renderStatBlock(skill: Skill, levelIdx: number): string {
  let html = '';
  for (const stat of skill.stats) {
    const idx = Math.min(levelIdx, stat.values.length - 1);
    const val = stat.values[idx];
    html += `<div class="small">${stat.label}: ${formatStatValue(val)}</div>`;
  }
  return html;
}

function skillTooltipContent(skill: Skill, rank: number): string {
  let html = '<div class="skill-tooltip">';
  if (skill.description) html += `<div class="mb-2">${formatColorCodes(skill.description)}</div>`;
  if (skill.stats && skill.stats.length > 0) {
    if (rank > 0) {
      // Current level
      html += `<div class="text-info small"><strong>Current Level: ${rank}</strong></div>`;
      html += renderStatBlock(skill, rank - 1);
      // Next level (if not maxed)
      if (rank < skill.maxRank) {
        html += `<div class="text-warning small mt-1"><strong>Next Level: ${rank + 1}</strong></div>`;
        html += renderStatBlock(skill, rank);
      }
    } else {
      // No points allocated — show level 1 preview
      html += `<div class="text-muted small"><strong>Next Level: 1</strong></div>`;
      html += renderStatBlock(skill, 0);
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
    cell.setAttribute('data-bs-trigger', 'hover');
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

  if (!unlocked) cell.classList.add('locked');

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
