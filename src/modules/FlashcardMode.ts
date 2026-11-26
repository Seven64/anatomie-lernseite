import { DataManager } from "../utils/DataManager";
import { SettingsManager } from "../utils/SettingsManager";
import { Structure, FlashcardProgress, ProgressData } from "../types";

export class FlashcardMode {
  private dataManager: DataManager;
  private settingsManager: SettingsManager;

  private flashcards: Structure[] = [];
  private currentIndex: number = 0;
  private isFlipped: boolean = false;
  private progressData: ProgressData | null = null;
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
    this.progressData = await this.dataManager.loadProgress() || this.getEmptyProgress();
    this.dailyGoal = this.settingsManager.get("dailyGoal");
    this.loadDailyProgress();
    this.flashcards = this.dataManager.getAllStructures().filter(s => s.nameLatin);
    this.reviewDueCards();
    this.bindUI();
    this.showCard();
  }

  private getEmptyProgress(): ProgressData {
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

  private loadDailyProgress(): void {
    const today = new Date().toISOString().split("T")[0];
    if (this.lastReviewDate !== today) {
      this.reviewedToday = 0;
      this.lastReviewDate = today;
    }
  }

  private reviewDueCards(): void {
    const now = new Date();
    const dueCards = this.flashcards.filter(s => {
      const progress = this.progressData!.flashcardProgress.find(p => p.structureId === s.id);
      if (!progress) return true;
      return new Date(progress.nextReview) <= now;
    });

    dueCards.sort((a, b) => {
      const pa = this.progressData!.flashcardProgress.find(p => p.structureId === a.id);
      const pb = this.progressData!.flashcardProgress.find(p => p.structureId === b.id);
      return (pa?.nextReview || "").localeCompare(pb?.nextReview || "");
    });

    this.flashcards = [...dueCards, ...this.flashcards.filter(s => !dueCards.includes(s))];
    this.currentIndex = 0;
  }

  private bindUI(): void {
    const container = document.getElementById("canvas-container")!;
    container.innerHTML = this.getFlashcardHTML();
    this.bindEvents();
  }

  private getFlashcardHTML(): string {
    const dueCount = this.flashcards.filter(s => {
      const p = this.progressData!.flashcardProgress.find(fp => fp.structureId === s.id);
      return !p || new Date(p.nextReview) <= new Date();
    }).length;

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
      <div><strong>Latein:</strong> ${structure.nameLatin}</div>
      <div><strong>Deutsch:</strong> ${structure.nameDe || "—"}</div>
      <div><strong>Englisch:</strong> ${structure.nameEn || "—"}</div>
      <div style="margin-top: 12px;"><strong>System:</strong> ${structure.system}</div>
      <div><strong>Region:</strong> ${structure.region || "—"}</div>
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
    const progress = this.progressData!.flashcardProgress.find(p => p.structureId === structure.id);
    const stats = document.getElementById("card-stats")!;
    if (progress) {
      stats.style.display = "flex";
      stats.innerHTML = `
        <span>Wiederholungen: ${progress.repetitions}</span>
        <span>Intervall: ${progress.interval} Tage</span>
        <span>Leichtigkeit: ${progress.easeFactor.toFixed(2)}</span>
        <span>Nächste: ${new Date(progress.nextReview).toLocaleDateString()}</span>
      `;
    } else {
      stats.style.display = "none";
    }
  }

  private rateCard(rating: number): void {
    const structure = this.flashcards[this.currentIndex];
    let progress = this.progressData!.flashcardProgress.find(p => p.structureId === structure.id);

    if (!progress) {
      progress = {
        structureId: structure.id,
        easeFactor: 2.5,
        interval: 0,
        repetitions: 0,
        nextReview: new Date().toISOString(),
        lastReview: new Date().toISOString(),
      };
      this.progressData!.flashcardProgress.push(progress);
    }

    this.applySM2(progress, rating);

    this.reviewedToday++;
    this.progressData!.lastUpdated = new Date().toISOString();
    this.dataManager.saveProgress(this.progressData!);

    this.currentIndex++;
    this.showCard();
    this.updateDailyCount();
  }

  private applySM2(progress: FlashcardProgress, rating: number): void {
    if (rating < 3) {
      progress.repetitions = 0;
      progress.interval = 1;
    } else {
      if (progress.repetitions === 0) progress.interval = 1;
      else if (progress.repetitions === 1) progress.interval = 6;
      else progress.interval = Math.round(progress.interval * progress.easeFactor);

      progress.repetitions++;
    }

    progress.easeFactor = Math.max(1.3, progress.easeFactor + (0.1 - (5 - rating) * (0.08 + (5 - rating) * 0.02)));

    const nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + progress.interval);
    progress.nextReview = nextReview.toISOString();
    progress.lastReview = new Date().toISOString();
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
      this.flashcards = this.dataManager.getAllStructures().filter(s => s.nameLatin);
      this.shuffleArray(this.flashcards);
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

  private shuffleArray<T>(array: T[]): void {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  private cleanup(): void {
    const container = document.getElementById("canvas-container")!;
    container.innerHTML = "";
  }
}