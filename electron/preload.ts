// Sandbox-compatible preload: exposes the typed `window.namehAmalDesktop` API
// via contextBridge. Contracts: contracts/ipc.md, research D6.
//
// Only `contextBridge` + `ipcRenderer` are imported — both available under
// `sandbox: true`. Window security settings remain unchanged (contextIsolation
// true, sandbox true, nodeIntegration false).

import { contextBridge, ipcRenderer } from "electron";

import {
  IPC_CHANNELS,
  type PomodoroSettings,
  type PomodoroSnapshot,
  type PomodoroState,
} from "./ipc-channels.js";

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: unknown, payload: T) => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

const api = {
  getPomodoroState: (): Promise<PomodoroSnapshot> =>
    ipcRenderer.invoke(IPC_CHANNELS.getPomodoroState),
  startPomodoro: (): Promise<PomodoroState> =>
    ipcRenderer.invoke(IPC_CHANNELS.startPomodoro),
  stopPomodoro: (): Promise<PomodoroState> =>
    ipcRenderer.invoke(IPC_CHANNELS.stopPomodoro),
  skipPomodoro: (): Promise<PomodoroState> =>
    ipcRenderer.invoke(IPC_CHANNELS.skipPomodoro),
  updatePomodoroSettings: (partial: Partial<PomodoroSettings>): Promise<PomodoroState> =>
    ipcRenderer.invoke(IPC_CHANNELS.updatePomodoroSettings, partial),
  reportSelectedActivity: (payload: {
    categoryId: string;
    title: string | null;
  }): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.reportSelectedActivity, payload),
  setReminderEnabled: (enabled: boolean): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.setReminderEnabled, enabled),
  onPomodoroStateChanged: (
    listener: (snapshot: PomodoroSnapshot) => void,
  ): (() => void) =>
    subscribe<PomodoroSnapshot>(IPC_CHANNELS.pomodoroStateChanged, listener),
  onReminderChanged: (listener: (enabled: boolean) => void): (() => void) =>
    subscribe<boolean>(IPC_CHANNELS.reminderChanged, listener),
};

contextBridge.exposeInMainWorld("namehAmalDesktop", api);
