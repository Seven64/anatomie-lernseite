/**
 * Reine Rechenfunktionen für die Schnittebenen (ohne Three.js, unit-getestet).
 * Der Fortschritt ist ein Prozentwert 0–100 mit bis zu zwei Nachkommastellen.
 */

export const CUT_PRECISION = 0.01;
export const CUT_STEP = 0.1;
export const CUT_FINE_STEP = 0.01;
export const CUT_PAGE_STEP = 10;
/** Beim Ziehen mit gedrückter Umschalttaste bewegt sich der Schnitt 10× langsamer. */
export const CUT_FINE_DRAG_FACTOR = 0.1;

export function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 50;
  const clamped = Math.max(0, Math.min(100, value));
  return Math.round(clamped / CUT_PRECISION) * CUT_PRECISION;
}

/** Schrittweite für eine Taste; null, wenn die Taste nicht zum Slider gehört. */
export function keyboardStep(key: string, fine: boolean): number | null {
  const step = fine ? CUT_FINE_STEP : CUT_STEP;
  switch (key) {
    case "ArrowRight":
    case "ArrowUp":
      return step;
    case "ArrowLeft":
    case "ArrowDown":
      return -step;
    case "PageUp":
      return fine ? CUT_PAGE_STEP / 10 : CUT_PAGE_STEP;
    case "PageDown":
      return fine ? -CUT_PAGE_STEP / 10 : -CUT_PAGE_STEP;
    default:
      return null;
  }
}

/** Neuer Wert beim Ziehen: Pixel-Delta relativ zur Sliderbreite, optional verlangsamt. */
export function dragProgress(startValue: number, deltaPx: number, widthPx: number, fine: boolean): number {
  if (widthPx <= 0) return clampProgress(startValue);
  const factor = fine ? CUT_FINE_DRAG_FACTOR : 1;
  return clampProgress(startValue + (deltaPx / widthPx) * 100 * factor);
}

/** Weltkoordinate der Schnittebene: 0 % = Maximum (nichts abgeschnitten), 100 % = Minimum. */
export function cutPosition(min: number, max: number, progress: number): number {
  return max - (max - min) * (clampProgress(progress) / 100);
}

/** Ebenenkonstante für eine achsparallele Ebene mit Normalenkomponente ±1. */
export function planeConstant(normalComponent: number, position: number): number {
  return -normalComponent * position;
}

/** Anzeige im deutschen Format, z. B. „50,25 %“. */
export function formatProgress(value: number): string {
  return `${clampProgress(value).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 2 })} %`;
}
