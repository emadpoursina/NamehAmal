"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CategoryModel, SessionModel } from "@/app/generated/prisma/models";
import { formatDuration } from "@/app/dashboard/format";

type SessionWithCategory = SessionModel & { category: CategoryModel };

// Fetch the currently active timer session (if any).
async function fetchActiveTimer(): Promise<SessionWithCategory | null> {
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

// Start a new timer session.
async function startTimer(payload: { categoryId: string; title: string | null }) {
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
  if (!res.ok || !json.ok || !json.data) {
    throw new Error(json.error || `Failed to start timer (${res.status}).`);
  }
  return json.data;
}

// Stop the currently running timer session.
async function stopTimer(sessionId: string) {
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

// Render the live tracking card (start/stop + elapsed time).
export function TrackerCard({ categories }: { categories: CategoryModel[] }) {
  const router = useRouter();
  const defaultCategoryId = useMemo(() => categories[0]?.id ?? "", [categories]);

  const [active, setActive] = useState<SessionWithCategory | null>(null);
  const [categoryId, setCategoryId] = useState(defaultCategoryId);
  const [title, setTitle] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchActiveTimer()
      .then((s) => {
        if (!cancelled) {
          setError(null);
          setActive(s);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load timer.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!active?.startedAt) return;
    tickRef.current = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
      tickRef.current = null;
    };
  }, [active?.startedAt]);

  const elapsedSeconds = (() => {
    if (!active?.startedAt) return 0;
    const start = new Date(active.startedAt).getTime();
    if (Number.isNaN(start)) return 0;
    return Math.max(0, Math.floor((now - start) / 1000));
  })();

  async function onStart() {
    setError(null);
    if (!categoryId) return setError("Category is required.");
    if (!categories.length) return setError("No categories available.");
    try {
      setIsBusy(true);
      const created = await startTimer({
        categoryId,
        title: title.trim() ? title.trim() : null,
      });
      setActive(created);
      setTitle("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start timer.");
    } finally {
      setIsBusy(false);
    }
  }

  async function onStop() {
    setError(null);
    if (!active?.id) return;
    try {
      setIsBusy(true);
      await stopTimer(active.id);
      setActive(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to stop timer.");
    } finally {
      setIsBusy(false);
    }
  }

  const activeCategoryName = active?.category?.name ?? null;

  return (
    <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-black">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Tracker
        </div>
        {active ? (
          <div className="rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
            Running
          </div>
        ) : (
          <div className="rounded-md bg-zinc-50 px-2 py-1 text-[11px] font-medium text-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
            Idle
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-3">
        {active ? (
          <>
            <div className="flex items-center justify-between">
              <div className="text-xs text-zinc-600 dark:text-zinc-400">
                {activeCategoryName ? `Category: ${activeCategoryName}` : "Category: —"}
              </div>
              <div className="font-mono text-sm text-zinc-900 dark:text-zinc-50">
                {formatDuration(elapsedSeconds)}
              </div>
            </div>
            <button
              type="button"
              disabled={isBusy}
              onClick={onStop}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
            >
              {isBusy ? "Stopping..." : "Stop"}
            </button>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Category
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-800 dark:bg-black dark:text-zinc-50"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Title
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Optional"
                className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-800 dark:bg-black dark:text-zinc-50"
              />
            </div>

            {error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                {error}
              </div>
            ) : null}

            <button
              type="button"
              disabled={isBusy || !categories.length}
              onClick={onStart}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {isBusy ? "Starting..." : "Start"}
            </button>
          </>
        )}

        {active && error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}

