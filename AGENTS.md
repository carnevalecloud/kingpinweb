# Rules for contributors and coding agents

## Never commit
- Game files, executables or libraries from any game, unauthorised source code.
- Screenshots or logs that contain game art or text. `gamedata/` is gitignored; keep such things there.
- Run `ddev npm run check:assets` before committing.

## Sources
- Do not copy Kingpin SDK code or headers. Its licence has not been cleared (THIRD_PARTY.md).
- Other projects (e.g. freeking, GPL-3.0) may be read for format facts; do not copy code. Cite what you used.
- Pin every upstream revision and container image.

## Engineering
- No speculative structures. A format claim needs a cited source or an observation on real files; say which.
- Unknown or unsupported input produces a diagnostic, never silence.
- `engine/.upstream/` is read-only. Engine changes are patch files in `engine/patches/`; Kingpin code goes in
  `engine/kingpin/`.
- Frontend code must not depend on engine internals beyond `src/web/engine-host.ts`.
- TypeScript runs directly in Node: erasable syntax only, imports with `.ts` extensions.
- Avoid new dependencies.

## Definition of done
- Acceptance criteria written in ROADMAP.md, tests where practical, limitations documented.
- Report only results you actually ran. A skipped test is not a pass (`kingpin.spec.ts` skips without game files).

## Verify
`ddev npm test && ddev npm run build && ddev e2e`
