import * as THREE from "three";
import { CuttingAxis } from "../../types";
import { cutPosition, planeConstant } from "./cuttingMath";

interface PlaneState {
  coordinate: "x" | "y" | "z";
  enabled: boolean;
  progress: number;
  plane: THREE.Plane;
  helper: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
}

const DISABLED_CONSTANT = 1e6;
const HELPER_VISIBLE_MS = 900;

function createState(coordinate: "x" | "y" | "z", normal: THREE.Vector3): PlaneState {
  const helper = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false })
  );
  helper.visible = false;
  helper.renderOrder = 10;
  helper.userData.isHelper = true;
  return { coordinate, enabled: false, progress: 50, plane: new THREE.Plane(normal, DISABLED_CONSTANT), helper };
}

/**
 * Drei achsparallele Schnittebenen. Die Grenzen beziehen sich auf die aktuell
 * eingeblendeten Strukturen, damit der Sliderweg genau das betrachtete Modell abdeckt.
 */
export class CuttingPlanes {
  private readonly states: Record<CuttingAxis, PlaneState> = {
    vertical: createState("y", new THREE.Vector3(0, -1, 0)),
    rightLeft: createState("x", new THREE.Vector3(-1, 0, 0)),
    frontBack: createState("z", new THREE.Vector3(0, 0, -1)),
  };
  readonly planes: THREE.Plane[] = Object.values(this.states).map(state => state.plane);
  readonly helpers = new THREE.Group();
  private readonly bounds = new THREE.Box3();
  private helperHideAt = 0;

  constructor(accentColor: THREE.Color) {
    Object.values(this.states).forEach(state => {
      state.helper.material.color.copy(accentColor);
      this.helpers.add(state.helper);
    });
  }

  get anyEnabled(): boolean {
    return Object.values(this.states).some(state => state.enabled);
  }

  set(axis: CuttingAxis, enabled: boolean, progress: number): void {
    const state = this.states[axis];
    const moved = state.progress !== progress;
    state.enabled = enabled;
    state.progress = progress;
    this.update();
    if (enabled && moved) this.helperHideAt = performance.now() + HELPER_VISIBLE_MS;
  }

  /** Neue Modellgrenzen; leere Box = Schnitt deaktiviert. */
  setBounds(bounds: THREE.Box3): void {
    if (bounds.equals(this.bounds)) return;
    this.bounds.copy(bounds);
    this.update();
  }

  isClipped(point: THREE.Vector3): boolean {
    return Object.values(this.states).some(state => state.enabled && state.plane.distanceToPoint(point) < -1e-5);
  }

  /** Blendet die halbtransparente Ebenen-Vorschau kurz nach dem Verschieben aus. */
  updateHelpers(now: number): void {
    const show = now < this.helperHideAt;
    Object.values(this.states).forEach(state => {
      state.helper.visible = show && state.enabled && !this.bounds.isEmpty();
    });
  }

  dispose(): void {
    Object.values(this.states).forEach(state => {
      state.helper.geometry.dispose();
      state.helper.material.dispose();
    });
  }

  private update(): void {
    const hasBounds = !this.bounds.isEmpty();
    const size = this.bounds.getSize(new THREE.Vector3());
    const center = this.bounds.getCenter(new THREE.Vector3());

    Object.values(this.states).forEach(state => {
      if (!state.enabled || !hasBounds) {
        state.plane.constant = DISABLED_CONSTANT;
        return;
      }
      const axisIndex = state.coordinate === "x" ? 0 : state.coordinate === "y" ? 1 : 2;
      const position = cutPosition(this.bounds.min[state.coordinate], this.bounds.max[state.coordinate], state.progress);
      state.plane.constant = planeConstant(state.plane.normal.getComponent(axisIndex), position);

      // Vorschau-Ebene auf die Schnittposition legen und an die Modellgröße anpassen.
      const helper = state.helper;
      helper.position.copy(center).setComponent(axisIndex, position);
      helper.rotation.set(0, 0, 0);
      if (state.coordinate === "x") {
        helper.rotation.y = Math.PI / 2;
        helper.scale.set(size.z * 1.1, size.y * 1.1, 1);
      } else if (state.coordinate === "y") {
        helper.rotation.x = Math.PI / 2;
        helper.scale.set(size.x * 1.1, size.z * 1.1, 1);
      } else {
        helper.scale.set(size.x * 1.1, size.y * 1.1, 1);
      }
    });
  }
}
