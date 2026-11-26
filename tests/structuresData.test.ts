import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { STRUCTURES_VERSION, isLearnableStructure } from "../src/utils/DataManager";
import { Structure } from "../src/types";

const manifest = JSON.parse(readFileSync(new URL("../public/structures.json", import.meta.url), "utf-8")) as {
  version: string;
  structures: Structure[];
};

describe("public/structures.json", () => {
  it("passt zur STRUCTURES_VERSION im DataManager", () => {
    expect(manifest.version).toBe(STRUCTURES_VERSION);
  });

  it("enthält eindeutige IDs und gültige Pflichtfelder", () => {
    const ids = new Set<string>();
    for (const structure of manifest.structures) {
      expect(ids.has(structure.id), `doppelte ID ${structure.id}`).toBe(false);
      ids.add(structure.id);
      expect(structure.objectName).toBeTruthy();
      expect(structure.glbFile).toMatch(/^[a-z]+\/[a-z]+\.glb$/);
    }
  });

  it("verweist nur auf vorhandene Modelldateien", () => {
    const files = new Set(manifest.structures.map(structure => structure.glbFile));
    files.forEach(file => {
      expect(existsSync(new URL(`../public/models/${file}`, import.meta.url)), file).toBe(true);
    });
  });

  it("filtert Beschriftungs- und Gruppenknoten aus den Lernmodi", () => {
    expect(isLearnableStructure({ ...manifest.structures[0], nameLatin: "Deltoid muscle.j" })).toBe(false);
    expect(isLearnableStructure({ ...manifest.structures[0], nameLatin: "Deltoid muscle.l" })).toBe(true);
    expect(manifest.structures.filter(isLearnableStructure).length).toBeGreaterThan(1000);
  });
});
