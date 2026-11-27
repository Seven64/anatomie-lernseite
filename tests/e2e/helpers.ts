import { expect, Page } from "@playwright/test";

/** Wartet, bis der Atlas Strukturbaum und 3D-Ansicht aufgebaut hat. */
export async function waitForAtlas(page: Page): Promise<void> {
  await expect(page.locator(".tree-group[data-system='skeletal']")).toBeVisible();
  await expect(page.locator("canvas.atlas-canvas")).toBeVisible();
  await expect(page.locator(".atlas-loading")).toBeHidden();
}

/**
 * Anteil der Canvas-Pixel, die sich vom Hintergrund unterscheiden – zeigt, ob tatsächlich
 * ein Modell gerendert wird (z. B. das Skelett), ohne interne Zustände abzufragen.
 */
export async function renderedCoverage(page: Page): Promise<number> {
  const canvas = page.locator("canvas.atlas-canvas");
  // Overlays (Info-Panel, ViewCube) liegen über dem Canvas und würden mitgezählt.
  const shot = await canvas.screenshot({ style: "#info-panel, .viewcube, .atlas-hover-label, .toast { visibility: hidden !important; }" });
  return page.evaluate(async (base64: string) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, image.width, image.height);
    const [r0, g0, b0] = [data[0], data[1], data[2]];
    let different = 0;
    for (let i = 0; i < data.length; i += 16) {
      if (Math.abs(data[i] - r0) + Math.abs(data[i + 1] - g0) + Math.abs(data[i + 2] - b0) > 30) different++;
    }
    return different / (data.length / 16);
  }, shot.toString("base64"));
}

/** Sammelt Konsolenfehler und nicht abgefangene Ausnahmen. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

/** Prüft, dass sichtbare Bedienelemente nicht vom Rand abgeschnitten oder überdeckt sind. */
export async function findHiddenControls(page: Page, selector: string): Promise<string[]> {
  return page.evaluate((selector: string) => {
    const problems: string[] = [];
    document.querySelectorAll<HTMLElement>(selector).forEach(element => {
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden" || element.closest("[hidden]")) return;
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const label = element.getAttribute("aria-label") || element.textContent?.trim().slice(0, 30) || element.className;
      if (rect.right > window.innerWidth + 1 || rect.bottom > window.innerHeight + 1 || rect.left < -1 || rect.top < -1) {
        // Elemente in scrollbaren Containern dürfen außerhalb liegen.
        let parent = element.parentElement;
        let scrollable = false;
        while (parent) {
          const overflow = getComputedStyle(parent).overflowY + getComputedStyle(parent).overflowX;
          if (/auto|scroll/.test(overflow)) { scrollable = true; break; }
          parent = parent.parentElement;
        }
        if (!scrollable) problems.push(`außerhalb des Fensters: ${label}`);
        return;
      }
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const top = document.elementFromPoint(x, y);
      if (top && top !== element && !element.contains(top) && !top.contains(element)) {
        problems.push(`überdeckt: ${label} (von ${top.className || top.tagName})`);
      }
    });
    return problems;
  }, selector);
}
