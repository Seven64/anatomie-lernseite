import { DataManager, isLearnableStructure } from "../utils/DataManager";
import { SettingsManager } from "../utils/SettingsManager";
import { Structure, BodySystem, QuizResult } from "../types";
import { regionLabel, systemLabel } from "../ui/constants";
import { PreviewViewer } from "../utils/PreviewViewer";
import { escapeHtml, shuffle } from "../utils/text";

type QuizModeType = "locate" | "identify";

export class QuizMode {
  private dataManager: DataManager;
  private settingsManager: SettingsManager;

  private currentMode: QuizModeType = "identify";
  private filterSystem: BodySystem | "all" = "all";
  private filterRegion: string = "all";
  private structures: Structure[] = [];
  private currentStructure: Structure | null = null;
  private currentQuestionIndex: number = 0;
  private score: number = 0;
  private total: number = 0;
  private options: Structure[] = [];
  private isActive: boolean = false;
  private viewer: PreviewViewer | null = null;
  private answered = false;
  private questionShownAt = 0;
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

  private async initMode(): Promise<void> {
    this.bindFilters();
    this.bindQuizEvents();
    this.applyFilters();
  }


  private bindFilters(): void {
    const container = document.getElementById("canvas-container")!;
    container.innerHTML = this.getQuizHTML();
  }

  private getQuizHTML(): string {
    const systems = [...new Set(this.dataManager.getAllStructures().map(s => s.system))].sort();
    const regions = [...new Set(this.dataManager.getAllStructures().map(s => s.region).filter(Boolean))].sort();
    return `
      <div class="quiz-container" style="height: 100%; display: flex; flex-direction: column;">
        <div style="display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; align-items: center;">
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-secondary" id="mode-locate" data-mode="locate">Wo ist …?</button>
            <button class="btn btn-primary" id="mode-identify" data-mode="identify">Wie heißt …?</button>
          </div>
          <select class="select" id="filter-system" style="min-width: 180px;">
            <option value="all">Alle Systeme</option>
            ${systems.map(s => `<option value="${s}">${escapeHtml(systemLabel(s))}</option>`).join("")}
          </select>
          <select class="select" id="filter-region" style="min-width: 180px;">
            <option value="all">Alle Regionen</option>
            ${regions.map(r => `<option value="${escapeHtml(r!)}">${escapeHtml(regionLabel(r!))}</option>`).join("")}
          </select>
        </div>
        <div class="quiz-progress">
          <div class="quiz-progress-bar"><div class="quiz-progress-fill" id="quiz-progress" style="width: 0%"></div></div>
          <span class="quiz-progress-text" id="quiz-score">0 / 0</span>
        </div>
        <div class="quiz-question" id="quiz-question">Lade Frage...</div>
        <div style="flex: 1; position: relative; min-height: 300px;">
          <div class="canvas-container" id="quiz-canvas"></div>
          <div class="loading-overlay" id="quiz-loading" style="display: none;">
            <div class="loading-spinner"></div>
            <div class="loading-text">Lade 3D-Modell...</div>
          </div>
        </div>
        <div class="quiz-options" id="quiz-options" style="display: none;"></div>
        <div style="display: flex; gap: 12px; flex-wrap: wrap; justify-content: center;">
          <input type="text" class="search-input" id="free-text-input" placeholder="Strukturnamen eingeben..." style="flex: 1; min-width: 200px; max-width: 400px; display: none;" autocomplete="off">
          <button class="btn btn-primary" id="submit-answer" style="display: none;">Prüfen</button>
          <button class="btn btn-secondary" id="next-question">Nächste Frage</button>
        </div>
        <div id="quiz-feedback" class="quiz-feedback" style="display: none;"></div>
      </div>
    `;
  }

  private bindQuizEvents(): void {
    document.getElementById("mode-locate")!.addEventListener("click", () => this.setQuizMode("locate"));
    document.getElementById("mode-identify")!.addEventListener("click", () => this.setQuizMode("identify"));
    document.getElementById("filter-system")!.addEventListener("change", (e) => { this.filterSystem = (e.target as HTMLSelectElement).value as BodySystem | "all"; this.applyFilters(); });
    document.getElementById("filter-region")!.addEventListener("change", (e) => { this.filterRegion = (e.target as HTMLSelectElement).value; this.applyFilters(); });
    document.getElementById("submit-answer")!.addEventListener("click", () => this.checkAnswer());
    document.getElementById("next-question")!.addEventListener("click", () => this.nextQuestion());
    document.getElementById("free-text-input")!.addEventListener("keydown", (e) => { if (e.key === "Enter") this.checkAnswer(); });
  }

  private setQuizMode(mode: QuizModeType): void {
    this.currentMode = mode;
    (["locate", "identify"] as const).forEach(type => {
      const button = document.getElementById(`mode-${type}`)!;
      button.classList.toggle("btn-primary", type === mode);
      button.classList.toggle("btn-secondary", type !== mode);
      button.setAttribute("aria-pressed", String(type === mode));
    });
    document.getElementById("free-text-input")!.style.display = mode === "identify" ? "none" : "block";
    document.getElementById("submit-answer")!.style.display = mode === "identify" ? "none" : "inline-flex";
    document.getElementById("quiz-options")!.style.display = mode === "identify" ? "grid" : "none";
    this.nextQuestion();
  }

  private applyFilters(): void {
    this.structures = this.dataManager.getAllStructures().filter(s => {
      if (!isLearnableStructure(s)) return false;
      if (this.filterSystem !== "all" && s.system !== this.filterSystem) return false;
      if (this.filterRegion !== "all" && s.region !== this.filterRegion) return false;
      return true;
    });
    shuffle(this.structures);
    this.currentQuestionIndex = 0;
    this.score = 0;
    this.total = 0;
    if (this.isActive) this.nextQuestion();
  }

  private async nextQuestion(attempt = 0): Promise<void> {
    if (this.nextTimer) clearTimeout(this.nextTimer);
    this.nextTimer = null;
    if (this.structures.length === 0) {
      document.getElementById("quiz-question")!.textContent = "Keine Strukturen für diese Filter";
      return;
    }

    if (this.currentQuestionIndex >= this.structures.length) {
      shuffle(this.structures);
      this.currentQuestionIndex = 0;
    }

    this.currentStructure = this.structures[this.currentQuestionIndex++];
    this.answered = false;

    if (this.currentMode === "locate") {
      const name = this.settingsManager.getLabel(this.currentStructure);
      document.getElementById("quiz-question")!.textContent = `Wo ist: ${name}?`;
      document.getElementById("quiz-options")!.style.display = "none";
      document.getElementById("free-text-input")!.style.display = "none";
      document.getElementById("submit-answer")!.style.display = "none";
    } else {
      document.getElementById("quiz-question")!.textContent = "Wie heißt die markierte Struktur?";
      document.getElementById("quiz-options")!.style.display = "grid";
      document.getElementById("free-text-input")!.style.display = "none";
      document.getElementById("submit-answer")!.style.display = "none";
    }

    document.getElementById("quiz-feedback")!.style.display = "none";
    // Strukturen ohne Geometrie überspringen (begrenzt, um Endlosschleifen zu vermeiden).
    if (!(await this.loadScene(this.currentStructure)) && attempt < 10 && this.isActive) {
      return this.nextQuestion(attempt + 1);
    }
    this.total++;
    this.questionShownAt = performance.now();
    this.updateProgress();
  }

  private async loadScene(structure: Structure): Promise<boolean> {
    const loading = document.getElementById("quiz-loading")!;
    loading.style.display = "flex";
    try {
      this.viewer ??= this.createViewer();
      if (!(await this.viewer.show(structure, this.currentMode === "identify"))) return false;
      if (this.currentMode === "identify") await this.generateOptions(structure);
      return true;
    } catch (error) {
      console.error("Failed to load quiz model:", error);
      document.getElementById("quiz-question")!.textContent = "Modell konnte nicht geladen werden";
      return true;
    } finally {
      loading.style.display = "none";
    }
  }

  private createViewer(): PreviewViewer {
    const viewer = new PreviewViewer(document.getElementById("quiz-canvas")!);
    viewer.canvas.addEventListener("click", event => {
      if (!this.isActive || this.currentMode !== "locate" || !this.currentStructure || this.answered) return;
      const hit = viewer.hitsTarget(event);
      if (hit === null) return;
      const name = this.settingsManager.getLabel(this.currentStructure);
      if (hit) {
        this.answered = true;
        this.recordResult(true);
        this.showFeedback(true, name);
        this.scheduleNextQuestion();
      } else {
        this.showFeedback(false, name);
      }
    });
    return viewer;
  }

  private scheduleNextQuestion(): void {
    if (this.nextTimer) clearTimeout(this.nextTimer);
    this.nextTimer = setTimeout(() => {
      this.nextTimer = null;
      if (this.isActive) void this.nextQuestion();
    }, 1500);
  }

  private async generateOptions(correct: Structure): Promise<void> {
    const container = document.getElementById("quiz-options")!;
    const sameSystem = this.dataManager.getStructuresBySystemSync(correct.system)
      .filter(s => s.id !== correct.id && isLearnableStructure(s));
    shuffle(sameSystem);
    this.options = [correct, ...sameSystem.slice(0, 3)];
    shuffle(this.options);

    container.innerHTML = this.options.map((opt, i) => `
      <button class="quiz-option" data-index="${i}">${escapeHtml(this.settingsManager.getLabel(opt))}</button>
    `).join("");

    container.querySelectorAll(".quiz-option").forEach(btn => {
      btn.addEventListener("click", () => this.selectOption(parseInt((btn as HTMLElement).dataset.index!)));
    });
  }

  private selectOption(index: number): void {
    document.querySelectorAll(".quiz-option").forEach(btn => btn.classList.remove("selected"));
    document.querySelector(`.quiz-option[data-index="${index}"]`)!.classList.add("selected");
    this.checkAnswer();
  }

  private checkAnswer(): void {
    if (this.currentMode === "identify") {
      const selected = document.querySelector(".quiz-option.selected");
      if (!selected || this.answered) return;
      this.answered = true;
      const index = parseInt((selected as HTMLElement).dataset.index!);
      const isCorrect = this.options[index].id === this.currentStructure!.id;
      this.recordResult(isCorrect);
      this.showFeedback(isCorrect, this.settingsManager.getLabel(this.currentStructure!));
      selected.classList.add(isCorrect ? "correct" : "incorrect");
      document.querySelector(`.quiz-option[data-index="${this.options.findIndex(o => o.id === this.currentStructure!.id)}"]`)!.classList.add("correct");
      this.scheduleNextQuestion();
    }
  }

  private recordResult(correct: boolean): void {
    if (!this.currentStructure) return;
    this.score += correct ? 1 : 0;
    const result: QuizResult = {
      structureId: this.currentStructure.id,
      mode: this.currentMode,
      correct,
      timestamp: new Date().toISOString(),
      responseTime: Math.round(performance.now() - this.questionShownAt),
    };
    this.updateProgress();
    void this.dataManager.updateProgress(progress => { progress.quizResults.push(result); }).catch(error =>
      console.error("Failed to save quiz result:", error)
    );
  }

  private showFeedback(correct: boolean, correctName: string): void {
    const feedback = document.getElementById("quiz-feedback")!;
    feedback.style.display = "flex";
    feedback.innerHTML = `
      <span class="${correct ? "feedback-correct" : "feedback-incorrect"}">
        ${correct ? "✓ Richtig!" : "✗ Falsch"}
      </span>
      <span class="feedback-detail">${correct ? "" : `Richtige Antwort: ${escapeHtml(correctName)}`}</span>
    `;
  }

  private updateProgress(): void {
    const fill = document.getElementById("quiz-progress")!;
    const scoreEl = document.getElementById("quiz-score")!;
    fill.style.width = `${(this.currentQuestionIndex / Math.max(this.structures.length, 1)) * 100}%`;
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