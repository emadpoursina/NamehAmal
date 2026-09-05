import { describe, expect, it } from "vitest";
import { parsePomodoroRun } from "./storage";
import { DEFAULT_POMODORO_SETTINGS } from "./types";

describe("pomodoro run storage", () => {
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
