import { describe, expect, it } from "vitest";
import { Structure } from "../src/types";
import { STRUCTURE_LAYERS, sortByOrder } from "../src/ui/constants";
import {
  areaLabel,
  countChildrenByParent,
  groupArea,
  groupByRegion,
  groupBySystem,
  matchLayerFilter,
  parentGroupLabel,
} from "../src/ui/treeModel";

const make = (id: string, extra: Partial<Structure> = {}): Structure => ({
  id,
  nameLatin: id,
  system: "muscular",
  objectName: id,
  glbFile: "muscular/muscular.glb",
  ...extra,
});

describe("Strukturbaum-Modell", () => {
  it("gruppiert nach System", () => {
    const groups = groupBySystem([make("a"), make("b", { system: "skeletal" }), make("c")]);
    expect(groups.get("muscular")?.map(s => s.id)).toEqual(["a", "c"]);
    expect(groups.get("skeletal")?.map(s => s.id)).toEqual(["b"]);
  });

  it("sortiert Regionen anatomisch, unbekannte ans Ende", () => {
    const regions = groupByRegion([
      make("a", { region: "back" }),
      make("b"),
      make("c", { region: "head" }),
      make("d", { region: "mars" }),
    ]).map(([region]) => region);
    expect(regions).toEqual(["head", "back", "unknown", "mars"]);
  });

  it("trennt Sehnen von Muskeln", () => {
    const structures = [make("Biceps"), make("Achilles tendon"), make("Tendinous arch")];
    const [muscles, tendons] = STRUCTURE_LAYERS.muscular!;
    expect(matchLayerFilter(structures, muscles)).toEqual(["Biceps"]);
    expect(matchLayerFilter(structures, tendons)).toEqual(["Achilles tendon", "Tendinous arch"]);
  });

  it("bildet Untergruppen bei Gruppenknoten und mehreren Geschwistern", () => {
    const structures = [
      make("a", { parentId: "groupg" }),
      make("b", { parentId: "p" }),
      make("c", { parentId: "p" }),
      make("d", { parentId: "single" }),
      make("e"),
    ];
    const result = groupArea("muscular", structures, countChildrenByParent(structures));
    expect(result.subgroups.map(group => group.parentId).sort()).toEqual(["groupg", "p"]);
    expect(result.individual.map(s => s.id)).toEqual(["d", "e"]);
  });

  it("beschriftet Gruppen und Bereiche", () => {
    expect(parentGroupLabel("muscles_of_neckg", undefined, s => s.id)).toBe("Muscles Of Neck");
    expect(parentGroupLabel("x", make("x", { nameLatin: "X" }), s => s.nameLatin)).toBe("X");
    expect(areaLabel("insertions", "unknown")).toBe("Zuordnungen nach Knochen");
    expect(areaLabel("muscular", "head")).toBe("Kopf");
  });

  it("sortByOrder ist stabil gegenüber unbekannten Werten", () => {
    expect(sortByOrder(["z", "b", "a"], ["a", "b"])).toEqual(["a", "b", "z"]);
  });
});
