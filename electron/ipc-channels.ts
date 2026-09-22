// Shared IPC channel names and payload types for the desktop pomodoro feature.
// Renderer ↔ main contract: specs/002-mac-menubar-pomodoro/contracts/ipc.md
//
// This module must stay free of `electron` imports so the renderer can reuse the
// payload types (type-only imports are erased at build time).

import type { PomodoroSettings, PomodoroState } from "../app/lib/pomodoro/types.js";

export type { PomodoroSettings, PomodoroState };

export const IPC_CHANNELS = {
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

/** The app's "currently selected activity" as last reported by the renderer (data-model §3). */
export type SelectedActivityRef = {
  categoryId: string;
  title: string | null;
  reportedAt: number;
};

/** Full state snapshot pushed to the renderer and consumed by the Tray. */
export type PomodoroSnapshot = {
  state: PomodoroState;
  selectedActivity: SelectedActivityRef | null;
  reminderEnabled: boolean;
  /**
   * Host-resolved activity label (draft title → category name → "—"),
   * identical to the string the Tray displays (FR-012, T022). Optional so
   * legacy snapshot producers and test fixtures stay source-compatible.
   */
  activityName?: string;
};

/** Activity label shown next to the tray countdown (draft title → category name → "—"). */
export const FALLBACK_ACTIVITY_NAME = "—";

/** API exposed on `window.namehAmalDesktop` by `electron/preload.ts` (contracts/ipc.md). */
export interface NamehAmalDesktop {
  getPomodoroState(): Promise<PomodoroSnapshot>;
  startPomodoro(): Promise<PomodoroState>;
  stopPomodoro(): Promise<PomodoroState>;
  skipPomodoro(): Promise<PomodoroState>;
  updatePomodoroSettings(partial: Partial<PomodoroSettings>): Promise<PomodoroState>;
  reportSelectedActivity(payload: { categoryId: string; title: string | null }): Promise<void>;
  setReminderEnabled(enabled: boolean): Promise<boolean>;
  onPomodoroStateChanged(listener: (snapshot: PomodoroSnapshot) => void): () => void;
  onReminderChanged(listener: (enabled: boolean) => void): () => void;
}

export function isValidSelectedActivityPayload(
  payload: unknown,
): payload is { categoryId: string; title: string | null } {
  if (typeof payload !== "object" || payload === null) return false;
  const record = payload as Record<string, unknown>;
  return (
    typeof record.categoryId === "string" &&
    record.categoryId.trim().length > 0 &&
    (record.title === null || typeof record.title === "string")
  );
}
