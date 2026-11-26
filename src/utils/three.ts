import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from "three-mesh-bvh";

export const DRACO_DECODER_PATH = "./vendor/draco/";
/** Akzentviolett: kontrastiert mit Knochen (beige), Muskeln (rot) und Gefäßen. */
export const HIGHLIGHT_COLOR = 0x7c5cff;

// BVH-beschleunigtes Raycasting für alle Meshes aktivieren (three-mesh-bvh, MIT).
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

/** GLTF-Loader mit lokalem Draco-Decoder. `dispose()` gibt den Decoder-Worker frei. */
export function createGltfLoader(): { loader: GLTFLoader; dispose: () => void } {
  const draco = new DRACOLoader();
  draco.setDecoderPath(DRACO_DECODER_PATH);
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);
  return { loader, dispose: () => draco.dispose() };
}

/**
 * Ursprünglicher Blender-Objektname eines Knotens. GLTFLoader „säubert“ `name`
 * (Punkte/Leerzeichen werden entfernt), der Originalname steht in userData.
 */
export function getNodeName(object: THREE.Object3D): string | undefined {
  const name = object.userData.atlasObjectName ?? object.userData.name;
  return typeof name === "string" ? name : undefined;
}

/** Alle Knoten unterhalb von `root`, deren Originalname `name` ist. */
export function findNodesByName(root: THREE.Object3D, name: string): THREE.Object3D[] {
  const result: THREE.Object3D[] = [];
  root.traverse(child => {
    if (getNodeName(child) === name || child.name === name) result.push(child);
  });
  return result;
}

/** Alle Meshes unterhalb der übergebenen Knoten (ohne Duplikate). */
export function collectMeshes(objects: THREE.Object3D[]): THREE.Mesh[] {
  const meshes = new Set<THREE.Mesh>();
  objects.forEach(object => object.traverse(child => {
    if (child instanceof THREE.Mesh) meshes.add(child);
  }));
  return [...meshes];
}

/** Liest eine CSS-Variable als Three-Farbe. */
export function readCssColor(variable: string, fallback: string): THREE.Color {
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return new THREE.Color(value || fallback);
}

/** Standard-Lichtsetup (Ambient, Key, Fill, Rim) für alle 3D-Ansichten. */
export function addStudioLights(scene: THREE.Scene, castShadows = false): void {
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));

  const key = new THREE.DirectionalLight(0xffffff, 1);
  key.position.set(5, 10, 7);
  if (castShadows) {
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { near: 0.5, far: 20, left: -5, right: 5, top: 5, bottom: -5 });
  }
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xffffff, 0.3);
  fill.position.set(-5, 0, -5);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xffffff, 0.2);
  rim.position.set(0, -5, 0);
  scene.add(rim);
}

export function createHighlightMaterial(clippingPlanes?: THREE.Plane[]): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: HIGHLIGHT_COLOR,
    emissive: HIGHLIGHT_COLOR,
    emissiveIntensity: 0.45,
    clippingPlanes,
    clipShadows: Boolean(clippingPlanes),
  });
}

/** Gibt Geometrien, BVHs und Materialien eines Teilbaums frei. */
export function disposeObject(root: THREE.Object3D): void {
  root.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.disposeBoundsTree?.();
    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach(material => material.dispose());
  });
}

export function frameCameraToObject(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  object: THREE.Object3D,
  padding: number = 1.2
): void {
  frameCameraToBounds(camera, controls, new THREE.Box3().setFromObject(object), padding);
}

/** Box über alle sichtbaren Meshes (inkl. Sichtbarkeit der Eltern). */
export function computeVisibleBounds(object: THREE.Object3D, target = new THREE.Box3()): THREE.Box3 {
  target.makeEmpty();
  object.updateMatrixWorld(true);
  object.traverseVisible(child => {
    if (child instanceof THREE.Mesh) target.expandByObject(child);
  });
  return target;
}

export function frameCameraToVisibleMeshes(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  object: THREE.Object3D,
  padding: number = 1.2
): void {
  frameCameraToBounds(camera, controls, computeVisibleBounds(object), padding);
}

export function frameCameraToBounds(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  bounds: THREE.Box3,
  padding: number
): void {
  if (bounds.isEmpty()) return;

  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z);
  const fitHeightDistance = maxDimension / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  const fitWidthDistance = fitHeightDistance / camera.aspect;
  const distance = padding * Math.max(fitHeightDistance, fitWidthDistance);

  controls.target.copy(center);
  camera.position.set(center.x, center.y, center.z + distance);
  camera.near = Math.max(distance / 100, 0.01);
  camera.far = distance * 100;
  camera.updateProjectionMatrix();
  controls.update();
}
