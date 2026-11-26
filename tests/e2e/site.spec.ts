import { expect, test } from "@playwright/test";
import { buildPak, buildRoomBsp, text } from "../fixtures/builders.ts";

test.beforeEach(async ({ page, baseURL }) => {
  // The site must work without any external service.
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return url.protocol.startsWith("http") && url.host !== new URL(baseURL!).host ? route.abort() : route.continue();
  });
});

test("landing page reports the engine build", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#engine-info")).toContainText(/Qwasm2 [0-9a-f]{8}, Emscripten \d/);
  await expect(page.getByText("not playable yet")).toBeVisible();
});

test("inspector reports on a pak locally and treats names as text", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/inspector.html");
  const pak = buildPak([
    { name: "maps/<img src=x onerror=alert(1)>.bsp", data: buildRoomBsp() },
    { name: "broken.mdx", data: text("IDPX") },
  ]);
  await page.locator("#files").setInputFiles({
    name: "pak0.pak",
    mimeType: "application/octet-stream",
    buffer: Buffer.from(pak),
  });
  await expect(page.locator("#status")).toHaveText("Inspected 3 file(s).");
  await expect(page.locator("#report")).toContainText("## Map: maps/<img src=x onerror=alert(1)>.bsp");
  await expect(page.locator("#report")).toContainText("mdx.truncated-header");
  await expect(page.locator("#list img")).toHaveCount(0);

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download report (.md)" }).click();
  expect((await download).suggestedFilename()).toBe("compatibility-report.md");
  expect(errors).toEqual([]);
});
