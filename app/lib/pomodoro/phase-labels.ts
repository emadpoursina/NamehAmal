import type { ActivePomodoroPhase, PomodoroPhase } from "./types";

export const PHASE_LABELS: Record<PomodoroPhase, string> = {
  idle: "Idle",
  focus: "Focus",
  short_rest: "Short rest",
  long_rest: "Long rest",
};

export function formatPhaseAlertMessage(
  completedPhase: ActivePomodoroPhase,
  nextPhase: PomodoroPhase,
): string {
  return `${PHASE_LABELS[completedPhase]} complete. Up next: ${PHASE_LABELS[nextPhase]}.`;
}
