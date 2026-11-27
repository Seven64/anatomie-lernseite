// Electron-Hauptprozess der Anatomie Lernseite.
//
// Die gebaute Web-App (dist/) wird über das eigene Protokoll app://anatomie/ ausgeliefert.
// Ein fester Origin ist wichtig: IndexedDB und localStorage (Lernfortschritt, Notizen,
// Einstellungen) hängen am Origin. Der frühere lokale HTTP-Server auf einem zufälligen
// Port erzeugte bei jedem Start einen neuen Origin – die Daten waren nach dem Neustart weg.
const fs = require("node:fs");
const path = require("node:path");
const { app, BrowserWindow, Menu, dialog, protocol, shell } = require("electron");

const SCHEME = "app";
const HOST = "anatomie";
const APP_ORIGIN = `${SCHEME}://${HOST}`;

const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".glb", "model/gltf-binary"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".wasm", "application/wasm"],
  [".webmanifest", "application/manifest+json"],
  [".webp", "image/webp"],
]);

// Dieselbe Content-Security-Policy wie im nginx-Image (nginx-security-headers.conf).
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
].join("; ");

// Muss vor app.ready registriert werden: „standard“ + „secure“ geben dem Protokoll
// einen echten Origin mit IndexedDB, localStorage, fetch und Web Workern.
protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true },
  },
]);

// Nur eine Instanz: ein zweiter Start holt das vorhandene Fenster nach vorn.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let mainWindow = null;

/** Liefert eine Datei aus dist/ – nie außerhalb davon. */
async function serveAsset(webRoot, request) {
  const url = new URL(request.url);
  if (url.host !== HOST) return new Response("Forbidden", { status: 403 });
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const filePath = path.resolve(webRoot, `.${pathname === "/" ? "/index.html" : pathname}`);
  const relativePath = path.relative(webRoot, filePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const data = await fs.promises.readFile(filePath);
    return new Response(request.method === "HEAD" ? null : data, {
      status: 200,
      headers: {
        "Content-Type": MIME_TYPES.get(path.extname(filePath).toLowerCase()) || "application/octet-stream",
        "Content-Length": String(data.length),
        "Content-Security-Policy": CONTENT_SECURITY_POLICY,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "EISDIR") return new Response("Not Found", { status: 404 });
    console.error("Failed to serve app asset:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: "#f5f7fb",
    title: "Anatomie Lernseite",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) {
      shell.openExternal(url).catch(error => console.error("Could not open external link:", error));
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(`${APP_ORIGIN}/`)) event.preventDefault();
  });

  mainWindow.loadURL(`${APP_ORIGIN}/index.html`).catch(error => {
    console.error("Could not load the app:", error);
    app.quit();
  });
}

/** Sucht im Hintergrund nach neuen Versionen auf GitHub-Releases (nur installierte App). */
function setupAutoUpdates() {
  if (!app.isPackaged || process.env.ANATOMIE_DISABLE_UPDATES === "1") return;
  let autoUpdater;
  try {
    ({ autoUpdater } = require("electron-updater"));
  } catch (error) {
    console.warn("electron-updater not available:", error);
    return;
  }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("error", error => console.warn("Update check failed:", error?.message ?? error));
  autoUpdater.on("update-downloaded", info => {
    if (!mainWindow) return;
    dialog.showMessageBox(mainWindow, {
      type: "info",
      buttons: ["Jetzt neu starten", "Später"],
      defaultId: 0,
      cancelId: 1,
      title: "Update verfügbar",
      message: `Version ${info.version} wurde heruntergeladen.`,
      detail: "Die neue Version wird beim nächsten Beenden installiert. Jetzt neu starten?",
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall();
    }).catch(error => console.warn("Update dialog failed:", error));
  });
  autoUpdater.checkForUpdates().catch(error => console.warn("Update check failed:", error?.message ?? error));
}

app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.whenReady()
  .then(() => {
    const webRoot = path.join(app.getAppPath(), "dist");
    if (!fs.existsSync(path.join(webRoot, "index.html"))) {
      throw new Error(`Built app files were not found at ${webRoot}.`);
    }
    protocol.handle(SCHEME, request => serveAsset(webRoot, request));
    if (app.isPackaged) Menu.setApplicationMenu(null);
    createWindow();
    setupAutoUpdates();
  })
  .catch(error => {
    console.error("Could not start the desktop app:", error);
    dialog.showErrorBox("Anatomie Lernseite", `Die Anwendung konnte nicht gestartet werden.\n\n${error.message}`);
    app.quit();
  });

app.on("activate", () => {
  if (mainWindow === null && app.isReady()) createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
