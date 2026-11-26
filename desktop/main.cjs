const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { app, BrowserWindow, shell } = require("electron");

const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".glb", "model/gltf-binary"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".wasm", "application/wasm"],
  [".webp", "image/webp"],
]);

let mainWindow = null;
let staticServer = null;
let appOrigin = null;

function createStaticServer(webRoot) {
  return http.createServer((request, response) => {
    const address = staticServer.address();
    const expectedHost =
      address && typeof address !== "string"
        ? `127.0.0.1:${address.port}`
        : "";

    if (request.headers.host !== expectedHost) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" });
      response.end("Method Not Allowed");
      return;
    }

    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    } catch (error) {
      console.warn("Rejected malformed local request:", error);
      response.writeHead(400);
      response.end("Bad Request");
      return;
    }

    const requestedPath = pathname === "/" ? "/index.html" : pathname;
    const filePath = path.resolve(webRoot, `.${requestedPath}`);
    const relativePath = path.relative(webRoot, filePath);
    if (
      relativePath === ".." ||
      relativePath.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativePath)
    ) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    fs.stat(filePath, (statError, fileStats) => {
      if (statError) {
        if (statError.code !== "ENOENT") {
          console.error("Failed to inspect local app asset:", statError);
          response.writeHead(500);
          response.end("Internal Server Error");
          return;
        }
        response.writeHead(404);
        response.end("Not Found");
        return;
      }

      if (!fileStats.isFile()) {
        response.writeHead(404);
        response.end("Not Found");
        return;
      }

      response.writeHead(200, {
        "Cache-Control": "no-cache",
        "Content-Length": fileStats.size,
        "Content-Type":
          MIME_TYPES.get(path.extname(filePath).toLowerCase()) ||
          "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
      });

      if (request.method === "HEAD") {
        response.end();
        return;
      }

      const fileStream = fs.createReadStream(filePath);
      fileStream.on("error", (error) => {
        console.error("Failed to serve local app asset:", error);
        if (response.headersSent) {
          response.destroy(error);
          return;
        }
        response.writeHead(500);
        response.end("Internal Server Error");
      });
      fileStream.pipe(response);
    });
  });
}

function listenLoopback(server) {
  return new Promise((resolve, reject) => {
    const handleError = (error) => reject(error);
    server.once("error", handleError);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", handleError);
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("The local app server did not receive a TCP address."));
        return;
      }
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: "#f5f7fb",
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
      shell.openExternal(url).catch((error) => {
        console.error("Could not open external link:", error);
      });
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin !== appOrigin) event.preventDefault();
  });

  mainWindow.loadURL(appOrigin).catch((error) => {
    console.error("Could not load the local app:", error);
    app.quit();
  });
}

app.whenReady()
  .then(async () => {
    const webRoot = path.join(app.getAppPath(), "dist");
    if (!fs.existsSync(path.join(webRoot, "index.html"))) {
      throw new Error(`Built app files were not found at ${webRoot}.`);
    }

    staticServer = createStaticServer(webRoot);
    appOrigin = await listenLoopback(staticServer);
    createWindow();
  })
  .catch((error) => {
    console.error("Could not start the desktop app:", error);
    app.quit();
  });

app.on("activate", () => {
  if (mainWindow === null && appOrigin !== null) createWindow();
});

app.on("before-quit", () => {
  if (staticServer?.listening) staticServer.close();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
