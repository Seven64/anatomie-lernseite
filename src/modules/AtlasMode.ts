import * as THREE from "three";
import { DataManager } from "../utils/DataManager";
import { UIManager } from "../utils/UIManager";
import { SettingsManager } from "../utils/SettingsManager";
import { BodySystem, CuttingAxis, Structure } from "../types";
import { INITIALLY_HIDDEN, LAYERED_SYSTEMS, SYSTEM_LABELS } from "../ui/constants";
import { computeVisibleBounds, createHighlightMaterial, fitDistance, readCssColor } from "../utils/three";
import { AtlasScene } from "./atlas/AtlasScene";
import { ModelRegistry } from "./atlas/ModelRegistry";
import { CuttingPlanes } from "./atlas/CuttingPlanes";
import { ViewCube } from "./atlas/ViewCube";
import { loadOrComputeLayers } from "./atlas/layerCache";
import { countPerLayer } from "./atlas/layerAssignment";

interface AtlasRuntime {
  view: AtlasScene;
  models: ModelRegistry;
  cutting: CuttingPlanes;
  viewCube: ViewCube;
  highlight: THREE.MeshStandardMaterial;
  ghost: THREE.MeshStandardMaterial;
  events: AbortController;
}

interface PeelState {
  depth: number;
  ghost: boolean;
}

const LOADING_HTML = `
  <div class="loading-overlay atlas-loading" style="display: none;" role="status" aria-live="polite">
    <div class="loading-spinner"></div>
    <div class="loading-text">Lade 3D-Modell …</div>
    <div class="loading-progress"><span class="loading-progress-bar"></span></div>
  </div>`;
const CLICK_TOLERANCE_PX = { mouse: 5, pen: 8, touch: 12 } as const;
const INITIAL_SYSTEM: BodySystem = "skeletal";

/**
 * 3D-Atlas: lädt Systeme, steuert Sichtbarkeit, Deckkraft, Muskelschichten,
 * Schnittebenen und Auswahl. Alle Sichtbarkeitsänderungen laufen über {@link refresh}.
 */
export class AtlasMode {
  private rt: AtlasRuntime | null = null;
  private readonly systemVisibility = new Map<BodySystem, boolean>();
  private readonly hiddenIds = new Set<string>();
  private readonly peel = new Map<BodySystem, PeelState>();
  private readonly layerOf = new Map<string, number>();
  private layerJobs = new Map<BodySystem, Promise<void>>();
  private layerAbort = new AbortController();
  private selectedId: string | null = null;
  private pendingHover: PointerEvent | null = null;
  private pointerDown: { x: number; y: number; type: string } | null = null;
  private readonly raycaster = new THREE.Raycaster();

  constructor(
    private readonly dataManager: DataManager,
    private readonly uiManager: UIManager,
    private readonly settingsManager: SettingsManager
  ) {}

  setActive(active: boolean): void {
    if (active) this.activate();
    else this.deactivate();
  }

  // --- Lebenszyklus -------------------------------------------------------

  private activate(): void {
    const container = document.getElementById("canvas-container")!;
    container.insertAdjacentHTML("beforeend", LOADING_HTML);

    const view = new AtlasScene(container, this.settingsManager);
    const cutting = new CuttingPlanes(readCssColor("--accent-primary", "#594bd2"));
    view.scene.add(cutting.helpers);
    const models = new ModelRegistry(this.dataManager, cutting.planes);
    const viewCube = new ViewCube(container, view.camera, view.controls, () => this.frameVisible("home"));
    const ghost = new THREE.MeshStandardMaterial({
      color: 0xb7c1d6, transparent: true, opacity: 0.12, depthWrite: false, clippingPlanes: cutting.planes,
    });
    this.rt = { view, models, cutting, viewCube, highlight: createHighlightMaterial(cutting.planes), ghost, events: new AbortController() };

    view.onFrame(now => {
      cutting.updateHelpers(now);
      viewCube.update();
      this.processHover();
    });
    this.bindEvents();

    this.systemVisibility.clear();
    this.hiddenIds.clear();
    this.peel.clear();
    this.selectedId = null;
    this.layerAbort = new AbortController();
    this.layerJobs = new Map();

    this.uiManager.setActiveSidebarTab("tree");
    this.renderTree();
    this.uiManager.resetCuttingControls();
    this.uiManager.resetLayerControls();
    LAYERED_SYSTEMS.forEach(system => this.uiManager.setLayerStatus(system, { kind: "idle" }));
    view.start();
    void this.onSystemToggled(INITIAL_SYSTEM, true);
  }

  private deactivate(): void {
    const rt = this.rt;
    if (!rt) return;
    this.rt = null;
    this.layerAbort.abort();
    rt.events.abort();
    this.uiManager.hideHoverLabel();
    rt.viewCube.dispose();
    rt.cutting.dispose();
    rt.models.dispose();
    rt.highlight.dispose();
    rt.ghost.dispose();
    rt.view.dispose();
    document.getElementById("canvas-container")!.innerHTML = "";
  }

  private renderTree(): void {
    this.uiManager.renderStructureTree(this.dataManager.getAllStructures(), {
      onSelect: id => void this.select(id),
      onVisibility: (id, visible) => {
        const structure = this.dataManager.getStructureSync(id);
        if (structure) void this.setStructuresVisible(structure.system, [id], visible);
      },
      onStructureLayerToggle: (system, ids, visible) => void this.setStructuresVisible(system, ids, visible),
      onSystemToggle: (system, visible) => void this.onSystemToggled(system, visible),
      onOpacity: (system, opacity) => this.rt?.models.setOpacity(system, opacity),
      onCuttingPlaneChange: (axis, enabled, progress) => this.setCuttingPlane(axis, enabled, progress),
      onLayerPeel: (system, depth, ghost) => {
        this.peel.set(system, { depth, ghost });
        this.refresh();
      },
    }, [INITIAL_SYSTEM]);
  }

  private bindEvents(): void {
    const rt = this.rt!;
    const canvas = rt.view.renderer.domElement;
    const { signal } = rt.events;

    canvas.addEventListener("pointermove", event => { this.pendingHover = event; }, { signal });
    canvas.addEventListener("pointerleave", () => {
      this.pendingHover = null;
      this.uiManager.hideHoverLabel();
      canvas.style.cursor = "grab";
    }, { signal });
    canvas.addEventListener("pointerdown", event => {
      this.pointerDown = { x: event.clientX, y: event.clientY, type: event.pointerType };
    }, { signal });
    canvas.addEventListener("click", event => {
      // Nach dem Drehen/Verschieben der Ansicht keine Struktur auswählen.
      const start = this.pointerDown;
      const tolerance = CLICK_TOLERANCE_PX[(start?.type ?? "mouse") as keyof typeof CLICK_TOLERANCE_PX] ?? 5;
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > tolerance) return;
      const hit = this.pick(event);
      if (hit) this.uiManager.selectStructure(hit.structure.id);
    }, { signal });
    rt.view.controls.onDoubleActivate = (x, y) => this.focusAt(x, y);
    rt.view.controls.onInteraction = () => this.uiManager.hideHoverLabel();
    window.addEventListener("theme-applied", () => {
      rt.view.updateBackground();
      rt.viewCube.applyTheme();
    }, { signal });
  }

  // --- Laden ---------------------------------------------------------------

  private async ensureLoaded(system: BodySystem): Promise<THREE.Group | null> {
    const rt = this.rt;
    if (!rt) return null;
    const loaded = rt.models.groups.get(system);
    if (loaded) return loaded;

    this.uiManager.showLoading(`Lade ${SYSTEM_LABELS[system]} …`);
    try {
      const group = await rt.models.load(system, percent => this.uiManager.updateLoadingProgress(percent));
      if (this.rt !== rt) return null; // Modus wurde inzwischen verlassen
      if (!group.parent) rt.view.scene.add(group);
      if (LAYERED_SYSTEMS.includes(system)) void this.prepareLayers(system);
      return group;
    } catch (error) {
      console.error(`Failed to load system ${system}:`, error);
      this.uiManager.showError(`Fehler beim Laden: ${SYSTEM_LABELS[system]}`);
      return null;
    } finally {
      this.uiManager.hideLoading();
    }
  }

  /** Schichten aus dem Cache laden oder geometrisch berechnen (einmalig je Modellversion). */
  private prepareLayers(system: BodySystem): Promise<void> {
    const existing = this.layerJobs.get(system);
    if (existing) return existing;
    const rt = this.rt!;
    const signal = this.layerAbort.signal;
    this.uiManager.setLayerStatus(system, { kind: "computing", percent: 0 });

    const job = loadOrComputeLayers(this.dataManager, this.dataManager.getStructuresBySystemSync(system), id => rt.models.meshesOf(id), {
      signal,
      onProgress: percent => this.uiManager.setLayerStatus(system, { kind: "computing", percent }),
    }).then(layers => {
      if (signal.aborted) return;
      Object.entries(layers).forEach(([id, layer]) => this.layerOf.set(id, layer));
      this.uiManager.setLayerStatus(system, { kind: "ready", layerCounts: countPerLayer(Object.values(layers)) });
      this.refresh();
    }).catch(error => {
      this.layerJobs.delete(system);
      if (signal.aborted) return;
      console.error("Failed to compute muscle layers:", error);
      this.uiManager.setLayerStatus(system, { kind: "error" });
    });
    this.layerJobs.set(system, job);
    return job;
  }

  // --- Sichtbarkeit ---------------------------------------------------------

  /**
   * Wendet Sichtbarkeit, Schichten, Auswahl und Materialien auf alle geladenen Meshes an
   * und aktualisiert Schnittgrenzen sowie die Checkboxen im Baum.
   */
  private refresh(): void {
    const rt = this.rt;
    if (!rt) return;
    const bounds = new THREE.Box3();

    rt.models.groups.forEach((group, system) => {
      group.visible = this.systemVisibility.get(system) ?? false;
      const peel = this.peel.get(system);
      for (const structure of this.dataManager.getStructuresBySystemSync(system)) {
        const meshes = rt.models.meshesOf(structure.id);
        if (meshes.length === 0) continue;
        const shown = !this.hiddenIds.has(structure.id);
        const peeled = shown && Boolean(peel && peel.depth > 0) && (this.layerOf.get(structure.id) ?? Infinity) < peel!.depth;
        for (const mesh of meshes) {
          mesh.visible = shown && (!peeled || peel!.ghost);
          mesh.userData.peeled = peeled;
          mesh.material = peeled ? rt.ghost : structure.id === this.selectedId ? rt.highlight : mesh.userData.originalMaterial;
          if (shown && group.visible) bounds.expandByObject(mesh);
        }
      }
    });

    rt.cutting.setBounds(bounds);
    this.syncTree();
  }

  private syncTree(): void {
    const visibility = new Map<string, boolean>();
    const visibleCount = new Map<BodySystem, number>();
    for (const structure of this.dataManager.getAllStructures()) {
      const visible = (this.systemVisibility.get(structure.system) ?? false) && !this.hiddenIds.has(structure.id);
      visibility.set(structure.id, visible);
      if (visible) visibleCount.set(structure.system, (visibleCount.get(structure.system) ?? 0) + 1);
    }
    this.systemVisibility.forEach((visible, system) => {
      if (visible && !visibleCount.get(system)) {
        this.systemVisibility.set(system, false);
        const group = this.rt?.models.groups.get(system);
        if (group) group.visible = false;
      }
    });
    this.uiManager.syncStructureVisibility(visibility);
  }

  /** Blendet alle Strukturen eines Systems aus, bevor einzelne eingeblendet werden. */
  private activateSystemExclusively(system: BodySystem): void {
    if (this.systemVisibility.get(system)) return;
    this.dataManager.getStructuresBySystemSync(system).forEach(structure => this.hiddenIds.add(structure.id));
    this.systemVisibility.set(system, true);
    this.uiManager.setSystemVisibility(system, true);
  }

  private async setStructuresVisible(system: BodySystem, ids: string[], visible: boolean): Promise<void> {
    if (visible) this.activateSystemExclusively(system);
    ids.forEach(id => (visible ? this.hiddenIds.delete(id) : this.hiddenIds.add(id)));
    if (!visible) {
      this.uiManager.hideHoverLabel();
      if (this.selectedId && ids.includes(this.selectedId)) this.clearSelection();
    }
    this.refresh();
    if (visible && await this.ensureLoaded(system)) {
      this.refresh();
      this.frameIfIsolated(system);
    }
  }

  async onSystemToggled(system: BodySystem, visible: boolean): Promise<void> {
    const wasVisible = this.systemVisibility.get(system) ?? false;
    this.systemVisibility.set(system, visible);
    this.uiManager.setSystemVisibility(system, visible);
    // Beim ersten Einblenden verdeckende Hüllen (z. B. Faszien) zunächst verbergen;
    // ein erneuter Klick auf das teilweise sichtbare System zeigt dann alles.
    const initiallyHidden = !wasVisible ? INITIALLY_HIDDEN[system] : undefined;
    this.dataManager.getStructuresBySystemSync(system).forEach(structure => {
      const hide = !visible || Boolean(initiallyHidden?.test(structure.nameLatin));
      if (hide) this.hiddenIds.add(structure.id);
      else this.hiddenIds.delete(structure.id);
    });
    if (!visible) {
      this.uiManager.hideHoverLabel();
      const selected = this.selectedId ? this.dataManager.getStructureSync(this.selectedId) : undefined;
      if (selected?.system === system) this.clearSelection();
    }
    this.refresh();

    if (visible) {
      if (await this.ensureLoaded(system)) {
        this.refresh();
        this.frameIfIsolated(system);
      }
    } else {
      const remaining = [...this.systemVisibility].filter(([, isVisible]) => isVisible);
      if (remaining.length === 1) this.frameIfIsolated(remaining[0][0]);
    }
  }

  private frameIfIsolated(system: BodySystem): void {
    const others = [...this.systemVisibility].some(([other, visible]) => other !== system && visible);
    if (!others) this.frameVisible("keep");
  }

  /**
   * Kamera animiert auf alle sichtbaren Strukturen ausrichten.
   * „home“ = Vorderansicht, „keep“ = aktuelle Blickrichtung beibehalten.
   */
  private frameVisible(mode: "home" | "keep" = "keep"): void {
    const rt = this.rt;
    if (!rt) return;
    const bounds = new THREE.Box3();
    rt.models.groups.forEach(group => {
      if (group.visible) bounds.union(computeVisibleBounds(group));
    });
    this.flyToBounds(bounds, mode);
  }

  private flyToBounds(bounds: THREE.Box3, mode: "home" | "keep", padding?: number): void {
    const rt = this.rt;
    if (!rt || bounds.isEmpty()) return;
    const { camera, controls } = rt.view;
    controls.flyTo({
      target: bounds.getCenter(new THREE.Vector3()),
      distance: fitDistance(camera, bounds, padding ?? rt.view.framingPadding),
      ...(mode === "home" ? { direction: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0) } : {}),
    });
  }

  /** Doppelklick/-tipp: auf die getroffene Struktur fokussieren, sonst alles einpassen. */
  private focusAt(clientX: number, clientY: number): void {
    const hit = this.pick(new MouseEvent("dblclick", { clientX, clientY }));
    if (!hit || !this.rt) {
      this.frameVisible("keep");
      return;
    }
    const bounds = new THREE.Box3();
    this.rt.models.meshesOf(hit.structure.id).forEach(mesh => bounds.expandByObject(mesh));
    this.flyToBounds(bounds, "keep", 2.2);
  }

  // --- Schnitt, Auswahl, Picking ------------------------------------------

  setCuttingPlane(axis: CuttingAxis, enabled: boolean, progress: number): void {
    const rt = this.rt;
    if (!rt) return;
    rt.cutting.set(axis, enabled, progress);
    rt.view.renderer.localClippingEnabled = rt.cutting.anyEnabled;
    this.uiManager.hideHoverLabel();
  }

  private async select(id: string): Promise<void> {
    const structure = this.dataManager.getStructureSync(id);
    if (!structure || !this.rt) return;
    this.selectedId = id;
    if (!this.systemVisibility.get(structure.system) || this.hiddenIds.has(id)) {
      await this.setStructuresVisible(structure.system, [id], true);
    } else {
      this.refresh();
    }
  }

  private clearSelection(): void {
    this.selectedId = null;
    this.uiManager.clearStructureSelection();
  }

  private processHover(): void {
    const event = this.pendingHover;
    const rt = this.rt;
    if (!event || !rt) return;
    this.pendingHover = null;
    const hit = this.pick(event);
    rt.view.renderer.domElement.style.cursor = hit ? "pointer" : "grab";
    if (hit) this.uiManager.showHoverLabel(hit.structure, hit.x, hit.y);
    else this.uiManager.hideHoverLabel();
  }

  private pick(event: MouseEvent): { structure: Structure; x: number; y: number } | null {
    const rt = this.rt;
    if (!rt) return null;
    const visibleGroups = [...rt.models.groups.values()].filter(group => group.visible);
    this.raycaster.setFromCamera(rt.view.toPointer(event), rt.view.camera);

    for (const intersection of this.raycaster.intersectObjects(visibleGroups, true)) {
      const mesh = intersection.object;
      if (!mesh.visible || mesh.userData.peeled || !mesh.parent?.visible) continue;
      if (rt.cutting.isClipped(intersection.point)) continue;
      const structureId = mesh.userData.structureId as string | undefined;
      const structure = structureId ? this.dataManager.getStructureSync(structureId) : undefined;
      if (!structure) continue;
      const rect = rt.view.renderer.domElement.getBoundingClientRect();
      return { structure, x: event.clientX - rect.left, y: event.clientY - rect.top };
    }
    return null;
  }

  // --- Aktionen aus dem Info-Panel -----------------------------------------

  isolateStructure(structure: { id: string }): void {
    const selected = this.dataManager.getStructureSync(structure.id);
    if (!selected || !this.rt) return;
    this.uiManager.hideHoverLabel();
    this.systemVisibility.forEach((_, system) => this.systemVisibility.set(system, false));
    this.systemVisibility.set(selected.system, true);
    this.hiddenIds.clear();
    this.dataManager.getAllStructures().forEach(item => {
      if (item.id !== selected.id) this.hiddenIds.add(item.id);
    });
    this.peel.delete(selected.system);
    this.uiManager.resetLayerControls();
    this.refresh();
    this.frameVisible("keep");
  }

  hideStructure(structure: { id: string }): void {
    const selected = this.dataManager.getStructureSync(structure.id);
    if (selected) void this.setStructuresVisible(selected.system, [selected.id], false);
  }

  resetView(): void {
    const rt = this.rt;
    if (!rt) return;
    this.uiManager.hideHoverLabel();
    this.uiManager.resetCuttingControls();
    this.uiManager.resetLayerControls();
    this.peel.clear();
    this.hiddenIds.clear();
    rt.models.groups.forEach((_, system) => {
      this.systemVisibility.set(system, true);
      this.uiManager.setSystemVisibility(system, true);
      rt.models.setOpacity(system, 1);
      this.uiManager.setSystemOpacity(system, 1);
    });
    this.refresh();
    this.frameVisible("home");
  }
}
