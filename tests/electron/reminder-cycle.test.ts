import { describe, expect, it, vi } from "vitest";

import {
  REMINDER_INTERVAL_MS,
  ReminderCycle,
  shouldRemind,
} from "../../electron/reminder-cycle";

describe("reminder decision matrix (T026)", () => {
  it("reminds only when enabled and no pomodoro is running", () => {
    expect(shouldRemind({ reminderEnabled: true, isPomodoroRunning: false })).toBe(
      true,
    );
    expect(shouldRemind({ reminderEnabled: true, isPomodoroRunning: true })).toBe(
      false,
    );
    expect(shouldRemind({ reminderEnabled: false, isPomodoroRunning: false })).toBe(
      false,
    );
    expect(shouldRemind({ reminderEnabled: false, isPomodoroRunning: true })).toBe(
      false,
    );
  });

  it("counts a non-running phase (no pause state, D4) as idle", () => {
    // A paused/armed-but-not-running phase ⇒ isPomodoroRunning=false ⇒ idle.
    expect(shouldRemind({ reminderEnabled: true, isPomodoroRunning: false })).toBe(
      true,
    );
  });
});

describe("reminder cycle shell", () => {
  it("delivers on every interval tick while idle and enabled", async () => {
    const delivered: string[] = [];
    const cycle = new ReminderCycle({
      intervalMs: 20,
      deliver: (message) => delivered.push(message.body),
      decide: () => ({ reminderEnabled: true, isPomodoroRunning: false }),
    });
    cycle.start();
    await vi.waitFor(() => expect(delivered.length).toBeGreaterThanOrEqual(3), {
      timeout: 500,
    });
    cycle.stop();
    expect(REMINDER_INTERVAL_MS).toBe(5 * 60_000);
  });

  it("delivers nothing while a pomodoro is running (SC-005)", async () => {
    const delivered: string[] = [];
    const cycle = new ReminderCycle({
      intervalMs: 15,
      deliver: (message) => delivered.push(message.body),
      decide: () => ({ reminderEnabled: true, isPomodoroRunning: true }),
    });
    cycle.start();
    await new Promise((resolve) => setTimeout(resolve, 80));
    cycle.stop();
    expect(delivered).toEqual([]);
  });

  it("delivers nothing while disabled (FR-014/SC-005)", async () => {
    const delivered: string[] = [];
    const cycle = new ReminderCycle({
      intervalMs: 15,
      deliver: (message) => delivered.push(message.body),
      decide: () => ({ reminderEnabled: false, isPomodoroRunning: false }),
    });
    cycle.start();
    await new Promise((resolve) => setTimeout(resolve, 80));
    cycle.stop();
    expect(delivered).toEqual([]);
  });

  it("reset() re-arms the interval so the next reminder lands a full interval later (FR-011)", async () => {
    const delivered: string[] = [];
    const cycle = new ReminderCycle({
      intervalMs: 60,
      deliver: (message) => delivered.push(message.body),
      decide: () => ({ reminderEnabled: true, isPomodoroRunning: false }),
    });
    cycle.start();

    // Wait most of one interval, then reset just before the boundary.
    await new Promise((resolve) => setTimeout(resolve, 40));
    cycle.reset();

    // In the window (40ms .. 60ms) nothing fires: the boundary moved.
    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(delivered).toEqual([]);

    // One full interval after the reset, the reminder lands.
    await vi.waitFor(() => expect(delivered.length).toBe(1), { timeout: 300 });
    cycle.stop();
  });

  it("stop() disarms the cycle", async () => {
    const delivered: string[] = [];
    const cycle = new ReminderCycle({
      intervalMs: 15,
      deliver: (message) => delivered.push(message.body),
      decide: () => ({ reminderEnabled: true, isPomodoroRunning: false }),
    });
    cycle.start();
    cycle.stop();
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(delivered).toEqual([]);
  });
});
