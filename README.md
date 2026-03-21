# Grim Dawn mod: hqz

A quality-of-life mod for Grim Dawn that speeds up progression, removes stat roll RNG, and buffs summoner builds.

## Installation

Download the latest `hqz-mod.zip` from the [releases page](../../releases), extract it into your Grim Dawn `mods/` folder (e.g. `C:\Program Files (x86)\Steam\steamapps\common\Grim Dawn\mods\`), and select the "hqz" mod from the game's custom game menu.

## What this mod changes

### Character progression

* 3 attribute points per level (vanilla: 1)
* 6/4/2 skill points per level (vanilla: 3/2/1)
* 2x XP gain
* 1000 max devotion points (vanilla: 55)
* Devotion shrines grant 2 points instead of 1
* Devotion constellation proc skills level 2x faster

### Summoner builds

Permanent pet-scaling summon skills can be leveled 5 points higher without +skill gear:

* Summon Hellhound (Occultist): 16 -> 21
* Summon Familiar/Raven (Occultist): 16 -> 21
* Summon Briarthorn (Shaman): 16 -> 21
* Summon Blight Fiend (Necromancer): 16 -> 21
* Raise Skeletons (Necromancer): 16 -> 21
* Undead Legion (Necromancer): 12 -> 17

### Items and loot

* All affix stat rolls are maxed (min set to max for 1227 affixes across the base game and both expansions)
* Increased drop rates for rare and epic items from bosses, heroes, and treasure troves
* Gold (iron bits) drops increased by 20x

### Faction reputation

* Lower tier thresholds: 1000 / 2000 / 5000 / 10000 (vanilla: 1500 / 5000 / 10000 / 25000)
* Reputation gain reduction from monster kills disabled until Revered

### Movement

* Base run speed increased to 1.5x

## Development

The mod is built from independent components under `mods/`. Each subdirectory contains `.dbr` override records for one aspect of the mod. No two components may contain the same `.dbr` file.

### Building

```bash
python3 build_mod.py
```

This merges all components, checks for file conflicts, builds `hqz.arz`, and copies it to the Grim Dawn mod folder. Restart the game after building.

### Scripts

* `build_mod.py`: Merges all mod components and produces `hqz.arz`. Accepts an optional output path argument for CI builds.
* `build_arz.py`: Low-level `.arz` compiler used internally by `build_mod.py`.
* `extract_arz.py`: Extracts `.dbr` records from an existing `.arz` archive. Useful for importing records from other mods.

### Components

| Component | Records | Description |
|---|---|---|
| `boosted_summons` | 6 | Raises max skill points for pet summon skills |
| `custom_playerlevels` | 1 | Attribute/skill points, XP, devotion cap |
| `faster_constellation_skill_leveling` | 52 | Reduced XP for constellation procs |
| `faster_faction_rep` | 16 | Lower faction tier thresholds |
| `increased_loot_rarity` | 36 | Better boss/hero/trove drop rates |
| `increased_move_speed` | 3 | Faster base run speed |
| `max_affixes` | 1227 | All affix min values set to max |
| `more_devotion_points` | 60 | Shrines grant double devotion |
| `more_iron_bits` | 11 | 20x gold drops |
