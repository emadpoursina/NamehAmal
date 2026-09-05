"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  createInitialState,
  hydratePomodoroState,
  skip,
  start,
  stop,
  tick,
  updateSettings,
} from "./engine";
import {
  loadPomodoroRun,
  loadPomodoroSettings,
  RUN_KEY,
  savePomodoroRun,
  savePomodoroSettings,
} from "./storage";
import type { ActivePomodoroPhase, PomodoroPhase, PomodoroSettings, PomodoroState } from "./types";
import { PomodoroPhaseAlert } from "./PomodoroPhaseAlert";

function summarizeState(state: PomodoroState) {
  return {
    phase: state.phase,
    remainingSeconds: state.remainingSeconds,
    phaseEndsAtMs: state.phaseEndsAtMs,
    isRunning: state.isRunning,
    completedFocusSessions: state.completedFocusSessions,
  };
}

function summarizeStoredRun(raw: string | null) {
  if (!raw) return null;

  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return { invalid: true };
    const run = value as Record<string, unknown>;
    return {
      phase: run.phase,
      remainingSeconds: run.remainingSeconds,
      phaseEndsAtMs: run.phaseEndsAtMs,
      isRunning: run.isRunning,
      completedFocusSessions: run.completedFocusSessions,
    };
  } catch {
    return { invalid: true };
  }
}

function debugLog(
  hypothesisId: string,
  location: string,
  message: string,
  data: Record<string, unknown>,
) {
  if (typeof window === "undefined") return;

  void fetch("/api/debug-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
}

type PomodoroContextValue = {
  state: PomodoroState;
  start: () => void;
  stop: () => void;
  skip: () => void;
  updateSettings: (partial: Partial<PomodoroSettings>) => void;
  subscribePhaseComplete: (
    fn: (phase: ActivePomodoroPhase, nextPhase: PomodoroPhase) => void,
  ) => () => void;
};

export const PomodoroContext = createContext<PomodoroContextValue | null>(null);

type InitialPomodoroState = {
  state: PomodoroState;
  phaseCompleted: ActivePomodoroPhase | null;
};

export function PomodoroProvider({ children }: { children: ReactNode }) {
  const [initialState] = useState<InitialPomodoroState>(() => {
    const settings = loadPomodoroSettings();
    const loaded = loadPomodoroRun(settings);
    const hydrated = hydratePomodoroState(loaded, Date.now());
    // #region agent log
    debugLog("A/B", "PomodoroProvider.tsx:94", "client initial state", {
      loaded: summarizeState(loaded),
      hydrated: summarizeState(hydrated.state),
      phaseCompleted: hydrated.phaseCompleted,
    });
    // #endregion
    return hydrated;
  });
  const [state, setState] = useState<PomodoroState>(initialState.state);
  const initialPhaseCompletion = useRef(
    initialState.phaseCompleted
      ? {
          completedPhase: initialState.phaseCompleted,
          nextPhase: initialState.state.phase,
        }
      : null,
  );
  const phaseCompleteListeners = useRef(
    new Set<(phase: ActivePomodoroPhase, nextPhase: PomodoroPhase) => void>(),
  );

  useEffect(() => {
    savePomodoroSettings(state.settings);
  }, [state.settings]);

  useEffect(() => {
    const before = window.localStorage.getItem(RUN_KEY);
    savePomodoroRun(state);
    const after = window.localStorage.getItem(RUN_KEY);
    // #region agent log
    debugLog("B", "PomodoroProvider.tsx:127", "run persistence effect", {
      state: summarizeState(state),
      before: summarizeStoredRun(before),
      after: summarizeStoredRun(after),
    });
    // #endregion
  }, [state]);

  useEffect(() => {
    // #region agent log
    debugLog("A", "PomodoroProvider.tsx:137", "first client commit", {
      initialState: summarizeState(initialState.state),
      documentReadyState: document.readyState,
    });
    // #endregion
  }, [initialState]);

  const emitPhaseComplete = useCallback(
    (phase: ActivePomodoroPhase, nextPhase: PomodoroPhase) => {
      for (const fn of phaseCompleteListeners.current) fn(phase, nextPhase);
    },
    [],
  );

  useEffect(() => {
    const completion = initialPhaseCompletion.current;
    if (!completion) return;

    initialPhaseCompletion.current = null;
    queueMicrotask(() =>
      emitPhaseComplete(completion.completedPhase, completion.nextPhase),
    );
  }, [emitPhaseComplete]);

  useEffect(() => {
    if (!state.isRunning) return;

    const id = window.setInterval(() => {
      setState((current) => {
        const result = tick(current, Date.now());
        if (result.phaseCompleted) {
          queueMicrotask(() =>
            emitPhaseComplete(result.phaseCompleted!, result.state.phase),
          );
        }
        return result.state;
      });
    }, 1000);

    return () => window.clearInterval(id);
  }, [state.isRunning, emitPhaseComplete]);

  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key !== RUN_KEY) return;

      // #region agent log
      debugLog("C", "PomodoroProvider.tsx:166", "run storage event received", {
        oldValue: summarizeStoredRun(event.oldValue),
        newValue: summarizeStoredRun(event.newValue),
      });
      // #endregion
      const settings = loadPomodoroSettings();
      const incoming = event.newValue
        ? loadPomodoroRun(settings)
        : createInitialState(settings);
      const result = hydratePomodoroState(incoming, Date.now());

      // #region agent log
      debugLog("C", "PomodoroProvider.tsx:178", "run storage event applied", {
        incoming: summarizeState(incoming),
        result: summarizeState(result.state),
        phaseCompleted: result.phaseCompleted,
      });
      // #endregion
      if (result.phaseCompleted) {
        queueMicrotask(() =>
          emitPhaseComplete(result.phaseCompleted!, result.state.phase),
        );
      }
      setState(result.state);
    }

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [emitPhaseComplete]);

  const handleStart = useCallback(() => {
    setState((current) => {
      const next = start(current);
      // #region agent log
      debugLog("D", "PomodoroProvider.tsx:196", "start updater", {
        before: summarizeState(current),
        after: summarizeState(next),
      });
      // #endregion
      return next;
    });
  }, []);

  const handleStop = useCallback(() => {
    setState((current) => {
      const next = stop(current);
      // #region agent log
      debugLog("D", "PomodoroProvider.tsx:209", "stop updater", {
        before: summarizeState(current),
        after: summarizeState(next),
      });
      // #endregion
      return next;
    });
  }, []);

  const handleSkip = useCallback(() => {
    setState((current) => {
      const result = skip(current);
      if (result.phaseCompleted) {
        queueMicrotask(() =>
          emitPhaseComplete(result.phaseCompleted!, result.state.phase),
        );
      }
      return result.state;
    });
  }, [emitPhaseComplete]);

  const handleUpdateSettings = useCallback((partial: Partial<PomodoroSettings>) => {
    setState((current) => updateSettings(current, partial));
  }, []);

  const subscribePhaseComplete = useCallback(
    (fn: (phase: ActivePomodoroPhase, nextPhase: PomodoroPhase) => void) => {
      phaseCompleteListeners.current.add(fn);
      return () => {
        phaseCompleteListeners.current.delete(fn);
      };
    },
    [],
  );

  const value = useMemo(
    () => ({
      state,
      start: handleStart,
      stop: handleStop,
      skip: handleSkip,
      updateSettings: handleUpdateSettings,
      subscribePhaseComplete,
    }),
    [
      state,
      handleStart,
      handleStop,
      handleSkip,
      handleUpdateSettings,
      subscribePhaseComplete,
    ],
  );

  return (
    <PomodoroContext.Provider value={value}>
      <PomodoroPhaseAlert />
      {children}
    </PomodoroContext.Provider>
  );
}
