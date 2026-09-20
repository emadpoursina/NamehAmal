// Menu bar display state: pure helpers for the macOS tray (data-model §5,
// contracts/tray.md, research D9). Unit-tested in tests/electron/tray.test.ts.

import { formatPomodoroCountdown } from "../app/lib/pomodoro/format.js";
import type { PomodoroState } from "../app/lib/pomodoro/types.js";

/** Names longer than 24 characters truncate to 23 + "…" (spec edge case). */
export const ACTIVITY_NAME_MAX_LENGTH = 24;

export type MenuBarMode = "idle" | "running";

export type MenuBarDisplayState = {
  mode: MenuBarMode;
  /** "" when idle; "{MM:SS} {activityName}" when running. */
  title: string;
  activityName: string;
};

/** Resolve the display-only activity name: draft title → category name → "—". */
export function resolveTrayActivityName(draft: {
  title: string | null;
  categoryName: string | null;
} | null): string {
  if (draft === null) return "—";
  const title = draft.title?.trim();
  if (title) return title;
  const categoryName = draft.categoryName?.trim();
  if (categoryName) return categoryName;
  return "—";
}

/** Truncate to `max` characters with an ellipsis when longer. */
export function truncateActivityName(
  name: string,
  max = ACTIVITY_NAME_MAX_LENGTH,
): string {
  if (name.length <= max) return name;
  return `${name.slice(0, max - 1)}…`;
}


/** Derive the full menu bar display state from engine state + resolved label. */
export function computeMenuBarDisplayState(
  state: PomodoroState,
  rawActivityName: string,
): MenuBarDisplayState {
  const mode: MenuBarMode =
    state.isRunning && state.phase !== "idle" ? "running" : "idle";
  const activityName = truncateActivityName(rawActivityName);
  const title =
    mode === "running"
      ? `${formatPomodoroCountdown(state.remainingSeconds)} ${activityName}`
      : "";
  return { mode, title, activityName };
}

/** Repaint gating (D9): update the Tray only when mode or title changed. */
export function shouldRepaintTray(
  previous: MenuBarDisplayState | null,
  next: MenuBarDisplayState,
): boolean {
  if (previous === null) return true;
  return previous.mode !== next.mode || previous.title !== next.title;
}

export type MenuBarMenuModel = {
  /** Show "Start Pomodoro" (idle / running). */
  showStart: boolean;
  /** Show "Resume" instead of Start (non-idle, non-running phase, D4). */
  showResume: boolean;
  /** Start/Resume enabled (never while running). */
  canStart: boolean;
  /** Stop enabled only when a phase is active. */
  canStop: boolean;
};

/**
 * Menu enable/disable flags per contracts/tray.md: Start disabled while
 * running; Resume shown instead of Start for a non-idle non-running phase;
 * Stop disabled when idle. No activity picker, no timer-length options.
 */
export function computeMenuBarMenuModel(
  state: PomodoroState,
): MenuBarMenuModel {
  const running = state.isRunning && state.phase !== "idle";
  const phaseActive = state.phase !== "idle";
  return {
    showStart: !phaseActive || state.isRunning,
    showResume: phaseActive && !state.isRunning,
    canStart: !running,
    canStop: phaseActive,
  };
}
