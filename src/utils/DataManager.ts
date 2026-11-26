import { openDB, DBSchema, IDBPDatabase } from "idb";
import { Structure, ProgressData, BodySystem, UserSettings } from "../types";

interface AnatomyDB extends DBSchema {
  structures: {
    key: string;
    value: Structure;
    indexes: { "by-system": string; "by-region": string };
  };
  manifest: {
    key: string;
    value: { id: string; version: string };
  };
  progress: {
    key: string;
    value: ProgressData;
  };
  settings: {
    key: string;
    value: UserSettings;
  };
}

const DB_NAME = "anatomy-learning";
const DB_VERSION = 2;
const STRUCTURES_STORE = "structures";
const MANIFEST_STORE = "manifest";
const MANIFEST_VERSION_KEY = "structures-version";
const STRUCTURES_VERSION = "1.1";
const PROGRESS_KEY = "user-progress";
const SETTINGS_KEY = "user-settings";
const LEGACY_SEED_IDS = new Set(["skull", "femur", "heart", "brain"]);

export class DataManager {
  private db: IDBPDatabase<AnatomyDB> | null = null;
  private structuresCache: Structure[] | null = null;
  private dbReady: Promise<void>;

  constructor() {
    this.dbReady = this.initDB();
  }

  private async initDB(): Promise<void> {
    this.db = await openDB<AnatomyDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const structureStore = db.createObjectStore(STRUCTURES_STORE, { keyPath: "id" });
          structureStore.createIndex("by-system", "system");
          structureStore.createIndex("by-region", "region");
          db.createObjectStore("progress", { keyPath: "id" });
          db.createObjectStore("settings", { keyPath: "id" });
        }
        if (oldVersion < 2) {
          db.createObjectStore(MANIFEST_STORE, { keyPath: "id" });
        }
      },
    });
  }

  private async ensureDB(): Promise<IDBPDatabase<AnatomyDB>> {
    await this.dbReady;
    if (!this.db) throw new Error("Database not initialized");
    return this.db;
  }

  async saveStructures(structures: Structure[]): Promise<void> {
    const db = await this.ensureDB();
    const tx = db.transaction(STRUCTURES_STORE, "readwrite");
    for (const structure of structures) {
      await tx.store.put(structure);
    }
    await tx.done;
    this.structuresCache = structures;
  }

  async loadStructures(): Promise<Structure[]> {
    if (this.structuresCache) return this.structuresCache;

    const db = await this.ensureDB();
    const storedStructures = await db.getAll(STRUCTURES_STORE);
    const isLegacySeed = storedStructures.length === LEGACY_SEED_IDS.size &&
      storedStructures.every(structure => LEGACY_SEED_IDS.has(structure.id));
    const storedManifest = await db.get(MANIFEST_STORE, MANIFEST_VERSION_KEY);

    if (storedStructures.length === 0 || isLegacySeed || storedManifest?.version !== STRUCTURES_VERSION) {
      const response = await fetch("./structures.json");
      if (!response.ok) {
        throw new Error(`Failed to load structures.json: ${response.status}`);
      }

      const manifest: { version?: string; structures?: Structure[] } = await response.json();
      if (manifest.version !== STRUCTURES_VERSION) {
        throw new Error(`Unexpected structures.json version: ${manifest.version ?? "missing"}`);
      }
      if (!Array.isArray(manifest.structures) || manifest.structures.length === 0) {
        throw new Error("structures.json does not contain any structures");
      }

      const replaceStoredStructures = storedStructures.length === 0 || isLegacySeed;
      const storedIds = new Set(storedStructures.map(structure => structure.id));
      const newStructures = replaceStoredStructures
        ? manifest.structures
        : manifest.structures.filter(structure => !storedIds.has(structure.id));
      const tx = db.transaction([STRUCTURES_STORE, MANIFEST_STORE], "readwrite");
      if (replaceStoredStructures) {
        await tx.objectStore(STRUCTURES_STORE).clear();
      }
      for (const structure of newStructures) {
        await tx.objectStore(STRUCTURES_STORE).put(structure);
      }
      await tx.objectStore(MANIFEST_STORE).put({ id: MANIFEST_VERSION_KEY, version: STRUCTURES_VERSION });
      await tx.done;
      this.structuresCache = replaceStoredStructures
        ? manifest.structures
        : storedStructures.concat(newStructures);
    } else {
      this.structuresCache = storedStructures;
    }

    return this.structuresCache;
  }

  async getStructure(id: string): Promise<Structure | undefined> {
    const structures = await this.loadStructures();
    return structures.find(s => s.id === id);
  }

  // Synchronous version for UI rendering - cache must be loaded first
  getStructureSync(id: string): Structure | undefined {
    return this.structuresCache?.find(s => s.id === id);
  }

  async getStructuresBySystem(system: BodySystem): Promise<Structure[]> {
    const db = await this.ensureDB();
    return db.getAllFromIndex(STRUCTURES_STORE, "by-system", system);
  }

  async getStructuresByRegion(region: string): Promise<Structure[]> {
    const db = await this.ensureDB();
    return db.getAllFromIndex(STRUCTURES_STORE, "by-region", region);
  }

  getAllStructures(): Structure[] {
    return this.structuresCache || [];
  }

  // Synchronous version for UI rendering - cache must be loaded first
  getAllStructuresSync(): Structure[] {
    return this.structuresCache || [];
  }

  async saveProgress(progress: ProgressData): Promise<void> {
    const db = await this.ensureDB();
    await db.put("progress", { id: PROGRESS_KEY, ...progress } as any);
  }

  async loadProgress(): Promise<ProgressData | null> {
    const db = await this.ensureDB();
    const data = await db.get("progress", PROGRESS_KEY);
    return data ? { ...data, id: undefined } as ProgressData : null;
  }

  async clearProgress(): Promise<void> {
    const db = await this.ensureDB();
    await db.delete("progress", PROGRESS_KEY);
  }

  async saveSettings(settings: Partial<UserSettings>): Promise<void> {
    const db = await this.ensureDB();
    const current = await db.get("settings", SETTINGS_KEY) || { id: SETTINGS_KEY } as any;
    await db.put("settings", { ...current, ...settings });
  }

  async loadSettings(): Promise<UserSettings | null> {
    const db = await this.ensureDB();
    const data = await db.get("settings", SETTINGS_KEY);
    return data ? { ...data, id: undefined } as UserSettings : null;
  }

  async exportAllData(): Promise<{ structures: Structure[]; progress: ProgressData | null; settings: UserSettings | null }> {
    const [structures, progress, settings] = await Promise.all([
      this.loadStructures(),
      this.loadProgress(),
      this.loadSettings(),
    ]);
    return { structures, progress, settings };
  }

  async importData(data: { structures?: Structure[]; progress?: ProgressData; settings?: UserSettings }): Promise<void> {
    if (data.structures) await this.saveStructures(data.structures);
    if (data.progress) await this.saveProgress(data.progress);
    if (data.settings) await this.saveSettings(data.settings);
  }

  async clearAllData(): Promise<void> {
    const db = await this.ensureDB();
    const tx = db.transaction([STRUCTURES_STORE, MANIFEST_STORE, "progress", "settings"], "readwrite");
    await tx.objectStore(STRUCTURES_STORE).clear();
    await tx.objectStore(MANIFEST_STORE).clear();
    await tx.objectStore("progress").clear();
    await tx.objectStore("settings").clear();
    await tx.done;
    this.structuresCache = null;
  }
}