# KINGPIN//WEB

A browser-native compatibility engine for *Kingpin: Life of Crime* (1999), built from player-supplied game files.
Not a remake, a stream or an emulator.

**Status: you can walk around original maps. The game is not playable.** See [COMPATIBILITY.md](COMPATIBILITY.md).

No game files are included, and none may be committed.

## Requirements

Docker and DDEV 1.25 or newer. Everything else (Node, Emscripten, browsers) is pinned inside containers.

## Quick start

```bash
ddev start
ddev npm ci
ddev engine build      # fetches pinned sources, compiles to public/engine/
ddev npm run build     # static site in dist/
```

Open <https://kingpinweb.ddev.site>. **Map walkthrough** asks for your Kingpin folder, for Steam typically
`C:\Program Files (x86)\Steam\steamapps\common\Kingpin`. Files stay in the browser; they can be remembered
(IndexedDB) and forgotten again from the same page. Click the view to capture the mouse; WASD, Space, C.

## Experimental engine

Build both flavours with `ddev engine build --flavour=upstream` and `ddev engine build --flavour=kingpin`, then rebuild the site. The walkthrough engine selector defaults to the reference build. The experimental flavour targets `/main` and separate engine storage; it still uses Quake II game logic; only the synthetic room and five maps have been run. Existing remembered imports work with either flavour.

## Full map audit

In the Playwright container, set `KP_ALL_MAPS=1` to run all 54 original maps, and `KP_ENGINE=kingpin` to select the experimental engine. Reports stay in `gamedata/reports/<flavour>/`. The default remains the five-map upstream smoke suite. Original assets are required locally.

## Commands

| Command | Purpose |
| --- | --- |
| `ddev engine build [--verify-reproducible]` | Compile the engine (optionally twice, comparing hashes) |
| `ddev engine clean` | Remove engine build output |
| `ddev npm run dev` | Vite dev server on <https://kingpinweb.ddev.site:5173> |
| `ddev npm test` | Unit tests |
| `ddev npm run build` | Type check, build `dist/`, scan it for game files |
| `ddev e2e` | Browser tests against `dist/` (build first) |
| `ddev npm run check:assets` | Fail if game files or executables could be committed |
| `ddev inspect <path> [--report out.md] [--json out.json]` | Asset inspector (path inside the project) |

To inspect an installation outside the project, run with Node 24 on the host:
`node src/cli/inspect.ts "<Kingpin>/main" --report gamedata/report.md`

## Deploying

### Cloudflare (Workers Builds)

| Setting | Value |
| --- | --- |
| Build command | `npm run build` or `npm run build:cloudflare` |
| Deploy command | `npx wrangler deploy` |

Both commands compile both engine flavours there: Workers Builds sets `WORKERS_CI=1`, which makes `npm run build`
run the full build. Elsewhere `npm run build` builds only the web pages. `wrangler.jsonc` publishes
`dist/` as static assets. The build downloads Emscripten and takes several minutes.

To deploy from your own machine instead: `ddev engine build && ddev npm run build`, then `ddev exec npx wrangler login`
and `ddev exec npx wrangler deploy`.

### Other hosts

Copy `dist/` to any static host. No backend is needed. `dist/engine/upstream/` carries the GPL licence texts and
corresponding source; keep them when distributing. Serve `.wasm` as `application/wasm`.

## Documentation

[Roadmap](ROADMAP.md) · [Compatibility](COMPATIBILITY.md) · [Third-party software](THIRD_PARTY.md) ·
[Architecture](docs/architecture.md) · [Development](docs/development.md) · [File formats](docs/formats/README.md) ·
[Contributor and agent rules](AGENTS.md)

## Licence

Copyright (C) 2026 the KINGPIN//WEB authors.

This program is free software; you can redistribute it and/or modify it under the terms of the GNU General Public
License as published by the Free Software Foundation; either version 2 of the License, or (at your option) any
later version. It is distributed WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
FITNESS FOR A PARTICULAR PURPOSE. See [LICENSE](LICENSE).

Third-party components keep their own licences ([THIRD_PARTY.md](THIRD_PARTY.md)). The licence covers no game
content: Kingpin is the property of its rights holders, and this project is not affiliated with or endorsed by them.
