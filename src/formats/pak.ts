import { type ByteSource, View, hexPreview } from "./binary.ts";
import type { Diagnostics } from "./diagnostics.ts";

export const PAK_HEADER_SIZE = 12;
export const PAK_ENTRY_SIZE = 64;
const PAK_NAME_SIZE = 56;
/** Yamagi Quake II warns above this many entries (MAX_FILES_IN_PACK). */
export const Q2_MAX_FILES_IN_PACK = 4096;
/** Refuse to allocate absurd directories from corrupt headers. */
const MAX_DIRECTORY_BYTES = 8 * 1024 * 1024;

export interface PakEntry {
  name: string;
  offset: number;
  size: number;
}

/**
 * Reads a Quake-style "PACK" directory. Only the header and directory are read.
 * Entries whose data lies outside the file are reported and omitted.
 * Returns null when the source is not a readable pack.
 */
export async function readPak(source: ByteSource, diag: Diagnostics): Promise<PakEntry[] | null> {
  if (source.size < PAK_HEADER_SIZE) {
    diag.error("pak.truncated-header", `file is ${source.size} bytes; a PAK header needs ${PAK_HEADER_SIZE}`);
    return null;
  }
  const headerBytes = await source.read(0, PAK_HEADER_SIZE);
  const header = new View(headerBytes);
  const magic = header.cstring(0, 4).text;
  if (magic !== "PACK") {
    diag.error("pak.bad-magic", `expected "PACK", found bytes ${hexPreview(headerBytes, 4)}`);
    return null;
  }
  const dirOffset = header.i32(4);
  const dirLength = header.i32(8);
  if (dirOffset < 0 || dirLength < 0 || dirOffset + dirLength > source.size) {
    diag.error("pak.directory-out-of-bounds", `directory ${dirOffset}+${dirLength} is outside ${source.size} bytes`);
    return null;
  }
  if (dirLength > MAX_DIRECTORY_BYTES) {
    diag.error("pak.directory-too-large", `directory is ${dirLength} bytes (limit ${MAX_DIRECTORY_BYTES})`);
    return null;
  }
  if (dirLength % PAK_ENTRY_SIZE !== 0) {
    diag.warn(
      "pak.directory-size",
      `directory length ${dirLength} is not a multiple of ${PAK_ENTRY_SIZE}; the entry layout may differ from Quake`,
    );
  }

  const count = Math.floor(dirLength / PAK_ENTRY_SIZE);
  if (count === 0) diag.warn("pak.empty", "pack contains no entries");
  if (count > Q2_MAX_FILES_IN_PACK) {
    diag.info("pak.many-files", `${count} entries exceeds the Quake II limit of ${Q2_MAX_FILES_IN_PACK}`);
  }

  const dir = new View(await source.read(dirOffset, count * PAK_ENTRY_SIZE));
  const entries: PakEntry[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < count; i++) {
    const base = i * PAK_ENTRY_SIZE;
    const { text: name, terminated } = dir.cstring(base, PAK_NAME_SIZE);
    const offset = dir.i32(base + PAK_NAME_SIZE);
    const size = dir.i32(base + PAK_NAME_SIZE + 4);
    if (!terminated) diag.warn("pak.unterminated-name", `entry ${i} name fills all ${PAK_NAME_SIZE} bytes`);
    if (name === "") {
      diag.warn("pak.empty-name", `entry ${i} has an empty name`);
      continue;
    }
    if (offset < 0 || size < 0 || offset + size > source.size) {
      diag.error("pak.entry-out-of-bounds", `"${name}" data ${offset}+${size} is outside ${source.size} bytes`);
      continue;
    }
    if (isUnsafePath(name)) diag.warn("pak.unsafe-path", `"${name}" is absolute or escapes its directory`);
    const key = name.toLowerCase();
    if (seen.has(key)) diag.warn("pak.duplicate-name", `"${name}" appears more than once (ignoring case)`);
    seen.add(key);
    entries.push({ name, offset, size });
  }
  return entries;
}

export function isUnsafePath(path: string): boolean {
  const p = path.replaceAll("\\", "/");
  return p.startsWith("/") || /^[a-z]:/i.test(p) || p.split("/").includes("..");
}
