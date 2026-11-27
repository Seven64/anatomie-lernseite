import { describe, expect, it } from "vitest";
import {
  classifyWheel,
  clampDistance,
  decay,
  easeInOutCubic,
  MAX_WHEEL_DELTA,
  normalizeWheelDelta,
  rotationAngle,
  worldPerPixel,
  zoomFactor,
} from "../src/utils/cameraMath";

describe("Kamerasteuerung – Mathematik", () => {
  it("normalisiert Rad-Deltas aller Modi und begrenzt Ausreißer", () => {
    expect(normalizeWheelDelta(100, 0, 800)).toBe(100);
    expect(normalizeWheelDelta(3, 1, 800)).toBe(48);
    expect(normalizeWheelDelta(1, 2, 800)).toBe(MAX_WHEEL_DELTA);
    expect(normalizeWheelDelta(-5000, 0, 800)).toBe(-MAX_WHEEL_DELTA);
  });

  it("erkennt Pinch, horizontale Zwei-Finger-Geste und Zoom", () => {
    expect(classifyWheel(0, 10, true)).toBe("pinch");
    expect(classifyWheel(30, 5, false)).toBe("rotate");
    expect(classifyWheel(0, 120, false)).toBe("zoom");
    expect(classifyWheel(10, 10, false)).toBe("zoom");
  });

  it("zoomt symmetrisch und beim Pinch feiner pro Pixel", () => {
    expect(zoomFactor(100, false) * zoomFactor(-100, false)).toBeCloseTo(1, 10);
    expect(zoomFactor(100, false)).toBeGreaterThan(1);
    expect(zoomFactor(-100, false)).toBeLessThan(1);
    expect(zoomFactor(10, true)).toBeGreaterThan(zoomFactor(10, false));
  });

  it("hält den Abstand in den Grenzen", () => {
    expect(clampDistance(1, 0.5, 0.8, 10)).toBeCloseTo(0.8);
    expect(clampDistance(5, 4, 0.1, 10)).toBeCloseTo(2);
    expect(clampDistance(1, 1.5, 0.1, 10)).toBeCloseTo(1.5);
  });

  it("dreht proportional zur Viewport-Höhe", () => {
    expect(rotationAngle(400, 800)).toBeCloseTo(Math.PI * 0.8);
    expect(rotationAngle(0, 800)).toBe(0);
    expect(rotationAngle(100, 0)).toBeGreaterThan(0);
  });

  it("rechnet Pixel in Weltmaß um (Verschieben folgt dem Zeiger)", () => {
    // 90° Sichtfeld, Abstand 1 → sichtbare Höhe 2 → 2/800 pro Pixel
    expect(worldPerPixel(1, 90, 800)).toBeCloseTo(2 / 800);
  });

  it("lässt Trägheit abklingen und stoppt bei sehr kleinen Werten", () => {
    expect(decay(1, 0.09)).toBeCloseTo(0.5);
    expect(decay(0.0001, 0.5)).toBe(0);
  });

  it("verläuft weich und begrenzt", () => {
    expect(easeInOutCubic(-1)).toBe(0);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
    expect(easeInOutCubic(2)).toBe(1);
  });
});
