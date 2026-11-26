import { blobSource } from "../formats/binary.ts";
import { Diagnostics } from "../formats/diagnostics.ts";
import { readPak } from "../formats/pak.ts";
import { listMaps, planGameFiles } from "../kingpin/game-files.ts";
import { startEngine } from "./engine-host.ts";
import { type StoredGame, forgetGame, loadGame, saveGame } from "./game-store.ts";

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const folder = $<HTMLInputElement>("#folder");
const engineSelect = $<HTMLSelectElement>("#engine");
const mapSelect = $<HTMLSelectElement>("#map");
const start = $<HTMLButtonElement>("#start");
const status = $("#status");
const logView = $("#log");
const remember = $<HTMLInputElement>("#remember");
const forget = $<HTMLButtonElement>("#forget");
const saved = $("#saved");
const LAST_MAP = "kingpinweb.last-map";
const logLines: string[] = [];

let game: StoredGame | null = null;

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

const megabytes = (bytes: number) => `${(bytes / 1048576).toFixed(0)} MB`;

function preference(value?: string): string | null {
  try {
    if (value !== undefined) localStorage.setItem(LAST_MAP, value);
    return localStorage.getItem(LAST_MAP);
  } catch {
    return null; // storage can be blocked; the default map is fine
  }
}

function useGame(next: StoredGame | null): void {
  game = next;
  const preferred = next?.maps.find((m) => m === preference()) ?? "sr1";
  mapSelect.replaceChildren(...(next?.maps ?? []).map((name) => new Option(name, name, false, name === preferred)));
  start.disabled = mapSelect.disabled = !next;
}

function showSaved(text: string): void {
  saved.textContent = text;
  forget.hidden = !text;
}

let selection = 0;

folder.addEventListener("change", async () => {
  const current = ++selection;
  useGame(null);
  try {
    const selected = [...(folder.files ?? [])].map((file) => ({ path: file.webkitRelativePath || file.name, file }));
    if (!selected.length) return;
    const plan = planGameFiles(selected);
    const files = plan.files.map(({ target, file }) => ({ target, blob: file.file }));
    const names = files.map((f) => f.target);
    for (const { target, blob } of files) {
      if (!target.endsWith(".pak")) continue;
      const entries = await readPak(blobSource(blob), new Diagnostics());
      names.push(...(entries ?? []).map((e) => e.name));
    }
    const maps = listMaps(names);
    if (!maps.length) throw new Error("no maps found in the selected folder");
    if (current !== selection) return;
    const bytes = files.reduce((sum, f) => sum + f.blob.size, 0);
    const next = { root: plan.root, maps, files, fileCount: files.length, bytes };
    useGame(next);
    status.textContent = `Found ${maps.length} maps in "${next.root}".`;
    if (remember.checked) await store(next);
  } catch (error) {
    status.textContent = `Cannot use this folder: ${message(error)}.`;
  }
});

async function store(next: StoredGame): Promise<void> {
  showSaved("");
  status.textContent = `Saving ${megabytes(next.bytes)} in this browser…`;
  try {
    await saveGame(next);
    showSaved(`Saved in this browser: ${next.fileCount} files, ${megabytes(next.bytes)}.`);
    status.textContent = `Found ${next.maps.length} maps. Files saved for next time.`;
  } catch (error) {
    status.textContent = `Could not save the files (${message(error)}). You can still start a map.`;
  }
}

forget.addEventListener("click", async () => {
  try {
    await forgetGame();
    selection++;
    useGame(null);
    folder.value = "";
    showSaved("");
    status.textContent = "Saved game files removed from this browser.";
  } catch (error) {
    status.textContent = `Could not remove the saved files: ${message(error)}.`;
  }
});

async function restore(): Promise<void> {
  const before = selection;
  try {
    const previous = await loadGame();
    if (!previous || before !== selection) return;
    useGame(previous);
    showSaved(`Saved in this browser: ${previous.fileCount} files, ${megabytes(previous.bytes)}.`);
    status.textContent = "Using your saved game files. Choose a map and start.";
  } catch (error) {
    status.textContent = `Saved game files are unavailable (${message(error)}). Choose your folder.`;
  }
}

void restore();

function log(line: string): void {
  logLines.push(line);
  if (logLines.length > 2000) logLines.shift();
  console.log(line);
}

$("#console").addEventListener("toggle", () => (logView.textContent = logLines.join("\n")));

start.addEventListener("click", async () => {
  if (!game) return;
  preference(mapSelect.value);
  start.disabled = forget.disabled = true;
  try {
    const files = [];
    let bytes = 0;
    for (const [index, { target, blob }] of game.files.entries()) {
      if (index % 50 === 0) status.textContent = `Reading game files… ${index}/${game.files.length}`;
      const data = new Uint8Array(await blob.arrayBuffer());
      bytes += data.length;
      files.push({ target, file: { data } });
    }
    status.textContent = `Loaded ${files.length} files (${megabytes(bytes)}). Starting ${mapSelect.value}…`;
    $("#setup").hidden = true;
    const canvas = $<HTMLCanvasElement>("#canvas");
    canvas.hidden = $("#console").hidden = false;
    startEngine({ canvas, files, log, flavour: engineSelect.value === "kingpin" ? "kingpin" : "upstream", args: ["+set", "vid_renderer", "gles3", "+map", mapSelect.value] });
    canvas.focus();
  } catch (error) {
    status.textContent = `Failed to start: ${message(error)}. Reload the page to try again.`;
  }
});
