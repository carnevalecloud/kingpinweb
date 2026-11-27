// The walkthrough page, driven with a synthetic "Kingpin" folder.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { type Page, expect, test } from "@playwright/test";
import { buildPak, syntheticGameFiles, syntheticMdxPropFiles } from "../fixtures/builders.ts";

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

test("experimental WebGL engine draws a textured MDX prop", async ({ page }, info) => {
  test.skip(!existsSync("dist/engine/kingpin/index.js"), "experimental engine not built");
  test.setTimeout(180_000);
  const game = info.outputPath("Kingpin");
  mkdirSync(`${game}/main`, { recursive: true });
  writeFileSync(`${game}/main/Pak0.pak`, buildPak(syntheticMdxPropFiles()));
  await page.goto("/play.html");
  await page.locator("#engine").selectOption("kingpin");
  await page.locator("#folder").setInputFiles(game);
  await expect(page.locator("#start")).toBeEnabled();
  const logs: string[] = [];
  const errors: string[] = [];
  page.on("console", m => logs.push(m.text()));
  page.on("pageerror", e => errors.push(e.message));
  try {
  await startRoom(page);
  await expect.poll(() => logs.some(line => line.includes('KP static model: models/kpweb/prop.mdx')), {timeout: 15000, message: 'native game module must spawn test entity'}).toBe(true);
  await expect.poll(() => logs.some(line => line.includes('KP MDX loaded: models/kpweb/prop.mdx')), {timeout: 15000, message: 'native renderer must load MDX'}).toBe(true);
  await expect.poll(async () => {
    const png = (await page.locator("#canvas").screenshot()).toString("base64");
    return page.evaluate(async data => {
      const image = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
      const ctx = new OffscreenCanvas(image.width, image.height).getContext("2d")!;
      ctx.drawImage(image, 0, 0);
      const pixels = ctx.getImageData(0, 0, image.width, image.height).data;
      let red = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i]!, g = pixels[i+1]!, b = pixels[i+2]!;
        if (r > 40 && r > 2*g && r > 2*b) red++;
      }
      image.close();
      return red / (pixels.length / 4);
    }, png);
  }, { timeout: 90_000 }).toBeGreaterThan(0.005);
  expect(errors).toEqual([]);
  } finally {
    await info.attach("engine-log.txt", {body: (await page.locator("#log").textContent().catch(() => "")) + "\n" + logs.join("\n") + "\n" + errors.join("\n"), contentType:"text/plain"});
    await info.attach("mdx-canvas.png", {body: await page.locator("#canvas").screenshot({timeout:5000}).catch(() => Buffer.alloc(0)), contentType:"image/png"});
  }
});
