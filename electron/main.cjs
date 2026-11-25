const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const crypto = require("crypto");
const http = require("http");
const { spawn } = require("child_process");

const ROOT_DIR = path.resolve(__dirname, "..");
const BACKEND_PORT = Number(process.env.NEXUS_PORT || process.env.JARVIS_PORT || 8765);
const API_TOKEN =
  process.env.NEXUS_API_TOKEN ||
  process.env.JARVIS_API_TOKEN ||
  crypto.randomBytes(24).toString("hex");

let mainWindow = null;
let backendProc = null;

function waitForBackend(retries = 40) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const probe = () => {
      attempts += 1;
      const req = http.get(
        {
          host: "127.0.0.1",
          port: BACKEND_PORT,
          path: "/api/health",
          headers: { "X-Nexus-Token": API_TOKEN },
          timeout: 1000,
        },
        (res) => {
          res.resume();
          if (res.statusCode === 200) {
            resolve();
          } else if (attempts < retries) {
            setTimeout(probe, 250);
          } else {
            reject(new Error(`Backend returned status ${res.statusCode}`));
          }
        }
      );
      req.on("error", () => {
        if (attempts < retries) {
          setTimeout(probe, 250);
        } else {
          reject(new Error("Timed out waiting for NEXUS-AI backend"));
        }
      });
    };
    probe();
  });
}

function startBackend() {
  const pythonCmd = process.env.NEXUS_PYTHON || process.env.JARVIS_PYTHON || "python";
  backendProc = spawn(pythonCmd, ["-m", "backend.run", "--host", "127.0.0.1", "--port", String(BACKEND_PORT)], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      NEXUS_API_TOKEN: API_TOKEN,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  backendProc.stdout.on("data", (d) => process.stdout.write(`[backend] ${d}`));
  backendProc.stderr.on("data", (d) => process.stderr.write(`[backend] ${d}`));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1460,
    height: 920,
    minWidth: 1080,
    minHeight: 700,
    backgroundColor: "#04070f",
    frame: false,
    titleBarStyle: "hidden",
    title: "NEXUS-AI — Personal Desktop AI",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const devUrl = process.env.NEXUS_DEV_URL || process.env.JARVIS_DEV_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadURL(`http://127.0.0.1:${BACKEND_PORT}/`);
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

const getConfigHandler = () => ({
  apiBase: `http://127.0.0.1:${BACKEND_PORT}`,
  apiToken: API_TOKEN,
  isElectron: true,
});

const pickFolderHandler = async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
    title: "Select Project Folder for NEXUS-AI Workspace",
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
};

const windowControlHandler = (_event, action) => {
  if (!mainWindow) return;
  if (action === "minimize") mainWindow.minimize();
  else if (action === "maximize") {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  } else if (action === "close") mainWindow.close();
};

ipcMain.handle("nexus:get-config", getConfigHandler);
ipcMain.handle("nexus:pick-folder", pickFolderHandler);
ipcMain.handle("nexus:window-control", windowControlHandler);

app.whenReady().then(async () => {
  startBackend();
  try {
    await waitForBackend();
  } catch (err) {
    console.error(err);
  }
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (backendProc && !backendProc.killed) {
    backendProc.kill();
  }
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (backendProc && !backendProc.killed) {
    backendProc.kill();
  }
});
