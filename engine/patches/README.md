# Engine patches

The upstream flavour never applies these patches. Build the experimental flavour with `ddev engine build --flavour=kingpin`.

001 introduces the native main directory, game_main.wasm and an isolated persistent filesystem. The game module still contains Quake II logic. Build and runtime verification are pending.
