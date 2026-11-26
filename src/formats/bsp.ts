import { View, hexPreview } from "./binary.ts";
import type { Diagnostics } from "./diagnostics.ts";
import { type Entity, parseEntities } from "./entities.ts";
import { Q2_CLASSNAMES } from "./q2-classnames.ts";

// Layout and limits follow Yamagi Quake II (src/common/header/files.h).
// Published descriptions say Kingpin uses the same IBSP 38 container; this has
// not yet been verified against original Kingpin maps. See docs/formats/bsp.md.
export const BSP_VERSION = 38;
export const BSP_HEADER_SIZE = 8 + 19 * 8;

interface LumpSpec {
  name: string;
  /** Record size in bytes; 0 for variable-length lumps. */
  stride: number;
  /** Quake II upper bound on record count (bytes for variable lumps). */
  q2Max?: number;
}

export const BSP_LUMPS: readonly LumpSpec[] = [
  { name: "entities", stride: 0, q2Max: 0x40000 },
  { name: "planes", stride: 20, q2Max: 65536 },
  { name: "vertices", stride: 12, q2Max: 65536 },
  { name: "visibility", stride: 0, q2Max: 0x100000 },
  { name: "nodes", stride: 28, q2Max: 65536 },
  { name: "texinfo", stride: 76, q2Max: 8192 },
  { name: "faces", stride: 20, q2Max: 65536 },
  { name: "lighting", stride: 0, q2Max: 0x200000 },
  { name: "leafs", stride: 28, q2Max: 65536 },
  { name: "leaffaces", stride: 2, q2Max: 65536 },
  { name: "leafbrushes", stride: 2, q2Max: 65536 },
  { name: "edges", stride: 4, q2Max: 128000 },
  { name: "surfedges", stride: 4, q2Max: 256000 },
  { name: "models", stride: 48, q2Max: 1024 },
  { name: "brushes", stride: 12, q2Max: 8192 },
  { name: "brushsides", stride: 4, q2Max: 65536 },
  { name: "pop", stride: 0 },
  { name: "areas", stride: 8, q2Max: 256 },
  { name: "areaportals", stride: 8, q2Max: 1024 },
];

/** Surface flag bits that Quake II defines (SURF_LIGHT .. SURF_NODRAW). */
export const Q2_SURFACE_FLAG_MASK = 0xff;

interface Lump {
  name: string;
  offset: number;
  length: number;
  /** Complete records available; 0 if the lump is out of bounds. */
  count: number;
  valid: boolean;
}

export interface BspDetails extends Record<string, unknown> {
  version: number;
  lumps: { name: string; offset: number; length: number; count: number | null }[];
  entityCount: number;
  classnames: { name: string; count: number; upstream: boolean }[];
  entityKeys: string[];
  textures: string[];
  /** Histogram of individual surface flag bits, keyed "0x…". */
  surfaceFlags: Record<string, number>;
  worldBounds: { mins: number[]; maxs: number[] } | null;
}

export function inspectBsp(bytes: Uint8Array, diag: Diagnostics): BspDetails | null {
  const view = new View(bytes);
  if (view.length < BSP_HEADER_SIZE) {
    diag.error("bsp.truncated-header", `file is ${view.length} bytes; the header needs ${BSP_HEADER_SIZE}`);
    return null;
  }
  const magic = view.cstring(0, 4).text;
  if (magic !== "IBSP") {
    diag.error("bsp.bad-magic", `expected "IBSP", found bytes ${hexPreview(bytes, 4)}`);
    return null;
  }
  const version = view.i32(4);
  if (version !== BSP_VERSION) {
    // The lump layout of other versions is unknown; do not guess.
    diag.error("bsp.unsupported-version", `version ${version} is not supported (expected ${BSP_VERSION})`);
    return null;
  }

  const lumps: Lump[] = BSP_LUMPS.map((spec, i) => {
    const offset = view.i32(8 + i * 8);
    const length = view.i32(12 + i * 8);
    const valid = view.has(offset, length);
    if (!valid) {
      diag.error("bsp.lump-out-of-bounds", `${spec.name}: ${offset}+${length} is outside ${view.length} bytes`);
    } else {
      if (spec.stride && length % spec.stride !== 0) {
        diag.error(
          "bsp.funny-lump-size",
          `${spec.name}: ${length} bytes is not a multiple of the Quake II record size ${spec.stride}`,
        );
      }
      const units = spec.stride ? Math.floor(length / spec.stride) : length;
      if (spec.q2Max !== undefined && units > spec.q2Max) {
        diag.warn("bsp.exceeds-q2-limit", `${spec.name}: ${units} exceeds the Quake II limit ${spec.q2Max}`);
      }
    }
    const count = valid && spec.stride ? Math.floor(length / spec.stride) : 0;
    return { name: spec.name, offset, length, count, valid };
  });
  const lump = (name: string) => lumps.find((l) => l.name === name)!;

  checkReferences(view, lump, diag);

  const entityLump = lump("entities");
  let entities: Entity[] = [];
  if (entityLump.valid) {
    const { text } = view.cstring(entityLump.offset, entityLump.length);
    entities = parseEntities(text, diag);
  }

  const classCounts = new Map<string, number>();
  const keys = new Set<string>();
  for (const entity of entities) {
    for (const key of entity.keys()) keys.add(key);
    const name = entity.get("classname");
    if (name === undefined) diag.warn("bsp.entity-without-classname", "an entity has no classname");
    else classCounts.set(name, (classCounts.get(name) ?? 0) + 1);
  }
  const classnames = [...classCounts]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, count]) => ({ name, count, upstream: Q2_CLASSNAMES.has(name) }));
  const unknown = classnames.filter((c) => !c.upstream);
  if (unknown.length) {
    diag.warn(
      "bsp.unknown-entities",
      `${unknown.length} classname(s) have no spawn function in the upstream engine: ${unknown.map((c) => c.name).join(", ")}`,
    );
  }
  if (entities.length && !classCounts.has("worldspawn")) diag.warn("bsp.no-worldspawn", "no worldspawn entity");

  const textures = new Set<string>();
  const surfaceFlags: Record<string, number> = {};
  const texinfo = lump("texinfo");
  let extendedFlags = 0;
  for (let i = 0; i < texinfo.count; i++) {
    const base = texinfo.offset + i * 76;
    const flags = view.u32(base + 32);
    const { text, terminated } = view.cstring(base + 40, 32);
    if (!terminated) diag.warn("bsp.unterminated-texture-name", `texinfo ${i} name fills all 32 bytes`);
    if (text) textures.add(text);
    for (let bit = 0; bit < 32; bit++) {
      const mask = (1 << bit) >>> 0;
      if ((flags & mask) === 0) continue;
      const label = `0x${mask.toString(16)}`;
      surfaceFlags[label] = (surfaceFlags[label] ?? 0) + 1;
    }
    if ((flags & ~Q2_SURFACE_FLAG_MASK) !== 0) extendedFlags++;
  }
  if (extendedFlags) {
    diag.info("bsp.extended-surface-flags", `${extendedFlags} texinfo record(s) use flag bits Quake II does not define`);
  }

  const models = lump("models");
  if (models.valid && models.count === 0) diag.error("bsp.no-models", "map has no models (no world)");
  const vec = (offset: number) => [view.f32(offset), view.f32(offset + 4), view.f32(offset + 8)];
  const worldBounds = models.count ? { mins: vec(models.offset), maxs: vec(models.offset + 12) } : null;

  return {
    version,
    lumps: lumps.map((l, i) => ({
      name: l.name,
      offset: l.offset,
      length: l.length,
      count: BSP_LUMPS[i]!.stride ? l.count : null,
    })),
    entityCount: entities.length,
    classnames,
    entityKeys: [...keys].sort(),
    textures: [...textures].sort(),
    surfaceFlags,
    worldBounds,
  };
}

/** Verifies that cross-lump indices stay in range, as the renderer and collision code assume. */
function checkReferences(view: View, lump: (name: string) => Lump, diag: Diagnostics): void {
  const check = (name: string, visit: (offset: number, index: number) => void) => {
    const l = lump(name);
    const stride = BSP_LUMPS.find((s) => s.name === name)!.stride;
    for (let i = 0; i < l.count; i++) visit(l.offset + i * stride, i);
  };
  const ref = (what: string, value: number, limit: number) => {
    if (value < 0 || value >= limit) diag.error("bsp.bad-reference", `${what} is ${value}, valid range 0..${limit - 1}`);
  };
  const span = (what: string, first: number, count: number, limit: number) => {
    if (first < 0 || count < 0 || first + count > limit) {
      diag.error("bsp.bad-reference", `${what} spans ${first}+${count}, but only ${limit} records exist`);
    }
  };
  const n = (name: string) => lump(name).count;
  const lighting = lump("lighting");

  check("edges", (o, i) => {
    ref(`edge ${i} vertex`, view.u16(o), n("vertices"));
    ref(`edge ${i} vertex`, view.u16(o + 2), n("vertices"));
  });
  check("surfedges", (o, i) => ref(`surfedge ${i} edge`, Math.abs(view.i32(o)), n("edges")));
  check("faces", (o, i) => {
    ref(`face ${i} plane`, view.u16(o), n("planes"));
    span(`face ${i} surfedges`, view.i32(o + 4), view.i16(o + 8), n("surfedges"));
    ref(`face ${i} texinfo`, view.i16(o + 10), n("texinfo"));
    const lightOffset = view.i32(o + 16);
    if (lightOffset !== -1 && lighting.length > 0) ref(`face ${i} lightmap offset`, lightOffset, lighting.length);
  });
  check("nodes", (o, i) => {
    ref(`node ${i} plane`, view.i32(o), n("planes"));
    for (const at of [o + 4, o + 8]) {
      const child = view.i32(at);
      if (child >= 0) ref(`node ${i} child node`, child, n("nodes"));
      else ref(`node ${i} child leaf`, -1 - child, n("leafs"));
    }
    span(`node ${i} faces`, view.u16(o + 24), view.u16(o + 26), n("faces"));
  });
  check("leafs", (o, i) => {
    span(`leaf ${i} leaffaces`, view.u16(o + 20), view.u16(o + 22), n("leaffaces"));
    span(`leaf ${i} leafbrushes`, view.u16(o + 24), view.u16(o + 26), n("leafbrushes"));
  });
  check("leaffaces", (o, i) => ref(`leafface ${i}`, view.u16(o), n("faces")));
  check("leafbrushes", (o, i) => ref(`leafbrush ${i}`, view.u16(o), n("brushes")));
  check("brushes", (o, i) => span(`brush ${i} sides`, view.i32(o), view.i32(o + 4), n("brushsides")));
  check("brushsides", (o, i) => {
    ref(`brushside ${i} plane`, view.u16(o), n("planes"));
    const tex = view.i16(o + 2);
    if (tex !== -1) ref(`brushside ${i} texinfo`, tex, n("texinfo"));
  });
  check("models", (o, i) => {
    const head = view.i32(o + 36);
    if (head >= 0) ref(`model ${i} headnode`, head, n("nodes"));
    else ref(`model ${i} headnode leaf`, -1 - head, n("leafs"));
    span(`model ${i} faces`, view.i32(o + 40), view.i32(o + 44), n("faces"));
  });
}
