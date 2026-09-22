"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
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
import { getDesktopApi } from "./desktop-transport";
import type { NamehAmalDesktop } from "@/electron/ipc-channels";
import {
  loadPomodoroRun,
  loadPomodoroSettings,
  RUN_KEY,
  savePomodoroRun,
  savePomodoroSettings,
} from "./storage";
import {
  getPomodoroNotificationStatus,
  requestPomodoroNotificationPermission,
} from "./notifications";
import type {
  ActivePomodoroPhase,
  PomodoroNotificationStatus,
  PomodoroPhase,
  PomodoroSettings,
  PomodoroState,
} from "./types";
import { PomodoroPhaseAlert } from "./PomodoroPhaseAlert";
import { PomodoroPhaseNotification } from "./PomodoroPhaseNotification";

const subscribeToHydration = () => () => {};
const getHydratedSnapshot = () => true;
const getServerHydratedSnapshot = () => false;

type PomodoroContextValue = {
  state: PomodoroState;
  isHydrated: boolean;
  reminderEnabled: boolean;
  start: () => void;
  stop: () => void;
  skip: () => void;
  updateSettings: (partial: Partial<PomodoroSettings>) => void;
  updateReminderEnabled: (enabled: boolean) => void;
  notificationStatus: PomodoroNotificationStatus;
  requestNotificationPermission: () => Promise<PomodoroNotificationStatus>;
  reportNotificationFailure: () => void;
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
  const isHydrated = useSyncExternalStore(
    subscribeToHydration,
    getHydratedSnapshot,
    getServerHydratedSnapshot,
  );
  const [initialState] = useState<InitialPomodoroState>(() => {
    // Desktop build: the main process owns the state (D1/D6); the renderer
    // starts from defaults and syncs over IPC. No localStorage access.
    if (getDesktopApi() !== null) {
      return { state: createInitialState(), phaseCompleted: null };
    }
    const settings = loadPomodoroSettings();
    const loaded = loadPomodoroRun(settings);
    return hydratePomodoroState(loaded, Date.now());
  });
  const [state, setState] = useState<PomodoroState>(initialState.state);
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [notificationStatus, setNotificationStatus] =
    useState<PomodoroNotificationStatus>(() => getPomodoroNotificationStatus());
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
    if (getDesktopApi() !== null) return; // main process owns persistence (D6)
    savePomodoroSettings(state.settings);
  }, [state.settings]);

  useEffect(() => {
    if (getDesktopApi() !== null) return; // main process owns persistence (D6)
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
    if (getDesktopApi() !== null) return; // main process ticks and pushes (D6)
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
    if (getDesktopApi() !== null) return; // desktop uses IPC, not localStorage (D6)
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

  // Desktop transport: subscribe first (last snapshot wins), then fetch once.
  // Also mirrors the menubar reminder toggle (`desktop:reminder-changed`).
  useEffect(() => {
    const api: NamehAmalDesktop | null = getDesktopApi();
    if (api === null) return;
    let cancelled = false;
    const unsubscribe = api.onPomodoroStateChanged((snapshot) => {
      if (!cancelled) {
        setState(snapshot.state);
        setReminderEnabled(snapshot.reminderEnabled);
      }
    });
    const unsubscribeReminder = api.onReminderChanged((enabled) => {
      if (!cancelled) {
        setReminderEnabled(enabled);
      }
    });
    api
      .getPomodoroState()
      .then((snapshot) => {
        if (!cancelled) {
          setState(snapshot.state);
          setReminderEnabled(snapshot.reminderEnabled);
        }
      })
      .catch(() => {
        // Keep defaults until the next push; never crash the renderer.
      });
    return () => {
      cancelled = true;
      unsubscribe();
      unsubscribeReminder();
    };
  }, []);

  // Desktop: derive phase-complete events from pushed phase transitions.
  const previousPhaseRef = useRef<PomodoroPhase>(initialState.state.phase);
  useEffect(() => {
    if (getDesktopApi() === null) return;
    const previousPhase = previousPhaseRef.current;
    previousPhaseRef.current = state.phase;
    if (previousPhase !== "idle" && state.phase !== previousPhase) {
      queueMicrotask(() =>
        emitPhaseComplete(
          previousPhase as ActivePomodoroPhase,
          state.phase,
        ),
      );
    }
  }, [state.phase, emitPhaseComplete]);

  const handleStart = useCallback(() => {
    const api = getDesktopApi();
    if (api) {
      void api.startPomodoro().then((next) => setState(next));
      return;
    }
    setState((current) => {
      return start(current);
    });
  }, []);

  const handleStop = useCallback(() => {
    const api = getDesktopApi();
    if (api) {
      void api.stopPomodoro().then((next) => setState(next));
      return;
    }
    setState((current) => {
      return stop(current);
    });
  }, []);

  const handleSkip = useCallback(() => {
    const api = getDesktopApi();
    if (api) {
      void api.skipPomodoro().then((next) => setState(next));
      return;
    }
    setState((current) => skip(current).state);
  }, []);

  const handleUpdateSettings = useCallback((partial: Partial<PomodoroSettings>) => {
    const api = getDesktopApi();
    if (api) {
      void api.updatePomodoroSettings(partial).then((next) => setState(next));
      return;
    }
    setState((current) => updateSettings(current, partial));
  }, []);

  const handleUpdateReminderEnabled = useCallback((enabled: boolean) => {
    const api = getDesktopApi();
    if (!api) return; // reminders are desktop-only; nothing to sync on the web
    void api.setReminderEnabled(enabled).then((next) => setReminderEnabled(next));
  }, []);

  const handleRequestNotificationPermission = useCallback(async () => {
    const status = await requestPomodoroNotificationPermission();
    setNotificationStatus(status);
    return status;
  }, []);

  const reportNotificationFailure = useCallback(() => {
    setNotificationStatus("error");
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
      isHydrated,
      reminderEnabled,
      start: handleStart,
      stop: handleStop,
      skip: handleSkip,
      updateSettings: handleUpdateSettings,
      updateReminderEnabled: handleUpdateReminderEnabled,
      notificationStatus,
      requestNotificationPermission: handleRequestNotificationPermission,
      reportNotificationFailure,
      subscribePhaseComplete,
    }),
    [
      state,
      isHydrated,
      reminderEnabled,
      handleStart,
      handleStop,
      handleSkip,
      handleUpdateSettings,
      handleUpdateReminderEnabled,
      notificationStatus,
      handleRequestNotificationPermission,
      reportNotificationFailure,
      subscribePhaseComplete,
    ],
  );

  return (
    <PomodoroContext.Provider value={value}>
      <PomodoroPhaseNotification />
      <PomodoroPhaseAlert />
      {children}
    </PomodoroContext.Provider>
  );
}
