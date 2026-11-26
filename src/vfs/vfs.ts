// Read-only virtual filesystem over loose files and PAK archives.
// Lookup is case-insensitive because the original game ran on Windows.
import { type ByteSource, sliceSource } from "../formats/binary.ts";
import type { Diagnostics } from "../formats/diagnostics.ts";
import { readPak } from "../formats/pak.ts";

export interface VfsFile {
  /** Path as stored, with forward slashes. */
  path: string;
  source: ByteSource;
  /** Name of the mount that provides the file. */
  mount: string;
}

export function normalizePath(path: string): string {
  return path
    .replaceAll("\\", "/")
    .split("/")
    .filter((part) => part !== "" && part !== ".")
    .join("/");
}

export class VirtualFileSystem {
  private readonly files = new Map<string, VfsFile[]>();

  /** Adds a file. Later additions take precedence over earlier ones. */
  add(path: string, source: ByteSource, mount: string): void {
    const clean = normalizePath(path);
    const key = clean.toLowerCase();
    const stack = this.files.get(key);
    const file = { path: clean, source, mount };
    if (stack) stack.unshift(file);
    else this.files.set(key, [file]);
  }

  /** Mounts every readable entry of a PAK under `prefix`. */
  async mountPak(name: string, source: ByteSource, diag: Diagnostics, prefix = ""): Promise<void> {
    for (const entry of (await readPak(source, diag)) ?? []) {
      this.add(prefix + entry.name, sliceSource(source, entry.offset, entry.size), name);
    }
  }

  /** The winning copy of a file, or undefined. */
  find(path: string): VfsFile | undefined {
    return this.files.get(normalizePath(path).toLowerCase())?.[0];
  }

  /** Winning copies of all files, sorted by path. */
  list(): VfsFile[] {
    return [...this.files.values()].map((stack) => stack[0]!).sort((a, b) => a.path.localeCompare(b.path));
  }

  /** Files provided by more than one mount, winner first. */
  shadowed(): VfsFile[][] {
    return [...this.files.values()].filter((stack) => stack.length > 1);
  }
}

/**
 * Mounts a set of game-directory files using Yamagi Quake II precedence:
 * loose files lowest, then pak0..pak9 in order, then other paks by name.
 * Whether Kingpin uses the same order is unverified.
 */
export async function mountGameFiles(
  files: { path: string; source: ByteSource }[],
  diag: Diagnostics,
): Promise<VirtualFileSystem> {
  const vfs = new VirtualFileSystem();
  const isPak = (path: string) => path.toLowerCase().endsWith(".pak");
  const rank = (path: string) => {
    const match = /(?:^|\/)pak(\d)\.pak$/i.exec(path);
    return match ? Number(match[1]) : 10;
  };
  for (const file of files) {
    if (!isPak(file.path)) vfs.add(file.path, file.source, "(loose)");
  }
  const paks = files
    .filter((f) => isPak(f.path))
    .sort((a, b) => rank(a.path) - rank(b.path) || a.path.localeCompare(b.path));
  for (const pak of paks) {
    // A pak's contents are relative to the directory that holds the pak.
    await vfs.mountPak(pak.path, pak.source, diag, pak.path.slice(0, pak.path.lastIndexOf("/") + 1));
  }
  return vfs;
}
