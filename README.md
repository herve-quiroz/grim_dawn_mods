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

### boosted_summons

Increases the max allocatable skill points for permanent pet-scaling summon skills to halfway between the base cap and the soft cap. This reduces reliance on +skill gear RNG for summoner builds.

* Summon Hellhound (Occultist): 16 -> 21
* Summon Familiar/Raven (Occultist): 16 -> 21
* Summon Briarthorn (Shaman): 16 -> 21
* Summon Blight Fiend (Necromancer): 16 -> 21
* Raise Skeletons (Necromancer): 16 -> 21
* Undead Legion (Necromancer): 12 -> 17

### custom_playerlevels

Custom player progression overrides:

* 3 attribute points per level (vanilla: 1)
* 2x XP gain (divides the XP formula by 2)
* 6/4/2 skill points per level (vanilla: 3/2/1)
* 1000 max devotion points (vanilla: 55)

### faster_constellation_skill_leveling

Reduces XP requirements for devotion constellation proc skills by 2x (52 skills). Constellations level up faster through combat.

### faster_faction_rep

Speeds up faction reputation gain:

* Lower tier thresholds: 1000 / 2000 / 5000 / 10000 (vanilla: 1500 / 5000 / 10000 / 25000)
* Reputation gain reduction from monster kills disabled until Revered

### increased_loot_rarity

Modified boss, hero, and treasure trove loot tables with increased drop rates for rare and epic items.

### increased_move_speed

Increases base character run speed to 1.5x (vanilla: ~1.0).

### max_affixes

Removes RNG from item affix stat rolls. For every affix with a min/max range (e.g. "5-10 fire damage"), the min is set equal to the max so the affix always rolls its best value. Covers 1227 affixes across the base game and both expansions.

### more_devotion_points

Modifies all devotion shrines to grant 2 devotion points instead of 1.

### more_iron_bits

Increases gold (iron bits) drops by 20x across all money generators.
