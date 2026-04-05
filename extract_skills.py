#!/usr/bin/env python3
"""Extract Grim Dawn class-skill data into a per-version JSON snapshot.

Usage:
    python3 extract_skills.py --version 1.2.1.5
"""
import argparse
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

# Maps a local key -> the DBR record path. These paths are GUESSES and must
# be verified by inspecting the extracted data.
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


def extract_arz_to(tmp: Path) -> Path:
    out = tmp / "arz"
    out.mkdir(exist_ok=True)
    subprocess.run(
        ["python3", str(REPO_ROOT / "extract_arz.py"), str(DATABASE_ARZ), str(out)],
        check=True,
    )
    return out


def extract_text_to(tmp: Path) -> dict[str, str]:
    base = tmp / "text"
    base.mkdir(exist_ok=True)
    tags: dict[str, str] = {}
    for i, arc in enumerate(TEXT_ARCS):
        if not arc.exists():
            continue
        out = base / f"arc{i}"
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
# Map them to the correct GDX-prefixed tags.
TAG_FIXUPS = {
    "TagClass07SkillName00": "tagGDX1Class07SkillName00A",
    "TagClass08SkillName00": "tagGDX1Class08SkillName00A",
    "TagClass09SkillName00": "tagGDX2Class09SkillName00A",
}


def resolve_text(value: str, tags: dict[str, str]) -> str:
    # Apply known fixups for broken DLC tag references.
    fixed = TAG_FIXUPS.get(value, value)
    if fixed in tags:
        return tags[fixed]
    # Fall back to case-insensitive match.
    if fixed.lower().startswith("tag"):
        lower = fixed.lower()
        for k, v in tags.items():
            if k.lower() == lower:
                return v
    return value


def run(tmp: Path, version: str) -> int:
    arz_dir = extract_arz_to(tmp)
    tags = extract_text_to(tmp)
    print(f"Extracted ARZ to {arz_dir}", file=sys.stderr)
    print(f"Loaded {len(tags)} text tags", file=sys.stderr)

    # Verify the first mastery record exists
    sample = arz_dir / MASTERY_RECORDS["soldier"]
    if not sample.exists():
        print(f"ERROR: expected {sample} not found", file=sys.stderr)
        print("Listing candidates under records/skills/playerclass*/:", file=sys.stderr)
        for p in sorted((arz_dir / "records" / "skills").glob("playerclass*/*.dbr")):
            print(f"  {p.relative_to(arz_dir)}", file=sys.stderr)
        return 1

    print(f"Found {len(MASTERY_RECORDS)} mastery records:", file=sys.stderr)
    for key, rel in MASTERY_RECORDS.items():
        dbr = arz_dir / rel
        if dbr.exists():
            d = read_dbr(dbr)
            name_tag = d.get("skillDisplayName", "?")
            resolved = resolve_text(name_tag, tags)
            print(f"  {key}: {name_tag} -> {resolved}", file=sys.stderr)
        else:
            print(f"  {key}: MISSING at {rel}", file=sys.stderr)
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
