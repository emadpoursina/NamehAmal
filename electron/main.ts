import {
  app,
  BrowserWindow,
  dialog,
  type Event as ElectronEvent,
} from "electron";

import { createRuntimeConfig, type RuntimeConfig } from "./runtime-config.js";
import {
  DesktopRuntimeError,
  ServerProcess,
} from "./server-process.js";

let mainWindow: BrowserWindow | null = null;
let serverProcess: ServerProcess | null = null;
let runtimeConfig: RuntimeConfig | null = null;
let isQuitting = false;
let startupPromise: Promise<void> | null = null;
let isStarting = false;

export function isAllowedNavigation(origin: string, url: string): boolean {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

function focusMainWindow(): void {
  if (!mainWindow) {
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.focus();
}

function configureWindowSecurity(window: BrowserWindow, origin: string): void {
  const denyNavigation = (event: ElectronEvent, url: string) => {
    if (!isAllowedNavigation(origin, url)) {
      event.preventDefault();
    }
  };

  window.webContents.on("will-navigate", denyNavigation);
  window.webContents.on("will-redirect", denyNavigation);
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
}

async function createMainWindow(): Promise<void> {
  if (!runtimeConfig || !serverProcess?.isReady) {
    throw new Error("The desktop server is not ready for a window");
  }

  mainWindow = new BrowserWindow({
    show: false,
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: "NamehAmal",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  configureWindowSecurity(mainWindow, runtimeConfig.origin);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  try {
    await mainWindow.loadURL(runtimeConfig.origin);
    mainWindow.show();
  } catch (error) {
    mainWindow.destroy();
    mainWindow = null;
    throw new DesktopRuntimeError(
      "SERVER_CRASHED",
      `NamehAmal could not load its local dashboard. Check ${serverProcess.logPath ?? "the desktop log"} and try again.`,
      { cause: error },
    );
  }
}

function showStartupError(error: unknown): void {
  const message =
    error instanceof Error
      ? error.message
      : "The desktop application could not start for an unknown reason.";
  dialog.showErrorBox("NamehAmal could not start", message);
}

async function startApplication(): Promise<void> {
  isStarting = true;
  runtimeConfig = createRuntimeConfig({
    isPackaged: app.isPackaged,
    projectRoot: app.getAppPath(),
    resourcesPath: process.resourcesPath,
    userDataDirectory: app.getPath("userData"),
  });
  serverProcess = new ServerProcess({
    config: runtimeConfig,
    onUnexpectedExit: (error) => {
      if (isQuitting) {
        return;
      }
      showStartupError(error);
      app.quit();
    },
  });
  try {
    await serverProcess.start();
    await createMainWindow();
  } finally {
    isStarting = false;
  }
}

async function shutdown(): Promise<void> {
  await serverProcess?.stop();
  serverProcess = null;
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    focusMainWindow();
  });

  app.whenReady().then(() => {
    startupPromise = startApplication().catch((error) => {
      showStartupError(error);
      void app.quit();
    });
    return startupPromise;
  });

  app.on("activate", () => {
    if (mainWindow) {
      focusMainWindow();
      return;
    }
    if (serverProcess?.isReady && !isStarting) {
      startupPromise = createMainWindow().catch((error) => {
        showStartupError(error);
        void app.quit();
      });
    }
  });

  app.on("window-all-closed", () => {
    if (!isQuitting) {
      app.quit();
    }
  });

  app.on("before-quit", (event) => {
    if (isQuitting) {
      return;
    }
    event.preventDefault();
    isQuitting = true;
    void shutdown().finally(() => {
      app.quit();
    });
  });
}
