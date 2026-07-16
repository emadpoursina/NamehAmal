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

const SERVER_SNAPSHOT: StoreSnapshot = {
  activities: EMPTY_ACTIVITIES,
  loading: true,
  error: null,
};

let cache: ActivityListItem[] | null = null;
let inflight: Promise<ActivityListItem[]> | null = null;
let error: string | null = null;
let snapshot: StoreSnapshot = SERVER_SNAPSHOT;
const listeners = new Set<() => void>();

function rebuildSnapshot() {
  snapshot = {
    activities: cache ?? EMPTY_ACTIVITIES,
    loading: !cache && Boolean(inflight),
    error,
  };
}

function getSnapshot(): StoreSnapshot {
  return snapshot;
}

function getServerSnapshot(): StoreSnapshot {
  return SERVER_SNAPSHOT;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  rebuildSnapshot();
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
  const store = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

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
    activities: store.activities,
    loading: store.loading,
    error: store.error,
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
