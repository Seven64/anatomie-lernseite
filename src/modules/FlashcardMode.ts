import { DataManager, createEmptyProgress, isLearnableStructure } from "../utils/DataManager";
import { SettingsManager } from "../utils/SettingsManager";
import { Structure, FlashcardProgress, ProgressData } from "../types";
import { regionLabel, systemLabel } from "../ui/constants";
import { applySm2, createFlashcardProgress, isDue } from "../utils/sm2";
import { escapeHtml, formatStructureName, shuffle } from "../utils/text";

export class FlashcardMode {
  private dataManager: DataManager;
  private settingsManager: SettingsManager;

  private flashcards: Structure[] = [];
  private currentIndex: number = 0;
  private isFlipped: boolean = false;
  private progressData: ProgressData | null = null;
  private progressById = new Map<string, FlashcardProgress>();
  private dailyGoal: number = 20;
  private reviewedToday: number = 0;
  private lastReviewDate: string = "";

  constructor(dataManager: DataManager, settingsManager: SettingsManager) {
    this.dataManager = dataManager;
    this.settingsManager = settingsManager;
  }

  setActive(active: boolean): void {
    if (active) {
      this.initMode();
    } else {
      this.cleanup();
    }
  }

  private async initMode(): Promise<void> {
    this.progressData = await this.dataManager.loadProgress() ?? createEmptyProgress();
    this.progressById = new Map(this.progressData.flashcardProgress.map(progress => [progress.structureId, progress]));
    this.dailyGoal = this.settingsManager.get("dailyGoal");
    this.loadDailyProgress();
    this.flashcards = this.dataManager.getAllStructures().filter(isLearnableStructure);
    this.reviewDueCards();
    this.bindUI();
    this.showCard();
  }

  private loadDailyProgress(): void {
    const today = new Date().toISOString().split("T")[0];
    if (this.lastReviewDate !== today) {
      this.reviewedToday = 0;
      this.lastReviewDate = today;
    }
  }

  private reviewDueCards(): void {
    const now = new Date();
    const due: Structure[] = [];
    const later: Structure[] = [];
    this.flashcards.forEach(structure =>
      (isDue(this.progressById.get(structure.id), now) ? due : later).push(structure)
    );
    const nextReview = (structure: Structure) => this.progressById.get(structure.id)?.nextReview ?? "";
    due.sort((a, b) => nextReview(a).localeCompare(nextReview(b)));

    this.flashcards = [...due, ...later];
    this.currentIndex = 0;
  }

  private bindUI(): void {
    const container = document.getElementById("canvas-container")!;
    container.innerHTML = this.getFlashcardHTML();
    this.bindEvents();
  }

  private getFlashcardHTML(): string {
    const now = new Date();
    const dueCount = this.flashcards.filter(structure => isDue(this.progressById.get(structure.id), now)).length;

    return `
      <div class="flashcard-container" style="height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px;">
        <div class="profile-stats" style="width: 100%; max-width: 480px; margin-bottom: 20px;">
          <div class="profile-stat">
            <div class="profile-stat-value" id="today-count">${this.reviewedToday}</div>
            <div class="profile-stat-label">Heute gelernt</div>
          </div>
          <div class="profile-stat">
            <div class="profile-stat-value" id="goal-count">${this.dailyGoal}</div>
            <div class="profile-stat-label">Tagesziel</div>
          </div>
          <div class="profile-stat">
            <div class="profile-stat-value" id="due-count">${dueCount}</div>
            <div class="profile-stat-label">Fällig</div>
          </div>
        </div>

        <div class="flashcard" id="flashcard" tabindex="0" role="button" aria-label="Karteikarte umdrehen">
          <div class="flashcard-face flashcard-front">
            <div class="flashcard-question" id="card-front">Lade Karte...</div>
            <div class="flashcard-hint">Klicken oder Leertaste zum Umdrehen</div>
          </div>
          <div class="flashcard-face flashcard-back">
            <div class="flashcard-answer" id="card-back"></div>
            <div class="flashcard-hint">Bewerten Sie Ihre Kenntnis</div>
          </div>
        </div>

        <div class="flashcard-controls" style="display: none; justify-content: center; gap: 12px; margin-top: 20px;" id="rating-controls">
          <button class="btn btn-danger" data-rating="0">Wiederholen</button>
          <button class="btn btn-warning" data-rating="3">Schwer</button>
          <button class="btn btn-secondary" data-rating="4">Gut</button>
          <button class="btn btn-success" data-rating="5">Leicht</button>
        </div>

        <div class="flashcard-stats" id="card-stats" style="display: none;"></div>

        <div style="margin-top: 24px; text-align: center; color: var(--fg-muted); font-size: 12px;">
          <span id="card-counter">0 / 0</span>
        </div>
      </div>
    `;
  }

  private bindEvents(): void {
    const card = document.getElementById("flashcard")!;
    card.addEventListener("click", () => this.flipCard());
    card.addEventListener("keydown", (e: KeyboardEvent) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); this.flipCard(); } });

    document.querySelectorAll("[data-rating]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const rating = parseInt((e.currentTarget as HTMLButtonElement).dataset.rating!);
        this.rateCard(rating);
      });
    });
  }

  private showCard(): void {
    if (this.currentIndex >= this.flashcards.length) {
      this.showCompletion();
      return;
    }

    const structure = this.flashcards[this.currentIndex];
    const frontName = this.settingsManager.getLabel(structure);

    document.getElementById("card-front")!.textContent = frontName;
    document.getElementById("card-back")!.innerHTML = `
      <div><strong>Name:</strong> ${escapeHtml(formatStructureName(structure.nameLatin))}</div>
      ${structure.nameDe ? `<div><strong>Deutsch:</strong> ${escapeHtml(formatStructureName(structure.nameDe))}</div>` : ""}
      ${structure.nameEn ? `<div><strong>Englisch:</strong> ${escapeHtml(formatStructureName(structure.nameEn))}</div>` : ""}
      <div style="margin-top: 12px;"><strong>System:</strong> ${escapeHtml(systemLabel(structure.system))}</div>
      <div><strong>Region:</strong> ${escapeHtml(structure.region ? regionLabel(structure.region) : "—")}</div>
    `;

    document.getElementById("card-stats")!.style.display = "none";
    document.getElementById("rating-controls")!.style.display = "none";
    document.getElementById("card-counter")!.textContent = `${this.currentIndex + 1} / ${this.flashcards.length}`;

    const card = document.getElementById("flashcard")!;
    card.classList.remove("flipped");
    this.isFlipped = false;
  }

  private flipCard(): void {
    const card = document.getElementById("flashcard")!;
    if (!this.isFlipped) {
      card.classList.add("flipped");
      this.isFlipped = true;
      document.getElementById("rating-controls")!.style.display = "flex";
      this.showCardStats();
    }
  }

  private showCardStats(): void {
    const structure = this.flashcards[this.currentIndex];
    const progress = this.progressById.get(structure.id);
    const stats = document.getElementById("card-stats")!;
    if (progress) {
      stats.style.display = "flex";
      stats.innerHTML = `
        <span>Wiederholungen: ${progress.repetitions}</span>
        <span>Intervall: ${progress.interval} Tage</span>
        <span>Leichtigkeit: ${progress.easeFactor.toFixed(2)}</span>
        <span>Nächste: ${new Date(progress.nextReview).toLocaleDateString("de-DE")}</span>
      `;
    } else {
      stats.style.display = "none";
    }
  }

  private rateCard(rating: number): void {
    const structure = this.flashcards[this.currentIndex];
    const previous = this.progressById.get(structure.id) ?? createFlashcardProgress(structure.id);
    const updated = applySm2(previous, rating);
    this.progressById.set(structure.id, updated);
    this.progressData!.flashcardProgress = [...this.progressById.values()];
    void this.dataManager.updateProgress(progress => {
      progress.flashcardProgress = progress.flashcardProgress.filter(card => card.structureId !== structure.id);
      progress.flashcardProgress.push(updated);
    }).catch(error => console.error("Failed to save flashcard progress:", error));

    this.reviewedToday++;

    this.currentIndex++;
    this.showCard();
    this.updateDailyCount();
  }

  private showCompletion(): void {
    const container = document.getElementById("flashcard")!;
    container.innerHTML = `
      <div style="text-align: center; padding: 40px;">
        <div style="font-size: 48px; margin-bottom: 16px;">🎉</div>
        <h2 style="margin-bottom: 12px;">Tagesziel erreicht!</h2>
        <p style="color: var(--fg-secondary); margin-bottom: 24px;">Du hast ${this.reviewedToday} Karteikarten wiederholt.</p>
        <button class="btn btn-primary" id="continue-btn">Weiter üben</button>
        <button class="btn btn-secondary" style="margin-left: 12px;" id="reset-btn">Neu mischen</button>
      </div>
    `;
    document.getElementById("rating-controls")!.style.display = "none";
    document.getElementById("card-counter")!.textContent = "";

    document.getElementById("continue-btn")!.addEventListener("click", () => {
      this.flashcards = this.dataManager.getAllStructures().filter(isLearnableStructure);
      shuffle(this.flashcards);
      this.currentIndex = 0;
      this.reviewDueCards();
      this.bindUI();
      this.showCard();
    });

    document.getElementById("reset-btn")!.addEventListener("click", () => {
      this.currentIndex = 0;
      this.showCard();
    });
  }

  private updateDailyCount(): void {
    document.getElementById("today-count")!.textContent = String(this.reviewedToday);
  }

  private cleanup(): void {
    const container = document.getElementById("canvas-container")!;
    container.innerHTML = "";
  }
}