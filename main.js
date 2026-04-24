const { app, BrowserWindow, shell, dialog } = require("electron");
const path = require("path");

const BRINKA_URL = "https://picafern-commits.github.io/Brinka/";

let mainWindow;
let splash;

function createSplash() {
  splash = new BrowserWindow({
    width: 420,
    height: 300,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    backgroundColor: "#00000000",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  splash.loadFile(path.join(__dirname, "splash.html"));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: "#120018",
    autoHideMenuBar: true,
    title: "Brinka",
    icon: path.join(__dirname, "assets", "brinka-logo.png"),
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  });

  mainWindow.maximize();
  mainWindow.loadURL(BRINKA_URL);

  mainWindow.once("ready-to-show", () => {
    if (splash) {
      splash.close();
      splash = null;
    }
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(BRINKA_URL)) return { action: "allow" };
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("did-fail-load", () => {
    if (splash) {
      splash.close();
      splash = null;
    }

    dialog.showErrorBox(
      "Brinka sem ligação",
      "Não foi possível abrir a Brinka. Verifica a internet ou o link do GitHub Pages no ficheiro main.js."
    );
  });
}

app.whenReady().then(() => {
  createSplash();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createSplash();
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
