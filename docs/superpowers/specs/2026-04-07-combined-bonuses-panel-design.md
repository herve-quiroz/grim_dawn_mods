# Combined bonuses panel

A collapsible panel that aggregates all passive skill bonuses and devotion node stats into a single grouped summary.

## Placement and behavior

* Full-width collapsible panel between the controls bar and the mastery panels
* Collapsed by default, showing a header: "Combined Bonuses (N)" where N is the total number of distinct stats
* Click the header to expand/collapse
* Only visible when at least one passive skill or devotion node is allocated
* Collapsed/expanded state is a UI preference, not persisted in the URL hash

## What gets aggregated

### Mastery passives

A skill qualifies as a "true passive" when all of the following hold:

* `parent === null` (standalone skill, not a modifier)
* `exclusive === false` (not an exclusive toggle)
* None of these labels appear in `skill.stats`: `Energy Cost`, `Energy Reserved`, `Skill Recharge`, `Duration`, `% Weapon Damage`, `Meter Radius`

For each qualifying skill that the user has allocated points to, read `skill.stats[i].values[rank - 1]` where `rank` is the allocated rank from `state.allocations`.

### Devotion stat nodes

For each allocated devotion node (from `devState.allocatedNodes`) where `node.skill === null`, read `node.stats[i].value` (parsed as a number).

### Merging

Bonuses with identical `label` strings are summed into a single total. For example, `"+% Physical Damage"` from Decorated Soldier (64 at rank 8) + a devotion node (15) = `+79% Physical Damage`.

Note: skill labels and devotion labels use slightly different naming conventions for some stats (e.g. `"+ Health Regen per Second"` vs `"+ Health Regeneration"`). These are treated as separate entries since they represent different bonus types in-game.

## Stat categories

Stats are grouped into categories based on label pattern matching. Categories appear in this order, and each category only appears if it has at least one stat.

| Category | Label patterns |
|----------|---------------|
| Attributes | Labels containing `Physique`, `Cunning`, `Spirit`, `Constitution` (flat or %) |
| Offense | `Offensive Ability`, `Attack Speed`, `Casting Speed`, `Crit Damage`, `Total Damage`, `Movement Speed` |
| Damage | Damage type keywords: `Physical`, `Fire`, `Cold`, `Lightning`, `Aether`, `Chaos`, `Vitality`, `Bleeding`, `Pierce`, `Poison`, `Acid`, `Burn`, `Frostburn`, `Electrocute`, `Internal Trauma`, `Life Damage`, `Life Decay`, `Retaliation`. Includes both flat and percentage forms. |
| Defense | `Defensive Ability`, `Armor` (flat/%), `Armor Absorption`, `Block Chance`, `Block Recovery`, `Armor Requirement` |
| Health and energy | `Health` (flat/%), `Health Regen`, `Health Regeneration`, `Energy` (flat), `Energy Regen`, `Constitution` |
| Resistances | Any label matching `+% * Resistance` |
| Other | Any stat that does not match the above categories |

Within each category, stats are sorted alphabetically by label.

## Rendering

* Multi-column grid: 3 columns on wide viewports, 2 on medium, 1 on narrow
* Category headers as small uppercase labels (same style as existing UI labels)
* Each stat line: `<value> <label-without-prefix>` (e.g. "+64% Physical Damage")
* The `+`/`+%` prefix is part of the value display, derived from the label prefix
* Collapsed header: "Combined Bonuses (N)" with a toggle arrow character

## Labels to exclude

Some stat labels from passive skills are mechanical, not character bonuses. Exclude these from the panel:

* `Projectiles`
* `Target Maximum`
* Labels ending in `Duration` (e.g. `Reduced Total Speed Duration`, `Poison Damage Duration`, `Internal Trauma Duration`). These are duration qualifiers for other stats, not standalone bonuses.
* `Knockdown Chance`, `Knockdown Duration` (proc mechanics on passives like Soulfire)

## New files

* `src/bonuses.ts`: aggregation logic (classify passive skills, collect bonuses, merge by label, categorize)
* `src/bonuses-render.ts`: render the collapsible panel DOM

## Integration points

* `main.ts`: import and call `renderBonusesPanel()` inside the main `render()` function
* `index.html`: add a `<div id="bonuses-panel">` between the controls bar and mastery panel containers
* `css/style.css`: styles for the bonuses panel, category headers, grid layout, collapsed/expanded states
