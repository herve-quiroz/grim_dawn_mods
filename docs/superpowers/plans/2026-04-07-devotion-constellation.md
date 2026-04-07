# Devotion constellation implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add devotion constellation support to the Grim Dawn build calculator with data extraction, rules engine, URL serialization, and row-based UI rendering.

**Architecture:** Separate modules from existing mastery code. A new Python extraction script produces `devotions-<version>.json`. Three new TypeScript modules (`devotion-types.ts`, `devotion-rules.ts`, `devotion-render.ts`) handle types, business logic, and DOM rendering. Integration touches `main.ts`, `state.ts`, `index.html`, and `style.css`.

**Tech Stack:** Python 3 (extraction), TypeScript (calculator), Bootstrap 5 (UI), Node test runner (tests)

**Spec:** `docs/superpowers/specs/2026-04-07-devotion-constellation-design.md`

---

### Task 1: Data extraction script

**Files:**
- Create: `extract_devotions.py`

This script reads game files and produces `tools/calc/data/devotions/devotions-<version>.json`. It reuses `read_dbr()`, `extract_arz_to()`, `extract_text_to()`, and `extract_skill_stats()` patterns from `extract_skills.py`.

- [ ] **Step 1: Create `extract_devotions.py` with CLI and extraction skeleton**

```python
#!/usr/bin/env python3
"""Extract Grim Dawn devotion constellation data into a per-version JSON snapshot.

Usage:
    python3 extract_devotions.py --version 1.2.1.5
    python3 extract_devotions.py --version 1.2.1.5 --keep /tmp/gd_extract
"""
import argparse
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).parent
GAME_ROOT = Path("/mnt/c/Program Files (x86)/Steam/steamapps/common/Grim Dawn")
DATABASE_ARZ = GAME_ROOT / "database" / "database.arz"
TEXT_ARCS = [
    GAME_ROOT / "resources" / "Text_EN.arc",
    GAME_ROOT / "gdx1" / "resources" / "Text_EN.arc",
    GAME_ROOT / "gdx2" / "resources" / "Text_EN.arc",
]

CONSTELLATION_DIR = "records/ui/skills/devotion/constellations"
DEVOTION_SKILL_DIR = "records/skills/devotion"

# Affinity name to index mapping (alphabetical order matching spec).
AFFINITY_INDEX = {
    "Ascendant": 0,
    "Chaos": 1,
    "Eldritch": 2,
    "Order": 3,
    "Primordial": 4,
}


def extract_arz_to(tmp: Path) -> Path:
    out = tmp / "arz"
    if out.exists() and any(out.iterdir()):
        print(f"Reusing existing ARZ at {out}", file=sys.stderr)
        return out
    out.mkdir(exist_ok=True)
    subprocess.run(
        ["python3", str(REPO_ROOT / "extract_arz.py"), str(DATABASE_ARZ), str(out)],
        check=True,
    )
    return out


def extract_text_to(tmp: Path) -> dict[str, str]:
    base = tmp / "text"
    tags: dict[str, str] = {}
    already_extracted = base.exists() and any(base.iterdir())
    if already_extracted:
        print(f"Reusing existing text at {base}", file=sys.stderr)
    base.mkdir(exist_ok=True)
    for i, arc in enumerate(TEXT_ARCS):
        if not arc.exists():
            continue
        out = base / f"arc{i}"
        if not already_extracted:
            out.mkdir(exist_ok=True)
            subprocess.run(
                ["python3", str(REPO_ROOT / "extract_arc.py"), str(arc), str(out)],
                check=True,
            )
        for txt in out.rglob("*.txt"):
            for line in txt.read_text(encoding="utf-8", errors="replace").splitlines():
                if "=" in line:
                    k, _, v = line.partition("=")
                    tags[k.strip()] = v.strip()
    return tags


def read_dbr(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        if "," in line:
            k, _, rest = line.partition(",")
            v, _, _ = rest.partition(",")
            out[k] = v
    return out


def resolve_text(value: str, tags: dict[str, str]) -> str:
    if not value:
        return ""
    if value in tags:
        return tags[value]
    lower = value.lower()
    for k, v in tags.items():
        if k.lower() == lower:
            return v
    return value


def _parse_values(raw: str) -> list[float]:
    parts = raw.split(";")
    result: list[float] = []
    for p in parts:
        p = p.strip()
        if not p:
            continue
        try:
            result.append(float(p))
        except ValueError:
            pass
    return result


def extract_node_stats(dbr_data: dict[str, str]) -> list[dict]:
    """Extract non-zero stat bonuses from a devotion node DBR.

    Returns a list of {"label": str, "value": str} for display.
    Devotion nodes have maxRank=1 so we take the first value only.
    """
    # Reuse the stat extraction logic from extract_skills.py but simplified:
    # devotion nodes have single values (rank 1 only), not multi-rank arrays.
    stats: list[dict] = []

    def add(label: str, value: str) -> None:
        stats.append({"label": label, "value": value})

    def get_first(key: str) -> float | None:
        raw = dbr_data.get(key, "")
        if not raw or raw == "0":
            return None
        vals = _parse_values(raw)
        if vals and vals[0] != 0:
            return vals[0]
        return None

    def fmt(v: float) -> str:
        if abs(v - round(v)) < 1e-9:
            return str(int(round(v)))
        return str(round(v, 4))

    # Character stats
    char_stats = {
        "characterStrength": "+ Physique",
        "characterDexterity": "+ Cunning",
        "characterIntelligence": "+ Spirit",
        "characterConstitution": "+ Constitution",
        "characterLife": "+ Health",
        "characterMana": "+ Energy",
        "characterLifeRegen": "+ Health Regeneration",
        "characterManaRegen": "+ Energy Regeneration",
        "characterOffensiveAbility": "+ Offensive Ability",
        "characterDefensiveAbility": "+ Defensive Ability",
        "characterAttackSpeed": "+% Attack Speed",
        "characterSpellCastSpeed": "+% Casting Speed",
        "characterRunSpeed": "+% Movement Speed",
        "characterTotalSpeed": "+% Total Speed",
    }
    for key, label in char_stats.items():
        v = get_first(key)
        if v is not None:
            add(label, fmt(v))

    # Damage modifiers
    damage_mods = {
        "offensivePhysicalModifier": "+% Physical Damage",
        "offensiveFireModifier": "+% Fire Damage",
        "offensiveColdModifier": "+% Cold Damage",
        "offensiveLightningModifier": "+% Lightning Damage",
        "offensiveAetherModifier": "+% Aether Damage",
        "offensiveChaosModifier": "+% Chaos Damage",
        "offensivePierceModifier": "+% Pierce Damage",
        "offensiveElementalModifier": "+% Elemental Damage",
        "offensiveLifeModifier": "+% Vitality Damage",
        "offensivePoisonModifier": "+% Acid Damage",
    }
    for key, label in damage_mods.items():
        v = get_first(key)
        if v is not None:
            add(label, fmt(v))

    # DoT modifiers
    dot_mods = {
        "offensiveSlowBleedingModifier": "+% Bleeding Damage",
        "offensiveSlowFireModifier": "+% Burn Damage",
        "offensiveSlowColdModifier": "+% Frostburn Damage",
        "offensiveSlowLightningModifier": "+% Electrocute Damage",
        "offensiveSlowPoisonModifier": "+% Poison Damage",
        "offensiveSlowLifeModifier": "+% Vitality Decay",
    }
    for key, label in dot_mods.items():
        v = get_first(key)
        if v is not None:
            add(label, fmt(v))

    # Defensive / resistance
    resist_types = {
        "defensiveFire": "+% Fire Resistance",
        "defensiveCold": "+% Cold Resistance",
        "defensiveLightning": "+% Lightning Resistance",
        "defensivePoison": "+% Poison & Acid Resistance",
        "defensiveAether": "+% Aether Resistance",
        "defensiveChaos": "+% Chaos Resistance",
        "defensivePierce": "+% Pierce Resistance",
        "defensiveElemental": "+% Elemental Resistance",
        "defensiveBleeding": "+% Bleeding Resistance",
        "defensiveLife": "+% Vitality Resistance",
    }
    for key, label in resist_types.items():
        v = get_first(key)
        if v is not None:
            add(label, fmt(v))

    # Armor
    for key, label in [("characterArmor", "+ Armor"), ("characterArmorModifier", "+% Armor")]:
        v = get_first(key)
        if v is not None:
            add(label, fmt(v))

    # Critical damage
    v = get_first("offensiveCritDamageModifier")
    if v is not None:
        add("+% Crit Damage", fmt(v))

    stats.sort(key=lambda s: s["label"])
    return stats


def extract_constellation(
    arz_dir: Path, constellation_path: Path, tags: dict[str, str]
) -> dict | None:
    """Parse one constellation DBR and its node skill DBRs."""
    data = read_dbr(constellation_path)
    name = data.get("FileDescription", "")

    # Collect devotionButton entries
    buttons: list[tuple[int, str]] = []
    for key, val in data.items():
        m = re.match(r"devotionButton(\d+)", key)
        if m and val:
            buttons.append((int(m.group(1)), val))
    buttons.sort(key=lambda x: x[0])

    if not buttons:
        return None  # Skip bitmap-only records (e.g. constellation87)

    # Collect link graph (parent of each node)
    links: dict[int, int] = {}
    for key, val in data.items():
        m = re.match(r"devotionLinks(\d+)", key)
        if m and val:
            links[int(m.group(1))] = int(val)

    # Determine tier from first button path
    first_btn_path = buttons[0][1]
    tier_match = re.search(r"tier(\d+)_", first_btn_path)
    tier = int(tier_match.group(1)) if tier_match else 0

    # Affinity requirements
    requires: list[dict] = []
    for i in range(1, 4):
        amount_str = data.get(f"affinityRequired{i}", "0")
        name_str = data.get(f"affinityRequiredName{i}", "")
        amount = int(amount_str) if amount_str else 0
        if amount > 0 and name_str in AFFINITY_INDEX:
            requires.append({"affinity": AFFINITY_INDEX[name_str], "amount": amount})

    # Affinity bonuses
    bonus: list[dict] = []
    for i in range(1, 4):
        amount_str = data.get(f"affinityGiven{i}", "0")
        name_str = data.get(f"affinityGivenName{i}", "")
        amount = int(amount_str) if amount_str else 0
        if amount > 0 and name_str in AFFINITY_INDEX:
            bonus.append({"affinity": AFFINITY_INDEX[name_str], "amount": amount})

    # Determine if crossroads (1 node, no requirements)
    is_crossroads = len(buttons) == 1 and not requires

    # Build constellation ID from name
    cid = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")

    # Resolve display name from tag
    display_tag = data.get("constellationDisplayTag", "")
    display_name = resolve_text(display_tag, tags) if display_tag else name

    # Parse nodes
    nodes: list[dict] = []
    for idx, btn_path in buttons:
        # The UI button record points to the actual skill record via skillName
        ui_btn_path = arz_dir / btn_path
        if not ui_btn_path.exists():
            continue
        ui_data = read_dbr(ui_btn_path)
        skill_record_path = ui_data.get("skillName", "")
        if not skill_record_path:
            continue

        # Read the actual skill passive DBR for stats
        skill_dbr_path = arz_dir / skill_record_path
        node_stats: list[dict] = []
        if skill_dbr_path.exists():
            skill_data = read_dbr(skill_dbr_path)
            node_stats = extract_node_stats(skill_data)

        # Check for companion proc skill (_skill.dbr)
        # The skill record path for proc nodes ends in _skill.dbr
        skill_info = None
        if "_skill" in skill_record_path:
            # This IS a proc skill node; extract its display info
            if skill_dbr_path.exists():
                skill_data = read_dbr(skill_dbr_path)
                skill_display_tag = skill_data.get("skillDisplayName", "")
                skill_desc_tag = skill_data.get("skillBaseDescription", "")
                skill_info = {
                    "name": resolve_text(skill_display_tag, tags) if skill_display_tag else "",
                    "description": resolve_text(skill_desc_tag, tags) if skill_desc_tag else "",
                }
        else:
            # Check if there is a sibling _skill.dbr file
            base_name = Path(skill_record_path).stem
            skill_variant = Path(skill_record_path).parent / f"{base_name}_skill.dbr"
            skill_variant_path = arz_dir / str(skill_variant)
            if skill_variant_path.exists():
                proc_data = read_dbr(skill_variant_path)
                skill_display_tag = proc_data.get("skillDisplayName", "")
                skill_desc_tag = proc_data.get("skillBaseDescription", "")
                if skill_display_tag:
                    skill_info = {
                        "name": resolve_text(skill_display_tag, tags),
                        "description": resolve_text(skill_desc_tag, tags) if skill_desc_tag else "",
                    }

        parent = links.get(idx)
        nodes.append({
            "index": idx,
            "parent": parent if parent else None,
            "stats": node_stats,
            "skill": skill_info,
        })

    return {
        "id": cid,
        "name": display_name,
        "tier": tier,
        "requires": requires,
        "bonus": bonus,
        "nodes": nodes,
        "_is_crossroads": is_crossroads,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract devotion data")
    parser.add_argument("--version", required=True)
    parser.add_argument("--keep", type=Path, default=None)
    args = parser.parse_args()

    tmp_ctx = tempfile.TemporaryDirectory() if args.keep is None else None
    tmp = args.keep if args.keep else Path(tmp_ctx.__enter__())  # type: ignore
    tmp.mkdir(exist_ok=True)

    try:
        arz_dir = extract_arz_to(tmp)
        tags = extract_text_to(tmp)

        constellation_dir = arz_dir / CONSTELLATION_DIR
        if not constellation_dir.exists():
            print(f"No constellation dir at {constellation_dir}", file=sys.stderr)
            sys.exit(1)

        constellations: list[dict] = []
        crossroads: list[dict] = []

        for dbr_file in sorted(constellation_dir.glob("constellation[0-9]*.dbr")):
            if "_background" in dbr_file.name:
                continue
            result = extract_constellation(arz_dir, dbr_file, tags)
            if result is None:
                continue
            is_xroads = result.pop("_is_crossroads")
            if is_xroads:
                # Crossroads: single affinity bonus
                affinity_idx = result["bonus"][0]["affinity"] if result["bonus"] else 0
                crossroads.append({"id": result["id"], "affinity": affinity_idx})
            else:
                constellations.append(result)

        # Sort constellations by tier then name
        constellations.sort(key=lambda c: (c["tier"], c["name"]))

        output = {
            "gdVersion": args.version,
            "affinities": ["Ascendant", "Chaos", "Eldritch", "Order", "Primordial"],
            "constellations": constellations,
            "crossroads": crossroads,
        }

        out_dir = REPO_ROOT / "tools" / "calc" / "data" / "devotions"
        out_dir.mkdir(parents=True, exist_ok=True)
        out_file = out_dir / f"devotions-{args.version}.json"
        out_file.write_text(json.dumps(output, indent=2) + "\n")
        print(f"Wrote {len(constellations)} constellations + {len(crossroads)} crossroads to {out_file}")

    finally:
        if tmp_ctx:
            tmp_ctx.cleanup()


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run extraction and verify output**

Run:
```bash
cd /home/hqz/src/grim_dawn_mods
python3 extract_devotions.py --version 1.2.1.5
```

Expected: Prints "Wrote 82 constellations + 5 crossroads to tools/calc/data/devotions/devotions-1.2.1.5.json"

Verify the output:
```bash
python3 -c "
import json
d = json.load(open('tools/calc/data/devotions/devotions-1.2.1.5.json'))
print(f\"Constellations: {len(d['constellations'])}\")
print(f\"Crossroads: {len(d['crossroads'])}\")
# Check a known constellation
bat = next(c for c in d['constellations'] if c['name'] == 'Bat')
print(f\"Bat: {len(bat['nodes'])} nodes, requires={bat['requires']}, bonus={bat['bonus']}\")
print(f\"Bat node 1 stats: {bat['nodes'][0]['stats']}\")
# Check crossroads
print(f\"Crossroads: {[c['id'] for c in d['crossroads']]}\")
"
```

Inspect the output for sanity. Fix any stat extraction issues (field name mappings may need tuning). The extraction script may require iterating on the `extract_node_stats()` function to capture all relevant stat fields from devotion nodes; compare against the game wiki for a few known constellations.

- [ ] **Step 3: Commit**

```bash
git add extract_devotions.py tools/calc/data/devotions/
git commit -m "feat: add devotion constellation data extraction script"
```

---

### Task 2: Devotion types

**Files:**
- Create: `tools/calc/src/devotion-types.ts`

- [ ] **Step 1: Create `devotion-types.ts`**

```typescript
export interface DevotionStat {
  label: string;
  value: string;
}

export interface DevotionSkill {
  name: string;
  description: string;
}

export interface DevotionNode {
  index: number;
  parent: number | null;
  stats: DevotionStat[];
  skill: DevotionSkill | null;
}

export interface AffinityAmount {
  affinity: number;  // index into DevotionsData.affinities
  amount: number;
}

export interface Constellation {
  id: string;
  name: string;
  tier: number;
  requires: AffinityAmount[];
  bonus: AffinityAmount[];
  nodes: DevotionNode[];
}

export interface CrossroadsEntry {
  id: string;
  affinity: number;  // index into DevotionsData.affinities
}

export interface DevotionsData {
  gdVersion: string;
  affinities: string[];
  constellations: Constellation[];
  crossroads: CrossroadsEntry[];
}

export interface DevotionState {
  allocatedNodes: Set<string>;   // "constellationId:nodeIndex"
  crossroads: Set<string>;       // crossroads entry id
  devotionCap: number;           // default 55
}

export function emptyDevotionState(): DevotionState {
  return {
    allocatedNodes: new Set(),
    crossroads: new Set(),
    devotionCap: 55,
  };
}

export function nodeKey(constellationId: string, nodeIndex: number): string {
  return `${constellationId}:${nodeIndex}`;
}
```

- [ ] **Step 2: Verify it compiles**

Run:
```bash
cd /home/hqz/src/grim_dawn_mods/tools/calc && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add tools/calc/src/devotion-types.ts
git commit -m "feat: add devotion type definitions"
```

---

### Task 3: Devotion rules engine

**Files:**
- Create: `tools/calc/src/devotion-rules.ts`
- Create: `tools/calc/src/devotion-rules.test.ts`

- [ ] **Step 1: Write failing tests for `computeAffinities`**

```typescript
import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  computeAffinities,
  totalDevotionSpent,
  isConstellationUnlockable,
  isNodeAllocatable,
  applyNodeDelta,
  toggleConstellationAll,
} from './devotion-rules.js';
import type { DevotionsData, DevotionState, Constellation } from './devotion-types.js';
import { emptyDevotionState, nodeKey } from './devotion-types.js';

// Minimal test data
const testData: DevotionsData = {
  gdVersion: '1.0',
  affinities: ['Ascendant', 'Chaos', 'Eldritch', 'Order', 'Primordial'],
  constellations: [
    {
      id: 'bat',
      name: 'Bat',
      tier: 1,
      requires: [{ affinity: 2, amount: 1 }],           // 1 Eldritch
      bonus: [{ affinity: 1, amount: 2 }, { affinity: 2, amount: 3 }], // +2 Chaos, +3 Eldritch
      nodes: [
        { index: 1, parent: null, stats: [], skill: null },
        { index: 2, parent: 1, stats: [], skill: null },
        { index: 3, parent: 2, stats: [], skill: null },
      ],
    },
    {
      id: 'hawk',
      name: 'Hawk',
      tier: 1,
      requires: [{ affinity: 2, amount: 1 }],           // 1 Eldritch
      bonus: [{ affinity: 2, amount: 3 }],               // +3 Eldritch
      nodes: [
        { index: 1, parent: null, stats: [], skill: null },
        { index: 2, parent: 1, stats: [], skill: null },
        { index: 3, parent: 2, stats: [], skill: null },
      ],
    },
    {
      id: 'branch',
      name: 'Branch',
      tier: 1,
      requires: [],
      bonus: [{ affinity: 0, amount: 1 }],
      nodes: [
        { index: 1, parent: null, stats: [], skill: null },
        { index: 2, parent: 1, stats: [], skill: null },
        { index: 3, parent: 1, stats: [], skill: null },  // branches from 1
      ],
    },
  ],
  crossroads: [
    { id: 'xr_eldritch', affinity: 2 },
    { id: 'xr_chaos', affinity: 1 },
  ],
};

describe('computeAffinities', () => {
  test('empty state returns all zeros', () => {
    const state = emptyDevotionState();
    const aff = computeAffinities(state, testData);
    assert.deepStrictEqual(aff, [0, 0, 0, 0, 0]);
  });

  test('crossroads add affinity', () => {
    const state = emptyDevotionState();
    state.crossroads.add('xr_eldritch');
    const aff = computeAffinities(state, testData);
    assert.deepStrictEqual(aff, [0, 0, 1, 0, 0]);
  });

  test('completed constellation adds bonus', () => {
    const state = emptyDevotionState();
    state.crossroads.add('xr_eldritch');
    // Complete bat (all 3 nodes)
    state.allocatedNodes.add(nodeKey('bat', 1));
    state.allocatedNodes.add(nodeKey('bat', 2));
    state.allocatedNodes.add(nodeKey('bat', 3));
    const aff = computeAffinities(state, testData);
    // 1 Eldritch (crossroads) + 2 Chaos + 3 Eldritch (bat bonus)
    assert.deepStrictEqual(aff, [0, 2, 4, 0, 0]);
  });

  test('partially completed constellation gives no bonus', () => {
    const state = emptyDevotionState();
    state.allocatedNodes.add(nodeKey('bat', 1));
    state.allocatedNodes.add(nodeKey('bat', 2));
    // Only 2 of 3 nodes allocated
    const aff = computeAffinities(state, testData);
    assert.deepStrictEqual(aff, [0, 0, 0, 0, 0]);
  });
});

describe('totalDevotionSpent', () => {
  test('empty state is 0', () => {
    assert.strictEqual(totalDevotionSpent(emptyDevotionState()), 0);
  });

  test('counts nodes and crossroads', () => {
    const state = emptyDevotionState();
    state.crossroads.add('xr_eldritch');
    state.allocatedNodes.add(nodeKey('bat', 1));
    state.allocatedNodes.add(nodeKey('bat', 2));
    assert.strictEqual(totalDevotionSpent(state), 3);
  });
});

describe('isConstellationUnlockable', () => {
  test('no requirements always unlockable', () => {
    const state = emptyDevotionState();
    const branch = testData.constellations.find(c => c.id === 'branch')!;
    assert.strictEqual(isConstellationUnlockable(branch, state, testData), true);
  });

  test('unmet requirement blocks unlock', () => {
    const state = emptyDevotionState();
    const bat = testData.constellations.find(c => c.id === 'bat')!;
    assert.strictEqual(isConstellationUnlockable(bat, state, testData), false);
  });

  test('met requirement allows unlock', () => {
    const state = emptyDevotionState();
    state.crossroads.add('xr_eldritch');  // +1 Eldritch
    const bat = testData.constellations.find(c => c.id === 'bat')!;
    assert.strictEqual(isConstellationUnlockable(bat, state, testData), true);
  });
});

describe('isNodeAllocatable', () => {
  test('root node is allocatable if constellation unlockable', () => {
    const state = emptyDevotionState();
    state.crossroads.add('xr_eldritch');
    const bat = testData.constellations.find(c => c.id === 'bat')!;
    assert.strictEqual(isNodeAllocatable(bat, 1, state, testData), true);
  });

  test('child node requires parent allocated', () => {
    const state = emptyDevotionState();
    state.crossroads.add('xr_eldritch');
    const bat = testData.constellations.find(c => c.id === 'bat')!;
    assert.strictEqual(isNodeAllocatable(bat, 2, state, testData), false);
    state.allocatedNodes.add(nodeKey('bat', 1));
    assert.strictEqual(isNodeAllocatable(bat, 2, state, testData), true);
  });
});

describe('applyNodeDelta', () => {
  test('allocate root node', () => {
    const state = emptyDevotionState();
    state.crossroads.add('xr_eldritch');
    const result = applyNodeDelta(state, 'bat', 1, 1, testData);
    assert.strictEqual(result.state.allocatedNodes.has(nodeKey('bat', 1)), true);
    assert.deepStrictEqual(result.refunds, []);
  });

  test('deallocate leaf node', () => {
    const state = emptyDevotionState();
    state.crossroads.add('xr_eldritch');
    state.allocatedNodes.add(nodeKey('bat', 1));
    state.allocatedNodes.add(nodeKey('bat', 2));
    const result = applyNodeDelta(state, 'bat', 2, -1, testData);
    assert.strictEqual(result.state.allocatedNodes.has(nodeKey('bat', 2)), false);
    assert.strictEqual(result.state.allocatedNodes.has(nodeKey('bat', 1)), true);
  });

  test('deallocate parent cascades children', () => {
    const state = emptyDevotionState();
    state.crossroads.add('xr_eldritch');
    state.allocatedNodes.add(nodeKey('bat', 1));
    state.allocatedNodes.add(nodeKey('bat', 2));
    state.allocatedNodes.add(nodeKey('bat', 3));
    const result = applyNodeDelta(state, 'bat', 1, -1, testData);
    assert.strictEqual(result.state.allocatedNodes.size, 0);
    assert.strictEqual(result.refunds.length, 2);  // nodes 2 and 3 refunded
  });

  test('reject allocate when constellation not unlockable', () => {
    const state = emptyDevotionState();
    // No eldritch affinity, bat requires 1
    const result = applyNodeDelta(state, 'bat', 1, 1, testData);
    assert.strictEqual(result.state.allocatedNodes.size, 0);
  });
});

describe('toggleConstellationAll', () => {
  test('fill empty constellation', () => {
    const state = emptyDevotionState();
    state.crossroads.add('xr_eldritch');
    const result = toggleConstellationAll(state, 'bat', testData);
    assert.strictEqual(result.allocatedNodes.size, 3);
    assert.strictEqual(result.allocatedNodes.has(nodeKey('bat', 1)), true);
    assert.strictEqual(result.allocatedNodes.has(nodeKey('bat', 2)), true);
    assert.strictEqual(result.allocatedNodes.has(nodeKey('bat', 3)), true);
  });

  test('clear completed constellation', () => {
    const state = emptyDevotionState();
    state.allocatedNodes.add(nodeKey('bat', 1));
    state.allocatedNodes.add(nodeKey('bat', 2));
    state.allocatedNodes.add(nodeKey('bat', 3));
    const result = toggleConstellationAll(state, 'bat', testData);
    assert.strictEqual(result.allocatedNodes.has(nodeKey('bat', 1)), false);
    assert.strictEqual(result.allocatedNodes.has(nodeKey('bat', 2)), false);
    assert.strictEqual(result.allocatedNodes.has(nodeKey('bat', 3)), false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd /home/hqz/src/grim_dawn_mods/tools/calc && npx tsc && node --test js/devotion-rules.test.js
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement `devotion-rules.ts`**

```typescript
import type { Constellation, DevotionsData, DevotionState } from './devotion-types.js';
import { nodeKey } from './devotion-types.js';

export interface DevotionRefundEntry {
  constellationId: string;
  nodeIndex: number;
}

export interface DevotionDeltaResult {
  state: DevotionState;
  refunds: DevotionRefundEntry[];
}

/** Check if every node in a constellation is allocated. */
function isComplete(constellationId: string, constellation: Constellation, state: DevotionState): boolean {
  return constellation.nodes.every(n => state.allocatedNodes.has(nodeKey(constellationId, n.index)));
}

/**
 * Compute current affinity totals.
 * Crossroads each give +1 of their affinity.
 * Completed constellations give their bonus affinities.
 */
export function computeAffinities(state: DevotionState, data: DevotionsData): number[] {
  const aff = new Array(data.affinities.length).fill(0);

  for (const xr of data.crossroads) {
    if (state.crossroads.has(xr.id)) {
      aff[xr.affinity] += 1;
    }
  }

  for (const c of data.constellations) {
    if (isComplete(c.id, c, state)) {
      for (const b of c.bonus) {
        aff[b.affinity] += b.amount;
      }
    }
  }

  return aff;
}

/** Total devotion points spent (nodes + crossroads). */
export function totalDevotionSpent(state: DevotionState): number {
  return state.allocatedNodes.size + state.crossroads.size;
}

/** Check if a constellation's affinity requirements are met. */
export function isConstellationUnlockable(
  constellation: Constellation,
  state: DevotionState,
  data: DevotionsData,
): boolean {
  const aff = computeAffinities(state, data);
  return constellation.requires.every(r => aff[r.affinity] >= r.amount);
}

/** Check if a specific node can be allocated. */
export function isNodeAllocatable(
  constellation: Constellation,
  nodeIndex: number,
  state: DevotionState,
  data: DevotionsData,
): boolean {
  if (!isConstellationUnlockable(constellation, state, data)) return false;
  const node = constellation.nodes.find(n => n.index === nodeIndex);
  if (!node) return false;
  if (state.allocatedNodes.has(nodeKey(constellation.id, nodeIndex))) return false;
  if (node.parent === null) return true;
  return state.allocatedNodes.has(nodeKey(constellation.id, node.parent));
}

/**
 * Apply a +1 or -1 delta to a devotion node.
 * On removal, cascade-refunds children whose parent is no longer allocated.
 */
export function applyNodeDelta(
  state: DevotionState,
  constellationId: string,
  nodeIndex: number,
  delta: 1 | -1,
  data: DevotionsData,
): DevotionDeltaResult {
  const constellation = data.constellations.find(c => c.id === constellationId);
  if (!constellation) return { state, refunds: [] };

  const key = nodeKey(constellationId, nodeIndex);

  if (delta === 1) {
    if (state.allocatedNodes.has(key)) return { state, refunds: [] };
    if (!isNodeAllocatable(constellation, nodeIndex, state, data)) return { state, refunds: [] };
    const next: DevotionState = {
      ...state,
      allocatedNodes: new Set(state.allocatedNodes),
    };
    next.allocatedNodes.add(key);
    return { state: next, refunds: [] };
  }

  // delta === -1: remove node and cascade
  if (!state.allocatedNodes.has(key)) return { state, refunds: [] };
  const next: DevotionState = {
    ...state,
    allocatedNodes: new Set(state.allocatedNodes),
  };
  next.allocatedNodes.delete(key);

  // Cascade: repeatedly remove orphaned children within this constellation
  const refunds: DevotionRefundEntry[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of constellation.nodes) {
      const nk = nodeKey(constellationId, node.index);
      if (!next.allocatedNodes.has(nk)) continue;
      if (node.parent === null) continue;
      if (!next.allocatedNodes.has(nodeKey(constellationId, node.parent))) {
        next.allocatedNodes.delete(nk);
        refunds.push({ constellationId, nodeIndex: node.index });
        changed = true;
      }
    }
  }

  return { state: next, refunds };
}

/**
 * Toggle all nodes in a constellation.
 * If all allocated: clear them all. Otherwise: fill all (in dependency order).
 */
export function toggleConstellationAll(
  state: DevotionState,
  constellationId: string,
  data: DevotionsData,
): DevotionState {
  const constellation = data.constellations.find(c => c.id === constellationId);
  if (!constellation) return state;

  const complete = isComplete(constellationId, constellation, state);
  const next: DevotionState = {
    ...state,
    allocatedNodes: new Set(state.allocatedNodes),
  };

  if (complete) {
    // Clear all
    for (const node of constellation.nodes) {
      next.allocatedNodes.delete(nodeKey(constellationId, node.index));
    }
  } else {
    // Fill all
    for (const node of constellation.nodes) {
      next.allocatedNodes.add(nodeKey(constellationId, node.index));
    }
  }

  return next;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd /home/hqz/src/grim_dawn_mods/tools/calc && npx tsc && node --test js/devotion-rules.test.js
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add tools/calc/src/devotion-rules.ts tools/calc/src/devotion-rules.test.ts
git commit -m "feat: add devotion rules engine with tests"
```

---

### Task 4: Devotion state serialization

**Files:**
- Modify: `tools/calc/src/types.ts`
- Modify: `tools/calc/src/state.ts`
- Create: `tools/calc/src/devotion-state.test.ts`

- [ ] **Step 1: Write failing tests for devotion encode/decode**

```typescript
import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { encodeDevotionState, decodeDevotionState } from './state.js';
import type { DevotionsData, DevotionState } from './devotion-types.js';
import { emptyDevotionState, nodeKey } from './devotion-types.js';

const testDevotionData: DevotionsData = {
  gdVersion: '1.0',
  affinities: ['Ascendant', 'Chaos', 'Eldritch', 'Order', 'Primordial'],
  constellations: [
    {
      id: 'bat',
      name: 'Bat',
      tier: 1,
      requires: [],
      bonus: [],
      nodes: [
        { index: 1, parent: null, stats: [], skill: null },
        { index: 2, parent: 1, stats: [], skill: null },
        { index: 3, parent: 2, stats: [], skill: null },
      ],
    },
    {
      id: 'hawk',
      name: 'Hawk',
      tier: 1,
      requires: [],
      bonus: [],
      nodes: [
        { index: 1, parent: null, stats: [], skill: null },
        { index: 2, parent: 1, stats: [], skill: null },
      ],
    },
  ],
  crossroads: [
    { id: 'xr_eldritch', affinity: 2 },
    { id: 'xr_chaos', affinity: 1 },
  ],
};

describe('devotion state encoding', () => {
  test('empty state roundtrips', () => {
    const state = emptyDevotionState();
    const encoded = encodeDevotionState(state, testDevotionData);
    const decoded = decodeDevotionState(encoded, testDevotionData);
    assert.strictEqual(decoded.allocatedNodes.size, 0);
    assert.strictEqual(decoded.crossroads.size, 0);
    assert.strictEqual(decoded.devotionCap, 55);
  });

  test('allocated nodes roundtrip', () => {
    const state = emptyDevotionState();
    state.crossroads.add('xr_eldritch');
    state.allocatedNodes.add(nodeKey('bat', 1));
    state.allocatedNodes.add(nodeKey('bat', 3));
    const encoded = encodeDevotionState(state, testDevotionData);
    const decoded = decodeDevotionState(encoded, testDevotionData);
    assert.strictEqual(decoded.crossroads.has('xr_eldritch'), true);
    assert.strictEqual(decoded.crossroads.has('xr_chaos'), false);
    assert.strictEqual(decoded.allocatedNodes.has(nodeKey('bat', 1)), true);
    assert.strictEqual(decoded.allocatedNodes.has(nodeKey('bat', 3)), true);
    assert.strictEqual(decoded.allocatedNodes.has(nodeKey('bat', 2)), false);
  });

  test('custom devotion cap roundtrips', () => {
    const state = emptyDevotionState();
    state.devotionCap = 1000;
    const encoded = encodeDevotionState(state, testDevotionData);
    const decoded = decodeDevotionState(encoded, testDevotionData);
    assert.strictEqual(decoded.devotionCap, 1000);
  });

  test('empty encoded string returns empty state', () => {
    const decoded = decodeDevotionState('', testDevotionData);
    assert.strictEqual(decoded.allocatedNodes.size, 0);
    assert.strictEqual(decoded.crossroads.size, 0);
    assert.strictEqual(decoded.devotionCap, 55);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd /home/hqz/src/grim_dawn_mods/tools/calc && npx tsc --noEmit 2>&1 | head -5
```

Expected: FAIL (encodeDevotionState not exported from state.ts).

- [ ] **Step 3: Add devotion encode/decode to `state.ts`**

Add the following at the end of `state.ts`:

```typescript
import type { DevotionsData, DevotionState } from './devotion-types.js';
import { emptyDevotionState, nodeKey } from './devotion-types.js';

const DEFAULT_DEVOTION_CAP = 55;
const DEVOTION_HEADER = 3; // 2 bytes cap + 1 byte crossroads bitmask

export function encodeDevotionState(state: DevotionState, data: DevotionsData): string {
  const cap = state.devotionCap;
  const capU16 = cap === DEFAULT_DEVOTION_CAP ? 0xffff : cap;

  // Crossroads bitmask: bit i = crossroads[i] active
  let xrBits = 0;
  for (let i = 0; i < data.crossroads.length; i++) {
    if (state.crossroads.has(data.crossroads[i].id)) {
      xrBits |= (1 << i);
    }
  }

  const bytes = new Uint8Array(DEVOTION_HEADER + data.constellations.length);
  bytes[0] = (capU16 >> 8) & 0xff;
  bytes[1] = capU16 & 0xff;
  bytes[2] = xrBits;

  // One byte per constellation: bit i = node at position i in nodes array
  for (let ci = 0; ci < data.constellations.length; ci++) {
    const c = data.constellations[ci];
    let bits = 0;
    for (let ni = 0; ni < c.nodes.length; ni++) {
      if (state.allocatedNodes.has(nodeKey(c.id, c.nodes[ni].index))) {
        bits |= (1 << ni);
      }
    }
    bytes[DEVOTION_HEADER + ci] = bits;
  }

  return bytesToBase64Url(bytes);
}

export function decodeDevotionState(encoded: string, data: DevotionsData): DevotionState {
  if (!encoded) return emptyDevotionState();

  const bytes = base64UrlToBytes(encoded);
  if (bytes.length < DEVOTION_HEADER) return emptyDevotionState();

  const capRaw = (bytes[0] << 8) | bytes[1];
  const devotionCap = capRaw === 0xffff ? DEFAULT_DEVOTION_CAP : capRaw;
  const xrBits = bytes[2];

  const crossroads = new Set<string>();
  for (let i = 0; i < data.crossroads.length; i++) {
    if (xrBits & (1 << i)) {
      crossroads.add(data.crossroads[i].id);
    }
  }

  const allocatedNodes = new Set<string>();
  for (let ci = 0; ci < data.constellations.length; ci++) {
    if (DEVOTION_HEADER + ci >= bytes.length) break;
    const bits = bytes[DEVOTION_HEADER + ci];
    const c = data.constellations[ci];
    for (let ni = 0; ni < c.nodes.length; ni++) {
      if (bits & (1 << ni)) {
        allocatedNodes.add(nodeKey(c.id, c.nodes[ni].index));
      }
    }
  }

  return { allocatedNodes, crossroads, devotionCap };
}
```

Note: the import for `bytesToBase64Url` and `base64UrlToBytes` is already at the top of `state.ts`.

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd /home/hqz/src/grim_dawn_mods/tools/calc && npx tsc && node --test js/devotion-state.test.js
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add tools/calc/src/state.ts tools/calc/src/devotion-state.test.ts
git commit -m "feat: add devotion state URL serialization"
```

---

### Task 5: Devotion renderer

**Files:**
- Create: `tools/calc/src/devotion-render.ts`

- [ ] **Step 1: Create `devotion-render.ts`**

```typescript
import type { Constellation, DevotionsData, DevotionState, DevotionNode } from './devotion-types.js';
import { nodeKey } from './devotion-types.js';
import { computeAffinities, isConstellationUnlockable, isNodeAllocatable, totalDevotionSpent } from './devotion-rules.js';

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
      tooltipParts.push(`<div class="small text-muted">${node.skill.description}</div>`);
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
```

- [ ] **Step 2: Verify it compiles**

Run:
```bash
cd /home/hqz/src/grim_dawn_mods/tools/calc && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add tools/calc/src/devotion-render.ts
git commit -m "feat: add devotion constellation renderer"
```

---

### Task 6: CSS styles for devotion UI

**Files:**
- Modify: `tools/calc/css/style.css`

- [ ] **Step 1: Add devotion CSS to `style.css`**

Append the following to the end of `tools/calc/css/style.css`:

```css
/* === Devotion constellation styles === */

.devotion-tier-header {
  font-size: 14px;
  font-weight: 600;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 1px;
  padding: 8px 0 4px 0;
  border-bottom: 1px solid #333;
  margin-top: 16px;
  margin-bottom: 8px;
}

.devotion-crossroads-row,
.devotion-constellation-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 12px;
  background: rgba(255,255,255,0.02);
  border-radius: 6px;
  margin-bottom: 4px;
  min-height: 48px;
}

.devotion-constellation-name {
  width: 150px;
  flex-shrink: 0;
  font-weight: 600;
  color: #e0e0e0;
  font-size: 13px;
}

.devotion-constellation-name.locked {
  color: #666;
}

.devotion-check {
  width: 20px;
  height: 20px;
  border-radius: 3px;
  border: 1.5px solid #555;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  font-size: 12px;
  color: transparent;
}

.devotion-check.completed {
  border-color: #ffc107;
  color: #ffc107;
  background: rgba(255,193,7,0.1);
}

.devotion-crossroads-toggles {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.devotion-crossroads-toggle {
  padding: 4px 10px;
  border-radius: 4px;
  border: 1.5px solid #444;
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
  color: #666;
  background: transparent;
}

.devotion-affinity-info {
  width: 160px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.devotion-affinity-line {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
}

.devotion-affinity-label {
  color: #777;
  font-size: 10px;
  width: 52px;
  flex-shrink: 0;
}

.devotion-affinity-chip {
  padding: 1px 6px;
  border-radius: 3px;
  font-weight: 700;
  font-size: 11px;
  min-width: 20px;
  text-align: center;
}

.devotion-chip-none {
  color: #555;
  font-style: italic;
  font-size: 10px;
}

.devotion-node-graph {
  display: flex;
  align-items: center;
}

.devotion-subtree {
  display: flex;
  align-items: center;
}

.devotion-node {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid #555;
  background: #222;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  color: #666;
  cursor: pointer;
  flex-shrink: 0;
}

.devotion-node.allocated {
  border-color: #ffc107;
  background: rgba(255,193,7,0.2);
  color: #ffc107;
}

.devotion-node.skill-node {
  border-style: dashed;
}

.devotion-node.skill-node.allocated {
  border-style: solid;
}

.devotion-link-h {
  width: 12px;
  height: 2px;
  background: #444;
  flex-shrink: 0;
}

.devotion-link-h.active {
  background: #ffc107;
}

.devotion-branch {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.devotion-branch-arm {
  display: flex;
  align-items: center;
}

/* Devotion search highlighting */
.devotion-constellation-row.search-miss {
  opacity: 0.25;
}

.devotion-constellation-row.search-hit .devotion-constellation-name {
  color: #dc3545;
}

/* Bottom bar affinity section */
#affinity-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}
```

- [ ] **Step 2: Commit**

```bash
git add tools/calc/css/style.css
git commit -m "feat: add devotion constellation CSS styles"
```

---

### Task 7: HTML and main.ts integration

**Files:**
- Modify: `tools/calc/index.html`
- Modify: `tools/calc/src/main.ts`

- [ ] **Step 1: Add devotion panel container and bottom bar elements to `index.html`**

In `tools/calc/index.html`, add the devotion panel after the mastery panels div (after line 38, before the toast container):

```html
    <div id="devotion-panel" class="mt-3"></div>
```

In the bottom bar's `container-fluid` div, add devotion budget and affinity bar elements. Insert after the existing `budget-label` span (after line 67):

```html
      <span id="devotion-budget" class="badge bg-primary">Devotion: 55</span>
      <span id="affinity-bar"></span>
```

- [ ] **Step 2: Update `main.ts` to load devotion data and wire events**

Add imports at the top of `main.ts`:

```typescript
import type { DevotionsData, DevotionState } from './devotion-types.js';
import { emptyDevotionState } from './devotion-types.js';
import { encodeDevotionState, decodeDevotionState } from './state.js';
import { totalDevotionSpent, applyNodeDelta, toggleConstellationAll } from './devotion-rules.js';
import { renderDevotionPanel, renderAffinityBar } from './devotion-render.js';
```

Add devotion fields to `AppRefs`:

```typescript
  devotionPanel: HTMLElement;
  devotionBudget: HTMLElement;
  affinityBar: HTMLElement;
```

Add them to `collectRefs()`:

```typescript
    devotionPanel: byId('devotion-panel'),
    devotionBudget: byId('devotion-budget'),
    affinityBar: byId('affinity-bar'),
```

In `boot()`, after loading skills data, load devotion data:

```typescript
  let devotionData: DevotionsData | null = null;
  try {
    const devRes = await fetch(`data/devotions/devotions-${versionName}.json`);
    if (devRes.ok) devotionData = await devRes.json();
  } catch { /* devotion data optional */ }
```

Add devotion state alongside build state:

```typescript
  let devState: DevotionState = emptyDevotionState();
```

When decoding the URL hash, split it into mastery and devotion parts. The mastery portion is everything up to a `|` separator, and the devotion portion follows. Update the URL encoding to use this separator:

Actually, simpler approach: use a `|` separator in the hash. The mastery state is before `|`, devotion state after `|`.

Update hash parsing in `boot()`:

```typescript
  const hash = window.location.hash.slice(1);
  const [masteryHash, devotionHash] = hash.split('|');
```

Use `masteryHash` for version detection and state decoding, `devotionHash` for devotion state.

Update `setState` to also encode devotion state:

```typescript
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
```

Update `syncUrl` to include devotion:

```typescript
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
```

In `render()`, add devotion rendering:

```typescript
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
```

Update the reset handler to also clear devotion state:

```typescript
  refs.reset.addEventListener('click', () => {
    devState = emptyDevotionState();
    setState({
      ...state,
      masteries: [null, null],
      masteryBar: [0, 0],
      allocations: new Map(),
    });
  });
```

Update `popstate` handler to decode devotion state too:

```typescript
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
```

- [ ] **Step 3: Build and manually test**

Run:
```bash
cd /home/hqz/src/grim_dawn_mods/tools/calc && npx tsc
```

Expected: no errors. Open `http://localhost:8000/tools/calc/` and verify:
- Devotion panel appears below mastery panels
- Crossroads row with 5 toggleable buttons
- Tier headers and constellation rows
- Clicking nodes allocates/deallocates
- Right-click removes nodes with cascade
- Checkmark fills/clears all nodes
- Bottom bar shows devotion budget and affinity totals
- URL updates with devotion state after `|`
- Refreshing page restores devotion state

- [ ] **Step 4: Run all existing tests to verify no regressions**

Run:
```bash
cd /home/hqz/src/grim_dawn_mods/tools/calc && npm test
```

Expected: all tests pass (existing + new devotion tests).

- [ ] **Step 5: Commit**

```bash
git add tools/calc/index.html tools/calc/src/main.ts
git commit -m "feat: integrate devotion panel into calculator"
```

---

### Task 8: Search integration for devotions

**Files:**
- Modify: `tools/calc/src/search.ts`
- Modify: `tools/calc/src/main.ts` (search highlight)

- [ ] **Step 1: Extend search index to include devotion data**

In `search.ts`, add a new function:

```typescript
import type { DevotionsData } from './devotion-types.js';

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
```

- [ ] **Step 2: Add devotion search highlighting in `main.ts`**

In `main.ts`, build the devotion search index alongside the skill index:

```typescript
  const devSearchIndex = devotionData ? buildDevotionSearchIndex(devotionData) : [];
```

Update `applySearchHighlight` to also handle devotion rows:

```typescript
  // Devotion search highlighting
  const devMatches = matchQuery(q, devSearchIndex);
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
```

Update the search count to include devotion matches:

```typescript
  const totalMatches = active ? matches.size + devMatches.size : 0;
  refs.searchCount.textContent = active ? `${totalMatches} matches` : '';
```

- [ ] **Step 3: Build and test search**

Run:
```bash
cd /home/hqz/src/grim_dawn_mods/tools/calc && npx tsc
```

Open the calculator, type "cold" in search. Verify that devotion constellation rows with cold-related stats are highlighted and others are dimmed.

- [ ] **Step 4: Commit**

```bash
git add tools/calc/src/search.ts tools/calc/src/main.ts
git commit -m "feat: add devotion constellations to search index"
```

---

### Task 9: Devotion cap input

**Files:**
- Modify: `tools/calc/index.html`
- Modify: `tools/calc/src/main.ts`

- [ ] **Step 1: Add devotion cap input to the controls row**

In `index.html`, add a devotion points input in the controls row (after the quest rewards checkbox div, before closing the row):

```html
      <div class="col-md-3">
        <label class="form-label small mb-1">Devotion points</label>
        <input id="devotion-cap" type="number" min="0" max="65534" class="form-control form-control-sm" placeholder="55">
      </div>
```

- [ ] **Step 2: Wire the input in `main.ts`**

Add to `AppRefs`:

```typescript
  devotionCap: HTMLInputElement;
```

Add to `collectRefs()`:

```typescript
    devotionCap: byId('devotion-cap'),
```

Add event listener after other input listeners:

```typescript
  refs.devotionCap.addEventListener('input', () => {
    const v = refs.devotionCap.value.trim();
    devState = { ...devState, devotionCap: v === '' ? 55 : parseInt(v, 10) };
    setDevState(devState);
  });
```

Add to `syncInputs` (or create a new sync function):

```typescript
  refs.devotionCap.value = devState.devotionCap === 55 ? '' : String(devState.devotionCap);
```

- [ ] **Step 3: Build and test**

Run:
```bash
cd /home/hqz/src/grim_dawn_mods/tools/calc && npx tsc
```

Verify: typing a number in the devotion cap input updates the devotion budget display. Leaving it empty defaults to 55.

- [ ] **Step 4: Commit**

```bash
git add tools/calc/index.html tools/calc/src/main.ts
git commit -m "feat: add configurable devotion point cap input"
```
