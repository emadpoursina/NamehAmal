"use client";

import Link from "next/link";
import { formatPomodoroCountdown } from "./format";
import { PHASE_LABELS } from "./phase-labels";
import { usePomodoro } from "./use-pomodoro";

const btnPrimary =
  "rounded-md bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300";

const btnSecondary =
  "rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-800 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-950";

export function PomodoroFloatingWidget() {
  const { state, start, stop, skip, setWidgetHidden } = usePomodoro();

  const isIdle = state.phase === "idle";
  const isRunning = state.isRunning;

  if (state.widgetHidden) {
    return (
      <button
        type="button"
        onClick={() => setWidgetHidden(false)}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-800 shadow-md transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-black dark:text-zinc-200 dark:hover:bg-zinc-950"
        aria-label="Show Pomodoro widget"
      >
        <span className="font-mono tabular-nums">
          {formatPomodoroCountdown(state.remainingSeconds)}
        </span>
        <span className="text-zinc-500 dark:text-zinc-400">·</span>
        <span>{PHASE_LABELS[state.phase]}</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 w-[min(100vw-2rem,16rem)] rounded-xl border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-800 dark:bg-black">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {PHASE_LABELS[state.phase]}
            {isRunning ? " · Running" : ""}
          </div>
          <div className="font-mono text-2xl font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">
            {formatPomodoroCountdown(state.remainingSeconds)}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setWidgetHidden(true)}
          className="shrink-0 rounded-md px-1.5 py-0.5 text-xs text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
          aria-label="Hide Pomodoro widget"
        >
          Hide
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={start} disabled={isRunning} className={btnPrimary}>
          Start
        </button>
        <button
          type="button"
          onClick={stop}
          disabled={isIdle && !isRunning}
          className={btnSecondary}
        >
          Stop
        </button>
        <button type="button" onClick={skip} disabled={isIdle} className={btnSecondary}>
          Skip
        </button>
      </div>

      <Link
        href="/pomodoro"
        className="mt-2 block text-center text-xs text-zinc-500 transition-colors hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
      >
        Open Pomodoro page
      </Link>
    </div>
  );
}
