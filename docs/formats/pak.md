# PAK

Layout (Yamagi `files.h`): `"PACK"`, int32 directory offset, int32 directory length; entries of 64 bytes
(char name[56], int32 offset, int32 size).

Observed: Kingpin's single `main/Pak0.pak` (114 MB) parses with no diagnostics. 456 entries: 52 maps, `env/`,
`pics/`, `sprites/`, configs. Two further maps, world textures, models and sounds are loose files.

Note the capital P; the upstream engine does not open it on a case-sensitive filesystem.
