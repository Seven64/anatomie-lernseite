import { FlashcardProgress, Note, ProgressData, QuizResult } from "../types";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isQuizResult(value: unknown): value is QuizResult {
  return isRecord(value) && typeof value.structureId === "string" && typeof value.correct === "boolean" &&
    (value.mode === "locate" || value.mode === "identify") && typeof value.timestamp === "string";
}

function isFlashcardProgress(value: unknown): value is FlashcardProgress {
  return isRecord(value) && typeof value.structureId === "string" && typeof value.easeFactor === "number" &&
    typeof value.interval === "number" && typeof value.repetitions === "number" &&
    typeof value.nextReview === "string" && typeof value.lastReview === "string";
}

function isNote(value: unknown): value is Note {
  return isRecord(value) && typeof value.content === "string" && typeof value.lastModified === "string";
}

/**
 * Bringt importierte oder gespeicherte Fortschrittsdaten in eine vollständige Form.
 * Fehlende Felder (z. B. `notes` in älteren Exporten) werden ergänzt, ungültige Einträge verworfen.
 * Gibt `null` zurück, wenn es sich offensichtlich nicht um Fortschrittsdaten handelt.
 */
export function normalizeProgress(raw: unknown): ProgressData | null {
  if (!isRecord(raw) || !Array.isArray(raw.quizResults) || !Array.isArray(raw.flashcardProgress)) return null;
  const empty = createEmptyProgress();
  const notes: Record<string, Note> = {};
  if (isRecord(raw.notes)) {
    for (const [id, note] of Object.entries(raw.notes)) if (isNote(note)) notes[id] = note;
  }
  return {
    version: typeof raw.version === "string" ? raw.version : empty.version,
    userId: typeof raw.userId === "string" ? raw.userId : empty.userId,
    quizResults: raw.quizResults.filter(isQuizResult).map(result => ({
      ...result,
      responseTime: typeof result.responseTime === "number" ? result.responseTime : 0,
    })),
    flashcardProgress: raw.flashcardProgress.filter(isFlashcardProgress),
    notes,
    bookmarks: Array.isArray(raw.bookmarks) ? [...new Set(raw.bookmarks.filter((id): id is string => typeof id === "string"))] : [],
    lastUpdated: typeof raw.lastUpdated === "string" ? raw.lastUpdated : empty.lastUpdated,
  };
}

/**
 * Übernimmt einen Import, ohne vorhandene Daten zu verlieren, die im Import fehlen:
 * Notizen und Lesezeichen bleiben erhalten, wenn die Datei keine enthält.
 */
export function mergeImportedProgress(current: ProgressData | null, imported: ProgressData, raw: Record<string, unknown>): ProgressData {
  if (!current) return imported;
  return {
    ...imported,
    notes: "notes" in raw ? imported.notes : current.notes,
    bookmarks: "bookmarks" in raw ? imported.bookmarks : current.bookmarks,
  };
}
