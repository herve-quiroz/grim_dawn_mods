# Grim Dawn mod development

## Commit configuration

* Author Name: `Claude Code`
* Author Email: `herve.quiroz+claude@gmail.com`
* Do NOT add a `Co-Authored-By:` line in commit messages

## Key facts about Grim Dawn modding

* Grim Dawn only loads `.arz` archives, not loose `.dbr` files. The `.arz` must be named `<modname>.arz` (e.g. `hqz.arz` for the `hqz` mod folder).
* `.dbr` files are CSV-like text records (`key,value,` per line). They are the source format compiled into `.arz`.
* Records override base game records by matching their path (e.g. `records/creatures/pc/playerlevels.dbr`).
* The mod lives at `/mnt/c/Program Files (x86)/Steam/steamapps/common/Grim Dawn/mods/hqz/`.
* A backup of the original merged mod (before we restructured) is at `hqz_backup_20260317` in the mods folder.

## Project structure

* `mods/<component>/` subdirectories each contain `.dbr` files for one aspect of the mod. The directory structure inside each component mirrors the game's record paths (e.g. `creatures/pc/playerlevels.dbr`).
* No two components may contain the same `.dbr` file. If a file needs changes from multiple components, it must live in only one of them with the combined changes.
* `build_mod.py` merges all components and produces `hqz.arz`. Run it after any change.
* `extract_arz.py` can import records from other mods' `.arz` files into a directory.
* `build_arz.py` is the low-level `.arz` compiler used by `build_mod.py`.

## Development workflow

1. To add a new mod component: create a new subdirectory under `mods/`, add `.dbr` files, run `python3 build_mod.py`.
2. To import from an existing mod: `python3 extract_arz.py <mod>.arz /tmp/extracted`, then copy the records you want into a new `mods/<component>/` directory.
3. To modify a value: edit the `.dbr` file directly, then run `python3 build_mod.py`.
4. Always create a new character to test (existing characters may have cached/corrupt state from previous mod versions).

## Importing `.dbr` entry types

The `build_arz.py` script guesses entry types (int, float, string, bool) from field names and values. Known string fields are hardcoded. If a new record type fails to load in-game, the type guessing in `build_arz.py` may need updating.

## References

* Official modding guide: https://www.grimdawn.com/downloads/Grim%20Dawn%20Modding%20Guide.pdf

## README maintenance

Keep `README.md` up to date when adding, removing, or renaming mod components. Each component should have a section explaining what it changes and the specific values.
