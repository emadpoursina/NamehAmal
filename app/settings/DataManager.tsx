"use client";

import type { ChangeEvent } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";

type ImportResponse =
  | {
      ok: true;
      data: {
        categoriesCreated: number;
        categoriesUpdated?: number;
        sessionsCreated: number;
        warnings: string[];
      };
    }
  | { ok: false; error: string };

// Import a JSON export file into the local database.
async function importJson(payload: unknown) {
  const res = await fetch("/api/data/import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = (await res.json()) as ImportResponse;
  if (!res.ok || !json.ok) {
    const message = !json.ok ? json.error : `Failed to import (${res.status}).`;
    throw new Error(message);
  }
  return json.data;
}

// Render Settings UI for exporting and importing data.
export function DataManager() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    categoriesCreated: number;
    categoriesUpdated?: number;
    sessionsCreated: number;
    warnings: string[];
  } | null>(null);

  function onPickFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setError(null);
    setResult(null);
  }

  async function onImport() {
    setError(null);
    setResult(null);
    if (!file) return setError("Please choose a JSON file first.");

    try {
      setIsBusy(true);
      const text = await file.text();
      const payload = JSON.parse(text) as unknown;
      const data = await importJson(payload);
      setResult(data);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-black">
      <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Data</div>
      <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Export a JSON backup or import from an existing export file.
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <div className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Export</div>
          <a
            href="/api/data/export"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Download JSON
          </a>
        </div>

        <div className="flex flex-1 flex-col gap-2 sm:max-w-md">
          <div className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Import</div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="file"
              accept="application/json,.json"
              onChange={onPickFile}
              disabled={isBusy}
              className="block w-full text-sm text-zinc-700 file:mr-4 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-zinc-900 hover:file:bg-zinc-200 dark:text-zinc-200 dark:file:bg-zinc-900 dark:file:text-zinc-50 dark:hover:file:bg-zinc-800"
            />
            <button
              type="button"
              onClick={onImport}
              disabled={isBusy}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-black dark:text-zinc-50 dark:hover:bg-zinc-950"
            >
              {isBusy ? "Importing..." : "Import"}
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {result ? (
        <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
          <div>
            Imported: {result.categoriesCreated} categories created
            {typeof result.categoriesUpdated === "number" && result.categoriesUpdated > 0
              ? `, ${result.categoriesUpdated} category targets updated`
              : ""}
            , {result.sessionsCreated} sessions.
          </div>
          {result.warnings?.length ? (
            <ul className="mt-2 list-disc pl-5">
              {result.warnings.map((w, idx) => (
                <li key={idx}>{w}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

