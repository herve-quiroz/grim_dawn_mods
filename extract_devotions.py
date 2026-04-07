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


# Field mappings shared between node stats and skill stats.
_STAT_FIELDS: dict[str, str] = {}
_STAT_FIELDS.update({
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
    "offensiveSlowBleedingModifier": "+% Bleeding Damage",
    "offensiveSlowFireModifier": "+% Burn Damage",
    "offensiveSlowColdModifier": "+% Frostburn Damage",
    "offensiveSlowLightningModifier": "+% Electrocute Damage",
    "offensiveSlowPoisonModifier": "+% Poison Damage",
    "offensiveSlowLifeModifier": "+% Vitality Decay",
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
    "characterArmor": "+ Armor",
    "characterArmorModifier": "+% Armor",
    "offensiveCritDamageModifier": "+% Crit Damage",
    "offensivePhysicalMin": "Physical Damage Min",
    "offensivePhysicalMax": "Physical Damage Max",
    "offensiveFireMin": "Fire Damage Min",
    "offensiveFireMax": "Fire Damage Max",
    "offensiveColdMin": "Cold Damage Min",
    "offensiveColdMax": "Cold Damage Max",
    "offensiveLightningMin": "Lightning Damage Min",
    "offensiveLightningMax": "Lightning Damage Max",
    "offensiveAetherMin": "Aether Damage Min",
    "offensiveAetherMax": "Aether Damage Max",
    "offensiveChaosMin": "Chaos Damage Min",
    "offensiveChaosMax": "Chaos Damage Max",
    "offensivePierceMin": "Pierce Damage Min",
    "offensivePierceMax": "Pierce Damage Max",
    "offensiveLifeMin": "Vitality Damage Min",
    "offensiveLifeMax": "Vitality Damage Max",
    "offensivePoisonMin": "Acid Damage Min",
    "offensivePoisonMax": "Acid Damage Max",
    "offensiveLifeLeechMin": "Life Leech %",
    "weaponDamagePct": "Weapon Damage %",
    "skillCooldownTime": "Cooldown",
    "skillManaCost": "Energy Cost",
    "petLimit": "Summon Limit",
    "spawnObjectsTimeToLive": "Duration",
})


def extract_proc_skill_stats(dbr_data: dict[str, str]) -> list[dict]:
    """Extract stats from a proc skill DBR at level 1 and max level.

    Returns a list of {"label": str, "level1": str, "levelMax": str}.
    """
    def fmt(v: float) -> str:
        if abs(v - round(v)) < 1e-9:
            return str(int(round(v)))
        return str(round(v, 4))

    stats: list[dict] = []
    for key, label in _STAT_FIELDS.items():
        raw = dbr_data.get(key, "")
        if not raw or raw == "0":
            continue
        vals = _parse_values(raw)
        if not vals or all(v == 0 for v in vals):
            continue
        level1 = fmt(vals[0])
        level_max = fmt(vals[-1])
        stats.append({"label": label, "level1": level1, "levelMax": level_max})

    stats.sort(key=lambda s: s["label"])
    return stats


def _extract_skill_info(
    arz_dir: Path, skill_dbr_path: Path, tags: dict[str, str]
) -> dict | None:
    """Extract proc skill info including name, description, max level, and stats."""
    if not skill_dbr_path.exists():
        return None
    skill_data = read_dbr(skill_dbr_path)
    skill_display_tag = skill_data.get("skillDisplayName", "")
    if not skill_display_tag:
        return None
    skill_desc_tag = skill_data.get("skillBaseDescription", "")
    # Determine max level from experience levels array
    xp_raw = skill_data.get("skillExperienceLevels", "")
    max_level = len(_parse_values(xp_raw)) if xp_raw else 1
    result = {
        "name": resolve_text(skill_display_tag, tags),
        "description": resolve_text(skill_desc_tag, tags) if skill_desc_tag else "",
        "maxLevel": max_level,
        "stats": extract_proc_skill_stats(skill_data),
        "petStats": [],
    }

    # For summon skills, follow spawnObjects -> pet DBR -> attackSkillName
    spawn_raw = skill_data.get("spawnObjects", "")
    if spawn_raw:
        spawn_paths = [p.strip() for p in spawn_raw.split(";") if p.strip()]
        if spawn_paths:
            pet_path = arz_dir / spawn_paths[0]
            if pet_path.exists():
                pet_data = read_dbr(pet_path)
                attack_ref = pet_data.get("attackSkillName", "")
                if attack_ref:
                    attack_path = arz_dir / attack_ref
                    if attack_path.exists():
                        attack_data = read_dbr(attack_path)
                        result["petStats"] = extract_proc_skill_stats(attack_data)

    return result


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
        skill_info = None
        if "_skill" in skill_record_path:
            skill_info = _extract_skill_info(arz_dir, skill_dbr_path, tags)
        else:
            base_name = Path(skill_record_path).stem
            skill_variant = Path(skill_record_path).parent / f"{base_name}_skill.dbr"
            skill_variant_path = arz_dir / str(skill_variant)
            skill_info = _extract_skill_info(arz_dir, skill_variant_path, tags)

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
                # Crossroads: single affinity bonus, unique ID per affinity
                affinity_idx = result["bonus"][0]["affinity"] if result["bonus"] else 0
                aff_name = ["ascendant", "chaos", "eldritch", "order", "primordial"][affinity_idx]
                crossroads.append({"id": f"crossroads_{aff_name}", "affinity": affinity_idx})
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
