import {
  DEFAULT_POMODORO_SETTINGS,
  type ActivePomodoroPhase,
  type PomodoroPhase,
  type PomodoroSettings,
  type PomodoroState,
} from "./types";

export type PhaseTransitionResult = {
  state: PomodoroState;
  phaseCompleted: ActivePomodoroPhase | null;
};

export function getPhaseDuration(
  phase: PomodoroPhase,
  settings: PomodoroSettings,
): number {
  switch (phase) {
    case "focus":
      return settings.focusSeconds;
    case "short_rest":
      return settings.shortRestSeconds;
    case "long_rest":
      return settings.longRestSeconds;
    case "idle":
      return settings.focusSeconds;
  }
}

export function createInitialState(
  settings: PomodoroSettings = DEFAULT_POMODORO_SETTINGS,
): PomodoroState {
  return {
    phase: "idle",
    remainingSeconds: settings.focusSeconds,
    phaseEndsAtMs: null,
    isRunning: false,
    completedFocusSessions: 0,
    settings: { ...settings },
  };
}

export function start(state: PomodoroState, now = Date.now()): PomodoroState {
  if (state.isRunning) return state;

  if (state.phase === "idle") {
    const remainingSeconds = state.settings.focusSeconds;
    return {
      ...state,
      phase: "focus",
      remainingSeconds,
      phaseEndsAtMs: now + remainingSeconds * 1000,
      isRunning: true,
    };
  }

  return {
    ...state,
    phaseEndsAtMs: now + state.remainingSeconds * 1000,
    isRunning: true,
  };
}

/** Cancel the current run and return to idle without changing settings or cadence. */
export function stop(state: PomodoroState): PomodoroState {
  return {
    ...state,
    phase: "idle",
    remainingSeconds: state.settings.focusSeconds,
    phaseEndsAtMs: null,
    isRunning: false,
  };
}

function advanceAfterPhase(
  state: PomodoroState,
  completedPhase: ActivePomodoroPhase,
): PomodoroState {
  if (completedPhase === "focus") {
    const completedFocusSessions = state.completedFocusSessions + 1;
    const useLongRest =
      completedFocusSessions % state.settings.longRestInterval === 0;
    const nextPhase = useLongRest ? "long_rest" : "short_rest";

    return {
      ...state,
      phase: nextPhase,
      remainingSeconds: getPhaseDuration(nextPhase, state.settings),
      phaseEndsAtMs: null,
      isRunning: false,
      completedFocusSessions,
    };
  }

  const resetCadence = completedPhase === "long_rest";

  return {
    ...state,
    phase: "focus",
    remainingSeconds: state.settings.focusSeconds,
    phaseEndsAtMs: null,
    isRunning: false,
    completedFocusSessions: resetCadence ? 0 : state.completedFocusSessions,
  };
}

function completeCurrentPhase(state: PomodoroState): PhaseTransitionResult {
  if (state.phase === "idle") {
    return { state, phaseCompleted: null };
  }

  const completedPhase = state.phase;
  return {
    state: advanceAfterPhase(state, completedPhase),
    phaseCompleted: completedPhase,
  };
}

export function skip(state: PomodoroState): PhaseTransitionResult {
  if (state.phase === "idle") {
    return { state, phaseCompleted: null };
  }

  return completeCurrentPhase({ ...state, isRunning: false, phaseEndsAtMs: null });
}

export function tick(state: PomodoroState, now = Date.now()): PhaseTransitionResult {
  if (!state.isRunning || state.phase === "idle") {
    return { state, phaseCompleted: null };
  }

  if (state.phaseEndsAtMs === null) {
    return {
      state: {
        ...state,
        phaseEndsAtMs: now + state.remainingSeconds * 1000,
      },
      phaseCompleted: null,
    };
  }

  if (now < state.phaseEndsAtMs) {
    return {
      state: {
        ...state,
        remainingSeconds: Math.max(
          1,
          Math.ceil((state.phaseEndsAtMs - now) / 1000),
        ),
      },
      phaseCompleted: null,
    };
  }

  return completeCurrentPhase({
    ...state,
    remainingSeconds: 0,
    isRunning: false,
    phaseEndsAtMs: null,
  });
}

/** Reconcile a saved run with the current clock when a tab opens or syncs. */
export function hydratePomodoroState(
  state: PomodoroState,
  now = Date.now(),
): PhaseTransitionResult {
  return tick(state, now);
}

/** Apply settings on the next phase; does not change the current countdown while running. */
export function updateSettings(
  state: PomodoroState,
  partial: Partial<PomodoroSettings>,
): PomodoroState {
  const settings = { ...state.settings, ...partial };

  if (state.isRunning || state.phase !== "idle") {
    return { ...state, settings };
  }

  return {
    ...state,
    settings,
    remainingSeconds: settings.focusSeconds,
    phaseEndsAtMs: null,
  };
}
