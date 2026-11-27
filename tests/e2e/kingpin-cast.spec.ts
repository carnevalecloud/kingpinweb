// Characters the engine drives. Runs only with the developer's own game files in
// gamedata/main. Screenshots contain game art and must never be committed.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Page, expect, test } from "@playwright/test";

const gameDir = join(import.meta.dirname, "../../gamedata/main");
const reportDir = "gamedata/reports/cast";

async function command(page: Page, text: string): Promise<void> {
  await page.keyboard.press("Backquote");
  await page.waitForTimeout(600);
  await page.keyboard.type(text, { delay: 20 });
  await page.keyboard.press("Enter");
  await page.keyboard.press("Backquote");
  await page.waitForTimeout(600);
}

test("sr1 characters walk their path and die when shot", async ({ page }) => {
  test.skip(!existsSync(join(gameDir, "models")), "no original models in gamedata/main/models");
  test.skip(!existsSync("dist/engine/kingpin/index.js"), "experimental engine not built");
  test.setTimeout(420_000);
  mkdirSync(reportDir, { recursive: true });
  const log: string[] = [];
  const errors: string[] = [];
  page.on("console", (m) => log.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  const seen = (start: string, timeout: number) =>
    expect.poll(() => log.some((l) => l.startsWith(start)), { timeout, message: start }).toBe(true);
  try {
    await page.goto("/play.html");
    await page.locator("#engine").selectOption("kingpin");
    await page.locator("#remember").uncheck();
    await page.locator("#folder").setInputFiles(gameDir);
    await expect(page.locator("#start")).toBeEnabled({ timeout: 90_000 });
    await page.locator("#map").selectOption("sr1");
    await page.getByRole("button", { name: "Start" }).click();
    await expect
      .poll(async () => {
        await page.keyboard.press("p");
        return log.some((l) => l.startsWith("position:"));
      }, { timeout: 150_000, intervals: [3000] })
      .toBe(true);
    await seen("KP cast: ", 10_000);
    // The view fills the window and follows it when it changes size.
    const canvas = page.locator("#canvas");
    for (const size of [{ width: 1100, height: 600 }, { width: 900, height: 700 }]) {
      await page.setViewportSize(size);
      await expect.poll(() => canvas.evaluate((c: HTMLCanvasElement) => [c.width, c.height, c.clientWidth, c.clientHeight]),
        { timeout: 60_000 }).toEqual([size.width, size.height, size.width, size.height]);
    }
    await page.waitForTimeout(5000);
    await page.screenshot({ path: `${reportDir}/resized.png` });

    // The punk "arnold" starts a looping path at node t24.
    await seen("KP cast reached t", 90_000);

    // Face the thug "leroy" from the south and shoot until he drops.
    await command(page, "god");
    await command(page, "teleport -1128 1780 30 0 90");
    await page.waitForTimeout(3000);
    await page.locator("#canvas").screenshot({ path: `${reportDir}/before.png` });
    await command(page, "+attack");
    await seen("KP cast died", 90_000);
    await command(page, "-attack");
    await page.waitForTimeout(4000);
    await page.locator("#canvas").screenshot({ path: `${reportDir}/after.png` });
    expect(log.filter((l) => /Invalid MDX|couldn't load models|overflow|ERR_DROP|KP cast: unusable/i.test(l))).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    writeFileSync(`${reportDir}/sr1.log`, log.join("\n"));
  }
});
