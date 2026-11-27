import { DataManager, createEmptyProgress, isLearnableStructure } from "../utils/DataManager";
import { SettingsManager } from "../utils/SettingsManager";
import { Structure, FlashcardProgress, ProgressData } from "../types";
import { regionLabel, systemLabel } from "../ui/constants";
import { applySm2, createFlashcardProgress, isDue } from "../utils/sm2";
import { escapeHtml, formatStructureName, shuffle } from "../utils/text";
import { dailyCountFor, localDateKey } from "../utils/settingsData";

const DAILY_STORAGE_KEY = "anatomy-flashcards-daily";
/** Tasten 1–4 entsprechen den Bewertungsknöpfen (SM-2-Qualität). */
const RATING_KEYS: Record<string, number> = { "1": 0, "2": 3, "3": 4, "4": 5 };

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
  private events: AbortController | null = null;

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

  /** Tageszähler aus dem localStorage – bleibt über Neuladen und Moduswechsel erhalten. */
  private loadDailyProgress(): void {
    try {
      this.reviewedToday = dailyCountFor(JSON.parse(localStorage.getItem(DAILY_STORAGE_KEY) ?? "null"), localDateKey());
    } catch {
      this.reviewedToday = 0;
    }
  }

  private saveDailyProgress(): void {
    try {
      localStorage.setItem(DAILY_STORAGE_KEY, JSON.stringify({ date: localDateKey(), count: this.reviewedToday }));
    } catch {
      // Speicher voll oder nicht verfügbar – Zähler gilt dann nur für diese Sitzung
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
            <div class="flashcard-hint">Bewerten Sie Ihre Kenntnis (Tasten 1–4)</div>
          </div>
        </div>

        <div class="flashcard-controls" style="display: none; justify-content: center; gap: 12px; margin-top: 20px;" id="rating-controls">
          <button class="btn btn-danger" data-rating="0" title="Taste 1">Wiederholen</button>
          <button class="btn btn-warning" data-rating="3" title="Taste 2">Schwer</button>
          <button class="btn btn-secondary" data-rating="4" title="Taste 3">Gut</button>
          <button class="btn btn-success" data-rating="5" title="Taste 4">Leicht</button>
        </div>

        <div class="flashcard-stats" id="card-stats" style="display: none;"></div>

        <div class="flashcard-complete" id="flashcard-complete" hidden>
          <div class="flashcard-complete-icon" aria-hidden="true">🎉</div>
          <h2 id="flashcard-complete-title"></h2>
          <p id="flashcard-complete-text"></p>
          <div class="flashcard-complete-actions">
            <button class="btn btn-primary" id="continue-btn">Weiter üben</button>
            <button class="btn btn-secondary" id="reset-btn">Neu mischen</button>
          </div>
        </div>

        <div style="margin-top: 24px; text-align: center; color: var(--fg-muted); font-size: 12px;">
          <span id="card-counter">0 / 0</span>
        </div>
      </div>
    `;
  }

  private bindEvents(): void {
    this.events?.abort();
    this.events = new AbortController();
    const { signal } = this.events;
    const card = document.getElementById("flashcard")!;
    card.addEventListener("click", () => this.flipCard(), { signal });

    document.querySelectorAll<HTMLButtonElement>("#rating-controls [data-rating]").forEach(btn => {
      btn.addEventListener("click", () => this.rateCard(Number(btn.dataset.rating)), { signal });
    });
    document.getElementById("continue-btn")!.addEventListener("click", () => this.resume(false), { signal });
    document.getElementById("reset-btn")!.addEventListener("click", () => this.resume(true), { signal });
    // Tastatur: Leertaste/Enter dreht um, 1–4 bewertet – solange kein Eingabefeld/Knopf den Fokus hat.
    document.addEventListener("keydown", event => this.handleKey(event), { signal });
  }

  private handleKey(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey || document.querySelector(".modal-overlay")) return;
    const target = event.target as HTMLElement;
    if (target !== document.body && target.id !== "flashcard") return;
    if (!document.getElementById("flashcard-complete")?.hidden) return;
    if ((event.key === " " || event.key === "Enter") && !this.isFlipped) {
      event.preventDefault();
      this.flipCard();
    } else if (event.key in RATING_KEYS && this.isFlipped) {
      event.preventDefault();
      this.rateCard(RATING_KEYS[event.key]);
    }
  }

  private showCard(): void {
    if (this.currentIndex >= this.flashcards.length) {
      this.showCompletion("deck");
      return;
    }

    document.getElementById("flashcard-complete")!.hidden = true;
    document.getElementById("flashcard")!.hidden = false;
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
    this.saveDailyProgress();
    this.updateDailyCount();
    this.currentIndex++;

    // Den Fokus auf der Karte halten, damit die Tastatursteuerung weiterläuft
    // (der geklickte Bewertungsknopf wird gleich ausgeblendet).
    document.getElementById("flashcard")!.focus({ preventScroll: true });
    if (this.reviewedToday === this.dailyGoal) this.showCompletion("goal");
    else this.showCard();
  }

  private showCompletion(reason: "goal" | "deck"): void {
    document.getElementById("flashcard-complete-title")!.textContent = reason === "goal" ? "Tagesziel erreicht!" : "Alle Karten wiederholt!";
    document.getElementById("flashcard-complete-text")!.textContent = `Du hast heute ${this.reviewedToday} Karteikarten wiederholt.`;
    document.getElementById("flashcard")!.hidden = true;
    document.getElementById("rating-controls")!.style.display = "none";
    document.getElementById("card-stats")!.style.display = "none";
    document.getElementById("card-counter")!.textContent = "";
    const complete = document.getElementById("flashcard-complete")!;
    complete.hidden = false;
    document.getElementById("continue-btn")!.focus({ preventScroll: true });
  }

  /** „Weiter üben“ setzt den Stapel fort, „Neu mischen“ beginnt ihn gemischt von vorn. */
  private resume(reshuffle: boolean): void {
    if (reshuffle || this.currentIndex >= this.flashcards.length) {
      shuffle(this.flashcards);
      this.currentIndex = 0;
    }
    this.showCard();
    document.getElementById("flashcard")!.focus({ preventScroll: true });
  }

  private updateDailyCount(): void {
    document.getElementById("today-count")!.textContent = String(this.reviewedToday);
  }

  private cleanup(): void {
    this.events?.abort();
    this.events = null;
    const container = document.getElementById("canvas-container")!;
    container.innerHTML = "";
  }
}