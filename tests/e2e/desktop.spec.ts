import { _electron as electron, ElectronApplication, expect, test } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectErrors, renderedCoverage, waitForAtlas } from "./helpers";

/**
 * Testet die Electron-App aus dist/ (vorher `npm run build`).
 * Ein eigenes Benutzerprofil je Lauf hält die Tests unabhängig von echten Daten.
 */
let userData: string;

async function launch(): Promise<ElectronApplication> {
  return electron.launch({
    args: [".", `--user-data-dir=${userData}`, "--no-sandbox"],
    env: { ...process.env, ANATOMIE_DISABLE_UPDATES: "1" },
  });
}

test.beforeAll(() => {
  userData = mkdtempSync(join(tmpdir(), "anatomie-e2e-"));
});

test.afterAll(() => {
  rmSync(userData, { recursive: true, force: true });
});

test("startet mit festem Origin und zeigt das Skelett", async () => {
  const app = await launch();
  const page = await app.firstWindow();
  const errors = collectErrors(page);
  await waitForAtlas(page);
  expect(page.url()).toBe("app://anatomie/index.html");
  await expect.poll(() => renderedCoverage(page), { message: "Skelett wird gerendert" }).toBeGreaterThan(0.02);
  expect(errors).toEqual([]);
  await app.close();
});

test("Einstellungen und Lernfortschritt bleiben über einen Neustart erhalten", async () => {
  let app = await launch();
  let page = await app.firstWindow();
  await waitForAtlas(page);
  await page.click("#settings-btn");
  await page.selectOption("#setting-theme", "dark");
  await page.click(".modal [data-close]");
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("anatomy-learning");
    request.onsuccess = () => {
      const tx = request.result.transaction("progress", "readwrite");
      tx.objectStore("progress").put({
        id: "user-progress", version: "1.0", userId: "local", quizResults: [], flashcardProgress: [],
        notes: { lower_caninel: { content: "Persistenztest", lastModified: new Date().toISOString() } },
        bookmarks: ["lower_caninel"], lastUpdated: new Date().toISOString(),
      });
      tx.oncomplete = () => { request.result.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  }));
  await app.close();

  app = await launch();
  page = await app.firstWindow();
  await waitForAtlas(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.click(".mode-tab[data-mode='notes']");
  await expect(page.locator(".note-content")).toHaveText("Persistenztest");
  await app.close();
});
