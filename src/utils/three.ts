import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export const DRACO_DECODER_PATH = "./vendor/draco/";

export function frameCameraToObject(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  object: THREE.Object3D,
  padding: number = 1.2
): void {
  frameCameraToBounds(camera, controls, new THREE.Box3().setFromObject(object), padding);
}

export function frameCameraToVisibleMeshes(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  object: THREE.Object3D,
  padding: number = 1.2
): void {
  const bounds = new THREE.Box3();
  object.updateMatrixWorld(true);
  object.traverse(child => {
    if (child instanceof THREE.Mesh && child.visible) bounds.expandByObject(child);
  });
  frameCameraToBounds(camera, controls, bounds, padding);
}

function frameCameraToBounds(
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
