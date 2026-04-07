import type { SkillsData } from './types.js';
import type { DevotionsData } from './devotion-types.js';

export interface SearchEntry {
  skillId: string;
  text: string;
}

export type SearchIndex = SearchEntry[];

export function buildSearchIndex(data: SkillsData): SearchIndex {
  const out: SearchIndex = [];
  for (const m of data.masteries) {
    for (const s of m.skills) {
      const statText = (s.stats || []).map(st => st.label).join(' ');
      out.push({
        skillId: s.id,
        text: (s.name + ' ' + s.description + ' ' + statText).toLowerCase(),
      });
    }
  }
  return out;
}

export function buildDevotionSearchIndex(data: DevotionsData): SearchEntry[] {
  const entries: SearchEntry[] = [];
  for (const c of data.constellations) {
    const parts = [c.name];
    for (const node of c.nodes) {
      for (const stat of node.stats) {
        parts.push(stat.label);
      }
      if (node.skill) {
        parts.push(node.skill.name);
        if (node.skill.description) parts.push(node.skill.description);
      }
    }
    entries.push({ skillId: `devotion:${c.id}`, text: parts.join(' ').toLowerCase() });
  }
  return entries;
}

/**
 * Given a query, return the set of matching skill ids. An empty query returns
 * an empty set, which callers interpret as "no filter active".
 */
export function matchQuery(query: string, index: SearchIndex): Set<string> {
  const q = query.trim().toLowerCase();
  if (q === '') return new Set();
  const terms = q.split(/\s+/);
  const out = new Set<string>();
  for (const entry of index) {
    let all = true;
    for (const t of terms) {
      if (!entry.text.includes(t)) { all = false; break; }
    }
    if (all) out.add(entry.skillId);
  }
  return out;
}
