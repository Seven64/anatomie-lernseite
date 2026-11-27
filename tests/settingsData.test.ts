import { describe, expect, it } from "vitest";
import { dailyCountFor, DEFAULT_SETTINGS, localDateKey, sanitizeSettings } from "@/utils/settingsData";

describe("sanitizeSettings", () => {
  it("übernimmt gültige Werte", () => {
    expect(sanitizeSettings({ theme: "dark", labelLanguage: "de", dailyGoal: 30, showLabels: false, cameraDistance: 1.5, autoRotate: true }))
      .toEqual({ theme: "dark", labelLanguage: "de", dailyGoal: 30, showLabels: false, cameraDistance: 1.5, autoRotate: true });
  });

  it("ignoriert unbekannte Schlüssel und falsche Typen", () => {
    expect(sanitizeSettings({ theme: "neon", labelLanguage: 1, showLabels: "ja", extra: true })).toEqual({});
    expect(sanitizeSettings(null)).toEqual({});
    expect(sanitizeSettings("dark")).toEqual({});
  });

  it("begrenzt Zahlenwerte auf den Bereich des Einstellungsdialogs", () => {
    expect(sanitizeSettings({ dailyGoal: 1000, cameraDistance: 0 })).toEqual({ dailyGoal: 100, cameraDistance: 0.8 });
    expect(sanitizeSettings({ dailyGoal: Number.NaN })).toEqual({});
  });

  it("Standardwerte sind unveränderlich", () => {
    expect(Object.isFrozen(DEFAULT_SETTINGS)).toBe(true);
  });
});

describe("dailyCountFor", () => {
  it("setzt den Zähler an einem neuen Tag zurück", () => {
    expect(dailyCountFor({ date: "2026-11-26", count: 7 }, "2026-11-27")).toBe(0);
    expect(dailyCountFor({ date: "2026-11-27", count: 7 }, "2026-11-27")).toBe(7);
  });

  it("verträgt fehlende oder kaputte Daten", () => {
    expect(dailyCountFor(null, "2026-11-27")).toBe(0);
    expect(dailyCountFor({ date: "2026-11-27", count: -3 }, "2026-11-27")).toBe(0);
    expect(dailyCountFor({ date: "2026-11-27", count: "5" }, "2026-11-27")).toBe(0);
  });
});

describe("localDateKey", () => {
  it("formatiert das lokale Datum", () => {
    expect(localDateKey(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});
