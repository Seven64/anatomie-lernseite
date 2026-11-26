import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { readCssColor } from "../../utils/three";

/**
 * Navigationswürfel wie in CAD-Programmen. Der Würfel dreht sich synchron zur
 * Hauptkamera. Klick auf Fläche, Kante oder Ecke fliegt die Kamera in diese Ansicht.
 *
 * Koordinaten (glTF aus Blender): +Z = vorne (ventral), +Y = oben (kranial),
 * +X = links des Patienten.
 */

const FACES: Array<{ label: string; normal: [number, number, number] }> = [
  { label: "Links", normal: [1, 0, 0] },
  { label: "Rechts", normal: [-1, 0, 0] },
  { label: "Oben", normal: [0, 1, 0] },
  { label: "Unten", normal: [0, -1, 0] },
  { label: "Vorne", normal: [0, 0, 1] },
  { label: "Hinten", normal: [0, 0, -1] },
];

const SIZE_PX = 112;
const EDGE = 0.17; // Anteil der Kantenzone pro Seite (bei Würfelkante 1)
const FLIGHT_MS = 450;

export class ViewCube {
  private readonly root: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-0.95, 0.95, 0.95, -0.95, 0.1, 10);
  private readonly cube: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial[]>;
  private readonly hover: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  private readonly raycaster = new THREE.Raycaster();
  private readonly events = new AbortController();
  private flight: { from: THREE.Vector3; to: THREE.Vector3; distance: number; start: number } | null = null;

  constructor(
    container: HTMLElement,
    private readonly mainCamera: THREE.PerspectiveCamera,
    private readonly controls: OrbitControls,
    private readonly onHome: () => void
  ) {
    this.root = document.createElement("div");
    this.root.className = "viewcube";
    this.root.innerHTML = `
      <div class="viewcube-canvas" title="Ansicht wählen: Fläche, Kante oder Ecke anklicken"></div>
      <div class="viewcube-buttons">
        <button type="button" class="viewcube-home" title="Gesamtansicht (Pos1)" aria-label="Gesamtansicht">⌂</button>
        <button type="button" class="viewcube-rotate" data-rotate="-1" title="Um 90° nach links drehen" aria-label="Um 90 Grad nach links drehen">⟲</button>
        <button type="button" class="viewcube-rotate" data-rotate="1" title="Um 90° nach rechts drehen" aria-label="Um 90 Grad nach rechts drehen">⟳</button>
      </div>
      <div class="sr-only" role="group" aria-label="Standardansichten">
        ${FACES.map(face => `<button type="button" data-view="${face.normal.join(",")}">Ansicht ${face.label}</button>`).join("")}
      </div>`;
    container.appendChild(this.root);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(SIZE_PX, SIZE_PX);
    this.root.querySelector(".viewcube-canvas")!.appendChild(this.renderer.domElement);

    this.cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), FACES.map(() => new THREE.MeshBasicMaterial()));
    this.scene.add(this.cube);
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(this.cube.geometry),
      new THREE.LineBasicMaterial({ transparent: true, opacity: 0.45 })
    );
    this.cube.add(edges);

    this.hover = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55, depthTest: false })
    );
    this.hover.visible = false;
    this.hover.renderOrder = 1;
    this.scene.add(this.hover);

    this.applyTheme();
    this.bindEvents();
  }

  /** Farben aus den CSS-Variablen übernehmen (Hell/Dunkel). */
  applyTheme(): void {
    const face = readCssColor("--bg-secondary", "#ffffff");
    const text = readCssColor("--fg-primary", "#202943");
    const border = readCssColor("--border-light", "#cbd6e6");
    const accent = readCssColor("--accent-primary", "#594bd2");
    this.cube.material.forEach((material, index) => {
      material.map?.dispose();
      material.map = createLabelTexture(FACES[index].label, face, text, border);
      material.needsUpdate = true;
    });
    (this.cube.children[0] as THREE.LineSegments<THREE.EdgesGeometry, THREE.LineBasicMaterial>).material.color.copy(text);
    this.hover.material.color.copy(accent);
  }

  /** In jedem Frame aufrufen: Würfel ausrichten, Kameraflug fortsetzen, rendern. */
  update(now: number): void {
    if (this.flight) this.stepFlight(now);
    const offset = this.mainCamera.position.clone().sub(this.controls.target).normalize();
    this.camera.position.copy(offset.multiplyScalar(3));
    this.camera.up.copy(this.mainCamera.up);
    this.camera.lookAt(0, 0, 0);
    this.renderer.render(this.scene, this.camera);
  }

  /** Kamera so drehen, dass sie aus Richtung `direction` (Weltkoordinaten) auf das Ziel blickt. */
  flyTo(direction: THREE.Vector3): void {
    const to = direction.clone().normalize();
    // OrbitControls kann nicht exakt entlang der Hochachse blicken.
    if (Math.abs(to.y) > 0.999) to.set(0, Math.sign(to.y), 1e-3).normalize();
    const offset = this.mainCamera.position.clone().sub(this.controls.target);
    this.flight = { from: offset.clone().normalize(), to, distance: offset.length(), start: performance.now() };
  }

  /** Dreht die Ansicht um die Hochachse in 90°-Schritten. */
  rotate(steps: number): void {
    const offset = this.mainCamera.position.clone().sub(this.controls.target);
    const horizontal = new THREE.Vector3(offset.x, 0, offset.z);
    if (horizontal.lengthSq() < 1e-8) horizontal.set(0, 0, 1);
    const angle = Math.round(Math.atan2(horizontal.x, horizontal.z) / (Math.PI / 2)) * (Math.PI / 2) + steps * (Math.PI / 2);
    this.flyTo(new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle)));
  }

  dispose(): void {
    this.events.abort();
    this.cube.material.forEach(material => {
      material.map?.dispose();
      material.dispose();
    });
    this.cube.geometry.dispose();
    this.hover.geometry.dispose();
    this.hover.material.dispose();
    this.renderer.dispose();
    this.root.remove();
  }

  private stepFlight(now: number): void {
    const flight = this.flight!;
    const t = Math.min(1, (now - flight.start) / FLIGHT_MS);
    const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const rotation = new THREE.Quaternion().setFromUnitVectors(flight.from, flight.to);
    const step = new THREE.Quaternion().slerp(rotation, eased);
    const direction = flight.from.clone().applyQuaternion(step);
    this.mainCamera.position.copy(this.controls.target).addScaledVector(direction, flight.distance);
    this.mainCamera.lookAt(this.controls.target);
    this.controls.update();
    if (t >= 1) this.flight = null;
  }

  private bindEvents(): void {
    const { signal } = this.events;
    const canvas = this.renderer.domElement;
    canvas.addEventListener("pointermove", event => this.updateHover(this.regionAt(event)), { signal });
    canvas.addEventListener("pointerleave", () => this.updateHover(null), { signal });
    canvas.addEventListener("click", event => {
      const region = this.regionAt(event);
      if (region) this.flyTo(region);
    }, { signal });

    this.root.addEventListener("click", event => {
      const target = event.target as HTMLElement;
      if (target.closest(".viewcube-home")) this.onHome();
      const rotate = target.closest<HTMLElement>("[data-rotate]");
      if (rotate) this.rotate(Number(rotate.dataset.rotate));
      const view = target.closest<HTMLElement>("[data-view]");
      if (view) this.flyTo(new THREE.Vector3(...view.dataset.view!.split(",").map(Number)));
    }, { signal });

    // Zahlenblock wie in Blender/CAD: 1 vorne, 3 rechts, 7 oben; mit Strg die Gegenseite.
    window.addEventListener("keydown", event => {
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable]")) return;
      const opposite = event.ctrlKey ? -1 : 1;
      const views: Record<string, [number, number, number]> = {
        Numpad1: [0, 0, opposite],
        Numpad3: [-opposite, 0, 0],
        Numpad7: [0, opposite, 0],
      };
      const view = views[event.code];
      if (view) {
        event.preventDefault();
        this.flyTo(new THREE.Vector3(...view));
      } else if (event.code === "Numpad4" || event.code === "Numpad6") {
        event.preventDefault();
        this.rotate(event.code === "Numpad4" ? -1 : 1);
      } else if (event.key === "Home") {
        this.onHome();
      }
    }, { signal });
  }

  /** Richtung der getroffenen Fläche (1 Achse), Kante (2) oder Ecke (3) – oder null. */
  private regionAt(event: PointerEvent | MouseEvent): THREE.Vector3 | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(pointer, this.camera);
    const hit = this.raycaster.intersectObject(this.cube, false)[0];
    if (!hit) return null;
    const limit = 0.5 - EDGE;
    const snap = (value: number) => (value > limit ? 1 : value < -limit ? -1 : 0);
    return new THREE.Vector3(snap(hit.point.x), snap(hit.point.y), snap(hit.point.z));
  }

  private updateHover(region: THREE.Vector3 | null): void {
    this.renderer.domElement.style.cursor = region ? "pointer" : "default";
    this.hover.visible = Boolean(region);
    if (!region) return;
    const inner = 1 - 2 * EDGE;
    const size = (component: number) => (component === 0 ? inner : EDGE);
    const position = (component: number) => component * (0.5 - EDGE / 2 + 0.006);
    this.hover.scale.set(size(region.x), size(region.y), size(region.z));
    this.hover.position.set(position(region.x), position(region.y), position(region.z));
  }
}

function createLabelTexture(label: string, background: THREE.Color, text: THREE.Color, border: THREE.Color): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d")!;
  context.fillStyle = `#${background.getHexString()}`;
  context.fillRect(0, 0, size, size);
  context.strokeStyle = `#${border.getHexString()}`;
  context.lineWidth = 6;
  context.strokeRect(3, 3, size - 6, size - 6);
  context.fillStyle = `#${text.getHexString()}`;
  context.font = "600 24px 'Segoe UI', system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, size / 2, size / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
