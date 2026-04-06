import { isSkillUnlocked } from './rules.js';
export function renderMasteryPanel(container, slot, mastery, state, over, cb, versionName, data) {
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
    // mastery bar — Bootstrap progress bar
    const barSection = document.createElement('div');
    barSection.className = 'mastery-bar-section d-flex align-items-center gap-2';
    const barMinus = mkBtn('-', () => cb.onBarDelta(slot, -1), state.masteryBar[slot] <= 0);
    const barLabel = document.createElement('span');
    barLabel.className = 'small fw-bold';
    barLabel.textContent = `${state.masteryBar[slot]}/${mastery.barMaxRank}`;
    const barOuter = document.createElement('div');
    barOuter.className = 'progress flex-grow-1';
    barOuter.style.height = '14px';
    const barInner = document.createElement('div');
    barInner.className = 'progress-bar';
    barInner.style.width = `${(state.masteryBar[slot] / mastery.barMaxRank) * 100}%`;
    barOuter.appendChild(barInner);
    const barPlus = mkBtn('+', () => cb.onBarDelta(slot, 1), state.masteryBar[slot] >= mastery.barMaxRank || over);
    barSection.append(barMinus, barLabel, barOuter, barPlus);
    container.appendChild(barSection);
    // skill grid — group by prereqBar, position columns proportionally along the bar
    const barMax = mastery.barMaxRank;
    const byPrereq = new Map();
    for (const skill of mastery.skills) {
        const pb = Math.max(1, skill.prereqBar);
        const list = byPrereq.get(pb) ?? [];
        list.push(skill);
        byPrereq.set(pb, list);
    }
    const tiers = Array.from(byPrereq.keys()).sort((a, b) => a - b);
    const maxStack = Math.max(...Array.from(byPrereq.values()).map(v => v.length));
    const grid = document.createElement('div');
    grid.className = 'skill-grid';
    grid.style.height = `${maxStack * 56 + 4}px`;
    for (const tier of tiers) {
        const skills = byPrereq.get(tier);
        const col = document.createElement('div');
        col.className = 'skill-tier-col';
        col.style.left = `${(tier / barMax) * 100}%`;
        for (const skill of skills) {
            const cell = renderSkillCell(skill, slot, state, over, cb, versionName, data);
            col.appendChild(cell);
        }
        grid.appendChild(col);
    }
    container.appendChild(grid);
    // initialize Bootstrap popovers on newly rendered skill icons
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
function renderSkillCell(skill, slot, state, over, cb, versionName, data) {
    const cell = document.createElement('div');
    cell.className = 'skill-cell';
    cell.dataset.skillId = skill.id;
    const rank = state.allocations.get(skill.id) ?? 0;
    const unlocked = isSkillUnlocked(skill, slot, state, data);
    const isModifier = skill.parent !== null;
    // choose border texture
    let borderFile;
    if (!unlocked) {
        borderFile = isModifier ? 'skills_buttonborderroundgrayout01.png' : 'skills_buttonbordergrayout01.png';
    }
    else if (rank > 0) {
        borderFile = isModifier ? 'skills_buttonborderroundgold01.png' : 'skills_buttonbordergold01.png';
    }
    else {
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
    if (skill.icon && versionName)
        icon.src = `data/icons/${versionName}/${skill.icon}`;
    // popover on the icon
    const hasContent = skill.description || (skill.stats && skill.stats.length > 0);
    if (hasContent) {
        const tooltipContent = skillTooltipContent(skill, rank);
        icon.setAttribute('data-bs-toggle', 'popover');
        icon.setAttribute('data-bs-trigger', 'hover focus');
        icon.setAttribute('data-bs-placement', 'top');
        icon.setAttribute('data-bs-title', skill.name);
        icon.setAttribute('data-bs-content', tooltipContent);
        icon.style.cursor = 'help';
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
    if (!unlocked)
        cell.classList.add('opacity-50');
    cell.append(border, icon, rankLabel, controls);
    return cell;
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