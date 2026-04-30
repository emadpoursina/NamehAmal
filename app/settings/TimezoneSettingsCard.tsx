"use client";

import { useEffect, useMemo, useState } from "react";

type SettingsResponse =
  | { ok: true; data: { id: string; timeZone: string } }
  | { ok: false; error: string };

// Fetch current app settings (singleton).
async function fetchSettings() {
  const res = await fetch("/api/settings", { cache: "no-store" });
  const json = (await res.json()) as SettingsResponse;
  if (!res.ok || !json.ok) {
    const message = !json.ok ? json.error : `Failed to load settings (${res.status}).`;
    throw new Error(message);
  }
  return json.data;
}

// Update the default timezone setting.
async function updateSettings(payload: { timeZone: string }) {
  const res = await fetch("/api/settings", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = (await res.json()) as SettingsResponse;
  if (!res.ok || !json.ok) {
    const message = !json.ok ? json.error : `Failed to update settings (${res.status}).`;
    throw new Error(message);
  }
  return json.data;
}

const COMMON_TIMEZONES = [
  "Asia/Yerevan",
  "UTC",
  "Asia/Tehran",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "Asia/Tokyo",
  "Australia/Sydney",
] as const;

// Render a settings card for selecting the default timezone.
export function TimezoneSettingsCard() {
  const [timeZone, setTimeZone] = useState("Asia/Yerevan");
  const [customTimeZone, setCustomTimeZone] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const selectedCommon = useMemo(() => {
    return COMMON_TIMEZONES.includes(timeZone as (typeof COMMON_TIMEZONES)[number])
      ? timeZone
      : "";
  }, [timeZone]);

  useEffect(() => {
    let cancelled = false;
    fetchSettings()
      .then((s) => {
        if (cancelled) return;
        setTimeZone(s.timeZone || "Asia/Yerevan");
        setCustomTimeZone("");
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load timezone setting.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSave() {
    setError(null);

    const tz = (customTimeZone.trim() || timeZone.trim() || "").trim();
    if (!tz) return setError("Timezone is required.");

    try {
      setIsSaving(true);
      const updated = await updateSettings({ timeZone: tz });
      setTimeZone(updated.timeZone || tz);
      setCustomTimeZone("");
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save timezone.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-black">
      <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        Timezone
      </div>
      <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Default timezone used for new sessions and date filters.
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Common timezones
          </label>
          <select
            value={selectedCommon}
            disabled={isLoading || isSaving}
            onChange={(e) => {
              const v = e.target.value || "";
              if (!v) return;
              setTimeZone(v);
              setCustomTimeZone("");
            }}
            className="h-10 w-full max-w-md rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 disabled:opacity-50 dark:border-zinc-800 dark:bg-black dark:text-zinc-50"
          >
            <option value="">Custom (use input below)</option>
            {COMMON_TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Custom IANA timezone
          </label>
          <input
            value={customTimeZone}
            disabled={isLoading || isSaving}
            onChange={(e) => setCustomTimeZone(e.target.value)}
            placeholder='e.g. "Asia/Yerevan"'
            className="h-10 w-full max-w-md rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 disabled:opacity-50 dark:border-zinc-800 dark:bg-black dark:text-zinc-50"
          />
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            Current: <span className="font-mono">{timeZone}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={isLoading || isSaving}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
          {savedAt ? (
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              Saved
            </div>
          ) : null}
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}

