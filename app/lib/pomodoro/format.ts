/** Format seconds as MM:SS for the Pomodoro countdown display. */
export function formatPomodoroCountdown(seconds: number): string {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.trunc(seconds)) : 0;
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${`${minutes}`.padStart(2, "0")}:${`${secs}`.padStart(2, "0")}`;
}

/** Convert minutes (UI input) to seconds for the engine. */
export function minutesToSeconds(minutes: number): number {
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;
  return Math.floor(minutes * 60);
}

/** Convert seconds (engine) to minutes for form display. */
export function secondsToMinutes(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.floor(seconds / 60);
}
