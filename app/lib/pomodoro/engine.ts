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
  widgetHidden = false,
): PomodoroState {
  return {
    phase: "idle",
    remainingSeconds: settings.focusSeconds,
    isRunning: false,
    completedFocusSessions: 0,
    settings: { ...settings },
    widgetHidden,
  };
}

export function start(state: PomodoroState): PomodoroState {
  if (state.isRunning) return state;

  if (state.phase === "idle") {
    return {
      ...state,
      phase: "focus",
      remainingSeconds: state.settings.focusSeconds,
      isRunning: true,
    };
  }

  return { ...state, isRunning: true };
}

/** Cancel the current run and return to idle without changing settings or cadence. */
export function stop(state: PomodoroState): PomodoroState {
  return {
    ...state,
    phase: "idle",
    remainingSeconds: state.settings.focusSeconds,
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
      isRunning: false,
      completedFocusSessions,
    };
  }

  const resetCadence = completedPhase === "long_rest";

  return {
    ...state,
    phase: "focus",
    remainingSeconds: state.settings.focusSeconds,
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

  return completeCurrentPhase({ ...state, isRunning: false });
}

export function tick(state: PomodoroState): PhaseTransitionResult {
  if (!state.isRunning || state.phase === "idle") {
    return { state, phaseCompleted: null };
  }

  if (state.remainingSeconds > 1) {
    return {
      state: { ...state, remainingSeconds: state.remainingSeconds - 1 },
      phaseCompleted: null,
    };
  }

  return completeCurrentPhase({ ...state, remainingSeconds: 0, isRunning: false });
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
  };
}

export function setWidgetHidden(
  state: PomodoroState,
  widgetHidden: boolean,
): PomodoroState {
  return { ...state, widgetHidden };
}
