// Main-process pomodoro host: the single state authority for the desktop build.
// Contracts: specs/002-mac-menubar-pomodoro/contracts/ipc.md, research D1/D2/D3.
//
// Thin shell over the existing pure engine (`app/lib/pomodoro/engine.ts`, D1 — no
// new timer engine). Tracker integration is stubbed at the HTTP boundary (D10).

import {
  createInitialState,
  hydratePomodoroState,
  skip,
  start,
  stop,
  tick,
  updateSettings,
} from "../app/lib/pomodoro/engine.js";
import type {
  PomodoroSettings,
  PomodoroState,
} from "../app/lib/pomodoro/types.js";
import {
  FALLBACK_ACTIVITY_NAME,
  type PomodoroSnapshot,
  type SelectedActivityRef,
  isValidSelectedActivityPayload,
} from "./ipc-channels.js";
import {
  DESKTOP_STATE_VERSION,
  resolveDesktopState,
  type DebouncedWriter,
} from "./desktop-state.js";

/** How often the host broadcasts state changes (contracts/ipc.md: at most 1 Hz). */
export const BROADCAST_MIN_INTERVAL_MS = 950;

/** How often the host polls `GET /api/tracker` for the active draft label. */
export const TRACKER_POLL_INTERVAL_TICKS = 1;

export type ActiveTrackerDraft = {
  id: string;
  title: string | null;
  categoryName: string | null;
};

/** HTTP boundary seam (D10): the only thing tests stub. */
export interface TrackerClient {
  /** GET /api/tracker → active draft summary, or null when none/failure. */
  getActiveDraft(): Promise<ActiveTrackerDraft | null>;
  /** POST /api/tracker {action:"start"} — returns the draft id, or null on failure. */
  startDraft(input: { categoryId: string; title: string | null }): Promise<string | null>;
  /** POST /api/tracker {action:"stop"} for the given draft; true on success. */
  stopDraft(draftId: string): Promise<boolean>;
}

export type PomodoroStartOptions = {
  /**
   * Bind a tracker draft to this start (menu-bar origin only, D3/T034).
   * Default `false`: renderer IPC starts never touch `/api/tracker`.
   */
  bindTracker?: boolean;
};

export type PomodoroHostOptions = {
  writer: DebouncedWriter;
  /** Loads the raw persisted document (defaults on missing/corrupt). */
  load: () => Promise<import("./desktop-state.js").DesktopRuntimeState>;
  tracker: TrackerClient;
  /** Receives every broadcast: snapshot for IPC windows + resolved label for the Tray. */
  broadcast: (payload: { snapshot: PomodoroSnapshot; activityName: string }) => void;
  now?: () => number;
  /** Called when `isRunning` flips (started → true, stopped/completed → false). */
  onRunningChange?: (isRunning: boolean) => void;
};

export function resolveActivityName(
  draft: { title: string | null; categoryName: string | null } | null,
): string {
  if (draft === null) return FALLBACK_ACTIVITY_NAME;
  const title = draft.title?.trim();
  if (title) return title;
  const categoryName = draft.categoryName?.trim();
  if (categoryName) return categoryName;
  return FALLBACK_ACTIVITY_NAME;
}

export class PomodoroHost {
  private state: PomodoroState;
  private selectedActivity: SelectedActivityRef | null;
  private reminderEnabled: boolean;
  /** Tracker draft started by the menu bar; only this one is finalized on stop (D3). */
  private boundDraftId: string | null = null;
  private activeDraft: ActiveTrackerDraft | null = null;
  private lastBroadcastAt = 0;
  private disposed = false;
  private readonly now: () => number;

  constructor(
    private readonly options: PomodoroHostOptions,
    initial?: { state: PomodoroState; selectedActivity: SelectedActivityRef | null; reminderEnabled: boolean },
  ) {
    this.now = options.now ?? Date.now;
    this.state = initial?.state ?? createInitialState();
    this.selectedActivity = initial?.selectedActivity ?? null;
    this.reminderEnabled = initial?.reminderEnabled ?? true;
  }

  /** Hydrate from the persisted snapshot, reconciling against the wall clock. */
  async hydrate(): Promise<void> {
    const raw = await this.options.load();
    const resolved = resolveDesktopState(raw);
    const { state, phaseCompleted } = hydratePomodoroState(
      resolved.state,
      this.now(),
    );
    this.state = state;
    this.selectedActivity = resolved.selectedActivity;
    this.reminderEnabled = resolved.reminderEnabled;
    this.persist();
    if (phaseCompleted) {
      this.notifyRunningChange();
    }
    await this.pollTracker();
    this.broadcastNow();
  }

  getSnapshot(): PomodoroSnapshot {
    return {
      state: this.state,
      selectedActivity: this.selectedActivity,
      reminderEnabled: this.reminderEnabled,
    };
  }

  /** Raw resolved label (draft title → category name → "—"); truncation lives in tray-label. */
  getActivityName(): string {
    return resolveActivityName(this.activeDraft);
  }

  /**
   * Engine `start()`: focus from idle, or resume a non-idle non-running phase (D4).
   *
   * Tracker draft binding is restricted to tray-originated starts (T034/D3):
   * the tray menu calls `start({ bindTracker: true })`, while the renderer IPC
   * `pomodoro:start` handler calls `start()` with no options and never posts
   * `/api/tracker` — the in-app UI manages its own tracker drafts directly.
   *
   * The state change is broadcast immediately; tracker HTTP (binding + label
   * refresh) continues in the background and triggers a follow-up broadcast
   * when it resolves, so the tray and renderer never wait on `/api/tracker`.
   */
  async start(options?: { bindTracker?: boolean }): Promise<PomodoroState> {
    const wasIdle = this.state.phase === "idle" && !this.state.isRunning;
    this.applyEngineState(start(this.state, this.now()));
    this.persist();
    this.broadcastNow();
    if (wasIdle && options?.bindTracker === true) {
      void (async () => {
        try {
          await this.bindTrackerDraft();
          await this.pollTracker();
        } catch {
          // Binding failures degrade gracefully; the countdown is unaffected.
        }
        if (!this.disposed) {
          this.broadcastNow();
        }
      })();
    }
    return this.state;
  }

  /**
   * Engine `stop()`: back to idle. The bound tracker draft (menu-bar start)
   * is finalized in the background; the stop itself is broadcast immediately
   * so every subscriber reflects it without waiting on `/api/tracker`.
   */
  async stop(): Promise<PomodoroState> {
    this.applyEngineState(stop(this.state));
    this.persist();
    this.broadcastNow();
    void (async () => {
      try {
        await this.finalizeBoundDraft();
      } catch {
        // Finalize failures degrade gracefully; the pomodoro already stopped.
      }
      if (!this.disposed) {
        this.broadcastNow();
      }
    })();
    return this.state;
  }

  async skip(): Promise<PomodoroState> {
    this.applyEngineState(skip(this.state).state);
    void this.pollTracker();
    this.persist();
    this.broadcastNow();
    return this.state;
  }

  async updateSettings(partial: Partial<PomodoroSettings>): Promise<PomodoroState> {
    this.applyEngineState(updateSettings(this.state, partial));
    this.persist();
    this.broadcastNow();
    return this.state;
  }

  /** `desktop:report-selected-activity`: validate, persist, feed menu-bar Start (D3). */
  reportSelectedActivity(payload: unknown): void {
    if (!isValidSelectedActivityPayload(payload)) return;
    this.selectedActivity = {
      categoryId: payload.categoryId.trim(),
      title: payload.title,
      reportedAt: this.now(),
    };
    this.persist();
  }

  /** `desktop:set-reminder-enabled`: persist and return the effective value. */
  setReminderEnabled(enabled: boolean): boolean {
    this.reminderEnabled = enabled === true;
    this.persist();
    this.broadcastNow();
    return this.reminderEnabled;
  }

  /**
   * 1 Hz tick: advance the engine, refresh the activity label, broadcast at most
   * once per second (tick-originated broadcasts are rate limited, D9/contracts).
   */
  async tick(): Promise<void> {
    if (this.disposed) return;
    const { state, phaseCompleted } = tick(this.state, this.now());
    if (state !== this.state) {
      this.state = state;
      if (phaseCompleted) {
        this.notifyRunningChange();
      }
      this.persist();
    }
    if (this.state.isRunning) {
      await this.pollTracker();
    }
    this.broadcastThrottled();
  }

  /** Immediate push after a window finishes loading (renderer re-sync). */
  broadcastNow(): void {
    this.emit({ force: true });
  }

  dispose(): void {
    this.disposed = true;
  }

  private applyEngineState(next: PomodoroState): void {
    const runningChanged = next.isRunning !== this.state.isRunning;
    this.state = next;
    if (runningChanged) {
      this.notifyRunningChange();
    }
  }

  private notifyRunningChange(): void {
    this.options.onRunningChange?.(this.state.isRunning);
  }

  private persist(): void {
    this.options.writer.schedule({
      version: DESKTOP_STATE_VERSION,
      run: {
        phase: this.state.phase,
        remainingSeconds: this.state.remainingSeconds,
        isRunning: this.state.isRunning,
        completedFocusSessions: this.state.completedFocusSessions,
        phaseEndsAtMs: this.state.phaseEndsAtMs,
      },
      settings: this.state.settings,
      selectedActivity: this.selectedActivity,
      reminderEnabled: this.reminderEnabled,
    });
  }

  private broadcastThrottled(): void {
    this.emit({ force: false });
  }

  private emit({ force }: { force: boolean }): void {
    const now = this.now();
    if (!force && now - this.lastBroadcastAt < BROADCAST_MIN_INTERVAL_MS) {
      return;
    }
    this.lastBroadcastAt = now;
    this.options.broadcast({
      snapshot: this.getSnapshot(),
      activityName: this.getActivityName(),
    });
  }

  /**
   * Menu-bar start binding (D3, T034): only a tray-originated start may bind
   * a tracker draft. Countdown-only unless a selected activity exists.
   */
  private async bindTrackerDraft(): Promise<void> {
    if (this.boundDraftId !== null) return;
    if (this.activeDraft !== null) return; // a tracker timer is already active
    const selected = this.selectedActivity;
    if (selected === null || !selected.categoryId) return;
    const draftId = await this.options.tracker.startDraft({
      categoryId: selected.categoryId,
      title: selected.title,
    });
    // 404 (unknown category) / 409 (conflict) / network failure → countdown-only.
    this.boundDraftId = typeof draftId === "string" ? draftId : null;
  }

  /** Menu-bar stop finalizes only the *bound* draft (D3/FR-013). */
  private async finalizeBoundDraft(): Promise<void> {
    const draftId = this.boundDraftId;
    this.boundDraftId = null;
    if (draftId === null) return;
    try {
      await this.options.tracker.stopDraft(draftId);
    } catch {
      // Finalize failures degrade gracefully; the pomodoro still stops.
    }
    await this.pollTracker();
  }

  /** Poll GET /api/tracker; any failure → fallback label, never a crash (D2). */
  private async pollTracker(): Promise<void> {
    try {
      const draft = await this.options.tracker.getActiveDraft();
      if (!this.disposed) {
        this.activeDraft = draft;
      }
    } catch {
      if (!this.disposed) {
        this.activeDraft = null;
      }
    }
  }

  /**
   * Default `TrackerClient` over the local Next.js server (D2): polls the
   * existing `/api/tracker` route handler. All failures degrade gracefully.
   */
  static createHttpTrackerClient(
    origin: string,
    fetchImpl: typeof fetch = fetch,
  ): TrackerClient {
    const getActiveDraft = async (): Promise<ActiveTrackerDraft | null> => {
      const response = await fetchImpl(`${origin}/api/tracker`, { method: "GET" });
      if (!response.ok) return null;
      const body = (await response.json()) as {
        ok?: boolean;
        data?: {
          id?: unknown;
          title?: unknown;
          category?: { name?: unknown } | null;
        } | null;
      };
      if (!body?.ok || typeof body.data !== "object" || body.data === null) {
        return null;
      }
      const id = body.data.id;
      if (typeof id !== "string" || !id) return null;
      return {
        id,
        title: typeof body.data.title === "string" ? body.data.title : null,
        categoryName:
          typeof body.data.category?.name === "string"
            ? body.data.category.name
            : null,
      };
    };

    const postTracker = async (payload: Record<string, unknown>) => {
      return fetchImpl(`${origin}/api/tracker`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
    };

    return {
      getActiveDraft,
      startDraft: async ({ categoryId, title }) => {
        try {
          // No `timeZone` — the server applies its configured default (Constitution III).
          const response = await postTracker({
            action: "start",
            categoryId,
            ...(title !== null ? { title } : {}),
          });
          if (!response.ok) return null;
          const body = (await response.json()) as {
            ok?: boolean;
            data?: { id?: unknown } | null;
          };
          const id = body?.data?.id;
          return typeof id === "string" && id ? id : null;
        } catch {
          return null;
        }
      },
      stopDraft: async (draftId) => {
        try {
          const response = await postTracker({ action: "stop", sessionId: draftId });
          if (!response.ok) return false;
          const body = (await response.json()) as { ok?: boolean };
          return body?.ok === true;
        } catch {
          return false;
        }
      },
    };
  }
}


