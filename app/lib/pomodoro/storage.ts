import {
  DEFAULT_POMODORO_SETTINGS,
  type PomodoroPhase,
  type PomodoroSettings,
  type PomodoroState,
} from "./types";
import { createInitialState } from "./engine";

const SETTINGS_KEY = "nameh-amal:pomodoro:settings";
export const RUN_KEY = "nameh-amal:pomodoro:run";

export type PomodoroRunSnapshot = Pick<
  PomodoroState,
  | "phase"
  | "remainingSeconds"
  | "isRunning"
  | "completedFocusSessions"
  | "phaseEndsAtMs"
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readPositiveInt(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;
}

function readNonNegativeInt(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : fallback;
}

/** Parse persisted settings; falls back to defaults for invalid or missing data. */
export function parsePomodoroSettings(raw: unknown): PomodoroSettings {
  if (!isRecord(raw)) return { ...DEFAULT_POMODORO_SETTINGS };

  return {
    focusSeconds: readPositiveInt(
      raw.focusSeconds,
      DEFAULT_POMODORO_SETTINGS.focusSeconds,
    ),
    shortRestSeconds: readPositiveInt(
      raw.shortRestSeconds,
      DEFAULT_POMODORO_SETTINGS.shortRestSeconds,
    ),
    longRestSeconds: readPositiveInt(
      raw.longRestSeconds,
      DEFAULT_POMODORO_SETTINGS.longRestSeconds,
    ),
    longRestInterval: readPositiveInt(
      raw.longRestInterval,
      DEFAULT_POMODORO_SETTINGS.longRestInterval,
    ),
    notifyOnPhaseComplete: raw.notifyOnPhaseComplete === true,
  };
}

/** Load settings from localStorage (client only). */
export function loadPomodoroSettings(): PomodoroSettings {
  if (typeof window === "undefined") return { ...DEFAULT_POMODORO_SETTINGS };

  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_POMODORO_SETTINGS };
    return parsePomodoroSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_POMODORO_SETTINGS };
  }
}

/** Persist settings to localStorage. */
export function savePomodoroSettings(settings: PomodoroSettings): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function isPomodoroPhase(value: unknown): value is PomodoroPhase {
  return (
    value === "idle" ||
    value === "focus" ||
    value === "short_rest" ||
    value === "long_rest"
  );
}

function isValidPhaseEnd(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

/** Parse a saved run; invalid data falls back to an idle state. */
export function parsePomodoroRun(
  raw: unknown,
  settings: PomodoroSettings = DEFAULT_POMODORO_SETTINGS,
): PomodoroState {
  const fallback = createInitialState(settings);
  if (!isRecord(raw)) return fallback;

  const phase = raw.phase;
  const isRunning = raw.isRunning;
  const phaseEndsAtMs = raw.phaseEndsAtMs;

  if (
    !isPomodoroPhase(phase) ||
    typeof isRunning !== "boolean" ||
    !isValidPhaseEnd(phaseEndsAtMs)
  ) {
    return fallback;
  }

  const remainingSeconds = readPositiveInt(raw.remainingSeconds, 0);
  const completedFocusSessions = readNonNegativeInt(
    raw.completedFocusSessions,
    0,
  );

  if (remainingSeconds === 0) return fallback;
  if (phase === "idle" && (isRunning || phaseEndsAtMs !== null)) return fallback;
  if (phase !== "idle" && isRunning === (phaseEndsAtMs === null)) return fallback;

  return {
    ...fallback,
    phase,
    remainingSeconds,
    isRunning,
    completedFocusSessions,
    phaseEndsAtMs,
  };
}

/** Load the saved Pomodoro run from localStorage (client only). */
export function loadPomodoroRun(
  settings: PomodoroSettings = DEFAULT_POMODORO_SETTINGS,
): PomodoroState {
  if (typeof window === "undefined") return createInitialState(settings);

  try {
    const raw = window.localStorage.getItem(RUN_KEY);
    if (!raw) return createInitialState(settings);
    return parsePomodoroRun(JSON.parse(raw), settings);
  } catch {
    return createInitialState(settings);
  }
}

/** Persist the current Pomodoro run to localStorage. */
export function savePomodoroRun(state: PomodoroState): void {
  if (typeof window === "undefined") return;

  const snapshot: PomodoroRunSnapshot = {
    phase: state.phase,
    remainingSeconds: state.remainingSeconds,
    isRunning: state.isRunning,
    completedFocusSessions: state.completedFocusSessions,
    phaseEndsAtMs: state.phaseEndsAtMs,
  };
  window.localStorage.setItem(RUN_KEY, JSON.stringify(snapshot));
}
