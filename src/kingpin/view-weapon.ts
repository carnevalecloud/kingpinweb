// Prepares the original first-person pipe and pistol for the experimental engine
// (engine/patches/010-view-weapon.patch). Each part is a model; they are drawn together.
import { inspectModel } from "../formats/alias-model.ts";
import { Diagnostics } from "../formats/diagnostics.ts";
import { animationFrames, buildModelVariant } from "../formats/model-variant.ts";
import type { VirtualFileSystem } from "../vfs/vfs.ts";

/** The engine looks for a weapon's parts by number, in this order. */
const WEAPONS = [
  // The lead pipe's files are in the "blakjak" folder; its skin is named for a pipe.
  { name: "pipe", dir: "blakjak", parts: ["blakjak", "hand"], fire: "powr" },
  { name: "pistol", dir: "v_colt", parts: ["pistol", "handr", "handl", "clip"], fire: "pow" },
];

export interface ViewWeapons {
  /** Generated model files, for usable weapons only. */
  files: { path: string; data: Uint8Array }[];
  /** Original skin files the generated models load. */
  skins: string[];
  problems: string[];
}

/**
 * Frames in the order the engine expects: 6 to raise, 4 to attack, 1 held, 5 to
 * lower. The held frame is the end of raising. Reload, walk and the pipe's second
 * swing are not used yet.
 */
function weaponFrames(names: readonly string[], attack: string): number[] | null {
  const [raise, fire, lower] = ["active", attack, "putaway"].map((n) => animationFrames(names, n));
  if (raise!.length !== 6 || fire!.length !== 4 || lower!.length !== 5) return null;
  return [...raise!, ...fire!, raise!.at(-1)!, ...lower!];
}

/** A weapon with an unusable part is left out entirely. */
export async function buildViewWeapons(vfs: VirtualFileSystem): Promise<ViewWeapons> {
  const result: ViewWeapons = { files: [], skins: [], problems: [] };
  const skins = new Set<string>();
  for (const weapon of WEAPONS) {
    const files: ViewWeapons["files"] = [];
    const needed: string[] = [];
    for (const [index, part] of weapon.parts.entries()) {
      const path = `models/weapons/${weapon.dir}/${part}.mdx`;
      const file = vfs.find(path);
      if (!file) {
        result.problems.push(`missing model ${path}`);
        break;
      }
      const source = await file.source.read(0, file.source.size);
      const model = inspectModel(source, "mdx", new Diagnostics());
      const frames = model && weaponFrames(model.frames, weapon.fire);
      const built = frames && buildModelVariant(source, { frames });
      if (!built) {
        result.problems.push(`unusable model ${path}`);
        break;
      }
      const missing = built.skins.find((skin) => !vfs.find(skin));
      if (missing) {
        result.problems.push(`missing skin ${missing} for ${path}`);
        break;
      }
      needed.push(...built.skins);
      files.push({ path: `models/kpweb/view/${weapon.name}_${index}.mdx`, data: built.bytes });
    }
    if (files.length !== weapon.parts.length) continue;
    result.files.push(...files);
    for (const skin of needed) skins.add(skin);
  }
  result.skins = [...skins].sort();
  return result;
}
