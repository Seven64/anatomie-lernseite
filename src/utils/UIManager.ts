import { DataManager } from "./DataManager";
import { SettingsManager } from "./SettingsManager";
import { escapeHtml } from "./text";
import { BodySystem, Structure } from "../types";
import { renderAppLayout } from "../ui/layout";
import { InfoPanel } from "../ui/InfoPanel";
import { SettingsModal } from "../ui/SettingsModal";
import { StructureTree, TreeCallbacks } from "../ui/StructureTree";
import { LayerStatus } from "../ui/LayerControls";
import { systemLabel } from "../ui/constants";
import * as feedback from "../ui/feedback";

export type { TreeCallbacks } from "../ui/StructureTree";
export type { LayerStatus } from "../ui/LayerControls";

type SidebarTab = "tree" | "search" | "about";
const SEARCH_RESULT_LIMIT = 20;

/**
 * Fassade für alle UI-Bereiche. Die Modi sprechen nur mit dieser Klasse;
 * die eigentliche Logik steckt in den Modulen unter `src/ui/`.
 */
export class UIManager {
  private readonly infoPanel: InfoPanel;
  private readonly settingsModal: SettingsModal;
  private readonly tree: StructureTree;
  private readonly hoverLabel = new feedback.HoverLabel();
  private currentStructure: Structure | null = null;

  constructor(private readonly dataManager: DataManager, private readonly settingsManager: SettingsManager) {
    this.infoPanel = new InfoPanel(settingsManager);
    this.tree = new StructureTree(dataManager, settingsManager, id => this.selectStructure(id));
    this.settingsModal = new SettingsModal(dataManager, settingsManager, () => this.onLanguageChange());
  }

  init(): void {
    document.getElementById("app")!.innerHTML = renderAppLayout(__APP_VERSION__);
    this.bindEvents();
  }

  private bindEvents(): void {
    const byId = (id: string) => document.getElementById(id)!;
    byId("sidebar-toggle").addEventListener("click", () => this.toggleSidebar());
    byId("theme-toggle").addEventListener("click", () => this.toggleTheme());
    byId("settings-btn").addEventListener("click", () => this.settingsModal.open());
    byId("info-close").addEventListener("click", () => this.infoPanel.close());

    document.querySelectorAll<HTMLElement>(".mode-tab").forEach(tab => {
      tab.addEventListener("click", () => {
        this.setActiveModeTab(tab.dataset.mode!);
        window.dispatchEvent(new CustomEvent("mode-change", { detail: tab.dataset.mode }));
      });
    });
    document.querySelectorAll<HTMLElement>(".sidebar-tab").forEach(tab => {
      tab.addEventListener("click", () => this.setActiveSidebarTab(tab.dataset.tab as SidebarTab));
    });

    byId("tree-search").addEventListener("input", event => this.tree.filter((event.target as HTMLInputElement).value));
    byId("search-input").addEventListener("input", event => {
      const query = (event.target as HTMLInputElement).value;
      if (query.trim()) this.setActiveSidebarTab("search");
      this.globalSearch(query);
    });

    this.settingsManager.subscribe(() => this.applySettings());
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => this.applySettings());
    this.applySettings();
  }

  private applySettings(): void {
    const theme = this.settingsManager.get("theme");
    if (theme === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", theme);

    const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#111824" : "#f5f7fb");

    const toggle = document.getElementById("theme-toggle");
    if (toggle) {
      toggle.querySelector<SVGElement>(".theme-icon-sun")!.style.display = dark ? "" : "none";
      toggle.querySelector<SVGElement>(".theme-icon-moon")!.style.display = dark ? "none" : "";
      const label = { light: "Hell", dark: "Dunkel", system: "System" }[theme];
      toggle.title = `Thema: ${label} (klicken zum Wechseln)`;
    }

    if (!this.settingsManager.get("showLabels")) this.hideHoverLabel();
    window.dispatchEvent(new CustomEvent("theme-applied"));
  }

  private toggleSidebar(): void {
    if (window.matchMedia("(max-width: 768px)").matches) {
      document.getElementById("sidebar")!.classList.toggle("open");
    } else {
      document.getElementById("app-layout")!.classList.toggle("sidebar-collapsed");
    }
    window.dispatchEvent(new Event("resize"));
  }

  private toggleTheme(): void {
    const current = this.settingsManager.get("theme");
    this.settingsManager.set("theme", current === "dark" ? "light" : current === "light" ? "system" : "dark");
  }

  private onLanguageChange(): void {
    if (this.tree.hasCallbacks()) this.tree.render(this.dataManager.getAllStructures(), this.treeCallbacks!, this.tree.getVisibleSystems());
    if (this.currentStructure) this.infoPanel.show(this.currentStructure);
  }

  setActiveModeTab(mode: string): void {
    document.querySelectorAll<HTMLElement>(".mode-tab").forEach(tab => tab.classList.toggle("active", tab.dataset.mode === mode));
  }

  setActiveSidebarTab(tab: SidebarTab): void {
    document.querySelectorAll<HTMLElement>(".sidebar-tab").forEach(item => item.classList.toggle("active", item.dataset.tab === tab));
    document.getElementById("structure-tree")!.style.display = tab === "tree" ? "block" : "none";
    document.getElementById("search-results")!.style.display = tab === "search" ? "block" : "none";
    document.getElementById("tree-search")!.style.display = tab === "tree" ? "block" : "none";
    document.getElementById("about-content")!.hidden = tab !== "about";
  }

  private globalSearch(query: string): void {
    const container = document.getElementById("search-results")!;
    const lower = query.trim().toLowerCase();
    if (!lower) {
      container.innerHTML = "";
      return;
    }

    const results: Structure[] = [];
    for (const structure of this.dataManager.getAllStructures()) {
      if (this.settingsManager.getLabel(structure).toLowerCase().includes(lower)) results.push(structure);
      if (results.length >= SEARCH_RESULT_LIMIT) break;
    }

    container.innerHTML = results.length === 0
      ? `<p class="tree-result-limit">Keine Treffer</p>`
      : results.map(structure => `
        <div class="tree-item search-result-item" data-id="${escapeHtml(structure.id)}" style="border-left: 3px solid ${this.settingsManager.getSystemColor(structure.system)};">
          <span class="tree-item-name">${escapeHtml(this.settingsManager.getLabel(structure))}</span>
          <span class="note-system">${escapeHtml(systemLabel(structure.system))}</span>
        </div>`).join("");
    container.querySelectorAll<HTMLElement>(".search-result-item").forEach(item => {
      item.addEventListener("click", () => this.selectStructure(item.dataset.id!));
    });
  }

  // --- Strukturbaum -------------------------------------------------------

  private treeCallbacks: TreeCallbacks | null = null;

  renderStructureTree(structures: Structure[], callbacks: TreeCallbacks, initiallyVisibleSystems: BodySystem[] = []): void {
    this.treeCallbacks = callbacks;
    this.tree.render(structures, callbacks, initiallyVisibleSystems);
  }

  resetCuttingControls(): void {
    this.tree.cutting.reset();
  }

  resetLayerControls(): void {
    this.tree.layers.reset();
  }

  setLayerStatus(system: BodySystem, status: LayerStatus): void {
    this.tree.setLayerStatus(system, status);
  }

  setSystemOpacity(system: BodySystem, opacity: number): void {
    this.tree.setSystemOpacity(system, opacity);
  }

  setSystemVisibility(system: BodySystem, visible: boolean): void {
    this.tree.setSystemVisibility(system, visible);
  }

  syncStructureVisibility(visibility: Map<string, boolean>): void {
    this.tree.syncVisibility(visibility);
  }

  // --- Auswahl & Info-Panel -----------------------------------------------

  selectStructure(id: string): void {
    const structure = this.dataManager.getStructureSync(id);
    if (!structure) return;
    this.currentStructure = structure;
    this.tree.markSelected(id);
    this.treeCallbacks?.onSelect(id);
    this.infoPanel.open();
    this.infoPanel.show(structure);
  }

  clearStructureSelection(): void {
    this.currentStructure = null;
    this.tree.markSelected(null);
    this.infoPanel.clear();
  }

  getCurrentStructure(): Structure | null {
    return this.currentStructure;
  }

  togglePanel(): void {
    this.infoPanel.toggle();
  }

  // --- Rückmeldungen --------------------------------------------------------

  showHoverLabel(structure: Structure, x: number, y: number): void {
    if (this.settingsManager.get("showLabels")) this.hoverLabel.show(this.settingsManager.getLabel(structure), x, y);
  }

  hideHoverLabel(): void {
    this.hoverLabel.hide();
  }

  showLoading(text: string): void {
    feedback.showLoading(text);
  }

  updateLoadingProgress(percent: number): void {
    feedback.updateLoadingProgress(percent);
  }

  hideLoading(): void {
    feedback.hideLoading();
  }

  showError(message: string): void {
    feedback.showToast(message, "error");
  }

  showToast(message: string, type: feedback.ToastType = "success"): void {
    feedback.showToast(message, type);
  }

  showModal(html: string, onOpen?: (modal: HTMLElement) => void): void {
    feedback.showModal(html, onOpen);
  }

  closeModal(): void {
    feedback.closeModal();
  }
}
