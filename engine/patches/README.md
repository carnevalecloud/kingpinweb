# Engine patches

The upstream flavour never applies these patches. Build the experimental flavour with `ddev engine build --flavour=kingpin`.

001 introduces the native main directory, game_main.wasm and an isolated persistent filesystem. 002 disables the Quake II status bar. The game module still contains Quake II logic.

Patches are applied with a Git ceiling directory; the build fails if one does not apply.

003 loads MDX through the alias renderer. 004 adds `kpweb_static_model`. 005 lets that entity drop to the floor,
take map lighting and cycle idle frames; draws PCX skins with their own palette; raises the renderer, snapshot and
loopback message limits so dozens of models fit in view; and adds an optional view direction to `teleport`.

006 makes the standing player Kingpin's height: box top 48 instead of 32, with a provisional eye offset of 40. See
[player physics](../../docs/compatibility/player-physics.md).

007 adds `kpweb_cast` and `path_corner_cast`. The build copies `engine/kingpin/` into the game sources, and
`g_spawn.c` includes `kp_cast.c` from there.
