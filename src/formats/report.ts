// Inspection of a whole game directory and its Markdown compatibility report.
import { mountGameFiles, type VirtualFileSystem } from "../vfs/vfs.ts";
import type { ByteSource } from "./binary.ts";
import type { BspDetails } from "./bsp.ts";
import { Diagnostics, type Diagnostic, type FileReport } from "./diagnostics.ts";
import { extensionOf, inspectFile } from "./inspect.ts";

const INSPECTED = new Set(["bsp", "md2", "mdx", "tga"]);
/** Texture file types the upstream renderer can load for a world surface. */
const TEXTURE_EXTENSIONS = ["wal", "m32", "m8", "tga", "png", "jpg"];

export interface GameReport {
  /** Reports for the files given on input (paks included). */
  sources: FileReport[];
  /** Reports for every inspectable file visible through the virtual filesystem. */
  assets: FileReport[];
  extensions: Record<string, number>;
  shadowed: number;
  diagnostics: Diagnostic[];
}

export async function inspectGame(files: { path: string; source: ByteSource }[]): Promise<GameReport> {
  const diag = new Diagnostics();
  const vfs = await mountGameFiles(files, diag);

  const sources: FileReport[] = [];
  for (const file of files) {
    if (extensionOf(file.path) === "pak") sources.push(await inspectFile(file.path, file.source));
  }

  const extensions: Record<string, number> = {};
  const assets: FileReport[] = [];
  for (const file of vfs.list()) {
    const ext = extensionOf(file.path) || "(none)";
    extensions[ext] = (extensions[ext] ?? 0) + 1;
    if (!INSPECTED.has(ext)) continue;
    const report = await inspectFile(file.path, file.source);
    if (report.format === "bsp") checkMapTextures(report, vfs);
    assets.push(report);
  }

  return { sources, assets, extensions, shadowed: vfs.shadowed().length, diagnostics: diag.list() };
}

/** Records which textures a map references that cannot be found next to it. */
function checkMapTextures(report: FileReport, vfs: VirtualFileSystem): void {
  const details = report.details as Partial<BspDetails>;
  if (!details.textures) return;
  // "main/maps/x.bsp" resolves textures under "main/".
  const base = /^(.*?)maps\//i.exec(report.path)?.[1] ?? "";
  const missing = details.textures.filter(
    (name) => !TEXTURE_EXTENSIONS.some((ext) => vfs.find(`${base}textures/${name}.${ext}`)),
  );
  report.details.missingTextures = missing;
  report.details.entityModelAssets = (details.entityModels ?? []).map(ref => ({ ...ref, present: !!vfs.find(base + ref.model) }));
  if (missing.length) {
    report.diagnostics.push({
      severity: "warning",
      code: "bsp.missing-textures",
      message: `${missing.length} of ${details.textures.length} referenced textures were not found`,
    });
  }
}

const cell = (text: unknown) => String(text).replaceAll("|", "\\|").replace(/[\r\n]+/g, " ");

function diagnosticLines(list: Diagnostic[]): string[] {
  return list.map((d) => `- **${d.severity}** \`${d.code}\`: ${cell(d.message)}`);
}

export function toMarkdown(report: GameReport): string {
  const lines = ["# Compatibility report", ""];
  lines.push("Static inspection only. A clean result does not mean the file works in the engine.", "");

  lines.push("## Files by extension", "", "| Extension | Count |", "| --- | ---: |");
  for (const [ext, count] of Object.entries(report.extensions).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${cell(ext)} | ${count} |`);
  }
  lines.push("", `Files provided by more than one mount: ${report.shadowed}`, "");

  const everything = [...report.sources, ...report.assets];
  lines.push("## Results by format", "", "| Format | Inspected | With errors | With warnings |", "| --- | ---: | ---: | ---: |");
  for (const format of ["pak", "bsp", "md2", "mdx", "tga", "unknown"]) {
    const group = everything.filter((r) => r.format === format);
    if (!group.length) continue;
    const withSeverity = (s: string) => group.filter((r) => r.diagnostics.some((d) => d.severity === s)).length;
    lines.push(`| ${format} | ${group.length} | ${withSeverity("error")} | ${withSeverity("warning")} |`);
  }

  for (const map of report.assets.filter((r) => r.format === "bsp")) {
    const d = map.details as Partial<BspDetails> & { missingTextures?: string[] };
    lines.push("", `## Map: ${cell(map.path)}`, "");
    if (d.classnames) {
      lines.push(`Entities: ${d.entityCount}. Textures: ${d.textures?.length}. Missing textures: ${d.missingTextures?.length ?? 0}.`);
      lines.push("", "| Entity classname | Count | Upstream spawn function |", "| --- | ---: | --- |");
      for (const c of d.classnames) lines.push(`| ${cell(c.name)} | ${c.count} | ${c.upstream ? "yes (behaviour unverified)" : "**no**"} |`);
      const modelAssets = map.details.entityModelAssets as { classname: string; model: string; count: number; present: boolean }[] | undefined;
      if (modelAssets?.length) {
        lines.push("", "| Explicit model classname | Model | Count | Asset present |", "| --- | --- | ---: | --- |");
        for (const ref of modelAssets) lines.push(`| ${cell(ref.classname)} | ${cell(ref.model)} | ${ref.count} | ${ref.present ? 'yes' : 'no'} |`);
      }
      const flags = Object.entries(d.surfaceFlags ?? {});
      if (flags.length) lines.push("", `Surface flag bits (texinfo count): ${flags.map(([f, n]) => `${f}=${n}`).join(", ")}`);
    }
    if (map.diagnostics.length) lines.push("", ...diagnosticLines(map.diagnostics));
  }

  const other = everything.filter(
    (r) => r.format !== "bsp" && r.diagnostics.some((d) => d.severity !== "info"),
  );
  if (other.length) {
    lines.push("", "## Other files with problems");
    for (const r of other) lines.push("", `### ${cell(r.path)}`, "", ...diagnosticLines(r.diagnostics));
  }
  if (report.diagnostics.length) lines.push("", "## Mounting", "", ...diagnosticLines(report.diagnostics));
  return lines.join("\n") + "\n";
}
