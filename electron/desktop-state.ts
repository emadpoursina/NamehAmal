// Desktop runtime state: load/validate/save `userData/pomodoro.json` (schema v1).
// Data model: specs/002-mac-menubar-pomodoro/data-model.md §4
//
// Any corrupt/missing/mismatched-version file yields defaults without crashing.
// Run-snapshot writes are debounced to at most 1 Hz.

import { promises as fs } from "node:fs";
import path from "node:path";

import {
  parsePomodoroRun,
  parsePomodoroSettings,
} from "../app/lib/pomodoro/storage.js";
import type { PomodoroState } from "../app/lib/pomodoro/types.js";
import type { SelectedActivityRef } from "./ipc-channels.js";

export const DESKTOP_STATE_VERSION = 1;

export type DesktopRuntimeState = {
  version: typeof DESKTOP_STATE_VERSION;
  /** Persisted run snapshot (pre-validation); parse via `parsePomodoroRun`. */
  run: unknown;
  settings: unknown;
  selectedActivity: SelectedActivityRef | null;
  reminderEnabled: boolean;
};

export type ResolvedDesktopState = {
  state: PomodoroState;
  selectedActivity: SelectedActivityRef | null;
  reminderEnabled: boolean;
};

export function createDefaultDesktopState(): DesktopRuntimeState {
  return {
    version: DESKTOP_STATE_VERSION,
    run: null,
    settings: null,
    selectedActivity: null,
    reminderEnabled: true,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Parse persisted selected-activity data; invalid → null. */
export function parseSelectedActivity(raw: unknown): SelectedActivityRef | null {
  if (!isRecord(raw)) return null;
  const categoryId =
    typeof raw.categoryId === "string" ? raw.categoryId.trim() : "";
  if (!categoryId) return null;
  const title =
    typeof raw.title === "string" && raw.title.length > 0 ? raw.title : null;
  const reportedAt =
    typeof raw.reportedAt === "number" && Number.isFinite(raw.reportedAt)
      ? Math.max(0, Math.floor(raw.reportedAt))
      : 0;
  return { categoryId, title, reportedAt };
}

/**
 * Parse the raw JSON document of `pomodoro.json`. Unknown schema version or an
 * unusable document is treated like corruption: defaults are returned.
 */
export function parseDesktopState(raw: unknown): DesktopRuntimeState {
  if (!isRecord(raw) || raw.version !== DESKTOP_STATE_VERSION) {
    return createDefaultDesktopState();
  }
  return {
    version: DESKTOP_STATE_VERSION,
    run: raw.run ?? null,
    settings: raw.settings ?? null,
    selectedActivity: parseSelectedActivity(raw.selectedActivity),
    reminderEnabled: raw.reminderEnabled !== false,
  };
}

/** Reconcile the persisted file into the validated values the host needs. */
export function resolveDesktopState(
  raw: DesktopRuntimeState,
): ResolvedDesktopState {
  const settings = parsePomodoroSettings(raw.settings);
  const run = parsePomodoroRun(raw.run, settings);
  return {
    state: run,
    selectedActivity: raw.selectedActivity,
    reminderEnabled: raw.reminderEnabled,
  };
}

/** Build the on-disk document (v1) from resolved runtime values. */
export function toFileState(input: {
  state: PomodoroState;
  selectedActivity: SelectedActivityRef | null;
  reminderEnabled: boolean;
}): DesktopRuntimeState {
  return {
    version: DESKTOP_STATE_VERSION,
    run: {
      phase: input.state.phase,
      remainingSeconds: input.state.remainingSeconds,
      isRunning: input.state.isRunning,
      completedFocusSessions: input.state.completedFocusSessions,
      phaseEndsAtMs: input.state.phaseEndsAtMs,
    },
    settings: input.state.settings,
    selectedActivity: input.selectedActivity,
    reminderEnabled: input.reminderEnabled,
  };
}

/** Serialize a file-shaped state document. */
export function serializeDesktopFileState(state: DesktopRuntimeState): string {
  return JSON.stringify({
    version: state.version,
    run: state.run,
    settings: state.settings,
    selectedActivity: state.selectedActivity,
    reminderEnabled: state.reminderEnabled,
  });
}

/** Read and validate `pomodoro.json`; missing/corrupt → defaults. */
export async function loadDesktopState(
  filePath: string,
): Promise<DesktopRuntimeState> {
  try {
    const contents = await fs.readFile(filePath, "utf8");
    return parseDesktopState(JSON.parse(contents));
  } catch {
    return createDefaultDesktopState();
  }
}

/** Write a file-shaped state document (creates parent directories as needed). */
export async function writeDesktopFileState(
  filePath: string,
  state: DesktopRuntimeState,
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, serializeDesktopFileState(state), "utf8");
}

/** Persist resolved runtime state to disk (creates parent directories as needed). */
export async function writeDesktopState(
  filePath: string,
  input: {
    state: PomodoroState;
    selectedActivity: SelectedActivityRef | null;
    reminderEnabled: boolean;
  },
): Promise<void> {
  await writeDesktopFileState(filePath, toFileState(input));
}

/**
 * Debounced writer: coalesces frequent run-snapshot writes to ≤1 write per
 * `intervalMs` (default 1000). `flush()` writes the latest value immediately.
 */
export class DebouncedWriter {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: DesktopRuntimeState | null = null;

  constructor(
    private readonly filePath: string,
    private readonly intervalMs = 1000,
    private readonly write: typeof writeDesktopFileState = writeDesktopFileState,
  ) {}

  /** Schedule a write; at most one write per interval window (latest wins). */
  schedule(state: DesktopRuntimeState): void {
    this.pending = state;
    if (this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.write(this.filePath, this.pending ?? createDefaultDesktopState()).catch(
        () => {
          // Persistence failures must never crash the host.
        },
      );
      this.pending = null;
    }, this.intervalMs);
  }

  /** Write any pending state immediately and cancel the scheduled timer. */
  async flush(): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const state = this.pending;
    this.pending = null;
    if (state !== null) {
      await this.write(this.filePath, state).catch(() => {
        // Persistence failures must never crash the host.
      });
    }
  }

  async dispose(): Promise<void> {
    await this.flush();
  }
}
