#!/usr/bin/env python3
"""Merge mod subdirectories and build hqz.arz.

Usage: python3 build_mod.py

Scans all subdirectories under mods/, merges their records into a single
directory, builds hqz.arz, and copies it to the Grim Dawn mod folder.

Exits with an error if any .dbr file appears in more than one subdirectory.
"""

import os
import shutil
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
MODS_DIR = SCRIPT_DIR / "mods"
MERGED_DIR = Path("/tmp/gd_hqz_merged")
BUILD_SCRIPT = SCRIPT_DIR / "build_arz.py"
GD_MOD_DIR = Path("/mnt/c/Program Files (x86)/Steam/steamapps/common/Grim Dawn/mods/hqz/database")
OUTPUT_ARZ = GD_MOD_DIR / "hqz.arz"


def main():
    if not MODS_DIR.is_dir():
        print(f"ERROR: {MODS_DIR} not found", file=sys.stderr)
        sys.exit(1)

    # Find all mod subdirectories
    subdirs = sorted(d for d in MODS_DIR.iterdir() if d.is_dir())
    if not subdirs:
        print("ERROR: no subdirectories found in mods/", file=sys.stderr)
        sys.exit(1)

    print(f"Found {len(subdirs)} mod components:")

    # Collect all files and check for conflicts
    file_sources = defaultdict(list)
    for subdir in subdirs:
        count = 0
        for dbr in subdir.rglob("*.dbr"):
            rel = dbr.relative_to(subdir)
            file_sources[str(rel)].append(subdir.name)
            count += 1
        print(f"  {subdir.name}: {count} records")

    # Check for conflicts
    conflicts = {f: sources for f, sources in file_sources.items() if len(sources) > 1}
    if conflicts:
        print(f"\nERROR: {len(conflicts)} file(s) exist in multiple subdirectories:", file=sys.stderr)
        for f, sources in sorted(conflicts.items()):
            print(f"  {f} -> {', '.join(sources)}", file=sys.stderr)
        print("\nResolve conflicts before building.", file=sys.stderr)
        sys.exit(1)

    # Merge into temp directory
    if MERGED_DIR.exists():
        shutil.rmtree(MERGED_DIR)
    MERGED_DIR.mkdir(parents=True)
    records_dir = MERGED_DIR / "records"

    for subdir in subdirs:
        for dbr in subdir.rglob("*.dbr"):
            rel = dbr.relative_to(subdir)
            dest = records_dir / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(dbr, dest)

    total = sum(1 for _ in records_dir.rglob("*.dbr"))
    print(f"\nMerged {total} records from {len(subdirs)} components")

    # Build .arz
    print(f"Building {OUTPUT_ARZ}...")
    result = subprocess.run(
        [sys.executable, str(BUILD_SCRIPT), str(MERGED_DIR), str(OUTPUT_ARZ)],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print(f"ERROR: build failed:\n{result.stderr}", file=sys.stderr)
        sys.exit(1)

    # Print last line of build output (the summary)
    for line in result.stdout.strip().splitlines():
        if line.startswith("Built"):
            print(line)

    print("Done!")


if __name__ == "__main__":
    main()
