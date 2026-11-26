import { describe, expect, it } from "vitest";
import { assignLayers, countPerLayer, fibonacciDirections } from "../src/modules/atlas/layerAssignment";

describe("assignLayers", () => {
  it("ordnet verschachtelte Strukturen von außen nach innen", () => {
    // 0 liegt außen, 1 unter 0, 2 unter 1 und 0.
    const rays = [
      [[], [], [1]],
      [[0], [0], [0, 2]],
      [[1, 0], [1], [0, 1]],
    ];
    expect(assignLayers(rays, { exposureThreshold: 0.3 })).toEqual([0, 1, 2]);
  });

  it("berücksichtigt den Schwellwert für freie Strahlen", () => {
    // Struktur 1 hat nur 1 von 10 freien Strahlen (Lücke) → bei 20 % Schwelle nicht außen.
    const blocked = Array.from({ length: 9 }, () => [0]);
    const rays = [[[]], [[], ...blocked]];
    expect(assignLayers(rays, { exposureThreshold: 0.2 })).toEqual([0, 1]);
    expect(assignLayers(rays, { exposureThreshold: 0.05 })).toEqual([0, 0]);
  });

  it("ignoriert Selbsttreffer", () => {
    expect(assignLayers([[[0]], [[1], [0]]], { exposureThreshold: 0.5 })).toEqual([0, 0]);
  });

  it("kappt bei maxLayers und terminiert bei vollständiger Umschließung", () => {
    const rays = [[[1]], [[0]]]; // gegenseitig verdeckt
    expect(assignLayers(rays)).toEqual([0, 0]);
    const chain = [[[]], [[0]], [[1]], [[2]], [[3]]];
    expect(assignLayers(chain, { maxLayers: 3, exposureThreshold: 1 })).toEqual([0, 1, 2, 2, 2]);
  });

  it("behandelt Strukturen ohne Strahlen als oberflächlich", () => {
    expect(assignLayers([[]])).toEqual([0]);
    expect(assignLayers([])).toEqual([]);
  });
});

describe("countPerLayer", () => {
  it("zählt Strukturen je Schicht", () => {
    expect(countPerLayer([0, 2, 0, 1, 2, 2])).toEqual([2, 1, 3]);
    expect(countPerLayer([])).toEqual([]);
  });
});

describe("fibonacciDirections", () => {
  it("liefert Einheitsvektoren, die die Kugel gleichmäßig abdecken", () => {
    const directions = fibonacciDirections(14);
    expect(directions).toHaveLength(14);
    directions.forEach(([x, y, z]) => expect(Math.hypot(x, y, z)).toBeCloseTo(1, 10));
    const mean = directions.reduce((sum, [x, y, z]) => [sum[0] + x, sum[1] + y, sum[2] + z], [0, 0, 0]);
    mean.forEach(component => expect(Math.abs(component / 14)).toBeLessThan(0.1));
  });
});
