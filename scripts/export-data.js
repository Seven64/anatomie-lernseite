#!/usr/bin/env node
/**
 * Data Export Script for Anatomie Lernseite
 * Reads structures.json and imports into IndexedDB
 * Run with: npm run data:export
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STRUCTURES_JSON = path.resolve(__dirname, '../public/structures.json');
const EXPORT_DIR = path.resolve(__dirname, '../public/models');

async function main() {
  console.log('📊 Anatomie Lernseite - Data Import');
  console.log('='.repeat(40));

  // Check if structures.json exists
  if (!fs.existsSync(STRUCTURES_JSON)) {
    console.error('❌ structures.json not found!');
    console.error('   Run the Blender export first:');
    console.error('   blender --background --python scripts/blender/export_gltf.py');
    process.exit(1);
  }

  // Read structures
  /** @type {{version: string, source: string, license: string, exported: string, structures: Array<{system: string, region?: string, glbFile: string}>}} */
  const data = JSON.parse(fs.readFileSync(STRUCTURES_JSON, 'utf-8'));
  const structures = data.structures;

  console.log(`📥 Loaded ${structures.length} structures from ${data.source}`);
  console.log(`📅 Exported: ${data.exported}`);
  console.log(`📜 License: ${data.license}`);

  // Verify GLB files exist
  console.log('\n🔍 Verifying GLB files...');
  /** @type {string[]} */
  const missingFiles = [];
  const systems = new Set();

  for (const struct of structures) {
    const glbPath = path.resolve(EXPORT_DIR, struct.glbFile);
    if (!fs.existsSync(glbPath)) {
      missingFiles.push(struct.glbFile);
    }
    systems.add(struct.system);
  }

  if (missingFiles.length > 0) {
    console.warn(`⚠️  ${missingFiles.length} GLB files missing:`);
    missingFiles.forEach(f => console.warn(`   - ${f}`));
    console.warn('   Models will fail to load in the app!');
  } else {
    console.log(`✅ All ${structures.length} GLB files present`);
  }

  console.log(`\n📦 Systems found: ${Array.from(systems).sort().join(', ')}`);

  // Output summary for manual IndexedDB import
  console.log('\n📋 To import into the app:');
  console.log('   1. Open the app in browser (npm run dev)');
  console.log('   2. Open DevTools → Application → IndexedDB');
  console.log('   3. Delete "anatomy-learning" database if exists');
  console.log('   4. Refresh - structures will auto-load from structures.json');
  console.log('\n   Or use the in-app Settings → Import Data with a backup file');

  // Generate stats
  /** @type {Record<string, number>} */
  const bySystem = {};
  /** @type {Record<string, number>} */
  const byRegion = {};

  for (const struct of structures) {
    bySystem[struct.system] = (bySystem[struct.system] || 0) + 1;
    if (struct.region) {
      byRegion[struct.region] = (byRegion[struct.region] || 0) + 1;
    }
  }

  console.log('\n📊 Statistics:');
  console.log(`   Total structures: ${structures.length}`);
  console.log(`   Systems: ${Object.keys(bySystem).length}`);
  console.log(`   Regions: ${Object.keys(byRegion).length}`);

  console.log('\n   By System:');
  for (const [system, count] of Object.entries(bySystem).sort()) {
    console.log(`     ${system}: ${count}`);
  }

  console.log('\n✅ Data verification complete!');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
