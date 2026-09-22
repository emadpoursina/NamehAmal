// Pure host-connection contract for feature 003 (sync pomodoro timers).
// Contracts: contracts/host-sync.md §1/§5, data-model.md §4, research.md D3/D4.
//
// No Electron imports and no DOM access: every function takes plain inputs so
// the connection state machine is unit-testable with Vitest alone. The
// renderer applies these helpers in PomodoroProvider; the view consumes the
// resulting `connection` value.

import { FALLBACK_ACTIVITY_NAME } from "@/electron/ipc-channels";
import type { PomodoroSnapshot } from "@/electron/ipc-channels";
import type { PomodoroState } from "./types.js";

export { FALLBACK_ACTIVITY_NAME };

/** The renderer↔host connection (data-model.md §4). Not persisted; per mount. */
export type PomodoroConnection = "local" | "waiting" | "connected";

/**
 * Result of the mount-time `pomodoro:get-state` fetch:
 * - a `PomodoroSnapshot` once the host has hydrated;
 * - `null` while the host is still hydrating (a first-class response, not an error);
 * - `"pending"` before the fetch settles and `"rejected"` when it fails.
 */
export type PomodoroSnapshotResult =
  | "pending"
  | "rejected"
  | null
  | PomodoroSnapshot;

/** Minimal structural shape the helpers need from a snapshot (ipc-channels). */
export type PomodoroSnapshotInput = {
  state: PomodoroState;
  selectedActivity: {
    categoryId: string;
    title: string | null;
    reportedAt: number;
  } | null;
  reminderEnabled: boolean;
  /** Host-resolved label (draft title → category name → "—"); T022/FR-012. */
  activityName?: string;
};

function isValidSnapshot(value: unknown): value is PomodoroSnapshotInput {
  return (
    typeof value === "object" &&
    value !== null &&
    "state" in value &&
    typeof (value as { state: unknown }).state === "object" &&
    (value as { state: unknown }).state !== null
  );
}

/**
 * Map the desktop-API presence and the latest snapshot fetch result onto the
 * connection state (contracts/host-sync.md §5):
 * - no desktop API → `"local"` (plain-browser mode, US3);
 * - desktop API with pending/null/rejected/invalid fetch → `"waiting"` (never
 *   a local engine and never a timeout fallback, FR-009);
 * - desktop API with a valid snapshot → `"connected"`.
 */
export function resolvePomodoroConnection(input: {
  hasDesktopApi: boolean;
  snapshotResult: PomodoroSnapshotResult;
}): PomodoroConnection {
  if (!input.hasDesktopApi) return "local";
  return isValidSnapshot(input.snapshotResult) ? "connected" : "waiting";
}

/**
 * Resolved display label from the host snapshot (FR-012).
 *
 * T022: prefer the host-resolved `activityName` (draft title → category name
 * → "—") so the in-app label is the exact string the Tray shows. Snapshots
 * without the field (legacy producers/fixtures) fall back to the
 * `selectedActivity.title` path, matching the pre-T022 behavior.
 */
export function snapshotToActivityName(
  snapshotResult: PomodoroSnapshotResult,
): string | null {
  if (!isValidSnapshot(snapshotResult)) return null;
  const hostLabel = snapshotResult.activityName;
  if (typeof hostLabel === "string") {
    const trimmedLabel = hostLabel.trim();
    if (trimmedLabel) return trimmedLabel;
  }
  const selected = snapshotResult.selectedActivity;
  if (selected === null || selected === undefined) return null;
  const title = typeof selected.title === "string" ? selected.title.trim() : "";
  if (title) return title;
  return FALLBACK_ACTIVITY_NAME;
}

/** View-side label rendering: null/blank/`"—"` collapse to the neutral fallback. */
export function resolveActivityLabel(activityName: string | null): string {
  if (activityName === null) return FALLBACK_ACTIVITY_NAME;
  const trimmed = activityName.trim();
  if (!trimmed || trimmed === FALLBACK_ACTIVITY_NAME) return FALLBACK_ACTIVITY_NAME;
  return trimmed;
}
