import { escapeHtml } from "../utils/text";

export type ToastType = "success" | "error" | "warning";

const CLOSE_ICON = `
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>`;

export function showToast(message: string, type: ToastType = "success"): void {
  document.querySelector(".toast")?.remove();

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.setAttribute("role", type === "error" ? "alert" : "status");
  toast.innerHTML = `
    <span class="toast-message">${escapeHtml(message)}</span>
    <button class="toast-close" aria-label="Schließen">${CLOSE_ICON}</button>
  `;
  toast.querySelector(".toast-close")!.addEventListener("click", () => toast.remove());
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

export function showModal(html: string, onOpen?: (modal: HTMLElement) => void): void {
  closeModal();

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;

  const modal = overlay.querySelector<HTMLElement>(".modal")!;
  modal.addEventListener("click", event => event.stopPropagation());
  overlay.addEventListener("click", closeModal);
  overlay.addEventListener("keydown", event => {
    if (event.key === "Escape") closeModal();
  });

  document.body.appendChild(overlay);
  onOpen?.(modal);
  modal.querySelector<HTMLElement>("select, input, button")?.focus();
}

export function closeModal(): void {
  document.querySelector(".modal-overlay")?.remove();
}

/** Ladeanzeige der aktuell sichtbaren 3D-Ansicht (Atlas oder Quiz). */
function findLoadingOverlay(): HTMLElement | null {
  return document.querySelector<HTMLElement>("#canvas-container .loading-overlay");
}

export function showLoading(text: string): void {
  const loading = findLoadingOverlay();
  if (!loading) return;
  const label = loading.querySelector(".loading-text");
  if (label) label.textContent = text;
  updateLoadingProgress(0);
  loading.style.display = "flex";
}

export function updateLoadingProgress(percent: number): void {
  const bar = findLoadingOverlay()?.querySelector<HTMLElement>(".loading-progress-bar");
  if (bar) bar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
}

export function hideLoading(): void {
  const loading = findLoadingOverlay();
  if (loading) loading.style.display = "none";
}

/** Schwebendes Namensschild über dem 3D-Canvas. */
export class HoverLabel {
  private element: HTMLElement | null = null;

  show(text: string, x: number, y: number): void {
    const container = document.getElementById("canvas-container");
    if (!container) return;

    if (!this.element || !container.contains(this.element)) {
      this.element = document.createElement("div");
      this.element.className = "atlas-hover-label";
      this.element.setAttribute("role", "status");
      container.appendChild(this.element);
    }

    this.element.textContent = text;
    this.element.hidden = false;
    const left = Math.min(x + 14, container.clientWidth - this.element.offsetWidth - 8);
    const top = Math.min(y + 14, container.clientHeight - this.element.offsetHeight - 8);
    this.element.style.left = `${Math.max(8, left)}px`;
    this.element.style.top = `${Math.max(8, top)}px`;
  }

  hide(): void {
    if (this.element) this.element.hidden = true;
  }
}
