import { describe, expect, it } from "vitest";
import { inspectModel } from "../../src/formats/alias-model.ts";
import { memorySource, sliceSource } from "../../src/formats/binary.ts";
import { inspectBsp } from "../../src/formats/bsp.ts";
import { Diagnostics } from "../../src/formats/diagnostics.ts";
import { parseEntities } from "../../src/formats/entities.ts";
import { inspectFile } from "../../src/formats/inspect.ts";
import { readPak } from "../../src/formats/pak.ts";
import { inspectTga } from "../../src/formats/tga.ts";
import { ROOM, Writer, buildMd2, buildMdx, buildPak, buildRoomBsp, buildTga, text } from "../fixtures/builders.ts";

const codes = (diag: Diagnostics) => diag.list().filter((d) => d.severity !== "info").map((d) => d.code);
const patch = (bytes: Uint8Array, offset: number, value: number) => {
  const copy = bytes.slice();
  new DataView(copy.buffer).setInt32(offset, value, true);
  return copy;
};
const pak = async (bytes: Uint8Array) => {
  const diag = new Diagnostics();
  return { entries: await readPak(memorySource(bytes), diag), codes: codes(diag) };
};

describe("byte sources", () => {
  it("rejects reads outside a slice even when the parent has the bytes", async () => {
    const slice = sliceSource(memorySource(new Uint8Array(10)), 2, 4);
    await expect(slice.read(0, 4)).resolves.toHaveLength(4);
    await expect(slice.read(2, 3)).rejects.toThrow(RangeError);
    await expect(slice.read(-1, 1)).rejects.toThrow(RangeError);
  });
});

describe("PAK", () => {
  const valid = buildPak([{ name: "maps/a.bsp", data: text("abc") }, { name: "b.cfg", data: text("de") }]);

  it("lists entries with offsets and sizes", async () => {
    const result = await pak(valid);
    expect(result.codes).toEqual([]);
    expect(result.entries).toEqual([
      { name: "maps/a.bsp", offset: 12, size: 3 },
      { name: "b.cfg", offset: 15, size: 2 },
    ]);
  });

  it("rejects bad magic, short files and a directory outside the file", async () => {
    expect((await pak(text("PAK"))).codes).toEqual(["pak.truncated-header"]);
    expect((await pak(text("JUNKJUNKJUNK"))).codes).toEqual(["pak.bad-magic"]);
    expect((await pak(valid.subarray(0, valid.length - 1))).codes).toEqual(["pak.directory-out-of-bounds"]);
    expect((await pak(patch(valid, 4, -5))).codes).toEqual(["pak.directory-out-of-bounds"]);
  });

  it("omits entries pointing outside the file", async () => {
    const result = await pak(patch(valid, valid.length - 4, 1000));
    expect(result.codes).toEqual(["pak.entry-out-of-bounds"]);
    expect(result.entries).toHaveLength(1);
  });

  it("flags traversal paths and case-insensitive duplicates", async () => {
    const data = text("x");
    const result = await pak(buildPak([{ name: "../evil", data }, { name: "A", data }, { name: "a", data }]));
    expect(result.codes).toEqual(["pak.unsafe-path", "pak.duplicate-name"]);
  });

  it("flags a directory that is not a multiple of the entry size", async () => {
    const extra = new Writer().raw(valid).u8(0).bytes();
    expect((await pak(patch(extra, 8, 129))).codes).toEqual(["pak.directory-size"]);
  });
});

describe("entity lump", () => {
  it("parses blocks, comments and values containing braces", () => {
    const diag = new Diagnostics();
    const result = parseEntities('// c\n{ "classname" "worldspawn" "message" "a {b}" }\n{"classname" "x"}', diag);
    expect(result.map((e) => e.get("classname"))).toEqual(["worldspawn", "x"]);
    expect(result[0]!.get("message")).toBe("a {b}");
    expect(diag.list()).toEqual([]);
  });

  it("reports malformed input without throwing", () => {
    const diag = new Diagnostics();
    parseEntities('} { "a" } junk { "classname" "open', diag);
    expect(codes(diag)).toContain("entities.unmatched-brace");
    expect(codes(diag)).toContain("entities.unterminated-block");
    expect(codes(diag)).toContain("entities.missing-value");
  });
});

describe("BSP", () => {
  const inspect = (bytes: Uint8Array) => {
    const diag = new Diagnostics();
    return { details: inspectBsp(bytes, diag), codes: codes(diag), diag };
  };

  it("accepts the synthetic room with consistent references", () => {
    const result = inspect(buildRoomBsp());
    expect(result.codes).toEqual([]);
    expect(result.details!.textures).toEqual(["kpweb/floor", "kpweb/wall"]);
    expect(result.details!.worldBounds).toEqual({ mins: ROOM.mins, maxs: ROOM.maxs });
  });

  it("reports classnames the upstream engine cannot spawn", () => {
    const result = inspect(buildRoomBsp({ extraEntities: '{"classname" "kpweb_unknown_thing"}' }));
    expect(result.codes).toEqual(["bsp.unknown-entities"]);
    expect(result.details!.classnames.find((c) => c.name === "kpweb_unknown_thing")!.upstream).toBe(false);
    expect(result.details!.classnames.find((c) => c.name === "info_player_start")!.upstream).toBe(true);
  });

  it("reports flag bits beyond Quake II", () => {
    const result = inspect(buildRoomBsp({ wallFlags: 0x100001 }));
    expect(result.details!.surfaceFlags).toEqual({ "0x1": 3, "0x100000": 3 });
    expect(result.diag.list().map((d) => d.code)).toContain("bsp.extended-surface-flags");
  });

  it("refuses to guess at other versions or formats", () => {
    expect(inspect(buildRoomBsp({ version: 39 }))).toMatchObject({ details: null, codes: ["bsp.unsupported-version"] });
    expect(inspect(text("VBSP".padEnd(200, " "))).codes).toEqual(["bsp.bad-magic"]);
    expect(inspect(text("IBSP")).codes).toEqual(["bsp.truncated-header"]);
  });

  it("reports out-of-bounds lumps, odd sizes and dangling indices", () => {
    const room = buildRoomBsp();
    const lumpHeader = (i: number) => 8 + i * 8;
    expect(inspect(patch(room, lumpHeader(2) + 4, 1 << 30)).codes).toContain("bsp.lump-out-of-bounds");
    const planesLength = new DataView(room.buffer).getInt32(lumpHeader(1) + 4, true);
    expect(inspect(patch(room, lumpHeader(1) + 4, planesLength - 1)).codes).toContain("bsp.funny-lump-size");
    expect(inspect(patch(room, lumpHeader(2) + 4, 12)).codes).toContain("bsp.bad-reference");
  });

  it("survives truncation at every length", () => {
    const room = buildRoomBsp();
    for (let length = 0; length < room.length; length += 7) {
      expect(() => inspect(room.subarray(0, length))).not.toThrow();
    }
  });
});

describe.each([
  ["md2", buildMd2, "models/kpweb/skin.pcx"],
  ["mdx", buildMdx, "models/kpweb/skin.tga"],
] as const)("%s model", (kind, build, skin) => {
  const inspect = (bytes: Uint8Array) => {
    const diag = new Diagnostics();
    return { details: inspectModel(bytes, kind, diag), codes: codes(diag) };
  };

  it("parses header, skins and animation frame names", () => {
    const result = inspect(build());
    expect(result.codes).toEqual([]);
    expect(result.details).toMatchObject({ skins: [skin], frames: ["stand01"] });
    expect(result.details!.header).toMatchObject({ numVertices: 3, numTriangles: 1, numFrames: 1 });
  });

  it("reports bad magic, version, negative counts and huge counts", () => {
    expect(inspect(patch(build(), 0, 0)).codes).toEqual([`${kind}.bad-magic`]);
    expect(inspect(patch(build(), 4, 99)).codes).toEqual([`${kind}.unsupported-version`]);
    expect(inspect(patch(build(), 20, -1)).codes).toEqual([`${kind}.negative-header-field`]);
    expect(inspect(patch(build(), 20, 0x7fffffff)).codes).toContain(`${kind}.section-out-of-bounds`);
  });

  it("reports a vertex index outside the frame", () => {
    const bytes = build();
    const header = inspect(bytes).details!.header;
    const broken = bytes.slice();
    new DataView(broken.buffer).setUint16(header.offsetTriangles!, 7, true);
    expect(inspect(broken).codes).toContain(`${kind}.bad-vertex-index`);
  });

  it("survives truncation at every length", () => {
    const bytes = build();
    for (let length = 0; length < bytes.length; length++) {
      expect(() => inspect(bytes.subarray(0, length))).not.toThrow();
      expect(inspect(bytes.subarray(0, length)).codes).not.toEqual([]);
    }
  });
});

describe("TGA", () => {
  const inspect = (bytes: Uint8Array) => {
    const diag = new Diagnostics();
    return { details: inspectTga(bytes, bytes.length, diag), codes: codes(diag) };
  };

  it("reads dimensions and detects truncation", () => {
    const image = buildTga(64, 32, [1, 2, 3]);
    expect(inspect(image)).toMatchObject({ codes: [], details: { width: 64, height: 32, bitsPerPixel: 24 } });
    expect(inspect(image.subarray(0, 100)).codes).toEqual(["tga.truncated-data"]);
    expect(inspect(image.subarray(0, 10)).codes).toEqual(["tga.truncated-header"]);
  });
});

describe("format detection", () => {
  it("trusts magic over extension and says so", async () => {
    const report = await inspectFile("thing.md2", memorySource(buildMdx()));
    expect(report.format).toBe("mdx");
    expect(report.diagnostics.map((d) => d.code)).toContain("file.extension-mismatch");
  });

  it("gives a diagnostic for unsupported and empty files", async () => {
    for (const bytes of [text("hello"), new Uint8Array()]) {
      const report = await inspectFile("x.dat", memorySource(bytes));
      expect(report.diagnostics.map((d) => d.code)).toEqual(["file.unsupported-format"]);
    }
  });
});

describe("BSP model evidence", () => {
  it("aggregates explicit model paths without guessing or accepting traversal", () => {
    const bytes = buildRoomBsp({extraEntities:
      '{ "classname" "props_phone" "model" "Models/Fixture/Phone.MDX" }\n' +
      '{ "classname" "props_phone" "model" "models/fixture/phone.mdx" }\n' +
      '{ "classname" "props_phone" }\n' +
      '{ "classname" "props_phone" "model" "models/../bad.mdx" }\n' +
      '{ "classname" "func_wall" "model" "*1" }'});
    const details = inspectBsp(bytes, new Diagnostics())!;
    expect(details.entityModels).toEqual([{classname:"props_phone",model:"models/fixture/phone.mdx",count:2}]);
  });
});
