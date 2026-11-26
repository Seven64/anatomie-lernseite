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
    value: StoredProgress;
  };
  settings: {
    key: string;
    value: StoredSettings;
  };
  cache: {
    key: string;
    value: { id: string; data: unknown };
  };
}

type StoredProgress = ProgressData & { id: string };
type StoredSettings = Partial<UserSettings> & { id: string };

const DB_NAME = "anatomy-learning";
const DB_VERSION = 3;
const STRUCTURES_STORE = "structures";
const MANIFEST_STORE = "manifest";
const MANIFEST_VERSION_KEY = "structures-version";
const STRUCTURES_VERSION = "1.1";
const PROGRESS_KEY = "user-progress";
const SETTINGS_KEY = "user-settings";
const CACHE_STORE = "cache";
const DB_OPEN_TIMEOUT_MS = 4000;

/** Wird ausgelöst, wenn ein anderer Tab (ältere Version) das Datenbank-Upgrade blockiert. */
export const DB_BLOCKED_EVENT = "db-blocked";
/** Wird ausgelöst, wenn ein anderer Tab eine neuere App-Version geöffnet hat. */
export const DB_OUTDATED_EVENT = "db-outdated";

export { STRUCTURES_VERSION };

/**
 * Z-Anatomy enthält neben echten Strukturen auch Beschriftungs- (Suffix „.j“) und
 * Gruppenknoten („.g“) ohne eigene Geometrie. Diese eignen sich nicht als Lernkarten.
 */
export function isLearnableStructure(structure: Structure): boolean {
  return Boolean(structure.nameLatin) && !/\.[gj]$/.test(structure.nameLatin);
}

/** Leerer Lernfortschritt – gemeinsame Vorlage für alle Modi. */
export function createEmptyProgress(): ProgressData {
  return {
    version: "1.0",
    userId: "local",
    quizResults: [],
    flashcardProgress: [],
    notes: {},
    bookmarks: [],
    lastUpdated: new Date().toISOString(),
  };
}

export class DataManager {
  private db: IDBPDatabase<AnatomyDB> | null = null;
  private structuresCache: Structure[] | null = null;
  private structuresById = new Map<string, Structure>();
  private structuresBySystem = new Map<BodySystem, Structure[]>();
  private dbReady: Promise<void>;
  private progressQueue: Promise<unknown> = Promise.resolve();

  constructor() {
    this.dbReady = this.initDB().catch(error => {
      console.error("IndexedDB unavailable:", error);
      this.db = null;
    });
  }

  /**
   * Öffnet die Datenbank. Ist noch ein Tab mit einer älteren Version offen, blockiert
   * dieser das Upgrade („blocked“) – dann informieren wir die Oberfläche. Umgekehrt geben
   * wir die eigene Verbindung frei, sobald ein anderer Tab upgraden will („blocking“).
   */
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
        if (oldVersion < 3) {
          db.createObjectStore(CACHE_STORE, { keyPath: "id" });
        }
      },
      blocked: () => {
        window.dispatchEvent(new CustomEvent(DB_BLOCKED_EVENT));
      },
      blocking: () => {
        this.db?.close();
        this.db = null;
        window.dispatchEvent(new CustomEvent(DB_OUTDATED_EVENT));
      },
      terminated: () => {
        this.db = null;
      },
    });
  }

  private async ensureDB(): Promise<IDBPDatabase<AnatomyDB>> {
    await this.dbReady;
    if (!this.db) throw new Error("Database not initialized");
    return this.db;
  }

  /** Wartet höchstens `timeoutMs` auf die Datenbank; null, wenn sie (noch) nicht verfügbar ist. */
  private async tryDB(timeoutMs: number): Promise<IDBPDatabase<AnatomyDB> | null> {
    const timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), timeoutMs));
    return Promise.race([this.dbReady.then(() => this.db), timeout]);
  }

  async saveStructures(structures: Structure[]): Promise<void> {
    const db = await this.ensureDB();
    const tx = db.transaction(STRUCTURES_STORE, "readwrite");
    await Promise.all([...structures.map(structure => tx.store.put(structure)), tx.done]);
    this.setStructuresCache(structures);
  }

  private setStructuresCache(structures: Structure[] | null): void {
    this.structuresCache = structures;
    this.structuresById = new Map((structures ?? []).map(structure => [structure.id, structure]));
    this.structuresBySystem = new Map();
    (structures ?? []).forEach(structure => {
      const list = this.structuresBySystem.get(structure.system);
      if (list) list.push(structure);
      else this.structuresBySystem.set(structure.system, [structure]);
    });
  }

  private async fetchManifest(): Promise<Structure[]> {
    const response = await fetch("./structures.json");
    if (!response.ok) throw new Error(`Failed to load structures.json: ${response.status}`);
    const manifest: { version?: string; structures?: Structure[] } = await response.json();
    if (manifest.version !== STRUCTURES_VERSION) {
      throw new Error(`Unexpected structures.json version: ${manifest.version ?? "missing"}`);
    }
    if (!Array.isArray(manifest.structures) || manifest.structures.length === 0) {
      throw new Error("structures.json does not contain any structures");
    }
    return manifest.structures;
  }

  /**
   * Lädt die Strukturen aus IndexedDB oder – bei neuer Datenversion bzw. leerer DB –
   * aus structures.json. Ist die Datenbank blockiert oder nicht verfügbar, arbeitet die
   * App mit den Daten aus structures.json im Speicher weiter, statt leer zu bleiben.
   */
  async loadStructures(): Promise<Structure[]> {
    if (this.structuresCache) return this.structuresCache;

    const db = await this.tryDB(DB_OPEN_TIMEOUT_MS);
    if (!db) {
      console.warn("IndexedDB not available in time – using structures.json without local cache");
      this.setStructuresCache(await this.fetchManifest());
      return this.structuresCache ?? [];
    }

    const [storedStructures, storedManifest] = await Promise.all([
      db.getAll(STRUCTURES_STORE),
      db.get(MANIFEST_STORE, MANIFEST_VERSION_KEY),
    ]);
    if (storedStructures.length > 0 && storedManifest?.version === STRUCTURES_VERSION) {
      this.setStructuresCache(storedStructures);
      return storedStructures;
    }

    // Strukturdaten sind statisch: bei neuer Version vollständig ersetzen.
    const structures = await this.fetchManifest();
    this.setStructuresCache(structures);
    try {
      const tx = db.transaction([STRUCTURES_STORE, MANIFEST_STORE], "readwrite");
      const store = tx.objectStore(STRUCTURES_STORE);
      await store.clear();
      await Promise.all([
        ...structures.map(structure => store.put(structure)),
        tx.objectStore(MANIFEST_STORE).put({ id: MANIFEST_VERSION_KEY, version: STRUCTURES_VERSION }),
        tx.done,
      ]);
    } catch (error) {
      console.error("Failed to cache structures in IndexedDB:", error);
    }
    return structures;
  }

  async getStructure(id: string): Promise<Structure | undefined> {
    await this.loadStructures();
    return this.structuresById.get(id);
  }

  // Synchronous version for UI rendering - cache must be loaded first
  getStructureSync(id: string): Structure | undefined {
    return this.structuresById.get(id);
  }

  /** Synchron, O(1): alle Strukturen eines Systems (Cache muss geladen sein). */
  getStructuresBySystemSync(system: BodySystem): Structure[] {
    return this.structuresBySystem.get(system) ?? [];
  }

  async getStructuresBySystem(system: BodySystem): Promise<Structure[]> {
    if (this.structuresCache) return this.getStructuresBySystemSync(system);
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

  /** @deprecated Alias für {@link getAllStructures}. */
  getAllStructuresSync(): Structure[] {
    return this.getAllStructures();
  }

  async saveProgress(progress: ProgressData): Promise<void> {
    const db = await this.ensureDB();
    await db.put("progress", { ...progress, id: PROGRESS_KEY });
  }

  /**
   * Ändert den Lernfortschritt atomar: lädt den aktuellen Stand, wendet `mutate` an und
   * speichert. Aufrufe werden nacheinander ausgeführt, damit sich Modi (Quiz, Karteikarten,
   * Notizen/Lesezeichen) nicht gegenseitig mit veralteten Kopien überschreiben.
   */
  updateProgress(mutate: (progress: ProgressData) => void): Promise<ProgressData> {
    const run = async () => {
      const progress = await this.loadProgress() ?? createEmptyProgress();
      mutate(progress);
      progress.lastUpdated = new Date().toISOString();
      await this.saveProgress(progress);
      return progress;
    };
    const result = this.progressQueue.then(run, run);
    this.progressQueue = result.catch(() => undefined);
    return result;
  }

  async loadProgress(): Promise<ProgressData | null> {
    const db = await this.tryDB(DB_OPEN_TIMEOUT_MS);
    if (!db) return null;
    const data = await db.get("progress", PROGRESS_KEY);
    if (!data) return null;
    const { id: _id, ...progress } = data;
    return progress;
  }

  /** Lädt einen Eintrag aus dem generischen Cache-Store (z. B. Muskelschichten). */
  async loadCache<T>(key: string): Promise<T | null> {
    const db = await this.tryDB(DB_OPEN_TIMEOUT_MS);
    if (!db) return null;
    const entry = await db.get(CACHE_STORE, key);
    return entry ? (entry.data as T) : null;
  }

  async saveCache(key: string, data: unknown): Promise<void> {
    const db = await this.tryDB(DB_OPEN_TIMEOUT_MS);
    if (db) await db.put(CACHE_STORE, { id: key, data });
  }

  async clearProgress(): Promise<void> {
    const db = await this.ensureDB();
    await db.delete("progress", PROGRESS_KEY);
  }

  async saveSettings(settings: Partial<UserSettings>): Promise<void> {
    const db = await this.ensureDB();
    const current = await db.get("settings", SETTINGS_KEY) ?? { id: SETTINGS_KEY };
    await db.put("settings", { ...current, ...settings, id: SETTINGS_KEY });
  }

  async loadSettings(): Promise<UserSettings | null> {
    const db = await this.ensureDB();
    const data = await db.get("settings", SETTINGS_KEY);
    if (!data) return null;
    const { id: _id, ...settings } = data;
    return settings as UserSettings;
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
    const tx = db.transaction([STRUCTURES_STORE, MANIFEST_STORE, "progress", "settings", CACHE_STORE], "readwrite");
    await Promise.all([
      tx.objectStore(STRUCTURES_STORE).clear(),
      tx.objectStore(MANIFEST_STORE).clear(),
      tx.objectStore("progress").clear(),
      tx.objectStore("settings").clear(),
      tx.objectStore(CACHE_STORE).clear(),
      tx.done,
    ]);
    this.setStructuresCache(null);
  }
}