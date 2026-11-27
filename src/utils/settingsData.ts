import { UserSettings } from "../types";

export const DEFAULT_SETTINGS: Readonly<UserSettings> = Object.freeze({
  theme: "light",
  labelLanguage: "latin",
  dailyGoal: 20,
  showLabels: true,
  cameraDistance: 2,
  autoRotate: false,
});

const THEMES = ["dark", "light", "system"] as const;
const LANGUAGES = ["latin", "de", "en"] as const;

function oneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

/** Übernimmt nur bekannte Einstellungen mit gültigem Typ/Wertebereich (z. B. aus localStorage oder Import). */
export function sanitizeSettings(raw: unknown): Partial<UserSettings> {
  if (typeof raw !== "object" || raw === null) return {};
  const input = raw as Record<string, unknown>;
  const result: Partial<UserSettings> = {};
  if (oneOf(THEMES, input.theme)) result.theme = input.theme;
  if (oneOf(LANGUAGES, input.labelLanguage)) result.labelLanguage = input.labelLanguage;
  if (typeof input.dailyGoal === "number" && Number.isFinite(input.dailyGoal)) {
    result.dailyGoal = Math.max(5, Math.min(100, Math.round(input.dailyGoal)));
  }
  if (typeof input.showLabels === "boolean") result.showLabels = input.showLabels;
  if (typeof input.cameraDistance === "number" && Number.isFinite(input.cameraDistance)) {
    result.cameraDistance = Math.max(0.8, Math.min(3.2, input.cameraDistance));
  }
  if (typeof input.autoRotate === "boolean") result.autoRotate = input.autoRotate;
  return result;
}

/** Tageszähler der Karteikarten: am selben Tag fortsetzen, sonst bei 0 beginnen. */
export function dailyCountFor(stored: unknown, today: string): number {
  if (typeof stored !== "object" || stored === null) return 0;
  const { date, count } = stored as Record<string, unknown>;
  return date === today && typeof count === "number" && Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

/** Lokales Datum als YYYY-MM-DD (nicht UTC, damit der Tag um Mitternacht Ortszeit wechselt). */
export function localDateKey(now: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
