import type { Constellation, DevotionsData, DevotionState, DevotionNode } from './devotion-types.js';
import { nodeKey } from './devotion-types.js';
import { computeAffinities, isConstellationUnlockable, isNodeAllocatable, totalDevotionSpent } from './devotion-rules.js';
import { formatColorCodes } from './render.js';

declare const bootstrap: {
  Popover: {
    new (el: Element, opts: Record<string, unknown>): void;
    Default: { allowList: Record<string, string[]> };
  };
};

const isTouch = typeof window !== 'undefined' &&
  ('ontouchstart' in window || navigator.maxTouchPoints > 0);

const AFFINITY_COLORS = ['#64b4ff', '#ff5050', '#b464ff', '#ffc832', '#64dca0'];
const AFFINITY_BG = [
  'rgba(100,180,255,0.15)',
  'rgba(255,80,80,0.15)',
  'rgba(180,100,255,0.15)',
  'rgba(255,200,50,0.15)',
  'rgba(100,220,160,0.15)',
];

export interface DevotionCallbacks {
  onNodeDelta(constellationId: string, nodeIndex: number, delta: 1 | -1): void;
  onCrossroadsToggle(crossroadsId: string): void;
  onToggleAll(constellationId: string): void;
}

export function renderDevotionPanel(
  container: HTMLElement,
  state: DevotionState,
  data: DevotionsData,
  cb: DevotionCallbacks,
): void {
  document.querySelectorAll('.popover').forEach(el => el.remove());
  container.innerHTML = '';

  const over = totalDevotionSpent(state) > state.devotionCap;

  // Group constellations by tier
  const byTier = new Map<number, Constellation[]>();
  for (const c of data.constellations) {
    const list = byTier.get(c.tier) ?? [];
    list.push(c);
    byTier.set(c.tier, list);
  }

  // Crossroads section
  container.appendChild(renderTierHeader('Crossroads'));
  container.appendChild(renderCrossroadsRow(data, state, cb));

  // Tier 1, 2, 3
  for (const tier of [1, 2, 3]) {
    const constellations = byTier.get(tier) ?? [];
    if (constellations.length === 0) continue;
    container.appendChild(renderTierHeader(`Tier ${tier}`));
    for (const c of constellations) {
      container.appendChild(renderConstellationRow(c, state, data, over, cb));
    }
  }

  // Initialize popovers
  container.querySelectorAll('[data-bs-toggle="popover"]').forEach(el => {
    new bootstrap.Popover(el, {
      container: 'body',
      html: true,
      allowList: {
        ...bootstrap.Popover.Default.allowList,
        span: ['class'],
        div: ['class', 'style'],
      },
    });
  });
}

function renderTierHeader(label: string): HTMLElement {
  const h = document.createElement('div');
  h.className = 'devotion-tier-header';
  h.textContent = label;
  return h;
}

function renderCrossroadsRow(
  data: DevotionsData,
  state: DevotionState,
  cb: DevotionCallbacks,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'devotion-crossroads-row';

  const name = document.createElement('div');
  name.className = 'devotion-constellation-name';
  name.textContent = 'Crossroads';
  row.appendChild(name);

  const toggles = document.createElement('div');
  toggles.className = 'devotion-crossroads-toggles';

  for (const xr of data.crossroads) {
    const btn = document.createElement('button');
    btn.type = 'button';
    const active = state.crossroads.has(xr.id);
    const color = AFFINITY_COLORS[xr.affinity];
    const bg = AFFINITY_BG[xr.affinity];
    const affName = data.affinities[xr.affinity];
    btn.className = 'devotion-crossroads-toggle';
    if (active) {
      btn.style.borderColor = color;
      btn.style.background = bg;
      btn.style.color = color;
    }
    btn.textContent = `★ ${affName}`;
    btn.addEventListener('click', () => cb.onCrossroadsToggle(xr.id));
    toggles.appendChild(btn);
  }

  row.appendChild(toggles);
  return row;
}

function renderConstellationRow(
  c: Constellation,
  state: DevotionState,
  data: DevotionsData,
  over: boolean,
  cb: DevotionCallbacks,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'devotion-constellation-row';
  row.dataset.constellationId = c.id;

  const complete = c.nodes.every(n => state.allocatedNodes.has(nodeKey(c.id, n.index)));
  const unlockable = isConstellationUnlockable(c, state, data);

  // Checkmark
  const check = document.createElement('div');
  check.className = complete ? 'devotion-check completed' : 'devotion-check';
  check.textContent = complete ? '✓' : '';
  check.title = complete ? 'Click to clear all' : 'Click to fill all';
  check.addEventListener('click', () => cb.onToggleAll(c.id));
  row.appendChild(check);

  // Name
  const name = document.createElement('div');
  name.className = 'devotion-constellation-name';
  name.textContent = c.name;
  if (!unlockable) name.classList.add('locked');
  row.appendChild(name);

  // Affinity info (requires + bonus stacked)
  const info = document.createElement('div');
  info.className = 'devotion-affinity-info';

  const reqLine = document.createElement('div');
  reqLine.className = 'devotion-affinity-line';
  const reqLabel = document.createElement('span');
  reqLabel.className = 'devotion-affinity-label';
  reqLabel.textContent = 'Requires:';
  reqLine.appendChild(reqLabel);
  if (c.requires.length === 0) {
    const none = document.createElement('span');
    none.className = 'devotion-chip-none';
    none.textContent = 'none';
    reqLine.appendChild(none);
  } else {
    for (const r of c.requires) {
      reqLine.appendChild(makeChip(String(r.amount), r.affinity));
    }
  }
  info.appendChild(reqLine);

  const bonusLine = document.createElement('div');
  bonusLine.className = 'devotion-affinity-line';
  const bonusLabel = document.createElement('span');
  bonusLabel.className = 'devotion-affinity-label';
  bonusLabel.textContent = 'Bonus:';
  bonusLine.appendChild(bonusLabel);
  if (c.bonus.length === 0) {
    const none = document.createElement('span');
    none.className = 'devotion-chip-none';
    none.textContent = 'none';
    bonusLine.appendChild(none);
  } else {
    for (const b of c.bonus) {
      bonusLine.appendChild(makeChip(`+${b.amount}`, b.affinity));
    }
  }
  info.appendChild(bonusLine);
  row.appendChild(info);

  // Node graph
  const graph = document.createElement('div');
  graph.className = 'devotion-node-graph';
  renderNodeGraph(graph, c, state, data, over, cb);
  row.appendChild(graph);

  return row;
}

function makeChip(text: string, affinityIndex: number): HTMLElement {
  const chip = document.createElement('span');
  chip.className = 'devotion-affinity-chip';
  chip.style.color = AFFINITY_COLORS[affinityIndex];
  chip.style.background = AFFINITY_BG[affinityIndex];
  chip.textContent = text;
  return chip;
}

/**
 * Render the node graph for a constellation using a recursive tree layout.
 * Produces horizontal chains with vertical branching for fan-out.
 */
function renderNodeGraph(
  container: HTMLElement,
  c: Constellation,
  state: DevotionState,
  data: DevotionsData,
  over: boolean,
  cb: DevotionCallbacks,
): void {
  // Build children map
  const children = new Map<number | null, DevotionNode[]>();
  for (const node of c.nodes) {
    const parent = node.parent;
    const list = children.get(parent) ?? [];
    list.push(node);
    children.set(parent, list);
  }

  // Roots are nodes with parent === null
  const roots = children.get(null) ?? [];

  function renderSubtree(node: DevotionNode): HTMLElement {
    const frag = document.createElement('div');
    frag.className = 'devotion-subtree';

    // Render this node
    const nodeEl = renderNode(node, c, state, data, over, cb);
    frag.appendChild(nodeEl);

    // Render children
    const kids = children.get(node.index) ?? [];
    if (kids.length === 0) return frag;

    if (kids.length === 1) {
      // Linear: link + child subtree inline
      const link = document.createElement('div');
      link.className = 'devotion-link-h';
      const bothAllocated =
        state.allocatedNodes.has(nodeKey(c.id, node.index)) &&
        state.allocatedNodes.has(nodeKey(c.id, kids[0].index));
      if (bothAllocated) link.classList.add('active');
      frag.appendChild(link);
      frag.appendChild(renderSubtree(kids[0]));
    } else {
      // Branch: vertical stack of child subtrees
      const branch = document.createElement('div');
      branch.className = 'devotion-branch';
      for (const kid of kids) {
        const arm = document.createElement('div');
        arm.className = 'devotion-branch-arm';
        const link = document.createElement('div');
        link.className = 'devotion-link-h';
        const bothAllocated =
          state.allocatedNodes.has(nodeKey(c.id, node.index)) &&
          state.allocatedNodes.has(nodeKey(c.id, kid.index));
        if (bothAllocated) link.classList.add('active');
        arm.appendChild(link);
        arm.appendChild(renderSubtree(kid));
        branch.appendChild(arm);
      }
      frag.appendChild(branch);
    }

    return frag;
  }

  for (const root of roots) {
    container.appendChild(renderSubtree(root));
  }
}

function renderNode(
  node: DevotionNode,
  c: Constellation,
  state: DevotionState,
  data: DevotionsData,
  over: boolean,
  cb: DevotionCallbacks,
): HTMLElement {
  const el = document.createElement('div');
  const key = nodeKey(c.id, node.index);
  const allocated = state.allocatedNodes.has(key);
  const allocatable = isNodeAllocatable(c, node.index, state, data);
  const hasSkill = node.skill !== null;

  el.className = 'devotion-node';
  if (allocated) el.classList.add('allocated');
  if (hasSkill) el.classList.add('skill-node');
  el.textContent = String(node.index);

  // Tooltip content
  const tooltipParts: string[] = [];
  if (node.stats.length > 0) {
    tooltipParts.push(node.stats.map(s => `${s.label}: ${s.value}`).join('<br>'));
  }
  if (node.skill) {
    tooltipParts.push(`<div class="mt-1"><strong>${node.skill.name}</strong></div>`);
    if (node.skill.description) {
      tooltipParts.push(`<div class="small text-muted mb-1">${formatColorCodes(node.skill.description)}</div>`);
    }
    const allStats = node.skill.stats;
    const petStats = node.skill.petStats ?? [];
    if (allStats.length > 0 || petStats.length > 0) {
      tooltipParts.push('<div class="text-info small"><strong>Level 1</strong></div>');
      if (allStats.length > 0) {
        tooltipParts.push(allStats.map(s => `${s.label}: ${s.level1}`).join('<br>'));
      }
      if (petStats.length > 0) {
        tooltipParts.push('<div class="small" style="color:#aaa;"><em>Summon:</em></div>');
        tooltipParts.push(petStats.map(s => `${s.label}: ${s.level1}`).join('<br>'));
      }
      if (node.skill.maxLevel > 1) {
        tooltipParts.push(`<div class="text-warning small mt-1"><strong>Level ${node.skill.maxLevel}</strong></div>`);
        if (allStats.length > 0) {
          tooltipParts.push(allStats.map(s => `${s.label}: ${s.levelMax}`).join('<br>'));
        }
        if (petStats.length > 0) {
          tooltipParts.push('<div class="small" style="color:#aaa;"><em>Summon:</em></div>');
          tooltipParts.push(petStats.map(s => `${s.label}: ${s.levelMax}`).join('<br>'));
        }
      }
    }
  }

  if (tooltipParts.length > 0) {
    el.setAttribute('data-bs-toggle', 'popover');
    el.setAttribute('data-bs-trigger', isTouch ? 'click' : 'hover');
    el.setAttribute('data-bs-placement', 'top');
    el.setAttribute('data-bs-title', `${c.name} - Node ${node.index}`);
    el.setAttribute('data-bs-content', tooltipParts.join(''));
  }

  // Desktop click handlers
  if (!isTouch) {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      if (allocatable && !over) cb.onNodeDelta(c.id, node.index, 1);
    });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (allocated) cb.onNodeDelta(c.id, node.index, -1);
    });
  }

  return el;
}

/** Render the affinity totals for the bottom bar. */
export function renderAffinityBar(
  container: HTMLElement,
  state: DevotionState,
  data: DevotionsData,
): void {
  container.innerHTML = '';
  const aff = computeAffinities(state, data);

  const label = document.createElement('span');
  label.className = 'text-muted';
  label.textContent = 'Affinity:';
  container.appendChild(label);

  for (let i = 0; i < aff.length; i++) {
    const span = document.createElement('span');
    span.style.color = AFFINITY_COLORS[i];
    span.style.fontWeight = '700';
    span.textContent = String(aff[i]);
    span.title = data.affinities[i];
    container.appendChild(span);
  }
}
