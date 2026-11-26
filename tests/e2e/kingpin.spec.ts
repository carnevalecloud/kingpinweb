// Runs only when the developer's own game files are in gamedata/main
// (gitignored). Screenshots contain game art: never commit them.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const gameDir = join(import.meta.dirname, "../../gamedata/main");

for (const map of ["sr1", "sr2", "sr3", "sr4", "bar_sr"]) {
  test(`original map ${map} loads, renders and can be walked`, async ({ page }) => {
    test.skip(!existsSync(join(gameDir, "Pak0.pak")), "no original game files in gamedata/main");
    test.setTimeout(240_000);
    const log: string[] = [];
    const errors: string[] = [];
    page.on("console", (m) => log.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/play.html");
    await page.locator("#folder").setInputFiles(gameDir);
    await expect(page.locator("#saved")).toContainText("Saved in this browser", { timeout: 90_000 });
    await page.locator("#map").selectOption(map);
    await page.getByRole("button", { name: "Start" }).click();

    const position = async () => {
      log.length = 0;
      await page.keyboard.press("p");
      await page.waitForTimeout(500);
      return log.findLast((l) => l.startsWith("position:"));
    };
    try {
      // The player only reports a position once the map is running.
      await expect.poll(async () => (await position()) ?? "", { timeout: 150_000, intervals: [3000] }).toMatch(/position/);
      await page.waitForTimeout(4000);
      const before = await position();
      await page.screenshot({ path: `gamedata/reports/${map}-start.png` });
      await page.keyboard.down("w");
      await page.waitForTimeout(3000);
      await page.keyboard.up("w");
      await page.waitForTimeout(1000);
      const after = await position();
      await page.screenshot({ path: `gamedata/reports/${map}-walked.png` });
      console.log(map, "|", before, "->", after);
      expect(after).not.toEqual(before);
      expect(errors).toEqual([]);
    } finally {
      const { writeFileSync } = await import("node:fs");
      await page.locator("#console").evaluate((el) => ((el as HTMLDetailsElement).open = true)).catch(() => {});
      writeFileSync(`gamedata/reports/${map}.log`, (await page.locator("#log").textContent().catch(() => "")) ?? "");
    }
  });
}
