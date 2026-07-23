import {
  DEFAULT_POMODORO_SETTINGS,
  type PomodoroSettings,
} from "./types";

const SETTINGS_KEY = "nameh-amal:pomodoro:settings";
const WIDGET_HIDDEN_KEY = "nameh-amal:pomodoro:widget-hidden";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readPositiveInt(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
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

/** Load widget visibility preference from localStorage. */
export function loadWidgetHidden(): boolean {
  if (typeof window === "undefined") return false;

  try {
    return window.localStorage.getItem(WIDGET_HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

/** Persist widget visibility preference. */
export function saveWidgetHidden(hidden: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(WIDGET_HIDDEN_KEY, hidden ? "1" : "0");
}
