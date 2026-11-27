/**
 * Reine Rechenfunktionen der Kamerasteuerung (ohne Three.js, unit-getestet).
 */

/** Maximaler Betrag eines einzelnen Rad-Ereignisses (verhindert Sprünge bei schnellen Rädern). */
export const MAX_WHEEL_DELTA = 240;
/** Zoom-Empfindlichkeit für Mausrad/zwei Finger bzw. Pinch-Geste (Strg + Rad). */
export const WHEEL_ZOOM_SPEED = 0.0016;
export const PINCH_ZOOM_SPEED = 0.012;
/** Drehung pro Pixel relativ zur Viewport-Höhe: eine volle Höhe ≈ 1,6 π. */
export const ROTATE_PER_VIEWPORT = Math.PI * 1.6;

/** Rad-Delta in Pixel umrechnen (Zeilen- bzw. Seitenmodus von Firefox & Co.). */
export function normalizeWheelDelta(delta: number, deltaMode: number, pageHeight: number): number {
  const pixels = deltaMode === 1 ? delta * 16 : deltaMode === 2 ? delta * pageHeight : delta;
  return Math.max(-MAX_WHEEL_DELTA, Math.min(MAX_WHEEL_DELTA, pixels));
}

/** Abstandsfaktor für einen Zoomschritt; > 1 = heraus, < 1 = hinein. */
export function zoomFactor(deltaPixels: number, pinch: boolean): number {
  return Math.exp(deltaPixels * (pinch ? PINCH_ZOOM_SPEED : WHEEL_ZOOM_SPEED));
}

/** Neuer Abstand innerhalb der Grenzen; liefert den tatsächlich angewandten Faktor. */
export function clampDistance(distance: number, factor: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, distance * factor)) / distance;
}

/** Drehwinkel (Bogenmaß) für eine Zeigerbewegung in Pixeln. */
export function rotationAngle(deltaPixels: number, viewportHeight: number, speed = 1): number {
  return (deltaPixels / Math.max(viewportHeight, 1)) * ROTATE_PER_VIEWPORT * speed;
}

/** Weltmeter pro Bildschirmpixel in Zielentfernung (perspektivische Kamera). */
export function worldPerPixel(distance: number, fovDegrees: number, viewportHeight: number): number {
  return (2 * distance * Math.tan((fovDegrees * Math.PI) / 360)) / Math.max(viewportHeight, 1);
}

/**
 * Unterscheidet bei einem Rad-Ereignis die Absicht:
 *  - „pinch“:  Touchpad-Pinch (Browser melden ihn als Strg + Rad) → zoomen
 *  - „rotate“: überwiegend horizontale Zwei-Finger-Geste → um die Hochachse drehen
 *  - „zoom“:   Mausrad oder vertikale Zwei-Finger-Geste → zoomen
 */
export function classifyWheel(deltaX: number, deltaY: number, ctrlKey: boolean): "pinch" | "rotate" | "zoom" {
  if (ctrlKey) return "pinch";
  if (Math.abs(deltaX) > Math.abs(deltaY) * 1.2) return "rotate";
  return "zoom";
}

/** Abklingende Trägheit: Geschwindigkeit nach `dt` Sekunden bei Halbwertszeit `halfLife`. */
export function decay(velocity: number, dt: number, halfLife = 0.09): number {
  const next = velocity * Math.pow(0.5, dt / halfLife);
  return Math.abs(next) < 1e-4 ? 0 : next;
}

/** Sanfter Verlauf für Kameraflüge (0…1 → 0…1). */
export function easeInOutCubic(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}
