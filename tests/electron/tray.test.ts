import { describe, expect, it } from "vitest";

import { DEFAULT_POMODORO_SETTINGS } from "../../app/lib/pomodoro/types";
import type { PomodoroState } from "../../app/lib/pomodoro/types";
import {
  ACTIVITY_NAME_MAX_LENGTH,
  computeMenuBarDisplayState,
  computeMenuBarMenuModel,
  resolveTrayActivityName,
  shouldRepaintTray,
  truncateActivityName,
} from "../../electron/tray-label";

const baseState: PomodoroState = {
  phase: "idle",
  remainingSeconds: DEFAULT_POMODORO_SETTINGS.focusSeconds,
  phaseEndsAtMs: null,
  isRunning: false,
  completedFocusSessions: 0,
  settings: { ...DEFAULT_POMODORO_SETTINGS },
};

describe("menu bar label formatting (T013)", () => {
  it("formats the running title as MM:SS + activity name", () => {
    const display = computeMenuBarDisplayState(
      {
        ...baseState,
        phase: "focus",
        remainingSeconds: 1500,
        isRunning: true,
        phaseEndsAtMs: Date.now() + 25 * 60 * 1000,
      },
      "Deep work",
    );
    expect(display.mode).toBe("running");
    expect(display.title).toBe("25:00 Deep work");
  });

  it("pads sub-minute countdowns to MM:SS", () => {
    const display = computeMenuBarDisplayState(
      {
        ...baseState,
        phase: "focus",
        remainingSeconds: 65,
        isRunning: true,
        phaseEndsAtMs: Date.now() + 65 * 1000,
      },
      "Work",
    );
    expect(display.title).toBe("01:05 Work");
  });

  it("uses an empty title in idle mode (FR-007)", () => {
    const display = computeMenuBarDisplayState(baseState, "Deep work");
    expect(display.mode).toBe("idle");
    expect(display.title).toBe("");
  });

  it("treats a non-idle non-running phase as idle (no pause state, D4)", () => {
    const display = computeMenuBarDisplayState(
      {
        ...baseState,
        phase: "short_rest",
        remainingSeconds: 300,
        isRunning: false,
        phaseEndsAtMs: null,
      },
      "Work",
    );
    expect(display.mode).toBe("idle");
    expect(display.title).toBe("");
  });
});

describe("activity name resolution (D2)", () => {
  it("prefers draft title over category name over the fallback", () => {
    expect(
      resolveTrayActivityName({ title: "Deep work", categoryName: "Work" }),
    ).toBe("Deep work");
    expect(resolveTrayActivityName({ title: null, categoryName: "Work" })).toBe(
      "Work",
    );
    expect(
      resolveTrayActivityName({ title: "  ", categoryName: "  " }),
    ).toBe("—");
    expect(resolveTrayActivityName(null)).toBe("—");
  });

  it("shows the fallback when no draft is active", () => {
    const display = computeMenuBarDisplayState(
      {
        ...baseState,
        phase: "focus",
        isRunning: true,
        remainingSeconds: 1500,
        phaseEndsAtMs: Date.now() + 25 * 60 * 1000,
      },
      resolveTrayActivityName(null),
    );
    expect(display.title).toBe("25:00 —");
  });
});

describe("truncation (spec edge case)", () => {
  it("truncates names longer than 24 characters to 23 + ellipsis", () => {
    expect(truncateActivityName("0123456789012345678901234")).toBe(
      "01234567890123456789012…",
    );
    expect(truncateActivityName("short")).toBe("short");
    expect(truncateActivityName("x".repeat(24))).toHaveLength(24);
    expect(truncateActivityName("x".repeat(ACTIVITY_NAME_MAX_LENGTH + 5))).toBe(
      `${"x".repeat(ACTIVITY_NAME_MAX_LENGTH - 1)}…`,
    );
  });
});

describe("repaint gating (D9)", () => {
  it("updates only when mode or the formatted title changes", () => {
    const running = computeMenuBarDisplayState(
      {
        ...baseState,
        phase: "focus",
        remainingSeconds: 1500,
        isRunning: true,
        phaseEndsAtMs: Date.now() + 25 * 60 * 1000,
      },
      "Work",
    );
    // Same mode + title → no repaint.
    expect(shouldRepaintTray(running, running)).toBe(false);

    // Ticking changes the title → repaint.
    const next = computeMenuBarDisplayState(
      {
        ...baseState,
        phase: "focus",
        remainingSeconds: 1499,
        isRunning: true,
        phaseEndsAtMs: Date.now() + 25 * 60 * 1000 - 1000,
      },
      "Work",
    );
    expect(shouldRepaintTray(running, next)).toBe(true);

    // Title unchanged but mode flips → repaint.
    const idleOfSameTitle = { ...running, mode: "idle" as const, title: running.title };
    expect(shouldRepaintTray(running, idleOfSameTitle)).toBe(true);

    // First observation always repaints.
    expect(shouldRepaintTray(null, running)).toBe(true);
  });
});

describe("menu model (contracts/tray.md, FR-006)", () => {
  it("enables Start and disables Stop when idle", () => {
    const model = computeMenuBarMenuModel(baseState);
    expect(model.showStart).toBe(true);
    expect(model.showResume).toBe(false);
    expect(model.canStart).toBe(true);
    expect(model.canStop).toBe(false);
  });

  it("disables Start/Stop while running", () => {
    const model = computeMenuBarMenuModel({
      ...baseState,
      phase: "focus",
      isRunning: true,
      phaseEndsAtMs: Date.now() + 1000,
    });
    expect(model.showStart).toBe(true);
    expect(model.showResume).toBe(false);
    expect(model.canStart).toBe(false);
    expect(model.canStop).toBe(true);
  });

  it("shows Resume instead of Start for a non-idle non-running phase (D4)", () => {
    const model = computeMenuBarMenuModel({
      ...baseState,
      phase: "short_rest",
      remainingSeconds: 300,
      isRunning: false,
      phaseEndsAtMs: null,
    });
    expect(model.showStart).toBe(false);
    expect(model.showResume).toBe(true);
    expect(model.canStart).toBe(true);
    expect(model.canStop).toBe(true);
  });
});
