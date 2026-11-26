import * as THREE from "three";
import { Structure } from "../../types";
import { DataManager, STRUCTURES_VERSION } from "../../utils/DataManager";
import { LAYER_ALGORITHM_VERSION, computeLayers } from "./MuscleLayers";

/**
 * Liefert die Schicht je Struktur – aus dem IndexedDB-Cache oder frisch berechnet.
 * Der Cache-Schlüssel enthält Algorithmus- und Datenversion sowie die GLB-Dateien.
 */
export async function loadOrComputeLayers(
  dataManager: DataManager,
  structures: Structure[],
  meshesOf: (id: string) => THREE.Mesh[],
  options: { signal: AbortSignal; onProgress: (percent: number) => void }
): Promise<Record<string, number>> {
  const files = [...new Set(structures.map(structure => structure.glbFile))].sort().join("|");
  const cacheKey = `layers:v${LAYER_ALGORITHM_VERSION}:${STRUCTURES_VERSION}:${files}`;

  const cached = await dataManager.loadCache<Record<string, number>>(cacheKey);
  if (cached) return cached;

  const started = performance.now();
  const items = structures.map(structure => ({ id: structure.id, meshes: meshesOf(structure.id) }));
  const computed = await computeLayers(items, options);
  console.info(`Muskelschichten berechnet: ${computed.size} Strukturen in ${Math.round(performance.now() - started)} ms`);

  const layers = Object.fromEntries(computed);
  await dataManager.saveCache(cacheKey, layers);
  return layers;
}
