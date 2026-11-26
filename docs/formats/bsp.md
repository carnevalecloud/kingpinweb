# BSP

`IBSP` version 38, 19 lumps (Yamagi `files.h`; kingpin.info says Kingpin uses it too).

## Observed, 54 maps
- All are version 38 with Quake II record sizes and consistent cross-references.
- Within Quake II limits. Largest: entity text 130,301 of 262,144 bytes; lighting 1,380,273 of 2,097,152;
  texinfo 5,082 of 8,192; faces 15,485; submodels 141.
- Texture names resolve to `main/textures/<name>.tga`; none missing.
- 46 maps have a 256-byte `pop` lump (meaning not investigated).
- 231 entity classnames and 91 distinct keys.

## Surface flags
Bits above Quake II's `0xff` are common, for example `0x1000`, `0x200000`, `0x800000`, `0x1000000`,
`0x4000000`, `0x8000000` and `0x80000000`. freeking names several as materials and masking; **we have not verified
those meanings**, so the inspector reports raw bits.
