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
    return hydratePomodoroState(loadPomodoroRun(settings), Date.now());
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
    savePomodoroRun(state);
  }, [state]);

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

      const settings = loadPomodoroSettings();
      const incoming = event.newValue
        ? loadPomodoroRun(settings)
        : createInitialState(settings);
      const result = hydratePomodoroState(incoming, Date.now());

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
    setState((current) => start(current));
  }, []);

  const handleStop = useCallback(() => {
    setState((current) => stop(current));
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
