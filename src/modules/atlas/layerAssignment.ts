/**
 * Reine Schichtzuordnung („Zwiebelschalen“-Prinzip), ohne Three.js – unit-getestet.
 *
 * Für jede Struktur wurden Strahlen von Punkten ihrer Oberfläche in viele Richtungen
 * geworfen. Jeder Strahl kennt die Strukturen, die er auf dem Weg nach außen trifft.
 * Eine Struktur ist in Runde k „freigelegt“, wenn ein ausreichender Anteil ihrer Strahlen
 * nur noch Strukturen trifft, die bereits in früheren Runden abgetragen wurden.
 * Runde 0 = oberflächliche Schicht, Runde 1 = darunter usw.
 */

export interface LayerAssignmentOptions {
  /** Anteil freier Strahlen (0–1), ab dem eine Struktur als freigelegt gilt. */
  exposureThreshold?: number;
  /** Höchstens so viele Schichten; tiefere Strukturen landen in der letzten. */
  maxLayers?: number;
}

export const DEFAULT_EXPOSURE_THRESHOLD = 0.08;
export const DEFAULT_MAX_LAYERS = 8;

/**
 * @param rayHits rayHits[i][r] = Indizes der Strukturen, die Strahl r von Struktur i blockieren.
 * @returns Schichtindex je Struktur (0 = außen).
 */
export function assignLayers(rayHits: number[][][], options: LayerAssignmentOptions = {}): number[] {
  const threshold = options.exposureThreshold ?? DEFAULT_EXPOSURE_THRESHOLD;
  const maxLayers = Math.max(1, options.maxLayers ?? DEFAULT_MAX_LAYERS);
  const count = rayHits.length;
  const layers = new Array<number>(count).fill(-1);
  const peeled = new Uint8Array(count);
  let remaining = count;

  for (let layer = 0; remaining > 0; layer++) {
    if (layer === maxLayers - 1) {
      for (let i = 0; i < count; i++) if (layers[i] < 0) layers[i] = layer;
      break;
    }

    const exposed: number[] = [];
    for (let i = 0; i < count; i++) {
      if (layers[i] >= 0) continue;
      const rays = rayHits[i];
      if (rays.length === 0) {
        exposed.push(i);
        continue;
      }
      let free = 0;
      for (const hits of rays) {
        if (hits.every(hit => hit === i || peeled[hit] === 1)) free++;
      }
      if (free / rays.length >= threshold) exposed.push(i);
    }

    // Kein Fortschritt mehr möglich (vollständig umschlossen): Rest in diese Schicht.
    const assigned = exposed.length > 0 ? exposed : layers.flatMap((value, index) => value < 0 ? [index] : []);
    assigned.forEach(index => { layers[index] = layer; });
    assigned.forEach(index => { peeled[index] = 1; });
    remaining -= assigned.length;
  }

  return layers;
}

/** Anzahl Strukturen je Schicht; Länge = höchste Schicht + 1. */
export function countPerLayer(layers: Iterable<number>): number[] {
  const counts: number[] = [];
  for (const layer of layers) {
    while (counts.length <= layer) counts.push(0);
    counts[layer]++;
  }
  return counts;
}

/** Gleichmäßig verteilte Richtungen auf der Einheitskugel (Fibonacci-Spirale). */
export function fibonacciDirections(count: number): Array<[number, number, number]> {
  const directions: Array<[number, number, number]> = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (2 * (i + 0.5)) / count;
    const radius = Math.sqrt(1 - y * y);
    const theta = golden * i;
    directions.push([Math.cos(theta) * radius, y, Math.sin(theta) * radius]);
  }
  return directions;
}
