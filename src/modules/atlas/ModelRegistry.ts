import * as THREE from "three";
import { BodySystem, Structure } from "../../types";
import { DataManager } from "../../utils/DataManager";
import { createGltfLoader, disposeObject, getNodeName } from "../../utils/three";

const keyOf = (glbFile: string, objectName: string) => `${glbFile}\0${objectName}`;

/**
 * Lädt die GLB-Modelle je Körpersystem und ordnet jeder Struktur ihre Meshes zu.
 * Gleichzeitige Ladeanfragen für dasselbe System werden zusammengefasst.
 */
export class ModelRegistry {
  readonly groups = new Map<BodySystem, THREE.Group>();
  private readonly structureMeshes = new Map<string, THREE.Mesh[]>();
  private readonly pending = new Map<BodySystem, Promise<THREE.Group>>();
  private readonly gltf = createGltfLoader();

  constructor(
    private readonly dataManager: DataManager,
    private readonly clippingPlanes: THREE.Plane[]
  ) {}

  isLoaded(system: BodySystem): boolean {
    return this.groups.has(system);
  }

  meshesOf(id: string): THREE.Mesh[] {
    return this.structureMeshes.get(id) ?? [];
  }

  load(system: BodySystem, onProgress: (percent: number) => void): Promise<THREE.Group> {
    const loaded = this.groups.get(system);
    if (loaded) return Promise.resolve(loaded);
    let pending = this.pending.get(system);
    if (!pending) {
      pending = this.loadSystem(system, onProgress).finally(() => this.pending.delete(system));
      this.pending.set(system, pending);
    }
    return pending;
  }

  private async loadSystem(system: BodySystem, onProgress: (percent: number) => void): Promise<THREE.Group> {
    const structures = this.dataManager.getStructuresBySystemSync(system);
    const glbFiles = [...new Set(structures.map(structure => structure.glbFile))];
    const group = new THREE.Group();
    group.name = system;

    for (let i = 0; i < glbFiles.length; i++) {
      const glbFile = glbFiles[i];
      const gltf = await this.gltf.loader.loadAsync(`./models/${glbFile}`, event => {
        if (event.total > 0) onProgress(((i + event.loaded / event.total) / glbFiles.length) * 90);
      });
      gltf.scene.traverse(child => {
        child.userData.atlasGlbFile = glbFile;
        if (!(child instanceof THREE.Mesh)) return;
        child.castShadow = true;
        child.receiveShadow = true;
        child.geometry.computeBoundsTree();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach(material => {
          material.clippingPlanes = this.clippingPlanes;
          material.clipShadows = true;
          material.userData.baseOpacity ??= material.opacity;
          material.userData.baseTransparent ??= material.transparent;
        });
        child.userData.originalMaterial = child.material;
      });
      group.add(gltf.scene);
    }

    this.assignMeshes(group, structures);
    group.updateMatrixWorld(true);
    this.groups.set(system, group);
    onProgress(100);
    return group;
  }

  /** Ordnet Meshes über (GLB-Datei, Objektname) den Strukturen zu; verschachtelte Strukturen bleiben getrennt. */
  private assignMeshes(group: THREE.Group, structures: Structure[]): void {
    const structureKeys = new Set(structures.map(structure => keyOf(structure.glbFile, structure.objectName)));
    const objectsByKey = new Map<string, THREE.Object3D[]>();
    group.traverse(child => {
      if (child instanceof THREE.Mesh) child.visible = false;
      const name = getNodeName(child);
      const glbFile = child.userData.atlasGlbFile;
      if (!name || typeof glbFile !== "string") return;
      const key = keyOf(glbFile, name);
      const list = objectsByKey.get(key);
      if (list) list.push(child);
      else objectsByKey.set(key, [child]);
    });

    structures.forEach(structure => {
      const objects = objectsByKey.get(keyOf(structure.glbFile, structure.objectName));
      if (!objects) return;
      const meshes: THREE.Mesh[] = [];
      const collect = (root: THREE.Object3D, child: THREE.Object3D): void => {
        const name = getNodeName(child);
        if (child !== root && name && structureKeys.has(keyOf(structure.glbFile, name))) return;
        if (child instanceof THREE.Mesh) meshes.push(child);
        child.children.forEach(descendant => collect(root, descendant));
      };
      objects.forEach(object => collect(object, object));
      if (meshes.length === 0) return;
      meshes.forEach(mesh => { mesh.userData.structureId = structure.id; });
      this.structureMeshes.set(structure.id, meshes);
    });
  }

  /** Setzt die Deckkraft aller Originalmaterialien eines Systems (relativ zur Ausgangsdeckkraft). */
  setOpacity(system: BodySystem, opacity: number): void {
    this.groups.get(system)?.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      const original = child.userData.originalMaterial as THREE.Material | THREE.Material[];
      (Array.isArray(original) ? original : [original]).forEach(material => {
        const base = material.userData.baseOpacity as number;
        const transparent = Boolean(material.userData.baseTransparent) || opacity < 1;
        if (material.transparent !== transparent) material.needsUpdate = true;
        material.transparent = transparent;
        material.opacity = base * opacity;
        material.depthWrite = opacity >= 1;
      });
    });
  }

  dispose(): void {
    this.groups.forEach(group => disposeObject(group));
    this.groups.clear();
    this.structureMeshes.clear();
    this.gltf.dispose();
  }
}
