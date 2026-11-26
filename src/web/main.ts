export {};

const info = document.querySelector<HTMLElement>("#engine-info")!;

try {
  const response = await fetch("./engine/upstream/build-info.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const build = (await response.json()) as { emscripten: string; upstream: { qwasm2: string } };
  info.textContent = `Build: Qwasm2 ${build.upstream.qwasm2.slice(0, 8)}, Emscripten ${build.emscripten}.`;
} catch {
  info.textContent = "Engine not built. Run “ddev engine build”, then rebuild the site.";
}
