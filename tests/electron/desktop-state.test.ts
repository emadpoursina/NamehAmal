import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  DebouncedWriter,
  createDefaultDesktopState,
  loadDesktopState,
  parseDesktopState,
  parseSelectedActivity,
  resolveDesktopState,
  serializeDesktopFileState,
  toFileState,
  writeDesktopState,
} from "../../electron/desktop-state";
import { createInitialState } from "../../app/lib/pomodoro/engine";
import { DEFAULT_POMODORO_SETTINGS } from "../../app/lib/pomodoro/types";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), "nameh-amal-desktop-state-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("desktop runtime state parsing", () => {
  it("round-trips a valid document through write and load", async () => {
    const state = createInitialState({
      ...DEFAULT_POMODORO_SETTINGS,
      focusSeconds: 1200,
    });
    await writeDesktopState(tempDir + "/nested/pomodoro.json", {
      state,
      selectedActivity: {
        categoryId: "cat_1",
        title: "Deep work",
        reportedAt: 1234,
      },
      reminderEnabled: false,
    });

    const loaded = await loadDesktopState(
      tempDir + "/nested/pomodoro.json",
    );
    const resolved = resolveDesktopState(loaded);

    expect(loaded.version).toBe(1);
    expect(loaded.reminderEnabled).toBe(false);
    expect(loaded.selectedActivity).toEqual({
      categoryId: "cat_1",
      title: "Deep work",
      reportedAt: 1234,
    });
    expect(resolved.state.phase).toBe("idle");
    expect(resolved.state.settings.focusSeconds).toBe(1200);
    expect(resolved.state.remainingSeconds).toBe(1200);
    expect(resolved.reminderEnabled).toBe(false);
  });

  it("falls back to defaults for an unknown schema version", () => {
    const parsed = parseDesktopState({ version: 999, reminderEnabled: false });
    expect(parsed).toEqual(createDefaultDesktopState());
  });

  it("falls back to defaults for corrupt JSON on disk", async () => {
    const filePath = path.join(tempDir, "pomodoro.json");
    await writeFile(filePath, "{not-json", "utf8");
    const loaded = await loadDesktopState(filePath);
    expect(loaded).toEqual(createDefaultDesktopState());
  });

  it("falls back to defaults when the file is missing", async () => {
    const loaded = await loadDesktopState(
      path.join(tempDir, "does-not-exist.json"),
    );
    expect(loaded).toEqual(createDefaultDesktopState());
  });

  it("applies per-field fallbacks for missing fields", () => {
    const parsed = parseDesktopState({
      version: 1,
      run: null,
      settings: null,
      selectedActivity: null,
      reminderEnabled: undefined,
    });
    const resolved = resolveDesktopState(parsed);
    // reminderEnabled defaults to true (FR-014 default on).
    expect(parsed.reminderEnabled).toBe(true);
    expect(resolved.state.phase).toBe("idle");
    expect(resolved.state.settings).toEqual(DEFAULT_POMODORO_SETTINGS);
    expect(resolved.state.isRunning).toBe(false);
    expect(resolved.selectedActivity).toBeNull();
  });

  it("defaults reminderEnabled to true when the field is missing", () => {
    const parsed = parseDesktopState({ version: 1 });
    expect(parsed.reminderEnabled).toBe(true);
  });

  it("treats an invalid selectedActivity as null", () => {
    expect(parseSelectedActivity(null)).toBeNull();
    expect(parseSelectedActivity("nope")).toBeNull();
    expect(parseSelectedActivity({ categoryId: "   " })).toBeNull();
    expect(parseSelectedActivity({ categoryId: 42 })).toBeNull();
    expect(parseSelectedActivity({ categoryId: "cat_1", title: 5 })).toEqual({
      categoryId: "cat_1",
      title: null,
      reportedAt: 0,
    });
  });

  it("keeps a valid selectedActivity with trimmed categoryId", () => {
    expect(
      parseSelectedActivity({
        categoryId: " cat_1 ",
        title: "Deep work",
        reportedAt: 99,
      }),
    ).toEqual({ categoryId: "cat_1", title: "Deep work", reportedAt: 99 });
  });
});

describe("serialized file shape", () => {
  it("writes schema v1 with run/settings/selectedActivity/reminderEnabled", async () => {
    const state = createInitialState();
    const fileState = toFileState({
      state,
      selectedActivity: null,
      reminderEnabled: true,
    });
    const json = JSON.parse(serializeDesktopFileState(fileState));
    expect(json).toEqual({
      version: 1,
      run: {
        phase: "idle",
        remainingSeconds: 1500,
        isRunning: false,
        completedFocusSessions: 0,
        phaseEndsAtMs: null,
      },
      settings: DEFAULT_POMODORO_SETTINGS,
      selectedActivity: null,
      reminderEnabled: true,
    });
  });
});

describe("DebouncedWriter", () => {
  it("coalesces scheduled writes to at most one per window", async () => {
    const filePath = path.join(tempDir, "pomodoro.json");
    let writeCount = 0;
    const writer = new DebouncedWriter(filePath, 30, async (path, state) => {
      writeCount += 1;
      const { writeDesktopFileState } = await import(
        "../../electron/desktop-state"
      );
      await writeDesktopFileState(path, state);
    });

    writer.schedule({
      ...createDefaultDesktopState(),
      reminderEnabled: false,
    });
    writer.schedule({
      ...createDefaultDesktopState(),
      reminderEnabled: true,
    });

    // Wait for the debounce window to elapse.
    await new Promise((resolve) => setTimeout(resolve, 80));
    await writer.flush();

    expect(writeCount).toBe(1);
    const onDisk = JSON.parse(await readFile(filePath, "utf8"));
    expect(onDisk.reminderEnabled).toBe(true);
  });

  it("flush writes pending state immediately", async () => {
    const filePath = path.join(tempDir, "pomodoro.json");
    const writer = new DebouncedWriter(filePath, 60_000);
    writer.schedule({
      ...createDefaultDesktopState(),
      selectedActivity: { categoryId: "cat_9", title: null, reportedAt: 1 },
    });
    await writer.flush();
    const onDisk = JSON.parse(await readFile(filePath, "utf8"));
    expect(onDisk.selectedActivity).toEqual({
      categoryId: "cat_9",
      title: null,
      reportedAt: 1,
    });
  });
});
