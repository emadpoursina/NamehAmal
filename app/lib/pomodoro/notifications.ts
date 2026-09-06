import { formatPhaseAlertMessage } from "./phase-labels";
import type {
  ActivePomodoroPhase,
  PomodoroNotificationStatus,
  PomodoroPhase,
} from "./types";

export function isNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getPomodoroNotificationStatus(): PomodoroNotificationStatus {
  if (!isNotificationSupported()) return "unsupported";
  return window.Notification.permission;
}

/** Request notification permission. Call this only from a user interaction. */
export async function requestPomodoroNotificationPermission(): Promise<PomodoroNotificationStatus> {
  if (!isNotificationSupported()) return "unsupported";

  try {
    return await window.Notification.requestPermission();
  } catch {
    return "error";
  }
}

export function shouldShowBackgroundNotification(
  enabled: boolean,
  permission: PomodoroNotificationStatus,
  visibilityState: DocumentVisibilityState,
): boolean {
  return (
    enabled &&
    permission === "granted" &&
    visibilityState !== "visible"
  );
}

export function showPomodoroPhaseNotification(
  completedPhase: ActivePomodoroPhase,
  nextPhase: PomodoroPhase,
): boolean {
  if (
    !isNotificationSupported() ||
    window.Notification.permission !== "granted"
  ) {
    return false;
  }

  try {
    const notification = new window.Notification("Pomodoro phase complete", {
      body: formatPhaseAlertMessage(completedPhase, nextPhase),
    });
    notification.onclick = () => {
      try {
        window.focus();
      } finally {
        notification.close();
      }
    };
    return true;
  } catch {
    return false;
  }
}
