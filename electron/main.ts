import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Notification,
  type Event as ElectronEvent,
} from "electron";
import path from "node:path";

import { createRuntimeConfig, type RuntimeConfig } from "./runtime-config.js";
import {
  DesktopRuntimeError,
  ServerProcess,
} from "./server-process.js";
import {
  IPC_CHANNELS,
  type PomodoroSnapshot,
  isValidSelectedActivityPayload,
} from "./ipc-channels.js";
import {
  DebouncedWriter,
  loadDesktopState,
} from "./desktop-state.js";
import { PomodoroHost } from "./pomodoro-host.js";
import { ReminderCycle } from "./reminder-cycle.js";
import { MenuBarTray } from "./tray.js";

let mainWindow: BrowserWindow | null = null;
let serverProcess: ServerProcess | null = null;
let runtimeConfig: RuntimeConfig | null = null;
let isQuitting = false;
let startupPromise: Promise<void> | null = null;
let isStarting = false;
let pomodoroHost: PomodoroHost | null = null;
let reminderCycle: ReminderCycle | null = null;
let menuBarTray: MenuBarTray | null = null;
let stateWriter: DebouncedWriter | null = null;
let tickTimer: ReturnType<typeof setInterval> | null = null;

const isMac = process.platform === "darwin";

export function isAllowedNavigation(origin: string, url: string): boolean {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

/** Open App: show + focus the window and restore the Dock icon (FR-003, D5). */
function showMainWindow(): void {
  if (!mainWindow) {
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
  if (isMac) {
    app.dock?.show();
  }
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

function broadcastPomodoroState(payload: {
  snapshot: PomodoroSnapshot;
  activityName: string;
}): void {
  if (isQuitting) return;
  menuBarTray?.update(payload.snapshot, payload.activityName);
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(
        IPC_CHANNELS.pomodoroStateChanged,
        payload.snapshot,
      );
    }
  }
}

function broadcastReminderEnabled(enabled: boolean): void {
  if (isQuitting) return;
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(IPC_CHANNELS.reminderChanged, enabled);
    }
  }
}

function showReminderBanner(): void {
  // Non-blocking, dismissible banner — never a modal dialog (D8).
  if (!Notification.isSupported()) return;
  new Notification({
    title: "NamehAmal",
    body: "Ready to start a pomodoro?",
  }).show();
}

function registerPomodoroIpc(): void {
  ipcMain.handle(IPC_CHANNELS.getPomodoroState, () =>
    pomodoroHost?.getSnapshot() ?? null,
  );
  ipcMain.handle(IPC_CHANNELS.startPomodoro, () => pomodoroHost?.start());
  ipcMain.handle(IPC_CHANNELS.stopPomodoro, () => pomodoroHost?.stop());
  ipcMain.handle(IPC_CHANNELS.skipPomodoro, () => pomodoroHost?.skip());
  ipcMain.handle(
    IPC_CHANNELS.updatePomodoroSettings,
    (_event, partial: unknown) => {
      if (typeof partial !== "object" || partial === null) return undefined;
      return pomodoroHost?.updateSettings(partial as Record<string, never>);
    },
  );
  ipcMain.handle(IPC_CHANNELS.reportSelectedActivity, (_event, payload: unknown) => {
    if (!isValidSelectedActivityPayload(payload)) return;
    pomodoroHost?.reportSelectedActivity(payload);
  });
  ipcMain.handle(IPC_CHANNELS.setReminderEnabled, (_event, enabled: unknown) => {
    if (typeof enabled !== "boolean") return false;
    return setReminderEnabled(enabled);
  });
}

function setReminderEnabled(enabled: boolean): boolean {
  const value = pomodoroHost?.setReminderEnabled(enabled) ?? enabled;
  if (value) {
    // Turned on mid-idle: re-arm from now (first reminder 5 minutes later).
    reminderCycle?.reset();
  }
  broadcastReminderEnabled(value);
  return value;
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
      preload: path.join(__dirname, "preload.js"),
    },
  });
  configureWindowSecurity(mainWindow, runtimeConfig.origin);

  if (isMac) {
    // Hide-to-tray on macOS (D5): the window stays alive, hidden.
    mainWindow.on("close", (event) => {
      if (isQuitting) return;
      event.preventDefault();
      mainWindow?.hide();
      app.dock?.hide();
    });
  }
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  // Re-sync the renderer once the page finishes loading.
  mainWindow.webContents.on("did-finish-load", () => {
    const snapshot = pomodoroHost?.getSnapshot();
    if (snapshot) {
      broadcastPomodoroState({
        snapshot,
        activityName: pomodoroHost?.getActivityName() ?? "—",
      });
    }
  });

  try {
    await mainWindow.loadURL(runtimeConfig.origin);
    mainWindow.show();
    if (isMac) {
      app.dock?.show();
    }
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

/** Foundation wiring (US1 T011): desktop state → host → tick → tray. */
function startPomodoroFoundation(): void {
  if (!runtimeConfig) return;

  const stateFilePath = path.join(
    app.getPath("userData"),
    "pomodoro.json",
  );
  stateWriter = new DebouncedWriter(stateFilePath);
  pomodoroHost = new PomodoroHost({
    writer: stateWriter,
    load: () => loadDesktopState(stateFilePath),
    tracker: PomodoroHost.createHttpTrackerClient(runtimeConfig.origin),
    broadcast: broadcastPomodoroState,
    onRunningChange: () => {
      // FR-011: every start (or return to idle) re-arms the reminder cycle.
      reminderCycle?.reset();
    },
  });
  void pomodoroHost.hydrate();

  tickTimer = setInterval(() => {
    void pomodoroHost?.tick();
  }, 1000);

  reminderCycle = new ReminderCycle({
    deliver: showReminderBanner,
    decide: () => ({
      reminderEnabled: pomodoroHost?.getSnapshot().reminderEnabled ?? true,
      isPomodoroRunning:
        pomodoroHost?.getSnapshot().state.isRunning === true,
    }),
  });
  reminderCycle.start();

  if (isMac) {
    menuBarTray = new MenuBarTray({
      isServerReady: () => serverProcess?.isReady === true,
      onOpenApp: showMainWindow,
      onQuitApp: () => {
        void app.quit();
      },
      onStartPomodoro: () => {
        // Tray-originated start: the only path that binds a tracker draft (D3/T034).
        void pomodoroHost?.start({ bindTracker: true });
      },
      onStopPomodoro: () => {
        void pomodoroHost?.stop();
      },
      onSetReminderEnabled: setReminderEnabled,
    });
    menuBarTray.create();
  }

  registerPomodoroIpc();
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
    startPomodoroFoundation();
    await createMainWindow();
  } finally {
    isStarting = false;
  }
}

async function shutdown(): Promise<void> {
  // FR-012 groundwork: flush the persisted runtime state before exit.
  if (pomodoroHost) {
    pomodoroHost.dispose();
    pomodoroHost = null;
  }
  if (tickTimer !== null) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
  reminderCycle?.stop();
  reminderCycle = null;
  menuBarTray?.destroy();
  menuBarTray = null;
  await stateWriter?.flush();
  stateWriter = null;
  for (const channel of Object.values(IPC_CHANNELS)) {
    ipcMain.removeHandler(channel);
  }
  await serverProcess?.stop();
  serverProcess = null;
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    showMainWindow();
  });

  app.whenReady().then(() => {
    if (isMac) {
      // No Dock icon while no window is open; restored when shown (FR-002, D5).
      app.dock?.hide();
    }
    startupPromise = startApplication().catch((error) => {
      showStartupError(error);
      void app.quit();
    });
    return startupPromise;
  });

  app.on("activate", () => {
    if (mainWindow) {
      showMainWindow();
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
    if (isMac) {
      // Menu-bar-only mode: the app lives in the tray (D5). Still quit if a
      // quit was already requested so shutdown completes.
      if (isQuitting) {
        app.quit();
      }
      return;
    }
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
