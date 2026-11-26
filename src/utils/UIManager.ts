import { DataManager } from "./DataManager";
import { SettingsManager } from "./SettingsManager";
import { Structure, BodySystem, CuttingAxis } from "../types";

type StructureSelectCallback = (id: string) => void;
type VisibilityCallback = (id: string, visible: boolean) => void;
type OpacityCallback = (system: BodySystem, opacity: number) => void;
type SystemToggleCallback = (system: BodySystem, visible: boolean) => void;
type StructureLayerToggleCallback = (system: BodySystem, structureIds: string[], visible: boolean) => void;
type CuttingPlaneChangeCallback = (axis: CuttingAxis, enabled: boolean, progress: number) => void;
type CuttingPlaneState = { enabled: boolean; progress: number };
type SidebarTab = "tree" | "search" | "about";

const CUTTING_AXES: Array<{ axis: CuttingAxis; label: string }> = [
  { axis: "vertical", label: "Von oben nach unten" },
  { axis: "rightLeft", label: "Von rechts nach links" },
  { axis: "frontBack", label: "Von vorne nach hinten" },
];

const SYSTEM_LABELS: Record<BodySystem, string> = {
  skeletal: "Skelett",
  muscular: "Muskulatur",
  articular: "Gelenke",
  nervous: "Nervensystem",
  cardiovascular: "Herz und Gefäße",
  respiratory: "Atmungssystem",
  digestive: "Verdauungssystem",
  urinary: "Harnsystem",
  reproductive: "Fortpflanzungssystem",
  lymphatic: "Lymphsystem",
  endocrine: "Hormonsystem",
  integumentary: "Haut",
  sensory: "Sinnesorgane",
  visceral: "Innere Organe",
  regions: "Körperregionen",
  insertions: "Muskelansätze",
  unknown: "Weitere Strukturen",
};

const SYSTEM_ORDER: BodySystem[] = [
  "skeletal", "articular", "muscular", "insertions", "cardiovascular",
  "lymphatic", "nervous", "visceral", "regions",
];

const REGION_LABELS: Record<string, string> = {
  head: "Kopf",
  neck: "Hals",
  thorax: "Brustkorb",
  abdomen: "Bauch",
  pelvis: "Becken",
  back: "Rücken",
  unknown: "Nicht regional zugeordnet",
};

const REGION_ORDER = ["head", "neck", "thorax", "abdomen", "pelvis", "back", "unknown"];

const STRUCTURE_LAYERS: Partial<Record<BodySystem, { id: string; label: string; matches: RegExp; excludes?: RegExp }[]>> = {
  muscular: [
    { id: "muscles", label: "Muskeln und Begleitstrukturen", matches: /./i, excludes: /tendon|tendinous/i },
    { id: "tendons", label: "Sehnen", matches: /tendon|tendinous/i },
  ],
  cardiovascular: [
    { id: "arteries", label: "Arterien", matches: /artery|arterial|arteries|aort|pulmonary trunk/i },
    { id: "veins", label: "Venen", matches: /vein|venous|sinus|plexus/i },
    {
      id: "heart",
      label: "Herz",
      matches: /heart|cardiac|ventricle|atrium|valve|leaflet|papillary|septum|sulcus|apex|border|surface|base|notch|atrio|valvular/i,
      excludes: /artery|arterial|arteries|aort|pulmonary trunk|vein|venous|sinus|plexus/i,
    },
  ],
};

export class UIManager {
  private dataManager: DataManager;
  private settingsManager: SettingsManager;

  private infoPanel: HTMLElement | null = null;
  private currentStructure: Structure | null = null;

  private onStructureSelect: StructureSelectCallback | null = null;
  private onVisibilityChange: VisibilityCallback | null = null;
  private onOpacityChange: OpacityCallback | null = null;
  private onSystemToggle: SystemToggleCallback | null = null;
  private onStructureLayerToggle: StructureLayerToggleCallback | null = null;
  private onCuttingPlaneChange: CuttingPlaneChangeCallback | null = null;
  private treeClickHandler: EventListener | null = null;
  private treeChangeHandler: EventListener | null = null;
  private treeInputHandler: EventListener | null = null;
  private structuresBySystem: Map<BodySystem, Structure[]> = new Map();
  private systemVisibility: Map<BodySystem, boolean> = new Map();
  private systemOpacities: Map<BodySystem, number> = new Map();
  private cuttingPlaneStates: Record<CuttingAxis, CuttingPlaneState> = {
    vertical: { enabled: false, progress: 50 },
    rightLeft: { enabled: false, progress: 50 },
    frontBack: { enabled: false, progress: 50 },
  };
  private structureVisibility: Map<string, boolean> = new Map();
  private hoverLabel: HTMLElement | null = null;

  constructor(dataManager: DataManager, settingsManager: SettingsManager) {
    this.dataManager = dataManager;
    this.settingsManager = settingsManager;
  }

  init(): void {
    this.createLayout();
    this.bindEvents();
  }

  private createLayout(): void {
    const app = document.getElementById("app")!;
    app.innerHTML = `
      <div class="app-layout" id="app-layout">
        <header class="app-header">
          <div class="header-left">
            <button class="btn btn-icon sidebar-toggle" id="sidebar-toggle" aria-label="Sidebar umschalten">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            </button>
            <div class="header-brand">
              <img src="./logo.svg" alt="" aria-hidden="true">
              <span>Anatomie Lernseite</span>
            </div>
          </div>
          <div class="header-center">
            <div class="mode-tabs" id="mode-tabs">
              <button class="mode-tab active" data-mode="atlas">Atlas</button>
              <button class="mode-tab" data-mode="labelQuiz">Beschriftungs-Quiz</button>
              <button class="mode-tab" data-mode="quiz">Quiz</button>
              <button class="mode-tab" data-mode="flashcards">Karteikarten</button>
              <button class="mode-tab" data-mode="progress">Fortschritt</button>
              <button class="mode-tab" data-mode="notes">Notizen</button>
            </div>
          </div>
          <div class="header-right">
            <div class="header-search" id="global-search">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input type="search" placeholder="Struktur suchen..." aria-label="Globale Suche" id="search-input">
            </div>
            <button class="btn btn-icon" id="theme-toggle" aria-label="Thema wechseln" title="Thema wechseln">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="theme-icon-sun" style="display: none;">
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                <line x1="1" y1="12" x2="3" y2="12"></line>
                <line x1="21" y1="12" x2="23" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
              </svg>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="theme-icon-moon">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
              </svg>
            </button>
            <button class="btn btn-icon" id="settings-btn" aria-label="Einstellungen" title="Einstellungen">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
            </button>
          </div>
        </header>

        <aside class="app-sidebar" id="sidebar">
          <div class="sidebar-header">
            <div class="sidebar-tabs">
              <button class="sidebar-tab active" data-tab="tree" id="tab-tree">
                <svg class="sidebar-tab-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="17 18 19 20 21 18"></polyline>
                  <polyline points="7 18 9 20 11 18"></polyline>
                  <polyline points="7 12 9 14 11 12"></polyline>
                  <polyline points="17 12 19 14 21 12"></polyline>
                  <polyline points="7 6 9 8 11 6"></polyline
                  <polyline points="17 6 19 8 21 6"></polyline>
                  <line x1="12" y1="2" x2="12" y2="22"></line>
                </svg>
                <span class="sidebar-tab-text">Strukturen</span>
              </button>
              <button class="sidebar-tab" data-tab="search" id="tab-search">
                <svg class="sidebar-tab-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <span class="sidebar-tab-text">Suche</span>
              </button>
              <button class="sidebar-tab" data-tab="about" id="tab-about">
                <svg class="sidebar-tab-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="9"></circle>
                  <line x1="12" y1="11" x2="12" y2="16"></line>
                  <circle cx="12" cy="7.5" r="0.75" fill="currentColor" stroke="none"></circle>
                </svg>
                <span class="sidebar-tab-text">Über</span>
              </button>
            </div>
          </div>
          <div class="sidebar-content" id="sidebar-content">
            <div class="tree-search">
              <input type="search" class="search-input" id="tree-search" placeholder="Struktur filtern..." aria-label="Strukturbaum filtern">
            </div>
            <div id="structure-tree"></div>
            <div id="search-results" style="display: none;"></div>
            <section id="about-content" class="about-content" hidden aria-labelledby="about-title">
              <div class="about-intro">
                <img src="./logo.svg" alt="" class="about-logo">
                <h2 id="about-title">Anatomie Lernseite</h2>
                <p>Interaktive 3D-Modelle zum Lernen und Erkunden der Anatomie.</p>
              </div>
              <section class="about-section">
                <h3>Programmcode</h3>
                <p>Der Anwendungscode steht unter der MIT-Lizenz.</p>
                <a href="https://opensource.org/license/mit" target="_blank" rel="noopener noreferrer">MIT-Lizenz ansehen</a>
              </section>
              <section class="about-section">
                <h3>3D-Modelle und Anatomiedaten</h3>
                <p>Die mitgelieferten Modelle und Daten stehen unter CC BY-SA 4.0. Bei einer Weitergabe sind Quellenangaben und Lizenzhinweise zu erhalten. Bearbeitungen müssen unter gleichen Bedingungen weitergegeben werden.</p>
                <ul class="about-sources">
                  <li><a href="https://github.com/Z-Anatomy/Models-of-human-anatomy" target="_blank" rel="noopener noreferrer">Z-Anatomy</a></li>
                  <li>BodyParts3D, DBCLS</li>
                  <li>Wikipedia sowie die Universitäten Basel, Tokio und Zürich</li>
                </ul>
                <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0 Lizenzbedingungen</a>
              </section>
              <section class="about-section">
                <h3>Mitgelieferte Komponenten</h3>
                <p>Die Desktop-Version enthält Electron mit Chromium, vorbereitete 3D-Modelle und den Draco-Decoder. Blender wird nicht installiert und ist zum Ausführen nicht erforderlich.</p>
                <p>Der Draco-Decoder steht unter Apache License 2.0. Electron und Chromium enthalten weitere Komponenten mit eigenen Open-Source-Lizenzen.</p>
                <a href="https://www.apache.org/licenses/LICENSE-2.0" target="_blank" rel="noopener noreferrer">Apache License 2.0</a>
              </section>
              <details class="about-notices">
                <summary>Vollständige Quellen- und Lizenzhinweise</summary>
                <iframe src="./licenses/third-party.html" title="Vollständige Quellen- und Lizenzhinweise" loading="lazy"></iframe>
              </details>
            </section>
          </div>
        </aside>

        <main class="main-content">
          <div class="canvas-container" id="canvas-container"></div>
        </main>

        <aside class="info-panel" id="info-panel">
          <div class="info-panel-header">
            <h3 class="info-panel-title" id="info-title">Strukturdetails</h3>
            <button class="btn btn-secondary info-panel-close" id="info-close" aria-label="Panel schließen" aria-controls="info-panel" title="Strukturdetails schließen">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
              <span>Schließen</span>
            </button>
          </div>
          <div class="info-panel-content" id="info-content">
            <div class="info-panel-empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
              </svg>
              <p>Wählen Sie eine Struktur im Atlas</p>
            </div>
          </div>
        </aside>

      </div>
    `;

    this.infoPanel = document.getElementById("info-panel");
  }

  private bindEvents(): void {
    document.getElementById("sidebar-toggle")!.addEventListener("click", () => this.toggleSidebar());
    document.getElementById("theme-toggle")!.addEventListener("click", () => this.toggleTheme());
    document.getElementById("settings-btn")!.addEventListener("click", () => this.openSettings());

    document.querySelectorAll(".mode-tab").forEach(tab => {
      tab.addEventListener("click", () => this.switchMode((tab as HTMLElement).dataset.mode!));
    });

    document.querySelectorAll(".sidebar-tab").forEach(tab => {
      tab.addEventListener("click", () => {
        const t = tab as HTMLElement;
        this.switchSidebarTab(t.dataset.tab as SidebarTab);
      });
    });

    document.getElementById("tree-search")!.addEventListener("input", (e) => this.filterTree((e.target as HTMLInputElement).value));
    document.getElementById("search-input")!.addEventListener("input", (e) => this.globalSearch((e.target as HTMLInputElement).value));

    document.getElementById("info-close")!.addEventListener("click", () => this.closeInfoPanel());

    this.settingsManager.subscribe(() => this.applySettings());
    this.applySettings();
  }

  private applySettings(): void {
    const theme = this.settingsManager.get("theme");
    const showLabels = this.settingsManager.get("showLabels");

    if (theme === "system") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", theme);
    }
    const systemDark = theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      "content",
      theme === "dark" || systemDark ? "#111824" : "#f5f7fb"
    );

    document.querySelectorAll(".structure-label")?.forEach(el => {
      (el as HTMLElement).style.display = showLabels ? "block" : "none";
    });
    if (!showLabels) this.hideHoverLabel();
  }

  private toggleSidebar(): void {
    if (window.matchMedia("(max-width: 768px)").matches) {
      document.getElementById("sidebar")!.classList.toggle("open");
    } else {
      document.getElementById("app-layout")!.classList.toggle("sidebar-collapsed");
    }
  }

  private toggleTheme(): void {
    const current = this.settingsManager.get("theme");
    const next = current === "dark" ? "light" : current === "light" ? "system" : "dark";
    this.settingsManager.set("theme", next);
  }

  private openSettings(): void {
    this.showModal(this.getSettingsModalHTML(), (modal) => this.bindSettingsModal(modal));
  }

  private getSettingsModalHTML(): string {
    const settings = this.settingsManager.getAll();
    return `
      <div class="modal-header">
        <h2 class="modal-title">Einstellungen</h2>
        <button class="modal-close" data-close>&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>Theme</label>
          <select class="select" id="setting-theme" value="${settings.theme}">
            <option value="system">System</option>
            <option value="dark">Dunkel</option>
            <option value="light">Hell</option>
          </select>
        </div>
        <div class="form-group">
          <label>Beschriftungssprache</label>
          <select class="select" id="setting-language" value="${settings.labelLanguage}">
            <option value="latin">Latein</option>
            <option value="de">Deutsch</option>
            <option value="en">Englisch</option>
          </select>
        </div>
        <div class="form-group">
          <label>Tagesziel (Karteikarten)</label>
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
        <hr style="margin: 16px 0; border-color: var(--border);">
        <div class="form-group">
          <label>Datenverwaltung</label>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button class="btn btn-secondary" id="export-data">Daten exportieren</button>
            <button class="btn btn-secondary" id="import-data">Daten importieren</button>
            <button class="btn btn-danger" id="clear-data">Alle Daten löschen</button>
          </div>
          <input type="file" id="import-file" accept=".json" style="display: none;">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" data-close>Fertig</button>
      </div>
    `;
  }

  private bindSettingsModal(modal: HTMLElement): void {
    modal.querySelectorAll("[data-close]").forEach(el => {
      el.addEventListener("click", () => this.closeModal());
    });

    (modal.querySelector("#setting-theme") as HTMLSelectElement).addEventListener("change", (e) => {
      this.settingsManager.set("theme", (e.target as HTMLSelectElement).value as "dark" | "light" | "system");
    });

    (modal.querySelector("#setting-language") as HTMLSelectElement).addEventListener("change", (e) => {
      this.settingsManager.set("labelLanguage", (e.target as HTMLSelectElement).value as "latin" | "de" | "en");
      this.renderStructureTree(
        this.dataManager.getAllStructures(),
        this.onStructureSelect!,
        this.onVisibilityChange!,
        this.onOpacityChange!,
        this.onSystemToggle!,
        this.onStructureLayerToggle!,
        [...this.systemVisibility].filter(([, visible]) => visible).map(([system]) => system),
        this.onCuttingPlaneChange!
      );
      if (this.currentStructure) this.updateInfoPanel(this.currentStructure);
    });

    (modal.querySelector("#setting-daily-goal") as HTMLInputElement).addEventListener("change", (e) => {
      this.settingsManager.set("dailyGoal", parseInt((e.target as HTMLInputElement).value));
    });

    (modal.querySelector("#setting-show-labels") as HTMLInputElement).addEventListener("change", (e) => {
      this.settingsManager.set("showLabels", (e.target as HTMLInputElement).checked);
    });

    (modal.querySelector("#setting-camera-distance") as HTMLInputElement).addEventListener("input", (e) => {
      const input = e.target as HTMLInputElement;
      modal.querySelector("#camera-distance-value")!.textContent = `${Number(input.value).toFixed(1)}x`;
    });
    (modal.querySelector("#setting-camera-distance") as HTMLInputElement).addEventListener("change", (e) => {
      this.settingsManager.set("cameraDistance", Number((e.target as HTMLInputElement).value));
    });

    (modal.querySelector("#setting-auto-rotate") as HTMLInputElement).addEventListener("change", (e) => {
      this.settingsManager.set("autoRotate", (e.target as HTMLInputElement).checked);
    });

    modal.querySelector("#export-data")!.addEventListener("click", async () => await this.exportData());
    modal.querySelector("#import-data")!.addEventListener("click", () => (modal.querySelector("#import-file") as HTMLInputElement)!.click());
    modal.querySelector("#import-file")!.addEventListener("change", (e) => this.importData(e));
    modal.querySelector("#clear-data")!.addEventListener("click", () => this.confirmClearData());
  }

  private async exportData(): Promise<void> {
    const data = await this.dataManager.exportAllData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `anatomie-backup-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.showToast("Daten exportiert", "success");
  }

  private importData(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result as string);
        await this.dataManager.importData(data);
        this.showToast("Daten importiert", "success");
        this.closeModal();
        location.reload();
      } catch {
        this.showToast("Import fehlgeschlagen", "error");
      }
    };
    reader.readAsText(file);
    (event.target as HTMLInputElement).value = "";
  }

  private confirmClearData(): void {
    if (confirm("Wirklich alle lokalen Daten löschen? Dies kann nicht rückgängig gemacht werden.")) {
      this.dataManager.clearAllData();
      this.showToast("Daten gelöscht", "success");
      this.closeModal();
      location.reload();
    }
  }

  private switchMode(mode: string): void {
    this.setActiveModeTab(mode);
    window.dispatchEvent(new CustomEvent("mode-change", { detail: mode }));
  }

  setActiveModeTab(mode: string): void {
    document.querySelectorAll(".mode-tab").forEach(t => {
      t.classList.toggle("active", (t as HTMLElement).dataset.mode === mode);
    });
  }

  private switchSidebarTab(tab: SidebarTab): void {
    document.querySelectorAll(".sidebar-tab").forEach(t => t.classList.toggle("active", (t as HTMLElement).dataset.tab === tab));
    document.getElementById("structure-tree")!.style.display = tab === "tree" ? "block" : "none";
    document.getElementById("search-results")!.style.display = tab === "search" ? "block" : "none";
    document.getElementById("tree-search")!.style.display = tab === "tree" ? "block" : "none";
    document.getElementById("about-content")!.hidden = tab !== "about";
  }

  private filterTree(query: string): void {
    const tree = document.getElementById("structure-tree")!;
    const lower = query.toLowerCase();

    tree.querySelectorAll<HTMLElement>(".tree-group").forEach(group => {
      const system = group.dataset.system as BodySystem;
      const structures = this.structuresBySystem.get(system) || [];
      const labelMatches = SYSTEM_LABELS[system].toLowerCase().includes(lower) ||
        system.toLowerCase().includes(lower);
      const matches = lower
        ? structures.filter(structure =>
          labelMatches ||
          this.settingsManager.getLabel(structure).toLowerCase().includes(lower) ||
          structure.id.toLowerCase().includes(lower)
        )
        : [];
      const visible = !lower || labelMatches || matches.length > 0;
      group.hidden = !visible;

      const children = group.querySelector<HTMLElement>(".tree-group-children")!;
      if (lower && visible) {
        this.setTreeGroupExpanded(group, true);
        const matchingStructures = labelMatches ? structures : matches.slice(0, 100);
        children.innerHTML = this.getTreeGroupContent(
          system,
          matchingStructures,
          !labelMatches && matchingStructures.length <= 100
        );
        children.dataset.rendered = "true";
        this.syncStructureVisibilityControls();
        const remaining = labelMatches ? 0 : matches.length - 100;
        if (remaining > 0) {
          children.insertAdjacentHTML("beforeend", `<p class="tree-result-limit">Bitte Suche eingrenzen. Weitere Treffer: ${remaining}+</p>`);
        }
      } else if (!lower) {
        this.setTreeGroupExpanded(group, false);
        children.innerHTML = "";
        delete children.dataset.rendered;
      }
    });
  }

  private globalSearch(query: string): void {
    if (!query.trim()) {
      document.getElementById("search-results")!.innerHTML = "";
      return;
    }

    const structures = this.dataManager.getAllStructuresSync();
    const results = structures
      .filter(s => {
        const name = this.settingsManager.getLabel(s);
        return name.toLowerCase().includes(query.toLowerCase());
      })
      .slice(0, 20);

    const container = document.getElementById("search-results")!;
    container.innerHTML = results.map(s => {
      const name = this.settingsManager.getLabel(s);
      const color = this.settingsManager.getSystemColor(s.system);
      return `
        <div class="tree-item search-result-item" data-id="${s.id}" style="border-left: 3px solid ${color};">
          <span class="tree-item-name">${name}</span>
          <span class="note-system">${s.system}</span>
        </div>
      `;
    }).join("");

    container.querySelectorAll(".search-result-item").forEach(item => {
      item.addEventListener("click", () => this.selectStructure((item as HTMLElement).dataset.id!));
    });
  }

  setActiveSidebarTab(tab: SidebarTab): void {
    document.querySelectorAll(".sidebar-tab").forEach(t => t.classList.toggle("active", (t as HTMLElement).dataset.tab === tab));
    document.getElementById("structure-tree")!.style.display = tab === "tree" ? "block" : "none";
    document.getElementById("search-results")!.style.display = tab === "search" ? "block" : "none";
    document.getElementById("tree-search")!.style.display = tab === "tree" ? "block" : "none";
    document.getElementById("about-content")!.hidden = tab !== "about";
  }

  renderStructureTree(
    structures: Structure[],
    onSelect: StructureSelectCallback,
    onVisibility: VisibilityCallback,
    onOpacity: OpacityCallback,
    onSystemToggle?: SystemToggleCallback,
    onStructureLayerToggle?: StructureLayerToggleCallback,
    initiallyVisibleSystems: BodySystem[] = [],
    onCuttingPlaneChange?: CuttingPlaneChangeCallback
  ): void {
    this.onStructureSelect = onSelect;
    this.onVisibilityChange = onVisibility;
    this.onOpacityChange = onOpacity;
    this.onSystemToggle = onSystemToggle ?? null;
    this.onStructureLayerToggle = onStructureLayerToggle ?? null;
    this.onCuttingPlaneChange = onCuttingPlaneChange ?? null;

    const container = document.getElementById("structure-tree")!;
    this.structuresBySystem = new Map();
    this.systemVisibility = new Map();
    structures.forEach(structure => {
      const group = this.structuresBySystem.get(structure.system) || [];
      group.push(structure);
      this.structuresBySystem.set(structure.system, group);
    });
    const systems = [...this.structuresBySystem.keys()].sort((a, b) => {
      const orderA = SYSTEM_ORDER.indexOf(a);
      const orderB = SYSTEM_ORDER.indexOf(b);
      return (orderA < 0 ? SYSTEM_ORDER.length : orderA) - (orderB < 0 ? SYSTEM_ORDER.length : orderB);
    });
    initiallyVisibleSystems.forEach(system => this.systemVisibility.set(system, true));

    container.innerHTML = `
      <div class="tree-overview">
        <span>Systeme und Gewebe</span>
        <span>${structures.length.toLocaleString("de-DE")} Strukturen</span>
      </div>
      <details class="cut-controls" open>
        <summary class="cut-controls-summary">
          <span>Modell schneiden</span>
          <span class="cut-controls-hint">3 Achsen</span>
        </summary>
        <div class="cut-controls-body">
          <p class="cut-controls-description">Die Ebene blendet eine Seite aus; Schnittflächen bleiben offen.</p>
          ${CUTTING_AXES.map(({ axis, label }) => {
            const state = this.cuttingPlaneStates[axis];
            return `
              <div class="cut-axis">
                <label class="cut-axis-label" for="cut-progress-${axis}">${label}</label>
                <div class="cut-axis-controls" data-axis="${axis}">
                  <input type="checkbox" class="cut-axis-enabled" data-axis="${axis}" aria-label="${label} aktivieren" ${state.enabled ? "checked" : ""}>
                  <input type="range" class="cut-axis-progress" data-axis="${axis}" id="cut-progress-${axis}" min="0" max="100" step="1" value="${state.progress}" aria-label="${label}, Schnittposition" aria-valuetext="${state.progress} Prozent">
                  <output class="cut-axis-value" for="cut-progress-${axis}">${state.progress}%</output>
                </div>
              </div>
            `;
          }).join("")}
          <button type="button" class="cut-reset">Schnitte zurücksetzen</button>
        </div>
      </details>
      ${systems.map(system => {
      const systemStructures = this.structuresBySystem.get(system)!;
      const color = this.settingsManager.getSystemColor(system);
      const isVisible = this.systemVisibility.get(system) ?? false;

      return `
        <section class="tree-group" data-system="${system}">
          <div class="tree-group-header">
            <input type="checkbox" class="tree-group-visibility" data-system="${system}" ${isVisible ? "checked" : ""} aria-label="${SYSTEM_LABELS[system]} einblenden">
            <div class="tree-group-color" style="background: ${color}"></div>
            <button type="button" class="tree-group-toggle" aria-expanded="false">
              <span class="tree-group-name">${SYSTEM_LABELS[system]}</span>
              <span class="tree-group-count">${systemStructures.length.toLocaleString("de-DE")}</span>
            </button>
            <input type="range" class="tree-group-opacity" data-system="${system}" min="0" max="100" step="1" value="${Math.round((this.systemOpacities.get(system) ?? 1) * 100)}" aria-label="${SYSTEM_LABELS[system]} Deckkraft" title="${SYSTEM_LABELS[system]} Deckkraft">
          </div>
          <div class="tree-group-children" hidden></div>
        </section>
      `;
    }).join("")}
    `;
    this.syncStructureVisibilityControls();

    if (this.treeClickHandler) container.removeEventListener("click", this.treeClickHandler);
    this.treeClickHandler = (event: Event) => {
      const target = event.target as HTMLElement;
      if (target.closest(".cut-reset")) {
        this.resetCuttingControls();
        return;
      }

      const groupToggle = target.closest<HTMLButtonElement>(".tree-group-toggle");
      if (groupToggle) {
        const group = groupToggle.closest<HTMLElement>(".tree-group")!;
        const children = group.querySelector<HTMLElement>(".tree-group-children")!;
        const expanded = groupToggle.getAttribute("aria-expanded") !== "true";
        this.setTreeGroupExpanded(group, expanded);
        if (expanded && children.dataset.rendered !== "true") {
          children.innerHTML = this.getTreeGroupContent(
            group.dataset.system as BodySystem,
            this.structuresBySystem.get(group.dataset.system as BodySystem) || [],
            false
          );
          children.dataset.rendered = "true";
          this.syncStructureVisibilityControls();
        }
        return;
      }

      const nestedToggle = target.closest<HTMLButtonElement>(".tree-area-toggle, .tree-subgroup-toggle");
      if (nestedToggle) {
        const container = nestedToggle.closest<HTMLElement>(".tree-area, .tree-subgroup")!;
        const children = container.querySelector<HTMLElement>(".tree-area-children, .tree-subgroup-children")!;
        const expanded = nestedToggle.getAttribute("aria-expanded") !== "true";
        nestedToggle.setAttribute("aria-expanded", String(expanded));
        children.hidden = !expanded;
        container.classList.toggle("expanded", expanded);
        return;
      }

      const noteButton = target.closest(".add-note");
      if (noteButton) {
        event.stopPropagation();
        window.dispatchEvent(new CustomEvent("add-note", { detail: noteButton.getAttribute("data-id") }));
        return;
      }

      const bookmarkButton = target.closest(".add-bookmark");
      if (bookmarkButton) {
        event.stopPropagation();
        window.dispatchEvent(new CustomEvent("toggle-bookmark", { detail: bookmarkButton.getAttribute("data-id") }));
        return;
      }

      if (target.closest(".tree-item-actions")) return;
      if (target.closest("input, button")) return;
      const item = target.closest(".tree-item") as HTMLElement | null;
      if (item?.dataset.id) this.selectStructure(item.dataset.id);
    };
    container.addEventListener("click", this.treeClickHandler);

    if (this.treeChangeHandler) container.removeEventListener("change", this.treeChangeHandler);
    this.treeChangeHandler = (event: Event) => {
      const target = event.target as HTMLInputElement;
      if (target.classList.contains("cut-axis-enabled")) {
        const axis = target.dataset.axis as CuttingAxis;
        const state = this.cuttingPlaneStates[axis];
        state.enabled = target.checked;
        this.onCuttingPlaneChange?.(axis, state.enabled, state.progress);
        return;
      }

      if (target.classList.contains("tree-item-visibility")) {
        const item = target.closest(".tree-item") as HTMLElement | null;
        if (item?.dataset.id) {
          const system = item.closest<HTMLElement>(".tree-group")?.dataset.system as BodySystem | undefined;
          if (target.checked && system && !this.systemVisibility.get(system)) {
            (this.structuresBySystem.get(system) || []).forEach(structure =>
              this.structureVisibility.set(structure.id, false)
            );
            this.systemVisibility.set(system, true);
            const systemCheckbox = item.closest<HTMLElement>(".tree-group")!
              .querySelector<HTMLInputElement>(".tree-group-visibility");
            if (systemCheckbox) systemCheckbox.checked = true;
          }
          this.structureVisibility.set(item.dataset.id, target.checked);
          this.onVisibilityChange?.(item.dataset.id, target.checked);
          this.syncStructureVisibilityControls();
        }
        return;
      }

      if (target.classList.contains("tree-layer-visibility")) {
        const group = target.closest<HTMLElement>(".tree-group");
        const system = group?.dataset.system as BodySystem | undefined;
        if (!group || !system) return;
        const ids = JSON.parse(target.dataset.structureIds || "[]") as string[];
        if (target.checked && !this.systemVisibility.get(system)) {
          (this.structuresBySystem.get(system) || []).forEach(structure =>
            this.structureVisibility.set(structure.id, false)
          );
          const systemCheckbox = group.querySelector<HTMLInputElement>(".tree-group-visibility")!;
          systemCheckbox.checked = true;
          this.systemVisibility.set(system, true);
        }
        ids.forEach((id: string) => this.structureVisibility.set(id, target.checked));
        this.onStructureLayerToggle?.(system, ids, target.checked);
        this.syncStructureVisibilityControls();
        return;
      }

      if (!target.classList.contains("tree-group-visibility")) return;
      const system = target.dataset.system as BodySystem;
      const checked = target.checked;
      this.systemVisibility.set(system, checked);
      target.indeterminate = false;
      const group = target.closest<HTMLElement>(".tree-group")!;
      if (this.onSystemToggle) {
        this.onSystemToggle(system, checked);
      } else {
        group.querySelectorAll(".tree-item").forEach(item => {
          const element = item as HTMLElement;
          if (element.dataset.id) this.onVisibilityChange?.(element.dataset.id, checked);
        });
      }
    };
    container.addEventListener("change", this.treeChangeHandler);

    if (this.treeInputHandler) container.removeEventListener("input", this.treeInputHandler);
    this.treeInputHandler = (event: Event) => {
      const target = event.target as HTMLInputElement;
      if (target.classList.contains("cut-axis-progress")) {
        const axis = target.dataset.axis as CuttingAxis;
        const state = this.cuttingPlaneStates[axis];
        state.progress = target.valueAsNumber;
        const output = target.closest<HTMLElement>(".cut-axis")?.querySelector("output");
        if (output) output.textContent = `${state.progress}%`;
        target.setAttribute("aria-valuetext", `${state.progress} Prozent`);
        this.onCuttingPlaneChange?.(axis, state.enabled, state.progress);
        return;
      }

      if (target.classList.contains("tree-group-opacity")) {
        const system = target.dataset.system as BodySystem;
        const opacity = target.valueAsNumber / 100;
        this.systemOpacities.set(system, opacity);
        this.onOpacityChange?.(system, opacity);
      }
    };
    container.addEventListener("input", this.treeInputHandler);

  }

  resetCuttingControls(): void {
    CUTTING_AXES.forEach(({ axis }) => {
      const state = this.cuttingPlaneStates[axis];
      state.enabled = false;
      state.progress = 50;
      this.onCuttingPlaneChange?.(axis, false, state.progress);

      const checkbox = document.querySelector<HTMLInputElement>(`.cut-axis-enabled[data-axis="${axis}"]`);
      const slider = document.querySelector<HTMLInputElement>(`.cut-axis-progress[data-axis="${axis}"]`);
      const output = document.querySelector<HTMLOutputElement>(`.cut-axis-controls[data-axis="${axis}"] output`);
      if (checkbox) checkbox.checked = false;
      if (slider) {
        slider.value = "50";
        slider.setAttribute("aria-valuetext", "50 Prozent");
      }
      if (output) output.textContent = "50%";
    });
  }

  private getTreeGroupContent(system: BodySystem, structures: Structure[], expandGroups = false): string {
    const layers = STRUCTURE_LAYERS[system] || [];
    const layerHtml = layers.map(layer => {
      const ids = structures
        .filter(structure => {
          const name = `${structure.nameLatin} ${structure.objectName}`;
          return layer.matches.test(name) && !layer.excludes?.test(name);
        })
        .map(structure => structure.id);
      return `
        <label class="tree-layer">
          <input type="checkbox" class="tree-layer-visibility" data-layer="${layer.id}" data-structure-ids='${this.serializeStructureIds(ids)}' aria-label="${layer.label} einblenden" ${this.areStructuresVisible(ids) ? "checked" : ""}>
          <span>${layer.label}</span>
          <span class="tree-layer-count">${ids.length}</span>
        </label>
      `;
    }).join("");

    const regions = new Map<string, Structure[]>();
    const parentCounts = new Map<string, number>();
    structures.forEach(structure => {
      const region = structure.region || "unknown";
      const regionStructures = regions.get(region) || [];
      regionStructures.push(structure);
      regions.set(region, regionStructures);
      if (structure.parentId) {
        parentCounts.set(structure.parentId, (parentCounts.get(structure.parentId) || 0) + 1);
      }
    });

    const regionHtml = [...regions.entries()]
      .sort(([regionA], [regionB]) => {
        const orderA = REGION_ORDER.indexOf(regionA);
        const orderB = REGION_ORDER.indexOf(regionB);
        return (orderA < 0 ? REGION_ORDER.length : orderA) - (orderB < 0 ? REGION_ORDER.length : orderB);
      })
      .map(([region, regionStructures]) =>
        this.renderTreeArea(system, region, regionStructures, parentCounts, expandGroups)
      )
      .join("");

    return `
      ${layerHtml ? `<div class="tree-layer-list">${layerHtml}</div>` : ""}
      <div class="tree-area-list">${regionHtml}</div>
    `;
  }

  private renderTreeArea(
    system: BodySystem,
    region: string,
    structures: Structure[],
    parentCounts: Map<string, number>,
    expanded: boolean
  ): string {
    const structureIds = structures.map(structure => structure.id);
    const parents = new Map<string, Structure[]>();
    structures.forEach(structure => {
      const parentId = structure.parentId || "";
      const children = parents.get(parentId) || [];
      children.push(structure);
      parents.set(parentId, children);
    });

    const subgroups: Array<{ label: string; structures: Structure[] }> = [];
    const individualStructures: Structure[] = [];
    parents.forEach((items, parentId) => {
      const hasSourceGroup = parentId.endsWith("g");
      const isGroupedParent = Boolean(parentId) && (
        system === "insertions" ||
        hasSourceGroup ||
        (parentCounts.get(parentId) || 0) > 1
      );
      if (isGroupedParent) {
        subgroups.push({ label: this.getParentGroupLabel(parentId), structures: items });
      } else {
        individualStructures.push(...items);
      }
    });
    subgroups.sort((a, b) => a.label.localeCompare(b.label, "de"));

    const subgroupHtml = subgroups.map(subgroup =>
      this.renderTreeSubgroup(subgroup.label, subgroup.structures, expanded)
    ).join("");
    const individualHtml = individualStructures.length > 12
      ? this.renderTreeSubgroup("Weitere Einzelstrukturen", individualStructures, expanded)
      : this.renderTreeItems(individualStructures);
    const regionLabel = region === "unknown" && system === "insertions"
      ? "Zuordnungen nach Knochen"
      : REGION_LABELS[region] || this.formatGroupLabel(region);

    return `
      <section class="tree-area">
        <div class="tree-area-header">
          ${this.renderVisibilityCheckbox(structureIds, `${regionLabel} einblenden`)}
          <button type="button" class="tree-area-toggle" aria-expanded="${expanded}">
            <span class="tree-area-name">${regionLabel}</span>
            <span class="tree-group-count">${structures.length.toLocaleString("de-DE")}</span>
          </button>
        </div>
        <div class="tree-area-children"${expanded ? "" : " hidden"}>
          ${subgroupHtml}
          ${individualHtml}
        </div>
      </section>
    `;
  }

  private renderTreeSubgroup(label: string, structures: Structure[], expanded: boolean): string {
    const ids = structures.map(structure => structure.id);
    return `
      <section class="tree-subgroup">
        <div class="tree-subgroup-header">
          ${this.renderVisibilityCheckbox(ids, `${label} einblenden`)}
          <button type="button" class="tree-subgroup-toggle" aria-expanded="${expanded}">
            <span class="tree-subgroup-name">${label}</span>
            <span class="tree-group-count">${structures.length.toLocaleString("de-DE")}</span>
          </button>
        </div>
        <div class="tree-subgroup-children"${expanded ? "" : " hidden"}>
          ${this.renderTreeItems(structures)}
        </div>
      </section>
    `;
  }

  private renderTreeItems(structures: Structure[]): string {
    return `
      <div class="tree-structure-list">
        ${structures.map(structure => `
          <div class="tree-item" data-id="${structure.id}">
            <input type="checkbox" class="tree-item-visibility" ${this.isStructureVisible(structure.id) ? "checked" : ""} aria-label="${this.settingsManager.getLabel(structure)} einblenden">
            <span class="tree-item-name">${this.settingsManager.getLabel(structure)}</span>
            <div class="tree-item-actions">
              <button class="btn-icon add-note" title="Notiz hinzufügen" data-id="${structure.id}">📝</button>
              <button class="btn-icon add-bookmark" title="Lesezeichen" data-id="${structure.id}">🔖</button>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  }

  private renderVisibilityCheckbox(ids: string[], label: string): string {
    return `<input type="checkbox" class="tree-layer-visibility" data-structure-ids='${this.serializeStructureIds(ids)}' aria-label="${label}" ${this.areStructuresVisible(ids) ? "checked" : ""}>`;
  }

  private serializeStructureIds(ids: string[]): string {
    return JSON.stringify(ids)
      .replace(/&/g, "&amp;")
      .replace(/'/g, "&#39;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  private areStructuresVisible(ids: string[]): boolean {
    return ids.length > 0 && ids.every(id => this.isStructureVisible(id));
  }

  private isStructureVisible(id: string): boolean {
    if (this.structureVisibility.has(id)) return this.structureVisibility.get(id)!;
    const structure = this.dataManager.getStructureSync(id);
    return structure ? this.systemVisibility.get(structure.system) ?? false : false;
  }

  private getParentGroupLabel(parentId: string): string {
    const parent = this.dataManager.getStructureSync(parentId);
    if (parent) return this.settingsManager.getLabel(parent);
    const label = parentId.endsWith("g") ? parentId.slice(0, -1) : parentId;
    return this.formatGroupLabel(label);
  }

  private formatGroupLabel(value: string): string {
    return value
      .replace(/_/g, " ")
      .replace(/\b[a-z]/g, character => character.toUpperCase());
  }

  syncStructureVisibilityControls(): void {
    document.querySelectorAll<HTMLInputElement>(".tree-layer-visibility").forEach(checkbox => {
      const ids = JSON.parse(checkbox.dataset.structureIds || "[]") as string[];
      const visibleCount = ids.filter(id => this.isStructureVisible(id)).length;
      checkbox.checked = ids.length > 0 && visibleCount === ids.length;
      checkbox.indeterminate = visibleCount > 0 && visibleCount < ids.length;
    });

    document.querySelectorAll<HTMLInputElement>(".tree-group-visibility").forEach(checkbox => {
      const system = checkbox.dataset.system as BodySystem | undefined;
      if (!system) return;
      const structures = this.structuresBySystem.get(system) || [];
      const visibleCount = structures.filter(structure =>
        this.isStructureVisible(structure.id)
      ).length;
      if (this.systemVisibility.get(system) && visibleCount === 0) {
        this.systemVisibility.set(system, false);
      }
      const systemVisible = this.systemVisibility.get(system) ?? false;
      checkbox.checked = systemVisible && structures.length > 0 && visibleCount === structures.length;
      checkbox.indeterminate = systemVisible && visibleCount > 0 && visibleCount < structures.length;
    });
  }

  syncStructureVisibility(visibility: Map<string, boolean>): void {
    visibility.forEach((visible, id) => this.structureVisibility.set(id, visible));
    this.syncStructureVisibilityControls();
  }

  private setTreeGroupExpanded(group: HTMLElement, expanded: boolean): void {
    group.querySelector<HTMLButtonElement>(".tree-group-toggle")!.setAttribute("aria-expanded", String(expanded));
    group.querySelector<HTMLElement>(".tree-group-children")!.hidden = !expanded;
    group.classList.toggle("expanded", expanded);
  }

  showHoverLabel(structure: Structure, x: number, y: number): void {
    if (!this.settingsManager.get("showLabels")) return;
    const container = document.getElementById("canvas-container");
    if (!container) return;

    if (!this.hoverLabel || !container.contains(this.hoverLabel)) {
      this.hoverLabel = document.createElement("div");
      this.hoverLabel.className = "atlas-hover-label";
      this.hoverLabel.setAttribute("role", "status");
      container.appendChild(this.hoverLabel);
    }

    this.hoverLabel.textContent = this.settingsManager.getLabel(structure);
    this.hoverLabel.hidden = false;
    const left = Math.min(x + 14, container.clientWidth - this.hoverLabel.offsetWidth - 8);
    const top = Math.min(y + 14, container.clientHeight - this.hoverLabel.offsetHeight - 8);
    this.hoverLabel.style.left = `${Math.max(8, left)}px`;
    this.hoverLabel.style.top = `${Math.max(8, top)}px`;
  }

  hideHoverLabel(): void {
    if (this.hoverLabel) this.hoverLabel.hidden = true;
  }

  selectStructure(id: string): void {
    const structure = this.dataManager.getStructureSync(id);
    if (!structure) return;

    this.currentStructure = structure;
    document.querySelectorAll(".tree-item").forEach(item => {
      item.classList.toggle("selected", (item as HTMLElement).dataset.id === id);
    });
    this.onStructureSelect?.(id);
    this.openInfoPanel();
    this.updateInfoPanel(structure);
  }

  clearStructureSelection(): void {
    this.currentStructure = null;
    document.querySelectorAll(".tree-item.selected").forEach(item => item.classList.remove("selected"));
    const content = document.getElementById("info-content");
    if (content) {
      content.innerHTML = `
        <div class="info-panel-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
          <p>Wählen Sie eine Struktur im Atlas</p>
        </div>
      `;
    }
  }

  updateInfoPanel(structure: Structure): void {
    const color = this.settingsManager.getSystemColor(structure.system);

    const content = document.getElementById("info-content")!;
    content.innerHTML = `
      <div class="structure-info">
        <div class="structure-names">
          <div class="structure-name-row">
            <span class="structure-name-label">Latein:</span>
            <span class="structure-name-value structure-latin">${structure.nameLatin}</span>
          </div>
          ${structure.nameDe ? `<div class="structure-name-row"><span class="structure-name-label">Deutsch:</span><span class="structure-name-value">${structure.nameDe}</span></div>` : ""}
          ${structure.nameEn ? `<div class="structure-name-row"><span class="structure-name-label">Englisch:</span><span class="structure-name-value">${structure.nameEn}</span></div>` : ""}
        </div>
        <div class="structure-meta">
          <div class="structure-meta-item">
            <span class="structure-meta-label">System:</span>
            <span class="structure-meta-value">
              <span class="structure-system-badge" style="background: ${color}22; color: ${color}; border: 1px solid ${color};">${structure.system}</span>
            </span>
          </div>
          ${structure.region ? `<div class="structure-meta-item"><span class="structure-meta-label">Region:</span><span class="structure-meta-value">${structure.region}</span></div>` : ""}
        </div>
        <div class="structure-actions">
          <button class="btn btn-primary" id="btn-isolate">Isolieren</button>
          <button class="btn btn-secondary" id="btn-hide">Ausblenden</button>
          <button class="btn btn-secondary" id="btn-reset-view">Ansicht zurücksetzen</button>
          <button class="btn btn-secondary" id="btn-add-note">Notiz hinzufügen</button>
          <button class="btn btn-secondary" id="btn-bookmark">Lesezeichen hinzufügen</button>
        </div>
      </div>
    `;

    document.getElementById("btn-isolate")!.addEventListener("click", () => window.dispatchEvent(new CustomEvent("isolate-structure", { detail: structure })));
    document.getElementById("btn-hide")!.addEventListener("click", () => window.dispatchEvent(new CustomEvent("hide-structure", { detail: structure })));
    document.getElementById("btn-reset-view")!.addEventListener("click", () => window.dispatchEvent(new CustomEvent("reset-view")));
    document.getElementById("btn-add-note")!.addEventListener("click", () => window.dispatchEvent(new CustomEvent("add-note", { detail: structure.id })));
    document.getElementById("btn-bookmark")!.addEventListener("click", () => window.dispatchEvent(new CustomEvent("toggle-bookmark", { detail: structure.id })));
  }

  openInfoPanel(): void {
    this.infoPanel?.classList.add("open");
  }

  closeInfoPanel(): void {
    this.infoPanel?.classList.remove("open");
  }

  togglePanel(): void {
    this.infoPanel?.classList.toggle("open");
  }

  showLoading(text: string): void {
    const loading = document.getElementById("quiz-loading");
    if (loading) {
      loading.querySelector(".loading-text")!.textContent = text;
      loading.style.display = "flex";
    }
  }

  updateLoadingProgress(_percent: number): void {
  }

  hideLoading(): void {
    const loading = document.getElementById("quiz-loading");
    if (loading) loading.style.display = "none";
  }

  showError(message: string): void {
    this.showToast(message, "error");
  }

  showToast(message: string, type: "success" | "error" | "warning" = "success"): void {
    const existing = document.querySelector(".toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span class="toast-message">${message}</span>
      <button class="toast-close" aria-label="Schließen">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    `;
    toast.querySelector(".toast-close")!.addEventListener("click", () => toast.remove());
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
  }

  showModal(html: string, onOpen?: (modal: HTMLElement) => void): void {
    const existing = document.querySelector(".modal-overlay");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `<div class="modal">${html}</div>`;

    overlay.querySelector(".modal")!.addEventListener("click", e => e.stopPropagation());
    overlay.addEventListener("click", () => this.closeModal());

    document.body.appendChild(overlay);
    onOpen?.(overlay.querySelector(".modal")!);
  }

  closeModal(): void {
    document.querySelector(".modal-overlay")?.remove();
  }

  getCurrentStructure(): Structure | null {
    return this.currentStructure;
  }
}