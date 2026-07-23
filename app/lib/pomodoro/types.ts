export type PomodoroPhase = "idle" | "focus" | "short_rest" | "long_rest";

export type PomodoroSettings = {
  focusSeconds: number;
  shortRestSeconds: number;
  longRestSeconds: number;
  longRestInterval: number;
};

export const DEFAULT_POMODORO_SETTINGS: PomodoroSettings = {
  focusSeconds: 25 * 60,
  shortRestSeconds: 5 * 60,
  longRestSeconds: 15 * 60,
  longRestInterval: 4,
};

export type PomodoroState = {
  phase: PomodoroPhase;
  remainingSeconds: number;
  isRunning: boolean;
  completedFocusSessions: number;
  settings: PomodoroSettings;
};

export type ActivePomodoroPhase = Exclude<PomodoroPhase, "idle">;
