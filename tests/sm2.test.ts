import { describe, expect, it } from "vitest";
import { applySm2, createFlashcardProgress, isDue, MIN_EASE_FACTOR } from "../src/utils/sm2";

const now = new Date("2026-01-01T10:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

describe("SM-2", () => {
  it("startet mit Leichtigkeit 2,5 und ist sofort fällig", () => {
    const card = createFlashcardProgress("femur", now);
    expect(card.easeFactor).toBe(2.5);
    expect(isDue(card, now)).toBe(true);
    expect(isDue(undefined, now)).toBe(true);
  });

  it("folgt den Intervallen 1 → 6 → Intervall × Leichtigkeit", () => {
    let card = createFlashcardProgress("femur", now);
    card = applySm2(card, 4, now);
    expect(card.interval).toBe(1);
    card = applySm2(card, 4, now);
    expect(card.interval).toBe(6);
    card = applySm2(card, 4, now);
    expect(card.interval).toBe(Math.round(6 * card.easeFactor));
    expect(card.repetitions).toBe(3);
  });

  it("setzt bei schlechter Bewertung zurück und senkt die Leichtigkeit", () => {
    let card = applySm2(applySm2(createFlashcardProgress("femur", now), 5, now), 5, now);
    card = applySm2(card, 0, now);
    expect(card.repetitions).toBe(0);
    expect(card.interval).toBe(1);
    expect(card.easeFactor).toBeLessThan(2.7);
  });

  it("unterschreitet nie die minimale Leichtigkeit", () => {
    let card = createFlashcardProgress("femur", now);
    for (let i = 0; i < 20; i++) card = applySm2(card, 0, now);
    expect(card.easeFactor).toBe(MIN_EASE_FACTOR);
  });

  it("berechnet das nächste Fälligkeitsdatum", () => {
    const card = applySm2(createFlashcardProgress("femur", now), 5, now);
    expect(new Date(card.nextReview).getTime() - now.getTime()).toBe(DAY);
    expect(isDue(card, now)).toBe(false);
    expect(isDue(card, new Date(now.getTime() + DAY))).toBe(true);
  });

  it("verändert das Eingabeobjekt nicht", () => {
    const card = createFlashcardProgress("femur", now);
    const copy = { ...card };
    applySm2(card, 5, now);
    expect(card).toEqual(copy);
  });
});
