import type { BonusCategory } from './bonuses.js';

let expanded = true;

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
  return String(value);
}

function stripPrefix(label: string): string {
  if (label.startsWith('+% ')) return label.slice(3);
  if (label.startsWith('+ ')) return label.slice(2);
  if (label.startsWith('% ')) return label.slice(2);
  return label;
}
