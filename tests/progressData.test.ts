import { describe, expect, it } from "vitest";
import { createEmptyProgress, mergeImportedProgress, normalizeProgress } from "@/utils/progressData";

const card = { structureId: "femurr", easeFactor: 2.5, interval: 1, repetitions: 1, nextReview: "2026-01-02", lastReview: "2026-01-01" };
const result = { structureId: "femurr", mode: "identify", correct: true, timestamp: "2026-01-01T00:00:00Z", responseTime: 900 };

describe("normalizeProgress", () => {
  it("lehnt Daten ohne Quiz-/Karteikartenlisten ab", () => {
    expect(normalizeProgress(null)).toBeNull();
    expect(normalizeProgress({ version: "1.0" })).toBeNull();
    expect(normalizeProgress([1, 2])).toBeNull();
  });

  it("ergänzt fehlende Felder älterer Exporte", () => {
    const progress = normalizeProgress({ version: "1.0", quizResults: [], flashcardProgress: [] });
    expect(progress).toMatchObject({ notes: {}, bookmarks: [], userId: "local" });
  });

  it("verwirft ungültige Einträge und doppelte Lesezeichen", () => {
    const progress = normalizeProgress({
      quizResults: [result, { structureId: 1 }, { ...result, responseTime: undefined }],
      flashcardProgress: [card, { structureId: "x" }],
      notes: { femurr: { content: "A", lastModified: "2026-01-01" }, broken: "text" },
      bookmarks: ["femurr", "femurr", 3],
    });
    expect(progress?.quizResults).toHaveLength(2);
    expect(progress?.quizResults[1].responseTime).toBe(0);
    expect(progress?.flashcardProgress).toEqual([card]);
    expect(Object.keys(progress!.notes)).toEqual(["femurr"]);
    expect(progress?.bookmarks).toEqual(["femurr"]);
  });
});

describe("mergeImportedProgress", () => {
  it("behält Notizen und Lesezeichen, wenn der Import keine enthält", () => {
    const current = { ...createEmptyProgress(), notes: { femurr: { content: "A", lastModified: "x" } }, bookmarks: ["femurr"] };
    const raw = { quizResults: [result], flashcardProgress: [] };
    const merged = mergeImportedProgress(current, normalizeProgress(raw)!, raw);
    expect(merged.quizResults).toHaveLength(1);
    expect(merged.notes).toEqual(current.notes);
    expect(merged.bookmarks).toEqual(["femurr"]);
  });

  it("übernimmt Notizen und Lesezeichen aus einem vollständigen Import", () => {
    const current = { ...createEmptyProgress(), bookmarks: ["femurr"] };
    const raw = { quizResults: [], flashcardProgress: [], notes: {}, bookmarks: [] };
    expect(mergeImportedProgress(current, normalizeProgress(raw)!, raw).bookmarks).toEqual([]);
  });
});
