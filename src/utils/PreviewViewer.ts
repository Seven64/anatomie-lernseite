import * as THREE from "three";
import { CameraControls } from "./CameraControls";
import { Structure } from "../types";
import { isTitleNode } from "./DataManager";
import {
  addStudioLights,
  collectMeshes,
  createGltfLoader,
  createHighlightMaterial,
  findNodesByName,
  getNodeName,
  frameCameraToBounds,
  frameCameraToObject,
  readCssColor,
  updateClipping,
} from "./three";

/** Geparste Modelle werden pro GLB-Datei einmal geladen und danach geklont. */
const modelCache = new Map<string, Promise<THREE.Group>>();
let sharedLoader: ReturnType<typeof createGltfLoader> | null = null;

function loadModel(glbFile: string): Promise<THREE.Group> {
  let cached = modelCache.get(glbFile);
  if (!cached) {
    sharedLoader ??= createGltfLoader();
    cached = sharedLoader.loader.loadAsync(`./models/${glbFile}`).then(gltf => {
      gltf.scene.traverse(child => {
        if (child instanceof THREE.Mesh) child.geometry.computeBoundsTree();
      });
      return gltf.scene;
    });
    cached.catch(() => modelCache.delete(glbFile));
    modelCache.set(glbFile, cached);
  }
  return cached;
}

/**
 * Kleine 3D-Ansicht für Quiz und Beschriftungs-Quiz: ein Renderer pro Modus,
 * wiederverwendet für jede Frage. Die Zielstruktur wird hervorgehoben.
 */
export class PreviewViewer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: CameraControls;
  private readonly highlight = createHighlightMaterial();
  /** Umgebung durchscheinend, damit auch tief liegende Zielstrukturen sichtbar sind. */
  private readonly context = new THREE.MeshStandardMaterial({
    color: 0xb7c1d6, transparent: true, opacity: 0.16, depthWrite: false,
  });
  private readonly raycaster = new THREE.Raycaster();
  private readonly resizeObserver: ResizeObserver;
  private model: THREE.Object3D | null = null;
  private targets = new Set<THREE.Object3D>();
  private animationId: number | null = null;
  private loadToken = 0;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    this.controls = new CameraControls(this.camera, this.renderer.domElement);

    this.scene.background = readCssColor("--bg-primary", "#f5f7fb");
    addStudioLights(this.scene);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.animate();
  }

  /**
   * Lädt das Modell der Struktur. Mit `reveal` wird sie hervorgehoben und die Umgebung
   * durchscheinend dargestellt. Liefert false, wenn die Struktur keine Geometrie hat.
   */
  async show(structure: Structure, reveal = true): Promise<boolean> {
    const token = ++this.loadToken;
    const source = await loadModel(structure.glbFile);
    if (token !== this.loadToken) return false; // inzwischen neue Frage

    if (this.model) this.scene.remove(this.model);
    this.model = source.clone(true);
    this.model.updateMatrixWorld(true);
    // Titel-Schriftzüge der Z-Anatomy-Gruppen ausblenden.
    this.model.traverse(child => {
      const name = getNodeName(child);
      if (name && isTitleNode(name)) child.visible = false;
    });
    this.scene.add(this.model);

    const targetNodes = findNodesByName(this.model, structure.objectName);
    this.targets = new Set(targetNodes);
    const targetMeshes = new Set(collectMeshes(targetNodes));
    if (!reveal) {
      // „Wo ist …?“: Modell unverändert zeigen, das Ziel muss gefunden werden.
      frameCameraToObject(this.camera, this.controls, this.model);
      return targetMeshes.size > 0;
    }
    this.model.traverse(child => {
      if (child instanceof THREE.Mesh) child.material = targetMeshes.has(child) ? this.highlight : this.context;
    });

    // Ziel mittig, Umgebung als Orientierung: auf das Ziel zoomen, aber großzügig.
    const targetBounds = new THREE.Box3();
    targetMeshes.forEach(mesh => targetBounds.expandByObject(mesh));
    const modelSize = new THREE.Box3().setFromObject(this.model).getSize(new THREE.Vector3()).length();
    const targetSize = targetBounds.isEmpty() ? modelSize : targetBounds.getSize(new THREE.Vector3()).length();
    const padding = Math.min(Math.max(2.5, (modelSize / Math.max(targetSize, 1e-6)) * 0.35), 6);
    if (targetBounds.isEmpty()) frameCameraToObject(this.camera, this.controls, this.model);
    else frameCameraToBounds(this.camera, this.controls, targetBounds, padding);
    return targetMeshes.size > 0;
  }

  /** Prüft, ob der Klick die Zielstruktur trifft. null = nichts getroffen. */
  hitsTarget(event: MouseEvent): boolean | null {
    if (!this.model) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(pointer, this.camera);
    const hit = this.raycaster.intersectObject(this.model, true)[0];
    if (!hit) return null;

    for (let object: THREE.Object3D | null = hit.object; object; object = object.parent) {
      if (this.targets.has(object)) return true;
    }
    return false;
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  dispose(): void {
    this.loadToken++;
    if (this.animationId !== null) cancelAnimationFrame(this.animationId);
    this.animationId = null;
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.highlight.dispose();
    this.context.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    // Geometrien gehören dem Modell-Cache und werden nicht freigegeben.
  }

  private resize(): void {
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  private animate = (): void => {
    this.animationId = requestAnimationFrame(this.animate);
    this.controls.update();
    updateClipping(this.camera, this.controls.distance);
    this.renderer.render(this.scene, this.camera);
  };
}
