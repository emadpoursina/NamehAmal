"use client";

import { useEffect } from "react";
import {
  shouldShowBackgroundNotification,
  showPomodoroPhaseNotification,
} from "./notifications";
import { usePomodoro } from "./use-pomodoro";

export function PomodoroPhaseNotification() {
  const {
    state,
    notificationStatus,
    reportNotificationFailure,
    subscribePhaseComplete,
  } = usePomodoro();

  useEffect(() => {
    return subscribePhaseComplete((completedPhase, nextPhase) => {
      if (
        !shouldShowBackgroundNotification(
          state.settings.notifyOnPhaseComplete,
          notificationStatus,
          document.visibilityState,
        )
      ) {
        return;
      }

      if (!showPomodoroPhaseNotification(completedPhase, nextPhase)) {
        reportNotificationFailure();
      }
    });
  }, [
    notificationStatus,
    reportNotificationFailure,
    state.settings.notifyOnPhaseComplete,
    subscribePhaseComplete,
  ]);

  return null;
}
