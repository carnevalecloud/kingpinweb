import { inspectModel } from "./alias-model.ts";
import { type ByteSource, hexPreview } from "./binary.ts";
import { inspectBsp } from "./bsp.ts";
import { Diagnostics, type FileReport } from "./diagnostics.ts";
import { readPak } from "./pak.ts";
import { TGA_HEADER_SIZE, inspectTga } from "./tga.ts";

/** Largest file read fully into memory for inspection. */
const MAX_PARSE_BYTES = 256 * 1024 * 1024;

const MAGIC_FORMATS: Record<string, FileReport["format"]> = {
  PACK: "pak",
  IBSP: "bsp",
  IDP2: "md2",
  IDPX: "mdx",
};
const EXTENSIONS: readonly FileReport["format"][] = ["pak", "bsp", "md2", "mdx", "tga"];

export function extensionOf(path: string): string {
  const name = path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1);
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
}

/** Identifies a file by magic number (falling back to extension) and inspects it. */
export async function inspectFile(path: string, source: ByteSource): Promise<FileReport> {
  const diag = new Diagnostics();
  const head = await source.read(0, Math.min(source.size, TGA_HEADER_SIZE));
  const magic = String.fromCharCode(...head.subarray(0, 4));
  const extension = extensionOf(path);
  const byMagic = MAGIC_FORMATS[magic];
  const byExtension = EXTENSIONS.find((f) => f === extension);
  if (byMagic && byExtension && byMagic !== byExtension) {
    diag.warn("file.extension-mismatch", `named .${extension} but its magic number says ${byMagic}`);
  }
  const format = byMagic ?? byExtension ?? "unknown";

  let details: Record<string, unknown> | null = null;
  if (format === "unknown") {
    diag.info("file.unsupported-format", `unsupported format; first bytes: ${hexPreview(head) || "(empty file)"}`);
  } else if (format === "pak") {
    const entries = await readPak(source, diag);
    if (entries) details = { entryCount: entries.length, entries };
  } else if (format === "tga") {
    details = inspectTga(head, source.size, diag);
  } else if (source.size > MAX_PARSE_BYTES) {
    diag.error("file.too-large", `${source.size} bytes exceeds the inspection limit of ${MAX_PARSE_BYTES}`);
  } else {
    const bytes = await source.read(0, source.size);
    details = format === "bsp" ? inspectBsp(bytes, diag) : inspectModel(bytes, format, diag);
  }

  return { path, format, size: source.size, details: details ?? {}, diagnostics: diag.list() };
}
