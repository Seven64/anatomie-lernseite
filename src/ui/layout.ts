/**
 * Statisches HTML-Gerüst der Anwendung (Header, Sidebar, Hauptbereich, Info-Panel).
 * Die Lizenzhinweise im „Über“-Tab müssen erhalten bleiben (CC BY-SA 4.0).
 */

const ICONS = {
  menu: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="18" x2="21" y2="18"></line>
    </svg>`,
  search: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
    </svg>`,
  sun: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="theme-icon-sun" style="display: none;" aria-hidden="true">
      <circle cx="12" cy="12" r="5"></circle>
      <line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
      <line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
    </svg>`,
  moon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="theme-icon-moon" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
    </svg>`,
  settings: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <circle cx="12" cy="12" r="3"></circle>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
    </svg>`,
  tree: `<svg class="sidebar-tab-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <polyline points="17 18 19 20 21 18"></polyline><polyline points="7 18 9 20 11 18"></polyline>
      <polyline points="7 12 9 14 11 12"></polyline><polyline points="17 12 19 14 21 12"></polyline>
      <polyline points="7 6 9 8 11 6"></polyline><polyline points="17 6 19 8 21 6"></polyline>
      <line x1="12" y1="2" x2="12" y2="22"></line>
    </svg>`,
  info: `<svg class="sidebar-tab-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <circle cx="12" cy="12" r="9"></circle><line x1="12" y1="11" x2="12" y2="16"></line>
      <circle cx="12" cy="7.5" r="0.75" fill="currentColor" stroke="none"></circle>
    </svg>`,
  close: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>`,
};

export const INFO_PANEL_EMPTY_HTML = `
  <div class="info-panel-empty">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
      <circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>
    </svg>
    <p>Wählen Sie eine Struktur im Atlas</p>
  </div>`;

const MODES: Array<{ id: string; label: string }> = [
  { id: "atlas", label: "Atlas" },
  { id: "labelQuiz", label: "Beschriftungs-Quiz" },
  { id: "quiz", label: "Quiz" },
  { id: "flashcards", label: "Karteikarten" },
  { id: "progress", label: "Fortschritt" },
  { id: "notes", label: "Notizen" },
];

function renderAbout(version: string): string {
  return `
    <section id="about-content" class="about-content" hidden aria-labelledby="about-title">
      <div class="about-intro">
        <img src="./logo.svg" alt="" class="about-logo">
        <h2 id="about-title">Anatomie Lernseite</h2>
        <p class="about-version">Version ${version}</p>
        <p>Interaktive 3D-Modelle zum Lernen und Erkunden der Anatomie.</p>
      </div>
      <section class="about-section">
        <h3>Programmcode</h3>
        <p>Der Anwendungscode steht unter der MIT-Lizenz.</p>
        <a href="https://opensource.org/license/mit" target="_blank" rel="noopener noreferrer">MIT-Lizenz ansehen</a>
      </section>
      <section class="about-section">
        <h3>3D-Modelle und Anatomiedaten</h3>
        <p>Die mitgelieferten Modelle und Daten stehen unter CC BY-SA 4.0. Bei einer Weitergabe sind Quellenangaben und Lizenzhinweise zu erhalten. Bearbeitungen müssen unter gleichen Bedingungen weitergegeben werden.</p>
        <ul class="about-sources">
          <li><a href="https://github.com/Z-Anatomy/Models-of-human-anatomy" target="_blank" rel="noopener noreferrer">Z-Anatomy</a></li>
          <li>BodyParts3D, DBCLS</li>
          <li>Wikipedia sowie die Universitäten Basel, Tokio und Zürich</li>
        </ul>
        <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0 Lizenzbedingungen</a>
      </section>
      <section class="about-section">
        <h3>Mitgelieferte Komponenten</h3>
        <p>Die Desktop-Version enthält Electron mit Chromium, vorbereitete 3D-Modelle und den Draco-Decoder. Blender wird nicht installiert und ist zum Ausführen nicht erforderlich.</p>
        <p>Der Draco-Decoder steht unter Apache License 2.0. three.js und three-mesh-bvh stehen unter der MIT-Lizenz, idb unter der ISC-Lizenz. Electron und Chromium enthalten weitere Komponenten mit eigenen Open-Source-Lizenzen.</p>
        <a href="https://www.apache.org/licenses/LICENSE-2.0" target="_blank" rel="noopener noreferrer">Apache License 2.0</a>
      </section>
      <details class="about-notices">
        <summary>Vollständige Quellen- und Lizenzhinweise</summary>
        <iframe src="./licenses/third-party.html" title="Vollständige Quellen- und Lizenzhinweise" loading="lazy"></iframe>
      </details>
    </section>`;
}

export function renderAppLayout(version: string): string {
  return `
    <div class="app-layout" id="app-layout">
      <header class="app-header">
        <div class="header-left">
          <button class="btn btn-icon sidebar-toggle" id="sidebar-toggle" aria-label="Sidebar umschalten">${ICONS.menu}</button>
          <div class="header-brand">
            <img src="./logo.svg" alt="" aria-hidden="true">
            <span>Anatomie Lernseite</span>
          </div>
        </div>
        <div class="header-center">
          <div class="mode-tabs" id="mode-tabs">
            ${MODES.map((mode, index) => `<button class="mode-tab${index === 0 ? " active" : ""}" data-mode="${mode.id}">${mode.label}</button>`).join("")}
          </div>
        </div>
        <div class="header-right">
          <div class="header-search" id="global-search">
            ${ICONS.search}
            <input type="search" placeholder="Struktur suchen..." aria-label="Globale Suche" id="search-input">
          </div>
          <button class="btn btn-icon" id="theme-toggle" aria-label="Thema wechseln" title="Thema wechseln">${ICONS.sun}${ICONS.moon}</button>
          <button class="btn btn-icon" id="settings-btn" aria-label="Einstellungen" title="Einstellungen">${ICONS.settings}</button>
        </div>
      </header>

      <aside class="app-sidebar" id="sidebar">
        <div class="sidebar-header">
          <div class="sidebar-tabs">
            <button class="sidebar-tab active" data-tab="tree" id="tab-tree">${ICONS.tree}<span class="sidebar-tab-text">Strukturen</span></button>
            <button class="sidebar-tab" data-tab="search" id="tab-search">${ICONS.search.replace('width="20" height="20"', 'class="sidebar-tab-icon" width="18" height="18"')}<span class="sidebar-tab-text">Suche</span></button>
            <button class="sidebar-tab" data-tab="about" id="tab-about">${ICONS.info}<span class="sidebar-tab-text">Über</span></button>
          </div>
        </div>
        <div class="sidebar-content" id="sidebar-content">
          <div class="tree-search">
            <input type="search" class="search-input" id="tree-search" placeholder="Struktur filtern..." aria-label="Strukturbaum filtern">
          </div>
          <div id="structure-tree"></div>
          <div id="search-results" style="display: none;"></div>
          ${renderAbout(version)}
        </div>
      </aside>

      <main class="main-content">
        <div class="canvas-container" id="canvas-container"></div>
      </main>

      <aside class="info-panel" id="info-panel">
        <div class="info-panel-header">
          <h3 class="info-panel-title" id="info-title">Strukturdetails</h3>
          <button class="btn btn-secondary info-panel-close" id="info-close" aria-label="Panel schließen" aria-controls="info-panel" title="Strukturdetails schließen">
            ${ICONS.close}<span>Schließen</span>
          </button>
        </div>
        <div class="info-panel-content" id="info-content">${INFO_PANEL_EMPTY_HTML}</div>
      </aside>
    </div>`;
}
