import { FlashcardProgress } from "../types";

const DAY_MS = 24 * 60 * 60 * 1000;
export const MIN_EASE_FACTOR = 1.3;
export const DEFAULT_EASE_FACTOR = 2.5;

/** Neuer Lernstand für eine Karte, die noch nie bewertet wurde. */
export function createFlashcardProgress(structureId: string, now: Date = new Date()): FlashcardProgress {
  return {
    structureId,
    easeFactor: DEFAULT_EASE_FACTOR,
    interval: 0,
    repetitions: 0,
    nextReview: now.toISOString(),
    lastReview: now.toISOString(),
  };
}

/**
 * SuperMemo-2: berechnet Intervall, Wiederholungen und Leichtigkeit neu.
 * `rating` reicht von 0 (vergessen) bis 5 (perfekt). Gibt ein neues Objekt zurück.
 */
export function applySm2(progress: FlashcardProgress, rating: number, now: Date = new Date()): FlashcardProgress {
  const quality = Math.max(0, Math.min(5, Math.round(rating)));
  let { interval, repetitions } = progress;

  if (quality < 3) {
    repetitions = 0;
    interval = 1;
  } else {
    if (repetitions === 0) interval = 1;
    else if (repetitions === 1) interval = 6;
    else interval = Math.round(interval * progress.easeFactor);
    repetitions++;
  }

  const penalty = 5 - quality;
  const easeFactor = Math.max(MIN_EASE_FACTOR, progress.easeFactor + (0.1 - penalty * (0.08 + penalty * 0.02)));

  return {
    ...progress,
    interval,
    repetitions,
    easeFactor,
    nextReview: new Date(now.getTime() + interval * DAY_MS).toISOString(),
    lastReview: now.toISOString(),
  };
}

/** Ist die Karte zum Zeitpunkt `now` fällig? */
export function isDue(progress: FlashcardProgress | undefined, now: Date = new Date()): boolean {
  return !progress || new Date(progress.nextReview).getTime() <= now.getTime();
}
