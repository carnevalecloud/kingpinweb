// Rewrites a map's entity lump so the experimental engine shows original models at
// their original places. Everything generated stays in the player's browser.
import { View } from "../formats/binary.ts";
import { Diagnostics } from "../formats/diagnostics.ts";
import { type Entity, parseEntities } from "../formats/entities.ts";
import { buildModelVariant, normalizeAssetPath } from "../formats/model-variant.ts";
import type { VirtualFileSystem } from "../vfs/vfs.ts";
import { type EntityKind, type Part, type Resolution, resolveEntity } from "./entity-registry.ts";

/** Spawn flags of kpweb_static_model; see engine/patches/005-map-models.patch. */
export const STATIC_FLAGS = { dropCast: 1, mapLit: 2, animate: 4, dropItem: 8 } as const;

/** Protocol limit on model indices, and the share left to the game module. */
const MAX_MODELS = 256;
const RESERVED_MODELS = 48;
/** The engine's limit on entity text (MAX_MAP_ENTSTRING). */
const MAX_ENTITY_TEXT = 0x40000;
const BSP_HEADER = 160;
const MODEL_LUMP = 13;
const MODEL_SIZE = 48;
const KIND_ORDER: EntityKind[] = ["prop", "light", "pickup", "character"];
const SKIN_EXTENSIONS = ["tga", "pcx", "png", "jpg"];

export interface MapModels {
  bytes: Uint8Array;
  /** Generated model files to be mounted beside the map. */
  files: { path: string; data: Uint8Array }[];
  /** Original skin files the generated models load. */
  skins: string[];
  /** Original entities shown, by kind. */
  placed: Record<EntityKind, number>;
  /** Classnames with models that could not be shown. */
  unresolved: Record<string, number>;
  /** Recognised entities deliberately left out, as "classname: reason". */
  skipped: Record<string, number>;
  /** Missing or unusable files and exceeded limits. */
  problems: string[];
}

const count = (record: Record<string, number>, key: string) => (record[key] = (record[key] ?? 0) + 1);

export async function populateMap(bytes: Uint8Array, vfs: VirtualFileSystem): Promise<MapModels> {
  const result: MapModels = {
    bytes, files: [], skins: [], placed: { prop: 0, light: 0, pickup: 0, character: 0 },
    unresolved: {}, skipped: {}, problems: [],
  };
  const problems = new Set<string>();
  const fail = (message: string): MapModels => ({ ...result, problems: [message] });
  const view = new View(bytes);
  if (bytes.length < BSP_HEADER || view.cstring(0, 4).text !== "IBSP" || view.i32(4) !== 38) {
    return fail("not a version 38 BSP map");
  }
  const offset = view.i32(8), size = view.i32(12);
  if (!view.has(offset, size) || offset < BSP_HEADER) return fail("entity lump outside the map file");
  const diag = new Diagnostics();
  const entities = parseEntities(view.cstring(offset, size).text, diag);
  if (diag.list().some((d) => d.severity !== "info")) return fail("entity lump could not be parsed cleanly");

  const has = (path: string) => !!vfs.find(path);
  const wanted: { index: number; resolution: Resolution }[] = [];
  entities.forEach((entity, index) => {
    const name = entity.get("classname") ?? "";
    const resolution = resolveEntity(entity, has);
    if (!resolution) {
      if (/^(?:props\d?_|cast_|item_|ammo_|weapon_|key_)/i.test(name)) count(result.unresolved, name);
    } else if ("skip" in resolution) count(result.skipped, `${name}: ${resolution.skip}`);
    else wanted.push({ index, resolution });
  });
  wanted.sort((a, b) => KIND_ORDER.indexOf(a.resolution.kind) - KIND_ORDER.indexOf(b.resolution.kind));

  // Brush models use model indices too.
  const inline = Math.floor(Math.max(view.i32(8 + MODEL_LUMP * 8 + 4), 0) / MODEL_SIZE);
  const budget = MAX_MODELS - RESERVED_MODELS - inline;
  const variants = new Map<string, { path: string; frames: number } | null>();
  const skins = new Set<string>();

  const findSkin = (path: string) => {
    const stem = normalizeAssetPath(path).replace(/\.[^./]+$/, "");
    const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
    return [extension, ...SKIN_EXTENSIONS].map((e) => `${stem}.${e}`).filter(has);
  };

  /** Skin override for a part: the first candidate that exists, else number 001. */
  const chooseSkin = (part: Part): string | undefined => {
    if (!part.skins) return;
    const found = part.skins.find(has);
    if (found) return found;
    const fallback = part.skins.map((p) => p.replace(/_\d{3}\./, "_001.")).find(has);
    problems.add(`missing skin ${part.skins[0]}${fallback ? `; using ${fallback}` : ""}`);
    return fallback;
  };

  const variant = async (part: Part, resolution: Resolution) => {
    const skin = chooseSkin(part);
    const key = [part.model, skin ?? "", resolution.animate ?? false, resolution.scale].join("|");
    const known = variants.get(key);
    if (known !== undefined) return known;
    const file = vfs.find(part.model);
    if (!file) {
      problems.add(`missing model ${part.model}`);
      variants.set(key, null);
      return null;
    }
    if (result.files.length >= budget) {
      problems.add(`model limit reached (${budget} distinct models); some entities are not shown`);
      return null;
    }
    const built = buildModelVariant(await file.source.read(0, file.source.size), {
      ...(skin ? { skin } : {}), animate: resolution.animate ?? false, scale: resolution.scale,
    });
    if (!built) {
      problems.add(`unusable model ${part.model}`);
      variants.set(key, null);
      return null;
    }
    for (const path of built.skins) {
      const found = findSkin(path);
      if (found.length) for (const f of found) skins.add(f);
      else problems.add(`missing skin ${path} for ${part.model}`);
    }
    const path = `models/kpweb/${String(result.files.length).padStart(3, "0")}.${part.model.slice(-3)}`;
    result.files.push({ path, data: built.bytes });
    const made = { path, frames: built.frames };
    variants.set(key, made);
    return made;
  };

  const replacements = new Map<number, Entity[]>();
  for (const { index, resolution } of wanted) {
    const original = entities[index]!;
    const name = original.get("classname")!;
    const parts = [];
    for (const part of resolution.parts) {
      const made = await variant(part, resolution);
      if (made) parts.push(made);
    }
    // A character with a missing head or legs would mislead; props may be partial.
    if (!parts.length || (resolution.kind === "character" && parts.length !== resolution.parts.length)) {
      count(result.unresolved, name);
      continue;
    }
    result.placed[resolution.kind]++;
    replacements.set(index, parts.map(({ path, frames }) => {
      let flags: number = STATIC_FLAGS.mapLit;
      if (resolution.drop === "cast") flags |= STATIC_FLAGS.dropCast;
      if (resolution.drop === "item") flags |= STATIC_FLAGS.dropItem;
      if (frames > 1) flags |= STATIC_FLAGS.animate;
      const entity: Entity = new Map([["classname", "kpweb_static_model"], ["model", path], ["spawnflags", String(flags)]]);
      if (frames > 1) entity.set("count", String(frames));
      for (const key of ["origin", "angle", "angles"]) {
        const value = original.get(key);
        if (value !== undefined) entity.set(key, value);
      }
      return entity;
    }));
  }
  result.problems = [...problems];
  result.skins = [...skins].sort();
  if (!replacements.size) return { ...result, files: [] };

  const text = entities
    .flatMap((entity, i) => replacements.get(i) ?? [entity])
    .map((e) => "{\n" + [...e].map(([k, v]) => `"${k}" "${v}"`).join("\n") + "\n}")
    .join("\n") + "\n\0";
  if (text.length > MAX_ENTITY_TEXT) return fail("rewritten entity lump exceeds the engine limit");
  // Preserve the original byte encoding (entity text is Latin-1), and append the
  // new lump so that all other lump offsets remain valid.
  const data = Uint8Array.from(text, (c) => c.charCodeAt(0));
  const out = new Uint8Array(bytes.length + data.length);
  out.set(bytes);
  out.set(data, bytes.length);
  const header = new DataView(out.buffer);
  header.setInt32(8, bytes.length, true);
  header.setInt32(12, data.length, true);
  return { ...result, bytes: out };
}

/** PACK archive generated locally to override the selected map and carry its models. */
export function buildOverridePak(entries: readonly { path: string; data: Uint8Array }[]): Uint8Array {
  for (const { path } of entries) {
    if (!/^[a-z0-9_./-]+$/.test(path) || path.split("/").includes("..") || path.length >= 56) {
      throw new Error(`Invalid archive path: ${path}`);
    }
  }
  const directory = 12 + entries.reduce((sum, e) => sum + e.data.length, 0);
  const out = new Uint8Array(directory + entries.length * 64);
  const view = new DataView(out.buffer);
  out.set([80, 65, 67, 75]);
  view.setInt32(4, directory, true);
  view.setInt32(8, entries.length * 64, true);
  let at = 12;
  entries.forEach(({ path, data }, i) => {
    const record = directory + i * 64;
    out.set(data, at);
    out.set(new TextEncoder().encode(path), record);
    view.setInt32(record + 56, at, true);
    view.setInt32(record + 60, data.length, true);
    at += data.length;
  });
  return out;
}
