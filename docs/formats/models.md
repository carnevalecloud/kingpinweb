# Models

## MD2
`IDP2` v8, 68-byte header (Yamagi). Observed: 150 files, no errors; 9 are longer than `offsetEnd`.

## MDX (Kingpin)
`IDPX` v4. 23 int32 header (92 bytes): ident, version, skinWidth, skinHeight, frameSize, numSkins, numVertices,
numTriangles, numGlCommands, numFrames, numSfxDefines, numSfxEntries, numSubObjects, offsets for skins,
triangles, frames, GL commands, vertex info, SFX definitions, SFX entries, bounding boxes, dummy end, end.
Source: kingpin.info (TiCaL), same order in freeking.

Frames: 40-byte header (scale, translate, name[16]) then 4 bytes per vertex. GL commands: int count (sign selects
strip or fan), int sub-object, then (float s, float t, int vertex); zero ends. Boxes: 6 floats per sub-object per
frame. Triangles carry texture indices but there is no texture-coordinate table.

Observed, 433 files: no structural errors. Differences from the documentation:
- 86 diagnostics for exceeding documented limits; frame counts reach 1024 (documented maximum 512).
- 32 files are longer than `offsetEnd`, by 64 to 146,944 bytes. Contents unknown.
- Up to 25 sub-objects, 12 skins, 1,896 vertices, 1,236 triangles.
- Up to 3 SFX definitions and 7 SFX entries per file (documentation says usually one). Not parsed.
