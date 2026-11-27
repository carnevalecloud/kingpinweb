// Runs only when the developer's own game files are in gamedata/main
// (gitignored). Screenshots contain game art: never commit them.
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const gameDir = join(import.meta.dirname, "../../gamedata/main");

const allMaps = ["bar_pv","bar_rc","bar_sr","bar_st","bar_sy","bike","idiot","kpcut1","kpcut3","kpcut4","kpcut7","kpdm1","kpdm2","kpdm3","kpdm4","kpdm5","pawn_pv","pawn_rc","pawn_sr","pawn_sr2","pawn_st","pawn_sy","pv_1","pv_b","pv_boss","pv_h","rc1","rc2","rc3","rc4","rc5","rcboss1","rcboss2","sewer","sr1","sr2","sr3","sr4","steel1","steel2","steel3","steel4","sy_h","sy1","sy2","team_pv","team_rc","team_rival","team_sr","team_towers","ty1","ty2","ty3","ty4"];
const full = process.env.KP_ALL_MAPS === "1";
const flavour = process.env.KP_ENGINE === "kingpin" ? "kingpin" : "upstream";
const maps = full ? allMaps : ["sr1", "sr2", "sr3", "sr4", "bar_sr"];
const pakPresent = existsSync(gameDir) && readdirSync(gameDir).some((name) => name.toLowerCase() === "pak0.pak");
const reportDir = `gamedata/reports/${flavour}`;

for (const map of maps) {
  test(`original map ${map} loads, renders and can be walked`, async ({ page }) => {
    test.skip(!pakPresent, "no original game files in gamedata/main");
    test.skip(!existsSync(`dist/engine/${flavour}/index.js`), "selected engine not built");
    mkdirSync(reportDir, { recursive: true });
    test.setTimeout(240_000);
    const log: string[] = [];
    const errors: string[] = [];
    page.on("console", (m) => log.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/play.html");
    await page.locator("#engine").selectOption(flavour);
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
      await page.screenshot({ path: `${reportDir}/${map}-start.png` });
      await page.keyboard.down("w");
      await page.waitForTimeout(3000);
      await page.keyboard.up("w");
      await page.waitForTimeout(1000);
      const after = await position();
      await page.screenshot({ path: `${reportDir}/${map}-walked.png` });
      console.log(map, "|", before, "->", after);
      expect(after).toBeDefined();
      expect(before).toBeDefined();
      // Full inventory includes cutscenes and multiplayer maps without normal spawns.
      // Keep movement strict for the established walkthrough smoke set only.
      if (!full || ["sr1", "sr2", "sr3", "sr4", "bar_sr"].includes(map)) expect(after).not.toEqual(before);
      expect(errors).toEqual([]);
    } finally {
      const { writeFileSync } = await import("node:fs");
      await page.locator("#console").evaluate((el) => ((el as HTMLDetailsElement).open = true)).catch(() => {});
      writeFileSync(`${reportDir}/${map}.log`, (await page.locator("#log").textContent().catch(() => "")) ?? "");
    }
  });
}
