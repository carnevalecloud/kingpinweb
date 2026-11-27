# Engine patches

The upstream flavour never applies these patches. Build the experimental flavour with `ddev engine build --flavour=kingpin`.

001 introduces the native main directory, game_main.wasm and an isolated persistent filesystem. 002 disables the Quake II status bar. The game module still contains Quake II logic.

Patches are applied with a Git ceiling directory; the build fails if one does not apply.
