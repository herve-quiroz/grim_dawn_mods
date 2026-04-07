# Devotion constellation feature design

## Overview

Add devotion constellation support to the Grim Dawn build calculator. Constellations are rendered as horizontal rows (one per constellation) grouped by tier, with a node graph showing the tree structure. Users allocate devotion points to nodes, which grant passive stat bonuses and occasionally proc skills. The system tracks affinity currency (5 types) that gates which constellations can be unlocked.

## Data source

87 constellation definition files in `records/ui/skills/devotion/constellations/constellation##.dbr` from the game's `database.arz`. Each file contains:
* Name (`FileDescription`)
* Affinity requirements (`affinityRequired1..3`, `affinityRequiredName1..3`)
* Affinity bonuses on completion (`affinityGiven1..3`, `affinityGivenName1..3`)
* Node list (`devotionButton1..8`), each pointing to a skill record path
* Link graph (`devotionLinks2..8`), where the value is the parent node index

Node stat data lives in `records/skills/devotion/tier#_##x.dbr` (passive bonuses) with optional `tier#_##x_skill.dbr` companions for proc skills.

438 total nodes across 87 constellations. Max 8 nodes per constellation (Abomination). Max fan-out from a single node is 4 (Spider, Kraken, Blades of Nadaan, Behemoth).

5 affinities: Ascendant, Chaos, Eldritch, Order, Primordial.

Tier breakdown:
* Crossroads: 5 single-node constellations, no requirements, each gives +1 of one affinity
* Tier 1: 35 constellations, 3-5 nodes, low affinity requirements (1)
* Tier 2: 30 constellations, 5-7 nodes, moderate requirements (5-10)
* Tier 3: 13 constellations, 6-8 nodes, high requirements (15-20), give no affinity back

## Architecture

Separate modules from the existing mastery system. New files only; no modification to existing mastery code except integration points in `main.ts`, `state.ts`, and `index.html`.

### Data extraction

New `extract_devotions.py` script that:
* Reads the 87 constellation `.dbr` files from the extracted game database (skips `constellation87.dbr` which is a UI-only bitmap record with 0 nodes)
* For each constellation: extracts name, affinity requirements, affinity bonuses, node list, link graph
* Determines tier from the first node's path prefix (`tier1_` = tier 1, `tier2_` = tier 2, `tier3_` = tier 3). Crossroads are identified by having exactly 1 node and no affinity requirements.
* For each node: reads the corresponding passive skill `.dbr` to extract non-zero stat bonuses
* Identifies nodes that grant a proc skill (the `_skill.dbr` companion)
* Resolves display names and descriptions from `Text_EN.arc` tags
* Outputs `tools/calc/data/devotions/devotions-<version>.json`

### JSON schema

```json
{
  "gdVersion": "1.2.1.5",
  "affinities": ["Ascendant", "Chaos", "Eldritch", "Order", "Primordial"],
  "constellations": [
    {
      "id": "bat",
      "name": "Bat",
      "tier": 1,
      "requires": [{"affinity": 2, "amount": 1}],
      "bonus": [{"affinity": 0, "amount": 2}, {"affinity": 2, "amount": 3}],
      "nodes": [
        {
          "index": 1,
          "parent": null,
          "stats": [{"label": "Life Leech", "value": "15%"}],
          "skill": null
        },
        {
          "index": 5,
          "parent": 4,
          "stats": [],
          "skill": {"name": "Twin Fangs", "description": "..."}
        }
      ]
    }
  ],
  "crossroads": [
    {"id": "crossroads_ascendant", "affinity": 0},
    {"id": "crossroads_chaos", "affinity": 1},
    {"id": "crossroads_eldritch", "affinity": 2},
    {"id": "crossroads_order", "affinity": 3},
    {"id": "crossroads_primordial", "affinity": 4}
  ]
}
```

Affinities referenced by index into the `affinities` array.

### TypeScript modules

**`devotion-types.ts`**:
* `DevotionNode`: index, parent (index or null), stats array, optional skill (name + description)
* `Constellation`: id, name, tier, requires/bonus (affinity index + amount), nodes array
* `DevotionsData`: gdVersion, affinities string array, constellations array, crossroads array
* `DevotionState`: `Set<string>` of allocated node keys (e.g. `"bat:3"`), `Set<string>` of active crossroads IDs, devotion point cap (number, default 55)

**`devotion-rules.ts`**:
* `isNodeUnlockable(constellation, nodeIndex, state)`: parent node is allocated and constellation affinity requirements are met
* `isConstellationUnlockable(constellation, state)`: current affinity totals meet requirements
* `computeAffinities(state, data)`: sums affinity bonuses from all completed constellations and active crossroads
* `totalDevotionSpent(state)`: count of all allocated nodes + active crossroads
* `applyNodeDelta(state, constellationId, nodeIndex, delta, data)`: allocate or deallocate with cascade refunds if removing a parent node
* `toggleConstellationAll(state, constellationId, data)`: if incomplete, fill all nodes; if complete, clear all nodes (checkmark toggle)

**`devotion-render.ts`**:
* `renderDevotionPanel(container, state, data, callbacks)`: full devotion section DOM generation
* Tier headers separating Crossroads, Tier 1, Tier 2, Tier 3
* Crossroads rendered as a compact row with 5 toggleable affinity buttons
* Each constellation row: checkmark | name | affinity info (stacked requires/bonus) | node graph
* Node graph uses fixed-width columns (36px) with horizontal links and branch arms for fan-out
* Bootstrap popovers on nodes for stat tooltips (hover trigger on desktop)
* Click handlers: left-click allocates, right-click deallocates, checkmark toggles all

## UI layout

### Devotion section placement

Full-width section below the two mastery panels.

### Constellation row structure

Each row contains, left to right:
1. **Checkmark**: empty square when incomplete, gold checkmark when all nodes allocated. Clickable to toggle all nodes at once.
2. **Constellation name**: fixed-width label (150px)
3. **Affinity info block** (160px, two stacked lines):
   * `Requires:` followed by colored number chips (color indicates affinity type, no text labels)
   * `Bonus:` followed by `+N` colored chips, or `none` for tier 3
4. **Node graph**: fixed-width columns, horizontal links between sequential nodes, vertical branch arms for fan-out from a single parent

### Node rendering

* Circle (24px) with node index number
* Unallocated: gray border, dark background
* Allocated: gold border, gold-tinted background
* Skill-granting nodes: dashed border when unallocated, solid when allocated

### Grouping and sorting

* Crossroads section first (own header)
* Tier 1, Tier 2, Tier 3 sections with headers
* Alphabetical by name within each tier

### Bottom bar additions

Two items added to the existing fixed bottom navbar:
* **Devotion budget**: `Devotion: 43` showing remaining points (same pattern as mastery points display). Turns red when over budget. The cap (default 55) is configurable via an input field.
* **Affinity totals**: `Affinity: 3 2 5 1 4` with each number in its affinity color (blue=Ascendant, red=Chaos, purple=Eldritch, yellow=Order, green=Primordial). Updates live as nodes are allocated/deallocated.

### Desktop interaction

* Left-click a node to allocate a point (if unlockable and budget allows)
* Right-click a node to deallocate (cascades refunds to dependent children)
* Click checkmark to fill all nodes or clear all nodes
* Hover on nodes shows tooltip with stat bonuses and proc skill info

### Mobile interaction

Deferred to a later pass. Mobile users see the layout but cannot interact with nodes.

## URL state encoding

Devotion bytes appended after the existing mastery state:

```
[existing mastery bytes] [devotion bytes]
```

Devotion encoding (90 bytes):
* 2 bytes: devotion point cap (uint16, 0xFFFF = default 55)
* 1 byte: crossroads bitmask (bit 0 = Ascendant, bit 1 = Chaos, bit 2 = Eldritch, bit 3 = Order, bit 4 = Primordial)
* 87 bytes: one byte per constellation (in fixed order matching JSON array), each bit represents a node (bit 0 = node 1, bit 1 = node 2, etc.)

**Backward compatibility**: if URL hash is shorter than expected (no devotion bytes), decode returns default empty devotion state. Old URLs keep working.

**Optimization**: devotion bytes are only appended when at least one devotion point is allocated, keeping mastery-only URLs unchanged.

## Search integration

Devotion node names, stat labels, and proc skill names are included in the search index. Search highlights matching constellation rows with the same `search-hit`/`search-miss` CSS classes used for mastery skills.

## Affinity color mapping

| Affinity | Color | Hex |
|----------|-------|-----|
| Ascendant | Blue | #64b4ff |
| Chaos | Red | #ff5050 |
| Eldritch | Purple | #b464ff |
| Order | Yellow | #ffc832 |
| Primordial | Green | #64dca0 |

## Out of scope

* Mobile interaction for devotion nodes
* Node icons (circles with index numbers for now)
* Pet bonus nodes (`_petbonus.dbr` files)
* Filtering constellations by affinity type
