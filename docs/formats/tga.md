# Textures

Observed: 3,419 TGA files, all uncompressed true colour: 3,031 at 24 bits, 388 at 32 bits. 234 diagnostics report
non-power-of-two sizes.

World surfaces reference `textures/<name>` without extension. The unmodified engine looks for `.wal` first; with
`r_retexturing 1` (default) it loads a `.tga` when no `.wal` exists and takes the dimensions from the TGA.
