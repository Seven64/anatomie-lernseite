import { CuttingAxis } from "../types";
import { CUTTING_AXES } from "./constants";
import {
  CUT_FINE_STEP,
  CUT_STEP,
  clampProgress,
  dragProgress,
  formatProgress,
  keyboardStep,
} from "../modules/atlas/cuttingMath";

export type CuttingPlaneChangeCallback = (axis: CuttingAxis, enabled: boolean, progress: number) => void;
type AxisState = { enabled: boolean; progress: number };

const DEFAULT_PROGRESS = 50;

/**
 * Schnittebenen-Bedienung im Strukturbaum.
 * Feinsteuerung: Pfeiltasten 0,1 %, mit Umschalt 0,01 %; Ziehen mit Umschalt 10× langsamer;
 * −/+ Knöpfe und Zahleneingabe für exakte Werte.
 */
export class CuttingControls {
  private states: Record<CuttingAxis, AxisState> = {
    vertical: { enabled: false, progress: DEFAULT_PROGRESS },
    rightLeft: { enabled: false, progress: DEFAULT_PROGRESS },
    frontBack: { enabled: false, progress: DEFAULT_PROGRESS },
  };
  private drag: { axis: CuttingAxis; startX: number; startValue: number; width: number; pointerId: number } | null = null;

  constructor(private onChange: CuttingPlaneChangeCallback | null = null) {}

  setCallback(callback: CuttingPlaneChangeCallback | null): void {
    this.onChange = callback;
  }

  render(): string {
    return `
      <details class="cut-controls" open>
        <summary class="cut-controls-summary">
          <span>Modell schneiden</span>
          <span class="cut-controls-hint">3 Achsen</span>
        </summary>
        <div class="cut-controls-body">
          <p class="cut-controls-description">Die Ebene blendet eine Seite aus. Feinjustierung: Pfeiltasten (0,1 %), mit <kbd>Umschalt</kbd> 0,01 % bzw. langsames Ziehen.</p>
          ${CUTTING_AXES.map(({ axis, label }) => this.renderAxis(axis, label)).join("")}
          <button type="button" class="cut-reset">Schnitte zurücksetzen</button>
        </div>
      </details>`;
  }

  private renderAxis(axis: CuttingAxis, label: string): string {
    const state = this.states[axis];
    return `
      <div class="cut-axis${state.enabled ? " active" : ""}" data-axis="${axis}">
        <div class="cut-axis-head">
          <label class="cut-axis-toggle">
            <input type="checkbox" class="cut-axis-enabled" data-axis="${axis}" ${state.enabled ? "checked" : ""}>
            <span class="cut-axis-label">${label}</span>
          </label>
          <output class="cut-axis-value" for="cut-progress-${axis}">${formatProgress(state.progress)}</output>
        </div>
        <div class="cut-axis-controls">
          <button type="button" class="cut-step" data-axis="${axis}" data-step="-${CUT_STEP}" aria-label="${label}: 0,1 Prozent zurück" title="−0,1 % (Umschalt: −0,01 %)">−</button>
          <input type="range" class="cut-axis-progress" data-axis="${axis}" id="cut-progress-${axis}"
            min="0" max="100" step="${CUT_FINE_STEP}" value="${state.progress}"
            aria-label="${label}, Schnittposition" aria-valuetext="${formatProgress(state.progress)}">
          <button type="button" class="cut-step" data-axis="${axis}" data-step="${CUT_STEP}" aria-label="${label}: 0,1 Prozent vor" title="+0,1 % (Umschalt: +0,01 %)">+</button>
          <input type="number" class="cut-axis-number" data-axis="${axis}" min="0" max="100" step="${CUT_FINE_STEP}"
            value="${state.progress}" inputmode="decimal" aria-label="${label}, Schnittposition in Prozent">
        </div>
      </div>`;
  }

  /** Bindet alle Ereignisse per Delegation an den Baum-Container. */
  bind(container: HTMLElement, signal: AbortSignal): void {
    container.addEventListener("click", event => {
      const target = event.target as HTMLElement;
      if (target.closest(".cut-reset")) {
        this.reset();
        return;
      }
      const stepButton = target.closest<HTMLButtonElement>(".cut-step");
      if (stepButton) {
        const axis = stepButton.dataset.axis as CuttingAxis;
        const step = Number(stepButton.dataset.step) * (event.shiftKey ? CUT_FINE_STEP / CUT_STEP : 1);
        this.setProgress(axis, this.states[axis].progress + step, true);
      }
    }, { signal });

    container.addEventListener("change", event => {
      const target = event.target as HTMLInputElement;
      const axis = target.dataset.axis as CuttingAxis | undefined;
      if (!axis) return;
      if (target.classList.contains("cut-axis-enabled")) this.setEnabled(axis, target.checked);
      else if (target.classList.contains("cut-axis-number")) this.setProgress(axis, target.valueAsNumber, true);
    }, { signal });

    container.addEventListener("input", event => {
      const target = event.target as HTMLInputElement;
      if (!target.classList.contains("cut-axis-progress") || this.drag) return;
      this.setProgress(target.dataset.axis as CuttingAxis, target.valueAsNumber, true);
    }, { signal });

    container.addEventListener("keydown", event => {
      const target = event.target as HTMLInputElement;
      if (!target.classList.contains("cut-axis-progress")) return;
      const step = keyboardStep(event.key, event.shiftKey);
      if (step === null) return;
      event.preventDefault();
      const axis = target.dataset.axis as CuttingAxis;
      this.setProgress(axis, this.states[axis].progress + step, true);
    }, { signal });

    // Umschalt + Ziehen: eigene, verlangsamte Ziehlogik statt der nativen Slider-Bewegung.
    container.addEventListener("pointerdown", event => {
      const target = event.target as HTMLInputElement;
      if (!target.classList.contains("cut-axis-progress") || !event.shiftKey) return;
      event.preventDefault();
      target.focus();
      target.setPointerCapture(event.pointerId);
      const axis = target.dataset.axis as CuttingAxis;
      this.drag = {
        axis,
        startX: event.clientX,
        startValue: this.states[axis].progress,
        width: target.getBoundingClientRect().width,
        pointerId: event.pointerId,
      };
    }, { signal });
    container.addEventListener("pointermove", event => {
      if (!this.drag || event.pointerId !== this.drag.pointerId) return;
      const { axis, startX, startValue, width } = this.drag;
      this.setProgress(axis, dragProgress(startValue, event.clientX - startX, width, true), true);
    }, { signal });
    const endDrag = (event: PointerEvent) => {
      if (this.drag?.pointerId === event.pointerId) this.drag = null;
    };
    container.addEventListener("pointerup", endDrag, { signal });
    container.addEventListener("pointercancel", endDrag, { signal });
  }

  reset(): void {
    (Object.keys(this.states) as CuttingAxis[]).forEach(axis => {
      this.states[axis] = { enabled: false, progress: DEFAULT_PROGRESS };
      this.syncDom(axis);
      this.onChange?.(axis, false, DEFAULT_PROGRESS);
    });
  }

  private setEnabled(axis: CuttingAxis, enabled: boolean): void {
    this.states[axis].enabled = enabled;
    this.syncDom(axis);
    this.onChange?.(axis, enabled, this.states[axis].progress);
  }

  /** Setzt den Fortschritt; Bewegen eines Sliders aktiviert die Achse automatisch. */
  private setProgress(axis: CuttingAxis, value: number, autoEnable: boolean): void {
    const state = this.states[axis];
    state.progress = clampProgress(value);
    if (autoEnable) state.enabled = true;
    this.syncDom(axis);
    this.onChange?.(axis, state.enabled, state.progress);
  }

  private syncDom(axis: CuttingAxis): void {
    const root = document.querySelector<HTMLElement>(`.cut-axis[data-axis="${axis}"]`);
    if (!root) return;
    const { enabled, progress } = this.states[axis];
    const text = formatProgress(progress);
    root.classList.toggle("active", enabled);
    root.querySelector<HTMLInputElement>(".cut-axis-enabled")!.checked = enabled;
    const slider = root.querySelector<HTMLInputElement>(".cut-axis-progress")!;
    slider.value = String(progress);
    slider.setAttribute("aria-valuetext", text);
    const number = root.querySelector<HTMLInputElement>(".cut-axis-number")!;
    if (document.activeElement !== number) number.value = String(progress);
    root.querySelector("output")!.textContent = text;
  }
}
