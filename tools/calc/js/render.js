import { isSkillUnlocked } from './rules.js';
export function renderMasteryPanel(container, slot, mastery, state, over, cb, versionName) {
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
        grid.appendChild(renderSkillRow(skill, slot, state, over, cb, versionName));
    }
    container.appendChild(grid);
    // initialize Bootstrap popovers on newly rendered skill names
    container.querySelectorAll('[data-bs-toggle="popover"]').forEach(el => {
        new bootstrap.Popover(el, { container: 'body', html: true });
    });
}
function formatStatValue(val) {
    return val % 1 === 0 ? String(val) : val.toFixed(1);
}
function skillTooltipContent(skill, rank) {
    let html = '<div class="skill-tooltip">';
    if (skill.description)
        html += `<div class="mb-2">${skill.description}</div>`;
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
function renderSkillRow(skill, slot, state, over, cb, versionName) {
    const row = document.createElement('div');
    row.className = 'd-flex align-items-center gap-2 skill-row';
    row.dataset.skillId = skill.id;
    if (skill.parent !== null)
        row.classList.add('ms-4');
    const rank = state.allocations.get(skill.id) ?? 0;
    const unlocked = isSkillUnlocked(skill, slot, state);
    if (!unlocked)
        row.classList.add('opacity-50');
    const icon = document.createElement('img');
    icon.className = 'skill-icon';
    icon.width = 32;
    icon.height = 32;
    icon.alt = '';
    if (skill.icon && versionName)
        icon.src = `data/icons/${versionName}/${skill.icon}`;
    const name = document.createElement('span');
    name.className = 'flex-grow-1';
    name.textContent = skill.name;
    const hasContent = skill.description || (skill.stats && skill.stats.length > 0);
    if (hasContent) {
        const tooltipContent = skillTooltipContent(skill, rank);
        name.setAttribute('data-bs-toggle', 'popover');
        name.setAttribute('data-bs-trigger', 'hover focus');
        name.setAttribute('data-bs-placement', 'top');
        name.setAttribute('data-bs-title', skill.name);
        name.setAttribute('data-bs-content', tooltipContent);
        name.style.cursor = 'help';
    }
    const count = document.createElement('span');
    count.className = 'badge bg-secondary';
    count.textContent = `${rank}/${skill.maxRank}`;
    const reason = !unlocked ? lockReason(skill, slot, state) : '';
    if (reason)
        name.textContent = `${skill.name} (${reason})`;
    const plusDisabled = !unlocked || rank >= skill.maxRank || over;
    const minusDisabled = rank <= 0;
    const plus = mkBtn('+', () => cb.onSkillDelta(skill.id, slot, 1), plusDisabled);
    const minus = mkBtn('-', () => cb.onSkillDelta(skill.id, slot, -1), minusDisabled);
    row.append(icon, name, count, plus, minus);
    return row;
}
function lockReason(skill, slot, state) {
    const minBar = Math.max(1, skill.prereqBar);
    if (state.masteryBar[slot] < minBar) {
        return `needs bar ${minBar}`;
    }
    if (skill.parent !== null) {
        const pr = state.allocations.get(skill.parent) ?? 0;
        if (pr < skill.parentMinRank)
            return `needs parent rank ${skill.parentMinRank}`;
    }
    return '';
}
function mkBtn(label, handler, disabled) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-sm btn-outline-primary';
    b.textContent = label;
    b.disabled = disabled;
    b.addEventListener('click', handler);
    return b;
}
//# sourceMappingURL=render.js.map