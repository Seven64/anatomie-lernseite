#!/usr/bin/env node
/**
 * Gleicht public/structures.json mit den GLB-Modellen ab.
 *
 * Hintergrund: Der Blender-Export wandelt Kurven (Nerven, Gänge) in Meshes um. In einem
 * älteren Exportlauf fehlten diese Objekte in structures.json, obwohl sie in den GLB-Dateien
 * enthalten sind – sie waren im Atlas unsichtbar. Dieses Skript ergänzt fehlende Einträge
 * direkt aus den GLB-Knoten (Originalname steht in extras.atlasObjectName).
 *
 * Die Region wird geometrisch bestimmt: Jedes neue Objekt erhält die Region der räumlich
 * nächstgelegenen bereits zugeordneten Struktur derselben GLB-Datei (Mittelpunkt der
 * Begrenzungsbox aus den Accessor-min/max-Werten, ohne Draco-Dekodierung).
 *
 * Aufruf:  node scripts/sync-structures.js [--check] [--version 1.2]
 *   --check     nur prüfen, Exit-Code 1 bei fehlenden Einträgen (für CI)
 *   --version   neue Manifest-Version setzen (muss zu STRUCTURES_VERSION passen)
 *
 * Reines ESM-JavaScript – wird direkt mit node ausgeführt.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const MANIFEST = join(ROOT, "public/structures.json");
const MODELS = join(ROOT, "public/models");

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const versionIndex = args.indexOf("--version");
const newVersion = versionIndex >= 0 ? args[versionIndex + 1] : undefined;

/** @typedef {{ id: string, nameLatin: string, system: string, region?: string, objectName: string, glbFile: string, parentId?: string, childrenIds?: string[] }} Structure */

/** Wie clean_name() im Blender-Export. @param {string} name */
function cleanId(name) {
  return name.toLowerCase()
    .replace(/ /g, "_").replace(/[.,()]/g, "").replace(/[-/]/g, "_")
    .replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || "structure";
}

/** Liest den JSON-Chunk einer GLB-Datei. @param {string} file */
function readGltfJson(file) {
  const buffer = readFileSync(file);
  if (buffer.toString("utf8", 0, 4) !== "glTF") throw new Error(`${file} ist keine GLB-Datei`);
  const length = buffer.readUInt32LE(12);
  return JSON.parse(buffer.subarray(20, 20 + length).toString("utf8"));
}

/**
 * Mittelpunkt eines Knotens in Modellkoordinaten (Translation + Skalierung, Rotation
 * vernachlässigt – für die Zuordnung zur nächsten Region ausreichend genau).
 * @param {any} gltf @param {any} node
 */
function nodeCenter(gltf, node) {
  const mesh = gltf.meshes[node.mesh];
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const primitive of mesh.primitives) {
    const accessor = gltf.accessors[primitive.attributes.POSITION];
    if (!accessor?.min || !accessor?.max) continue;
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], accessor.min[i]);
      max[i] = Math.max(max[i], accessor.max[i]);
    }
  }
  if (!Number.isFinite(min[0])) return null;
  const scale = node.scale ?? [1, 1, 1];
  const translation = node.translation ?? [0, 0, 0];
  return [0, 1, 2].map(i => ((min[i] + max[i]) / 2) * scale[i] + translation[i]);
}

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
/** @type {Structure[]} */
const structures = manifest.structures;
const usedIds = new Set(structures.map(structure => structure.id));
/** @type {Structure[]} */
const added = [];

// 1. Durchgang: alle GLB-Knoten lesen; bekannte Strukturen aller Systeme dienen als Referenz.
//    (Alle Modelle teilen dasselbe Koordinatensystem.) „unknown“ zählt mit – Extremitäten
//    sind in den Z-Anatomy-Daten nicht regional zugeordnet.
/** @type {{ center: number[], region: string }[]} */
const references = [];
/** @type {{ name: string, center: number[] | null, system: string, glbFile: string }[]} */
const missing = [];

for (const system of readdirSync(MODELS)) {
  const glbFile = `${system}/${system}.glb`;
  const gltf = readGltfJson(join(MODELS, glbFile));
  const known = new Map(structures.filter(s => s.glbFile === glbFile).map(s => [s.objectName, s]));

  for (const node of gltf.nodes ?? []) {
    if (node.mesh === undefined) continue;
    const name = node.extras?.atlasObjectName ?? node.name;
    if (typeof name !== "string") continue;
    const center = nodeCenter(gltf, node);
    const structure = known.get(name);
    if (!structure) missing.push({ name, center, system, glbFile });
    // Gruppen-/Titelknoten (Suffix .g) sind Schriftzüge, keine Anatomie.
    else if (center && !/\.g$/.test(structure.nameLatin)) references.push({ center, region: structure.region ?? "unknown" });
  }
}

// 2. Durchgang: fehlende Strukturen anlegen, Region der nächstgelegenen Referenz.
for (const { name, center, system, glbFile } of missing) {
  let region = "unknown";
  if (center) {
    let best = Infinity;
    for (const reference of references) {
      const distance = Math.hypot(...reference.center.map((value, i) => value - center[i]));
      if (distance < best) {
        best = distance;
        region = reference.region;
      }
    }
  }
  let id = cleanId(name);
  for (let n = 2; usedIds.has(id); n++) id = `${cleanId(name)}_${n}`;
  usedIds.add(id);
  added.push({ id, nameLatin: name, system, region, objectName: name, glbFile, childrenIds: [] });
}

const bySystem = added.reduce((acc, s) => ({ ...acc, [s.system]: (acc[s.system] ?? 0) + 1 }), /** @type {Record<string, number>} */ ({}));
console.log(`Fehlende Strukturen: ${added.length}`, bySystem);

if (checkOnly) {
  process.exit(added.length > 0 ? 1 : 0);
}
if (added.length === 0 && !newVersion) {
  console.log("✅ structures.json ist vollständig.");
  process.exit(0);
}

manifest.structures = structures.concat(added);
if (newVersion) manifest.version = newVersion;
manifest.exported = new Date().toISOString();
writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`✅ ${added.length} Strukturen ergänzt, Version ${manifest.version}.`);
