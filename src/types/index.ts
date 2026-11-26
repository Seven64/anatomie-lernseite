/**
 * Core type definitions for Anatomie Lernseite
 */

export type BodySystem =
  | "skeletal"
  | "muscular"
  | "articular"
  | "nervous"
  | "cardiovascular"
  | "respiratory"
  | "digestive"
  | "urinary"
  | "reproductive"
  | "lymphatic"
  | "endocrine"
  | "integumentary"
  | "sensory"
  | "visceral"
  | "regions"
  | "insertions"
  | "unknown";

export type LabelLanguage = "latin" | "de" | "en";

export type CuttingAxis = "vertical" | "rightLeft" | "frontBack";

export interface Structure {
  id: string;
  nameLatin: string;
  nameDe?: string;
  nameEn?: string;
  system: BodySystem;
  region?: string;
  objectName: string;
  glbFile: string;
  parentId?: string;
  childrenIds?: string[];
}

export interface ProgressData {
  version: string;
  userId: string;
  quizResults: QuizResult[];
  flashcardProgress: FlashcardProgress[];
  notes: Record<string, Note>;
  bookmarks: string[];
  lastUpdated: string;
}

export interface QuizResult {
  structureId: string;
  mode: "locate" | "identify";
  correct: boolean;
  timestamp: string;
  responseTime: number;
}

export interface FlashcardProgress {
  structureId: string;
  easeFactor: number;
  interval: number;
  repetitions: number;
  nextReview: string;
  lastReview: string;
}

export interface Note {
  content: string;
  lastModified: string;
}

export interface UserSettings {
  theme: "dark" | "light" | "system";
  labelLanguage: LabelLanguage;
  dailyGoal: number;
  showLabels: boolean;
  cameraDistance: number;
  autoRotate: boolean;
}