export type Severity = "error" | "warning" | "info";

export interface Diagnostic {
  severity: Severity;
  /** Stable machine-readable identifier, e.g. "bsp.lump-out-of-bounds". */
  code: string;
  message: string;
}

const MAX_PER_CODE = 20;

/** Collects diagnostics, capping repeats so a corrupt file cannot flood the report. */
export class Diagnostics {
  private readonly items: Diagnostic[] = [];
  private readonly counts = new Map<string, number>();

  add(severity: Severity, code: string, message: string): void {
    const n = (this.counts.get(code) ?? 0) + 1;
    this.counts.set(code, n);
    if (n <= MAX_PER_CODE) this.items.push({ severity, code, message });
  }

  error(code: string, message: string): void {
    this.add("error", code, message);
  }
  warn(code: string, message: string): void {
    this.add("warning", code, message);
  }
  info(code: string, message: string): void {
    this.add("info", code, message);
  }

  list(): Diagnostic[] {
    const suppressed = [...this.counts]
      .filter(([, n]) => n > MAX_PER_CODE)
      .map(([code, n]): Diagnostic => {
        const severity = this.items.find((d) => d.code === code)!.severity;
        return { severity, code, message: `${n - MAX_PER_CODE} further "${code}" diagnostics suppressed` };
      });
    return [...this.items, ...suppressed];
  }
}

export interface FileReport {
  path: string;
  format: "pak" | "bsp" | "md2" | "mdx" | "tga" | "unknown";
  size: number;
  /** Format-specific metadata. Never contains asset payloads. */
  details: Record<string, unknown>;
  diagnostics: Diagnostic[];
}
