import { Structure } from "../types";
import { SettingsManager } from "../utils/SettingsManager";
import { escapeHtml, formatStructureName } from "../utils/text";
import { regionLabel, systemLabel } from "./constants";
import { INFO_PANEL_EMPTY_HTML } from "./layout";

/** Rechte Seitenleiste mit Namen, Metadaten und Aktionen zur gewählten Struktur. */
export class InfoPanel {
  constructor(private readonly settingsManager: SettingsManager) {}

  private get element(): HTMLElement | null {
    return document.getElementById("info-panel");
  }

  open(): void {
    this.element?.classList.add("open");
  }

  close(): void {
    this.element?.classList.remove("open");
  }

  toggle(): void {
    this.element?.classList.toggle("open");
  }

  clear(): void {
    const content = document.getElementById("info-content");
    if (!content) return;
    // Nach „Ausblenden“ der gewählten Struktur muss die Ansicht weiterhin zurücksetzbar sein.
    content.innerHTML = `${INFO_PANEL_EMPTY_HTML}
      <div class="structure-actions">
        <button class="btn btn-secondary" data-action="reset-view">Ansicht zurücksetzen</button>
      </div>`;
    content.querySelector("[data-action='reset-view']")!
      .addEventListener("click", () => window.dispatchEvent(new CustomEvent("reset-view")));
  }

  show(structure: Structure): void {
    const content = document.getElementById("info-content");
    if (!content) return;
    const color = this.settingsManager.getSystemColor(structure.system);
    const nameRow = (label: string, value: string | undefined, extraClass = "") => value ? `
      <div class="structure-name-row">
        <span class="structure-name-label">${label}:</span>
        <span class="structure-name-value ${extraClass}">${escapeHtml(value)}</span>
      </div>` : "";

    content.innerHTML = `
      <div class="structure-info">
        <div class="structure-names">
          ${nameRow("Name", formatStructureName(structure.nameLatin), "structure-latin")}
          ${nameRow("Deutsch", structure.nameDe && formatStructureName(structure.nameDe))}
          ${nameRow("Englisch", structure.nameEn && formatStructureName(structure.nameEn))}
        </div>
        <div class="structure-meta">
          <div class="structure-meta-item">
            <span class="structure-meta-label">System:</span>
            <span class="structure-meta-value">
              <span class="structure-system-badge" style="background: ${color}22; color: ${color}; border: 1px solid ${color};">${escapeHtml(systemLabel(structure.system))}</span>
            </span>
          </div>
          ${structure.region ? `<div class="structure-meta-item"><span class="structure-meta-label">Region:</span><span class="structure-meta-value">${escapeHtml(regionLabel(structure.region))}</span></div>` : ""}
        </div>
        <div class="structure-actions">
          <button class="btn btn-primary" data-action="isolate-structure">Isolieren</button>
          <button class="btn btn-secondary" data-action="hide-structure">Ausblenden</button>
          <button class="btn btn-secondary" data-action="reset-view">Ansicht zurücksetzen</button>
          <button class="btn btn-secondary" data-action="add-note">Notiz hinzufügen</button>
          <button class="btn btn-secondary" data-action="toggle-bookmark">Lesezeichen hinzufügen</button>
        </div>
      </div>
    `;

    const details: Record<string, unknown> = {
      "isolate-structure": structure,
      "hide-structure": structure,
      "reset-view": undefined,
      "add-note": structure.id,
      "toggle-bookmark": structure.id,
    };
    content.querySelectorAll<HTMLButtonElement>("[data-action]").forEach(button => {
      const action = button.dataset.action!;
      button.addEventListener("click", () => window.dispatchEvent(new CustomEvent(action, { detail: details[action] })));
    });
  }
}
