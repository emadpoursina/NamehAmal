"use client";

import type { CategoryModel, SessionModel } from "@/app/generated/prisma/models";

export type SessionWithCategory = SessionModel & { category: CategoryModel };

type SettingsResponse =
  | { ok: true; data: { id: string; timeZone: string } }
  | { ok: false; error: string };

export type StartTimerPayload = {
  categoryId: string;
  title: string | null;
  timeZone: string;
  startedAt?: string;
};

/** Raised when the server rejects a start because another timer is already running. */
export class ActiveTimerConflictError extends Error {
  readonly active: SessionWithCategory;

  constructor(active: SessionWithCategory) {
    super("A timer session is already running.");
    this.name = "ActiveTimerConflictError";
    this.active = active;
  }
}

// Fetch the currently active timer session (if any).
export async function fetchActiveTimer(): Promise<SessionWithCategory | null> {
  const res = await fetch("/api/tracker", { cache: "no-store" });
  const json = (await res.json()) as {
    ok: boolean;
    data: SessionWithCategory | null;
    error?: string;
  };
  if (!res.ok || !json.ok) {
    throw new Error(json.error || `Failed to fetch active timer (${res.status}).`);
  }
  return json.data ?? null;
}

// Fetch the app's default timezone setting.
export async function fetchDefaultTimeZone(): Promise<string> {
  const res = await fetch("/api/settings", { cache: "no-store" });
  const json = (await res.json()) as SettingsResponse;
  if (!res.ok || !json.ok) {
    throw new Error(!json.ok ? json.error : `Failed to load settings (${res.status}).`);
  }
  return json.data.timeZone || "Asia/Yerevan";
}

// Fetch selectable (non-archived) categories.
export async function fetchCategories(): Promise<CategoryModel[]> {
  const res = await fetch("/api/categories", { cache: "no-store" });
  const json = (await res.json()) as {
    ok: boolean;
    data?: CategoryModel[];
    error?: string;
  };
  if (!res.ok || !json.ok) {
    throw new Error(json.error || `Failed to load categories (${res.status}).`);
  }
  return json.data ?? [];
}

// Start a new timer session (optional `startedAt` ISO for backdated start).
export async function startTimer(
  payload: StartTimerPayload,
): Promise<SessionWithCategory> {
  const res = await fetch("/api/tracker", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "start", ...payload }),
  });
  const json = (await res.json()) as {
    ok: boolean;
    data?: SessionWithCategory;
    error?: string;
  };
  if (res.status === 409 && json.data) {
    throw new ActiveTimerConflictError(json.data);
  }
  if (!res.ok || !json.ok || !json.data) {
    throw new Error(json.error || `Failed to start timer (${res.status}).`);
  }
  return json.data;
}

// Stop the currently running timer session (finalizes it into a Session row).
export async function stopTimer(sessionId: string): Promise<void> {
  const res = await fetch("/api/tracker", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "stop", sessionId }),
  });
  const json = (await res.json()) as { ok: boolean; error?: string };
  if (!res.ok || !json.ok) {
    throw new Error(json.error || `Failed to stop timer (${res.status}).`);
  }
}

// Stop the running timer, then immediately start a new one for the chosen activity.
export async function switchTimer(
  activeSessionId: string,
  payload: StartTimerPayload,
): Promise<SessionWithCategory> {
  await stopTimer(activeSessionId);
  return startTimer(payload);
}
