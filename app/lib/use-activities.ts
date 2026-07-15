"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { ActivityModel, CategoryModel } from "@/app/generated/prisma/models";

export type ActivityListItem = ActivityModel & { category: CategoryModel };

export type ActivitySelection = Pick<
  ActivityModel,
  "id" | "title" | "categoryId" | "defaultDurationSeconds" | "color"
>;

type StoreSnapshot = {
  activities: ActivityListItem[];
  loading: boolean;
  error: string | null;
};

const EMPTY_ACTIVITIES: ActivityListItem[] = [];

let cache: ActivityListItem[] | null = null;
let inflight: Promise<ActivityListItem[]> | null = null;
let error: string | null = null;
const listeners = new Set<() => void>();

function getSnapshot(): StoreSnapshot {
  return {
    activities: cache ?? EMPTY_ACTIVITIES,
    loading: !cache && Boolean(inflight),
    error,
  };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  for (const listener of listeners) listener();
}

async function fetchActivitiesFromApi(): Promise<ActivityListItem[]> {
  const res = await fetch("/api/activities", { cache: "no-store" });
  const json = (await res.json()) as {
    ok: boolean;
    data?: ActivityListItem[];
    error?: string;
  };
  if (!res.ok || !json.ok) {
    throw new Error(json.error || `Failed to load activities (${res.status}).`);
  }
  return json.data ?? [];
}

async function ensureActivitiesLoaded(force = false): Promise<ActivityListItem[]> {
  if (!force && cache) return cache;
  if (!force && inflight) return inflight;

  error = null;
  notify();

  inflight = fetchActivitiesFromApi()
    .then((data) => {
      cache = data;
      error = null;
      return data;
    })
    .catch((err) => {
      error = err instanceof Error ? err.message : "Failed to load activities.";
      throw err;
    })
    .finally(() => {
      inflight = null;
      notify();
    });

  return inflight;
}

export function invalidateActivitiesCache() {
  cache = null;
  error = null;
  notify();
}

// Shared client hook for activity lists used by combobox surfaces.
export function useActivities() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    if (!cache && !inflight) {
      void ensureActivitiesLoaded(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    cache = null;
    await ensureActivitiesLoaded(true);
  }, []);

  return {
    activities: snapshot.activities,
    loading: snapshot.loading,
    error: snapshot.error,
    refresh,
  };
}

export function toActivitySelection(activity: ActivityListItem): ActivitySelection {
  return {
    id: activity.id,
    title: activity.title,
    categoryId: activity.categoryId,
    defaultDurationSeconds: activity.defaultDurationSeconds,
    color: activity.color,
  };
}
