import type { BuildState, SkillsData, VersionsData } from './types.js';
import { emptyBuildState } from './types.js';
import { encodeState, decodeState } from './state.js';
import { computeBudget, totalAllocated, applyDelta, findMastery } from './rules.js';
import { buildSearchIndex, buildDevotionSearchIndex, matchQuery } from './search.js';
import { renderMasteryPanel } from './render.js';
import type { DevotionsData, DevotionState } from './devotion-types.js';
import { emptyDevotionState } from './devotion-types.js';
import { encodeDevotionState, decodeDevotionState } from './state.js';
import { totalDevotionSpent, applyNodeDelta, toggleConstellationAll } from './devotion-rules.js';
import { renderDevotionPanel, renderAffinityBar } from './devotion-render.js';

declare const bootstrap: {
  Modal: new (el: Element) => { show(): void; hide(): void };
};

interface AppRefs {
  level: HTMLInputElement;
  points: HTMLInputElement;
  questRewards: HTMLInputElement;
  search: HTMLInputElement;
  searchCount: HTMLElement;
  budget: HTMLElement;
  versionLabel: HTMLElement;
  reset: HTMLButtonElement;
  share: HTMLButtonElement;
  panelA: HTMLElement;
  panelB: HTMLElement;
  overBanner: HTMLElement;
  toastContainer: HTMLElement;
  devotionPanel: HTMLElement;
  devotionBudget: HTMLElement;
  affinityBar: HTMLElement;
  devotionCap: HTMLInputElement;
}

async function boot(): Promise<void> {
  const versionsRes = await fetch('data/versions.json');
  const versions: VersionsData = await versionsRes.json();

  const hash = window.location.hash.slice(1);
  const [masteryHash, devotionHash] = hash.split('|');
  let versionId = versions.latest;
  if (masteryHash) {
    try {
      const firstByte = decodeFirstByte(masteryHash);
      if (firstByte >= 0 && firstByte < versions.versions.length) {
        versionId = firstByte;
      }
    } catch { /* fall through */ }
  }

  const versionName = versions.versions[versionId];
  const skillsRes = await fetch(`data/skills/skills-${versionName}.json`);
  const data: SkillsData = await skillsRes.json();

  let devotionData: DevotionsData | null = null;
  try {
    const devRes = await fetch(`data/devotions/devotions-${versionName}.json`);
    if (devRes.ok) devotionData = await devRes.json();
  } catch { /* devotion data optional */ }

  let state: BuildState;
  if (masteryHash) {
    try {
      state = decodeState(masteryHash, data);
    } catch (e) {
      console.warn('decode failed, starting fresh', e);
      state = emptyBuildState(versionId);
    }
  } else {
    state = emptyBuildState(versionId);
  }

  let devState: DevotionState = emptyDevotionState();
  if (devotionData && devotionHash) {
    try {
      devState = decodeDevotionState(devotionHash, devotionData);
    } catch { devState = emptyDevotionState(); }
  }

  const refs = collectRefs();
  const searchIndex = buildSearchIndex(data);
  const devSearchIndex = devotionData ? buildDevotionSearchIndex(devotionData) : [];

  refs.versionLabel.textContent = `GD ${data.gdVersion}`;

  const setState = (next: BuildState, pushHistory = true) => {
    state = next;
    syncUrl(state, devState, data, devotionData, pushHistory);
    render();
  };

  const setDevState = (next: DevotionState) => {
    devState = next;
    syncUrl(state, devState, data, devotionData, false);
    render();
  };

  window.addEventListener('popstate', () => {
    const h = window.location.hash.slice(1);
    const [mHash, dHash] = h.split('|');
    try {
      state = mHash ? decodeState(mHash, data) : emptyBuildState(versionId);
    } catch (e) {
      console.warn('popstate decode failed', e);
      state = emptyBuildState(versionId);
    }
    if (devotionData && dHash) {
      try {
        devState = decodeDevotionState(dHash, devotionData);
      } catch { devState = emptyDevotionState(); }
    } else {
      devState = emptyDevotionState();
    }
    render();
  });

  const render = () => {
    syncInputs(refs, state);
    const budget = computeBudget(state, data);
    const total = totalAllocated(state);
    const over = total > budget;
    refs.budget.textContent = `Points available: ${budget - total} / ${budget}`;
    refs.budget.classList.toggle('over', over);
    refs.overBanner.classList.toggle('d-none', !over);

    const mA = state.masteries[0] === null ? null : findMastery(state.masteries[0], data);
    const mB = state.masteries[1] === null ? null : findMastery(state.masteries[1], data);
    const cb = {
      onSkillDelta: (skillId: string, slot: 0 | 1, delta: 1 | -1) => {
        const r = applyDelta(state, { kind: 'skill', skillId, slot }, delta, data);
        if (r.refunds.length) showRefundToast(refs, r.refunds, data);
        setState(r.state);
      },
      onBarDelta: (slot: 0 | 1, delta: number) => {
        const r = applyDelta(state, { kind: 'bar', slot }, delta, data);
        if (r.refunds.length) showRefundToast(refs, r.refunds, data);
        setState(r.state);
      },
      onMasteryChange: (slot: 0 | 1, newId: number | null) => {
        handleMasteryChange(slot, newId, state, data, setState);
      },
    };
    renderMasteryPanel(refs.panelA, 0, mA, state, over, cb, versionName, data);
    renderMasteryPanel(refs.panelB, 1, mB, state, over, cb, versionName, data);

    // Devotion panel
    if (devotionData) {
      const devBudget = devState.devotionCap - totalDevotionSpent(devState);
      refs.devotionBudget.textContent = `Devotion: ${devBudget}`;
      refs.devotionBudget.classList.toggle('over', devBudget < 0);

      renderAffinityBar(refs.affinityBar, devState, devotionData);

      const devCb = {
        onNodeDelta: (cId: string, nIdx: number, delta: 1 | -1) => {
          const r = applyNodeDelta(devState, cId, nIdx, delta, devotionData);
          setDevState(r.state);
        },
        onCrossroadsToggle: (xrId: string) => {
          const next = { ...devState, crossroads: new Set(devState.crossroads) };
          if (next.crossroads.has(xrId)) next.crossroads.delete(xrId);
          else next.crossroads.add(xrId);
          setDevState(next);
        },
        onToggleAll: (cId: string) => {
          setDevState(toggleConstellationAll(devState, cId, devotionData));
        },
      };
      renderDevotionPanel(refs.devotionPanel, devState, devotionData, devCb);
    }

    // Sync devotion cap input
    refs.devotionCap.value = devState.devotionCap === 55 ? '' : String(devState.devotionCap);

    applySearchHighlight(refs, searchIndex, devSearchIndex);
  };
  refs.level.addEventListener('input', () => {
    const v = refs.level.value.trim();
    setState({ ...state, level: v === '' ? null : parseInt(v, 10) }, false);
  });
  refs.points.addEventListener('input', () => {
    const v = refs.points.value.trim();
    setState({ ...state, customPoints: v === '' ? null : parseInt(v, 10) }, false);
  });
  refs.questRewards.addEventListener('change', () => {
    setState({ ...state, questRewards: refs.questRewards.checked });
  });
  refs.search.addEventListener('input', () => {
    applySearchHighlight(refs, searchIndex, devSearchIndex);
  });
  refs.devotionCap.addEventListener('input', () => {
    const v = refs.devotionCap.value.trim();
    setDevState({ ...devState, devotionCap: v === '' ? 55 : parseInt(v, 10) });
  });
  refs.reset.addEventListener('click', () => {
    devState = emptyDevotionState();
    setState({
      ...state,
      masteries: [null, null],
      masteryBar: [0, 0],
      allocations: new Map(),
    });
  });
  refs.share.addEventListener('click', () => handleShare(refs));

  render();
}

function decodeFirstByte(hash: string): number {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const c0 = A.indexOf(hash[0]);
  const c1 = A.indexOf(hash[1] ?? 'A');
  if (c0 < 0 || c1 < 0) throw new Error('bad hash');
  return ((c0 << 2) | (c1 >> 4)) & 0xff;
}

function collectRefs(): AppRefs {
  const byId = <T extends HTMLElement>(id: string) => {
    const e = document.getElementById(id);
    if (!e) throw new Error(`#${id} missing`);
    return e as T;
  };
  return {
    level: byId('level'),
    points: byId('points'),
    questRewards: byId('quest-rewards'),
    search: byId('search'),
    searchCount: byId('search-count'),
    budget: byId('budget-label'),
    versionLabel: byId('version-label'),
    reset: byId('reset'),
    share: byId('share'),
    panelA: byId('panel-a'),
    panelB: byId('panel-b'),
    overBanner: byId('over-banner'),
    toastContainer: byId('toast-container'),
    devotionPanel: byId('devotion-panel'),
    devotionBudget: byId('devotion-budget'),
    affinityBar: byId('affinity-bar'),
    devotionCap: byId<HTMLInputElement>('devotion-cap'),
  };
}

function syncInputs(refs: AppRefs, state: BuildState): void {
  refs.level.value = state.level === null ? '' : String(state.level);
  refs.points.value = state.customPoints === null ? '' : String(state.customPoints);
  refs.questRewards.checked = state.questRewards;
}

async function handleMasteryChange(
  slot: 0 | 1,
  newId: number | null,
  state: BuildState,
  data: SkillsData,
  setState: (s: BuildState) => void,
): Promise<void> {
  const oldId = state.masteries[slot];

  const hadPoints = oldId !== null && (
    state.masteryBar[slot] > 0 ||
    Array.from(state.allocations.keys()).some(k => {
      return findMastery(oldId, data).skills.some(s => s.id === k);
    })
  );

  if (hadPoints) {
    const ok = await confirmDialog('Changing mastery will refund all its points. Continue?');
    if (!ok) {
      setState(state); // re-render to reset dropdown to old value
      return;
    }
  }

  const allocations = new Map(state.allocations);
  if (oldId !== null) {
    const mastery = findMastery(oldId, data);
    for (const s of mastery.skills) allocations.delete(s.id);
  }
  const masteries: [number | null, number | null] = [state.masteries[0], state.masteries[1]];
  masteries[slot] = newId;
  const masteryBar: [number, number] = [state.masteryBar[0], state.masteryBar[1]];
  masteryBar[slot] = 0;
  setState({ ...state, masteries, allocations, masteryBar });
}

function confirmDialog(message: string): Promise<boolean> {
  return new Promise(resolve => {
    const el = document.getElementById('confirm-modal');
    const msgEl = document.getElementById('confirm-modal-message');
    const okBtn = document.getElementById('confirm-modal-ok');
    if (!el || !msgEl || !okBtn) {
      resolve(window.confirm(message));
      return;
    }
    msgEl.textContent = message;
    const modal = new bootstrap.Modal(el);
    let confirmed = false;
    const onOk = () => { confirmed = true; modal.hide(); };
    const onHidden = () => {
      okBtn.removeEventListener('click', onOk);
      el.removeEventListener('hidden.bs.modal', onHidden);
      resolve(confirmed);
    };
    okBtn.addEventListener('click', onOk);
    el.addEventListener('hidden.bs.modal', onHidden);
    modal.show();
  });
}

function syncUrl(
  state: BuildState,
  devState: DevotionState,
  data: SkillsData,
  devotionData: DevotionsData | null,
  pushHistory: boolean,
): void {
  let encoded = encodeState(state, data);
  if (devotionData && totalDevotionSpent(devState) > 0) {
    encoded += '|' + encodeDevotionState(devState, devotionData);
  }
  const newUrl = window.location.pathname + window.location.search + '#' + encoded;
  if (pushHistory) window.history.pushState(null, '', newUrl);
  else window.history.replaceState(null, '', newUrl);
}

function handleShare(refs: AppRefs): void {
  const url = window.location.href;
  const origLabel = refs.share.textContent;
  refs.share.disabled = true;
  navigator.clipboard.writeText(url)
    .then(() => {
      refs.share.textContent = 'Link copied!';
    })
    .catch(() => {
      refs.share.textContent = 'Copy failed';
    })
    .finally(() => {
      setTimeout(() => {
        refs.share.textContent = origLabel;
        refs.share.disabled = false;
      }, 2000);
    });
}

function applySearchHighlight(refs: AppRefs, index: ReturnType<typeof buildSearchIndex>, devIndex: ReturnType<typeof buildDevotionSearchIndex>): void {
  const q = refs.search.value;
  const matches = matchQuery(q, index);
  const active = q.trim() !== '';
  const cells = document.querySelectorAll<HTMLElement>('.skill-cell');
  cells.forEach(cell => {
    const id = cell.dataset.skillId;
    if (!active || !id) {
      cell.classList.remove('search-miss', 'search-hit');
      return;
    }
    const isMatch = matches.has(id);
    cell.classList.toggle('search-miss', !isMatch);
    cell.classList.toggle('search-hit', isMatch);
  });

  const devMatches = matchQuery(q, devIndex);
  const devRows = document.querySelectorAll<HTMLElement>('.devotion-constellation-row');
  devRows.forEach(row => {
    const id = row.dataset.constellationId;
    if (!active || !id) {
      row.classList.remove('search-miss', 'search-hit');
      return;
    }
    const isMatch = devMatches.has(`devotion:${id}`);
    row.classList.toggle('search-miss', !isMatch);
    row.classList.toggle('search-hit', isMatch);
  });

  const totalMatches = matches.size + devMatches.size;
  refs.searchCount.textContent = active ? `${totalMatches} matches` : '';
}

function showRefundToast(refs: AppRefs, refunds: { skillId: string; refunded: number }[], data: SkillsData): void {
  const names = refunds.map(r => {
    for (const m of data.masteries) {
      const s = m.skills.find(s => s.id === r.skillId);
      if (s) return `${s.name} (${r.refunded})`;
    }
    return `${r.skillId} (${r.refunded})`;
  });
  const toast = document.createElement('div');
  toast.className = 'toast show align-items-center text-bg-warning border-0';
  toast.role = 'alert';
  toast.innerHTML = `<div class="d-flex"><div class="toast-body">Refunded: ${names.join(', ')}</div><button type="button" class="btn-close me-2 m-auto" data-bs-dismiss="toast"></button></div>`;
  refs.toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

boot().catch(err => {
  console.error(err);
  document.body.innerHTML = `<pre class="p-3 text-danger">Failed to load: ${err.message}</pre>`;
});
