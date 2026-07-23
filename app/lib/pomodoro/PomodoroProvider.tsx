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
  setWidgetHidden,
  skip,
  start,
  stop,
  tick,
  updateSettings,
} from "./engine";
import {
  loadPomodoroSettings,
  loadWidgetHidden,
  savePomodoroSettings,
  saveWidgetHidden,
} from "./storage";
import type { ActivePomodoroPhase, PomodoroSettings, PomodoroState } from "./types";

type PomodoroContextValue = {
  state: PomodoroState;
  start: () => void;
  stop: () => void;
  skip: () => void;
  updateSettings: (partial: Partial<PomodoroSettings>) => void;
  setWidgetHidden: (hidden: boolean) => void;
  subscribePhaseComplete: (fn: (phase: ActivePomodoroPhase) => void) => () => void;
};

export const PomodoroContext = createContext<PomodoroContextValue | null>(null);

export function PomodoroProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PomodoroState>(() =>
    createInitialState(loadPomodoroSettings(), loadWidgetHidden()),
  );
  const phaseCompleteListeners = useRef(new Set<(phase: ActivePomodoroPhase) => void>());

  useEffect(() => {
    savePomodoroSettings(state.settings);
  }, [state.settings]);

  useEffect(() => {
    saveWidgetHidden(state.widgetHidden);
  }, [state.widgetHidden]);

  const emitPhaseComplete = useCallback((phase: ActivePomodoroPhase) => {
    for (const fn of phaseCompleteListeners.current) fn(phase);
  }, []);

  useEffect(() => {
    if (!state.isRunning) return;

    const id = window.setInterval(() => {
      setState((current) => {
        const result = tick(current);
        if (result.phaseCompleted) {
          queueMicrotask(() => emitPhaseComplete(result.phaseCompleted!));
        }
        return result.state;
      });
    }, 1000);

    return () => window.clearInterval(id);
  }, [state.isRunning, emitPhaseComplete]);

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
        queueMicrotask(() => emitPhaseComplete(result.phaseCompleted!));
      }
      return result.state;
    });
  }, [emitPhaseComplete]);

  const handleUpdateSettings = useCallback((partial: Partial<PomodoroSettings>) => {
    setState((current) => updateSettings(current, partial));
  }, []);

  const handleSetWidgetHidden = useCallback((hidden: boolean) => {
    setState((current) => setWidgetHidden(current, hidden));
  }, []);

  const subscribePhaseComplete = useCallback(
    (fn: (phase: ActivePomodoroPhase) => void) => {
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
      setWidgetHidden: handleSetWidgetHidden,
      subscribePhaseComplete,
    }),
    [
      state,
      handleStart,
      handleStop,
      handleSkip,
      handleUpdateSettings,
      handleSetWidgetHidden,
      subscribePhaseComplete,
    ],
  );

  return (
    <PomodoroContext.Provider value={value}>{children}</PomodoroContext.Provider>
  );
}
