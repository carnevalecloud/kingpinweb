// The walkthrough page, driven with a synthetic "Kingpin" folder.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { type Page, expect, test } from "@playwright/test";
import { buildPak, syntheticGameFiles } from "../fixtures/builders.ts";

async function startRoom(page: Page): Promise<void> {
  const log: string[] = [];
  const errors: string[] = [];
  const failed: string[] = [];
  page.on("console", (message) => log.push(message.text()));
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => response.status() >= 400 && failed.push(response.url()));
  await page.locator("#map").selectOption("kpweb_room");
  await page.getByRole("button", { name: "Start" }).click();
  await expect
    .poll(() => log.some((l) => l.includes("KINGPIN//WEB synthetic test room")), { timeout: 60_000 })
    .toBe(true);
  expect(errors).toEqual([]);
  expect(failed.filter((url) => !url.endsWith("favicon.ico"))).toEqual([]);
}

test("starts a map from a selected folder, remembers it and can forget it", async ({ page }, info) => {
  const game = info.outputPath("Kingpin");
  mkdirSync(`${game}/main`, { recursive: true });
  // Capitalised like the original, which the engine alone would ignore.
  writeFileSync(`${game}/main/Pak0.pak`, buildPak(syntheticGameFiles()));

  await page.goto("/play.html");
  await expect(page.getByRole("button", { name: "Start" })).toBeDisabled();
  await page.locator("#folder").setInputFiles(game);
  await expect(page.locator("#saved")).toContainText("Saved in this browser: 1 files");
  await startRoom(page);

  // A fresh visit needs no folder selection.
  await page.reload();
  await expect(page.locator("#status")).toContainText("Using your saved game files");
  await startRoom(page);

  await page.reload();
  await page.getByRole("button", { name: "Forget saved files" }).click();
  await expect(page.locator("#status")).toContainText("removed");
  await page.reload();
  await expect(page.locator("#saved")).toBeEmpty();
  await expect(page.getByRole("button", { name: "Start" })).toBeDisabled();
});

test("does not save when asked not to, and explains an unusable folder", async ({ page }, info) => {
  const game = info.outputPath("main");
  mkdirSync(game, { recursive: true });
  writeFileSync(`${game}/readme.txt`, "nothing here");
  await page.goto("/play.html");
  await page.locator("#folder").setInputFiles(game);
  await expect(page.locator("#status")).toContainText("no pak0.pak found");

  writeFileSync(`${game}/pak0.pak`, buildPak(syntheticGameFiles()));
  await page.locator("#remember").uncheck();
  await page.locator("#folder").setInputFiles(game);
  await expect(page.getByRole("button", { name: "Start" })).toBeEnabled();
  await page.reload();
  await expect(page.getByRole("button", { name: "Start" })).toBeDisabled();
});

 test("experimental engine starts a synthetic map from a remembered reference import", async ({ page }, info) => {
  test.skip(!existsSync("dist/engine/kingpin/index.js"), "experimental engine not built");
  const game = info.outputPath("Kingpin");
  mkdirSync(`${game}/main`, { recursive: true });
  writeFileSync(`${game}/main/Pak0.pak`, buildPak(syntheticGameFiles()));
  await page.goto("/play.html");
  await page.locator("#folder").setInputFiles(game);
  await expect(page.locator("#saved")).toContainText("Saved in this browser");
  await page.reload();
  await expect(page.locator("#status")).toContainText("Using your saved game files");
  await page.locator("#engine").selectOption("kingpin");
  await startRoom(page);
});
