# Grim Dawn mod: hqz

A combined Grim Dawn mod built from independent components. Each subdirectory under `mods/` contains one aspect of the mod, and they are merged into a single `hqz.arz` at build time.

## Building

```bash
python3 build_mod.py
```

This merges all subdirectories under `mods/`, checks for file conflicts, builds `hqz.arz`, and copies it to the Grim Dawn mod folder. Restart the game after building.

## Scripts

* `build_mod.py`: Merges all mod components and produces `hqz.arz`. Exits with an error if any `.dbr` file appears in more than one subdirectory (conflicts must be resolved manually).
* `build_arz.py`: Low-level tool that compiles a directory of `.dbr` files into a `.arz` archive. Used internally by `build_mod.py`.
* `extract_arz.py`: Extracts `.dbr` records from an existing `.arz` archive. Useful for importing records from other mods.

## Mod components

### custom_playerlevels

Custom player progression overrides:

* 3 attribute points per level (vanilla: 1)
* 2x XP gain (divides the XP formula by 2)
* 6/4/2 skill points per level (vanilla: 3/2/1)
* 110 max devotion points (vanilla: 55)

### increased_move_speed

Increases base character run speed to 1.2x (vanilla: ~1.0).

### increased_loot_rarity

Modified boss, hero, and treasure trove loot tables with increased drop rates for rare and epic items.

### max_affixes

Removes RNG from item affix stat rolls. For every affix with a min/max range (e.g. "5-10 fire damage"), the min is set equal to the max so the affix always rolls its best value. Covers 332 offensive, defensive, and retaliation affixes.

### more_devotion_points

Modifies all devotion shrines to grant additional devotion points, raising the effective cap to 110.
