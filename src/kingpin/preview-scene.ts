// Original synthetic preview-room assets, also shared by browser regression tests.

/** Little-endian append-only writer. */
export class Writer {
  private readonly data: number[] = [];
  private readonly scratch = new DataView(new ArrayBuffer(4));

  get length(): number {
    return this.data.length;
  }
  u8(...values: number[]): this {
    for (const v of values) this.data.push(v & 0xff);
    return this;
  }
  i16(...values: number[]): this {
    for (const v of values) this.u8(v, v >> 8);
    return this;
  }
  i32(...values: number[]): this {
    for (const v of values) this.u8(v, v >> 8, v >> 16, v >> 24);
    return this;
  }
  f32(...values: number[]): this {
    for (const v of values) {
      this.scratch.setFloat32(0, v, true);
      this.u8(...new Uint8Array(this.scratch.buffer));
    }
    return this;
  }
  /** NUL-padded fixed-width string. */
  str(text: string, width: number): this {
    if (text.length > width) throw new Error(`"${text}" does not fit in ${width} bytes`);
    for (let i = 0; i < width; i++) this.data.push(i < text.length ? text.charCodeAt(i) : 0);
    return this;
  }
  raw(bytes: ArrayLike<number>): this {
    for (let i = 0; i < bytes.length; i++) this.data.push(bytes[i]!);
    return this;
  }
  bytes(): Uint8Array {
    return Uint8Array.from(this.data);
  }
}

export const text = (value: string) => new TextEncoder().encode(value);

export function buildPak(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const offsets: number[] = [];
  let at = 12;
  for (const file of files) {
    offsets.push(at);
    at += file.data.length;
  }
  const w = new Writer().str("PACK", 4).i32(at, files.length * 64);
  for (const file of files) w.raw(file.data);
  files.forEach((file, i) => w.str(file.name, 56).i32(offsets[i]!, file.data.length));
  return w.bytes();
}

/** Uncompressed 24-bit TGA filled with one colour, with a darker grid. */
export function buildTga(width: number, height: number, [r, g, b]: [number, number, number]): Uint8Array {
  const w = new Writer().u8(0, 0, 2).i16(0, 0).u8(0).i16(0, 0, width, height).u8(24, 0);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const k = x % 32 < 2 || y % 32 < 2 ? 0.5 : 1;
      w.u8(b * k, g * k, r * k);
    }
  }
  return w.bytes();
}

export const PALETTE = { black: 0, white: 15, green: 16, greenDark: 17, transparent: 255 } as const;

function palette(): Uint8Array {
  const p = new Uint8Array(768);
  const set = (i: number, r: number, g: number, b: number) => p.set([r, g, b], i * 3);
  for (let i = 0; i < 256; i++) set(i, i, i, i);
  set(PALETTE.black, 0, 0, 0);
  set(PALETTE.white, 255, 255, 255);
  set(PALETTE.green, 30, 170, 40);
  set(PALETTE.greenDark, 15, 90, 20);
  return p;
}

/** 8-bit RLE PCX with the shared synthetic palette. */
export function buildPcx(width: number, height: number, pixel: (x: number, y: number) => number): Uint8Array {
  const bytesPerLine = width + (width & 1);
  const w = new Writer()
    .u8(0x0a, 5, 1, 8)
    .i16(0, 0, width - 1, height - 1, 72, 72)
    .raw(new Uint8Array(48))
    .u8(0, 1)
    .i16(bytesPerLine, 1)
    .raw(new Uint8Array(58));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < bytesPerLine; x++) {
      const value = x < width ? pixel(x, y) : 0;
      if (value >= 0xc0) w.u8(0xc1);
      w.u8(value);
    }
  }
  return w.u8(0x0c).raw(palette()).bytes();
}

/** Quake II .wal texture, four mip levels. */
export function buildWal(name: string, size: number, pixel: (x: number, y: number) => number): Uint8Array {
  const mips = [0, 1, 2, 3].map((level) => size >> level);
  const offsets: number[] = [];
  let at = 100;
  for (const s of mips) {
    offsets.push(at);
    at += s * s;
  }
  const w = new Writer().str(name, 32).i32(size, size, ...offsets).str("", 32).i32(0, 0, 0);
  mips.forEach((s, level) => {
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) w.u8(pixel(x << level, y << level));
  });
  return w.bytes();
}

// ---------------------------------------------------------------- BSP 38 room

type Vec = [number, number, number];

export const ROOM = { mins: [-256, -256, 0] as Vec, maxs: [256, 256, 192] as Vec };
export const FLOOR_TEXTURE = "kpweb/floor";
export const WALL_TEXTURE = "kpweb/wall";

export interface RoomOptions {
  version?: number;
  /** Extra entity blocks appended to the entity lump. */
  extraEntities?: string;
  /** Surface flags of the wall texinfo records. */
  wallFlags?: number;
}

/**
 * A closed box room: six BSP nodes, one solid and one empty leaf, six wall
 * brushes for collision, no lightmaps (rendered full-bright) and no PVS.
 */
export function buildRoomBsp(options: RoomOptions = {}): Uint8Array {
  const { mins, maxs } = ROOM;
  const planes: { normal: Vec; dist: number; type: number }[] = [];
  const plane = (axis: number, sign: 1 | -1, dist: number) => {
    const normal: Vec = [0, 0, 0];
    normal[axis] = sign;
    // Types 0-2 are reserved for positive axial normals.
    planes.push({ normal, dist: sign * dist, type: sign > 0 ? axis : axis + 3 });
    return planes.length - 1;
  };

  // The six inner surfaces, as (axis, position, inward direction).
  const walls = [0, 1, 2].flatMap((axis) => [
    { axis, at: mins[axis]!, inward: 1 as const },
    { axis, at: maxs[axis]!, inward: -1 as const },
  ]);
  const nodePlanes = walls.map((wall) => plane(wall.axis, 1, wall.at));

  const vertices: Vec[] = [];
  const edges: [number, number][] = [[0, 0]]; // edge 0 cannot be negated, so it is unused
  const surfedges: number[] = [];
  const faces: { plane: number; side: number; first: number; texinfo: number }[] = [];
  const wallFaces: { first: number; count: number }[] = [];

  // texinfo per axis; the floor (-z side) has its own texture.
  const axes: [Vec, Vec][] = [
    [[0, 1, 0], [0, 0, -1]],
    [[1, 0, 0], [0, 0, -1]],
    [[1, 0, 0], [0, -1, 0]],
  ];
  const texinfos = [
    ...axes.map(([s, t]) => ({ s, t, flags: options.wallFlags ?? 0, name: WALL_TEXTURE })),
    { s: axes[2]![0], t: axes[2]![1], flags: 0, name: FLOOR_TEXTURE },
  ];

  walls.forEach((wall, w) => {
    const [u, v] = [0, 1, 2].filter((a) => a !== wall.axis) as [number, number];
    const first = faces.length;
    // Tiles stay within the engine's per-surface lightmap extents.
    for (let a = mins[u]!; a < maxs[u]!; a += 128) {
      for (let b = mins[v]!; b < maxs[v]!; b += 128) {
        const corners = [
          [a, b],
          [Math.min(a + 128, maxs[u]!), b],
          [Math.min(a + 128, maxs[u]!), Math.min(b + 128, maxs[v]!)],
          [a, Math.min(b + 128, maxs[v]!)],
        ].map(([cu, cv]) => {
          const p: Vec = [0, 0, 0];
          p[wall.axis] = wall.at;
          p[u] = cu!;
          p[v] = cv!;
          return p;
        });
        // Quake faces wind clockwise seen from the front. Walking u then v is
        // counter-clockwise about +axis, except for the y axis (x,z ordering).
        const counterClockwise = (wall.axis === 1 ? -1 : 1) === wall.inward;
        if (counterClockwise) corners.reverse();
        const base = vertices.length;
        vertices.push(...corners);
        const firstSurfedge = surfedges.length;
        for (let i = 0; i < 4; i++) {
          surfedges.push(edges.length);
          edges.push([base + i, base + ((i + 1) % 4)]);
        }
        faces.push({
          plane: nodePlanes[w]!,
          side: wall.inward > 0 ? 0 : 1,
          first: firstSurfedge,
          texinfo: wall.axis === 2 && wall.inward > 0 ? 3 : wall.axis,
        });
      }
    }
    wallFaces.push({ first, count: faces.length - first });
  });

  // One 16-unit slab brush behind each wall.
  const brushSides: number[] = [];
  const brushes: { first: number }[] = [];
  for (const wall of walls) {
    const lo: Vec = [mins[0] - 16, mins[1] - 16, mins[2] - 16];
    const hi: Vec = [maxs[0] + 16, maxs[1] + 16, maxs[2] + 16];
    if (wall.inward > 0) hi[wall.axis] = wall.at;
    else lo[wall.axis] = wall.at;
    brushes.push({ first: brushSides.length });
    for (let axis = 0; axis < 3; axis++) {
      brushSides.push(plane(axis, 1, hi[axis]!), plane(axis, -1, lo[axis]!));
    }
  }

  const entities =
    `{\n"classname" "worldspawn"\n"message" "KINGPIN//WEB synthetic test room"\n}\n` +
    `{\n"classname" "info_player_start"\n"origin" "0 0 32"\n"angle" "0"\n}\n` +
    (options.extraEntities ?? "");

  const lumps: Uint8Array[] = Array.from({ length: 19 }, () => new Uint8Array());
  const lump = (index: number, fill: (w: Writer) => void) => {
    const w = new Writer();
    fill(w);
    lumps[index] = w.bytes();
  };
  const bounds = (w: Writer) => w.i16(...mins, ...maxs);

  lump(0, (w) => w.raw(text(entities)).u8(0));
  lump(1, (w) => planes.forEach((p) => w.f32(...p.normal, p.dist).i32(p.type)));
  lump(2, (w) => vertices.forEach((p) => w.f32(...p)));
  lump(4, (w) =>
    walls.forEach((wall, i) => {
      const inside = i === walls.length - 1 ? -2 : i + 1; // next node, or the empty leaf
      const outside = -1; // the solid leaf
      const front = wall.inward > 0 ? inside : outside;
      const back = wall.inward > 0 ? outside : inside;
      w.i32(nodePlanes[i]!, front, back);
      bounds(w);
      w.i16(wallFaces[i]!.first, wallFaces[i]!.count);
    }),
  );
  lump(5, (w) =>
    texinfos.forEach((t) => w.f32(...t.s, 0, ...t.t, 0).i32(t.flags, 0).str(t.name, 32).i32(-1)),
  );
  lump(6, (w) =>
    faces.forEach((f) => w.i16(f.plane, f.side).i32(f.first).i16(4, f.texinfo).u8(255, 255, 255, 255).i32(-1)),
  );
  lump(8, (w) => {
    // leaf 0: solid, holds the brushes
    w.i32(1).i16(-1, 0);
    bounds(w);
    w.i16(0, 0, 0, brushes.length);
    // leaf 1: empty, sees every face
    w.i32(0).i16(0, 1);
    bounds(w);
    w.i16(0, faces.length, 0, 0);
  });
  lump(9, (w) => faces.forEach((_, i) => w.i16(i)));
  lump(10, (w) => brushes.forEach((_, i) => w.i16(i)));
  lump(11, (w) => edges.forEach(([a, b]) => w.i16(a, b)));
  lump(12, (w) => w.i32(...surfedges));
  lump(13, (w) => w.f32(...mins, ...maxs, 0, 0, 0).i32(0, 0, faces.length));
  lump(14, (w) => brushes.forEach((b) => w.i32(b.first, 6, 1)));
  lump(15, (w) => brushSides.forEach((p) => w.i16(p, 0)));
  lump(17, (w) => w.i32(0, 0, 0, 0)); // areas 0 and 1, no portals

  const w = new Writer().str("IBSP", 4).i32(options.version ?? 38);
  let at = 8 + 19 * 8;
  const padded = (n: number) => (n + 3) & ~3;
  for (const data of lumps) {
    w.i32(at, data.length);
    at += padded(data.length);
  }
  for (const data of lumps) w.raw(data).raw(new Uint8Array(padded(data.length) - data.length));
  return w.bytes();
}

/** The minimum data the unmodified engine needs to start and load the room. */
export function syntheticGameFiles(): { name: string; data: Uint8Array }[] {
  return [
    { name: "pics/colormap.pcx", data: buildPcx(256, 320, (x) => x) },
    { name: "pics/conchars.pcx", data: buildPcx(128, 128, () => PALETTE.transparent) },
    { name: "autoexec.cfg", data: text('bind w "+forward"\nbind p "viewpos"\nset crosshair "0"\nset allow_download "0"\n') },
    { name: "maps/kpweb_room.bsp", data: buildRoomBsp() },
    {
      name: `textures/${WALL_TEXTURE}.wal`,
      data: buildWal(WALL_TEXTURE, 64, (x, y) => (x < 4 || y < 4 ? PALETTE.greenDark : PALETTE.green)),
    },
    // TGA only, with no .wal: how Kingpin stores world textures.
    { name: `textures/${FLOOR_TEXTURE}.tga`, data: buildTga(128, 128, [200, 40, 200]) },
  ];
}

