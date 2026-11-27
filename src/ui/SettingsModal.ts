import { DataManager } from "../utils/DataManager";
import { SettingsManager } from "../utils/SettingsManager";
import { LabelLanguage, UserSettings } from "../types";
import { closeModal, showModal, showToast } from "./feedback";

/** Einstellungsdialog inklusive Datenexport, -import und -löschung. */
export class SettingsModal {
  constructor(
    private readonly dataManager: DataManager,
    private readonly settingsManager: SettingsManager,
    private readonly onLanguageChange: () => void
  ) {}

  open(): void {
    showModal(this.render(), modal => this.bind(modal));
  }

  private render(): string {
    const settings = this.settingsManager.getAll();
    const option = (value: string, label: string, current: string) =>
      `<option value="${value}"${value === current ? " selected" : ""}>${label}</option>`;

    return `
      <div class="modal-header">
        <h2 class="modal-title">Einstellungen</h2>
        <button class="modal-close" data-close aria-label="Schließen">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label for="setting-theme">Theme</label>
          <select class="select" id="setting-theme">
            ${option("system", "System", settings.theme)}
            ${option("dark", "Dunkel", settings.theme)}
            ${option("light", "Hell", settings.theme)}
          </select>
        </div>
        <div class="form-group">
          <label for="setting-language">Beschriftungssprache</label>
          <select class="select" id="setting-language">
            ${option("latin", "Latein", settings.labelLanguage)}
            ${option("de", "Deutsch", settings.labelLanguage)}
            ${option("en", "Englisch", settings.labelLanguage)}
          </select>
        </div>
        <div class="form-group">
          <label for="setting-daily-goal">Tagesziel (Karteikarten)</label>
          <input type="number" class="select" id="setting-daily-goal" value="${settings.dailyGoal}" min="5" max="100" step="5">
        </div>
        <div class="form-group">
          <label>
            <input type="checkbox" id="setting-show-labels" ${settings.showLabels ? "checked" : ""}>
            Bezeichnung beim Überfahren anzeigen
          </label>
        </div>
        <div class="form-group">
          <label for="setting-camera-distance">Kameraabstand <output id="camera-distance-value">${settings.cameraDistance.toFixed(1)}x</output></label>
          <input type="range" id="setting-camera-distance" min="0.8" max="3.2" step="0.1" value="${settings.cameraDistance}">
        </div>
        <div class="form-group">
          <label>
            <input type="checkbox" id="setting-auto-rotate" ${settings.autoRotate ? "checked" : ""}>
            Auto-Rotation im Atlas
          </label>
        </div>
        <hr class="modal-divider">
        <div class="form-group">
          <label>Datenverwaltung</label>
          <div class="modal-button-row">
            <button class="btn btn-secondary" id="export-data">Daten exportieren</button>
            <button class="btn btn-secondary" id="import-data">Daten importieren</button>
            <button class="btn btn-danger" id="clear-data">Alle Daten löschen</button>
          </div>
          <input type="file" id="import-file" accept=".json" hidden>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" data-close>Fertig</button>
      </div>
    `;
  }

  private bind(modal: HTMLElement): void {
    const $ = <T extends HTMLElement>(selector: string) => modal.querySelector<T>(selector)!;
    const set = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => this.settingsManager.set(key, value);

    modal.querySelectorAll("[data-close]").forEach(element => element.addEventListener("click", closeModal));

    $<HTMLSelectElement>("#setting-theme").addEventListener("change", event => {
      set("theme", (event.target as HTMLSelectElement).value as UserSettings["theme"]);
    });
    $<HTMLSelectElement>("#setting-language").addEventListener("change", event => {
      set("labelLanguage", (event.target as HTMLSelectElement).value as LabelLanguage);
      this.onLanguageChange();
    });
    $<HTMLInputElement>("#setting-daily-goal").addEventListener("change", event => {
      const value = Number.parseInt((event.target as HTMLInputElement).value, 10);
      if (Number.isFinite(value)) set("dailyGoal", Math.max(5, Math.min(100, value)));
    });
    $<HTMLInputElement>("#setting-show-labels").addEventListener("change", event => {
      set("showLabels", (event.target as HTMLInputElement).checked);
    });
    const distance = $<HTMLInputElement>("#setting-camera-distance");
    distance.addEventListener("input", () => {
      $("#camera-distance-value").textContent = `${Number(distance.value).toFixed(1)}x`;
    });
    distance.addEventListener("change", () => set("cameraDistance", Number(distance.value)));
    $<HTMLInputElement>("#setting-auto-rotate").addEventListener("change", event => {
      set("autoRotate", (event.target as HTMLInputElement).checked);
    });

    $("#export-data").addEventListener("click", () => void this.exportData());
    $("#import-data").addEventListener("click", () => $<HTMLInputElement>("#import-file").click());
    $("#import-file").addEventListener("change", event => this.importData(event));
    $("#clear-data").addEventListener("click", () => void this.clearData());
  }

  private async exportData(): Promise<void> {
    // Einstellungen liegen im localStorage (SettingsManager), nicht in IndexedDB.
    const data = { ...await this.dataManager.exportAllData(), settings: this.settingsManager.getAll() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `anatomie-backup-${new Date().toISOString().split("T")[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("Daten exportiert", "success");
  }

  private importData(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result as string);
        await this.dataManager.importData(data);
        if (data?.settings) this.settingsManager.importSettings(data.settings);
        showToast("Daten importiert", "success");
        closeModal();
        location.reload();
      } catch {
        showToast("Import fehlgeschlagen", "error");
      }
    };
    reader.readAsText(file);
    input.value = "";
  }

  private async clearData(): Promise<void> {
    if (!confirm("Wirklich alle lokalen Daten löschen? Dies kann nicht rückgängig gemacht werden.")) return;
    await this.dataManager.clearAllData();
    // Einstellungen und Tageszähler liegen im localStorage.
    try {
      localStorage.clear();
    } catch {
      // Speicher nicht verfügbar – nichts zu löschen
    }
    showToast("Daten gelöscht", "success");
    closeModal();
    location.reload();
  }
}
