import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DebouncedWriter,
  loadDesktopState,
  writeDesktopState,
} from "../../electron/desktop-state";
import {
  PomodoroHost,
  resolveActivityName,
  type ActiveTrackerDraft,
  type TrackerClient,
} from "../../electron/pomodoro-host";
import type { PomodoroSnapshot } from "../../electron/ipc-channels";
import { DEFAULT_POMODORO_SETTINGS } from "../../app/lib/pomodoro/types";
import type { PomodoroState } from "../../app/lib/pomodoro/types";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), "nameh-amal-pomodoro-host-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

type HostHarness = {
  filePath: string;
  writer: DebouncedWriter;
  broadcasts: { snapshot: PomodoroSnapshot; activityName: string }[];
  tracker: {
    calls: { method: string; payload?: Record<string, unknown> }[];
    active: ActiveTrackerDraft | null;
    nextStartResult: string | null;
  };
  createHost: (options?: {
    now?: () => number;
    selectedActivity?: { categoryId: string; title: string | null; reportedAt: number } | null;
  }) => Promise<PomodoroHost>;
};

function makeTrackerStub(harness: HostHarness): TrackerClient {
  return {
    getActiveDraft: async () => {
      harness.tracker.calls.push({ method: "getActiveDraft" });
      return harness.tracker.active;
    },
    startDraft: async (input) => {
      harness.tracker.calls.push({ method: "startDraft", payload: { ...input } });
      return harness.tracker.nextStartResult;
    },
    stopDraft: async (draftId) => {
      harness.tracker.calls.push({
        method: "stopDraft",
        payload: { sessionId: draftId },
      });
      return true;
    },
  };
}

async function createHarness(): Promise<HostHarness> {
  const filePath = path.join(tempDir, "pomodoro.json");
  const writer = new DebouncedWriter(filePath, 20);
  const harness: HostHarness = {
    filePath,
    writer,
    broadcasts: [],
    tracker: {
      calls: [],
      active: null,
      nextStartResult: null,
    },
    createHost: async (options) => {
      const host = new PomodoroHost({
        writer,
        load: () => loadDesktopState(filePath),
        tracker: makeTrackerStub(harness),
        broadcast: (payload) => {
          harness.broadcasts.push({ ...payload });
        },
        ...(options?.now ? { now: options.now } : {}),
      });
      await host.hydrate();
      if (options?.selectedActivity !== undefined) {
        // Seed via the same validation path the IPC channel uses.
        host.reportSelectedActivity(options.selectedActivity);
      }
      harness.broadcasts.length = 0;
      return host;
    },
  };
  return harness;
}

const baseState: PomodoroState = {
  phase: "idle",
  remainingSeconds: DEFAULT_POMODORO_SETTINGS.focusSeconds,
  phaseEndsAtMs: null,
  isRunning: false,
  completedFocusSessions: 0,
  settings: { ...DEFAULT_POMODORO_SETTINGS },
};

describe("pomodoro host hydration", () => {
  it("advances a completed phase when the persisted phaseEndsAtMs has expired", async () => {
    const harness = await createHarness();
    const now = Date.now();
    await writeDesktopState(harness.filePath, {
      state: {
        ...baseState,
        phase: "focus",
        remainingSeconds: 1,
        isRunning: true,
        phaseEndsAtMs: now - 2000, // expired while the app was away
      },
      selectedActivity: null,
      reminderEnabled: true,
    });

    const host = new PomodoroHost({
      writer: harness.writer,
      load: () => loadDesktopState(harness.filePath),
      tracker: makeTrackerStub(harness),
      broadcast: (payload) => harness.broadcasts.push({ ...payload }),
      now: () => now,
    });
    await host.hydrate();

    const snapshot = host.getSnapshot();
    // Focus completed into a short rest phase, paused (isRunning=false).
    expect(snapshot.state.phase).toBe("short_rest");
    expect(snapshot.state.isRunning).toBe(false);
    expect(snapshot.state.completedFocusSessions).toBe(1);
  });

  it("resumes the remaining time when the persisted phaseEndsAtMs is in the future", async () => {
    const harness = await createHarness();
    const now = Date.now();
    await writeDesktopState(harness.filePath, {
      state: {
        ...baseState,
        phase: "focus",
        remainingSeconds: 1200,
        isRunning: true,
        phaseEndsAtMs: now + 1200 * 1000,
      },
      selectedActivity: null,
      reminderEnabled: true,
    });

    const host = new PomodoroHost({
      writer: harness.writer,
      load: () => loadDesktopState(harness.filePath),
      tracker: makeTrackerStub(harness),
      broadcast: (payload) => harness.broadcasts.push({ ...payload }),
      now: () => now,
    });
    await host.hydrate();

    const snapshot = host.getSnapshot();
    expect(snapshot.state.phase).toBe("focus");
    expect(snapshot.state.isRunning).toBe(true);
    expect(snapshot.state.remainingSeconds).toBe(1200);
  });

  it("broadcasts immediately after hydration", async () => {
    const harness = await createHarness();
    const host = await new PomodoroHost({
      writer: harness.writer,
      load: () => loadDesktopState(harness.filePath),
      tracker: makeTrackerStub(harness),
      broadcast: (payload) => harness.broadcasts.push({ ...payload }),
    });
    await host.hydrate();
    expect(harness.broadcasts.length).toBe(1);
    expect(harness.broadcasts[0].activityName).toBe("—");
  });
});

describe("resume-vs-start semantics (D4)", () => {
  it("start() from idle begins a fresh focus phase", async () => {
    const harness = await createHarness();
    const now = 1_000_000;
    const host = await harness.createHost({ now: () => now });
    await host.start();

    const snapshot = host.getSnapshot();
    expect(snapshot.state.phase).toBe("focus");
    expect(snapshot.state.isRunning).toBe(true);
    expect(snapshot.state.remainingSeconds).toBe(
      DEFAULT_POMODORO_SETTINGS.focusSeconds,
    );
    expect(snapshot.state.phaseEndsAtMs).toBe(
      now + DEFAULT_POMODORO_SETTINGS.focusSeconds * 1000,
    );
  });

  it("start() on a non-idle non-running phase resumes the remaining time", async () => {
    const harness = await createHarness();
    const now = 1_000_000;
    // Hydrate a paused (armed-but-not-running) short rest phase.
    await writeDesktopState(harness.filePath, {
      state: {
        ...baseState,
        phase: "short_rest",
        remainingSeconds: 240,
        isRunning: false,
        phaseEndsAtMs: null,
        completedFocusSessions: 1,
      },
      selectedActivity: null,
      reminderEnabled: true,
    });
    const host = await harness.createHost({ now: () => now });
    await host.start();

    const snapshot = host.getSnapshot();
    expect(snapshot.state.phase).toBe("short_rest");
    expect(snapshot.state.isRunning).toBe(true);
    expect(snapshot.state.remainingSeconds).toBe(240);
    expect(snapshot.state.phaseEndsAtMs).toBe(now + 240 * 1000);
  });
});

describe("tick ordering and broadcast gating", () => {
  it("advances remaining time at 1 Hz and broadcasts at most once per second", async () => {
    const harness = await createHarness();
    let now = 1_000_000;
    const host = await harness.createHost({ now: () => now });
    await host.start();
    harness.broadcasts.length = 0;

    // Ten sub-second ticks within one broadcast window.
    for (let i = 0; i < 10; i += 1) {
      now += 100;
      await host.tick();
    }
    const broadcastCount = harness.broadcasts.length;
    expect(broadcastCount).toBeLessThanOrEqual(1);

    // Crossing the 1 s window allows another broadcast.
    now += 1000;
    await host.tick();
    expect(harness.broadcasts.length).toBe(broadcastCount + 1);

    const snapshot = host.getSnapshot();
    // 2000 ms elapsed since start (10 × 100 ms + 1000 ms).
    expect(snapshot.state.remainingSeconds).toBe(
      DEFAULT_POMODORO_SETTINGS.focusSeconds - 2,
    );
  });

  it("completes the phase when the tick reaches zero", async () => {
    const harness = await createHarness();
    let now = 1_000_000;
    const host = await harness.createHost({ now: () => now });
    await host.start();
    now += DEFAULT_POMODORO_SETTINGS.focusSeconds * 1000 + 1;
    await host.tick();

    const snapshot = host.getSnapshot();
    expect(snapshot.state.phase).toBe("short_rest");
    expect(snapshot.state.isRunning).toBe(false);
  });

  it("persists state changes to disk", async () => {
    const harness = await createHarness();
    const now = 1_000_000;
    const host = await harness.createHost({ now: () => now });
    await host.start();
    await harness.writer.flush();

    const onDisk = JSON.parse(await readFile(harness.filePath, "utf8"));
    expect(onDisk.run.phase).toBe("focus");
    expect(onDisk.run.isRunning).toBe(true);
  });
});

describe("tracker binding (D3, T021/T022)", () => {
  it("start with a persisted selected activity issues a tracker start with no timeZone", async () => {
    const harness = await createHarness();
    const now = 1_000_000;
    harness.tracker.nextStartResult = "draft-1";
    const host = await harness.createHost({
      now: () => now,
      selectedActivity: { categoryId: "cat_1", title: "Deep work", reportedAt: now },
    });

    await host.start({ bindTracker: true });
    await vi.waitFor(() => {
      const call = harness.tracker.calls.find((c) => c.method === "startDraft");
      expect(call).toBeDefined();
    });

    const startCall = harness.tracker.calls.find(
      (c) => c.method === "startDraft",
    )!;
    expect(startCall.payload).toEqual({ categoryId: "cat_1", title: "Deep work" });
    expect(Object.keys(startCall.payload ?? {})).not.toContain("timeZone");

    // The draft is bound and shows up as the active label.
    harness.tracker.active = {
      id: "draft-1",
      title: "Deep work",
      categoryName: "Work",
    };
    await host.tick();
    expect(host.getActivityName()).toBe("Deep work");
  });

  it("stop finalizes only the bound draft", async () => {
    const harness = await createHarness();
    const now = 1_000_000;
    harness.tracker.nextStartResult = "draft-1";
    const host = await harness.createHost({
      now: () => now,
      selectedActivity: { categoryId: "cat_1", title: "Deep work", reportedAt: now },
    });
    await host.start({ bindTracker: true });
    await vi.waitFor(() => {
      expect(
        harness.tracker.calls.some((c) => c.method === "startDraft"),
      ).toBe(true);
    });

    harness.tracker.active = {
      id: "draft-1",
      title: "Deep work",
      categoryName: "Work",
    };
    await host.stop();
    await vi.waitFor(() => {
      expect(
        harness.tracker.calls.some((c) => c.method === "stopDraft"),
      ).toBe(true);
    });

    const stopCall = harness.tracker.calls.find(
      (c) => c.method === "stopDraft",
    )!;
    expect(stopCall.payload).toEqual({ sessionId: "draft-1" });
    expect(host.getSnapshot().state.phase).toBe("idle");
  });

  it("renderer IPC start (no bindTracker option) never posts /api/tracker (T034)", async () => {
    const harness = await createHarness();
    const now = 1_000_000;
    harness.tracker.nextStartResult = "draft-renderer";
    const host = await harness.createHost({
      now: () => now,
      selectedActivity: { categoryId: "cat_1", title: "Deep work", reportedAt: now },
    });

    // The `pomodoro:start` IPC handler calls start() with no options.
    await host.start();
    expect(
      harness.tracker.calls.some((c) => c.method === "startDraft"),
    ).toBe(false);

    await host.stop();
    expect(
      harness.tracker.calls.some((c) => c.method === "stopDraft"),
    ).toBe(false);
    expect(host.getSnapshot().state.phase).toBe("idle");
  });

  it("renderer start does not bind even when a tracker draft is active in-app", async () => {
    const harness = await createHarness();
    const now = 1_000_000;
    // An active tracker draft exists (started in the app window), and the
    // menu bar has a selected activity too — no second draft is created.
    harness.tracker.active = {
      id: "draft-user",
      title: null,
      categoryName: "Admin",
    };
    const host = await harness.createHost({
      now: () => now,
      selectedActivity: { categoryId: "cat_1", title: "Deep work", reportedAt: now },
    });

    await host.start();
    expect(
      harness.tracker.calls.some((c) => c.method === "startDraft"),
    ).toBe(false);
    // Label falls back to the active draft's category name.
    expect(host.getActivityName()).toBe("Admin");

    await host.stop();
    expect(
      harness.tracker.calls.some((c) => c.method === "stopDraft"),
    ).toBe(false);
  });

  it("degrades to countdown-only when no selected activity exists", async () => {
    const harness = await createHarness();
    const now = 1_000_000;
    const host = await harness.createHost({ now: () => now });

    await host.start();
    expect(
      harness.tracker.calls.some((c) => c.method === "startDraft"),
    ).toBe(false);
    expect(host.getActivityName()).toBe("—");
  });

  it("degrades to countdown-only when the tracker start fails (404/409/network)", async () => {
    const harness = await createHarness();
    const now = 1_000_000;
    harness.tracker.nextStartResult = null; // server rejected (404/409)
    const host = await harness.createHost({
      now: () => now,
      selectedActivity: { categoryId: "cat_missing", title: null, reportedAt: now },
    });

    await host.start({ bindTracker: true });
    const startCall = harness.tracker.calls.find(
      (c) => c.method === "startDraft",
    )!;
    expect(startCall).toBeDefined();
    expect(host.getSnapshot().state.isRunning).toBe(true);

    await host.stop();
    expect(
      harness.tracker.calls.some((c) => c.method === "stopDraft"),
    ).toBe(false);
  });

  it("validates reportSelectedActivity payloads", async () => {
    const harness = await createHarness();
    const host = await harness.createHost();

    host.reportSelectedActivity({ categoryId: "   ", title: null });
    expect(host.getSnapshot().selectedActivity).toBeNull();

    host.reportSelectedActivity({ categoryId: "cat_1", title: "Deep work" });
    expect(host.getSnapshot().selectedActivity).toEqual({
      categoryId: "cat_1",
      title: "Deep work",
      reportedAt: expect.any(Number),
    });
  });
});

describe("broadcast ordering (sync hardening)", () => {
  it("broadcasts start before the tracker binding resolves", async () => {
    const harness = await createHarness();
    const now = 1_000_000;
    let resolveStartDraft: (id: string | null) => void = () => {};
    const startDraftPromise = new Promise<string | null>((resolve) => {
      resolveStartDraft = resolve;
    });
    let startDraftCalls = 0;
    const host = new PomodoroHost({
      writer: harness.writer,
      load: () => loadDesktopState(harness.filePath),
      tracker: {
        getActiveDraft: async () => null,
        startDraft: async () => {
          startDraftCalls += 1;
          return startDraftPromise;
        },
        stopDraft: async () => true,
      },
      broadcast: (payload) => harness.broadcasts.push({ ...payload }),
      now: () => now,
    });
    await host.hydrate();
    harness.broadcasts.length = 0;
    host.reportSelectedActivity({ categoryId: "cat_1", title: "Deep work" });

    await host.start({ bindTracker: true });

    // The state push must not wait on the pending tracker HTTP call.
    expect(startDraftCalls).toBe(1);
    expect(harness.broadcasts.length).toBeGreaterThanOrEqual(1);
    expect(harness.broadcasts[0].snapshot.state.isRunning).toBe(true);

    resolveStartDraft("draft-1");
    await vi.waitFor(() => {
      expect(harness.broadcasts.length).toBeGreaterThanOrEqual(2);
    });
    expect(host.getSnapshot().state.isRunning).toBe(true);
  });

  it("broadcasts stop before the bound draft finalize resolves", async () => {
    const harness = await createHarness();
    const now = 1_000_000;
    let resolveStartDraft: (id: string | null) => void = () => {};
    const startDraftPromise = new Promise<string | null>((resolve) => {
      resolveStartDraft = resolve;
    });
    let resolveStopDraft: (ok: boolean) => void = () => {};
    const stopDraftPromise = new Promise<boolean>((resolve) => {
      resolveStopDraft = resolve;
    });
    let stopDraftCalls = 0;
    const host = new PomodoroHost({
      writer: harness.writer,
      load: () => loadDesktopState(harness.filePath),
      tracker: {
        getActiveDraft: async () => null,
        startDraft: () => startDraftPromise,
        stopDraft: async () => {
          stopDraftCalls += 1;
          return stopDraftPromise;
        },
      },
      broadcast: (payload) => harness.broadcasts.push({ ...payload }),
      now: () => now,
    });
    await host.hydrate();
    host.reportSelectedActivity({ categoryId: "cat_1", title: "Deep work" });

    await host.start({ bindTracker: true });
    resolveStartDraft("draft-1");
    await vi.waitFor(() => {
      expect(host.getSnapshot().state.isRunning).toBe(true);
    });
    harness.broadcasts.length = 0;

    await host.stop();

    // The stop push must not wait on the pending finalize HTTP call.
    expect(stopDraftCalls).toBe(1);
    expect(harness.broadcasts.length).toBeGreaterThanOrEqual(1);
    expect(harness.broadcasts[0].snapshot.state.phase).toBe("idle");

    resolveStopDraft(true);
    await vi.waitFor(() => {
      expect(harness.broadcasts.length).toBeGreaterThanOrEqual(2);
    });
    expect(host.getSnapshot().state.phase).toBe("idle");
  });
});

describe("reminder-enabled persistence (T027)", () => {
  it("persists setReminderEnabled and reports the effective value", async () => {
    const harness = await createHarness();
    const host = await harness.createHost();

    expect(host.setReminderEnabled(false)).toBe(false);
    await harness.writer.flush();
    const onDisk = JSON.parse(await readFile(harness.filePath, "utf8"));
    expect(onDisk.reminderEnabled).toBe(false);
    expect(host.setReminderEnabled(true)).toBe(true);
  });
});

describe("activity label resolution (D2)", () => {
  it("prefers draft title, then category name, then the fallback", () => {
    expect(
      resolveActivityName({ title: "Deep work", categoryName: "Work" }),
    ).toBe("Deep work");
    expect(resolveActivityName({ title: "   ", categoryName: "Work" })).toBe(
      "Work",
    );
    expect(resolveActivityName({ title: null, categoryName: null })).toBe("—");
    expect(resolveActivityName(null)).toBe("—");
  });

  it("falls back to — when the tracker poll fails", async () => {
    const harness = await createHarness();
    const host = await harness.createHost();
    harness.tracker.active = null;
    expect(host.getActivityName()).toBe("—");
  });
});
