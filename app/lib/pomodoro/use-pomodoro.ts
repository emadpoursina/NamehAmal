"use client";

import { useContext } from "react";
import { PomodoroContext } from "./PomodoroProvider";

export function usePomodoro() {
  const context = useContext(PomodoroContext);
  if (!context) {
    throw new Error("usePomodoro must be used within PomodoroProvider");
  }
  return context;
}
