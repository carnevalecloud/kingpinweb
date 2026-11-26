/**
 * Kingpin asset inspector (command line). Reads files locally and writes only
 * metadata; asset contents are never copied.
 *
 *   node src/cli/inspect.ts <file>                      one file, JSON to stdout
 *   node src/cli/inspect.ts <dir> [--json f] [--report f]  a game directory
 */
import { open, readdir, stat, writeFile, type FileHandle } from "node:fs/promises";
import { basename, join, relative, sep } from "node:path";
import { parseArgs } from "node:util";
import { type ByteSource, checkRange } from "../formats/binary.ts";
import { inspectFile } from "../formats/inspect.ts";
import { inspectGame, toMarkdown } from "../formats/report.ts";

const USAGE = "Usage: inspect <file-or-directory> [--json out.json] [--report out.md]";

async function fileSource(path: string, handles: FileHandle[]): Promise<ByteSource> {
  const { size } = await stat(path);
  let handle: FileHandle | undefined;
  return {
    size,
    async read(offset, length) {
      checkRange(offset, length, size);
      // Opened lazily so large directories do not exhaust descriptors.
      if (!handle) {
        handle = await open(path, "r");
        handles.push(handle);
      }
      const buffer = new Uint8Array(length);
      let done = 0;
      while (done < length) {
        const { bytesRead } = await handle.read(buffer, done, length - done, offset + done);
        if (bytesRead === 0) throw new Error(`unexpected end of file: ${path}`);
        done += bytesRead;
      }
      return buffer;
    },
  };
}

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { json: { type: "string" }, report: { type: "string" }, help: { type: "boolean", short: "h" } },
  });
  const [target] = positionals;
  if (values.help || !target || positionals.length > 1) {
    console.error(USAGE);
    return values.help ? 0 : 2;
  }

  const handles: FileHandle[] = [];
  try {
    const info = await stat(target);
    if (!info.isDirectory()) {
      if (values.report) throw new Error("--report needs a directory");
      const report = await inspectFile(basename(target), await fileSource(target, handles));
      const json = JSON.stringify(report, null, 2);
      if (values.json) await writeFile(values.json, json + "\n");
      else console.log(json);
      return report.diagnostics.some((d) => d.severity === "error") ? 1 : 0;
    }

    const files = [];
    for (const entry of await readdir(target, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue; // symbolic links are not followed
      const full = join(entry.parentPath, entry.name);
      files.push({ path: relative(target, full).split(sep).join("/"), source: await fileSource(full, handles) });
    }
    if (!files.length) throw new Error(`no files found in ${target}`);
    files.sort((a, b) => a.path.localeCompare(b.path));

    const report = await inspectGame(files);
    if (values.json) await writeFile(values.json, JSON.stringify(report, null, 2) + "\n");
    const markdown = toMarkdown(report);
    if (values.report) await writeFile(values.report, markdown);
    else console.log(markdown);
    const all = [...report.sources, ...report.assets];
    return all.some((r) => r.diagnostics.some((d) => d.severity === "error")) ? 1 : 0;
  } finally {
    await Promise.all(handles.map((h) => h.close()));
  }
}

main().then(
  (code) => (process.exitCode = code),
  (error: unknown) => {
    console.error(`inspect: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  },
);
