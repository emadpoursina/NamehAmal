// Renderer adapter over `window.namehAmalDesktop` (desktop build only).
// Contracts: contracts/ipc.md, research D6. No localStorage access.

import type {
  NamehAmalDesktop,
  PomodoroSnapshot,
} from "@/electron/ipc-channels";
import type { PomodoroSettings, PomodoroState } from "./types.js";

export type PomodoroTransport = {
  /** Fetch the current snapshot (invoke `pomodoro:get-state`). */
  getSnapshot: () => Promise<PomodoroSnapshot>;
  /** Subscribe to `pomodoro:state-changed` pushes (last snapshot wins). */
  subscribe: (listener: (snapshot: PomodoroSnapshot) => void) => () => void;
  start: () => Promise<PomodoroState>;
  stop: () => Promise<PomodoroState>;
  skip: () => Promise<PomodoroState>;
  updateSettings: (partial: Partial<PomodoroSettings>) => Promise<PomodoroState>;
  reportSelectedActivity: (payload: {
    categoryId: string;
    title: string | null;
  }) => Promise<void>;
  setReminderEnabled: (enabled: boolean) => Promise<boolean>;
};

/** True only in the Electron renderer (preload installed `namehAmalDesktop`). */
export function isDesktopRuntime(): boolean {
  return typeof window !== "undefined" && window.namehAmalDesktop !== undefined;
}

/** Build the desktop transport; throws when no desktop API is present. */
export function createDesktopPomodoroTransport(
  api: NamehAmalDesktop,
): PomodoroTransport {
  return {
    getSnapshot: () => api.getPomodoroState(),
    subscribe: (listener) => api.onPomodoroStateChanged(listener),
    start: () => api.startPomodoro(),
    stop: () => api.stopPomodoro(),
    skip: () => api.skipPomodoro(),
    updateSettings: (partial) => api.updatePomodoroSettings(partial),
    reportSelectedActivity: (payload) => api.reportSelectedActivity(payload),
    setReminderEnabled: (enabled) => api.setReminderEnabled(enabled),
  };
}

/** Desktop API when running in the Electron renderer; undefined on the web. */
export function getDesktopApi(): NamehAmalDesktop | null {
  if (typeof window === "undefined") return null;
  return window.namehAmalDesktop ?? null;
}
