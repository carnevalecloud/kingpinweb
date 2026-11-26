import type { FileReport } from "../formats/diagnostics.ts";
import type { InspectRequest, InspectResponse } from "./inspector.worker.ts";

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const status = $("#status");
const results = $("#results");
const worker = new Worker(new URL("./inspector.worker.ts", import.meta.url), { type: "module" });
let latest = 0;
let current: Extract<InspectResponse, { ok: true }> | null = null;

for (const input of document.querySelectorAll<HTMLInputElement>("input[type=file]")) {
  input.addEventListener("change", () => {
    const files = [...(input.files ?? [])].map((file) => ({ path: file.webkitRelativePath || file.name, file }));
    if (!files.length) return;
    results.hidden = true;
    status.textContent = `Inspecting ${files.length} file(s)…`;
    worker.postMessage({ id: ++latest, files } satisfies InspectRequest);
  });
}

worker.onerror = (event) => {
  status.textContent = `Inspector failed: ${event.message}`;
};

worker.onmessage = ({ data }: MessageEvent<InspectResponse>) => {
  if (data.id !== latest) return; // superseded by a newer selection
  if (!data.ok) {
    status.textContent = `Inspection failed: ${data.error}`;
    return;
  }
  current = data;
  const all = [...data.report.sources, ...data.report.assets];
  status.textContent = `Inspected ${all.length} file(s).`;
  $("#report").textContent = data.markdown;
  $("#list").replaceChildren(...all.map(fileElement));
  results.hidden = false;
};

// textContent only: file names and entity strings are untrusted input.
function fileElement(report: FileReport): HTMLElement {
  const details = document.createElement("details");
  const summary = document.createElement("summary");
  const count = (severity: string) => report.diagnostics.filter((d) => d.severity === severity).length;
  summary.textContent = `${report.path} — ${report.format}, ${report.size} bytes, ${count("error")} errors, ${count("warning")} warnings`;
  const pre = document.createElement("pre");
  // Render lazily: large reports are expensive to put in the DOM.
  details.addEventListener("toggle", () => {
    if (details.open && !pre.textContent) pre.textContent = JSON.stringify(report, null, 2);
  });
  details.append(summary, pre);
  return details;
}

function download(name: string, type: string, content: string): void {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([content], { type }));
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 0);
}

$("#save-report").addEventListener("click", () => {
  if (current) download("compatibility-report.md", "text/markdown", current.markdown);
});
$("#save-json").addEventListener("click", () => {
  if (current) download("inspection.json", "application/json", JSON.stringify(current.report, null, 2));
});
