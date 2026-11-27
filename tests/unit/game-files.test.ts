import { describe, expect, it } from "vitest";
import { engineTarget, listMaps, planGameFiles } from "../../src/kingpin/game-files.ts";

const select = (...paths: string[]) => paths.map((path) => ({ path }));

describe("planGameFiles", () => {
  it("maps the main directory to the engine layout, lower-cased", () => {
    const plan = planGameFiles(
      select(
        "Kingpin/kingpin.exe",
        "Kingpin/main/Pak0.pak",
        "Kingpin/main/Textures/SR/Brick.TGA",
        "Kingpin/main/maps/team_rival.bsp",
        "Kingpin/main/gamex86.dll",
        "Kingpin/main/save/save0/game.ssv",
        "Kingpin/main/config.cfg",
        "Kingpin/mod/pak0.pak",
      ),
    );
    expect(plan.root).toBe("Kingpin/main");
    expect(plan.files.map((f) => f.target)).toEqual([
      "/baseq2/pak0.pak",
      "/baseq2/textures/sr/brick.tga",
      "/baseq2/maps/team_rival.bsp",
    ]);
  });

  it("accepts the main folder itself or a lone pak", () => {
    expect(planGameFiles(select("main/pak0.pak")).root).toBe("main");
    expect(planGameFiles(select("Pak0.pak")).root).toBe(".");
  });

  it("explains a missing or ambiguous game directory", () => {
    expect(() => planGameFiles(select("a/readme.txt"))).toThrow(/no pak0\.pak/);
    expect(() => planGameFiles(select("a/pak0.pak", "b/pak0.pak"))).toThrow(/several folders/);
  });

  it("lists map names once", () => {
    expect(listMaps(["maps/sr2.bsp", "/baseq2/maps/sr1.bsp", "maps/SR2.bsp", "maps/!x.tm2"])).toEqual(["sr1", "sr2"]);
  });
});

 describe("engineTarget", () => {
  it("mounts legacy imports in either engine directory", () => {
    expect(engineTarget("/baseq2/Pak0.pak", "kingpin")).toBe("/main/pak0.pak");
    expect(engineTarget("/baseq2/maps/sr1.bsp", "upstream")).toBe("/baseq2/maps/sr1.bsp");
    expect(() => engineTarget("/baseq2/../bad", "kingpin")).toThrow();
    expect(() => engineTarget("/other/pak0.pak", "kingpin")).toThrow();
  });
});
