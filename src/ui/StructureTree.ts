import { BodySystem, CuttingAxis, Structure } from "../types";
import { DataManager } from "../utils/DataManager";
import { SettingsManager } from "../utils/SettingsManager";
import { escapeHtml } from "../utils/text";
import { LAYERED_SYSTEMS, STRUCTURE_LAYERS, SYSTEM_LABELS, SYSTEM_ORDER, sortByOrder } from "./constants";
import { CuttingControls } from "./CuttingControls";
import { LayerControls, LayerPeelCallback, LayerStatus } from "./LayerControls";
import {
  areaLabel,
  countChildrenByParent,
  groupArea,
  groupByRegion,
  groupBySystem,
  matchLayerFilter,
  parentGroupLabel,
} from "./treeModel";

export interface TreeCallbacks {
  onSelect: (id: string) => void;
  onVisibility: (id: string, visible: boolean) => void;
  onOpacity: (system: BodySystem, opacity: number) => void;
  onSystemToggle: (system: BodySystem, visible: boolean) => void;
  onStructureLayerToggle: (system: BodySystem, ids: string[], visible: boolean) => void;
  onCuttingPlaneChange: (axis: CuttingAxis, enabled: boolean, progress: number) => void;
  onLayerPeel: LayerPeelCallback;
}

const FILTER_RESULT_LIMIT = 100;
const MAX_INDIVIDUAL_ITEMS = 12;

/** Linke Seitenleiste: Systeme → Regionen → Gruppen → Strukturen, plus Schnitt- und Schichtsteuerung. */
export class StructureTree {
  private callbacks: TreeCallbacks | null = null;
  private structuresBySystem = new Map<BodySystem, Structure[]>();
  private systemVisibility = new Map<BodySystem, boolean>();
  private systemOpacities = new Map<BodySystem, number>();
  private structureVisibility = new Map<string, boolean>();
  private events: AbortController | null = null;
  readonly cutting = new CuttingControls();
  readonly layers = new LayerControls();

  constructor(
    private readonly dataManager: DataManager,
    private readonly settingsManager: SettingsManager,
    private readonly onItemClick: (id: string) => void
  ) {}

  private get container(): HTMLElement {
    return document.getElementById("structure-tree")!;
  }

  getVisibleSystems(): BodySystem[] {
    return [...this.systemVisibility].filter(([, visible]) => visible).map(([system]) => system);
  }

  hasCallbacks(): boolean {
    return this.callbacks !== null;
  }

  render(structures: Structure[], callbacks: TreeCallbacks, initiallyVisibleSystems: BodySystem[] = []): void {
    this.callbacks = callbacks;
    this.cutting.setCallback(callbacks.onCuttingPlaneChange);
    this.layers.setCallback(callbacks.onLayerPeel);
    this.structuresBySystem = groupBySystem(structures);
    this.systemVisibility = new Map(initiallyVisibleSystems.map(system => [system, true]));
    const systems = sortByOrder([...this.structuresBySystem.keys()], SYSTEM_ORDER);

    this.container.innerHTML = `
      <div class="tree-overview">
        <span>Systeme und Gewebe</span>
        <span>${structures.length.toLocaleString("de-DE")} Strukturen</span>
      </div>
      ${this.cutting.render()}
      ${systems.map(system => this.renderSystem(system)).join("")}
    `;
    LAYERED_SYSTEMS.forEach(system => this.layers.sync(system));
    this.syncVisibilityControls();
    this.bindEvents();
  }

  private renderSystem(system: BodySystem): string {
    const structures = this.structuresBySystem.get(system)!;
    const label = SYSTEM_LABELS[system];
    const layered = LAYERED_SYSTEMS.includes(system);
    const opacity = Math.round((this.systemOpacities.get(system) ?? 1) * 100);
    return `
      <section class="tree-group${layered ? " tree-group-layered" : ""}" data-system="${system}">
        <div class="tree-group-header">
          <input type="checkbox" class="tree-group-visibility" data-system="${system}" ${this.systemVisibility.get(system) ? "checked" : ""} aria-label="${label} einblenden">
          <div class="tree-group-color" style="background: ${this.settingsManager.getSystemColor(system)}"></div>
          <button type="button" class="tree-group-toggle" aria-expanded="false">
            <span class="tree-group-name">${label}</span>
            <span class="tree-group-count">${structures.length.toLocaleString("de-DE")}</span>
          </button>
          ${layered ? "" : `<input type="range" class="tree-group-opacity" data-system="${system}" min="0" max="100" step="1" value="${opacity}" aria-label="${label} Deckkraft" title="${label} Deckkraft">`}
        </div>
        ${layered ? this.layers.render(system) : ""}
        <div class="tree-group-children" hidden></div>
      </section>`;
  }

  private bindEvents(): void {
    this.events?.abort();
    this.events = new AbortController();
    const { signal } = this.events;
    const container = this.container;
    this.cutting.bind(container, signal);
    this.layers.bind(container, signal);
    container.addEventListener("click", event => this.handleClick(event), { signal });
    container.addEventListener("change", event => this.handleChange(event), { signal });
    container.addEventListener("input", event => {
      const target = event.target as HTMLInputElement;
      if (!target.classList.contains("tree-group-opacity")) return;
      const system = target.dataset.system as BodySystem;
      const opacity = target.valueAsNumber / 100;
      this.systemOpacities.set(system, opacity);
      this.callbacks?.onOpacity(system, opacity);
    }, { signal });
  }

  private handleClick(event: Event): void {
    const target = event.target as HTMLElement;

    const groupToggle = target.closest<HTMLButtonElement>(".tree-group-toggle");
    if (groupToggle) {
      const group = groupToggle.closest<HTMLElement>(".tree-group")!;
      const expanded = groupToggle.getAttribute("aria-expanded") !== "true";
      this.setGroupExpanded(group, expanded);
      const children = group.querySelector<HTMLElement>(".tree-group-children")!;
      if (expanded && children.dataset.rendered !== "true") {
        const system = group.dataset.system as BodySystem;
        children.innerHTML = this.renderGroupContent(system, this.structuresBySystem.get(system) ?? [], false);
        children.dataset.rendered = "true";
        this.syncVisibilityControls();
      }
      return;
    }

    const nestedToggle = target.closest<HTMLButtonElement>(".tree-area-toggle, .tree-subgroup-toggle");
    if (nestedToggle) {
      const section = nestedToggle.closest<HTMLElement>(".tree-area, .tree-subgroup")!;
      const expanded = nestedToggle.getAttribute("aria-expanded") !== "true";
      nestedToggle.setAttribute("aria-expanded", String(expanded));
      section.querySelector<HTMLElement>(".tree-area-children, .tree-subgroup-children")!.hidden = !expanded;
      section.classList.toggle("expanded", expanded);
      return;
    }

    const actionButton = target.closest<HTMLElement>(".add-note, .add-bookmark");
    if (actionButton) {
      event.stopPropagation();
      const action = actionButton.classList.contains("add-note") ? "add-note" : "toggle-bookmark";
      window.dispatchEvent(new CustomEvent(action, { detail: actionButton.dataset.id }));
      return;
    }

    if (target.closest(".tree-item-actions, input, button, .layer-peel, .cut-controls")) return;
    const item = target.closest<HTMLElement>(".tree-item");
    if (item?.dataset.id) this.onItemClick(item.dataset.id);
  }

  private handleChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    const group = target.closest<HTMLElement>(".tree-group");
    const system = group?.dataset.system as BodySystem | undefined;

    if (target.classList.contains("tree-item-visibility")) {
      const id = target.closest<HTMLElement>(".tree-item")?.dataset.id;
      if (!id || !system || !group) return;
      if (target.checked) this.activateSystemExclusively(system, group);
      this.structureVisibility.set(id, target.checked);
      this.callbacks?.onVisibility(id, target.checked);
      this.syncVisibilityControls();
      return;
    }

    if (target.classList.contains("tree-layer-visibility")) {
      if (!system || !group) return;
      const ids = JSON.parse(target.dataset.structureIds || "[]") as string[];
      if (target.checked) this.activateSystemExclusively(system, group);
      ids.forEach(id => this.structureVisibility.set(id, target.checked));
      this.callbacks?.onStructureLayerToggle(system, ids, target.checked);
      this.syncVisibilityControls();
      return;
    }

    if (target.classList.contains("tree-group-visibility") && system) {
      this.systemVisibility.set(system, target.checked);
      target.indeterminate = false;
      this.callbacks?.onSystemToggle(system, target.checked);
    }
  }

  /**
   * Wird in einem ausgeblendeten System eine einzelne Struktur eingeblendet,
   * bleiben alle anderen Strukturen dieses Systems zunächst verborgen.
   */
  private activateSystemExclusively(system: BodySystem, group: HTMLElement): void {
    if (this.systemVisibility.get(system)) return;
    (this.structuresBySystem.get(system) ?? []).forEach(structure => this.structureVisibility.set(structure.id, false));
    this.systemVisibility.set(system, true);
    const checkbox = group.querySelector<HTMLInputElement>(".tree-group-visibility");
    if (checkbox) checkbox.checked = true;
  }

  filter(query: string): void {
    const lower = query.trim().toLowerCase();
    this.container.querySelectorAll<HTMLElement>(".tree-group").forEach(group => {
      const system = group.dataset.system as BodySystem;
      const structures = this.structuresBySystem.get(system) ?? [];
      const labelMatches = Boolean(lower) && (SYSTEM_LABELS[system].toLowerCase().includes(lower) || system.includes(lower));
      const matches = lower && !labelMatches
        ? structures.filter(structure =>
          this.settingsManager.getLabel(structure).toLowerCase().includes(lower) ||
          structure.id.toLowerCase().includes(lower))
        : [];
      const visible = !lower || labelMatches || matches.length > 0;
      group.hidden = !visible;

      const children = group.querySelector<HTMLElement>(".tree-group-children")!;
      if (lower && visible) {
        this.setGroupExpanded(group, true);
        const shown = labelMatches ? structures : matches.slice(0, FILTER_RESULT_LIMIT);
        children.innerHTML = this.renderGroupContent(system, shown, !labelMatches);
        children.dataset.rendered = "true";
        const remaining = labelMatches ? 0 : matches.length - FILTER_RESULT_LIMIT;
        if (remaining > 0) {
          children.insertAdjacentHTML("beforeend", `<p class="tree-result-limit">Bitte Suche eingrenzen. Weitere Treffer: ${remaining}+</p>`);
        }
      } else if (!lower) {
        this.setGroupExpanded(group, false);
        children.innerHTML = "";
        delete children.dataset.rendered;
      }
    });
    this.syncVisibilityControls();
  }

  private renderGroupContent(system: BodySystem, structures: Structure[], expanded: boolean): string {
    const layerHtml = (STRUCTURE_LAYERS[system] ?? []).map(layer => {
      const ids = matchLayerFilter(structures, layer);
      return `
        <label class="tree-layer">
          ${this.renderVisibilityCheckbox(ids, `${layer.label} einblenden`)}
          <span>${layer.label}</span>
          <span class="tree-layer-count">${ids.length}</span>
        </label>`;
    }).join("");

    const parentCounts = countChildrenByParent(structures);
    const areaHtml = groupByRegion(structures)
      .map(([region, items]) => this.renderArea(system, region, items, parentCounts, expanded))
      .join("");

    return `
      ${layerHtml ? `<div class="tree-layer-list">${layerHtml}</div>` : ""}
      <div class="tree-area-list">${areaHtml}</div>`;
  }

  private renderArea(system: BodySystem, region: string, structures: Structure[], parentCounts: Map<string, number>, expanded: boolean): string {
    const label = (structure: Structure) => this.settingsManager.getLabel(structure);
    const { subgroups, individual } = groupArea(system, structures, parentCounts);
    const subgroupHtml = subgroups
      .map(subgroup => ({
        label: parentGroupLabel(subgroup.parentId, this.dataManager.getStructureSync(subgroup.parentId), label),
        structures: subgroup.structures,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "de"))
      .map(subgroup => this.renderSubgroup(subgroup.label, subgroup.structures, expanded))
      .join("");
    const individualHtml = individual.length > MAX_INDIVIDUAL_ITEMS
      ? this.renderSubgroup("Weitere Einzelstrukturen", individual, expanded)
      : this.renderItems(individual);
    const title = areaLabel(system, region);

    return `
      <section class="tree-area">
        <div class="tree-area-header">
          ${this.renderVisibilityCheckbox(structures.map(structure => structure.id), `${title} einblenden`)}
          <button type="button" class="tree-area-toggle" aria-expanded="${expanded}">
            <span class="tree-area-name">${escapeHtml(title)}</span>
            <span class="tree-group-count">${structures.length.toLocaleString("de-DE")}</span>
          </button>
        </div>
        <div class="tree-area-children"${expanded ? "" : " hidden"}>${subgroupHtml}${individualHtml}</div>
      </section>`;
  }

  private renderSubgroup(label: string, structures: Structure[], expanded: boolean): string {
    return `
      <section class="tree-subgroup">
        <div class="tree-subgroup-header">
          ${this.renderVisibilityCheckbox(structures.map(structure => structure.id), `${label} einblenden`)}
          <button type="button" class="tree-subgroup-toggle" aria-expanded="${expanded}">
            <span class="tree-subgroup-name">${escapeHtml(label)}</span>
            <span class="tree-group-count">${structures.length.toLocaleString("de-DE")}</span>
          </button>
        </div>
        <div class="tree-subgroup-children"${expanded ? "" : " hidden"}>${this.renderItems(structures)}</div>
      </section>`;
  }

  private renderItems(structures: Structure[]): string {
    return `
      <div class="tree-structure-list">
        ${structures.map(structure => {
          const label = escapeHtml(this.settingsManager.getLabel(structure));
          const id = escapeHtml(structure.id);
          return `
            <div class="tree-item" data-id="${id}">
              <input type="checkbox" class="tree-item-visibility" ${this.isVisible(structure.id) ? "checked" : ""} aria-label="${label} einblenden">
              <span class="tree-item-name">${label}</span>
              <div class="tree-item-actions">
                <button class="btn-icon add-note" title="Notiz hinzufügen" data-id="${id}">📝</button>
                <button class="btn-icon add-bookmark" title="Lesezeichen" data-id="${id}">🔖</button>
              </div>
            </div>`;
        }).join("")}
      </div>`;
  }

  private renderVisibilityCheckbox(ids: string[], label: string): string {
    const visible = ids.length > 0 && ids.every(id => this.isVisible(id));
    return `<input type="checkbox" class="tree-layer-visibility" data-structure-ids="${escapeHtml(JSON.stringify(ids))}" aria-label="${escapeHtml(label)}" ${visible ? "checked" : ""}>`;
  }

  private isVisible(id: string): boolean {
    const known = this.structureVisibility.get(id);
    if (known !== undefined) return known;
    const structure = this.dataManager.getStructureSync(id);
    return structure ? this.systemVisibility.get(structure.system) ?? false : false;
  }

  /** Übernimmt die tatsächliche Sichtbarkeit aus dem Atlas und aktualisiert alle Checkboxen. */
  syncVisibility(visibility: Map<string, boolean>): void {
    visibility.forEach((visible, id) => this.structureVisibility.set(id, visible));
    this.syncVisibilityControls();
  }

  syncVisibilityControls(): void {
    const container = this.container;
    container.querySelectorAll<HTMLElement>(".tree-item").forEach(item => {
      const visible = this.isVisible(item.dataset.id!);
      item.classList.toggle("hidden", !visible);
      const checkbox = item.querySelector<HTMLInputElement>(".tree-item-visibility");
      if (checkbox) checkbox.checked = visible;
    });

    container.querySelectorAll<HTMLInputElement>(".tree-layer-visibility").forEach(checkbox => {
      const ids = JSON.parse(checkbox.dataset.structureIds || "[]") as string[];
      const visibleCount = ids.filter(id => this.isVisible(id)).length;
      checkbox.checked = ids.length > 0 && visibleCount === ids.length;
      checkbox.indeterminate = visibleCount > 0 && visibleCount < ids.length;
    });

    container.querySelectorAll<HTMLInputElement>(".tree-group-visibility").forEach(checkbox => {
      const system = checkbox.dataset.system as BodySystem;
      const structures = this.structuresBySystem.get(system) ?? [];
      const visibleCount = structures.filter(structure => this.isVisible(structure.id)).length;
      if (this.systemVisibility.get(system) && visibleCount === 0) this.systemVisibility.set(system, false);
      const systemVisible = this.systemVisibility.get(system) ?? false;
      checkbox.checked = systemVisible && structures.length > 0 && visibleCount === structures.length;
      checkbox.indeterminate = systemVisible && visibleCount > 0 && visibleCount < structures.length;
    });
  }

  setSystemVisibility(system: BodySystem, visible: boolean): void {
    this.systemVisibility.set(system, visible);
  }

  setSystemOpacity(system: BodySystem, opacity: number): void {
    this.systemOpacities.set(system, opacity);
    const slider = this.container.querySelector<HTMLInputElement>(`.tree-group-opacity[data-system="${system}"]`);
    if (slider) slider.value = String(Math.round(opacity * 100));
  }

  setLayerStatus(system: BodySystem, status: LayerStatus): void {
    this.layers.setStatus(system, status);
  }

  markSelected(id: string | null): void {
    this.container.querySelectorAll<HTMLElement>(".tree-item").forEach(item => {
      item.classList.toggle("selected", item.dataset.id === id);
    });
  }

  private setGroupExpanded(group: HTMLElement, expanded: boolean): void {
    group.querySelector<HTMLButtonElement>(".tree-group-toggle")!.setAttribute("aria-expanded", String(expanded));
    group.querySelector<HTMLElement>(".tree-group-children")!.hidden = !expanded;
    group.classList.toggle("expanded", expanded);
  }
}
