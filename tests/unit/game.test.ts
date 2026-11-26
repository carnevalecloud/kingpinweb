import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { findForbidden } from "../../scripts/check-assets.ts";
import { memorySource } from "../../src/formats/binary.ts";
import { Diagnostics } from "../../src/formats/diagnostics.ts";
import { inspectGame, toMarkdown } from "../../src/formats/report.ts";
import { mountGameFiles } from "../../src/vfs/vfs.ts";
import { buildPak, buildRoomBsp, buildTga, text } from "../fixtures/builders.ts";

const source = (value: string) => memorySource(text(value));
const pakWith = (name: string, value: string) => memorySource(buildPak([{ name, data: text(value) }]));
const contents = async (vfs: Awaited<ReturnType<typeof mountGameFiles>>, path: string) => {
  const file = vfs.find(path)!;
  return new TextDecoder().decode(await file.source.read(0, file.source.size));
};

describe("virtual filesystem", () => {
  it("prefers higher-numbered paks over lower ones and over loose files", async () => {
    const vfs = await mountGameFiles(
      [
        { path: "main/Pak1.pak", source: pakWith("a.txt", "pak1") },
        { path: "main/a.txt", source: source("loose") },
        { path: "main/Pak0.pak", source: pakWith("a.txt", "pak0") },
        { path: "main/only.txt", source: source("only") },
      ],
      new Diagnostics(),
    );
    expect(await contents(vfs, "main/a.txt")).toBe("pak1");
    expect(await contents(vfs, "main/only.txt")).toBe("only");
    expect(vfs.shadowed()[0]!.map((f) => f.mount)).toEqual(["main/Pak1.pak", "main/Pak0.pak", "(loose)"]);
  });

  it("looks up paths ignoring case and slash direction", async () => {
    const vfs = await mountGameFiles([{ path: "Textures/SR1/Brick.tga", source: source("t") }], new Diagnostics());
    expect(vfs.find("textures\\sr1\\brick.TGA")?.path).toBe("Textures/SR1/Brick.tga");
    expect(vfs.find("textures/sr1/none.tga")).toBeUndefined();
  });
});

describe("game directory report", () => {
  const files = () => [
    {
      path: "main/Pak0.pak",
      source: memorySource(
        buildPak([
          { name: "maps/room.bsp", data: buildRoomBsp({ extraEntities: '{"classname" "kpweb_unknown_thing"}' }) },
        ]),
      ),
    },
    { path: "main/textures/kpweb/floor.tga", source: memorySource(buildTga(32, 32, [0, 0, 0])) },
  ];

  it("inspects maps inside paks and finds missing textures beside them", async () => {
    const report = await inspectGame(files());
    const map = report.assets.find((a) => a.format === "bsp")!;
    expect(map.path).toBe("main/maps/room.bsp");
    expect(map.details.missingTextures).toEqual(["kpweb/wall"]);
    const markdown = toMarkdown(report);
    expect(markdown).toContain("## Map: main/maps/room.bsp");
    expect(markdown).toContain("| kpweb_unknown_thing | 1 | **no** |");
  });
});

describe("command line and repository guard", () => {
  const dir = mkdtempSync(join(tmpdir(), "kpweb-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const cli = join(import.meta.dirname, "../../src/cli/inspect.ts");

  it("inspects a file and a directory", () => {
    mkdirSync(join(dir, "main/maps"), { recursive: true });
    const map = join(dir, "main/maps/room.bsp");
    writeFileSync(map, buildRoomBsp());
    const single = JSON.parse(execFileSync(process.execPath, [cli, map], { encoding: "utf8" }));
    expect(single).toMatchObject({ format: "bsp", path: "room.bsp" });
    expect(execFileSync(process.execPath, [cli, dir], { encoding: "utf8" })).toContain("## Map: main/maps/room.bsp");
  });

  it("exits 1 for a broken file and 2 for a missing one", () => {
    const broken = join(dir, "broken.pak");
    writeFileSync(broken, "PACK");
    expect(spawnSync(process.execPath, [cli, broken]).status).toBe(1);
    expect(spawnSync(process.execPath, [cli, join(dir, "nope")]).status).toBe(2);
  });

  it("flags game files by extension and by signature", () => {
    const disguised = join(dir, "notes.txt");
    const clean = join(dir, "readme.md");
    writeFileSync(disguised, buildRoomBsp());
    writeFileSync(clean, "hello");
    expect(findForbidden([disguised, clean, join(dir, "main/maps/room.bsp")])).toHaveLength(2);
  });
});
