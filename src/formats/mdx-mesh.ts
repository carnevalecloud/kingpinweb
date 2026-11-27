// Rendering-oriented MDX decoding, independent of DOM and engine host.
// Format evidence: docs/formats/models.md. No proprietary SDK code.
import { inspectModel } from "./alias-model.ts";
import { View } from "./binary.ts";
import { Diagnostics } from "./diagnostics.ts";

export interface MdxCorner { vertex: number; s: number; t: number }
export interface MdxTriangle { subObject: number; corners: [MdxCorner, MdxCorner, MdxCorner] }
export interface MdxMesh {
  skins: string[];
  frameNames: string[];
  triangles: MdxTriangle[];
  frame(index: number): Float32Array;
}

export function decodeMdx(bytes: Uint8Array, diag: Diagnostics): MdxMesh | null {
  const local = new Diagnostics();
  const model = inspectModel(bytes, "mdx", local);
  for (const item of local.list()) {
    if (item.severity === "error") diag.error(item.code, item.message);
    else if (item.severity === "warning") diag.warn(item.code, item.message);
    else diag.info(item.code, item.message);
  }
  if (!model || local.list().some(d => d.severity === "error")) return null;
  const h = model.header;
  const v = new View(bytes);
  const fail = (message: string): null => { diag.error("mdx.render-invalid", message); return null; };
  const count = h.numVertices!, frames = h.numFrames!, end = h.offsetEnd!;
  if (!count || !frames || end < 92 || end > bytes.length) return fail("invalid render bounds");
  if (h.offsetFrames! < 92 || h.offsetFrames! + frames * h.frameSize! > end ||
      h.offsetGlCommands! < 92 || h.offsetGlCommands! + h.numGlCommands! * 4 > end) return fail("render section outside declared model");
  const triangles: MdxTriangle[] = [];
  let at = 0, terminated = false;
  const base = h.offsetGlCommands!, size = h.numGlCommands!;
  while (at < size) {
    const signed = v.i32(base + at++ * 4);
    if (!signed) { terminated = true; break; }
    const n = Math.abs(signed);
    if (n < 3 || at + 1 + n * 3 > size) return fail("invalid primitive length");
    const subObject = v.i32(base + at++ * 4);
    if (subObject < 0 || subObject >= h.numSubObjects!) return fail("invalid sub-object");
    const corners: MdxCorner[] = [];
    for (let j = 0; j < n; j++) {
      const p = base + at * 4;
      const s = v.f32(p), t = v.f32(p + 4), vertex = v.i32(p + 8);
      if (!Number.isFinite(s) || !Number.isFinite(t) || vertex < 0 || vertex >= count) return fail("invalid primitive corner");
      corners.push({ s, t, vertex }); at += 3;
    }
    for (let j = 2; j < n; j++) {
      const indices = signed < 0 ? [0, j - 1, j] : j % 2 ? [j - 1, j - 2, j] : [j - 2, j - 1, j];
      triangles.push({ subObject, corners: [corners[indices[0]!]!, corners[indices[1]!]!, corners[indices[2]!]!] });
    }
  }
  if (!terminated || !triangles.length) return fail("missing drawable primitives or terminator");
  // Validate frame transforms once; decode positions lazily to avoid allocating every animation frame.
  for (let i = 0; i < frames; i++) {
    const p = h.offsetFrames! + i * h.frameSize!;
    for (let j = 0; j < 3; j++) {
      const scale = v.f32(p + j * 4), translate = v.f32(p + 12 + j * 4);
      if (!Number.isFinite(scale) || !Number.isFinite(translate) || !Number.isFinite(Math.fround(scale * 255 + translate))) return fail("invalid frame transform");
    }
  }
  return {
    skins: model.skins, frameNames: model.frames, triangles,
    frame(index) {
      if (!Number.isInteger(index) || index < 0 || index >= frames) throw new RangeError("frame index outside model");
      const p = h.offsetFrames! + index * h.frameSize!;
      const positions = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) for (let j = 0; j < 3; j++) {
        positions[i * 3 + j] = v.u8(p + 40 + i * 4 + j) * v.f32(p + j * 4) + v.f32(p + 12 + j * 4);
      }
      return positions;
    }
  };
}
