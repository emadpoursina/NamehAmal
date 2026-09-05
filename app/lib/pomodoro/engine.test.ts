import { describe, expect, it } from "vitest";
import {
  createInitialState,
  hydratePomodoroState,
  skip,
  start,
  stop,
  tick,
  updateSettings,
} from "./engine";
import { DEFAULT_POMODORO_SETTINGS } from "./types";

describe("pomodoro engine", () => {
  it("uses default settings", () => {
    const state = createInitialState();
    expect(state.settings).toEqual(DEFAULT_POMODORO_SETTINGS);
    expect(state.phase).toBe("idle");
    expect(state.isRunning).toBe(false);
  });

  it("starts from idle into focus", () => {
    const running = start(createInitialState(), 1_000);
    expect(running.phase).toBe("focus");
    expect(running.isRunning).toBe(true);
    expect(running.remainingSeconds).toBe(DEFAULT_POMODORO_SETTINGS.focusSeconds);
    expect(running.phaseEndsAtMs).toBe(
      1_000 + DEFAULT_POMODORO_SETTINGS.focusSeconds * 1_000,
    );
  });

  it("resumes a paused phase without resetting remaining time", () => {
    const paused = {
      ...createInitialState(),
      phase: "focus" as const,
      remainingSeconds: 120,
      phaseEndsAtMs: null,
      isRunning: false,
    };
    const running = start(paused, 1_000);
    expect(running.remainingSeconds).toBe(120);
    expect(running.isRunning).toBe(true);
    expect(running.phaseEndsAtMs).toBe(121_000);
  });

  it("stop cancels the run back to idle", () => {
    const running = start(createInitialState());
    const stopped = stop(running);
    expect(stopped.phase).toBe("idle");
    expect(stopped.isRunning).toBe(false);
    expect(stopped.completedFocusSessions).toBe(0);
    expect(stopped.phaseEndsAtMs).toBeNull();
  });

  it("cycles focus to short rest after one focus session", () => {
    const running = start(createInitialState());
    const { state: afterFocus } = skip(running);
    expect(afterFocus.phase).toBe("short_rest");
    expect(afterFocus.completedFocusSessions).toBe(1);
    expect(afterFocus.isRunning).toBe(false);
  });

  it("uses long rest after N focus sessions", () => {
    let state = createInitialState({
      ...DEFAULT_POMODORO_SETTINGS,
      longRestInterval: 2,
    });

    state = start(state);
    ({ state } = skip(state));
    expect(state.phase).toBe("short_rest");

    state = start(state);
    ({ state } = skip(state));
    expect(state.phase).toBe("focus");

    state = start(state);
    ({ state } = skip(state));
    expect(state.phase).toBe("long_rest");
    expect(state.completedFocusSessions).toBe(2);
  });

  it("returns to focus after short rest", () => {
    let state = start(createInitialState());
    ({ state } = skip(state));
    expect(state.phase).toBe("short_rest");

    state = start(state);
    ({ state } = skip(state));
    expect(state.phase).toBe("focus");
  });

  it("resets cadence after long rest", () => {
    let state = createInitialState({
      ...DEFAULT_POMODORO_SETTINGS,
      longRestInterval: 1,
    });

    state = start(state);
    ({ state } = skip(state));
    expect(state.phase).toBe("long_rest");

    state = start(state);
    ({ state } = skip(state));
    expect(state.phase).toBe("focus");
    expect(state.completedFocusSessions).toBe(0);
  });

  it("emits phase completion when countdown reaches zero", () => {
    const state = {
      ...createInitialState(),
      phase: "focus" as const,
      remainingSeconds: 1,
      phaseEndsAtMs: 1_000,
      isRunning: true,
    };

    const result = tick(state, 1_000);
    expect(result.phaseCompleted).toBe("focus");
    expect(result.state.phase).toBe("short_rest");
    expect(result.state.isRunning).toBe(false);
    expect(result.state.phaseEndsAtMs).toBeNull();
  });

  it("computes remaining time from the phase end time", () => {
    const settings = {
      ...DEFAULT_POMODORO_SETTINGS,
      focusSeconds: 10,
    };
    const running = start(createInitialState(settings), 1_000);

    const result = tick(running, 4_000);

    expect(result.phaseCompleted).toBeNull();
    expect(result.state.remainingSeconds).toBe(7);
    expect(result.state.phaseEndsAtMs).toBe(11_000);
  });

  it("hydrates an overdue run by completing one phase and stopping", () => {
    const settings = {
      ...DEFAULT_POMODORO_SETTINGS,
      focusSeconds: 10,
    };
    const running = start(createInitialState(settings), 1_000);

    const result = hydratePomodoroState(running, 11_000);

    expect(result.phaseCompleted).toBe("focus");
    expect(result.state.phase).toBe("short_rest");
    expect(result.state.isRunning).toBe(false);
    expect(result.state.phaseEndsAtMs).toBeNull();
  });

  it("defers settings changes while a phase is running", () => {
    let state = start(createInitialState());
    state = updateSettings(state, { focusSeconds: 10 * 60 });
    expect(state.settings.focusSeconds).toBe(10 * 60);
    expect(state.remainingSeconds).toBe(DEFAULT_POMODORO_SETTINGS.focusSeconds);
  });

  it("applies settings to idle remaining time immediately", () => {
    let state = createInitialState();
    state = updateSettings(state, { focusSeconds: 10 * 60 });
    expect(state.remainingSeconds).toBe(10 * 60);
  });
});
