// Maps a player's Kingpin installation onto the layout the unmodified engine
// reads. This is data preparation only; nothing is converted or copied elsewhere.
import { normalizePath } from "../vfs/vfs.ts";

/** Where the upstream engine looks for game data. */
export const ENGINE_GAME_DIR = "/baseq2";
export type EngineFlavour = "upstream" | "kingpin";
export function engineGameDir(flavour: EngineFlavour): string {
  return flavour === "kingpin" ? "/main" : ENGINE_GAME_DIR;
}

/** Saved imports retain their original canonical paths; translate only at launch. */
export function engineTarget(target: string, flavour: EngineFlavour): string {
  if (!target.startsWith(`${ENGINE_GAME_DIR}/`)) throw new Error(`Invalid imported path: ${target}`);
  const relative = target.slice(ENGINE_GAME_DIR.length + 1).toLowerCase();
  if (!relative || relative.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`Invalid imported path: ${target}`);
  }
  return `${engineGameDir(flavour)}/${relative}`;
}

/** Allow world assets and loose model geometry/skins; sounds are not used yet. */
const WANTED = /^(?:[^/]+\.pak|textures\/.+|maps\/[^/]+\.bsp|pics\/.+|env\/.+|models\/.+\.(?:mdx|md2|tga|pcx|png|jpg))$/;

export interface PlannedFile<T> {
  /** Absolute path in the engine's virtual filesystem. */
  target: string;
  file: T;
}

export interface GamePlan<T> {
  /** The selected directory that holds pak0.pak. */
  root: string;
  files: PlannedFile<T>[];
}

/**
 * Chooses and renames files from a selection such as a "Kingpin" or "main"
 * folder. Paths are lower-cased because the engine's filesystem is
 * case-sensitive and the original names (e.g. "Pak0.pak") are not consistent.
 */
export function planGameFiles<T extends { path: string }>(selected: readonly T[]): GamePlan<T> {
  const paths = selected.map((file) => ({ file, path: normalizePath(file.path) }));
  const roots = paths
    .map(({ path }) => /^((?:.*\/)?)pak0\.pak$/i.exec(path)?.[1])
    .filter((root) => root !== undefined);
  // Mods also carry a pak0.pak; the base game's directory is "main".
  const root = roots.find((r) => /(^|\/)main\/$/i.test(r)) ?? (roots.length === 1 ? roots[0] : undefined);
  if (root === undefined) {
    throw new Error(
      roots.length
        ? `several folders contain pak0.pak (${roots.join(", ")}); select the game's "main" folder`
        : 'no pak0.pak found; select your Kingpin folder or its "main" folder',
    );
  }
  const files = new Map<string, T>();
  for (const { file, path } of paths) {
    if (!path.startsWith(root)) continue;
    const relative = path.slice(root.length).toLowerCase();
    if (!WANTED.test(relative) || relative.split("/").includes("..")) continue;
    files.set(`${ENGINE_GAME_DIR}/${relative}`, file);
  }
  return { root: root.slice(0, -1) || ".", files: [...files].map(([target, file]) => ({ target, file })) };
}

/** Names of maps available in the pak directory and as loose files, sorted. */
export function listMaps(paths: readonly string[]): string[] {
  const names = paths.map((p) => /(?:^|\/)maps\/([a-z0-9_-]+)\.bsp$/i.exec(p)?.[1]?.toLowerCase());
  return [...new Set(names.filter((n) => n !== undefined))].sort();
}

/** Settings run after the game's own default.cfg. */
export const AUTOEXEC = [
  'bind w "+forward"',
  'bind s "+back"',
  'bind a "+moveleft"',
  'bind d "+moveright"',
  'bind SPACE "+moveup"',
  'bind c "+movedown"',
  'bind SHIFT "+speed"',
  'bind p "viewpos"',
  // The experimental engine's weapons; the reference engine has no "Pipe".
  'bind 1 "use Pipe"',
  'bind 2 "use Blaster"',
  "set freelook 1",
  "set cl_run 1",
  // There is no server to fetch missing files from.
  "set allow_download 0",
  // The Quake II status bar's pictures are absent; hide the resulting notices.
  "set con_notifytime 0",
  "",
].join("\n");
