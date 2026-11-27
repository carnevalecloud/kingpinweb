import { describe, expect, it } from "vitest";
import { decodeMdx } from "../../src/formats/mdx-mesh.ts";
import { Diagnostics } from "../../src/formats/diagnostics.ts";
import { buildMdx } from "../fixtures/builders.ts";

describe("MDX render geometry", () => {
  it("decodes original fixture geometry, UVs and frame vertices", () => {
    const diag = new Diagnostics();
    const mesh = decodeMdx(buildMdx(), diag)!;
    expect(diag.list()).toEqual([]);
    expect(mesh.skins).toEqual(["models/kpweb/skin.tga"]);
    expect(mesh.frameNames).toEqual(["stand01"]);
    expect(mesh.triangles).toEqual([{ subObject: 0, corners: [
      {vertex: 0, s: 0, t: 0}, {vertex: 1, s: 1, t: 0}, {vertex: 2, s: 0, t: 1}
    ]}]);
    expect(Array.from(mesh.frame(0))).toEqual([0,0,0,255,0,0,0,255,0]);
    expect(() => mesh.frame(1)).toThrow(RangeError);
  });
  it("rejects nonfinite texture coordinates and transforms", () => {
    for (const field of [13, 14]) {
      const bytes = buildMdx();
      const view = new DataView(bytes.buffer);
      // Header dword 15 is offsetFrames, 16 is offsetGlCommands.
      const at = field === 13 ? view.getInt32(15*4,true) : view.getInt32(16*4,true)+8;
      view.setFloat32(at, NaN, true);
      const diag = new Diagnostics();
      expect(decodeMdx(bytes, diag)).toBeNull();
      expect(diag.list().some(d => d.severity === "error")).toBe(true);
    }
  });
  it("rejects all truncated prefixes without throwing", () => {
    const bytes = buildMdx();
    for (let n = 0; n < bytes.length; n++) {
      expect(decodeMdx(bytes.subarray(0,n), new Diagnostics())).toBeNull();
    }
  });
});
