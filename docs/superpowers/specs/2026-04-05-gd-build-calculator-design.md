# Grim Dawn build calculator design

**Date:** 2026-04-05
**Status:** Design approved, pending implementation plan

## Overview

A client-side, single-page Grim Dawn build calculator modeled on
grimtools.com/calc/ but scoped to class skills only. Hosted on GitHub Pages
from this repo. All build state lives in the URL hash, so sharing a build is
sharing the current URL — no server, no storage.

## Goals and scope

In scope for v1:

* Two masteries (user picks any 2 of the 9 base-game classes).
* Mastery bar ranks for both selected masteries.
* Class skills with prerequisites (mastery bar level, parent skill rank).
* Modifier skills under their parent skills.
* Full rule simulation: locked skills, point budget, cascade refunds.
* Character-level or raw point-budget input.
* Search across skill names and descriptions, with live highlight/dim.
* URL-encoded build state, canonicalized so equivalent builds share a URL.
* Share button that copies the current URL to clipboard.
* Skill icons extracted from game data.

Out of scope for v1 (listed to prevent creep):

* Devotion constellation.
* Item-granted skills.
* Per-rank stat tables in tooltips (descriptions only, not rank-by-rank stats).
* Damage/DPS calculation.
* Saving multiple builds.
* Dark mode.
* Mobile-optimized layout beyond basic Bootstrap responsiveness.
* Version migration (upgrading an old URL to a newer GD version).

Data source: vanilla game data only (this mod's overrides are unrelated to
core skill structure).

## Tech stack

* TypeScript compiled with plain `tsc` (no bundler). Source in `src/`,
  compiled output in `js/` committed to the repo so GitHub Pages serves
  static files directly. One `tsconfig.json`, `npm run build`.
* Bootstrap 5 via CDN for components (dropdowns, modal, tooltip, toast,
  grid). Chosen over Bulma/Tailwind/Pico because the UI needs all those
  components with good defaults and Bootstrap ships them without a build
  integration.
* No framework. Vanilla TypeScript + DOM manipulation.
* Node-native `node --test` for unit tests, no test framework dep.

Local dev: `python3 -m http.server 8000` inside WSL, Windows browser hits
`http://localhost:8000/tools/calc/`. WSL2 localhost forwarding confirmed
working.

## Repository layout

```
tools/calc/
  index.html
  css/style.css              # overrides on top of Bootstrap CDN
  src/                       # TypeScript source
    main.ts                  # bootstrap, event wiring
    state.ts                 # BuildState + URL encode/decode
    rules.ts                 # prereqs, budget, cascade logic
    search.ts                # text search + highlight
    render.ts                # DOM rendering of mastery panels
    types.ts
  js/                        # compiled output (committed)
  data/
    versions.json            # append-only list of known GD versions
    skills/
      skills-1.2.1.5.json    # self-contained snapshot per version
    icons/
      1.2.1.5/               # icons per version
  tsconfig.json
  package.json
extract_skills.py            # one-time extractor at repo root
```

## Data pipeline

`extract_skills.py` is run once per GD version, produces per-version
snapshots.

Steps:

1. Use `extract_arz.py` on `database.arz` for DBR records.
2. Use `extract_arc.py` on `Text_EN.arc` for tag → string lookups.
3. For each of the 9 masteries (Soldier, Demolitionist, Occultist,
   Nightblade, Arcanist, Shaman, Inquisitor, Necromancer, Oathkeeper),
   walk the skill tree DBRs and collect id, name, description, max rank,
   UI grid position, prereq mastery-bar level, parent skill (for
   modifiers), parent rank required, icon path.
4. Extract and convert `.tex` icons to PNG (strip GD 12-byte wrapper → DDS →
   PNG via Pillow or a small DDS decoder).
5. Pull the skill-point-per-level formula and quest reward totals from
   `playerlevels.dbr` (or equivalent).
6. Emit `tools/calc/data/skills/skills-<version>.json`.
7. Append the version string to `versions.json` if new.

CLI: `python3 extract_skills.py --version 1.2.1.6`.

Each run produces a fresh, clean file with natural ordering. No append-only
constraint on skills within a version (versioning handles that).

### skills-<version>.json schema

```json
{
  "gdVersion": "1.2.1.5",
  "pointsPerLevel": [0, 3, 3, 3, ...],
  "questRewardPoints": 18,
  "masteries": [
    {
      "id": 1,
      "name": "Soldier",
      "barMaxRank": 50,
      "skills": [
        {
          "id": "soldier.blade_arc",
          "name": "Blade Arc",
          "description": "A sweeping melee attack...",
          "icon": "soldier.blade_arc.png",
          "maxRank": 16,
          "ui": {"row": 0, "col": 0},
          "prereqBar": 1,
          "parent": null,
          "parentMinRank": 0
        }
      ]
    }
  ]
}
```

### versions.json schema

```json
{
  "versions": ["1.2.1.5", "1.2.1.6"],
  "latest": 1
}
```

Append-only. The index into `versions` is the stable version id stored in
URLs forever.

### Known data-pipeline risks

* `.tex` → PNG conversion is the one novel piece of Python tooling. Small
  scope (known format), but worth a prototype early.
* Skill UI grid positions may not be cleanly in DBRs — fallback is
  hand-authored position maps per mastery (one-time effort).

## UI layout

Single page, top to bottom:

```
┌─────────────────────────────────────────────────────────────┐
│  Header bar                                                 │
│  [Mastery A ▾] [Mastery B ▾]  Level [__]  Points [__/250]   │
│  Quest rewards [x]  Built for GD 1.2.1.5                    │
│  Search: [_________________]        Reset  Share            │
├──────────────────────────────┬──────────────────────────────┤
│  MASTERY A panel             │  MASTERY B panel             │
│  bar 32/50  [+][-]           │  bar 28/50  [+][-]           │
│                              │                              │
│  [icon] Blade Arc    5/16    │  [icon] Fire Strike  12/16   │
│   +  -                       │   +  -                       │
│  [icon] Laceration   3/10    │  ...                         │
│   +  -  (greyed: needs bar   │                              │
│          5 and parent rank 1)│                              │
└──────────────────────────────┴──────────────────────────────┘
```

### Key interactions

* **Mastery dropdowns:** Bootstrap selects, each hides the other's
  selection. Changing a dropdown with points already allocated shows a
  confirmation modal; on confirm, all points in the removed mastery are
  refunded and the mastery swaps.
* **Level and Points inputs coexist:**
  * Both empty → level = 100, points = level formula + quest rewards.
  * Only level → points derived from formula.
  * Only points → level displays "—".
  * Both set → points override; visual warning if they mismatch the level
    formula.
* **Quest rewards checkbox** in header, defaults on, affects budget formula.
* **Skill rows** show icon, name, current/max rank, `+`/`–` buttons.
  Locked skills render greyed with prereq text explaining why.
* **`+` button disabled** when: skill locked, at max, or would exceed
  budget.
* **`–` button disabled** when: at 0.
* **Left-click / right-click on skill icon** may optionally mirror `+`/`–`
  as a desktop accelerator. Not blocking v1; visible buttons remain the
  primary UX for parity with touch.
* **Hover tooltip** on skill name shows full description (Bootstrap
  tooltip).
* **Points counter** turns red when over budget.
* **Reset button** clears all allocations but keeps mastery selections,
  level, points, and quest-rewards settings.
* **Share button:** copies `window.location.href` to clipboard via
  `navigator.clipboard.writeText`. Label swaps to "Link copied!" for
  ~2 seconds, button disabled during the swap. Fallback to a selectable
  toast when clipboard API unavailable.

### Responsive

Two columns on desktop, stacks to one on narrow screens via Bootstrap grid.

### Skill layout within a panel

Grid from `ui.{row,col}`. Modifier skills render under their parent with an
indent and a connector line.

## State model

```ts
interface BuildState {
  masteries: [number | null, number | null]; // slots A, B — user's display order
  level: number | null;                       // 1-100, null = default (100)
  customPoints: number | null;                // null = derive from level
  questRewards: boolean;
  allocations: Map<string, number>;           // skillId -> rank
  masteryBar: [number, number];               // bar ranks for slots A, B
}
```

## URL encoding

Build state lives in `location.hash`. Every change recomputes the URL and
calls `history.replaceState` — no history entries per keystroke.

### Canonical form

Mastery slots carry no semantic weight in GD. `[Soldier, Nightblade]` and
`[Nightblade, Soldier]` are the same build. During encoding, masteries are
sorted by id ascending to collapse these into one URL. On decode, slot A =
the lower-id mastery. Allocations need no sorting — each byte's position is
fixed by the skill's index in `skills-<version>.json`.

### Binary layout

```
Byte 0      : version id (index into versions.json, 0-254)
Byte 1      : mastery A id (0 = none, 1-9)       -- canonical (lower id)
Byte 2      : mastery B id (0 = none, 1-9)       -- canonical (higher id)
Byte 3      : character level (0 = unset, 1-100)
Bytes 4-5   : custom points override (uint16, 0xFFFF = unset)
Byte 6      : flags (bit 0 = questRewards)
Byte 7      : mastery A bar rank (0-50)
Byte 8      : mastery B bar rank (0-50)
Bytes 9..N  : packed skill ranks for mastery A, data-file order (1 byte/skill)
Bytes N..M  : packed skill ranks for mastery B, data-file order (1 byte/skill)
```

Two masteries with ~25 skills each ≈ 60 bytes binary → ~80 chars base64url.
Well under browser URL limits.

Encoding: `base64url` (URL-safe alphabet, no padding).

Example:
```
https://<user>.github.io/grim_dawn_mods/tools/calc/#AQIDYgBkADIeAQIDBA...
```

### Loading a URL

1. Parse version id from byte 0.
2. Fetch `data/skills/skills-<versions[id]>.json` lazily.
3. Decode allocations against that version's skill indexing.
4. If allocations exceed current budget, show a banner but do not
   auto-refund — let the user decide.

## Rules engine

### Point budget formula

Loaded from the version snapshot:
```
points at level L = Σ pointsPerLevel[2..L] + (questRewards ? questRewardPoints : 0)
```
GD actual values: 3 pts/level for levels 2-50, 2 pts/level for 51-90,
1 pt/level for 91-100, plus ~18-20 quest reward points.

Effective budget:

* `customPoints` set → use it.
* else `level` set → derive from formula.
* else → level 100 + all quest rewards.

### Prereq rules

* Skill unlocked iff `masteryBarRank >= skill.prereqBar`.
* Modifier skill unlocked iff parent rank `>= parentMinRank` **and**
  mastery bar rank `>= prereqBar`.
* Rank constrained to `[0, maxRank]`.

### Cascade refunds

When pressing `–` on a skill (or mastery bar) would drop it below the
requirement of any currently-allocated dependent:

1. Compute the transitively affected set of dependents.
2. Refund ranks that become invalid, recursively.
3. Show a toast: *"Refunded 4 pts from Laceration, 2 pts from Searing
   Strike"*.

No confirmation modal for cascades — the toast is undo-friendly (user
clicks `+` again). Confirmation is reserved for mastery swap.

## Search

* Input in header, `~100ms` debounce on `input`.
* Match: case-insensitive substring across `name + description`.
  Multi-word input is AND (all terms must appear).
* Non-matches dim to ~25% opacity via a CSS class. Matches keep full
  opacity.
* Count badge next to input: *"12 matches"*.
* `Esc` or clicking `✕` clears.
* Modifiers are searched independently of parents.
* Implementation: precompute flat `[{skillId, searchableText}]` at load,
  toggle one CSS class per skill node per keystroke. Fast even with ~500
  skills.

## Testing

Unit tests (Node-native `node --test`):

* `state.ts`: encode/decode roundtrip; canonical form swaps mastery slots
  when lower-id is in slot B; over-budget URL loads without auto-refund.
* `rules.ts`: budget formula totals for levels 1, 50, 90, 100; quest
  rewards toggle; prereq unlock flips at correct bar level; 3-deep
  cascade refund chain totals; lowering mastery bar cascades.
* `search.ts`: case-insensitive substring match; multi-word AND; empty
  query returns all; match count.

Manual smoke test via local http server against a handful of known builds.
No Playwright for v1.

## Deployment

GitHub Pages serves from `tools/calc/` at
`https://<user>.github.io/grim_dawn_mods/tools/calc/`. Compiled JS is
committed; Pages has nothing to build.

## Open items (not blocking design approval)

* Prototype `.tex` → PNG conversion early to de-risk the icon pipeline.
* Confirm UI grid positions are extractable from DBRs; plan hand-authored
  fallback maps if not.
