const ALERT_SOUND_URL = "/sounds/mixkit-game-success-alert-2039.wav";

/** Play the pomodoro alarm; no-ops when autoplay is blocked or audio is unavailable. */
export function playPomodoroAlertSound(): void {
  if (typeof window === "undefined") return;

  try {
    const audio = new Audio(ALERT_SOUND_URL);
    void audio.play().catch(() => {
      // Autoplay blocked or audio unsupported — modal still shows.
    });
  } catch {
    // Autoplay blocked or audio unsupported — modal still shows.
  }
}
