import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { DataManager } from "../utils/DataManager";
import { UIManager } from "../utils/UIManager";
import { SettingsManager } from "../utils/SettingsManager";
import { Structure, BodySystem, CuttingAxis } from "../types";
import { DRACO_DECODER_PATH, frameCameraToVisibleMeshes } from "../utils/three";

export class AtlasMode {
  private dataManager: DataManager;
  private uiManager: UIManager;
  private settingsManager: SettingsManager;

  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: OrbitControls;
  private gltfLoader!: GLTFLoader;
  private dracoLoader!: DRACOLoader;

  private loadedModels: Map<BodySystem, THREE.Group> = new Map();
  private structureToMesh: Map<string, THREE.Mesh[]> = new Map();
  private hiddenStructureIds: Set<string> = new Set();
  private systemVisibility: Map<BodySystem, boolean> = new Map();
  private highlightedMesh: THREE.Mesh | null = null;
  private originalMaterials: Map<THREE.Mesh, THREE.Material | THREE.Material[]> = new Map();

  private cuttingPlaneStates: Record<CuttingAxis, {
    coordinate: "x" | "y" | "z";
    enabled: boolean;
    progress: number;
    plane: THREE.Plane;
  }> = {
    vertical: {
      coordinate: "y",
      enabled: false,
      progress: 50,
      plane: new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e6),
    },
    rightLeft: {
      coordinate: "x",
      enabled: false,
      progress: 50,
      plane: new THREE.Plane(new THREE.Vector3(-1, 0, 0), 1e6),
    },
    frontBack: {
      coordinate: "z",
      enabled: false,
      progress: 50,
      plane: new THREE.Plane(new THREE.Vector3(0, 0, -1), 1e6),
    },
  };
  private clippingPlanes: THREE.Plane[] = [
    this.cuttingPlaneStates.vertical.plane,
    this.cuttingPlaneStates.rightLeft.plane,
    this.cuttingPlaneStates.frontBack.plane,
  ];
  private cuttingBounds = new THREE.Box3();
  private activeSystemOpacities: Map<BodySystem, number> = new Map();
  private isActive: boolean = false;
  private animationId: number | null = null;
  private resizeHandler: (() => void) | null = null;
  private sidebarChangeHandler: ((event: Event) => void) | null = null;
  private pointerMoveHandler: ((event: PointerEvent) => void) | null = null;
  private pointerLeaveHandler: (() => void) | null = null;
  private canvasClickHandler: ((event: MouseEvent) => void) | null = null;
  private settingsUnsubscribe: (() => void) | null = null;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private cameraDistance: number = 2;

  constructor(dataManager: DataManager, uiManager: UIManager, settingsManager: SettingsManager) {
    this.dataManager = dataManager;
    this.uiManager = uiManager;
    this.settingsManager = settingsManager;
  }

  setActive(active: boolean): void {
    this.isActive = active;
    if (active) {
      this.cuttingBounds.makeEmpty();
      this.initThreeJS();
      this.bindEvents();
      this.uiManager.setActiveSidebarTab("tree");
      this.renderStructureTree();
      this.animate();
      void this.loadSystem("skeletal");
    } else {
      this.stopAnimation();
      this.dispose();
    }
  }

  private initThreeJS(): void {
    const container = document.getElementById("canvas-container")!;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.localClippingEnabled = false;
    this.updateCuttingPlanes();
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.updateSceneBackground();

    this.camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 1000);
    this.camera.position.set(0, 0, 2);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 0.3;
    this.controls.maxDistance = 10;
    this.controls.target.set(0, 0, 0);
    this.controls.autoRotate = this.settingsManager.get("autoRotate");
    this.cameraDistance = this.settingsManager.get("cameraDistance");
    this.settingsUnsubscribe = this.settingsManager.subscribe(settings => {
      this.controls.autoRotate = settings.autoRotate;
      const scale = settings.cameraDistance / this.cameraDistance;
      const offset = this.camera.position.clone().sub(this.controls.target).multiplyScalar(scale);
      this.camera.position.copy(this.controls.target).add(offset);
      this.cameraDistance = settings.cameraDistance;
      this.updateSceneBackground();
      this.controls.update();
    });

    this.dracoLoader = new DRACOLoader();
    this.dracoLoader.setDecoderPath(DRACO_DECODER_PATH);

    this.gltfLoader = new GLTFLoader();
    this.gltfLoader.setDRACOLoader(this.dracoLoader);

    this.setupLights();
    this.handleResize();

    this.resizeHandler = () => this.handleResize();
    window.addEventListener("resize", this.resizeHandler);
  }

  private updateSceneBackground(): void {
    const color = getComputedStyle(document.documentElement).getPropertyValue("--bg-primary").trim();
    this.scene.background = new THREE.Color(color || "#f5f7fb");
  }

  private setupLights(): void {
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(5, 10, 7);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 20;
    dirLight.shadow.camera.left = -5;
    dirLight.shadow.camera.right = 5;
    dirLight.shadow.camera.top = 5;
    dirLight.shadow.camera.bottom = -5;
    this.scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
    fillLight.position.set(-5, 0, -5);
    this.scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffffff, 0.2);
    rimLight.position.set(0, -5, 0);
    this.scene.add(rimLight);
  }

  private bindEvents(): void {
    this.sidebarChangeHandler = (e: Event) => {
      const target = e.target as HTMLInputElement;
      if (target.classList.contains("tree-group-opacity")) {
        const systemAttr = target.getAttribute("data-system");
        if (systemAttr) {
          this.setSystemOpacity(systemAttr as BodySystem, target.valueAsNumber / 100);
        }
      }
    };
    document.getElementById("sidebar")!.addEventListener("change", this.sidebarChangeHandler);

    this.pointerMoveHandler = event => {
      const hit = this.pickStructure(event);
      if (!hit) {
        this.uiManager.hideHoverLabel();
        this.renderer.domElement.style.cursor = "grab";
        return;
      }

      this.uiManager.showHoverLabel(hit.structure, hit.x, hit.y);
      this.renderer.domElement.style.cursor = "pointer";
    };
    this.pointerLeaveHandler = () => {
      this.uiManager.hideHoverLabel();
      this.renderer.domElement.style.cursor = "grab";
    };
    this.canvasClickHandler = event => {
      const hit = this.pickStructure(event);
      if (hit) this.uiManager.selectStructure(hit.structure.id);
    };
    this.renderer.domElement.addEventListener("pointermove", this.pointerMoveHandler);
    this.renderer.domElement.addEventListener("pointerleave", this.pointerLeaveHandler);
    this.renderer.domElement.addEventListener("click", this.canvasClickHandler);
  }

  private pickStructure(event: MouseEvent): { structure: Structure; x: number; y: number } | null {
    const canvas = this.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const intersections = this.raycaster.intersectObjects([...this.loadedModels.values()], true);
    for (const intersection of intersections) {
      if (!this.isIntersectionVisible(intersection)) continue;
      if (this.isPointClipped(intersection.point)) continue;

      let object: THREE.Object3D | null = intersection.object;
      while (object && !object.userData.structureId) object = object.parent;
      const structureId = object?.userData.structureId as string | undefined;
      const structure = structureId ? this.dataManager.getStructureSync(structureId) : undefined;
      if (structure) {
        const containerRect = document.getElementById("canvas-container")!.getBoundingClientRect();
        return {
          structure,
          x: event.clientX - containerRect.left,
          y: event.clientY - containerRect.top,
        };
      }
    }

    return null;
  }

  private isIntersectionVisible(intersection: THREE.Intersection): boolean {
    let object: THREE.Object3D | null = intersection.object;
    while (object) {
      if (!object.visible) return false;
      object = object.parent;
    }

    const mesh = intersection.object;
    if (!(mesh instanceof THREE.Mesh)) return true;

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const material = materials[intersection.face?.materialIndex ?? 0];
    return Boolean(material?.visible && material.opacity > 0);
  }

  private handleResize(): void {
    const container = document.getElementById("canvas-container")!;
    this.camera.aspect = container.clientWidth / container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(container.clientWidth, container.clientHeight);
  }

  private animate(): void {
    if (!this.isActive) return;
    this.animationId = requestAnimationFrame(() => this.animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  private stopAnimation(): void {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    this.animationId = null;
  }

  private dispose(): void {
    this.stopAnimation();
    if (this.resizeHandler) {
      window.removeEventListener("resize", this.resizeHandler);
      this.resizeHandler = null;
    }
    if (this.sidebarChangeHandler) {
      document.getElementById("sidebar")?.removeEventListener("change", this.sidebarChangeHandler);
      this.sidebarChangeHandler = null;
    }
    if (this.pointerMoveHandler) {
      this.renderer.domElement.removeEventListener("pointermove", this.pointerMoveHandler);
      this.pointerMoveHandler = null;
    }
    if (this.pointerLeaveHandler) {
      this.renderer.domElement.removeEventListener("pointerleave", this.pointerLeaveHandler);
      this.pointerLeaveHandler = null;
    }
    if (this.canvasClickHandler) {
      this.renderer.domElement.removeEventListener("click", this.canvasClickHandler);
      this.canvasClickHandler = null;
    }
    this.settingsUnsubscribe?.();
    this.settingsUnsubscribe = null;
    this.uiManager.hideHoverLabel();
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.domElement.remove();
    }
    if (this.controls) {
      this.controls.dispose();
    }
    if (this.dracoLoader) {
      this.dracoLoader.dispose();
    }
    if (this.scene) {
      this.scene.clear();
    }
    this.loadedModels.clear();
    this.structureToMesh.clear();
    this.originalMaterials.clear();
    this.activeSystemOpacities.clear();
    this.cuttingBounds.makeEmpty();
  }

  async loadSystem(system: BodySystem): Promise<void> {
    if (this.loadedModels.has(system)) return;

    this.uiManager.showLoading(`Lade ${system}...`);

    try {
      const structures = await this.dataManager.getStructuresBySystem(system);
      const glbFiles = [...new Set(structures.map(s => s.glbFile))];

      const group = new THREE.Group();
      group.name = system;

      for (let i = 0; i < glbFiles.length; i++) {
        const glbFile = glbFiles[i];
        const gltf = await this.gltfLoader.loadAsync(`./models/${glbFile}`);
        gltf.scene.traverse(child => {
          child.userData.atlasGlbFile = glbFile;
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            child.material = this.applyClippingToMaterial(child.material);
            this.originalMaterials.set(child, child.material);
          }
        });
        group.add(gltf.scene);

        this.uiManager.updateLoadingProgress(((i + 1) / glbFiles.length) * 100);
      }

      this.createStructureMeshes(group, structures);
      group.visible = this.systemVisibility.get(system) ?? true;
      if (group.visible && !this.hasOtherVisibleSystem(system)) {
        frameCameraToVisibleMeshes(this.camera, this.controls, group, 1.2 * (this.cameraDistance / 2));
      }
      this.scene.add(group);
      this.loadedModels.set(system, group);
      this.cuttingBounds.union(new THREE.Box3().setFromObject(group));
      this.updateCuttingPlanes();
      const opacity = this.activeSystemOpacities.get(system) ?? 1;
      this.activeSystemOpacities.set(system, opacity);
      if (opacity < 1) this.setSystemOpacity(system, opacity);

      this.uiManager.hideLoading();
    } catch (error) {
      console.error(`Failed to load system ${system}:`, error);
      this.uiManager.hideLoading();
      this.uiManager.showError(`Fehler beim Laden von ${system}`);
    }
  }

  private createStructureMeshes(group: THREE.Group, structures: Structure[]): void {
    const structureKeys = new Set(structures.map(structure => `${structure.glbFile}\0${structure.objectName}`));
    const objectsByKey = new Map<string, THREE.Object3D[]>();
    group.traverse(child => {
      if (child instanceof THREE.Mesh) child.visible = false;
      const objectName = child.userData.atlasObjectName ?? child.userData.name;
      const glbFile = child.userData.atlasGlbFile;
      if (typeof objectName !== "string" || typeof glbFile !== "string") return;

      const key = `${glbFile}\0${objectName}`;
      const objects = objectsByKey.get(key);
      if (objects) objects.push(child);
      else objectsByKey.set(key, [child]);
    });

    structures.forEach(structure => {
      const key = `${structure.glbFile}\0${structure.objectName}`;
      const objects = objectsByKey.get(key);
      if (!objects) return;
      const meshes: THREE.Mesh[] = [];
      const collectMeshes = (object: THREE.Object3D, child: THREE.Object3D): void => {
        const childName = child.userData.atlasObjectName ?? child.userData.name;
        if (child !== object && typeof childName === "string" &&
          structureKeys.has(`${structure.glbFile}\0${childName}`)) return;
        if (child instanceof THREE.Mesh) meshes.push(child);
        child.children.forEach(descendant => collectMeshes(object, descendant));
      };
      objects.forEach(object => collectMeshes(object, object));

      if (meshes.length === 0) return;
      const visible = !this.hiddenStructureIds.has(structure.id);
      meshes.forEach(mesh => {
        mesh.visible = visible;
        mesh.userData.structureId = structure.id;
      });
      this.structureToMesh.set(structure.id, meshes);
    });
  }

  private applyClippingToMaterial(material: THREE.Material | THREE.Material[]): THREE.Material | THREE.Material[] {
    const applyClipping = (mat: THREE.Material): THREE.Material => {
      if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshBasicMaterial || mat instanceof THREE.MeshPhongMaterial) {
        mat.clippingPlanes = this.clippingPlanes;
        mat.clipShadows = true;
      }
      return mat;
    };

    return Array.isArray(material) ? material.map(applyClipping) : applyClipping(material);
  }

  private renderStructureTree(): void {
    const structures = this.dataManager.getAllStructures();
    this.systemVisibility.clear();
    this.systemVisibility.set("skeletal", true);
    this.uiManager.renderStructureTree(
      structures,
      (id) => this.selectStructure(id),
      (id, visible) => this.setStructureVisibility(id, visible),
      (system, opacity) => this.setSystemOpacity(system, opacity),
      (system, visible) => this.onSystemToggled(system, visible),
      (system, ids, visible) => this.setStructureLayerVisibility(system, ids, visible),
      ["skeletal"],
      (axis, enabled, progress) => this.setCuttingPlane(axis, enabled, progress)
    );
  }

  setCuttingPlane(axis: CuttingAxis, enabled: boolean, progress: number): void {
    const state = this.cuttingPlaneStates[axis];
    state.enabled = enabled;
    state.progress = Math.max(0, Math.min(100, progress));
    this.uiManager.hideHoverLabel();
    this.updateCuttingPlanes();
  }

  private updateCuttingPlanes(): void {
    const hasBounds = !this.cuttingBounds.isEmpty();
    Object.values(this.cuttingPlaneStates).forEach(state => {
      if (!state.enabled || !hasBounds) {
        state.plane.constant = 1e6;
        return;
      }

      const min = this.cuttingBounds.min[state.coordinate];
      const max = this.cuttingBounds.max[state.coordinate];
      const position = max - (max - min) * (state.progress / 100);
      const coordinateIndex = state.coordinate === "x" ? 0 : state.coordinate === "y" ? 1 : 2;
      state.plane.constant = -state.plane.normal.getComponent(coordinateIndex) * position;
    });
    if (this.renderer) {
      this.renderer.localClippingEnabled = Object.values(this.cuttingPlaneStates).some(state => state.enabled);
    }
  }

  private isPointClipped(point: THREE.Vector3): boolean {
    return Object.values(this.cuttingPlaneStates).some(
      state => state.enabled && state.plane.distanceToPoint(point) < -1e-5
    );
  }

  private async setStructureLayerVisibility(system: BodySystem, ids: string[], visible: boolean): Promise<void> {
    const systemWasVisible = this.systemVisibility.get(system) ?? false;
    if (visible && !systemWasVisible) {
      this.dataManager.getAllStructures()
        .filter(structure => structure.system === system)
        .forEach(structure => {
          this.hiddenStructureIds.add(structure.id);
          this.structureToMesh.get(structure.id)?.forEach(mesh => {
            mesh.visible = false;
          });
        });
    }
    if (visible) this.systemVisibility.set(system, true);
    if (visible && !this.loadedModels.has(system)) {
      await this.loadSystem(system);
    }
    const group = this.loadedModels.get(system);
    if (visible && group) group.visible = true;
    ids.forEach(id => this.setStructureVisibility(id, visible, false));
    if (group) this.frameSystemIfIsolated(system, group);
    this.updateTreeVisibility();
  }

  private hasOtherVisibleSystem(system: BodySystem): boolean {
    return [...this.loadedModels.entries()].some(([loadedSystem, model]) => loadedSystem !== system && model.visible);
  }

  private frameSystemIfIsolated(system: BodySystem, group: THREE.Group): void {
    if (!this.hasOtherVisibleSystem(system)) {
      frameCameraToVisibleMeshes(this.camera, this.controls, group, 1.2 * (this.cameraDistance / 2));
    }
  }

  selectStructure(id: string): void {
    const meshes = this.structureToMesh.get(id);
    if (!meshes?.length) {
      const structure = this.dataManager.getStructureSync(id);
      if (structure && !this.loadedModels.has(structure.system)) {
        void this.loadSystem(structure.system).then(() => this.selectStructure(id));
      }
      return;
    }

    const mesh = meshes[0];
    if (this.highlightedMesh && this.highlightedMesh !== mesh) {
      this.restoreMaterial(this.highlightedMesh);
    }

    this.highlightedMesh = mesh;
    this.highlightMesh(mesh);
  }

  private highlightMesh(mesh: THREE.Mesh): void {
    this.originalMaterials.set(mesh, mesh.material);
    const highlightMat = new THREE.MeshStandardMaterial({
      color: 0xc89040,
      emissive: 0xc89040,
      emissiveIntensity: 0.3,
      transparent: true,
      opacity: 1,
      clippingPlanes: this.clippingPlanes,
      clipShadows: true,
    });
    mesh.material = highlightMat;
  }

  private restoreMaterial(mesh: THREE.Mesh): void {
    const original = this.originalMaterials.get(mesh);
    if (original) mesh.material = original;
  }

  private clearStructureSelection(): void {
    if (this.highlightedMesh) {
      this.restoreMaterial(this.highlightedMesh);
      this.highlightedMesh = null;
    }
    this.uiManager.clearStructureSelection();
  }

  setStructureVisibility(id: string, visible: boolean, updateTree = true): void {
    const structure = this.dataManager.getStructureSync(id);
    if (visible && structure && !this.systemVisibility.get(structure.system)) {
      this.dataManager.getAllStructures()
        .filter(item => item.system === structure.system)
        .forEach(item => {
          this.hiddenStructureIds.add(item.id);
          this.structureToMesh.get(item.id)?.forEach(mesh => {
            mesh.visible = false;
          });
        });
      this.systemVisibility.set(structure.system, true);
    }

    if (visible) this.hiddenStructureIds.delete(id);
    else {
      this.hiddenStructureIds.add(id);
      this.uiManager.hideHoverLabel();
      if (this.uiManager.getCurrentStructure()?.id === id) {
        this.clearStructureSelection();
      }
    }

    this.structureToMesh.get(id)?.forEach(mesh => {
      mesh.visible = visible;
    });

    if (visible && structure) {
      const group = this.loadedModels.get(structure.system);
      if (group) group.visible = true;
      else void this.loadSystem(structure.system).then(() => this.setStructureVisibility(id, true));
    }
    if (updateTree) this.updateTreeVisibility();
  }

  setSystemOpacity(system: BodySystem, opacity: number): void {
    this.activeSystemOpacities.set(system, opacity);
    if (opacity === 0) {
      this.uiManager.hideHoverLabel();
      if (this.uiManager.getCurrentStructure()?.system === system) {
        this.clearStructureSelection();
      }
    }

    const group = this.loadedModels.get(system);
    if (group) {
      group.traverse(child => {
        if (child instanceof THREE.Mesh) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach(mat => {
            if (mat.transparent || opacity < 1) {
              mat.transparent = true;
              mat.opacity = opacity;
              mat.depthWrite = opacity >= 1;
            }
          });
        }
      });
    }
  }

  isolateStructure(structure: { id: string }): void {
    this.uiManager.hideHoverLabel();
    this.loadedModels.forEach(group => {
      group.traverse(child => {
        if (child instanceof THREE.Mesh) {
          child.visible = child.userData.structureId === structure.id;
        }
      });
    });
    const selected = this.dataManager.getStructureSync(structure.id);
    const group = selected ? this.loadedModels.get(selected.system) : undefined;
    if (group && selected) {
      group.visible = true;
      this.systemVisibility.set(selected.system, true);
      frameCameraToVisibleMeshes(this.camera, this.controls, group, 1.2 * (this.cameraDistance / 2));
    }
    this.updateTreeVisibility(structure.id);
  }

  hideStructure(structure: { id: string }): void {
    this.setStructureVisibility(structure.id, false);
    this.updateTreeVisibility();
  }

  resetView(): void {
    this.uiManager.hideHoverLabel();
    this.uiManager.resetCuttingControls();
    this.hiddenStructureIds.clear();
    this.loadedModels.forEach((group, system) => {
      group.visible = true;
      this.systemVisibility.set(system, true);
      group.traverse(child => {
        if (child instanceof THREE.Mesh) child.visible = Boolean(child.userData.structureId);
      });
    });
    this.loadedModels.forEach((_, system) => this.setSystemOpacity(system, 1));
    this.updateTreeVisibility();
    this.controls.reset();
  }

  private updateTreeVisibility(_visibleId?: string): void {
    const visibility = new Map<string, boolean>();
    this.dataManager.getAllStructures().forEach(structure => {
      const meshes = this.structureToMesh.get(structure.id);
      const systemVisible = this.systemVisibility.get(structure.system) ?? false;
      visibility.set(
        structure.id,
        meshes
          ? meshes.every(mesh => mesh.visible)
          : systemVisible && !this.hiddenStructureIds.has(structure.id)
      );
    });
    document.querySelectorAll(".tree-item").forEach(item => {
      const id = item.getAttribute("data-id")!;
      const visible = visibility.get(id) ?? true;
      item.classList.toggle("hidden", !visible);
      const checkbox = item.querySelector("input[type=checkbox]") as HTMLInputElement;
      if (checkbox) checkbox.checked = visible;
    });
    this.uiManager.syncStructureVisibility(visibility);
    document.querySelectorAll(".tree-group-visibility").forEach(cb => {
      const target = cb as HTMLInputElement;
      const system = target.dataset.system as BodySystem | undefined;
      if (!system) return;
      const group = this.loadedModels.get(system);
      const structures = this.dataManager.getAllStructures().filter(structure => structure.system === system);
      const visibleCount = structures.filter(structure => visibility.get(structure.id) ?? false).length;
      if (group && visibleCount === 0) group.visible = false;
      const systemVisible = group?.visible ?? (this.systemVisibility.get(system) ?? false);
      this.systemVisibility.set(system, systemVisible);
      target.checked = systemVisible && structures.length > 0 && visibleCount === structures.length;
      target.indeterminate = systemVisible && visibleCount > 0 && visibleCount < structures.length;
    });
  }

  async onSystemToggled(system: BodySystem, visible: boolean): Promise<void> {
    this.systemVisibility.set(system, visible);
    if (!visible) {
      this.uiManager.hideHoverLabel();
      if (this.uiManager.getCurrentStructure()?.system === system) {
        this.clearStructureSelection();
      }
    }

    this.dataManager.getAllStructures()
      .filter(structure => structure.system === system)
      .forEach(structure => {
        if (visible) this.hiddenStructureIds.delete(structure.id);
        else this.hiddenStructureIds.add(structure.id);
        this.structureToMesh.get(structure.id)?.forEach(mesh => {
          mesh.visible = visible;
        });
      });

    if (visible && !this.loadedModels.has(system)) {
      await this.loadSystem(system);
    }
    const group = this.loadedModels.get(system);
    if (group) {
      group.visible = visible;
      if (visible) this.frameSystemIfIsolated(system, group);
      else {
        const remaining = [...this.loadedModels.entries()].find(([other, model]) => other !== system && model.visible);
        if (remaining) this.frameSystemIfIsolated(remaining[0], remaining[1]);
      }
    }
    this.updateTreeVisibility();
  }
}