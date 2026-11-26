import { DataManager, isLearnableStructure } from "../utils/DataManager";
import { SettingsManager } from "../utils/SettingsManager";
import { Structure } from "../types";
import { PreviewViewer } from "../utils/PreviewViewer";
import { escapeHtml, fuzzyMatch, shuffle, structureBaseName } from "../utils/text";

export class LabelQuizMode {
  private dataManager: DataManager;
  private settingsManager: SettingsManager;

  private currentStructure: Structure | null = null;
  private structures: Structure[] = [];
  private currentIndex: number = 0;
  private score: number = 0;
  private total: number = 0;
  private isActive: boolean = false;
  private answered = false;
  private viewer: PreviewViewer | null = null;
  private nextTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(dataManager: DataManager, settingsManager: SettingsManager) {
    this.dataManager = dataManager;
    this.settingsManager = settingsManager;
  }

  setActive(active: boolean): void {
    this.isActive = active;
    if (active) {
      this.initMode();
    } else {
      this.cleanup();
    }
  }

  private initMode(): void {
    this.structures = this.dataManager.getAllStructures().filter(isLearnableStructure);
    shuffle(this.structures);
    this.currentIndex = 0;
    this.score = 0;
    this.total = 0;
    this.bindEvents();
    this.nextQuestion();
  }

  private bindEvents(): void {
    const container = document.getElementById("canvas-container")!;
    container.innerHTML = this.getQuizHTML();
    this.bindQuizEvents();
  }

  private getQuizHTML(): string {
    return `
      <div class="quiz-container" style="height: 100%; display: flex; flex-direction: column;">
        <div class="quiz-progress">
          <div class="quiz-progress-bar"><div class="quiz-progress-fill" id="quiz-progress" style="width: 0%"></div></div>
          <span class="quiz-progress-text" id="quiz-score">0 / 0</span>
        </div>
        <div class="quiz-question" id="quiz-question">Lade Frage...</div>
        <div style="flex: 1; position: relative;">
          <div class="canvas-container" id="label-quiz-canvas"></div>
          <div class="loading-overlay" id="quiz-loading" style="display: none;">
            <div class="loading-spinner"></div>
            <div class="loading-text">Lade 3D-Modell...</div>
          </div>
        </div>
        <div style="display: flex; gap: 12px; flex-wrap: wrap; justify-content: center;">
          <input type="text" class="search-input" id="answer-input" placeholder="Strukturnamen eingeben..." style="flex: 1; min-width: 200px; max-width: 400px;" autocomplete="off">
          <button class="btn btn-primary" id="submit-answer">Prüfen</button>
          <button class="btn btn-secondary" id="skip-question">Überspringen</button>
        </div>
        <div id="quiz-feedback" class="quiz-feedback" style="display: none;"></div>
      </div>
    `;
  }

  private bindQuizEvents(): void {
    const input = document.getElementById("answer-input") as HTMLInputElement;
    input.addEventListener("keydown", (e: KeyboardEvent) => { if (e.key === "Enter") this.checkAnswer(); });
    document.getElementById("submit-answer")!.addEventListener("click", () => this.checkAnswer());
    document.getElementById("skip-question")!.addEventListener("click", () => this.nextQuestion());
  }

  private async nextQuestion(attempt = 0): Promise<void> {
    if (this.nextTimer) clearTimeout(this.nextTimer);
    this.nextTimer = null;
    if (this.currentIndex >= this.structures.length) {
      shuffle(this.structures);
      this.currentIndex = 0;
    }

    this.currentStructure = this.structures[this.currentIndex++];
    this.answered = false;
    document.getElementById("quiz-question")!.textContent = "Wie heißt die markierte Struktur?";
    (document.getElementById("answer-input") as HTMLInputElement).value = "";
    document.getElementById("quiz-feedback")!.style.display = "none";
    // Strukturen ohne Geometrie überspringen (begrenzt, um Endlosschleifen zu vermeiden).
    if (!(await this.loadStructureModel(this.currentStructure)) && attempt < 10 && this.isActive) {
      return this.nextQuestion(attempt + 1);
    }
    this.total++;
    this.updateProgress();
  }

  private async loadStructureModel(structure: Structure): Promise<boolean> {
    const loading = document.getElementById("quiz-loading")!;
    loading.style.display = "flex";
    try {
      this.viewer ??= new PreviewViewer(document.getElementById("label-quiz-canvas")!);
      return await this.viewer.show(structure);
    } catch (error) {
      console.error("Failed to load quiz model:", error);
      document.getElementById("quiz-question")!.textContent = "Modell konnte nicht geladen werden";
      return true;
    } finally {
      loading.style.display = "none";
    }
  }

  private checkAnswer(): void {
    const structure = this.currentStructure;
    const input = document.getElementById("answer-input") as HTMLInputElement;
    if (!structure || this.answered || !input.value.trim()) return;

    const names = [structure.nameLatin, structure.nameEn, structure.nameDe].filter((name): name is string => Boolean(name));
    const isCorrect = fuzzyMatch(input.value, names.map(structureBaseName));
    this.answered = true;
    this.score += isCorrect ? 1 : 0;
    this.showFeedback(isCorrect, this.settingsManager.getLabel(structure));
    this.updateProgress();
    if (this.nextTimer) clearTimeout(this.nextTimer);
    this.nextTimer = setTimeout(() => {
      this.nextTimer = null;
      if (this.isActive) void this.nextQuestion();
    }, 1500);
  }

  private showFeedback(correct: boolean, correctName: string): void {
    const feedback = document.getElementById("quiz-feedback")!;
    feedback.style.display = "flex";
    feedback.innerHTML = `
      <span class="${correct ? "feedback-correct" : "feedback-incorrect"}">
        ${correct ? "✓ Richtig!" : "✗ Falsch"}
      </span>
      <span class="feedback-detail">Richtige Antwort: ${escapeHtml(correctName)}</span>
    `;
  }

  private updateProgress(): void {
    const fill = document.getElementById("quiz-progress")!;
    const scoreEl = document.getElementById("quiz-score")!;
    fill.style.width = `${(this.currentIndex / Math.max(this.structures.length, 1)) * 100}%`;
    scoreEl.textContent = `${this.score} / ${this.total}`;
  }

  private cleanup(): void {
    if (this.nextTimer) clearTimeout(this.nextTimer);
    this.nextTimer = null;
    this.viewer?.dispose();
    this.viewer = null;
    document.getElementById("canvas-container")!.innerHTML = "";
  }
}