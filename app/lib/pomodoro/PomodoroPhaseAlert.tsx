"use client";

import { useEffect, useState } from "react";
import { formatPhaseAlertMessage, PHASE_LABELS } from "./phase-labels";
import { playPomodoroAlertSound } from "./play-alert-sound";
import type { ActivePomodoroPhase, PomodoroPhase } from "./types";
import { usePomodoro } from "./use-pomodoro";

type PhaseAlert = {
  completedPhase: ActivePomodoroPhase;
  nextPhase: PomodoroPhase;
};

export function PomodoroPhaseAlert() {
  const { subscribePhaseComplete } = usePomodoro();
  const [alert, setAlert] = useState<PhaseAlert | null>(null);

  useEffect(() => {
    return subscribePhaseComplete((completedPhase, nextPhase) => {
      setAlert({ completedPhase, nextPhase });
      playPomodoroAlertSound();
    });
  }, [subscribePhaseComplete]);

  if (!alert) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pomodoro-phase-alert-title"
    >
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 shadow-lg dark:border-zinc-800 dark:bg-black">
        <h2
          id="pomodoro-phase-alert-title"
          className="text-lg font-semibold text-zinc-950 dark:text-zinc-50"
        >
          {PHASE_LABELS[alert.completedPhase]} complete
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {formatPhaseAlertMessage(alert.completedPhase, alert.nextPhase)}
        </p>
        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-500">
          The timer has advanced to the next phase. Press Start when you are ready.
        </p>
        <button
          type="button"
          onClick={() => setAlert(null)}
          className="mt-5 w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
