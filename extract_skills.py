#!/usr/bin/env python3
"""Extract Grim Dawn class-skill data into a per-version JSON snapshot.

Usage:
    python3 extract_skills.py --version 1.2.1.5
    python3 extract_skills.py --version 1.2.1.5 --keep /tmp/gd_extract
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
ICON_ARCS = [
    GAME_ROOT / "resources" / "UI.arc",
    GAME_ROOT / "gdx1" / "resources" / "UI.arc",
    GAME_ROOT / "gdx2" / "resources" / "UI.arc",
]

# Maps a local key -> the DBR record path.
MASTERY_RECORDS = {
    "soldier": "records/skills/playerclass01/_classtraining_class01.dbr",
    "demolitionist": "records/skills/playerclass02/_classtraining_class02.dbr",
    "occultist": "records/skills/playerclass03/_classtraining_class03.dbr",
    "nightblade": "records/skills/playerclass04/_classtraining_class04.dbr",
    "arcanist": "records/skills/playerclass05/_classtraining_class05.dbr",
    "shaman": "records/skills/playerclass06/_classtraining_class06.dbr",
    "inquisitor": "records/skills/playerclass07/_classtraining_class07.dbr",
    "necromancer": "records/skills/playerclass08/_classtraining_class08.dbr",
    "oathkeeper": "records/skills/playerclass09/_classtraining_class09.dbr",
}

# Mastery bar levels required for each skill tier (index = tier number).
# Tier 0 is unused; tier 1 requires 0 mastery points, tier 9 requires 50.
TIER_TO_MASTERY = [0, 0, 5, 10, 15, 20, 25, 32, 40, 50]

# Template names that indicate a modifier/transmuter skill (child of a parent).
MODIFIER_TEMPLATES = {
    "database/templates/skill_modifier.tpl",
    "database/templates/skill_projectilemodifier.tpl",
    "database/templates/skill_projectiletransmuter.tpl",
    "database/templates/skill_spawnpettransmuter.tpl",
    "database/templates/skill_transmuter.tpl",
    "database/templates/skillsecondary_petmodifier.tpl",
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


# DLC mastery DBRs reference tags that don't exist in any text file.
TAG_FIXUPS = {
    "TagClass07SkillName00": "tagGDX1Class07SkillName00A",
    "TagClass08SkillName00": "tagGDX1Class08SkillName00A",
    "TagClass09SkillName00": "tagGDX2Class09SkillName00A",
}


def resolve_text(value: str, tags: dict[str, str]) -> str:
    """Resolve a tag reference to its display text."""
    if not value:
        return ""
    fixed = TAG_FIXUPS.get(value, value)
    if fixed in tags:
        return tags[fixed]
    # Fall back to case-insensitive match.
    lower = fixed.lower()
    for k, v in tags.items():
        if k.lower() == lower:
            return v
    return value


def _vanilla_points_per_level() -> list[int]:
    """Return points awarded per character level (index = level, 0-100)."""
    pts = [0] * 101  # index 0 = level 0 (unused)
    for lvl in range(2, 51):
        pts[lvl] = 3
    for lvl in range(51, 91):
        pts[lvl] = 2
    for lvl in range(91, 101):
        pts[lvl] = 1
    return pts


def _parse_classtree(arz_dir: Path, class_num: str) -> list[str]:
    """Return the ordered list of skill record paths from a classtree DBR."""
    tree_path = arz_dir / f"records/skills/playerclass{class_num}/_classtree_class{class_num}.dbr"
    if not tree_path.exists():
        return []
    data = read_dbr(tree_path)
    # Collect skillNameN entries, sorted by index.
    entries: list[tuple[int, str]] = []
    for k, v in data.items():
        m = re.match(r"skillName(\d+)", k)
        if m and v and v != "0":
            entries.append((int(m.group(1)), v))
    entries.sort(key=lambda x: x[0])
    return [path for _, path in entries]


def _parse_ui_skills(arz_dir: Path, class_num: str) -> dict[str, dict]:
    """Parse UI skill button records and return a map from skill record path
    to {x, y} pixel positions."""
    classtable = arz_dir / f"records/ui/skills/class{class_num}/classtable.dbr"
    if not classtable.exists():
        return {}
    ct_data = read_dbr(classtable)
    buttons_str = ct_data.get("tabSkillButtons", "")
    if not buttons_str:
        return {}

    result: dict[str, dict] = {}
    for btn_path in buttons_str.split(";"):
        btn_path = btn_path.strip()
        if not btn_path:
            continue
        btn_dbr = arz_dir / btn_path
        if not btn_dbr.exists():
            continue
        btn_data = read_dbr(btn_dbr)
        skill_name = btn_data.get("skillName", "")
        if not skill_name:
            continue
        try:
            x = int(btn_data.get("bitmapPositionX", "0"))
            y = int(btn_data.get("bitmapPositionY", "0"))
        except ValueError:
            continue
        result[skill_name] = {"x": x, "y": y}
    return result


def _pixel_to_grid(ui_positions: dict[str, dict]) -> dict[str, dict]:
    """Convert pixel positions to row/col grid coordinates.

    Row 0 is the bottom of the skill panel (highest Y value),
    increasing upward. Column 0 is leftmost.
    """
    if not ui_positions:
        return {}

    # Collect all unique X and Y values, sorted.
    all_x = sorted(set(pos["x"] for pos in ui_positions.values()))
    all_y = sorted(set(pos["y"] for pos in ui_positions.values()), reverse=True)

    # Map each unique coordinate to its index.
    x_to_col = {x: i for i, x in enumerate(all_x)}
    y_to_row = {y: i for i, y in enumerate(all_y)}

    return {
        path: {"row": y_to_row[pos["y"]], "col": x_to_col[pos["x"]]}
        for path, pos in ui_positions.items()
    }


def _get_display_data(arz_dir: Path, skill_path: str) -> dict[str, str]:
    """Read display fields from a skill DBR, following buffSkillName if needed."""
    dbr_path = arz_dir / skill_path
    if not dbr_path.exists():
        return {}
    data = read_dbr(dbr_path)

    # If the skill is a buff launcher, follow to the buff skill.
    buff_ref = data.get("buffSkillName", "")
    if buff_ref and not data.get("skillDisplayName"):
        buff_path = arz_dir / buff_ref
        if buff_path.exists():
            buff_data = read_dbr(buff_path)
            # Merge: buff data provides display fields, launcher provides others.
            merged = dict(data)
            merged.update(buff_data)
            # Keep the original path as identity.
            return merged
    return data


def _parse_values(raw: str) -> list[float]:
    """Parse a semicolon-separated value string into a list of floats."""
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


def _is_all_zero(vals: list[float]) -> bool:
    return all(v == 0 for v in vals)


def extract_skill_stats(dbr_data: dict[str, str]) -> list[dict]:
    """Extract non-zero stat fields from a skill DBR and return labelled stats.

    Returns a list of {"label": str, "values": list[float]} sorted by label.
    """
    # Parse all numeric fields up front.
    parsed: dict[str, list[float]] = {}
    for key, raw in dbr_data.items():
        # Skip known non-stat fields.
        if raw in ("", "0"):
            continue
        # Only consider fields that look numeric (float/int type in DBR).
        vals = _parse_values(raw)
        if vals and not _is_all_zero(vals):
            parsed[key] = vals

    stats: list[dict] = []

    def add(label: str, values: list[float]) -> None:
        # Round very close integers (e.g. 24.0 -> 24).
        cleaned = []
        for v in values:
            if abs(v - round(v)) < 1e-9:
                cleaned.append(int(round(v)))
            else:
                cleaned.append(round(v, 4))
        stats.append({"label": label, "values": cleaned})

    def get(key: str) -> list[float] | None:
        return parsed.get(key)

    # ---- Direct damage (offensive min/max pairs) ----
    damage_types = {
        "Physical": "Physical Damage",
        "Fire": "Fire Damage",
        "Cold": "Cold Damage",
        "Lightning": "Lightning Damage",
        "Aether": "Aether Damage",
        "Chaos": "Chaos Damage",
        "Pierce": "Pierce Damage",
        "Elemental": "Elemental Damage",
        "Life": "Life Damage",
        "Poison": "Poison Damage",
    }
    for suffix, label in damage_types.items():
        min_key = f"offensive{suffix}Min"
        max_key = f"offensive{suffix}Max"
        min_vals = get(min_key)
        max_vals = get(max_key)
        if min_vals and max_vals:
            # Combine into "X-Y Type Damage" using min values as display
            # (we store both min and max as separate value arrays)
            add(f"{label} Min", min_vals)
            add(f"{label} Max", max_vals)
        elif min_vals:
            add(label, min_vals)
        elif max_vals:
            add(f"{label} Max", max_vals)

    # ---- Damage modifiers (offensive % modifiers) ----
    modifier_types = {
        "Physical": "Physical Damage",
        "Fire": "Fire Damage",
        "Cold": "Cold Damage",
        "Lightning": "Lightning Damage",
        "Aether": "Aether Damage",
        "Chaos": "Chaos Damage",
        "Pierce": "Pierce Damage",
        "Elemental": "Elemental Damage",
        "Life": "Life Damage",
        "Poison": "Poison Damage",
    }
    for suffix, label in modifier_types.items():
        key = f"offensive{suffix}Modifier"
        vals = get(key)
        if vals:
            add(f"+% {label}", vals)

    # ---- DoT / Slow damage ----
    dot_types = {
        "Bleeding": "Bleeding Damage",
        "Poison": "Poison Damage",
        "Physical": "Internal Trauma",
        "Cold": "Frostburn Damage",
        "Fire": "Burn Damage",
        "Lightning": "Electrocute Damage",
        "Life": "Life Decay",
    }
    for suffix, label in dot_types.items():
        min_key = f"offensiveSlow{suffix}Min"
        dur_key = f"offensiveSlow{suffix}DurationMin"
        mod_key = f"offensiveSlow{suffix}Modifier"
        dur_mod_key = f"offensiveSlow{suffix}DurationModifier"
        chance_key = f"offensiveSlow{suffix}Chance"
        min_vals = get(min_key)
        dur_vals = get(dur_key)
        mod_vals = get(mod_key)
        dur_mod_vals = get(dur_mod_key)
        chance_vals = get(chance_key)
        if min_vals:
            add(f"{label}", min_vals)
        if dur_vals:
            add(f"{label} Duration", dur_vals)
        if mod_vals:
            add(f"+% {label}", mod_vals)
        if dur_mod_vals:
            add(f"+% {label} Duration", dur_mod_vals)
        if chance_vals:
            add(f"{label} Chance", chance_vals)

    # Life/Mana leech (DoT variant)
    for leech_type, label in [("LifeLeach", "Life Leech"), ("ManaLeach", "Mana Leech")]:
        min_key = f"offensiveSlow{leech_type}Min"
        dur_key = f"offensiveSlow{leech_type}DurationMin"
        min_vals = get(min_key)
        dur_vals = get(dur_key)
        if min_vals:
            add(f"{label}", min_vals)
        if dur_vals:
            add(f"{label} Duration", dur_vals)

    # Direct life leech
    ll_vals = get("offensiveLifeLeechMin")
    if ll_vals:
        add("Life Leech", ll_vals)

    # ---- Slow debuffs (attack speed, run speed, total speed) ----
    slow_debuffs = {
        "AttackSpeed": "Reduced Attack Speed",
        "RunSpeed": "Reduced Movement Speed",
        "TotalSpeed": "Reduced Total Speed",
        "OffensiveAbility": "Reduced Offensive Ability",
        "DefensiveAbility": "Reduced Defensive Ability",
        "OffensiveReduction": "Reduced Offensive Ability",
        "DefensiveReduction": "Reduced Defensive Ability",
    }
    for suffix, label in slow_debuffs.items():
        min_key = f"offensiveSlow{suffix}Min"
        dur_key = f"offensiveSlow{suffix}DurationMin"
        min_vals = get(min_key)
        dur_vals = get(dur_key)
        if min_vals:
            add(label, min_vals)
        if dur_vals:
            add(f"{label} Duration", dur_vals)

    # ---- CC effects (stun, freeze, confusion, fear, knockdown, etc.) ----
    cc_types = {
        "Stun": "Stun",
        "Freeze": "Freeze",
        "Confusion": "Confusion",
        "Fear": "Fear",
        "Knockdown": "Knockdown",
        "Convert": "Conversion",
        "Disruption": "Skill Disruption",
        "Taunt": "Taunt",
        "Petrify": "Petrify",
    }
    for suffix, label in cc_types.items():
        chance_key = f"offensive{suffix}Chance"
        min_key = f"offensive{suffix}Min"
        max_key = f"offensive{suffix}Max"
        mod_key = f"offensive{suffix}Modifier"
        chance_vals = get(chance_key)
        min_vals = get(min_key)
        max_vals = get(max_key)
        mod_vals = get(mod_key)
        if chance_vals:
            add(f"{label} Chance", chance_vals)
        if min_vals:
            add(f"{label} Duration", min_vals)
        if max_vals:
            add(f"{label} Duration Max", max_vals)
        if mod_vals:
            add(f"+% {label} Duration", mod_vals)

    # ---- Resistance reduction ----
    rr_fields = {
        "offensivePhysicalResistanceReductionAbsoluteMin": "Physical Resistance Reduction",
        "offensivePhysicalResistanceReductionAbsoluteDurationMin": "Physical RR Duration",
        "offensiveTotalResistanceReductionAbsoluteMin": "Total Resistance Reduction",
        "offensiveTotalResistanceReductionAbsoluteDurationMin": "Total RR Duration",
        "offensiveTotalDamageReductionPercentMin": "Total Damage Reduction",
        "offensiveTotalDamageReductionPercentDurationMin": "Total Damage Reduction Duration",
    }
    for key, label in rr_fields.items():
        vals = get(key)
        if vals:
            add(label, vals)

    # ---- Percent current life ----
    pclm = get("offensivePercentCurrentLifeMin")
    if pclm:
        add("% Current Life", pclm)

    # ---- Global chance ----
    gc = get("offensiveGlobalChance")
    if gc:
        add("Chance to be Used", gc)

    # ---- Total damage modifier ----
    tdm = get("offensiveTotalDamageModifier")
    if tdm:
        add("+% Total Damage", tdm)

    # Crit damage modifier
    cdm = get("offensiveCritDamageModifier")
    if cdm:
        add("+% Crit Damage", cdm)

    # Offensive damage mult modifier (% weapon damage bonus in some contexts)
    odmm = get("offensiveDamageMultModifier")
    if odmm:
        add("+% Damage", odmm)

    # ---- Weapon damage % ----
    wdp = get("weaponDamagePct")
    if wdp:
        add("% Weapon Damage", wdp)

    # ---- Defensive stats ----
    defense_types = {
        "defensivePhysical": "+% Physical Resistance",
        "defensiveFire": "+% Fire Resistance",
        "defensiveCold": "+% Cold Resistance",
        "defensiveLightning": "+% Lightning Resistance",
        "defensiveAether": "+% Aether Resistance",
        "defensiveChaos": "+% Chaos Resistance",
        "defensivePierce": "+% Pierce Resistance",
        "defensivePoison": "+% Poison & Acid Resistance",
        "defensiveBleeding": "+% Bleeding Resistance",
        "defensiveElementalResistance": "+% Elemental Resistance",
        "defensiveLife": "+ Health",
        "defensiveLifeDuration": "Health Duration",
        "defensiveProtection": "+ Armor",
        "defensiveProtectionModifier": "+% Armor",
        "defensiveAbsorptionModifier": "+% Armor Absorption",
        "defensiveBlockModifier": "+% Block Chance",
        "defensiveBlockAmountModifier": "+% Block Amount",
        "defensivePercentCurrentLife": "+% Health Restored",
        "defensivePercentReflectionResistance": "+% Reflected Damage Reduction",
        "defensiveAllMaxResist": "+% Max All Resistances",
    }
    for key, label in defense_types.items():
        vals = get(key)
        if vals:
            add(label, vals)

    # Defensive duration reductions
    def_dur_types = {
        "defensivePhysicalDuration": "+% Physical Duration Reduction",
        "defensiveFireDuration": "+% Burn Duration Reduction",
        "defensiveColdDuration": "+% Frostburn Duration Reduction",
        "defensiveLightningDuration": "+% Electrocute Duration Reduction",
        "defensivePoisonDuration": "+% Poison Duration Reduction",
        "defensiveBleedingDuration": "+% Bleeding Duration Reduction",
        "defensiveConfusion": "+% Confusion Resistance",
        "defensiveFear": "+% Fear Resistance",
        "defensiveFreeze": "+% Freeze Resistance",
        "defensiveKnockdown": "+% Knockdown Resistance",
        "defensiveConvert": "+% Conversion Resistance",
        "defensivePetrify": "+% Petrify Resistance",
    }
    for key, label in def_dur_types.items():
        vals = get(key)
        if vals:
            add(label, vals)

    # ---- Character stats ----
    char_stats = {
        "characterLife": "+ Health",
        "characterLifeModifier": "+% Health",
        "characterLifeRegen": "+ Health Regen per Second",
        "characterLifeRegenModifier": "+% Health Regen",
        "characterMana": "+ Energy",
        "characterManaRegen": "+ Energy Regen per Second",
        "characterManaLimitReserve": "Energy Reserved",
        "characterOffensiveAbility": "+ Offensive Ability",
        "characterOffensiveAbilityModifier": "+% Offensive Ability",
        "characterDefensiveAbility": "+ Defensive Ability",
        "characterDefensiveAbilityModifier": "+% Defensive Ability",
        "characterStrength": "+ Physique",
        "characterStrengthModifier": "+% Physique",
        "characterDexterity": "+ Cunning",
        "characterIntelligence": "+ Spirit",
        "characterConstitutionModifier": "+% Constitution",
        "characterAttackSpeed": "+ Attack Speed",
        "characterAttackSpeedModifier": "+% Attack Speed",
        "characterSpellCastSpeed": "+ Casting Speed",
        "characterSpellCastSpeedModifier": "+% Casting Speed",
        "characterRunSpeed": "+ Movement Speed",
        "characterRunSpeedModifier": "+% Movement Speed",
        "characterTotalSpeedModifier": "+% Total Speed",
        "characterHealIncreasePercent": "+% Healing Increase",
        "characterArmorStrengthReqReduction": "Reduced Armor Requirement",
        "characterDefensiveBlockRecoveryReduction": "Reduced Block Recovery",
    }
    for key, label in char_stats.items():
        vals = get(key)
        if vals:
            add(label, vals)

    # ---- Skill meta ----
    skill_meta = {
        "skillManaCost": "Energy Cost",
        "skillCooldownTime": "Skill Recharge",
        "skillActiveDuration": "Duration",
        "skillTargetNumber": "Target Maximum",
        "skillTargetRadius": "Meter Radius",
        "skillProjectileNumber": "Projectiles",
        "skillLifePercent": "% Health Cost",
        "skillChargeDuration": "Charge Duration",
        "skillChargeLevel": "Charge Levels",
    }
    for key, label in skill_meta.items():
        vals = get(key)
        if vals:
            add(label, vals)

    # ---- Retaliation damage ----
    ret_types = {
        "Physical": "Physical Retaliation",
        "Fire": "Fire Retaliation",
        "Cold": "Cold Retaliation",
        "Lightning": "Lightning Retaliation",
        "Aether": "Aether Retaliation",
        "Chaos": "Chaos Retaliation",
        "Pierce": "Pierce Retaliation",
        "Elemental": "Elemental Retaliation",
    }
    for suffix, label in ret_types.items():
        min_key = f"retaliation{suffix}Min"
        max_key = f"retaliation{suffix}Max"
        min_vals = get(min_key)
        max_vals = get(max_key)
        if min_vals:
            add(label, min_vals)
        if max_vals:
            add(f"{label} Max", max_vals)

    # Retaliation modifiers
    ret_mod_fields = {
        "retaliationDamagePct": "% Retaliation Damage",
        "retaliationTotalDamageModifier": "+% Retaliation Damage",
        "retaliationDamageMultModifier": "+% Retaliation Damage Mult",
        "retaliationStunChance": "Retaliation Stun Chance",
        "retaliationStunMin": "Retaliation Stun Duration",
    }
    for key, label in ret_mod_fields.items():
        vals = get(key)
        if vals:
            add(label, vals)

    # Sort by label for consistent ordering.
    stats.sort(key=lambda s: s["label"])
    return stats


def walk_mastery_skills(
    arz_dir: Path, class_num: str, mastery_id: int, tags: dict[str, str]
) -> list[dict]:
    """Walk a mastery's skill tree and return a list of skill dicts."""
    tree_paths = _parse_classtree(arz_dir, class_num)
    ui_pixels = _parse_ui_skills(arz_dir, class_num)
    ui_grid = _pixel_to_grid(ui_pixels)

    # Build class prefix for skill IDs (e.g. "playerclass01").
    class_prefix = f"playerclass{class_num}"

    skills: list[dict] = []
    current_parent: str | None = None  # record path of the current base skill

    for skill_path in tree_paths:
        data = _get_display_data(arz_dir, skill_path)
        if not data:
            continue

        template = data.get("templateName", "")

        # Skip the mastery bar and skill tree template records.
        if "skill_mastery" in template or "skilltree" in template:
            continue

        display_name_tag = data.get("skillDisplayName", "")
        if not display_name_tag:
            continue

        # Determine if this is a modifier (child) or a base skill.
        is_modifier = template in MODIFIER_TEMPLATES

        if is_modifier:
            parent = current_parent
        else:
            current_parent = skill_path
            parent = None

        # Build skill ID from filename.
        filename = Path(skill_path).stem
        skill_id = f"{class_prefix}.{filename}"

        # Resolve display text.
        name = resolve_text(display_name_tag, tags)
        desc_tag = data.get("skillBaseDescription", "")
        description = resolve_text(desc_tag, tags) if desc_tag else ""

        # Icon.
        icon = data.get("skillUpBitmapName", "")

        # Max rank.
        try:
            max_rank = int(data.get("skillMaxLevel", "0"))
        except ValueError:
            max_rank = 0

        # Tier -> prereqBar.
        try:
            tier = int(data.get("skillTier", "0"))
        except ValueError:
            tier = 0
        prereq_bar = TIER_TO_MASTERY[tier] if 0 < tier < len(TIER_TO_MASTERY) else 0

        # UI position from the UI skill records.
        grid = ui_grid.get(skill_path, {"row": 0, "col": 0})

        # Parent info.
        parent_id: str | None = None
        parent_min_rank = 0
        if parent:
            parent_filename = Path(parent).stem
            parent_id = f"{class_prefix}.{parent_filename}"
            parent_min_rank = 1

        # Extract per-rank stat values.
        skill_stats = extract_skill_stats(data)

        skills.append({
            "id": skill_id,
            "name": name,
            "description": description,
            "icon": icon,
            "maxRank": max_rank,
            "ui": {"row": grid["row"], "col": grid["col"]},
            "prereqBar": prereq_bar,
            "parent": parent_id,
            "parentMinRank": parent_min_rank,
            "stats": skill_stats,
        })

    return skills


def extract_icons_to(tmp: Path) -> Path:
    """Extract UI.arc archives (base + DLC) into a shared directory."""
    base = tmp / "ui"
    already_extracted = base.exists() and any(base.iterdir())
    if already_extracted:
        print(f"Reusing existing UI icons at {base}", file=sys.stderr)
        return base
    base.mkdir(exist_ok=True)
    for arc in ICON_ARCS:
        if not arc.exists():
            continue
        # Extract each arc into the same dir so DLC files merge in.
        subprocess.run(
            ["python3", str(REPO_ROOT / "extract_arc.py"), str(arc), str(base)],
            check=True,
        )
    return base


def convert_icons(
    masteries: list[dict], ui_dir: Path, version: str
) -> dict[str, str]:
    """Convert .tex skill icons to PNG.

    Returns a mapping from original .tex path to the PNG filename.
    """
    # Import tex_to_png directly to avoid subprocess overhead per icon.
    sys.path.insert(0, str(REPO_ROOT))
    from tex_to_png import tex_to_png

    icons_dir = REPO_ROOT / "tools" / "calc" / "data" / "icons" / version
    icons_dir.mkdir(parents=True, exist_ok=True)

    # Collect all unique icon tex paths.
    tex_paths: set[str] = set()
    for m in masteries:
        for s in m["skills"]:
            icon = s.get("icon", "")
            if icon:
                tex_paths.add(icon)

    mapping: dict[str, str] = {}
    converted = 0
    skipped = 0

    for tex_rel in sorted(tex_paths):
        # tex_rel looks like "ui/skills/icons/class01/skillicon_cadence1_up.tex"
        # but extracted files are under ui_dir without the leading "ui/" sometimes,
        # or with various path structures. Try multiple lookups.
        png_name = Path(tex_rel).stem + ".png"
        png_out = icons_dir / png_name

        # Try to find the .tex file.
        # The extracted path mirrors the archive path: skills/icons/classNN/file.tex
        # The icon field in DBR may be "ui/skills/icons/..." or just the path inside the arc.
        tex_file = None
        candidates = [
            ui_dir / tex_rel,
            ui_dir / tex_rel.replace("\\", "/"),
        ]
        # Also try stripping leading directories.
        parts = Path(tex_rel.replace("\\", "/")).parts
        for i in range(len(parts)):
            candidates.append(ui_dir / Path(*parts[i:]))

        for candidate in candidates:
            if candidate.exists():
                tex_file = candidate
                break

        if tex_file is None:
            print(f"  WARN: icon not found: {tex_rel}", file=sys.stderr)
            skipped += 1
            continue

        if not png_out.exists():
            try:
                tex_to_png(tex_file, png_out)
            except Exception as e:
                print(f"  WARN: failed to convert {tex_rel}: {e}", file=sys.stderr)
                skipped += 1
                continue

        mapping[tex_rel] = png_name
        converted += 1

    print(
        f"Icons: {converted} converted, {skipped} skipped",
        file=sys.stderr,
    )
    return mapping


def rewrite_icon_paths(masteries: list[dict], mapping: dict[str, str]) -> None:
    """Replace .tex icon paths with PNG filenames in-place."""
    for m in masteries:
        for s in m["skills"]:
            tex = s.get("icon", "")
            if tex and tex in mapping:
                s["icon"] = mapping[tex]
            elif tex:
                # Keep it but convert to just the filename with .png extension
                # in case conversion failed but we still want a sensible name.
                s["icon"] = ""


def _update_versions(version: str) -> None:
    """Update tools/calc/data/versions.json to include this version."""
    versions_path = REPO_ROOT / "tools" / "calc" / "data" / "versions.json"
    if versions_path.exists():
        data = json.loads(versions_path.read_text())
    else:
        data = {"versions": [], "latest": 0}

    versions = data.get("versions", [])
    if version not in versions:
        versions.append(version)
    data["versions"] = versions
    # Set latest to point to the new version's index.
    data["latest"] = versions.index(version)

    versions_path.write_text(json.dumps(data, indent=2) + "\n")
    print(f"Updated {versions_path}", file=sys.stderr)


def run(tmp: Path, version: str) -> int:
    arz_dir = extract_arz_to(tmp)
    tags = extract_text_to(tmp)
    print(f"Extracted ARZ to {arz_dir}", file=sys.stderr)
    print(f"Loaded {len(tags)} text tags", file=sys.stderr)

    # Verify the first mastery record exists.
    sample = arz_dir / MASTERY_RECORDS["soldier"]
    if not sample.exists():
        print(f"ERROR: expected {sample} not found", file=sys.stderr)
        return 1

    masteries_json: list[dict] = []

    for mastery_id, (key, rel) in enumerate(MASTERY_RECORDS.items(), start=1):
        class_num = f"{mastery_id:02d}"
        dbr_path = arz_dir / rel
        if not dbr_path.exists():
            print(f"  {key}: MISSING at {rel}", file=sys.stderr)
            continue

        mastery_data = read_dbr(dbr_path)
        name_tag = mastery_data.get("skillDisplayName", "?")
        mastery_name = resolve_text(name_tag, tags)
        print(f"  {key}: {mastery_name}", file=sys.stderr)

        # Mastery bar max rank from skillMaxLevel.
        try:
            bar_max = int(mastery_data.get("skillMaxLevel", "50"))
        except ValueError:
            bar_max = 50

        skills = walk_mastery_skills(arz_dir, class_num, mastery_id, tags)
        print(f"    -> {len(skills)} skills", file=sys.stderr)

        if not skills:
            print(f"ERROR: {key} has 0 skills, aborting", file=sys.stderr)
            return 1

        masteries_json.append({
            "id": mastery_id,
            "name": mastery_name,
            "barMaxRank": bar_max,
            "skills": skills,
        })

    output = {
        "gdVersion": version,
        "pointsPerLevel": _vanilla_points_per_level(),
        "questRewardPoints": 3,
        "masteries": masteries_json,
    }

    # Extract and convert skill icons.
    ui_dir = extract_icons_to(tmp)
    icon_mapping = convert_icons(masteries_json, ui_dir, version)
    rewrite_icon_paths(masteries_json, icon_mapping)

    # Write JSON output.
    out_dir = REPO_ROOT / "tools" / "calc" / "data" / "skills"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"skills-{version}.json"
    out_path.write_text(json.dumps(output, indent=2) + "\n")
    print(f"Wrote {out_path}", file=sys.stderr)

    # Update versions.json.
    _update_versions(version)

    # Print summary.
    total_skills = sum(len(m["skills"]) for m in masteries_json)
    print(f"\nSummary: {len(masteries_json)} masteries, {total_skills} total skills",
          file=sys.stderr)
    for m in masteries_json:
        print(f"  {m['name']}: {len(m['skills'])} skills", file=sys.stderr)

    return 0


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--version", required=True)
    p.add_argument("--keep", help="keep extracted data in this directory (debug)")
    args = p.parse_args(argv[1:])

    if args.keep:
        tmp = Path(args.keep)
        tmp.mkdir(parents=True, exist_ok=True)
        return run(tmp, args.version)
    with tempfile.TemporaryDirectory() as tmp_str:
        return run(Path(tmp_str), args.version)


if __name__ == "__main__":
    sys.exit(main(sys.argv))
