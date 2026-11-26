import { describe, expect, it } from "vitest";
import { escapeHtml, formatGroupLabel, fuzzyMatch, levenshtein, normalizeAnswer, shuffle } from "../src/utils/text";

describe("escapeHtml", () => {
  it("maskiert alle HTML-Sonderzeichen", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });
});

describe("normalizeAnswer", () => {
  it("vereinheitlicht Groß-/Kleinschreibung, Umlaute und Leerraum", () => {
    expect(normalizeAnswer("  Großer   Brustmuskel ")).toBe("grosser brustmuskel");
    expect(normalizeAnswer("Schlüsselbein")).toBe("schluesselbein");
  });
});

describe("levenshtein", () => {
  it.each([
    ["", "", 0],
    ["abc", "", 3],
    ["kitten", "sitting", 3],
    ["femur", "femur", 0],
    ["humerus", "humreus", 2],
  ])("%s ↔ %s = %i", (a, b, expected) => {
    expect(levenshtein(a, b)).toBe(expected);
    expect(levenshtein(b, a)).toBe(expected);
  });
});

describe("fuzzyMatch", () => {
  const targets = ["Musculus deltoideus", "Deltamuskel"];

  it("akzeptiert exakte und leicht vertippte Antworten", () => {
    expect(fuzzyMatch("deltamuskel", targets)).toBe(true);
    expect(fuzzyMatch("Deltamuskl", targets)).toBe(true);
  });

  it("akzeptiert Teilstrings ab vier Zeichen", () => {
    expect(fuzzyMatch("deltoideus", targets)).toBe(true);
  });

  it("lehnt leere, zu kurze und falsche Antworten ab", () => {
    expect(fuzzyMatch("", targets)).toBe(false);
    expect(fuzzyMatch("m", targets)).toBe(false);
    expect(fuzzyMatch("femur", targets)).toBe(false);
  });
});

describe("shuffle", () => {
  it("behält alle Elemente und ist mit fester Zufallsquelle deterministisch", () => {
    const values = [1, 2, 3, 4, 5];
    const result = shuffle([...values], () => 0);
    expect([...result].sort()).toEqual(values);
    expect(result).toEqual([2, 3, 4, 5, 1]);
  });
});

describe("formatGroupLabel", () => {
  it("wandelt Bezeichner in lesbare Titel um", () => {
    expect(formatGroupLabel("muscles_of_pelvis")).toBe("Muscles Of Pelvis");
  });
});
