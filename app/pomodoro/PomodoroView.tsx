"use client";

import { type FormEvent, useState } from "react";
import {
  formatPomodoroCountdown,
  minutesToSeconds,
  secondsToMinutes,
} from "@/app/lib/pomodoro/format";
import { usePomodoro } from "@/app/lib/pomodoro/use-pomodoro";
import type { PomodoroPhase } from "@/app/lib/pomodoro/types";

const PHASE_LABELS: Record<PomodoroPhase, string> = {
  idle: "Idle",
  focus: "Focus",
  short_rest: "Short rest",
  long_rest: "Long rest",
};

function settingsToFormValues(settings: {
  focusSeconds: number;
  shortRestSeconds: number;
  longRestSeconds: number;
  longRestInterval: number;
}) {
  return {
    focusMinutes: String(secondsToMinutes(settings.focusSeconds)),
    shortRestMinutes: String(secondsToMinutes(settings.shortRestSeconds)),
    longRestMinutes: String(secondsToMinutes(settings.longRestSeconds)),
    longRestInterval: String(settings.longRestInterval),
  };
}

export function PomodoroView() {
  const { state, start, stop, skip, updateSettings } = usePomodoro();
  const [form, setForm] = useState(() => settingsToFormValues(state.settings));
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function onSubmitSettings(e: FormEvent) {
    e.preventDefault();

    const focusMinutes = Number(form.focusMinutes);
    const shortRestMinutes = Number(form.shortRestMinutes);
    const longRestMinutes = Number(form.longRestMinutes);
    const longRestInterval = Number(form.longRestInterval);

    if (
      !Number.isFinite(focusMinutes) ||
      !Number.isFinite(shortRestMinutes) ||
      !Number.isFinite(longRestMinutes) ||
      !Number.isFinite(longRestInterval) ||
      focusMinutes <= 0 ||
      shortRestMinutes <= 0 ||
      longRestMinutes <= 0 ||
      longRestInterval <= 0
    ) {
      return;
    }

    updateSettings({
      focusSeconds: minutesToSeconds(focusMinutes),
      shortRestSeconds: minutesToSeconds(shortRestMinutes),
      longRestSeconds: minutesToSeconds(longRestMinutes),
      longRestInterval: Math.floor(longRestInterval),
    });
    setSavedAt(Date.now());
  }

  const isIdle = state.phase === "idle";
  const isRunning = state.isRunning;

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-black">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {PHASE_LABELS[state.phase]}
            {isRunning ? " · Running" : ""}
          </div>
          <div className="font-mono text-6xl font-semibold tabular-nums tracking-tight text-zinc-950 dark:text-zinc-50">
            {formatPomodoroCountdown(state.remainingSeconds)}
          </div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Focus sessions completed: {state.completedFocusSessions} / every{" "}
            {state.settings.longRestInterval} → long rest
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={start}
              disabled={isRunning}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              Start
            </button>
            <button
              type="button"
              onClick={stop}
              disabled={isIdle && !isRunning}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-950"
            >
              Stop
            </button>
            <button
              type="button"
              onClick={skip}
              disabled={isIdle}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-950"
            >
              Skip
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-black">
        <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Pomodoro settings
        </div>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Changes apply to the next phase. Defaults: 25 min focus, 5 min short rest, 15 min long
          rest, long rest every 4 focus sessions.
        </p>

        <form onSubmit={onSubmitSettings} className="mt-4 flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-zinc-700 dark:text-zinc-300">Focus (minutes)</span>
              <input
                type="number"
                min={1}
                value={form.focusMinutes}
                onChange={(e) => setForm((f) => ({ ...f, focusMinutes: e.target.value }))}
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-zinc-700 dark:text-zinc-300">Short rest (minutes)</span>
              <input
                type="number"
                min={1}
                value={form.shortRestMinutes}
                onChange={(e) => setForm((f) => ({ ...f, shortRestMinutes: e.target.value }))}
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-zinc-700 dark:text-zinc-300">Long rest (minutes)</span>
              <input
                type="number"
                min={1}
                value={form.longRestMinutes}
                onChange={(e) => setForm((f) => ({ ...f, longRestMinutes: e.target.value }))}
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-zinc-700 dark:text-zinc-300">
                Long rest every (focus sessions)
              </span>
              <input
                type="number"
                min={1}
                value={form.longRestInterval}
                onChange={(e) => setForm((f) => ({ ...f, longRestInterval: e.target.value }))}
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
              />
            </label>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              Save settings
            </button>
            {savedAt ? (
              <span className="text-xs text-zinc-500 dark:text-zinc-400">Settings saved.</span>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  );
}
