# Third-party software and sources

Reviewed 2026-11-26. Exact pins: `engine/upstream.lock`, `.ddev/docker-compose.*.yaml`, `package-lock.json`.

## Compiled into the distributed engine
| Component | Revision | Licence | Notes |
| --- | --- | --- | --- |
| [Qwasm2](https://github.com/GMH-Code/Qwasm2) | `c9ab0934` | GPL-2.0-or-later | Gregory Maynard-Hoare's port of Yamagi Quake II 8.60 (id Software's Quake II). Its LICENSE lists further bundled code (zlib, Info-ZIP, miniz, stb, GLAD, others). |
| [GL4ES](https://github.com/ptitSeb/gl4es) | `8b1a3da5` | MIT | Used by the GL1 renderer only. Built with `-fPIC`, source unchanged. |
| SDL 2.32.10 | Emscripten port | zlib | Downloaded and hash-checked by Emscripten. |
| Emscripten 5.0.6 runtime | pinned image | MIT / NCSA | |

The build copies the Qwasm2 and GL4ES licence texts, their source archives and the build script into
`dist/engine/upstream/`. Before public distribution, check that this satisfies GPL source obligations for every
linked component, including the SDL and Emscripten runtime notices, which are **not yet copied**.

## Development tools (not distributed, except Vite's small runtime helpers)
Playwright 1.64.0 (Apache-2.0), TypeScript 7.0.2 (Apache-2.0), Vite 8.3.8 (MIT), Vitest 5.0.5 (MIT).

## Consulted, no code copied
| Source | Used for |
| --- | --- |
| [Yamagi Quake II](https://github.com/yquake2/yquake2) (GPL-2.0) | Format layouts and limits, via the Qwasm2 copy |
| [freeking](https://github.com/ernestbuffington/freeking) `921dc554` (GPL-3.0) | Cross-check of MDX field order and Kingpin texture paths |
| [kingpin.info MDX](https://kingpin.info/?p=mdx) (TiCaL), [BSP](https://kingpin.info/?p=bsp) (Max McGuire), [MD2](https://kingpin.info/?p=md2) | Format descriptions |

`src/formats/q2-classnames.ts` is a list of names generated from the GPL engine source.

## Not used
**Kingpin SDK.** Not downloaded or read. A search result summary of its readme says it is for personal
non-commercial use and restricts reverse engineering; the full text is unreviewed. Research material only until
cleared. The editing tools shipped inside the game folder (`kprad/`) are likewise unused.

## Game data
Never included. Players supply their own. `gamedata/` is local and gitignored.
