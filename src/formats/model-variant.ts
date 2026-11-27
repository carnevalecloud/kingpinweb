// Derives a small copy of a player's MD2 or MDX model for one in-world use: one
// skin chosen, only the shown frames, optional scale. Layouts: docs/formats/models.md.
import { inspectModel } from "./alias-model.ts";
import { View } from "./binary.ts";
import { Diagnostics } from "./diagnostics.ts";

const SKIN_SIZE = 64;
const FRAME_HEADER = 40;
/** Height that scaling keeps fixed: the floor under a standing character. */
const FLOOR = -24;
/** Longest idle cycle kept for an animated model. */
const MAX_IDLE_FRAMES = 64;

export interface VariantOptions {
  /** Replaces skin 0. Remaining skins are dropped. */
  skin?: string;
  /** Keep the leading run of frames that share frame 0's name, instead of frame 0 only. */
  animate?: boolean;
  /**
   * Keep these named animations, concatenated in order, instead. Each slot lists
   * acceptable names; the first present is used. Overrides `animate`.
   */
  sequences?: readonly (readonly string[])[];
  /** Uniform scale about the point 24 units below the origin. */
  scale?: number;
}

export interface Variant {
  bytes: Uint8Array;
  /** Skin paths in the form the engine loads. */
  skins: string[];
  frames: number;
  /** Length of each requested sequence. */
  lengths?: number[];
}

/** Lower-case, forward slashes, no leading slash: the engine's filesystem is case-sensitive. */
export function normalizeAssetPath(path: string): string {
  return path.toLowerCase().replaceAll("\\", "/").replace(/^\/+/, "");
}

const animationName = (frame: string) => frame.toLowerCase().replace(/_?\d+$/, "");

/** Source frame indices of the first unbroken run with this animation name. */
function run(frames: readonly string[], name: string): number[] {
  const found: number[] = [];
  for (let i = 0; i < frames.length && found.length < MAX_IDLE_FRAMES; i++) {
    if (animationName(frames[i]!) === name) found.push(i);
    else if (found.length) break;
  }
  return found;
}

/** Returns null for a model that cannot be derived safely. */
export function buildModelVariant(source: Uint8Array, options: VariantOptions = {}): Variant | null {
  const mdx = source.length >= 4 && source[3] === 0x58; // "IDPX"
  const diag = new Diagnostics();
  const model = inspectModel(source, mdx ? "mdx" : "md2", diag);
  if (!model || diag.list().some((d) => d.severity === "error") || !model.frames.length) return null;
  const h = model.header;
  const view = new View(source);
  const frameSize = h.frameSize!;
  let kept = [0];
  let lengths: number[] | undefined;
  if (options.sequences) {
    const runs = options.sequences.map((names) => names.map((n) => run(model.frames, n)).find((r) => r.length) ?? []);
    if (runs.some((r) => !r.length)) return null;
    kept = runs.flat();
    lengths = runs.map((r) => r.length);
  } else if (options.animate) {
    kept = run(model.frames, animationName(model.frames[0]!));
  }
  const count = kept.length;
  const skins = (options.skin ? [options.skin] : model.skins).map(normalizeAssetPath).slice(0, 32);
  if (!skins.length || skins.some((s) => !s || s.length >= SKIN_SIZE || s.split("/").includes(".."))) return null;

  const skinBytes = new Uint8Array(skins.length * SKIN_SIZE);
  skins.forEach((skin, i) => skinBytes.set(new TextEncoder().encode(skin), i * SKIN_SIZE));
  // A copy, never a view: scaling writes into it (Node Buffer.slice would alias).
  if (frameSize < FRAME_HEADER || !view.has(h.offsetFrames!, model.frames.length * frameSize)) return null;
  const frames = new Uint8Array(count * frameSize);
  kept.forEach((index, i) => {
    const at = h.offsetFrames! + index * frameSize;
    frames.set(source.subarray(at, at + frameSize), i * frameSize);
  });
  const scale = options.scale ?? 1;
  if (scale !== 1) {
    const data = new DataView(frames.buffer);
    for (let f = 0; f < count; f++) {
      for (let axis = 0; axis < 3; axis++) {
        const at = f * frameSize + axis * 4;
        const anchor = axis === 2 ? FLOOR : 0;
        data.setFloat32(at, data.getFloat32(at, true) * scale, true);
        data.setFloat32(at + 12, (data.getFloat32(at + 12, true) - anchor) * scale + anchor, true);
      }
    }
  }
  const section = (offset: number, length: number) =>
    view.has(offset, length) ? source.subarray(offset, offset + length) : null;
  const commands = section(h.offsetGlCommands!, h.numGlCommands! * 4);
  const triangles = section(h.offsetTriangles!, h.numTriangles! * 12);
  if (!commands || !triangles) return null;

  let parts: Uint8Array[];
  let headerSize: number;
  if (mdx) {
    const info = section(h.offsetVertexInfo!, h.numVertices! * 4);
    if (!info) return null;
    // Sub-object boxes serve hit detection only and are left zero.
    const boxes = new Uint8Array(h.numSubObjects! * count * 24);
    parts = [skinBytes, triangles, frames, commands, info, boxes];
    headerSize = 92;
  } else {
    const coordinates = section(h.offsetTexCoords!, h.numTexCoords! * 4);
    if (!coordinates) return null;
    parts = [skinBytes, coordinates, triangles, frames, commands];
    headerSize = 68;
  }
  const offsets: number[] = [];
  let end = headerSize;
  for (const part of parts) {
    offsets.push(end);
    end += part.length;
  }
  const header = mdx
    ? [
        4, h.skinWidth!, h.skinHeight!, frameSize, skins.length, h.numVertices!, h.numTriangles!, h.numGlCommands!,
        count, 0, 0, h.numSubObjects!,
        offsets[0]!, offsets[1]!, offsets[2]!, offsets[3]!, offsets[4]!,
        offsets[5]!, offsets[5]!, offsets[5]!, end, end,
      ]
    : [
        8, h.skinWidth!, h.skinHeight!, frameSize, skins.length, h.numVertices!, h.numTexCoords!, h.numTriangles!,
        h.numGlCommands!, count, ...offsets, end,
      ];
  const out = new Uint8Array(end);
  out.set(source.subarray(0, 4));
  const data = new DataView(out.buffer);
  header.forEach((value, i) => data.setInt32(4 + i * 4, value, true));
  parts.forEach((part, i) => out.set(part, offsets[i]!));
  return { bytes: out, skins, frames: count, ...(lengths ? { lengths } : {}) };
}
