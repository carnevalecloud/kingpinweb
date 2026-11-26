/**
 * Fails if proprietary-looking game files or executables are about to be
 * committed (no argument) or published (pass a directory such as dist).
 */
import { execFileSync } from "node:child_process";
import { closeSync, openSync, readSync, readdirSync } from "node:fs";
import { join } from "node:path";

const EXTENSIONS =
  /\.(pak|pk2|pk3|pkz|bsp|md2|mdx|tga|wal|pcx|cin|dm2|wav|mp3|ogg|sav|ssv|sv2|exe|dll|so|dylib|iso|cab|zip)$/i;
const MAGIC = new Set(["PACK", "IBSP", "IDP2", "IDPX"]);

export function findForbidden(paths: string[]): string[] {
  const bad: string[] = [];
  for (const path of paths) {
    if (EXTENSIONS.test(path)) {
      bad.push(`${path} (file type)`);
      continue;
    }
    const head = Buffer.alloc(4);
    const fd = openSync(path, "r");
    try {
      readSync(fd, head, 0, 4, 0);
    } finally {
      closeSync(fd);
    }
    const magic = head.toString("latin1");
    if (MAGIC.has(magic) || magic.startsWith("MZ\x90") || magic === "\x7fELF") bad.push(`${path} (file signature)`);
  }
  return bad;
}

if (import.meta.main) {
  const directory = process.argv[2];
  const paths = directory
    ? readdirSync(directory, { recursive: true, withFileTypes: true })
        .filter((e) => !e.isDirectory())
        .map((e) => join(e.parentPath, e.name))
    : execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" })
        .split("\0")
        .filter(Boolean);
  const bad = findForbidden(paths);
  if (bad.length) {
    console.error(`Forbidden files found:\n  ${bad.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`Asset check passed: ${paths.length} files in ${directory ?? "the repository"}`);
}
