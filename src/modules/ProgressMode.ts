import { DataManager, createEmptyProgress, isLearnableStructure } from "../utils/DataManager";
import { SYSTEM_ORDER, sortByOrder, systemLabel } from "../ui/constants";
import { escapeHtml } from "../utils/text";

const percent = (value: number, digits = 0) =>
  `${value.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits })} %`;
import { UIManager } from "../utils/UIManager";
import { SettingsManager } from "../utils/SettingsManager";
import { Structure, BodySystem, ProgressData } from "../types";

export class ProgressMode {
  private dataManager: DataManager;
  private uiManager: UIManager;
  private settingsManager: SettingsManager;

  private progressData: ProgressData | null = null;

  constructor(dataManager: DataManager, uiManager: UIManager, settingsManager: SettingsManager) {
    this.dataManager = dataManager;
    this.uiManager = uiManager;
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
    this.renderDashboard();
  }


  private renderDashboard(): void {
    const container = document.getElementById("canvas-container")!;
    container.innerHTML = this.getDashboardHTML();
    this.bindEvents();
    this.updateStats();
  }

  private getDashboardHTML(): string {
    return `
      <div style="height: 100%; overflow-y: auto; padding: 20px;">
        <h2 style="margin-bottom: 24px; font-weight: 600;">Lernfortschritt</h2>

        <div class="progress-dashboard" id="overview-cards"></div>

        <div style="margin-top: 32px;">
          <h3 style="font-weight: 600; margin-bottom: 16px;">Fortschritt nach System</h3>
          <div class="progress-system-list" id="system-progress"></div>
        </div>

        <div style="margin-top: 32px;">
          <h3 style="font-weight: 600; margin-bottom: 16px;">Schwache Strukturen</h3>
          <div class="weak-list" id="weak-structures"></div>
        </div>

        <div style="margin-top: 32px;">
          <h3 style="font-weight: 600; margin-bottom: 16px;">Streak & Statistiken</h3>
          <div class="progress-dashboard" id="streak-stats"></div>
        </div>

        <div style="margin-top: 32px; display: flex; gap: 12px; flex-wrap: wrap;">
          <button class="btn btn-primary" id="export-progress">Fortschritt exportieren</button>
          <button class="btn btn-secondary" id="import-progress">Fortschritt importieren</button>
          <button class="btn btn-danger" id="reset-progress">Fortschritt zurücksetzen</button>
        </div>
        <input type="file" id="import-file" accept=".json" style="display: none;">
      </div>
    `;
  }

  private bindEvents(): void {
    document.getElementById("export-progress")!.addEventListener("click", () => this.exportProgress());
    document.getElementById("import-progress")!.addEventListener("click", () => document.getElementById("import-file")!.click());
    document.getElementById("import-file")!.addEventListener("change", (e) => this.importProgress(e));
    document.getElementById("reset-progress")!.addEventListener("click", () => this.confirmReset());
  }

  private async updateStats(): Promise<void> {
    this.renderOverviewCards();
    this.renderSystemProgress();
    this.renderWeakStructures();
    this.renderStreakStats();
  }

  private renderOverviewCards(): void {
    const container = document.getElementById("overview-cards")!;
    const totalStructures = this.dataManager.getAllStructures().filter(isLearnableStructure).length;
    const totalQuizzes = this.progressData!.quizResults.length;
    const correctQuizzes = this.progressData!.quizResults.filter(r => r.correct).length;
    const accuracy = percent(totalQuizzes > 0 ? (correctQuizzes / totalQuizzes) * 100 : 0, 1);
    const reviewedCards = this.progressData!.flashcardProgress.length;
    const masteredCards = this.progressData!.flashcardProgress.filter(p => p.interval >= 30).length;

    container.innerHTML = `
      <div class="progress-card">
        <div class="progress-card-header">
          <span class="progress-card-title">Gesamtstrukturen</span>
          <span class="progress-card-value">${totalStructures.toLocaleString("de-DE")}</span>
        </div>
      </div>
      <div class="progress-card">
        <div class="progress-card-header">
          <span class="progress-card-title">Quiz-Genauigkeit</span>
          <span class="progress-card-value">${accuracy}</span>
        </div>
      </div>
      <div class="progress-card">
        <div class="progress-card-header">
          <span class="progress-card-title">Quiz gesamt</span>
          <span class="progress-card-value">${totalQuizzes}</span>
        </div>
      </div>
      <div class="progress-card">
        <div class="progress-card-header">
          <span class="progress-card-title">Karteikarten gelernt</span>
          <span class="progress-card-value">${reviewedCards}</span>
        </div>
      </div>
      <div class="progress-card">
        <div class="progress-card-header">
          <span class="progress-card-title">Beherrscht (30+ Tage)</span>
          <span class="progress-card-value">${masteredCards}</span>
        </div>
      </div>
      <div class="progress-card">
        <div class="progress-card-header">
          <span class="progress-card-title">Lesezeichen</span>
          <span class="progress-card-value">${this.progressData!.bookmarks.length}</span>
        </div>
      </div>
    `;
  }

  private renderSystemProgress(): void {
    const container = document.getElementById("system-progress")!;
    const systems = sortByOrder(
      [...new Set(this.dataManager.getAllStructures().map(structure => structure.system))] as BodySystem[],
      SYSTEM_ORDER
    );
    const quizzes = this.progressData!.quizResults;
    const cards = this.progressData!.flashcardProgress;

    container.innerHTML = systems.map(system => {
      const systemStructures = this.dataManager.getStructuresBySystemSync(system).filter(isLearnableStructure);
      if (systemStructures.length === 0) return "";
      const systemIds = new Set(systemStructures.map(structure => structure.id));
      const systemQuizzes = quizzes.filter(result => systemIds.has(result.structureId));
      const correct = systemQuizzes.filter(result => result.correct).length;
      const total = systemQuizzes.length;
      const accuracy = total > 0 ? (correct / total) * 100 : 0;
      const reviewedCards = cards.filter(card => systemIds.has(card.structureId)).length;
      const cardProgress = (reviewedCards / systemStructures.length) * 100;
      const color = this.settingsManager.getSystemColor(system);

      return `
        <div class="progress-system-item">
          <div class="progress-system-color" style="background: ${color}"></div>
          <div class="progress-system-info">
            <div class="progress-system-name">${escapeHtml(systemLabel(system))}</div>
            <div class="progress-system-bar">
              <div class="progress-system-fill" style="width: ${Math.max(accuracy, cardProgress)}%; background: ${color}"></div>
            </div>
          </div>
          <div class="progress-system-stats">
            <span>Quiz: ${correct}/${total} (${percent(accuracy)})</span>
            <span>Karten: ${reviewedCards}/${systemStructures.length.toLocaleString("de-DE")} (${percent(cardProgress)})</span>
          </div>
        </div>`;
    }).join("");
  }

  private renderWeakStructures(): void {
    const container = document.getElementById("weak-structures")!;
    const structureStats = new Map<string, { correct: number; total: number; structure: Structure }>();

    this.progressData!.quizResults.forEach(r => {
      const structure = this.dataManager.getStructureSync(r.structureId);
      if (!structure) return;
      const stats = structureStats.get(r.structureId) || { correct: 0, total: 0, structure };
      stats.total++;
      if (r.correct) stats.correct++;
      structureStats.set(r.structureId, stats);
    });

    const weak = Array.from(structureStats.values())
      .filter(s => s.total >= 3 && s.correct / s.total < 0.6)
      .sort((a, b) => (a.correct / a.total) - (b.correct / b.total))
      .slice(0, 20);

    if (weak.length === 0) {
      container.innerHTML = `<p style="color: var(--fg-muted); text-align: center; padding: 20px;">Noch nicht genug Daten für Schwachstellenanalyse. Mache mehr Quiz!</p>`;
      return;
    }

    container.innerHTML = weak.map(w => {
      const structure = w.structure;
      const accuracy = percent((w.correct / w.total) * 100);
      const color = getComputedStyle(document.documentElement).getPropertyValue(`--system-${structure.system}`).trim() || "#888";
      const name = this.settingsManager.getLabel(structure);
      return `
        <div class="weak-item" data-id="${structure.id}">
          <div class="weak-item-color" style="background: ${color}"></div>
          <span class="weak-item-name">${escapeHtml(name)}</span>
          <span class="weak-item-accuracy">${accuracy} (${w.correct}/${w.total})</span>
        </div>
      `;
    }).join("");

    container.querySelectorAll(".weak-item").forEach(item => {
      item.addEventListener("click", () => {
        this.uiManager.selectStructure((item as HTMLElement).dataset.id!);
        this.uiManager.togglePanel();
      });
    });
  }

  private renderStreakStats(): void {
    const container = document.getElementById("streak-stats")!;
    const quizDates = new Set(this.progressData!.quizResults.map(r => r.timestamp.split("T")[0]));
    const cardDates = new Set(this.progressData!.flashcardProgress.map(p => p.lastReview.split("T")[0]));
    const allDates = new Set([...quizDates, ...cardDates]);

    const sortedDates = Array.from(allDates).sort();
    let streak = 0;
    let currentStreak = 0;
    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

    for (let i = sortedDates.length - 1; i >= 0; i--) {
      const expectedDate = new Date(Date.now() - (sortedDates.length - 1 - i) * 86400000).toISOString().split("T")[0];
      if (sortedDates[i] === expectedDate || (i === sortedDates.length - 1 && (sortedDates[i] === today || sortedDates[i] === yesterday))) {
        currentStreak++;
      } else {
        break;
      }
    }
    streak = currentStreak;

    const totalStudyDays = allDates.size;
    const thisWeek = Array.from(allDates).filter(d => {
      const date = new Date(d);
      const weekAgo = new Date(Date.now() - 7 * 86400000);
      return date >= weekAgo;
    }).length;

    const totalTime = this.progressData!.quizResults.reduce((sum, r) => sum + r.responseTime, 0);
    const timed = this.progressData!.quizResults.filter(result => result.responseTime > 0);
    const avgTime = (timed.length > 0 ? totalTime / timed.length / 1000 : 0)
      .toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

    container.innerHTML = `
      <div class="progress-card">
        <div class="progress-card-header">
          <span class="progress-card-title">Aktueller Streak</span>
          <span class="progress-card-value">${streak} Tage</span>
        </div>
      </div>
      <div class="progress-card">
        <div class="progress-card-header">
          <span class="progress-card-title">Lerntage gesamt</span>
          <span class="progress-card-value">${totalStudyDays}</span>
        </div>
      </div>
      <div class="progress-card">
        <div class="progress-card-header">
          <span class="progress-card-title">Diese Woche</span>
          <span class="progress-card-value">${thisWeek} Tage</span>
        </div>
      </div>
      <div class="progress-card">
        <div class="progress-card-header">
          <span class="progress-card-title">Ø Antwortzeit</span>
          <span class="progress-card-value">${avgTime} s</span>
        </div>
      </div>
    `;
  }

  private exportProgress(): void {
    const data = JSON.stringify(this.progressData, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `anatomie-fortschritt-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private importProgress(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        if (data.version && data.quizResults && data.flashcardProgress) {
          this.progressData = data;
          this.dataManager.saveProgress(this.progressData!);
          this.updateStats();
          this.uiManager.showToast("Fortschritt erfolgreich importiert", "success");
        } else {
          this.uiManager.showError("Ungültiges Dateiformat");
        }
      } catch {
        this.uiManager.showError("Fehler beim Lesen der Datei");
      }
    };
    reader.readAsText(file);
    (event.target as HTMLInputElement).value = "";
  }

  private confirmReset(): void {
    if (confirm("Wirklich allen Fortschritt zurücksetzen? Dies kann nicht rückgängig gemacht werden.")) {
      this.progressData = createEmptyProgress();
      this.dataManager.saveProgress(this.progressData!);
      this.updateStats();
    }
  }

  private cleanup(): void {
    const container = document.getElementById("canvas-container")!;
    container.innerHTML = "";
  }
}