// Quake II MD2 and Kingpin MDX vertex-animated models.
// MD2: Yamagi Quake II (src/common/header/files.h).
// MDX: layout documented at https://kingpin.info/?p=mdx (TiCaL) and matching the
// freeking reimplementation. Not yet verified against original files.
import { View, hexPreview } from "./binary.ts";
import type { Diagnostics } from "./diagnostics.ts";

export const MD2_VERSION = 8;
export const MDX_VERSION = 4;
const MD2_FIELDS = [
  "skinWidth", "skinHeight", "frameSize", "numSkins", "numVertices", "numTexCoords", "numTriangles",
  "numGlCommands", "numFrames", "offsetSkins", "offsetTexCoords", "offsetTriangles", "offsetFrames",
  "offsetGlCommands", "offsetEnd",
] as const;
const MDX_FIELDS = [
  "skinWidth", "skinHeight", "frameSize", "numSkins", "numVertices", "numTriangles", "numGlCommands",
  "numFrames", "numSfxDefines", "numSfxEntries", "numSubObjects", "offsetSkins", "offsetTriangles",
  "offsetFrames", "offsetGlCommands", "offsetVertexInfo", "offsetSfxDefines", "offsetSfxEntries",
  "offsetBBoxFrames", "offsetDummyEnd", "offsetEnd",
] as const;

const SKIN_NAME_SIZE = 64;
const FRAME_HEADER_SIZE = 40;
const TRIANGLE_SIZE = 12;
const BBOX_SIZE = 24;
/** Documented format limits, shared by both formats. */
const LIMITS = { numTriangles: 4096, numVertices: 2048, numFrames: 512, numSkins: 32 } as const;

export interface ModelDetails extends Record<string, unknown> {
  version: number;
  header: Record<string, number>;
  skins: string[];
  frames: string[];
  /** Sub-object ids referenced by MDX GL commands. */
  subObjects: number[];
}

export function inspectModel(bytes: Uint8Array, kind: "md2" | "mdx", diag: Diagnostics): ModelDetails | null {
  const mdx = kind === "mdx";
  const fields: readonly string[] = mdx ? MDX_FIELDS : MD2_FIELDS;
  const magic = mdx ? "IDPX" : "IDP2";
  const expectedVersion = mdx ? MDX_VERSION : MD2_VERSION;
  const headerSize = 8 + fields.length * 4;
  const view = new View(bytes);
  const code = (suffix: string) => `${kind}.${suffix}`;

  if (view.length < headerSize) {
    diag.error(code("truncated-header"), `file is ${view.length} bytes; the header needs ${headerSize}`);
    return null;
  }
  if (view.cstring(0, 4).text !== magic) {
    diag.error(code("bad-magic"), `expected "${magic}", found bytes ${hexPreview(bytes, 4)}`);
    return null;
  }
  const version = view.i32(4);
  if (version !== expectedVersion) {
    diag.error(code("unsupported-version"), `version ${version} is not supported (expected ${expectedVersion})`);
    return null;
  }
  const h: Record<string, number> = Object.fromEntries(fields.map((name, i) => [name, view.i32(8 + i * 4)]));
  const get = (name: string) => h[name] ?? 0;

  const negative = fields.filter((name) => get(name) < 0);
  if (negative.length) {
    diag.error(code("negative-header-field"), `negative value in: ${negative.join(", ")}`);
    return { version, header: h, skins: [], frames: [], subObjects: [] };
  }
  for (const [name, max] of Object.entries(LIMITS)) {
    if (get(name) > max) diag.warn(code("exceeds-limit"), `${name} ${get(name)} exceeds the documented maximum ${max}`);
  }
  if (get("offsetEnd") !== view.length) {
    diag.warn(code("size-mismatch"), `offsetEnd ${get("offsetEnd")} differs from file size ${view.length}`);
  }

  /** Returns true if `count` records of `size` bytes at the header offset fit in the file. */
  const section = (name: string, offsetField: string, count: number, size: number): boolean => {
    const ok = view.has(get(offsetField), count * size);
    if (!ok) {
      diag.error(code("section-out-of-bounds"), `${name}: ${count} x ${size} bytes at ${get(offsetField)} is outside the file`);
    }
    return ok;
  };

  const numVertices = get("numVertices");
  const skins: string[] = [];
  if (section("skins", "offsetSkins", get("numSkins"), SKIN_NAME_SIZE)) {
    for (let i = 0; i < get("numSkins"); i++) {
      skins.push(view.cstring(get("offsetSkins") + i * SKIN_NAME_SIZE, SKIN_NAME_SIZE).text);
    }
  }

  if (!mdx) section("texture coordinates", "offsetTexCoords", get("numTexCoords"), 4);

  if (section("triangles", "offsetTriangles", get("numTriangles"), TRIANGLE_SIZE)) {
    for (let i = 0; i < get("numTriangles"); i++) {
      const base = get("offsetTriangles") + i * TRIANGLE_SIZE;
      for (let k = 0; k < 3; k++) {
        const v = view.u16(base + k * 2);
        if (v >= numVertices) diag.error(code("bad-vertex-index"), `triangle ${i} uses vertex ${v} of ${numVertices}`);
        // MDX has no texture-coordinate table, so its second index triple is not checked.
        const st = view.u16(base + 6 + k * 2);
        if (!mdx && st >= get("numTexCoords")) {
          diag.error(code("bad-texcoord-index"), `triangle ${i} uses texture coordinate ${st} of ${get("numTexCoords")}`);
        }
      }
    }
  }

  const frames: string[] = [];
  const frameSize = get("frameSize");
  const expectedFrameSize = FRAME_HEADER_SIZE + numVertices * 4;
  if (frameSize !== expectedFrameSize) {
    diag.error(code("frame-size"), `frameSize ${frameSize} differs from the documented ${expectedFrameSize}`);
  } else if (section("frames", "offsetFrames", get("numFrames"), frameSize)) {
    for (let i = 0; i < get("numFrames"); i++) {
      frames.push(view.cstring(get("offsetFrames") + i * frameSize + 24, 16).text);
    }
  }

  const subObjects = new Set<number>();
  if (section("GL commands", "offsetGlCommands", get("numGlCommands"), 4)) {
    walkCommands(view, get("offsetGlCommands"), get("numGlCommands"), mdx, numVertices, (id) => subObjects.add(id), code, diag);
  }

  if (mdx) {
    const numSubObjects = get("numSubObjects");
    for (const id of subObjects) {
      if (id < 0 || id >= numSubObjects) diag.error("mdx.bad-subobject", `sub-object ${id} of ${numSubObjects}`);
    }
    section("vertex info", "offsetVertexInfo", numVertices, 4);
    section("bounding boxes", "offsetBBoxFrames", numSubObjects * get("numFrames"), BBOX_SIZE);
    // SFX record contents are not parsed yet; only report their observed sizes.
    for (const [label, start, end, count] of [
      ["SFX definitions", "offsetSfxDefines", "offsetSfxEntries", "numSfxDefines"],
      ["SFX entries", "offsetSfxEntries", "offsetBBoxFrames", "numSfxEntries"],
    ] as const) {
      const bytesUsed = get(end) - get(start);
      if (!view.has(get(start), Math.max(bytesUsed, 0)) || bytesUsed < 0) {
        diag.warn("mdx.sfx-layout", `${label}: unexpected section offsets ${get(start)}..${get(end)}`);
      } else if (get(count) > 0) {
        diag.info("mdx.sfx-present", `${label}: ${get(count)} record(s) occupying ${bytesUsed} bytes (not parsed)`);
      }
    }
  }

  return { version, header: h, skins, frames, subObjects: [...subObjects].sort((a, b) => a - b) };
}

/**
 * GL command list: repeated [count, (MDX: subObject), count x (s, t, vertex)],
 * terminated by a zero count. Positive counts are strips, negative are fans.
 */
function walkCommands(
  view: View,
  offset: number,
  numDwords: number,
  mdx: boolean,
  numVertices: number,
  seen: (subObject: number) => void,
  code: (suffix: string) => string,
  diag: Diagnostics,
): void {
  const headerDwords = mdx ? 2 : 1;
  let at = 0;
  while (at < numDwords) {
    const count = Math.abs(view.i32(offset + at * 4));
    if (count === 0) return;
    if (at + headerDwords + count * 3 > numDwords) {
      diag.error(code("gl-command-overrun"), `command at dword ${at} needs ${count} vertices past the end of the list`);
      return;
    }
    if (mdx) seen(view.i32(offset + (at + 1) * 4));
    for (let i = 0; i < count; i++) {
      const vertex = view.i32(offset + (at + headerDwords + i * 3 + 2) * 4);
      if (vertex < 0 || vertex >= numVertices) {
        diag.error(code("bad-vertex-index"), `GL command uses vertex ${vertex} of ${numVertices}`);
      }
    }
    at += headerDwords + count * 3;
  }
  diag.warn(code("gl-command-unterminated"), "GL command list has no terminating zero");
}
