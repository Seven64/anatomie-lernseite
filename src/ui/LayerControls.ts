import { BodySystem } from "../types";

export type LayerPeelCallback = (system: BodySystem, depth: number, ghost: boolean) => void;

/** Zustand der Schichtberechnung eines Systems, wie ihn der Atlas meldet. */
export type LayerStatus =
  | { kind: "idle" }
  | { kind: "computing"; percent: number }
  | { kind: "ready"; layerCounts: number[] }
  | { kind: "error" };

interface LayerState {
  status: LayerStatus;
  depth: number;
  ghost: boolean;
}

/**
 * Schicht-Slider: trägt Muskelschichten von außen nach innen ab.
 * Wert 0 = alle Schichten sichtbar, Wert k = die äußeren k Schichten sind abgetragen.
 */
export class LayerControls {
  private states = new Map<BodySystem, LayerState>();

  constructor(private onPeel: LayerPeelCallback | null = null) {}

  setCallback(callback: LayerPeelCallback | null): void {
    this.onPeel = callback;
  }

  private state(system: BodySystem): LayerState {
    let state = this.states.get(system);
    if (!state) {
      state = { status: { kind: "idle" }, depth: 0, ghost: false };
      this.states.set(system, state);
    }
    return state;
  }

  render(system: BodySystem): string {
    const state = this.state(system);
    return `
      <div class="layer-peel" data-system="${system}">
        <div class="layer-peel-head">
          <label class="layer-peel-label" for="layer-peel-${system}">Schichten abtragen</label>
          <output class="layer-peel-value" for="layer-peel-${system}"></output>
        </div>
        <input type="range" class="layer-peel-range" id="layer-peel-${system}" data-system="${system}"
          min="0" max="1" step="1" value="${state.depth}" aria-label="Muskelschichten abtragen">
        <div class="layer-peel-scale" aria-hidden="true"><span>Oberfläche</span><span>Tiefe</span></div>
        <label class="layer-peel-ghost">
          <input type="checkbox" class="layer-peel-ghost-toggle" data-system="${system}" ${state.ghost ? "checked" : ""}>
          Abgetragene Schichten transparent zeigen
        </label>
      </div>`;
  }

  bind(container: HTMLElement, signal: AbortSignal): void {
    container.addEventListener("input", event => {
      const target = event.target as HTMLInputElement;
      if (!target.classList.contains("layer-peel-range")) return;
      const system = target.dataset.system as BodySystem;
      const state = this.state(system);
      state.depth = target.valueAsNumber;
      this.sync(system);
      this.onPeel?.(system, state.depth, state.ghost);
    }, { signal });

    container.addEventListener("change", event => {
      const target = event.target as HTMLInputElement;
      if (!target.classList.contains("layer-peel-ghost-toggle")) return;
      const system = target.dataset.system as BodySystem;
      const state = this.state(system);
      state.ghost = target.checked;
      this.onPeel?.(system, state.depth, state.ghost);
    }, { signal });
  }

  setStatus(system: BodySystem, status: LayerStatus): void {
    const state = this.state(system);
    state.status = status;
    if (status.kind === "ready") state.depth = Math.min(state.depth, status.layerCounts.length - 1);
    this.sync(system);
  }

  getDepth(system: BodySystem): number {
    return this.state(system).depth;
  }

  reset(): void {
    this.states.forEach((state, system) => {
      state.depth = 0;
      state.ghost = false;
      this.sync(system);
    });
  }

  /** Aktualisiert Slider und Beschriftung, ohne den Baum neu zu rendern. */
  sync(system: BodySystem): void {
    const root = document.querySelector<HTMLElement>(`.layer-peel[data-system="${system}"]`);
    if (!root) return;
    const state = this.state(system);
    const range = root.querySelector<HTMLInputElement>(".layer-peel-range")!;
    const output = root.querySelector<HTMLOutputElement>(".layer-peel-value")!;
    const ghost = root.querySelector<HTMLInputElement>(".layer-peel-ghost-toggle")!;
    ghost.checked = state.ghost;

    const { status } = state;
    root.dataset.status = status.kind;
    if (status.kind !== "ready") {
      range.disabled = true;
      ghost.disabled = true;
      output.textContent = status.kind === "computing"
        ? `Berechne … ${Math.round(status.percent)} %`
        : status.kind === "error" ? "Nicht verfügbar" : "Muskulatur einblenden";
      return;
    }

    const maxDepth = Math.max(status.layerCounts.length - 1, 0);
    range.disabled = maxDepth === 0;
    ghost.disabled = false;
    range.max = String(maxDepth);
    range.value = String(state.depth);
    const removed = status.layerCounts.slice(0, state.depth).reduce((sum, count) => sum + count, 0);
    const text = state.depth === 0
      ? `Alle ${status.layerCounts.length} Schichten`
      : `${state.depth} von ${status.layerCounts.length} abgetragen · ${removed} Strukturen`;
    output.textContent = text;
    range.setAttribute("aria-valuetext", text);
  }
}
