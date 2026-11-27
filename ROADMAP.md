# Roadmap

The first major milestone is a browser-rendered, explorable original Skidrow map. A rough form of it works
(sprint 3); it is not complete until the criteria of sprint 4 are met.

## Done

### Sprint 1: Foundation
- [x] DDEV with pinned Emscripten and Playwright images
- [x] Unmodified Qwasm2 builds reproducibly (two clean builds, identical hashes)
- [x] Engine initialises in headless Chromium; renders and collides with a synthetic map (GLES3 and GL1)

### Sprint 2: Asset inspector
- [x] PAK, BSP 38, MD2, MDX and TGA inspection, CLI and browser page
- [x] Malformed and truncated input tests
- [x] Run on a real installation: 1 PAK, 54 maps, 583 models, 3419 textures, no errors

### Sprint 3: First walkthrough (upstream engine, unmodified)
- [x] Browser page maps a player's folder to the engine layout; optional IndexedDB persistence
- [x] sr1-sr4 and bar_sr load, render and allow movement (automated)

## Next

### Sprint 4: Faithful Skidrow
Accept when: a person has walked sr1 end to end and recorded defects; player dimensions, eye height and speeds are
taken from evidence and have collision tests; masked, translucent and sky surfaces look right; no console spam.
- First engine patches, as a second "kingpin" build flavour beside the upstream one (builds and runs)
- Browser engine selector and launch-time import path mapping implemented; verified on the synthetic room and five original maps
- Player physics baseline and measurement protocol: [evidence matrix](docs/compatibility/player-physics.md); original values still unverified
- Native Kingpin filesystem (`main/`, `Pak0.pak`) instead of renaming to `baseq2`
- Investigate surface flags beyond Quake II, `lightflare` and fog keys
- Disable the incompatible Quake II status bar during walkthrough (done in the experimental build); replace it with a Kingpin HUD later
- Opt-in 54-map runtime test matrix defined for both flavours; full run pending

### Sprint 5: Models and props (prioritized ahead of physics tuning)
- [x] MDX and MD2 render natively with skins; synthetic MDX pixel test passes
- [x] Original props, light fixtures, characters and pickups appear in sr1: 42 props, 18 characters, 10 pickups,
  none unresolved; checked by screenshots and by comparing views with entity drawing off
- [x] Characters assembled from head, body and legs with `art_skins`, standing and cycling an idle animation
- [x] sr2-sr4, bar_sr, pv_h and sy2 load with models and no model errors (start view only, not toured)
- [ ] A person has walked sr1 and recorded placement defects
- [ ] Hats, cigars and held weapons; triggered characters; scripted prop animations
- [ ] `junior` (item placed by the thousand, no definition entry examined yet), fires, smoke and flares
- [ ] Thugs and punks are solid, take damage, die and walk unscripted paths. Accept when a person has seen, in sr1,
  a thug block them, flinch and die when shot, and the punk walking its loop. An automated sr1 run saw a thug die and
  the punk pass path nodes; no person has checked yet
- [ ] Solid props and other characters; pickup behaviour

Evidence and inferred rules: [entity models](docs/compatibility/entity-models.md).

### Sprint 6+
Interactive world entities and level changes; sounds; save/load; weapons and inventory; NPCs, navigation data and
dialogue; mission progression; mobile and performance; modding and multiplayer.

## Testing still missing
Model animation, entity behaviour, save/load, and memory and performance regression tests. They arrive with the
features they cover; memory use of the file import should get a budget test in sprint 4.
