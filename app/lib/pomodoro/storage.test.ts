import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadPomodoroSettings,
  parsePomodoroRun,
  parsePomodoroSettings,
  savePomodoroSettings,
} from "./storage";
import { DEFAULT_POMODORO_SETTINGS } from "./types";

describe("pomodoro run storage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults notification preference to off for new and legacy settings", () => {
    expect(parsePomodoroSettings({}).notifyOnPhaseComplete).toBe(false);
    expect(
      parsePomodoroSettings({
        focusSeconds: 1500,
        shortRestSeconds: 300,
        longRestSeconds: 900,
        longRestInterval: 4,
      }).notifyOnPhaseComplete,
    ).toBe(false);
  });

  it("round-trips the notification preference through existing settings storage", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });

    const settings = {
      ...DEFAULT_POMODORO_SETTINGS,
      notifyOnPhaseComplete: true,
    };
    savePomodoroSettings(settings);

    expect(loadPomodoroSettings()).toEqual(settings);
  });

  it("parses a running snapshot with its phase end time", () => {
    const state = parsePomodoroRun({
      phase: "focus",
      remainingSeconds: 120,
      isRunning: true,
      completedFocusSessions: 2,
      phaseEndsAtMs: 12_000,
    });

    expect(state).toMatchObject({
      phase: "focus",
      remainingSeconds: 120,
      isRunning: true,
      completedFocusSessions: 2,
      phaseEndsAtMs: 12_000,
      settings: DEFAULT_POMODORO_SETTINGS,
    });
  });

  it("falls back to an idle state for an invalid running snapshot", () => {
    const state = parsePomodoroRun({
      phase: "focus",
      remainingSeconds: 120,
      isRunning: true,
      completedFocusSessions: 2,
      phaseEndsAtMs: null,
    });

    expect(state.phase).toBe("idle");
    expect(state.isRunning).toBe(false);
    expect(state.phaseEndsAtMs).toBeNull();
  });
});
