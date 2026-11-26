import { describe, expect, it } from "vitest";
import {
  clampProgress,
  cutPosition,
  dragProgress,
  formatProgress,
  keyboardStep,
  planeConstant,
} from "../src/modules/atlas/cuttingMath";

describe("Schnittebenen-Mathematik", () => {
  it("begrenzt und rundet auf 0,01 %", () => {
    expect(clampProgress(-5)).toBe(0);
    expect(clampProgress(120)).toBe(100);
    expect(clampProgress(12.3456)).toBeCloseTo(12.35, 10);
    expect(clampProgress(Number.NaN)).toBe(50);
  });

  it("liefert feine Tastatur-Schritte", () => {
    expect(keyboardStep("ArrowRight", false)).toBe(0.1);
    expect(keyboardStep("ArrowLeft", true)).toBe(-0.01);
    expect(keyboardStep("PageUp", false)).toBe(10);
    expect(keyboardStep("PageDown", true)).toBe(-1);
    expect(keyboardStep("Enter", false)).toBeNull();
  });

  it("verlangsamt das Ziehen im Feinmodus um Faktor 10", () => {
    expect(dragProgress(50, 100, 200, false)).toBe(100);
    expect(dragProgress(50, 100, 200, true)).toBe(55);
    expect(dragProgress(50, 10, 0, true)).toBe(50);
  });

  it("bildet 0 % auf das Maximum und 100 % auf das Minimum ab", () => {
    expect(cutPosition(-1, 1, 0)).toBe(1);
    expect(cutPosition(-1, 1, 100)).toBe(-1);
    expect(cutPosition(0, 2, 25)).toBe(1.5);
  });

  it("berechnet die Ebenenkonstante für negative Normalen", () => {
    // Ebene n·p + c = 0 mit n = (−1, 0, 0) bei x = 0,4 → c = 0,4
    expect(planeConstant(-1, 0.4)).toBeCloseTo(0.4);
    expect(planeConstant(1, 0.4)).toBeCloseTo(-0.4);
  });

  it("formatiert deutsch", () => {
    expect(formatProgress(50)).toMatch(/^50[,.]0 %$/);
    expect(formatProgress(12.34)).toMatch(/^12[,.]34 %$/);
  });
});
