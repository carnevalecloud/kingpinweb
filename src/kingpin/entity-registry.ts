// Maps Kingpin classnames to the original models that represent them. Evidence and
// open questions: docs/compatibility/entity-models.md. Only paths and key names
// are recorded here; no text or code from any game tool is copied.
import type { Entity } from "../formats/entities.ts";

export type EntityKind = "prop" | "light" | "pickup" | "character";
/**
 * "definition": the model path is named by the entity definitions installed with
 * the game. "assets": inferred from the installed file names.
 */
export type Evidence = "definition" | "assets" | "map";

export interface Part {
  model: string;
  /** Replaces the model's first skin. Candidates in order of preference. */
  skins?: string[];
}

export interface Resolution {
  kind: EntityKind;
  evidence: Evidence;
  parts: Part[];
  /** Lower the origin onto the floor using this collision box. */
  drop?: "cast" | "item";
  /** Cycle the leading idle animation. */
  animate?: boolean;
  /** A character the engine drives: solid, mortal and able to walk a path. */
  actor?: boolean;
  scale: number;
}

/** A recognised entity that is deliberately not shown, with the reason. */
export interface Skip { skip: string }

export type HasFile = (path: string) => boolean;

type Choose = (entity: Entity, flags: number) => string[];
interface Rule { kind: EntityKind; evidence: Evidence; models: Choose; drop?: "item" }

const fixed = (...paths: string[]): Choose => () => paths;
const def = (kind: EntityKind, ...paths: string[]): Rule =>
  ({ kind, evidence: "definition", models: fixed(...paths), ...(kind === "pickup" ? { drop: "item" as const } : {}) });
const inferred = (kind: EntityKind, ...paths: string[]): Rule => ({ ...def(kind, ...paths), evidence: "assets" });
const inDir = (dir: string, ...names: string[]) => names.map((name) => `${dir}/${name}`);

/** Crate skin follows the TYPE_* spawn flags; the pairing with files is inferred from their skins. */
const crate = (size: number): Rule => ({
  kind: "prop",
  evidence: "definition",
  models: (_, flags) => [
    `props/crate/${flags & 16 ? `stillcard${size}` : `stillcrate${size}_${flags & 4 ? 2 : 1}`}.mdx`,
  ],
});

const flagged = (kind: EntityKind, pick: (flags: number) => string[]): Rule =>
  ({ kind, evidence: "definition", models: (_, flags) => pick(flags) });

const prop = (...paths: string[]) => def("prop", ...paths);
const item = (path: string) => def("pickup", path);

const RULES: Record<string, Rule> = {
  // Decorative props.
  props_hydrant: prop("props/hydrant/tris.md2"),
  props_fan: prop("props/fan/tris.md2"),
  props_aircon: prop("props/aircon/tris.md2"),
  props_phone: prop("props/phone/tris.md2"),
  props_radio: prop("props/radio/tris.md2"),
  props_tableseta: prop("props/tablesets/set.mdx"),
  props_trashcana: prop("props/t_can/tris.md2"),
  props_trashcan_fall: prop("props/t_can2/tris.md2"),
  props_crate_bust_32: crate(32),
  props_crate_bust_48: crate(48),
  props_crate_bust_64: crate(64),
  props_ammocrate_bust: prop("props/crate/tris.md2"),
  props_chair: prop("props/chair/chair.mdx"),
  props2_chair_push: prop("props/chair/chair.mdx"),
  props_extinguishera: prop("pu_icon/exting/ext1.md2"),
  props_extinguisherb: prop("pu_icon/exting/ext2.md2"),
  props_motorcycle: prop("props/moto/moto.mdx", "props/moto/chrome.mdx"),
  props_shelf: prop(...inDir("props/shelf", "flametank.mdx", "pistol.mdx", "shotgun.mdx", "tomgun.mdx", "sshell.mdx")),
  props_shelf_fall: prop("props/shelf/shelf.mdx", "props/shelf/top.mdx"),
  props_shelfb_fall: prop("props/shelftwo/shelf.mdx", "props/shelftwo/top.mdx"),
  props_mattressa: prop("props/mattress/matt.md2"),
  props_mattressb: prop("props/mattress/matt2.md2"),
  props_mattressc: prop("props/mattress/matt3.md2"),
  props_tv: prop("props/tv/tv.md2"),
  props_trash: prop("props/trash/tris.md2"),
  props_wall_fall: prop("props/wall/wall.mdx"),
  props_trashbottle: prop("props/trashbottle/tris.md2"),
  props_trashbottle_vert: prop("props/trashbottle_vert/tris.md2"),
  props_trashpaper: prop("props/trashpaper/tris.md2"),
  props_trashwall: prop("props/trashwall/tris.md2"),
  props_trashcorner: prop("props/trashcorner/tris.md2"),
  props_roof_vent: prop("props/roof_vent/tris.md2"),
  props_cola_machine: prop("props/vending_mach/tris.md2"),
  props_cig_machine: prop("props/cigmachine/tris.md2"),
  props_rat: inferred("prop", "actors/rat/rat.mdx"),
  props2_barrels_falla: prop("props/barl1/barrels.mdx", "props/barl1/tops.mdx"),
  props2_barrels_fallb: prop("props/barl2/barrels2.mdx", "props/barl2/tops2.mdx"),
  props2_barrels_fall_st: prop(...inDir("props/barl_steel", "barrels.mdx", "tops.mdx", "door.mdx")),
  props2_clubcouch: prop("props/clubcouch/tris.md2"),
  props2_clubchair: prop("props/clubchair/tris.md2"),
  props2_vasea: prop("props/vase1/tris.md2"),
  props2_vaseb: prop("props/vase2/tris.md2"),
  props2_chair_conf: prop("props/confchair/tris.md2"),
  props2_shelf_metal_a_fall: prop(...inDir("props/shelfmetal1", "shelf1.mdx", "shelf2.mdx", "barreltops.mdx", "tanktops.mdx")),
  props2_shelf_metal_b_fall: prop(...inDir("props/shelfmetal2", "shelf1.mdx", "shelf2.mdx", "barreltops.mdx", "tanktops.mdx")),
  props2_deadguy: prop(...inDir("props/deadguy", "body.mdx", "head.mdx", "legs.mdx")),
  props2_deadguy_underwater: prop(...inDir("props/cementguy", "body.mdx", "head.mdx", "legs.mdx")),
  props2_deadgal_headless: prop("props/dead_fem/body.mdx", "props/dead_fem/legs.mdx"),
  props2_flag: flagged("prop", (flags) => [`props/flag/flag${flags & 4 ? 3 : flags & 2 ? 2 : 1}.md2`]),
  props2_wall_fish: prop("props/fish/tris.md2"),
  props2_sign: prop(...inDir("props/sign", "sign.mdx", "bar.mdx", "chain.mdx")),
  props2_boat: prop("props/boat/boat.mdx", "props/boat/glass.mdx"),
  props2_buoy: prop("props/buoy/buoy.mdx"),
  props2_buoy_side: prop("props/buoyside/buoy.mdx"),
  props2_gargoyle: prop("props/gargoyle/tris.md2"),
  props2_clothesline: prop("props/clothes/tris.md2"),
  props2_plant_xl: prop("props/plants/plant_xl.md2"),
  props2_plant_sm: prop("props/plants/plant_sm.md2"),
  props2_lunch: prop("props/lunch_set/tris.md2"),
  props2_ashtray: prop("props/ashtray_set/tris.md2"),
  props2_boatphone: prop("props/boatphone/tris.md2"),
  props2_plant_bush: prop("props/bush/tris.md2"),
  props2_car_topup: prop("props/car/car_up.md2"),
  props2_car_topdown: prop("props/car/car_td.md2"),
  props2_plant_fern: prop("props/fern/tris.md2"),
  props2_pinball_machine: flagged("prop", (flags) => [
    `props/pin${flags & 4 ? 3 : flags & 2 ? 2 : 1}/pinball_m.mdx`, "props/pinball/glass.mdx", "props/pinball/ball.mdx",
  ]),
  ...Object.fromEntries(
    ([["a", 1], ["b", 7], ["c", 3], ["d", 4], ["e", 5]] as const).map(([letter, n]) => [
      `props2_barrels_pv_${letter}`,
      prop(...inDir(`props/pv_barl${n}`, "barrel_v2.mdx", "barrel_v4.mdx", "top_barrel_v2.mdx", "top_barrel_v4.mdx",
        ...(letter === "a" ? ["barrel_v4last.mdx"] : []))),
    ]),
  ),
  props2_barrels_pv_f: prop("props/pv_barl6/barrel_v2.mdx", "props/pv_barl6/top_barrel_v2.mdx"),
  props3_dead_louie: prop(...inDir("props/louie", "body.mdx", "head.mdx", "legs.mdx")),
  props3_deco_fixture: prop("props/deco_fixture/deco_fixture.mdx"),
  props3_decanter: prop("props/decanter/solid.mdx", "props/decanter/glass.mdx"),
  props3_whiskey_glass: prop("props/whiskeyglass/solid.mdx", "props/whiskeyglass/glass.mdx"),
  props3_barrels_fall_nikki_a: prop("props/nikki1/barrel_v4.mdx", "props/nikki1/top_barrel_v4.mdx"),
  props3_barrels_fall_nikki_b: prop("props/nikki2/barrel_v4.mdx", "props/nikki2/top_barrel_v4.mdx"),
  props3_cash: prop("props/cash/cashstack.mdx"),
  dm_props_banner: prop("props/flag/flag1.md2"),

  // Light fixtures that have a model.
  light_sconce: flagged("light", (flags) => [
    `props/sconce/light${flags & 16 ? "b" : flags & 32 ? "g" : flags & 64 ? "r" : flags & 128 ? "y" : ""}.md2`,
  ]),
  light_deco_sconce: def("light", "props/decosconce/tris.md2"),
  light_chandelier: def("light", "props/chandelier/tris.md2"),
  light_pendant: def("light", "props/pendant/tris.md2"),

  // Pickups.
  item_armor_helmet: item("pu_icon/armor_head/armor_head.md2"),
  item_armor_jacket: item("pu_icon/armor/tris.md2"),
  item_armor_legs: item("pu_icon/armor_lo/armor_lo.md2"),
  item_armor_helmet_heavy: item("pu_icon/armor_head/armor_head_hd.md2"),
  item_armor_jacket_heavy: item("pu_icon/armor/armorhdtop.md2"),
  item_armor_legs_heavy: item("pu_icon/armor_lo/armor_lo_hd.md2"),
  weapon_crowbar: item("weapons/g_crowbar/tris.md2"),
  weapon_pistol: item("weapons/g_pistol/tris.md2"),
  weapon_tommygun: item("weapons/g_tomgun/tris.md2"),
  weapon_shotgun: item("weapons/g_shotgun/tris.md2"),
  // The definition names the flame ammunition icon; the dropped-weapon models are used instead.
  weapon_flamethrower: inferred("pickup", "weapons/g_flamegun/gun.md2", "weapons/g_flamegun/tank.md2"),
  weapon_grenadelauncher: item("weapons/g_grenade_launcher/tris.md2"),
  weapon_bazooka: item("weapons/g_rocket_launcher/tris.md2"),
  weapon_heavymachinegun: item("weapons/g_hmg/tris.md2"),
  ammo_grenades: item("pu_icon/grenade/tris.md2"),
  ammo_shells: item("pu_icon/shotgun_shell/tris.md2"),
  ammo_bullets: item("pu_icon/pclip/tris.md2"),
  ammo_rockets: item("pu_icon/rocket/tris.md2"),
  ammo_308: item("pu_icon/hmgclip/tris.md2"),
  ammo_cylinder: item("pu_icon/tgclip/tris.md2"),
  ammo_flametank: item("pu_icon/flametank/tris.md2"),
  item_coil: item("pu_icon/coil/tris.md2"),
  item_cashroll: item("pu_icon/cash/tris.md2"),
  item_cashbaglarge: item("pu_icon/money/money_lg.md2"),
  item_cashbagsmall: item("pu_icon/money/money_sm.md2"),
  item_battery: item("pu_icon/battery/tris.md2"),
  item_health_sm: item("pu_icon/health_s/tris.md2"),
  item_health_lg: item("pu_icon/health/tris.md2"),
  item_flashlight: item("pu_icon/f_light/tris.md2"),
  item_watch: item("pu_icon/watch/tris.md2"),
  item_whiskey: item("pu_icon/whiskey/tris.md2"),
  key_key1: item("pu_icon/key/key_a.md2"),
  key_key2: item("pu_icon/key/key_a.md2"),
  key_key3: item("pu_icon/key/key_a.md2"),
  key_key4: item("pu_icon/key/key_a.md2"),
  key_key5: item("pu_icon/key/key_a.md2"),
  key_fuse: inferred("pickup", "pu_icon/fuse/tris.md2"),
  pistol_mod_rof: inferred("pickup", "pu_icon/ro_fire_mod/tris.md2"),
  pistol_mod_reload: inferred("pickup", "pu_icon/reload_mod/tris.md2"),
  pistol_mod_damage: inferred("pickup", "pu_icon/magmod/tris.md2"),
  hmg_mod_cooling: inferred("pickup", "pu_icon/coolmod/tris.md2"),
  item_adrenaline: inferred("pickup", "pu_icon/adrenaline/tris.md2"),
  item_pack: inferred("pickup", "pu_icon/backpack/tris.md2"),
  item_oilcan: inferred("pickup", "pu_icon/oilcan/tris.md2"),
  item_valve: inferred("pickup", "pu_icon/valve/tris.md2"),
  item_safedocs: inferred("pickup", "pu_icon/folder/tris.md2"),
  item_lizzyhead: inferred("pickup", "pu_icon/head/head.mdx"),
};

// Antennas share one naming pattern: props_antenna<shape><size>.
for (const shape of ["1", "2", "3"]) {
  for (const size of ["a", "b", "c"]) {
    // The definition names the shared "antenna" directory for 1a only.
    const dir = shape + size === "1a" ? "antenna" : `ant${shape}${size}`;
    RULES[`props_antenna${shape}${size}`] = prop(`props/${dir}/antenna.mdx`);
  }
}

interface Cast {
  /** Model directory under models/actors/. */
  dir: string;
  /** Skin directories, in search order. Several actors have none of their own. */
  skins: string[];
}

const CASTS: Record<string, Cast> = {
  cast_thug: { dir: "thug", skins: ["thug"] },
  cast_thug_sit: { dir: "thug_sit", skins: ["thug"] },
  cast_punk: { dir: "punk", skins: ["thug"] },
  cast_bum_sit: { dir: "bum_sit", skins: ["thug"] },
  // Runt folders have no leg skins; the numbers used by maps all exist for the thug.
  cast_runt: { dir: "runt", skins: ["runt", "thug"] },
  cast_shorty: { dir: "shorty", skins: ["runt", "thug"] },
  cast_bitch: { dir: "bitch", skins: ["bitch"] },
  cast_whore: { dir: "whore", skins: ["bitch"] },
};

/**
 * Meaning of the "head" key, inferred from the skin numbers that accompany it in
 * the maps (5xx with 1, 6xx with 2, 700 with 3) and the matching model names.
 */
const HEAD_MODELS = ["head", "bald_head", "pony_head", "weld_head"];

/** Characters driven by the engine so far; the others are static scenery. */
const ACTORS = new Set(["cast_thug", "cast_punk"]);

/** Spawn flag TRIGGERED_START: the character is absent until triggered. */
const TRIGGERED_START = 2;

function resolveCast(name: string, cast: Cast, entity: Entity, flags: number, scale: number, has: HasFile): Resolution | Skip {
  if (flags & TRIGGERED_START) return { skip: "appears only when triggered" };
  const numbers = (entity.get("art_skins") ?? "").trim().split(/\s+/);
  const actor = `models/actors/${cast.dir}`;
  let head = HEAD_MODELS[Number(entity.get("head") ?? 0)] ?? "head";
  if (!has(`${actor}/${head}.mdx`)) head = "head";
  // art_skins lists head, body and legs, each a three-digit file number.
  const part = (model: string, skin: string, index: number): Part => {
    const raw = numbers[index] ?? "";
    const number = /^\d{1,3}$/.test(raw) ? raw.padStart(3, "0") : "001";
    const wanted = cast.skins.map((dir) => `models/actors/${dir}/${skin}_${number}.tga`);
    return { model: `${actor}/${model}.mdx`, skins: wanted };
  };
  return {
    kind: "character", evidence: name === "cast_thug_sit" ? "assets" : "definition", drop: "cast", animate: true, scale,
    ...(ACTORS.has(name) ? { actor: true } : {}),
    parts: [part(head, "head", 0), part("body", "body", 1), part("legs", "legs", 2)],
  };
}

/** Classnames this registry says something about, shown or not. */
export function isModelEntity(classname: string): boolean {
  return /^(?:props\d?_|cast_|item_|ammo_|weapon_|key_|pistol_mod_|hmg_mod_|dm_|light_)/i.test(classname);
}

const EFFECTS = /^(?:props_(?:rat_spawner(?:_node)?|rat_trigger|steam_machine)|props2_fish\w*|dm_(?:cashspawn|safebag)|light_(?:fire\w*|bulb))$/;
const SAFE_MODEL = /^models\/[a-z0-9_./-]+\.(?:mdx|md2)$/;

/** How to show an entity, why it is not shown, or undefined if unknown. */
export function resolveEntity(entity: Entity, has: HasFile): Resolution | Skip | undefined {
  const name = (entity.get("classname") ?? "").toLowerCase();
  if (!isModelEntity(name)) return;
  const flags = Number(entity.get("spawnflags")) || 0;
  const requested = Number(entity.get("scale") ?? 1);
  const scale = Number.isFinite(requested) && requested >= 0.1 && requested <= 4 ? requested : 1;
  const model = entity.get("model")?.toLowerCase().replaceAll("\\", "/");
  if (model?.startsWith("*")) return { skip: "brush model" };

  if (name === "cast_dog") {
    const number = entity.get("skin") === "2" ? 2 : 1;
    return {
      kind: "character", evidence: "definition", drop: "cast", animate: true, scale,
      parts: [{ model: "models/actors/enemy_dog/enemy_dog.mdx", skins: [`models/actors/enemy_dog/dog_00${number}.tga`] }],
    };
  }
  const cast = CASTS[name];
  if (cast) return resolveCast(name, cast, entity, flags, scale, has);
  if (EFFECTS.test(name)) return { skip: "effect or spawn point" };
  if (name.endsWith("_animate") || /^props_motorcycle_run(?:away)?$/.test(name)) return { skip: "scripted animation" };

  const rule = RULES[name];
  if (!rule) return;
  if (model && SAFE_MODEL.test(model) && !model.split("/").includes("..")) {
    return { kind: rule.kind, evidence: "map", scale, parts: [{ model }], ...(rule.drop ? { drop: rule.drop } : {}) };
  }
  return {
    kind: rule.kind, evidence: rule.evidence, scale,
    parts: rule.models(entity, flags).map((path) => ({ model: `models/${path}` })),
    ...(rule.drop ? { drop: rule.drop } : {}),
  };
}
