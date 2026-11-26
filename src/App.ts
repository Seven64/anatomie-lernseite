import { DataManager, DB_BLOCKED_EVENT, DB_OUTDATED_EVENT } from "./utils/DataManager";
import { UIManager } from "./utils/UIManager";
import { SettingsManager } from "./utils/SettingsManager";
import { AtlasMode } from "./modules/AtlasMode";
import { LabelQuizMode } from "./modules/LabelQuizMode";
import { QuizMode } from "./modules/QuizMode";
import { FlashcardMode } from "./modules/FlashcardMode";
import { ProgressMode } from "./modules/ProgressMode";
import { NotesMode } from "./modules/NotesMode";

type Mode = "atlas" | "labelQuiz" | "quiz" | "flashcards" | "progress" | "notes";

export class App {
  private dataManager: DataManager;
  private uiManager: UIManager;
  private settingsManager: SettingsManager;

  private atlasMode: AtlasMode;
  private labelQuizMode: LabelQuizMode;
  private quizMode: QuizMode;
  private flashcardMode: FlashcardMode;
  private progressMode: ProgressMode;
  private notesMode: NotesMode;

  private currentMode: Mode | null = null;
  private structuresLoaded: boolean = false;

  constructor() {
    this.dataManager = new DataManager();
    this.settingsManager = new SettingsManager();
    this.uiManager = new UIManager(this.dataManager, this.settingsManager);

    this.atlasMode = new AtlasMode(this.dataManager, this.uiManager, this.settingsManager);
    this.labelQuizMode = new LabelQuizMode(this.dataManager, this.settingsManager);
    this.quizMode = new QuizMode(this.dataManager, this.settingsManager);
    this.flashcardMode = new FlashcardMode(this.dataManager, this.settingsManager);
    this.progressMode = new ProgressMode(this.dataManager, this.uiManager, this.settingsManager);
    this.notesMode = new NotesMode(this.dataManager, this.uiManager, this.settingsManager);
  }

  async init(): Promise<void> {
    // Nur im Dev-Server: Zugriff für Tests/Debugging über die Konsole (window.__app).
    if (import.meta.env.DEV) Object.assign(window, { __app: this });
    this.uiManager.init();
    this.bindGlobalEvents();
    this.showStartupLoading();
    await this.loadStructures();
    document.getElementById("canvas-container")!.innerHTML = "";
    this.switchMode("atlas");
  }

  /** Sichtbare Rückmeldung, solange Datenbank und Strukturdaten geladen werden. */
  private showStartupLoading(): void {
    document.getElementById("canvas-container")!.innerHTML = `
      <div class="loading-overlay" role="status" aria-live="polite">
        <div class="loading-spinner"></div>
        <div class="loading-text">Lade Anatomiedaten …</div>
      </div>`;
  }

  private bindGlobalEvents(): void {
    window.addEventListener(DB_BLOCKED_EVENT, () => {
      this.uiManager.showToast(
        "Die Anatomie Lernseite ist noch in einem anderen Tab geöffnet. Bitte diesen Tab schließen oder neu laden, damit Fortschritt gespeichert werden kann.",
        "warning"
      );
    });
    window.addEventListener(DB_OUTDATED_EVENT, () => {
      this.uiManager.showToast("Eine neuere Version wurde in einem anderen Tab geöffnet. Bitte diese Seite neu laden.", "warning");
    });

    window.addEventListener("mode-change", ((e: CustomEvent) => {
      this.switchMode(e.detail);
    }) as EventListener);

    window.addEventListener("add-note", ((e: CustomEvent) => {
      this.switchMode("notes");
      void this.notesMode.openNoteEditor(e.detail).catch(error => {
        console.error("Failed to open note editor:", error);
        this.uiManager.showError("Notiz konnte nicht geöffnet werden");
      });
    }) as EventListener);

    window.addEventListener("toggle-bookmark", ((e: CustomEvent) => {
      void this.notesMode.toggleBookmark(e.detail).then(isBookmarked => {
        this.uiManager.showToast(
          isBookmarked ? "Lesezeichen hinzugefügt" : "Lesezeichen entfernt",
          "success"
        );
      }).catch(error => {
        console.error("Failed to update bookmark:", error);
        this.uiManager.showError("Lesezeichen konnte nicht gespeichert werden");
      });
    }) as EventListener);

    window.addEventListener("get-flashcard-progress", (() => {
      // Could return flashcard progress for info panel
    }) as EventListener);

    window.addEventListener("isolate-structure", ((e: CustomEvent) => {
      this.atlasMode.isolateStructure(e.detail);
    }) as EventListener);

    window.addEventListener("hide-structure", ((e: CustomEvent) => {
      this.atlasMode.hideStructure(e.detail);
    }) as EventListener);

    window.addEventListener("reset-view", () => {
      this.atlasMode.resetView();
    });
  }

  private async loadStructures(): Promise<void> {
    if (this.structuresLoaded) return;

    const structures = await this.dataManager.loadStructures();
    if (structures.length === 0) {
      throw new Error("Keine Anatomiestrukturen verfügbar");
    }
    this.structuresLoaded = true;
  }

  private switchMode(mode: Mode): void {
    if (this.currentMode === mode) return;

    this.deactivateCurrentMode();
    this.currentMode = mode;
    this.uiManager.setActiveModeTab(mode);
    this.activateMode(mode);
  }

  private deactivateCurrentMode(): void {
    switch (this.currentMode) {
      case null:
        break;
      case "atlas":
        this.atlasMode.setActive(false);
        break;
      case "labelQuiz":
        this.labelQuizMode.setActive(false);
        break;
      case "quiz":
        this.quizMode.setActive(false);
        break;
      case "flashcards":
        this.flashcardMode.setActive(false);
        break;
      case "progress":
        this.progressMode.setActive(false);
        break;
      case "notes":
        this.notesMode.setActive(false);
        break;
    }
  }

  private activateMode(mode: Mode): void {
    switch (mode) {
      case "atlas":
        this.atlasMode.setActive(true);
        break;
      case "labelQuiz":
        this.labelQuizMode.setActive(true);
        break;
      case "quiz":
        this.quizMode.setActive(true);
        break;
      case "flashcards":
        this.flashcardMode.setActive(true);
        break;
      case "progress":
        this.progressMode.setActive(true);
        break;
      case "notes":
        this.notesMode.setActive(true);
        break;
    }
  }
}