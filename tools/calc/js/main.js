import { emptyBuildState } from './types.js';
import { encodeState, decodeState } from './state.js';
import { computeBudget, totalAllocated, applyDelta, findMastery } from './rules.js';
import { buildSearchIndex, matchQuery } from './search.js';
import { renderMasteryPanel } from './render.js';
async function boot() {
    const versionsRes = await fetch('data/versions.json');
    const versions = await versionsRes.json();
    const hash = window.location.hash.slice(1);
    let versionId = versions.latest;
    if (hash) {
        try {
            const firstByte = decodeFirstByte(hash);
            if (firstByte >= 0 && firstByte < versions.versions.length) {
                versionId = firstByte;
            }
        }
        catch { /* fall through */ }
    }
    const versionName = versions.versions[versionId];
    const skillsRes = await fetch(`data/skills/skills-${versionName}.json`);
    const data = await skillsRes.json();
    let state;
    if (hash) {
        try {
            state = decodeState(hash, data);
        }
        catch (e) {
            console.warn('decode failed, starting fresh', e);
            state = emptyBuildState(versionId);
        }
    }
    else {
        state = emptyBuildState(versionId);
    }
    const refs = collectRefs();
    const searchIndex = buildSearchIndex(data);
    populateMasteryDropdowns(refs, data, state);
    refs.versionLabel.textContent = `GD ${data.gdVersion}`;
    const setState = (next, pushHistory = true) => {
        state = next;
        syncUrl(state, data, pushHistory);
        render();
    };
    window.addEventListener('popstate', () => {
        const h = window.location.hash.slice(1);
        try {
            state = h ? decodeState(h, data) : emptyBuildState(versionId);
        }
        catch (e) {
            console.warn('popstate decode failed', e);
            state = emptyBuildState(versionId);
        }
        render();
    });
    const render = () => {
        syncInputs(refs, state);
        const budget = computeBudget(state, data);
        const total = totalAllocated(state);
        const over = total > budget;
        refs.budget.textContent = `${total} / ${budget}`;
        refs.budget.classList.toggle('over', over);
        refs.overBanner.classList.toggle('d-none', !over);
        const mA = state.masteries[0] === null ? null : findMastery(state.masteries[0], data);
        const mB = state.masteries[1] === null ? null : findMastery(state.masteries[1], data);
        const cb = {
            onSkillDelta: (skillId, slot, delta) => {
                const r = applyDelta(state, { kind: 'skill', skillId, slot }, delta, data);
                if (r.refunds.length)
                    showRefundToast(refs, r.refunds, data);
                setState(r.state);
            },
            onBarDelta: (slot, delta) => {
                const r = applyDelta(state, { kind: 'bar', slot }, delta, data);
                if (r.refunds.length)
                    showRefundToast(refs, r.refunds, data);
                setState(r.state);
            },
        };
        renderMasteryPanel(refs.panelA, 0, mA, state, over, cb, versionName, data);
        renderMasteryPanel(refs.panelB, 1, mB, state, over, cb, versionName, data);
        applySearchHighlight(refs, searchIndex);
    };
    refs.masteryA.addEventListener('change', () => handleMasteryChange(0, refs, state, data, setState));
    refs.masteryB.addEventListener('change', () => handleMasteryChange(1, refs, state, data, setState));
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
        applySearchHighlight(refs, searchIndex);
    });
    refs.reset.addEventListener('click', () => {
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
function decodeFirstByte(hash) {
    const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const c0 = A.indexOf(hash[0]);
    const c1 = A.indexOf(hash[1] ?? 'A');
    if (c0 < 0 || c1 < 0)
        throw new Error('bad hash');
    return ((c0 << 2) | (c1 >> 4)) & 0xff;
}
function collectRefs() {
    const byId = (id) => {
        const e = document.getElementById(id);
        if (!e)
            throw new Error(`#${id} missing`);
        return e;
    };
    return {
        masteryA: byId('mastery-a'),
        masteryB: byId('mastery-b'),
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
    };
}
function populateMasteryDropdowns(refs, data, state) {
    for (const sel of [refs.masteryA, refs.masteryB]) {
        sel.innerHTML = '<option value="">— none —</option>';
        for (const m of data.masteries) {
            const opt = document.createElement('option');
            opt.value = String(m.id);
            opt.textContent = m.name;
            sel.appendChild(opt);
        }
    }
    syncInputs(refs, state);
}
function syncInputs(refs, state) {
    refs.masteryA.value = state.masteries[0] === null ? '' : String(state.masteries[0]);
    refs.masteryB.value = state.masteries[1] === null ? '' : String(state.masteries[1]);
    for (const sel of [refs.masteryA, refs.masteryB]) {
        const other = sel === refs.masteryA ? state.masteries[1] : state.masteries[0];
        for (const opt of Array.from(sel.options)) {
            opt.hidden = opt.value !== '' && other !== null && parseInt(opt.value, 10) === other;
        }
    }
    refs.level.value = state.level === null ? '' : String(state.level);
    refs.points.value = state.customPoints === null ? '' : String(state.customPoints);
    refs.questRewards.checked = state.questRewards;
}
async function handleMasteryChange(slot, refs, state, data, setState) {
    const sel = slot === 0 ? refs.masteryA : refs.masteryB;
    const raw = sel.value;
    const newId = raw === '' ? null : parseInt(raw, 10);
    const oldId = state.masteries[slot];
    const hadPoints = oldId !== null && (state.masteryBar[slot] > 0 ||
        Array.from(state.allocations.keys()).some(k => {
            return findMastery(oldId, data).skills.some(s => s.id === k);
        }));
    if (hadPoints) {
        const ok = await confirmDialog('Changing mastery will refund all its points. Continue?');
        if (!ok) {
            sel.value = oldId === null ? '' : String(oldId);
            return;
        }
    }
    const allocations = new Map(state.allocations);
    if (oldId !== null) {
        const mastery = findMastery(oldId, data);
        for (const s of mastery.skills)
            allocations.delete(s.id);
    }
    const masteries = [state.masteries[0], state.masteries[1]];
    masteries[slot] = newId;
    const masteryBar = [state.masteryBar[0], state.masteryBar[1]];
    masteryBar[slot] = 0;
    setState({ ...state, masteries, allocations, masteryBar });
}
function confirmDialog(message) {
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
function syncUrl(state, data, pushHistory) {
    const encoded = encodeState(state, data);
    const newUrl = window.location.pathname + window.location.search + '#' + encoded;
    if (pushHistory)
        window.history.pushState(null, '', newUrl);
    else
        window.history.replaceState(null, '', newUrl);
}
function handleShare(refs) {
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
function applySearchHighlight(refs, index) {
    const q = refs.search.value;
    const matches = matchQuery(q, index);
    const active = q.trim() !== '';
    const cells = document.querySelectorAll('.skill-cell');
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
    refs.searchCount.textContent = active ? `${matches.size} matches` : '';
}
function showRefundToast(refs, refunds, data) {
    const names = refunds.map(r => {
        for (const m of data.masteries) {
            const s = m.skills.find(s => s.id === r.skillId);
            if (s)
                return `${s.name} (${r.refunded})`;
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
//# sourceMappingURL=main.js.map