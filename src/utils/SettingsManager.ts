import { UserSettings, BodySystem } from "../types";
import { formatStructureName } from "./text";

const DEFAULT_SETTINGS: UserSettings = {
  theme: "light",
  labelLanguage: "latin",
  dailyGoal: 20,
  showLabels: true,
  cameraDistance: 2,
  autoRotate: false,
};

const STORAGE_KEY = "anatomy-settings";

type SettingsListener = (settings: UserSettings) => void;

export class SettingsManager {
  private settings: UserSettings;
  private listeners: Set<SettingsListener> = new Set();

  constructor() {
    this.settings = this.loadFromStorage();
    this.applyTheme(this.settings.theme);
  }

  private loadFromStorage(): UserSettings {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      }
    } catch {
      // Ignore parse errors
    }
    return DEFAULT_SETTINGS;
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // Ignore quota errors
    }
  }

  private applyTheme(theme: UserSettings["theme"]): void {
    const root = document.documentElement;
    if (theme === "system") {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", theme);
    }
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.settings));
  }

  get<K extends keyof UserSettings>(key: K): UserSettings[K] {
    return this.settings[key];
  }

  set<K extends keyof UserSettings>(key: K, value: UserSettings[K]): void {
    if (this.settings[key] !== value) {
      this.settings[key] = value;
      this.saveToStorage();

      if (key === "theme") {
        this.applyTheme(value as UserSettings["theme"]);
      }

      this.notifyListeners();
    }
  }

  getAll(): UserSettings {
    return { ...this.settings };
  }

  reset(): void {
    this.settings = { ...DEFAULT_SETTINGS };
    this.saveToStorage();
    this.applyTheme(this.settings.theme);
    this.notifyListeners();
  }

  subscribe(listener: SettingsListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Anzeigename in der gewählten Sprache, ohne interne Z-Anatomy-Kennungen. */
  getLabel(structure: { nameLatin: string; nameDe?: string; nameEn?: string }): string {
    const lang = this.settings.labelLanguage;
    const name = lang === "de" ? structure.nameDe : lang === "en" ? structure.nameEn : undefined;
    return formatStructureName(name || structure.nameLatin);
  }

  getSystemColor(system: BodySystem): string {
    return getComputedStyle(document.documentElement).getPropertyValue(`--system-${system}`).trim() || "#888";
  }
}