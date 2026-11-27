export * from "../../src/kingpin/preview-scene.ts";
import { Writer, buildRoomBsp, buildTga, syntheticGameFiles } from "../../src/kingpin/preview-scene.ts";
type Vec = [number, number, number];

// ---------------------------------------------------------------- models

const MODEL_VERTICES: Vec[] = [[0, 0, 0], [255, 0, 0], [0, 255, 0]];

function modelFrame(w: Writer): void {
  w.f32(1, 1, 1, 0, 0, 0).str("stand01", 16);
  for (const v of MODEL_VERTICES) w.u8(...v, 0);
}

/** One-triangle, one-frame MD2. */
export function buildMd2(): Uint8Array {
  const skins = new Writer().str("models/kpweb/skin.pcx", 64).bytes();
  const st = new Writer().i16(0, 0, 63, 0, 0, 63).bytes();
  const tris = new Writer().i16(0, 1, 2, 0, 1, 2).bytes();
  const frameWriter = new Writer();
  modelFrame(frameWriter);
  const frames = frameWriter.bytes();
  const cmds = new Writer().i32(3).f32(0, 0).i32(0).f32(1, 0).i32(1).f32(0, 1).i32(2).i32(0).bytes();
  const sections = [skins, st, tris, frames, cmds];
  let at = 68;
  const offsets = sections.map((s) => {
    const o = at;
    at += s.length;
    return o;
  });
  const w = new Writer()
    .str("IDP2", 4)
    .i32(8, 64, 64, frames.length, 1, 3, 3, 1, cmds.length / 4, 1, ...offsets, at);
  for (const s of sections) w.raw(s);
  return w.bytes();
}

/** One-triangle, one-frame, one-sub-object Kingpin MDX with no effects. */
export function buildMdx(): Uint8Array {
  const skins = new Writer().str("models/kpweb/skin.tga", 64).bytes();
  const tris = new Writer().i16(0, 1, 2, 0, 1, 2).bytes();
  const frameWriter = new Writer();
  modelFrame(frameWriter);
  const frames = frameWriter.bytes();
  const cmds = new Writer().i32(3, 0).f32(0, 0).i32(0).f32(1, 0).i32(1).f32(0, 1).i32(2).i32(0).bytes();
  const vertexInfo = new Writer().i32(1, 1, 1).bytes();
  const bbox = new Writer().f32(0, 0, 0, 255, 255, 0).bytes();
  let at = 92;
  const place = (s: Uint8Array) => {
    const o = at;
    at += s.length;
    return o;
  };
  const [oSkins, oTris, oFrames, oCmds, oInfo] = [skins, tris, frames, cmds, vertexInfo].map(place);
  const oSfx = at; // both SFX sections are empty
  const oBbox = place(bbox);
  const w = new Writer()
    .str("IDPX", 4)
    .i32(4, 64, 64, frames.length, 1, 3, 1, cmds.length / 4, 1, 0, 0, 1)
    .i32(oSkins!, oTris!, oFrames!, oCmds!, oInfo!, oSfx, oSfx, oBbox, at, at);
  for (const s of [skins, tris, frames, cmds, vertexInfo, bbox]) w.raw(s);
  return w.bytes();
}

// ---------------------------------------------------------------- game data

/** Visible vertical MDX triangle, facing the synthetic room spawn from +X. */
export function syntheticMdxPropFiles(): { name: string; data: Uint8Array }[] {
  const model = buildMdx();
  const view = new DataView(model.buffer);
  const frame = view.getInt32(15 * 4, true);
  for (let axis = 0; axis < 3; axis++) view.setFloat32(frame + axis * 4, 0.25, true);
  view.setFloat32(frame + 16, -32, true);
  model.set([0,0,0,0, 0,255,0,0, 0,0,255,0], frame + 40);
  const files = syntheticGameFiles().map(file => file.name.endsWith(".bsp") ? {
    ...file, data: buildRoomBsp({extraEntities: '{ "classname" "kpweb_static_model" "model" "models/kpweb/prop.mdx" "origin" "96 0 16" }'})
  } : file);
  return [...files, {name:"models/kpweb/prop.mdx",data:model}, {name:"models/kpweb/skin.tga",data:buildTga(64,64,[255,20,20])}];
}
