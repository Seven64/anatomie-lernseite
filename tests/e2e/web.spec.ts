import { expect, Page, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { collectErrors, findHiddenControls, renderedCoverage, waitForAtlas } from "./helpers";

/**
 * Funktionstests der Web-App (gebaute Version über `vite preview`).
 * Jeder Test startet mit leerem Browserprofil (eigener Kontext je Test).
 */

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = collectErrors(page);
  page.on("dialog", dialog => void dialog.accept());
  await page.goto("./");
  await waitForAtlas(page);
});

test.afterEach(() => {
  expect(errors, "keine Konsolenfehler").toEqual([]);
});

async function openMode(page: Page, mode: string): Promise<void> {
  await page.click(`.mode-tab[data-mode='${mode}']`);
  await expect(page.locator(`.mode-tab[data-mode='${mode}']`)).toHaveClass(/active/);
}

async function readProgress(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate(() => new Promise<Record<string, unknown> | null>((resolve, reject) => {
    const request = indexedDB.open("anatomy-learning");
    request.onsuccess = () => {
      const get = request.result.transaction("progress").objectStore("progress").get("user-progress");
      get.onsuccess = () => { request.result.close(); resolve(get.result ?? null); };
      get.onerror = () => reject(get.error);
    };
    request.onerror = () => reject(request.error);
  }));
}

/**
 * Blendet die Muskulatur ein. Faszien bleiben beim ersten Einblenden verborgen,
 * daher ist die System-Checkbox danach „teilweise“ (indeterminate) statt angehakt.
 */
async function showMuscles(page: Page): Promise<void> {
  const checkbox = page.locator(".tree-group-visibility[data-system='muscular']");
  await checkbox.click();
  await expect.poll(() => checkbox.evaluate((element: HTMLInputElement) => element.checked || element.indeterminate)).toBe(true);
}

/** Wählt die erste Struktur über die globale Suche aus. */
async function selectViaSearch(page: Page, query: string): Promise<string> {
  await page.fill("#search-input", query);
  const first = page.locator(".search-result-item").first();
  await expect(first).toBeVisible();
  const name = (await first.locator(".tree-item-name").textContent())!.trim();
  await first.click();
  await expect(page.locator("#info-panel")).toHaveClass(/open/);
  await expect(page.locator(".structure-latin")).toBeVisible();
  return name;
}

test.describe("Atlas", () => {
  test("rendert das Skelett und blendet Systeme ein/aus", async ({ page }) => {
    await expect.poll(() => renderedCoverage(page)).toBeGreaterThan(0.02);
    const skeletal = page.locator(".tree-group-visibility[data-system='skeletal']");
    await expect(skeletal).toBeChecked();
    await skeletal.uncheck();
    await expect.poll(() => renderedCoverage(page)).toBeLessThan(0.005);
    await page.locator(".tree-group-visibility[data-system='visceral']").check();
    await expect(page.locator(".atlas-loading")).toBeHidden();
    await expect.poll(() => renderedCoverage(page)).toBeGreaterThan(0.02);
  });

  test("Suche, Auswahl, Isolieren, Ausblenden und Zurücksetzen", async ({ page }) => {
    await selectViaSearch(page, "femur");
    const before = await renderedCoverage(page);
    await page.click("[data-action='isolate-structure']");
    await expect.poll(() => renderedCoverage(page)).toBeLessThan(before);
    await page.click("[data-action='hide-structure']");
    await expect.poll(() => renderedCoverage(page)).toBeLessThan(0.005);
    await page.click("[data-action='reset-view']");
    await expect.poll(() => renderedCoverage(page)).toBeGreaterThan(0.02);
    await expect(page.locator(".tree-group-visibility[data-system='skeletal']")).toBeChecked();
  });

  test("Baumfilter findet Strukturen", async ({ page }) => {
    await page.fill("#tree-search", "humerus");
    await expect(page.locator("#structure-tree .tree-item").first()).toBeVisible();
    const names = await page.locator("#structure-tree .tree-item-name").allTextContents();
    expect(names.length).toBeGreaterThan(0);
    expect(names.every(name => /humer/i.test(name))).toBe(true);
  });

  test("Schnittebene schneidet das Modell", async ({ page }) => {
    await expect.poll(() => renderedCoverage(page)).toBeGreaterThan(0.02);
    const full = await renderedCoverage(page);
    await page.locator(".cut-axis-enabled[data-axis='rightLeft']").check();
    await page.locator(".cut-axis-progress[data-axis='rightLeft']").fill("50");
    await expect.poll(() => renderedCoverage(page)).toBeLessThan(full * 0.8);
    await page.click(".cut-reset");
    await expect(page.locator(".cut-axis-enabled[data-axis='rightLeft']")).not.toBeChecked();
    await expect.poll(() => renderedCoverage(page)).toBeGreaterThan(full * 0.9);
  });

  test("Deckkraftregler verändert die Darstellung", async ({ page }) => {
    await expect.poll(() => renderedCoverage(page)).toBeGreaterThan(0.02);
    await page.locator(".tree-group-opacity[data-system='skeletal']").fill("0");
    await expect.poll(() => renderedCoverage(page)).toBeLessThan(0.01);
    await page.locator(".tree-group-opacity[data-system='skeletal']").fill("100");
    await expect.poll(() => renderedCoverage(page)).toBeGreaterThan(0.02);
  });

  test("Muskelschichten werden berechnet und lassen sich abtragen", async ({ page }) => {
    // Die einmalige Schichtberechnung ist mit Software-WebGL (headless, ohne GPU) sehr langsam.
    test.setTimeout(480_000);
    await page.locator(".tree-group-visibility[data-system='skeletal']").uncheck();
    await showMuscles(page);
    const range = page.locator(".layer-peel-range[data-system='muscular']");
    await expect(range).toBeEnabled({ timeout: 420_000 });
    const full = await renderedCoverage(page);
    const max = Number(await range.getAttribute("max"));
    expect(max).toBeGreaterThan(1);
    await range.fill(String(max));
    await expect.poll(() => renderedCoverage(page)).toBeLessThan(full);
  });

  test("Lesezeichen und Notiz aus dem Info-Panel", async ({ page }) => {
    const name = await selectViaSearch(page, "femur");
    await page.click("[data-action='toggle-bookmark']");
    await expect(page.locator(".toast")).toContainText("Lesezeichen hinzugefügt");
    await page.click("[data-action='add-note']");
    await expect(page.locator(".mode-tab[data-mode='notes']")).toHaveClass(/active/);
    await expect(page.locator("#note-editor")).toBeVisible();
    await page.fill("#note-content", "Längster Knochen <b>des</b> Körpers");
    await page.click("#save-note");
    await expect(page.locator(".note-item .note-content")).toHaveText("Längster Knochen <b>des</b> Körpers");
    await expect(page.locator(".note-item .note-structure")).toHaveText(name);
    await page.click("#tab-bookmarks");
    await expect(page.locator(".bookmark-item .bookmark-structure")).toHaveText(name);
  });

  test("Seitenleisten-Tabs und Über-Seite", async ({ page }) => {
    await page.click(".sidebar-tab[data-tab='about']");
    await expect(page.locator("#about-content")).toBeVisible();
    await expect(page.locator("#about-content")).toContainText("CC BY-SA 4.0");
    await page.click(".sidebar-tab[data-tab='tree']");
    await expect(page.locator("#structure-tree")).toBeVisible();
  });
});

test.describe("Quiz", () => {
  test("„Wie heißt …?“ wertet Antworten aus und speichert sie", async ({ page }) => {
    await openMode(page, "quiz");
    const options = page.locator(".quiz-option");
    await expect(options).toHaveCount(4);
    await options.first().click();
    await expect(page.locator("#quiz-feedback")).toBeVisible();
    await expect(page.locator(".quiz-option.correct")).toHaveCount(1);
    await expect(page.locator("#quiz-score")).toHaveText(/^[01] \/ 1$/);
    await expect.poll(async () => ((await readProgress(page))?.quizResults as unknown[] | undefined)?.length).toBe(1);
    // automatisch nächste Frage
    await expect(page.locator("#quiz-feedback")).toBeHidden({ timeout: 5000 });
    await expect(page.locator("#quiz-score")).toHaveText(/ \/ 2$/);
  });

  test("schnelles Weiterklicken zählt jede Frage genau einmal", async ({ page }) => {
    await openMode(page, "quiz");
    await expect(page.locator(".quiz-option")).toHaveCount(4);
    for (let i = 0; i < 5; i++) await page.click("#next-question");
    await expect(page.locator("#quiz-loading")).toBeHidden();
    await page.waitForTimeout(1500);
    await expect(page.locator("#quiz-score")).toHaveText("0 / 6");
    // Die richtige Antwort ist unter den Optionen.
    await page.locator(".quiz-option").first().click();
    await expect(page.locator(".quiz-option.correct")).toHaveCount(1);
  });

  test("Filter und Moduswechsel bleiben beim Zurückkehren erhalten", async ({ page }) => {
    await openMode(page, "quiz");
    await page.selectOption("#filter-system", "muscular");
    await page.click("#mode-locate");
    await expect(page.locator("#quiz-question")).toHaveText(/^Wo ist: /);
    await openMode(page, "flashcards");
    await openMode(page, "quiz");
    await expect(page.locator("#filter-system")).toHaveValue("muscular");
    await expect(page.locator("#mode-locate")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#quiz-question")).toHaveText(/^Wo ist: /);
  });

  test("Beschriftungs-Quiz akzeptiert Antworten und überspringt", async ({ page }) => {
    await openMode(page, "labelQuiz");
    await expect(page.locator("#quiz-score")).toHaveText("0 / 1");
    await page.fill("#answer-input", "xyz falsch");
    // Die Rückmeldung ist nur 1,5 s sichtbar – vor dem Absenden auf sie warten.
    const feedback = page.waitForSelector(".feedback-incorrect", { state: "visible" });
    await page.press("#answer-input", "Enter");
    await feedback;
    await expect(page.locator("#quiz-score")).toHaveText("0 / 2");
    await page.click("#skip-question");
    await expect(page.locator("#quiz-score")).toHaveText("0 / 3");
    await expect.poll(async () => ((await readProgress(page))?.quizResults as unknown[] | undefined)?.length).toBe(1);
  });
});

test.describe("Karteikarten", () => {
  test("Umdrehen, Bewerten und Speichern", async ({ page }) => {
    await openMode(page, "flashcards");
    await expect(page.locator("#card-counter")).toHaveText(/^1 \/ \d+/);
    await page.click("#flashcard");
    await expect(page.locator("#rating-controls")).toBeVisible();
    await page.click("[data-rating='4']");
    await expect(page.locator("#today-count")).toHaveText("1");
    await expect(page.locator("#card-counter")).toHaveText(/^2 \/ /);
    await page.keyboard.press("Space");
    await expect(page.locator("#rating-controls")).toBeVisible();
    await page.keyboard.press("1");
    await expect(page.locator("#today-count")).toHaveText("2");
    await expect.poll(async () => ((await readProgress(page))?.flashcardProgress as unknown[] | undefined)?.length).toBe(2);
    // Tagesfortschritt bleibt nach Neuladen erhalten.
    await page.reload();
    await waitForAtlas(page);
    await openMode(page, "flashcards");
    await expect(page.locator("#today-count")).toHaveText("2");
  });

  test("Tagesziel: Abschluss, Weiter üben und Neu mischen", async ({ page }) => {
    await page.evaluate(() => localStorage.setItem("anatomy-settings", JSON.stringify({ dailyGoal: 5 })));
    await page.reload();
    await waitForAtlas(page);
    await openMode(page, "flashcards");
    for (let i = 0; i < 5; i++) {
      await page.click("#flashcard");
      await page.click("[data-rating='5']");
    }
    await expect(page.locator(".flashcard-complete")).toContainText("Tagesziel erreicht");
    await page.click("#reset-btn");
    await expect(page.locator("#card-front")).toBeVisible();
    await page.click("#flashcard");
    await page.click("[data-rating='5']");
    await expect(page.locator("#today-count")).toHaveText("6");
  });
});

test.describe("Fortschritt", () => {
  test("zeigt Statistiken, exportiert, importiert und setzt zurück", async ({ page }) => {
    await openMode(page, "quiz");
    await page.locator(".quiz-option").first().click();
    await expect(page.locator("#quiz-feedback")).toBeVisible();
    await openMode(page, "progress");
    await expect(page.locator("#overview-cards")).toContainText("Quiz gesamt");
    await expect(page.locator("#streak-stats")).toContainText("1 Tage");

    const download = page.waitForEvent("download");
    await page.click("#export-progress");
    const file = await (await download).path();
    expect(file).toBeTruthy();

    await page.click("#reset-progress");
    await expect(page.locator(".progress-card", { hasText: "Quiz gesamt" })).toContainText("0");
    await expect.poll(async () => ((await readProgress(page))?.quizResults as unknown[] | undefined)?.length ?? 0).toBe(0);

    await page.setInputFiles("#import-file", file!);
    await expect(page.locator(".toast")).toContainText("importiert");
    await expect(page.locator(".progress-card", { hasText: "Quiz gesamt" })).toContainText("1");
  });

  test("Import mit unvollständiger Datei zerstört keine Daten", async ({ page }) => {
    await openMode(page, "progress");
    await page.setInputFiles("#import-file", {
      name: "alt.json", mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ version: "1.0", quizResults: [], flashcardProgress: [] })),
    });
    await expect(page.locator(".toast")).toContainText("importiert");
    await openMode(page, "notes");
    await expect(page.locator("#notes-content")).toContainText("Noch keine Notizen");
  });
});

test.describe("Notizen", () => {
  test("bearbeiten, Struktur wechseln, suchen und löschen", async ({ page }) => {
    await selectViaSearch(page, "femur");
    await page.click("[data-action='add-note']");
    await page.fill("#note-content", "Erste Notiz");
    await page.click("#save-note");
    await expect(page.locator(".note-item")).toHaveCount(1);

    await page.click(".edit-note");
    const select = page.locator("#note-structure");
    const other = await select.locator("option").nth(3).getAttribute("value");
    await select.selectOption(other!);
    const otherLabel = (await select.locator("option").nth(3).textContent())!.replace(/ \([^()]*\)$/, "");
    await page.fill("#note-content", "Zweite Notiz");
    await page.click("#save-note");
    // Die Notiz wird zur gewählten Struktur verschoben, nicht kopiert.
    await expect(page.locator(".note-item")).toHaveCount(1);
    await expect(page.locator(".note-item .note-structure")).toHaveText(otherLabel);
    await expect(page.locator(".note-item .note-content")).toHaveText("Zweite Notiz");

    // Zweite Notiz an der ursprünglichen Struktur, dann suchen und löschen.
    await openMode(page, "atlas");
    await selectViaSearch(page, "femur");
    await page.click("[data-action='add-note']");
    await page.fill("#note-content", "Erste Notiz");
    await page.click("#save-note");
    await expect(page.locator(".note-item")).toHaveCount(2);
    await page.fill("#notes-search", "zweite");
    await expect(page.locator(".note-item")).toHaveCount(1);
    await page.fill("#notes-search", "");
    await page.locator(".delete-note").first().click();
    await expect(page.locator(".note-item")).toHaveCount(1);
  });

  test("Klick auf Lesezeichen öffnet die Struktur im Atlas", async ({ page }) => {
    const name = await selectViaSearch(page, "femur");
    await page.click("[data-action='toggle-bookmark']");
    await openMode(page, "notes");
    await page.click("#tab-bookmarks");
    await expect(page.locator("#tab-bookmarks")).toHaveClass(/active/);
    await page.click(".bookmark-item");
    await expect(page.locator(".mode-tab[data-mode='atlas']")).toHaveClass(/active/);
    await waitForAtlas(page);
    await expect(page.locator(".structure-latin")).toBeVisible();
    await expect(page.locator("#structure-tree .tree-item.selected .tree-item-name, .info-panel .structure-name-value").first()).toBeVisible();
    expect(name).toBeTruthy();
  });
});

test.describe("Einstellungen", () => {
  test("Theme, Sprache und Datensicherung", async ({ page }) => {
    await page.click("#settings-btn");
    await page.selectOption("#setting-theme", "dark");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.selectOption("#setting-language", "de");
    await page.click(".modal [data-close]");
    // structures.json enthält bisher keine deutschen Namen – die Suche fällt auf Latein zurück.
    await page.fill("#search-input", "femur");
    await expect(page.locator(".search-result-item").first()).toBeVisible();

    await page.click("#settings-btn");
    const download = page.waitForEvent("download");
    await page.click("#export-data");
    const file = await (await download).path();
    const backup = JSON.parse(readFileSync(file!, "utf8"));
    expect(backup.settings?.theme).toBe("dark");
    expect(backup.settings?.labelLanguage).toBe("de");

    // Einstellungen zurücksetzen und Sicherung wieder einspielen
    await page.selectOption("#setting-theme", "light");
    await page.selectOption("#setting-language", "latin");
    await Promise.all([page.waitForEvent("load"), page.setInputFiles(".modal #import-file", file!)]);
    await waitForAtlas(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("Theme-Schalter wechselt zyklisch", async ({ page }) => {
    const themes: Array<string | null> = [];
    for (let i = 0; i < 3; i++) {
      await page.click("#theme-toggle");
      themes.push(await page.locator("html").getAttribute("data-theme"));
    }
    expect(new Set(themes).size).toBe(3);
  });

  test("Alle Daten löschen setzt auch Einstellungen zurück", async ({ page }) => {
    await page.click("#settings-btn");
    await page.selectOption("#setting-theme", "dark");
    await Promise.all([page.waitForEvent("load"), page.click("#clear-data")]);
    await waitForAtlas(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });
});

test("Bedienelemente aller Modi sind sichtbar und nicht verdeckt", async ({ page }) => {
  for (const mode of ["atlas", "labelQuiz", "quiz", "flashcards", "progress", "notes"]) {
    await openMode(page, mode);
    await page.waitForTimeout(300);
    expect(await findHiddenControls(page, "#canvas-container button, .app-header button"), mode).toEqual([]);
  }
});
