"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { emitActiveTimerRefresh } from "@/app/dashboard/active-timer-refresh-bus";
import { formatDuration } from "@/app/dashboard/format";
import {
  ActiveTimerConflictError,
  fetchActiveTimer,
  startTimer,
  stopTimer,
  switchTimer,
  type SessionWithCategory,
} from "@/app/lib/tracker-client";
import { ActivityCheckInForm, type CheckInSubmitPayload } from "./ActivityCheckInForm";
import { formatPhaseAlertMessage, PHASE_LABELS } from "./phase-labels";
import { playPomodoroAlertSound } from "./play-alert-sound";
import type { ActivePomodoroPhase, PomodoroPhase } from "./types";
import { usePomodoro } from "./use-pomodoro";

type PhaseAlert = {
  completedPhase: ActivePomodoroPhase;
  nextPhase: PomodoroPhase;
};

type View =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "confirm"; active: SessionWithCategory }
  | { kind: "start" }
  | { kind: "switch"; active: SessionWithCategory };

function activityLabel(session: SessionWithCategory): string {
  return session.title?.trim() ? session.title.trim() : "Untitled activity";
}

function elapsedSeconds(session: SessionWithCategory, now: number): number {
  if (!session.startedAt) return 0;
  const start = new Date(session.startedAt).getTime();
  if (Number.isNaN(start)) return 0;
  return Math.max(0, Math.floor((now - start) / 1000));
}

export function PomodoroPhaseAlert() {
  const router = useRouter();
  const { subscribePhaseComplete } = usePomodoro();
  const [alert, setAlert] = useState<PhaseAlert | null>(null);
  const [view, setView] = useState<View>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    return subscribePhaseComplete((completedPhase, nextPhase) => {
      setAlert({ completedPhase, nextPhase });
      setActionError(null);
      setView({ kind: "loading" });
      playPomodoroAlertSound();
    });
  }, [subscribePhaseComplete]);

  useEffect(() => {
    if (!alert || view.kind !== "loading") return;

    let cancelled = false;
    fetchActiveTimer()
      .then((session) => {
        if (cancelled) return;
        setNow(Date.now());
        setView(session ? { kind: "confirm", active: session } : { kind: "start" });
      })
      .catch((err) => {
        if (cancelled) return;
        setView({
          kind: "error",
          message: err instanceof Error ? err.message : "Failed to check the active timer.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [alert, view.kind]);

  const viewHasActive = view.kind === "confirm" || view.kind === "switch";

  useEffect(() => {
    if (!viewHasActive) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [viewHasActive]);

  if (!alert) return null;

  function close() {
    setAlert(null);
  }

  function afterTimerChange() {
    emitActiveTimerRefresh();
    router.refresh();
    close();
  }

  async function onStartNew(payload: CheckInSubmitPayload) {
    setBusy(true);
    setActionError(null);
    try {
      await startTimer(payload);
      afterTimerChange();
    } catch (err) {
      if (err instanceof ActiveTimerConflictError) {
        setView({ kind: "confirm", active: err.active });
      } else {
        setActionError(err instanceof Error ? err.message : "Failed to start timer.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function onSwitch(current: SessionWithCategory, payload: CheckInSubmitPayload) {
    setBusy(true);
    setActionError(null);
    try {
      await switchTimer(current.id, payload);
      afterTimerChange();
    } catch (err) {
      if (err instanceof ActiveTimerConflictError) {
        setView({ kind: "confirm", active: err.active });
      } else {
        setActionError(err instanceof Error ? err.message : "Failed to switch activity.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function onStopOnly(current: SessionWithCategory) {
    setBusy(true);
    setActionError(null);
    try {
      await stopTimer(current.id);
      afterTimerChange();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to stop timer.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pomodoro-phase-alert-title"
    >
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-zinc-200 bg-white p-6 shadow-lg dark:border-zinc-800 dark:bg-black">
        <h2
          id="pomodoro-phase-alert-title"
          className="text-lg font-semibold text-zinc-950 dark:text-zinc-50"
        >
          {PHASE_LABELS[alert.completedPhase]} complete
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {formatPhaseAlertMessage(alert.completedPhase, alert.nextPhase)}
        </p>

        {view.kind === "loading" ? (
          <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400" role="status">
            Checking whether an activity is being recorded…
          </p>
        ) : null}

        {view.kind === "error" ? (
          <>
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
              {view.message}
            </div>
            <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-500">
              The timer has advanced to the next phase. Press Start when you are ready.
            </p>
            <button
              type="button"
              onClick={close}
              className="mt-5 w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              Dismiss
            </button>
          </>
        ) : null}

        {view.kind === "start" ? (
          <>
            <p className="mt-4 text-sm text-zinc-700 dark:text-zinc-300">
              Nothing is being recorded right now. Start recording an activity:
            </p>
            <ActivityCheckInForm
              submitLabel="Start recording"
              busyLabel="Starting…"
              busy={busy}
              error={actionError}
              onSubmit={onStartNew}
              onCancel={close}
              cancelLabel="Dismiss"
            />
          </>
        ) : null}

        {view.kind === "confirm" ? (
          <>
            <p className="mt-4 text-sm text-zinc-700 dark:text-zinc-300">
              You are currently recording{" "}
              <span className="font-medium text-zinc-950 dark:text-zinc-50">
                {activityLabel(view.active)}
              </span>
              {view.active.category?.name ? ` (${view.active.category.name})` : ""} for{" "}
              <span className="font-mono">
                {formatDuration(elapsedSeconds(view.active, now))}
              </span>
              .
            </p>
            <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
              Are you still doing this activity?
            </p>
            {actionError ? (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                {actionError}
              </div>
            ) : null}
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={afterTimerChange}
                className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                Yes, keep recording
              </button>
              <button
                type="button"
                onClick={() => {
                  setActionError(null);
                  setView({ kind: "switch", active: view.active });
                }}
                className="w-full rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-950"
              >
                No, switch activity
              </button>
            </div>
          </>
        ) : null}

        {view.kind === "switch" ? (
          <>
            <p className="mt-4 text-sm text-zinc-700 dark:text-zinc-300">
              Stopping{" "}
              <span className="font-medium text-zinc-950 dark:text-zinc-50">
                {activityLabel(view.active)}
              </span>
              . What are you doing now?
            </p>
            <ActivityCheckInForm
              submitLabel="Stop & start new"
              busyLabel="Switching…"
              busy={busy}
              error={actionError}
              onSubmit={(payload) => void onSwitch(view.active, payload)}
              onCancel={close}
              cancelLabel="Dismiss"
              secondary={
                <button
                  type="button"
                  onClick={() => void onStopOnly(view.active)}
                  disabled={busy}
                  className="text-xs text-zinc-600 underline-offset-2 hover:text-zinc-900 hover:underline disabled:opacity-50 dark:text-zinc-400 dark:hover:text-zinc-50"
                >
                  Or just stop without starting
                </button>
              }
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
