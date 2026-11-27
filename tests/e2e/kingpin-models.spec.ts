// Original models inside original maps. Runs only with the developer's own game
// files (including main/models) in gamedata/main. Screenshots contain game art:
// they stay in gamedata/reports and must never be committed.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Page, expect, test } from "@playwright/test";

const gameDir = join(import.meta.dirname, "../../gamedata/main");
const reportDir = "gamedata/reports/models";

/**
 * Viewpoints in sr1: the camera stands `distance` from a point near listed
 * entities, in direction `from` (degrees), `up` units higher, and looks back.
 */
const VIEWS = [
  { name: "intro-punks", at: [-1920, 2620, 24], from: 40, distance: 150, up: 10 },
  { name: "alley-gang", at: [-1128, 1852, 28], from: 0, distance: 110, up: 10 },
  { name: "bum", at: [-640, 1493, 16], from: 270, distance: 90, up: 20 },
  { name: "street-bitch", at: [293, 1063, 30], from: 270, distance: 110, up: 15 },
  { name: "courtyard-thug", at: [1864, 1200, 56], from: 45, distance: 110, up: 15 },
  { name: "sewer-gang", at: [2050, 2860, 24], from: 180, distance: 190, up: 20 },
  { name: "trashcans", at: [-1240, 1700, 20], from: 90, distance: 110, up: 30 },
  { name: "guard-radio", at: [-24, 352, 90], from: 300, distance: 80, up: 20 },
  { name: "trash", at: [-1000, 2200, 8], from: 225, distance: 110, up: 75 },
  { name: "health", at: [2648, 228, 10], from: 135, distance: 90, up: 40 },
  { name: "ammo", at: [2716, 676, 60], from: 180, distance: 90, up: 40 },
  { name: "indoor-pickups", at: [904, 200, 295], from: 180, distance: 90, up: 35 },
];

/** Arguments for the teleport command; it raises the player by 10, eyes sit 40 higher. */
function viewpoint({ at, from, distance, up }: (typeof VIEWS)[number]): string {
  const radians = (from * Math.PI) / 180;
  const x = at[0]! + distance * Math.cos(radians), y = at[1]! + distance * Math.sin(radians);
  const pitch = (Math.atan2(up + 40, distance) * 180) / Math.PI;
  return [x, y, at[2]! + up - 10, pitch, (from + 180) % 360].map(Math.round).join(" ");
}

async function command(page: Page, text: string): Promise<void> {
  await page.keyboard.press("Backquote");
  await page.waitForTimeout(600);
  await page.keyboard.type(text, { delay: 20 });
  await page.keyboard.press("Enter");
  await page.keyboard.press("Backquote");
  await page.waitForTimeout(600);
}

/** Share of canvas pixels that differ clearly between two screenshots. */
function difference(page: Page, a: Buffer, b: Buffer): Promise<number> {
  return page.evaluate(async ([first, second]) => {
    const pixels = async (data: string) => {
      const image = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
      const context = new OffscreenCanvas(image.width, image.height).getContext("2d")!;
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, image.width, image.height).data;
    };
    const [x, y] = [await pixels(first!), await pixels(second!)];
    let changed = 0;
    for (let i = 0; i < x.length; i += 4) {
      if (Math.abs(x[i]! - y[i]!) + Math.abs(x[i + 1]! - y[i + 1]!) + Math.abs(x[i + 2]! - y[i + 2]!) > 24) changed++;
    }
    return changed / (x.length / 4);
  }, [a.toString("base64"), b.toString("base64")]);
}

async function start(page: Page, map: string, log: string[]): Promise<void> {
  await page.goto("/play.html");
  await page.locator("#engine").selectOption("kingpin");
  await page.locator("#remember").uncheck();
  await page.locator("#folder").setInputFiles(gameDir);
  await expect(page.locator("#start")).toBeEnabled({ timeout: 90_000 });
  await page.locator("#map").selectOption(map);
  await page.getByRole("button", { name: "Start" }).click();
  await expect
    .poll(async () => {
      await page.keyboard.press("p");
      return log.some((l) => l.startsWith("position:"));
    }, { timeout: 150_000, intervals: [3000] })
    .toBe(true);
}

const FAILURES = /Invalid MDX|can't load|couldn't load models|Failed to load|overflow|ERR_DROP|has wrong version|index out of/i;

function ready(): void {
  test.skip(!existsSync(join(gameDir, "models")), "no original models in gamedata/main/models");
  test.skip(!existsSync("dist/engine/kingpin/index.js"), "experimental engine not built");
  mkdirSync(reportDir, { recursive: true });
}

test("sr1 shows original props, characters and pickups", async ({ page }) => {
  ready();
  test.setTimeout(600_000);
  const log: string[] = [];
  const errors: string[] = [];
  page.on("console", (m) => log.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await start(page, "sr1", log);
    expect(log.find((l) => l.startsWith("Kingpin models: placed"))).toContain(
      "placed 42 prop, 0 light, 10 pickup, 18 character; unresolved: {};",
    );
    // One line per model part, printed only by the native entity from the override archive.
    expect(log.filter((l) => l.startsWith("KP static model:")).length).toBeGreaterThan(100);
    expect(log.filter((l) => l.startsWith("KP MDX loaded: models/kpweb/")).length).toBeGreaterThan(50);

    await command(page, "notarget");
    await command(page, "noclip");
    const shares: Record<string, number> = {};
    for (const view of VIEWS) {
      await command(page, `teleport ${viewpoint(view)}`);
      await page.waitForTimeout(2500);
      const shown = await page.locator("#canvas").screenshot({ path: `${reportDir}/sr1-${view.name}.png` });
      await command(page, "r_drawentities 0");
      await page.waitForTimeout(1500);
      const hidden = await page.locator("#canvas").screenshot({ path: `${reportDir}/sr1-${view.name}-hidden.png` });
      await command(page, "r_drawentities 1");
      shares[view.name] = await difference(page, shown, hidden);
    }
    console.log("pixels changed by hiding entities:", shares);
    for (const [name, share] of Object.entries(shares)) expect(share, name).toBeGreaterThan(0.002);
    expect(log.filter((l) => FAILURES.test(l))).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    writeFileSync(`${reportDir}/sr1.log`, log.join("\n"));
  }
});

for (const map of ["sr2", "sr3", "sr4", "bar_sr", "pv_h", "sy2"]) {
  test(`${map} loads with original models`, async ({ page }) => {
    ready();
    test.setTimeout(300_000);
    const log: string[] = [];
    const errors: string[] = [];
    page.on("console", (m) => log.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));
    try {
      await start(page, map, log);
      await page.waitForTimeout(5000);
      await page.locator("#canvas").screenshot({ path: `${reportDir}/${map}-start.png` });
      expect(log.some((l) => l.startsWith("KP static model:"))).toBe(true);
      expect(log.filter((l) => FAILURES.test(l))).toEqual([]);
      expect(errors).toEqual([]);
    } finally {
      writeFileSync(`${reportDir}/${map}.log`, log.join("\n"));
    }
  });
}
