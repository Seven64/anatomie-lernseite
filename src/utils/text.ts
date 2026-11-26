/**
 * Reine Text- und Array-Helfer, die von mehreren Modi genutzt werden.
 * Alle Funktionen sind seiteneffektfrei und unit-getestet (tests/text.test.ts).
 */

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Maskiert Text für die sichere Verwendung in innerHTML und Attributen. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => HTML_ESCAPES[character]);
}

const UMLAUTS: Record<string, string> = { ä: "ae", ö: "oe", ü: "ue", ß: "ss" };

/** Kleinschreibung, Umlaute ausschreiben, Leerraum vereinheitlichen. */
export function normalizeAnswer(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[äöüß]/g, character => UMLAUTS[character] ?? character)
    .replace(/\s+/g, " ");
}

/** Levenshtein-Distanz mit O(min(a, b)) Speicher. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length < b.length) [a, b] = [b, a];
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
    }
    previous = current;
  }
  return previous[b.length];
}

/**
 * Toleranter Antwortvergleich: exakt, Teilstring (ab 4 Zeichen) oder bis zu
 * `maxDistance` Tippfehler.
 */
export function fuzzyMatch(input: string, targets: string[], maxDistance = 2): boolean {
  const answer = normalizeAnswer(input);
  if (!answer) return false;
  return targets.some(target => {
    const expected = normalizeAnswer(target);
    if (!expected) return false;
    if (answer === expected) return true;
    if (answer.length >= 4 && (expected.includes(answer) || answer.includes(expected))) return true;
    return levenshtein(answer, expected) <= maxDistance;
  });
}

/** Fisher-Yates-Mischen (in place). `random` ist für Tests injizierbar. */
export function shuffle<T>(array: T[], random: () => number = Math.random): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/** "muscles_of_pelvis" → "Muscles Of Pelvis" */
export function formatGroupLabel(value: string): string {
  return value.replace(/_/g, " ").replace(/\b[a-z]/g, character => character.toUpperCase());
}
