export type PomodoroPhase = "idle" | "focus" | "short_rest" | "long_rest";

export type PomodoroSettings = {
  focusSeconds: number;
  shortRestSeconds: number;
  longRestSeconds: number;
  longRestInterval: number;
  notifyOnPhaseComplete: boolean;
};

export const DEFAULT_POMODORO_SETTINGS: PomodoroSettings = {
  focusSeconds: 25 * 60,
  shortRestSeconds: 5 * 60,
  longRestSeconds: 15 * 60,
  longRestInterval: 4,
  notifyOnPhaseComplete: false,
};

export type PomodoroNotificationStatus =
  | "default"
  | "granted"
  | "denied"
  | "unsupported"
  | "error";

export type PomodoroState = {
  phase: PomodoroPhase;
  remainingSeconds: number;
  phaseEndsAtMs: number | null;
  isRunning: boolean;
  completedFocusSessions: number;
  settings: PomodoroSettings;
};

export type ActivePomodoroPhase = Exclude<PomodoroPhase, "idle">;
