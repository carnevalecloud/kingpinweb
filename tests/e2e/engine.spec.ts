// Browser tests of the unmodified upstream engine, fed only synthetic data.
import { type Page, expect, test } from "@playwright/test";
import { buildPak, buildRoomBsp, syntheticGameFiles } from "../fixtures/builders.ts";

interface Session {
  log: string[];
  errors: string[];
  seen: (pattern: RegExp) => Promise<RegExpMatchArray>;
}

/** Opens the engine page, optionally writing a pak into its in-memory filesystem first. */
async function boot(page: Page, args: string[], pak?: { path: string; data: Uint8Array }): Promise<Session> {
  const log: string[] = [];
  const errors: string[] = [];
  page.on("console", (message) => log.push(message.text()));
  page.on("pageerror", (error) => errors.push(error.message));
  if (pak) {
    // Hook the shell's `var Module = {...}` so the page itself stays untouched.
    await page.addInitScript(
      ({ path, base64 }) => {
        let module: Record<string, unknown>;
        Object.defineProperty(window, "Module", {
          configurable: true,
          get: () => module,
          set(value: Record<string, unknown>) {
            module = value;
            value.preRun = [
              () => {
                const fs = (window as unknown as { FS: Record<"mkdirTree" | "writeFile", (...a: unknown[]) => void> }).FS;
                fs.mkdirTree("/baseq2");
                fs.writeFile(path, Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)));
              },
            ];
          },
        });
      },
      { path: pak.path, base64: Buffer.from(pak.data).toString("base64") },
    );
  }
  await page.goto(`/engine/upstream/index.html?${args.join("&")}`);
  const seen = async (pattern: RegExp) => {
    await expect
      .poll(() => log.some((line) => pattern.test(line)), {
        message: `waiting for ${pattern}\n${log.slice(-40).join("\n")}`,
        timeout: 45_000,
      })
      .toBe(true);
    return log.findLast((line) => pattern.test(line))!.match(pattern)!;
  };
  return { log, errors, seen };
}

/** Share of canvas pixels that are clearly green (walls) or magenta (floor). */
async function colourShares(page: Page): Promise<{ green: number; magenta: number }> {
  const png = (await page.locator("#canvas").screenshot()).toString("base64");
  return page.evaluate(async (data) => {
    const image = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
    const context = new OffscreenCanvas(image.width, image.height).getContext("2d")!;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, image.width, image.height).data;
    let green = 0;
    let magenta = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const [r, g, b] = [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!];
      if (g > 40 && g > r * 1.15 && g > b * 1.15) green++;
      if (r > 40 && r > g * 1.15 && b > g * 1.15) magenta++;
    }
    const total = pixels.length / 4;
    return { green: green / total, magenta: magenta / total };
  }, png);
}

async function position(page: Page, session: Session): Promise<number[]> {
  session.log.length = 0;
  await page.keyboard.press("p");
  const match = await session.seen(/position: (-?\d+) (-?\d+) (-?\d+)/);
  return match.slice(1, 4).map(Number);
}

const gamePak = (files = syntheticGameFiles()) => ({ path: "/baseq2/pak0.pak", data: buildPak(files) });

test("without game data the engine starts its subsystems and stops at the first missing asset", async ({ page }) => {
  const session = await boot(page, []);
  await session.seen(/GetPCXPalette: Couldn't load pics\/colormap\.pcx/);
  const log = session.log.join("\n");
  for (const line of ["Yamagi Quake II v8.60", "SDL audio initialized", "Loading library: ref_gles3.wasm"]) {
    expect(log).toContain(line);
  }
  expect(session.errors).toEqual([]);
});

for (const renderer of ["gles3", "gl1"]) {
  test(`${renderer}: loads, renders and collides with a synthetic BSP map`, async ({ page }) => {
    test.setTimeout(180_000); // software WebGL is slow, especially through GL4ES
    const session = await boot(page, ["+set", "vid_renderer", renderer, "+map", "kpweb_room"], gamePak());
    await session.seen(/KINGPIN\/\/WEB synthetic test room/);

    // Walls use a .wal texture; the floor has only a .tga, as Kingpin does.
    await expect
      .poll(async () => (await colourShares(page)).green, { timeout: 90_000 })
      .toBeGreaterThan(0.1);
    expect((await colourShares(page)).magenta).toBeGreaterThan(0.05);
    await test.info().attach(`${renderer}.png`, { body: await page.screenshot(), contentType: "image/png" });

    // Gravity: spawned at z=32, the player settles on the floor (origin 24, eyes 22 higher).
    await expect.poll(async () => (await position(page, session))[2]).toBeLessThanOrEqual(47);
    const start = await position(page, session);
    expect(start[2]).toBeGreaterThanOrEqual(45);

    // Collision: walking into the wall at x=256 stops a 16-unit half-width short.
    await page.keyboard.down("w");
    await expect.poll(async () => (await position(page, session))[0], { timeout: 30_000 }).toBeGreaterThanOrEqual(238);
    await page.waitForTimeout(2000);
    const end = await position(page, session);
    await page.keyboard.up("w");
    expect(end[0]).toBeLessThanOrEqual(240);
    expect(Math.abs(end[1]!)).toBeLessThanOrEqual(1);
    expect(session.errors).toEqual([]);
  });
}

test("names map entities that have no spawn function", async ({ page }) => {
  const files = syntheticGameFiles().map((file) =>
    file.name.endsWith(".bsp")
      ? { ...file, data: buildRoomBsp({ extraEntities: '{\n"classname" "kpweb_unknown_thing"\n}\n' }) }
      : file,
  );
  const session = await boot(page, ["+map", "kpweb_room"], gamePak(files));
  await session.seen(/kpweb_unknown_thing doesn't have a spawn function/);
});

// Documents an upstream limitation: Kingpin names its archive "Pak0.pak".
test("upstream ignores a capitalised Pak0.pak on its case-sensitive filesystem", async ({ page }) => {
  const session = await boot(page, [], { ...gamePak(), path: "/baseq2/Pak0.pak" });
  await session.seen(/Couldn't load pics\/colormap\.pcx/);
});
