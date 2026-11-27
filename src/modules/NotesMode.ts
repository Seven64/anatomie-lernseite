import { DataManager, createEmptyProgress, isLearnableStructure } from "../utils/DataManager";
import { regionLabel, systemLabel } from "../ui/constants";
import { escapeHtml } from "../utils/text";
import { UIManager } from "../utils/UIManager";
import { SettingsManager } from "../utils/SettingsManager";
import { ProgressData } from "../types";

export class NotesMode {
  private dataManager: DataManager;
  private uiManager: UIManager;
  private settingsManager: SettingsManager;

  private progressData: ProgressData | null = null;
  private isActive: boolean = false;
  private currentTab: "notes" | "bookmarks" = "notes";
  private searchQuery: string = "";
  private ready: Promise<void> = Promise.resolve();

  constructor(dataManager: DataManager, uiManager: UIManager, settingsManager: SettingsManager) {
    this.dataManager = dataManager;
    this.uiManager = uiManager;
    this.settingsManager = settingsManager;
  }

  setActive(active: boolean): void {
    this.isActive = active;
    if (active) {
      this.ready = this.initMode();
    } else {
      this.cleanup();
    }
  }

  private async initMode(): Promise<void> {
    await this.ensureProgressData();
    this.renderUI();
  }

  /** Immer frisch laden – andere Modi können den Fortschritt inzwischen geändert haben. */
  private async ensureProgressData(): Promise<void> {
    this.progressData = await this.dataManager.loadProgress() ?? createEmptyProgress();
  }


  private renderUI(): void {
    const container = document.getElementById("canvas-container")!;
    container.innerHTML = this.getNotesHTML();
    this.bindEvents();
    this.renderContent();
  }

  private getNotesHTML(): string {
    return `
      <div style="height: 100%; display: flex; flex-direction: column; padding: 20px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
          <h2 style="font-weight: 600;">Notizen & Lesezeichen</h2>
          <div style="display: flex; gap: 8px; align-items: center;">
            <input type="text" class="search-input" id="notes-search" placeholder="Suchen..." style="max-width: 300px;">
            <div style="display: flex; gap: 4px; background: var(--bg-tertiary); border-radius: 8px; padding: 4px;">
              <button class="btn btn-secondary" id="tab-notes" data-tab="notes" style="padding: 8px 16px;">Notizen</button>
              <button class="btn btn-secondary" id="tab-bookmarks" data-tab="bookmarks" style="padding: 8px 16px;">Lesezeichen</button>
            </div>
          </div>
        </div>

        <div style="flex: 1; overflow-y: auto;" id="notes-content">
          <!-- Content rendered dynamically -->
        </div>

        <div id="note-editor" style="display: none; border-top: 1px solid var(--border); padding-top: 20px; margin-top: 20px;">
          <h3 style="margin-bottom: 12px;">Notiz bearbeiten</h3>
          <div class="form-group">
            <label for="note-structure">Struktur</label>
            <select class="select" id="note-structure"></select>
          </div>
          <div class="form-group">
            <label for="note-content">Inhalt</label>
            <textarea class="textarea" id="note-content" rows="6" placeholder="Ihre Notiz..."></textarea>
          </div>
          <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 16px;">
            <button class="btn btn-secondary" id="cancel-note">Abbrechen</button>
            <button class="btn btn-primary" id="save-note">Speichern</button>
          </div>
        </div>
      </div>
    `;
  }

  private bindEvents(): void {
    document.getElementById("tab-notes")!.addEventListener("click", () => this.switchTab("notes"));
    document.getElementById("tab-bookmarks")!.addEventListener("click", () => this.switchTab("bookmarks"));

    document.getElementById("save-note")!.addEventListener("click", () => this.saveNote());
    document.getElementById("cancel-note")!.addEventListener("click", () => this.hideEditor());

    document.getElementById("notes-search")!.addEventListener("input", (e) => {
      this.searchQuery = (e.target as HTMLInputElement).value.toLowerCase();
      this.renderContent();
    });
  }

  private switchTab(tab: "notes" | "bookmarks"): void {
    this.currentTab = tab;
    document.getElementById("tab-notes")!.classList.toggle("active", tab === "notes");
    document.getElementById("tab-bookmarks")!.classList.toggle("active", tab === "bookmarks");
    this.renderContent();
  }

  private renderContent(): void {
    const container = document.getElementById("notes-content")!;

    if (this.currentTab === "notes") {
      this.renderNotes(container);
    } else {
      this.renderBookmarks(container);
    }
  }

  private renderNotes(container: HTMLElement): void {
    const notes = this.progressData!.notes;
    const structures = this.dataManager.getAllStructuresSync();
    const structureMap = new Map(structures.map(s => [s.id, s]));

    const filteredEntries = Object.entries(notes)
      .filter(([id]) => structureMap.has(id))
      .filter(([id, note]) => {
        const structure = structureMap.get(id!);
        if (!structure) return true;
        const name = this.settingsManager.getLabel(structure);
        return (name || "").toLowerCase().includes(this.searchQuery) ||
               (note.content || "").toLowerCase().includes(this.searchQuery);
      })
      .sort((a, b) => new Date(b[1]?.lastModified || 0).getTime() - new Date(a[1]?.lastModified || 0).getTime());

    if (filteredEntries.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 60px 20px; color: var(--fg-muted);">
          <div style="font-size: 48px; margin-bottom: 16px;">📝</div>
          <p>Noch keine Notizen vorhanden.</p>
          <p style="font-size: 14px; margin-top: 8px;">Klicke im Atlas-Modus auf eine Struktur und dann auf "Notiz hinzufügen".</p>
        </div>
      `;
      return;
    }

    container.innerHTML = filteredEntries.map(([id, note]) => {
      const structure = structureMap.get(id)!;
      const name = this.settingsManager.getLabel(structure);
      const color = getComputedStyle(document.documentElement).getPropertyValue(`--system-${structure.system}`).trim() || "#888";
      const date = new Date(note.lastModified).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

      return `
        <div class="note-item" data-id="${escapeHtml(id)}" style="border-left: 3px solid ${color};">
          <div class="note-header">
            <span class="note-structure" style="color: ${color};">${escapeHtml(name)}</span>
            <span class="note-system">${escapeHtml(systemLabel(structure.system))}</span>
          </div>
          <div class="note-content">${escapeHtml(note.content)}</div>
          <div class="note-meta">
            <span>${date}</span>
            <div class="note-actions">
              <button class="btn-icon edit-note" data-id="${escapeHtml(id)}" title="Bearbeiten">✏️</button>
              <button class="btn-icon delete-note" data-id="${escapeHtml(id)}" title="Löschen">🗑️</button>
            </div>
          </div>
        </div>
      `;
    }).join("");

    container.querySelectorAll(".edit-note").forEach(btn => {
      btn.addEventListener("click", (e) => this.editNote((e.currentTarget as HTMLElement).dataset.id!));
    });
    container.querySelectorAll(".delete-note").forEach(btn => {
      btn.addEventListener("click", (e) => this.deleteNote((e.currentTarget as HTMLElement).dataset.id!));
    });
    container.querySelectorAll(".note-item").forEach(item => {
      item.addEventListener("click", (e) => {
        if (!(e.target as HTMLElement).classList.contains("btn-icon")) this.showInAtlas((item as HTMLElement).dataset.id!);
      });
    });
  }

  private renderBookmarks(container: HTMLElement): void {
    const bookmarks = this.progressData!.bookmarks;
    const structures = this.dataManager.getAllStructuresSync();
    const structureMap = new Map(structures.map(s => [s.id, s]));

    const filteredBookmarks = bookmarks
      .filter(id => structureMap.has(id))
      .filter(id => {
        const structure = structureMap.get(id)!;
        const name = this.settingsManager.getLabel(structure);
        return name.toLowerCase().includes(this.searchQuery);
      });

    if (filteredBookmarks.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 60px 20px; color: var(--fg-muted);">
          <div style="font-size: 48px; margin-bottom: 16px;">🔖</div>
          <p>Keine Lesezeichen vorhanden.</p>
          <p style="font-size: 14px; margin-top: 8px;">Klicke im Atlas-Modus auf eine Struktur und dann auf "Lesezeichen".</p>
        </div>
      `;
      return;
    }

    container.innerHTML = filteredBookmarks.map(id => {
      const structure = structureMap.get(id)!;
      const name = this.settingsManager.getLabel(structure);
      const color = getComputedStyle(document.documentElement).getPropertyValue(`--system-${structure.system}`).trim() || "#888";

      return `
        <div class="bookmark-item" data-id="${escapeHtml(id)}" style="border-left: 3px solid ${color};">
          <div class="bookmark-header">
            <span class="bookmark-structure" style="color: ${color};">${escapeHtml(name)}</span>
            <span class="bookmark-system">${escapeHtml(systemLabel(structure.system))}</span>
          </div>
          <div class="bookmark-meta">
            <span>${escapeHtml(structure.region ? regionLabel(structure.region) : "Unbekannte Region")}</span>
            <button class="btn-icon remove-bookmark" data-id="${escapeHtml(id)}" title="Entfernen">🗑️</button>
          </div>
        </div>
      `;
    }).join("");

    container.querySelectorAll(".remove-bookmark").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.removeBookmark((e.currentTarget as HTMLElement).dataset.id!);
      });
    });
    container.querySelectorAll(".bookmark-item").forEach(item => {
      item.addEventListener("click", () => this.showInAtlas((item as HTMLElement).dataset.id!));
    });
  }

  private editNote(structureId: string): void {
    const structure = this.dataManager.getStructureSync(structureId);
    if (!structure) return;

    const note = this.progressData!.notes[structureId] || { content: "" };

    const select = document.getElementById("note-structure") as HTMLSelectElement;
    const options = this.dataManager.getAllStructures()
      .filter(s => s.id === structureId || isLearnableStructure(s))
      .map(s => ({ id: s.id, label: `${this.settingsManager.getLabel(s)} (${systemLabel(s.system)})` }))
      .sort((a, b) => a.label.localeCompare(b.label, "de"));
    select.innerHTML = options.map(option =>
      `<option value="${escapeHtml(option.id)}"${option.id === structureId ? " selected" : ""}>${escapeHtml(option.label)}</option>`
    ).join("");
    select.value = structureId;

    (document.getElementById("note-content") as HTMLTextAreaElement).value = note.content;
    (document.getElementById("note-editor")!).style.display = "block";
    (document.getElementById("save-note")!).dataset.id = structureId;
  }

  private saveNote(): void {
    const originalId = (document.getElementById("save-note")! as HTMLButtonElement).dataset.id!;
    // Im Editor kann die Notiz einer anderen Struktur zugeordnet werden – sie wird dann verschoben.
    const structureId = (document.getElementById("note-structure") as HTMLSelectElement).value || originalId;
    const content = (document.getElementById("note-content") as HTMLTextAreaElement).value.trim();

    if (!content) {
      this.uiManager.showError("Notiz darf nicht leer sein");
      return;
    }
    if (structureId !== originalId && this.progressData!.notes[structureId] &&
      !confirm("Zu dieser Struktur gibt es bereits eine Notiz. Überschreiben?")) {
      return;
    }

    void this.mutate(progress => {
      if (structureId !== originalId) delete progress.notes[originalId];
      progress.notes[structureId] = { content, lastModified: new Date().toISOString() };
    }).then(() => {
      this.hideEditor();
      this.renderContent();
    });
  }

  private hideEditor(): void {
    (document.getElementById("note-editor")!).style.display = "none";
    (document.getElementById("save-note")!).dataset.id = "";
  }

  private deleteNote(structureId: string): void {
    if (confirm("Diese Notiz wirklich löschen?")) {
      void this.mutate(progress => { delete progress.notes[structureId]; }).then(() => this.renderContent());
    }
  }

  private removeBookmark(structureId: string): void {
    void this.mutate(progress => {
      progress.bookmarks = progress.bookmarks.filter(b => b !== structureId);
    }).then(() => this.renderContent());
  }

  async toggleBookmark(structureId: string): Promise<boolean> {
    await this.ready;
    let added = false;
    await this.mutate(progress => {
      const index = progress.bookmarks.indexOf(structureId);
      added = index < 0;
      if (added) progress.bookmarks.push(structureId);
      else progress.bookmarks.splice(index, 1);
    });
    if (this.isActive && this.currentTab === "bookmarks") this.renderContent();
    return added;
  }

  async openNoteEditor(structureId: string): Promise<void> {
    await this.ready;
    await this.ensureProgressData();
    if (!this.dataManager.getStructureSync(structureId)) {
      this.uiManager.showError("Struktur für die Notiz nicht gefunden");
      return;
    }
    this.editNote(structureId);
  }

  /** Wechselt in den Atlas und wählt die Struktur dort aus. */
  private showInAtlas(structureId: string): void {
    window.dispatchEvent(new CustomEvent("mode-change", { detail: "atlas" }));
    this.uiManager.selectStructure(structureId);
  }

  /** Änderung atomar speichern und lokale Kopie aktualisieren. */
  private async mutate(change: (progress: ProgressData) => void): Promise<void> {
    try {
      this.progressData = await this.dataManager.updateProgress(change);
    } catch (error) {
      console.error("Failed to save notes:", error);
      this.uiManager.showError("Änderung konnte nicht gespeichert werden");
    }
  }

  private cleanup(): void {
    const container = document.getElementById("canvas-container")!;
    container.innerHTML = "";
  }
}