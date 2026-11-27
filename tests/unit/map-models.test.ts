import { describe, expect, it } from "vitest";
import { memorySource } from "../../src/formats/binary.ts";
import { inspectModel } from "../../src/formats/alias-model.ts";
import { Diagnostics } from "../../src/formats/diagnostics.ts";
import { type Entity, parseEntities } from "../../src/formats/entities.ts";
import { decodeMdx } from "../../src/formats/mdx-mesh.ts";
import { buildModelVariant } from "../../src/formats/model-variant.ts";
import { readPak } from "../../src/formats/pak.ts";
import { resolveEntity } from "../../src/kingpin/entity-registry.ts";
import { buildOverridePak, populateMap, STATIC_FLAGS } from "../../src/kingpin/map-props.ts";
import { VirtualFileSystem } from "../../src/vfs/vfs.ts";
import { buildMd2, buildMdx, buildRoomBsp, buildTga } from "../fixtures/builders.ts";

const entity = (fields: Record<string, string>): Entity => new Map(Object.entries(fields));
const resolve = (fields: Record<string, string>, files: string[] = []) =>
  resolveEntity(entity(fields), (p) => files.includes(p));
const models = (fields: Record<string, string>, files: string[] = []) => {
  const result = resolve(fields, files);
  return result && "parts" in result ? result.parts.map((p) => p.model) : result;
};

describe("entity registry", () => {
  it("resolves original classnames, ignoring case", () => {
    const expected: Record<string, string> = {
      props_trashwall: "props/trashwall/tris.md2",
      props_trashcorner: "props/trashcorner/tris.md2",
      props_trashbottle: "props/trashbottle/tris.md2",
      props_trashbottle_vert: "props/trashbottle_vert/tris.md2",
      props_trashpaper: "props/trashpaper/tris.md2",
      props_radio: "props/radio/tris.md2",
      props_phone: "props/phone/tris.md2",
      props_antenna2c: "props/ant2c/antenna.mdx",
      props_antenna2a: "props/ant2a/antenna.mdx",
      props_antenna1a: "props/antenna/antenna.mdx",
      props_trashcanA: "props/t_can/tris.md2",
      props_tablesetA: "props/tablesets/set.mdx",
      item_health_lg: "pu_icon/health/tris.md2",
      item_cashbagsmall: "pu_icon/money/money_sm.md2",
      ammo_bullets: "pu_icon/pclip/tris.md2",
    };
    for (const [classname, path] of Object.entries(expected)) {
      expect(models({ classname }), classname).toEqual([`models/${path}`]);
    }
  });

  it("chooses crate models from the type spawn flags", () => {
    const crate = (size: number, spawnflags: string) => models({ classname: `props_crate_bust_${size}`, spawnflags });
    expect(crate(32, "16")).toEqual(["models/props/crate/stillcard32.mdx"]);
    expect(crate(32, "4")).toEqual(["models/props/crate/stillcrate32_2.mdx"]);
    expect(crate(48, "8")).toEqual(["models/props/crate/stillcrate48_1.mdx"]);
    expect(crate(64, "0")).toEqual(["models/props/crate/stillcrate64_1.mdx"]);
  });

  it("assembles characters from head, body and legs with art_skins", () => {
    const result = resolve({ classname: "cast_runt", art_skins: "017 016 008" });
    expect(result).toMatchObject({
      kind: "character", drop: "cast",
      parts: [
        { model: "models/actors/runt/head.mdx", skins: ["models/actors/runt/head_017.tga", "models/actors/thug/head_017.tga"] },
        { model: "models/actors/runt/body.mdx" },
        { model: "models/actors/runt/legs.mdx", skins: ["models/actors/runt/legs_008.tga", "models/actors/thug/legs_008.tga"] },
      ],
    });
    const bald = "models/actors/punk/bald_head.mdx";
    expect(models({ classname: "cast_punk", head: "1" }, [bald])).toContain(bald);
    expect(models({ classname: "cast_runt", head: "1" })).toContain("models/actors/runt/head.mdx");
    expect(resolve({ classname: "cast_dog", skin: "2" })).toMatchObject({
      parts: [{ skins: ["models/actors/enemy_dog/dog_002.tga"] }],
    });
  });

  it("says why entities are left out and ignores unrelated ones", () => {
    expect(resolve({ classname: "cast_thug", spawnflags: "66" })).toHaveProperty("skip");
    expect(resolve({ classname: "props_rat_spawner_node" })).toHaveProperty("skip");
    expect(resolve({ classname: "props3_cut_A_animate" })).toHaveProperty("skip");
    expect(resolve({ classname: "props_unheard_of" })).toBeUndefined();
    expect(resolve({ classname: "func_wall", model: "*1" })).toBeUndefined();
  });

  it("accepts a safe model named by the map and rejects unsafe ones", () => {
    expect(models({ classname: "props_phone", model: "Models\\Custom\\a.mdx" })).toEqual(["models/custom/a.mdx"]);
    expect(models({ classname: "props_phone", model: "models/../a.mdx" })).toEqual(["models/props/phone/tris.md2"]);
  });
});

/** The fixture MDX with a second and third frame, the third from another animation. */
function animatedMdx(): Uint8Array {
  const one = buildMdx();
  const header = new DataView(one.buffer);
  const frames = header.getInt32(15 * 4, true), size = header.getInt32(4 * 4, true);
  const extra = new Uint8Array(size * 2);
  extra.set(one.subarray(frames, frames + size));
  extra.set(one.subarray(frames, frames + size), size);
  extra.set(new TextEncoder().encode("death01\0"), size + 24);
  // Append the whole frame section at the end and point the header at it.
  const all = new Uint8Array(one.length + size * 3);
  all.set(one);
  all.set(one.subarray(frames, frames + size), one.length);
  all.set(extra, one.length + size);
  const view = new DataView(all.buffer);
  view.setInt32(9 * 4, 3, true);
  view.setInt32(15 * 4, one.length, true);
  view.setInt32(22 * 4, all.length, true);
  return all;
}

/** The fixture MDX repeated once per name. */
function namedMdx(names: string[]): Uint8Array {
  const one = buildMdx();
  const header = new DataView(one.buffer);
  const frames = header.getInt32(15 * 4, true), size = header.getInt32(4 * 4, true);
  const all = new Uint8Array(one.length + size * names.length);
  all.set(one);
  names.forEach((name, i) => {
    const at = one.length + i * size;
    all.set(one.subarray(frames, frames + size), at);
    all.fill(0, at + 24, at + 40);
    all.set(new TextEncoder().encode(name), at + 24);
  });
  const view = new DataView(all.buffer);
  view.setInt32(9 * 4, names.length, true);
  view.setInt32(15 * 4, one.length, true);
  view.setInt32(22 * 4, all.length, true);
  return all;
}

describe("model variants", () => {
  it("keeps the idle run, replaces the skin and stays a valid MDX", () => {
    const variant = buildModelVariant(animatedMdx(), { animate: true, skin: "\\Models\\KPWeb\\Other.TGA" })!;
    expect(variant).toMatchObject({ frames: 2, skins: ["models/kpweb/other.tga"] });
    const diag = new Diagnostics();
    const mesh = decodeMdx(variant.bytes, diag)!;
    expect(diag.list()).toEqual([]);
    expect(mesh.frameNames).toEqual(["stand01", "stand01"]);
    expect(mesh.triangles).toHaveLength(1);
    expect(buildModelVariant(animatedMdx())!.frames).toBe(1);
  });

  it("scales about the floor", () => {
    const mesh = decodeMdx(buildModelVariant(buildMdx(), { scale: 2 })!.bytes, new Diagnostics())!;
    expect(Array.from(mesh.frame(0).slice(0, 3))).toEqual([0, 0, 24]);
    expect(mesh.frame(0)[3]).toBe(510);
  });

  it("rewrites MD2 skins and rejects broken or unsafe input", () => {
    const md2 = buildModelVariant(buildMd2(), { skin: "models/kpweb/b.pcx" })!;
    const diag = new Diagnostics();
    expect(inspectModel(md2.bytes, "md2", diag)!.skins).toEqual(["models/kpweb/b.pcx"]);
    expect(diag.list()).toEqual([]);
    expect(buildModelVariant(buildMdx().slice(0, 120))).toBeNull();
    expect(buildModelVariant(buildMdx(), { skin: "models/../x.tga" })).toBeNull();
  });
});

describe("map population", () => {
  const files = new Map<string, Uint8Array>([
    ["models/props/phone/tris.md2", buildMd2()],
    ["models/props/trashwall/tris.md2", buildMd2()],
    ["models/kpweb/skin.pcx", new Uint8Array(1)],
    ["models/kpweb/skin.tga", buildTga(4, 4, [1, 2, 3])],
    ...["head", "body", "legs"].flatMap((part): [string, Uint8Array][] => [
      [`models/actors/thug/${part}.mdx`, buildMdx()],
      [`models/actors/thug/${part}_001.tga`, buildTga(4, 4, [1, 2, 3])],
    ]),
  ]);
  const vfs = new VirtualFileSystem();
  for (const [path, data] of files) vfs.add(path, memorySource(data), "fixture");
  const map = (extraEntities: string) => buildRoomBsp({ extraEntities });
  const entitiesOf = (bytes: Uint8Array) => {
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    const offset = view.getInt32(8, true), size = view.getInt32(12, true);
    return parseEntities(new TextDecoder("latin1").decode(bytes.subarray(offset, offset + size - 1)), new Diagnostics());
  };

  it("replaces props and characters in place, sharing identical models", async () => {
    const source = map(
      '{"classname" "props_phone" "origin" "1 2 3" "angle" "225" "targetname" "t"}' +
      '{"classname" "props_phone" "origin" "4 5 6"}' +
      '{"classname" "cast_thug" "origin" "7 8 9" "art_skins" "001 001 001" "target" "x"}' +
      '{"classname" "props_trashwall" "origin" "0 0 0"}' +
      '{"classname" "props_fan"}{"classname" "props_mystery"}',
    );
    const before = source.slice();
    const result = await populateMap(source, vfs);
    expect(source).toEqual(before);
    expect(result.placed).toEqual({ prop: 3, light: 0, pickup: 0, character: 1 });
    expect(result.unresolved).toEqual({ props_fan: 1, props_mystery: 1 });
    expect([...result.problems].sort()).toEqual([
      "cast_thug: animations unusable; shown as scenery",
      "missing model models/props/fan/tris.md2",
    ]);
    expect(result.files).toHaveLength(5);
    expect(result.skins).toContain("models/actors/thug/head_001.tga");
    const placed = entitiesOf(result.bytes).filter((e) => e.get("classname") === "kpweb_static_model");
    expect(placed).toHaveLength(6);
    expect(placed[0]!.get("origin")).toBe("1 2 3");
    expect(placed[0]!.get("angle")).toBe("225");
    expect(placed[0]!.has("targetname")).toBe(false);
    expect(placed[0]!.get("model")).toBe(placed[1]!.get("model"));
    const cast = placed.filter((e) => e.get("origin") === "7 8 9");
    expect(cast).toHaveLength(3);
    expect(Number(cast[0]!.get("spawnflags")) & STATIC_FLAGS.dropCast).toBeTruthy();
  });

  it("hands an animated thug to the engine, following only unscripted paths", async () => {
    const names = ["amb_stand_01", "walk_guns_dn_01", "pain_chest_01", "death1_01", "death1_02"];
    const animated = new VirtualFileSystem();
    for (const part of ["head", "body", "legs"]) {
      animated.add(`models/actors/thug/${part}.mdx`, memorySource(namedMdx(names)), "fixture");
      animated.add(`models/actors/thug/${part}_001.tga`, memorySource(files.get(`models/actors/thug/${part}_001.tga`)!), "fixture");
    }
    animated.add("models/kpweb/skin.tga", memorySource(files.get("models/kpweb/skin.tga")!), "fixture");
    const result = await populateMap(map(
      '{"classname" "cast_thug" "origin" "1 1 1" "target" "a" "health" "80"}' +
      '{"classname" "cast_thug" "origin" "2 2 2" "target" "b"}' +
      '{"classname" "path_corner_cast" "targetname" "a"}' +
      '{"classname" "path_corner_cast" "targetname" "b" "target" "c"}' +
      '{"classname" "path_corner_cast" "targetname" "c" "target" "b" "scriptname" "s"}',
    ), animated);
    expect(result.placed.character).toBe(2);
    const casts = entitiesOf(result.bytes).filter((e) => e.get("classname") === "kpweb_cast");
    expect(casts[0]!.get("message")).toMatch(/^models\/kpweb\/\d{3}\.mdx models\/kpweb\/\d{3}\.mdx 1 1 1 2 0 0$/);
    expect([casts[0]!.get("target"), casts[0]!.get("health")]).toEqual(["a", "80"]);
    expect(casts[1]!.has("target")).toBe(false);
  });

  it("gives a thug with run and punch animations the means to fight", async () => {
    const names = ["amb_stand_01", "walk_guns_dn_01", "pain_chest_01", "death1_01", "run_guns_dn_01", "melee1_01"];
    const fighter = new VirtualFileSystem();
    for (const part of ["head", "body", "legs"]) {
      fighter.add(`models/actors/thug/${part}.mdx`, memorySource(namedMdx(names)), "fixture");
      fighter.add(`models/actors/thug/${part}_001.tga`, memorySource(files.get(`models/actors/thug/${part}_001.tga`)!), "fixture");
    }
    fighter.add("models/kpweb/skin.tga", memorySource(files.get("models/kpweb/skin.tga")!), "fixture");
    const result = await populateMap(map('{"classname" "cast_thug" "origin" "1 1 1"}'), fighter);
    const cast = entitiesOf(result.bytes).find((e) => e.get("classname") === "kpweb_cast")!;
    expect(cast.get("message")).toMatch(/ 1 1 1 1 1 1$/);
  });

  it("omits a character with a missing part and leaves other maps unchanged", async () => {
    const source = map('{"classname" "cast_runt" "origin" "0 0 0"}');
    const result = await populateMap(source, vfs);
    expect(result.bytes).toBe(source);
    expect(result.files).toEqual([]);
    expect(result.unresolved).toEqual({ cast_runt: 1 });
    expect((await populateMap(new Uint8Array(4), vfs)).problems).toEqual(["not a version 38 BSP map"]);
  });

  it("writes an archive holding the map and its models", async () => {
    const pak = buildOverridePak([
      { path: "maps/sr1.bsp", data: new Uint8Array([1, 2]) },
      { path: "models/kpweb/000.md2", data: new Uint8Array([3]) },
    ]);
    const entries = await readPak(memorySource(pak), new Diagnostics());
    expect(entries!.map((e) => [e.name, e.size])).toEqual([["maps/sr1.bsp", 2], ["models/kpweb/000.md2", 1]]);
    expect(() => buildOverridePak([{ path: "../x", data: pak }])).toThrow();
  });
});
