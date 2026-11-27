# Entity models

How the experimental flavour shows Kingpin entities. The table lives in `src/kingpin/entity-registry.ts`; this page
records where its claims come from. Observed 2026-11-26 on a Steam installation (app 38430).

## Evidence
| Label | Meaning |
| --- | --- |
| definition | The model path is named by `kprad/kingpin.def`, the editor entity definitions installed with the game. Only classnames, paths, bounding boxes and key names were used as facts; no text or code is copied. |
| assets | Inferred from installed file names. May be wrong. |

Inferred entries: `cast_thug_sit`, `props_rat`, `weapon_flamethrower` (the definition names the flame ammunition
icon; the `g_flamegun` models are used), `key_fuse`, the four weapon mods, `item_adrenaline`, `item_pack`,
`item_oilcan`, `item_valve`, `item_safedocs` and `item_lizzyhead`.

## Observed in the files
- All 537 models are loose files under `main/models`; `Pak0.pak` holds none. It holds the maps.
- A character is three MDX parts (head, body, legs) in one model space with equal frame counts; drawing them at one
  origin and frame assembles it.
- `art_skins` is three numbers: head, body, legs, naming `<part>_NNN.tga`. Checked against all character entities
  of the 52 packed maps.
- `punk`, `bum_sit` and `thug_sit` use the thug's skins; `shorty` the runt's; `whore` the bitch's. Runt folders have
  no leg skins; every leg number used by runts and shorties exists for the thug.
- Model skin paths mix case, and some begin with `/`. Several point into `textures/`.
- PCX model skins carry their own palettes.

## Inferred rules
| Rule | Basis |
| --- | --- |
| `head` 1, 2, 3 select `bald_head`, `pony_head`, `weld_head` | Maps pair 1 with 5xx skins, 2 with 6xx, 3 with 700. Falls back to `head` if the actor lacks the model |
| Crate spawn flag 16 selects cardboard, 4 the second wood skin, otherwise the first | Flag names in the definition, model and skin names. Metal crates show wood |
| `light_sconce` flags 16, 32, 64, 128 select blue, green, red, yellow | Flag names and file names |
| Flag and pinball flags select variant 1 to 3 | Flag names and file names |
| `scale` scales a character about its feet | Key name; used by 11 distinct values |
| `option` and `lightit` do not affect visibility | The definition describes `option` as a detail-level switch; `lightit` is unexplained and ignored |

## Driven characters (patch 007)

Standing `cast_thug` and `cast_punk` are solid, take damage, flinch, die, and walk `path_corner_cast` chains. The
engine code is `engine/kingpin/kp_cast.c`, written against the Quake II game module. Other characters stay scenery.

- Animations used, by frame name: `amb_stand` or `stand`, `walk_guns_dn` or `walk_gdown`, `pain_chest`, `death1`.
- Walk speed (60 units per second), the pain delay and default health (100) are placeholders, not measurements.
- Paths with a `scriptname` on any node are ignored: they belong to cutscenes.
- They never attack or react beyond flinching. There are no sounds, and saving is untested.

## Not shown
- Characters with spawn flag TRIGGERED_START (2), scripted `*_animate` props, riding motorcycles.
- Effects and spawn points: fires, smoke, steam, rain, rat and fish spawners, live fish, `light_bulb`,
  multiplayer cash spawns and safe bags.
- Hats, cigars and held weapons of characters.
- Files absent from the installation: some parts of `props2_truck_die`, `props2_lighthouse_beam` and
  `props3_cut_truck_driver` were reported unresolved by the all-map run.
