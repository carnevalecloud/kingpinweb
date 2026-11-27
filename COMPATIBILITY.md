# Compatibility

Tested 2026-11-26 with a Steam installation, headless Chromium with software WebGL, engine unmodified.
Per-map and per-entity tables: [maps](docs/compatibility/maps.md), [entities](docs/compatibility/entities.md).

## Models in the experimental engine

When a map is started, the page rewrites its entity list in memory and packs the needed models into an extra
archive; the player's files are unchanged. Props, light fixtures and pickups appear as static
scenery, not solid. Characters are solid and mortal; some walk, and thugs, runts, bitches and dogs fight back in
gangs. The page shows health, and dying restarts the map (checked only by automated sr1 runs). Details and gaps:
[entity models](docs/compatibility/entity-models.md). Model lighting is Quake II's point sample of the lightmap.
Only sr1 has been toured by automated viewpoints.

## Experimental engine

The experimental build includes a native `main` directory, isolated storage, and suppression of the incompatible Quake II status bar. On 2026-11-26 it started the synthetic room and loaded and walked sr1-sr4 and bar_sr, with the same Quake II physics. The opt-in 54-map matrix has not been run. The tables below describe the unmodified engine.

## Works
| Item | Evidence |
| --- | --- |
| Map load, world geometry, textures, lightmaps | sr1-sr4, bar_sr load; sr1 screenshot checked by eye |
| TGA-only world textures | Synthetic test, GLES3 and GL1 |
| Walking, gravity, wall collision (Quake II rules) | Synthetic test; movement on the five maps |
| Remembering selected files | Browser test, synthetic and real files |

## Does not work or is unverified (upstream engine)
- **Player physics are Quake II's.** Size, eye height, speed and jumping are not Kingpin's.
- **No characters or props in the upstream engine.** 187 of 231 classnames have no spawn function. Models and sounds are not loaded.
- Doors, buttons, triggers, level changes and cutscenes are untested; matching names may behave differently.
- Surface flags beyond Quake II are ignored. Transparency, flares, fog, fire and smoke are missing or unverified.
- Sky loading failed for at least one face in bar_sr.
- The Quake II status bar looks for pictures that do not exist. Its notices are hidden, not fixed.
- No music or sound, menus, saves, combat, NPCs or missions.
- Only 5 of 54 maps have been run. No testing on real GPUs by automation, Firefox, Safari or mobile.
- Upstream looks for lower-case `pak0.pak` under `baseq2`; the walkthrough page renames files to suit.
- Changing map needs a page reload. About 160 MB is held in memory.
- Settings and saves would share the upstream engine's `baseq2` browser storage.
