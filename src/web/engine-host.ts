// Starts the unmodified upstream engine with our own page around it, replacing
// the upstream shell so player files can be placed in its filesystem first.
import { AUTOEXEC, engineGameDir, engineTarget, type EngineFlavour, type PlannedFile } from "../kingpin/game-files.ts";

interface EmscriptenFs {
  mkdirTree(path: string): void;
  writeFile(path: string, data: Uint8Array | string, options?: { canOwn: boolean }): void;
}

export interface EngineOptions {
  canvas: HTMLCanvasElement;
  flavour?: EngineFlavour;
  files: PlannedFile<{ data: Uint8Array }>[];
  args: string[];
  log: (line: string) => void;
  /** Render at the browser viewport's size, following it as it changes. */
  fillViewport?: boolean;
}

/** Largest rendering width; beyond it the picture is scaled up. */
const MAX_RENDER_WIDTH = 2560;

function viewportSize(): [number, number] {
  const scale = Math.min(window.devicePixelRatio || 1, MAX_RENDER_WIDTH / window.innerWidth);
  return [Math.round(window.innerWidth * scale), Math.round(window.innerHeight * scale)];
}

/** Can be called once per page load. */
export function startEngine({ canvas, files, args, log, flavour = "upstream", fillViewport }: EngineOptions): void {
  const global = window as unknown as { Module?: Record<string, unknown>; FS: EmscriptenFs };
  if (global.Module) throw new Error("the engine is already running; reload the page to start again");

  const lockPointer = () => {
    // Browsers only allow this during a user gesture; clicking the canvas retries.
    if (document.pointerLockElement !== canvas) void Promise.resolve(canvas.requestPointerLock()).catch(() => {});
  };
  canvas.addEventListener("click", lockPointer);
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  canvas.addEventListener("webglcontextlost", () => log("WebGL context lost; reload the page."));

  let size: string[] = [];
  if (fillViewport) {
    const [width, height] = viewportSize();
    size = ["+set", "r_mode", "-1", "+set", "r_customwidth", `${width}`, "+set", "r_customheight", `${height}`];
    let timer: number | undefined;
    window.addEventListener("resize", () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        // Only the experimental engine has this; the other one is letterboxed.
        const resize = global.Module?.["_kpweb_resize"] as ((w: number, h: number) => void) | undefined;
        resize?.(...viewportSize());
      }, 300);
    });
  }

  const engineBase = new URL(`./engine/${flavour}/`, document.baseURI).href;

  global.Module = {
    canvas,
    // The data package and side modules sit beside index.js, not beside this page.
    locateFile: (path: string) => engineBase + path,
    arguments: [...size, ...args],
    print: log,
    printErr: log,
    preRun: [
      () => {
        for (const { target: imported, file } of files) {
          const target = engineTarget(imported, flavour);
          global.FS.mkdirTree(target.slice(0, target.lastIndexOf("/")));
          // canOwn hands the buffer to the filesystem instead of copying it.
          global.FS.writeFile(target, file.data, { canOwn: true });
        }
        global.FS.mkdirTree(engineGameDir(flavour));
        global.FS.writeFile(`${engineGameDir(flavour)}/autoexec.cfg`, AUTOEXEC);
      },
    ],
    // Callbacks the Qwasm2 C code expects the page to provide.
    captureMouse: lockPointer,
    hideConsole: () => canvas.focus(),
    showConsole: () => {},
    winResized: () => {},
    setGamma: (gamma: number) => {
      canvas.style.filter = gamma < 0 ? "" : `brightness(${Number(gamma) * 2})`;
    },
    exportFile: () => log("Exporting files is not supported on this page."),
    softExit: (status: number) => log(`Engine exited with code ${status}.`),
  };

  const script = document.createElement("script");
  script.src = engineBase + "index.js";
  script.onerror = () => log(`Engine not found. Run ddev engine build --flavour=${flavour}, then rebuild the site.`);
  document.body.append(script);
}
