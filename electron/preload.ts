// Sandbox-compatible preload: exposes the typed `window.namehAmalDesktop` API
// via contextBridge. Contracts: contracts/ipc.md, research D6.
//
// Sandboxed preload scripts can only require("electron") — relative imports
// (e.g. ./ipc-channels.js) throw at load and silently kill the bridge. Channel
// names are therefore inlined here and type imports are erased at build time.

import { contextBridge, ipcRenderer } from "electron";

import type {
  PomodoroSettings,
  PomodoroSnapshot,
  PomodoroState,
} from "./ipc-channels.js";

// Keep in sync with IPC_CHANNELS in ./ipc-channels.ts.
const CHANNELS = {
  getPomodoroState: "pomodoro:get-state",
  startPomodoro: "pomodoro:start",
  stopPomodoro: "pomodoro:stop",
  skipPomodoro: "pomodoro:skip",
  updatePomodoroSettings: "pomodoro:update-settings",
  reportSelectedActivity: "desktop:report-selected-activity",
  setReminderEnabled: "desktop:set-reminder-enabled",
  pomodoroStateChanged: "pomodoro:state-changed",
  reminderChanged: "desktop:reminder-changed",
} as const;

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: unknown, payload: T) => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

const api = {
  getPomodoroState: (): Promise<PomodoroSnapshot> =>
    ipcRenderer.invoke(CHANNELS.getPomodoroState),
  startPomodoro: (): Promise<PomodoroState> =>
    ipcRenderer.invoke(CHANNELS.startPomodoro),
  stopPomodoro: (): Promise<PomodoroState> =>
    ipcRenderer.invoke(CHANNELS.stopPomodoro),
  skipPomodoro: (): Promise<PomodoroState> =>
    ipcRenderer.invoke(CHANNELS.skipPomodoro),
  updatePomodoroSettings: (partial: Partial<PomodoroSettings>): Promise<PomodoroState> =>
    ipcRenderer.invoke(CHANNELS.updatePomodoroSettings, partial),
  reportSelectedActivity: (payload: {
    categoryId: string;
    title: string | null;
  }): Promise<void> =>
    ipcRenderer.invoke(CHANNELS.reportSelectedActivity, payload),
  setReminderEnabled: (enabled: boolean): Promise<boolean> =>
    ipcRenderer.invoke(CHANNELS.setReminderEnabled, enabled),
  onPomodoroStateChanged: (
    listener: (snapshot: PomodoroSnapshot) => void,
  ): (() => void) =>
    subscribe<PomodoroSnapshot>(CHANNELS.pomodoroStateChanged, listener),
  onReminderChanged: (listener: (enabled: boolean) => void): (() => void) =>
    subscribe<boolean>(CHANNELS.reminderChanged, listener),
};

contextBridge.exposeInMainWorld("namehAmalDesktop", api);
