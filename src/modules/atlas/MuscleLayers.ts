import * as THREE from "three";
import { MeshBVH } from "three-mesh-bvh";
import { assignLayers, fibonacciDirections } from "./layerAssignment";

export interface LayerItem {
  id: string;
  meshes: THREE.Mesh[];
}

export interface LayerComputeOptions {
  samplesPerStructure?: number;
  directions?: number;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

/** Version des Algorithmus – bei Änderungen anheben, damit alte Caches verworfen werden. */
export const LAYER_ALGORITHM_VERSION = 1;

const FRAME_BUDGET_MS = 24;
const nextFrame = () => new Promise<void>(resolve => setTimeout(resolve, 0));

/**
 * Berechnet für jede Struktur eine Tiefenschicht (0 = oberflächlich).
 *
 * Alle Meshes werden in Weltkoordinaten zu einer Geometrie zusammengeführt und
 * mit einer einzigen BVH indiziert. Von Oberflächenpunkten jeder Struktur werden
 * Strahlen in alle Richtungen geworfen; die getroffenen Strukturen ergeben die
 * Eingabe für {@link assignLayers}. Die Arbeit wird in kleine Stücke geteilt,
 * damit die Oberfläche bedienbar bleibt.
 */
export async function computeLayers(items: LayerItem[], options: LayerComputeOptions = {}): Promise<Map<string, number>> {
  const samples = options.samplesPerStructure ?? 8;
  const directions = fibonacciDirections(options.directions ?? 14).map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const report = options.onProgress ?? (() => undefined);
  const usable = items.filter(item => item.meshes.length > 0);

  report(0);
  await nextFrame();
  const { geometry, vertexOwner, scale } = mergeWorldGeometry(usable);
  if (!geometry) return new Map();
  const bvh = new MeshBVH(geometry);
  report(15);
  await nextFrame();

  const epsilon = scale * 1e-4;
  const ray = new THREE.Ray();
  const point = new THREE.Vector3();
  const rayHits: number[][][] = [];
  let lastYield = performance.now();

  for (let index = 0; index < usable.length; index++) {
    if (options.signal?.aborted) throw new DOMException("Abgebrochen", "AbortError");
    const rays: number[][] = [];
    for (const origin of samplePoints(usable[index].meshes, samples)) {
      for (const direction of directions) {
        ray.origin.copy(point.copy(direction).multiplyScalar(epsilon).add(origin));
        ray.direction.copy(direction);
        const blockers = new Set<number>();
        for (const hit of bvh.raycast(ray, THREE.DoubleSide)) {
          const owner = hit.face ? vertexOwner[hit.face.a] : index;
          if (owner !== index) blockers.add(owner);
        }
        rays.push([...blockers]);
      }
    }
    rayHits.push(rays);

    if (performance.now() - lastYield > FRAME_BUDGET_MS) {
      report(15 + (80 * (index + 1)) / usable.length);
      await nextFrame();
      lastYield = performance.now();
    }
  }

  geometry.dispose();
  const layers = assignLayers(rayHits);
  report(100);
  return new Map(usable.map((item, index) => [item.id, layers[index]]));
}

/** Fügt alle Meshes in Weltkoordinaten zusammen; vertexOwner ordnet jedem Vertex seine Struktur zu. */
function mergeWorldGeometry(items: LayerItem[]): { geometry: THREE.BufferGeometry | null; vertexOwner: Uint32Array; scale: number } {
  let vertexCount = 0;
  let indexCount = 0;
  items.forEach(item => item.meshes.forEach(mesh => {
    const positions = mesh.geometry.getAttribute("position");
    vertexCount += positions.count;
    indexCount += mesh.geometry.index?.count ?? positions.count;
  }));
  if (vertexCount === 0) return { geometry: null, vertexOwner: new Uint32Array(), scale: 1 };

  const positions = new Float32Array(vertexCount * 3);
  const indices = new Uint32Array(indexCount);
  const vertexOwner = new Uint32Array(vertexCount);
  const vertex = new THREE.Vector3();
  let vertexOffset = 0;
  let indexOffset = 0;

  items.forEach((item, owner) => item.meshes.forEach(mesh => {
    mesh.updateWorldMatrix(true, false);
    const source = mesh.geometry.getAttribute("position");
    for (let i = 0; i < source.count; i++) {
      vertex.fromBufferAttribute(source, i).applyMatrix4(mesh.matrixWorld);
      const offset = (vertexOffset + i) * 3;
      positions[offset] = vertex.x;
      positions[offset + 1] = vertex.y;
      positions[offset + 2] = vertex.z;
      vertexOwner[vertexOffset + i] = owner;
    }
    const index = mesh.geometry.index;
    if (index) {
      for (let i = 0; i < index.count; i++) indices[indexOffset + i] = index.getX(i) + vertexOffset;
      indexOffset += index.count;
    } else {
      for (let i = 0; i < source.count; i++) indices[indexOffset + i] = vertexOffset + i;
      indexOffset += source.count;
    }
    vertexOffset += source.count;
  }));

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingBox();
  const scale = geometry.boundingBox!.getSize(new THREE.Vector3()).length() || 1;
  return { geometry, vertexOwner, scale };
}

/** Gleichmäßig über die Vertices verteilte Oberflächenpunkte (Weltkoordinaten). */
function samplePoints(meshes: THREE.Mesh[], count: number): THREE.Vector3[] {
  const total = meshes.reduce((sum, mesh) => sum + mesh.geometry.getAttribute("position").count, 0);
  if (total === 0) return [];
  const points: THREE.Vector3[] = [];
  const samples = Math.min(count, total);
  for (let s = 0; s < samples; s++) {
    let target = Math.floor(((s + 0.5) * total) / samples);
    for (const mesh of meshes) {
      const positions = mesh.geometry.getAttribute("position");
      if (target < positions.count) {
        points.push(new THREE.Vector3().fromBufferAttribute(positions, target).applyMatrix4(mesh.matrixWorld));
        break;
      }
      target -= positions.count;
    }
  }
  return points;
}
