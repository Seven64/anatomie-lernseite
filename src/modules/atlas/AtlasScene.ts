import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { SettingsManager } from "../../utils/SettingsManager";
import { addStudioLights, readCssColor } from "../../utils/three";

type FrameHandler = (now: number) => void;

/** Renderer, Kamera, Steuerung und Renderschleife des Atlas. */
export class AtlasScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  private readonly frameHandlers: FrameHandler[] = [];
  private readonly resizeObserver: ResizeObserver;
  private readonly unsubscribeSettings: () => void;
  private animationId: number | null = null;
  private cameraDistance: number;

  constructor(private readonly container: HTMLElement, settingsManager: SettingsManager) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.classList.add("atlas-canvas");
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    this.camera.position.set(0, 0, 2);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.rotateSpeed = 0.7;
    this.controls.zoomSpeed = 0.8;
    this.controls.panSpeed = 0.8;
    this.controls.minDistance = 0.05;
    this.controls.maxDistance = 20;
    this.controls.screenSpacePanning = true;
    this.controls.autoRotate = settingsManager.get("autoRotate");
    this.cameraDistance = settingsManager.get("cameraDistance");

    addStudioLights(this.scene, true);
    this.updateBackground();

    this.unsubscribeSettings = settingsManager.subscribe(settings => {
      this.controls.autoRotate = settings.autoRotate;
      if (settings.cameraDistance !== this.cameraDistance) {
        const scale = settings.cameraDistance / this.cameraDistance;
        const offset = this.camera.position.clone().sub(this.controls.target).multiplyScalar(scale);
        this.camera.position.copy(this.controls.target).add(offset);
        this.cameraDistance = settings.cameraDistance;
      }
      this.controls.update();
    });

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  /** Faktor für das Einpassen der Kamera (Einstellung „Kameraabstand“). */
  get framingPadding(): number {
    return 1.2 * (this.cameraDistance / 2);
  }

  updateBackground(): void {
    this.scene.background = readCssColor("--bg-primary", "#f5f7fb");
  }

  onFrame(handler: FrameHandler): void {
    this.frameHandlers.push(handler);
  }

  start(): void {
    const loop = (now: number) => {
      this.animationId = requestAnimationFrame(loop);
      this.controls.update();
      this.frameHandlers.forEach(handler => handler(now));
      this.renderer.render(this.scene, this.camera);
    };
    this.animationId = requestAnimationFrame(loop);
  }

  /** Normalisierte Gerätekoordinaten eines Mausereignisses. */
  toPointer(event: MouseEvent, target = new THREE.Vector2()): THREE.Vector2 {
    const rect = this.renderer.domElement.getBoundingClientRect();
    return target.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
  }

  dispose(): void {
    if (this.animationId !== null) cancelAnimationFrame(this.animationId);
    this.animationId = null;
    this.resizeObserver.disconnect();
    this.unsubscribeSettings();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.scene.clear();
  }

  private resize(): void {
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }
}
