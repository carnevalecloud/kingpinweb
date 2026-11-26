# Architecture

```
player's folder ──> src/kingpin (select, rename) ──> src/web/engine-host ──> engine (wasm, WebGL 2)
                          │                                                      ▲
                    IndexedDB (game-store)                     engine/ (pinned upstream + build)
game files ──> src/formats + src/vfs ──> inspector (browser worker, CLI) ──> reports
```

| Path | Responsibility |
| --- | --- |
| `engine/` | Upstream pins, fetch and build scripts, future patches and Kingpin C code |
| `src/formats/` | Bounds-checked parsers and diagnostics. No DOM, no Node |
| `src/vfs/` | Case-insensitive layering of loose files and PAKs |
| `src/kingpin/` | Kingpin-specific data preparation |
| `src/web/` | Static pages; `engine-host.ts` is the only code that knows Emscripten |
| `src/cli/` | Node front end to the inspector |

## Decisions
- **Adopt Qwasm2** rather than port Yamagi or write an engine: it already builds for WebAssembly with a WebGL 2
  renderer, and real Kingpin maps load in it unmodified. Cost: it trails upstream Yamagi.
- **Upstream sources are fetched, not vendored**, and exported clean for every build.
- **Our own host page** instead of editing the upstream shell, so files can be placed in the engine filesystem
  before start. The upstream page is still built and served for comparison.
- **WebGL 2 (`gles3`) is the default renderer.** GL1 via GL4ES also works but is much slower under software GL.
- **Files are copied into the in-memory filesystem** at start. Simple; lazy loading is future work.
- **IndexedDB** holds the selected files in one transaction, so a failed save keeps the previous copy.
- The inspector's virtual filesystem is separate from the engine's. Precedence follows Yamagi
  (loose < pak0 < pak1 …); Kingpin's own order is unverified.
