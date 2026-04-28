"use client";

import type { CategoryModel, SessionModel } from "@/app/generated/prisma/models";
import { formatDuration, formatTimeLocal } from "@/app/dashboard/format";

type SessionWithCategory = SessionModel & { category: CategoryModel };

// Render the sessions list as a compact table.
export function SessionsTable({ sessions }: { sessions: SessionWithCategory[] }) {
  if (!sessions.length) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-600 dark:border-zinc-800 dark:bg-black dark:text-zinc-400">
        No sessions found for this filter.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-black">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-zinc-50 text-left text-xs font-medium text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400">
          <tr>
            <th className="px-4 py-3">Time</th>
            <th className="px-4 py-3">Title</th>
            <th className="px-4 py-3">Category</th>
            <th className="px-4 py-3 text-right">Duration</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr
              key={s.id}
              className="border-t border-zinc-100 text-zinc-900 hover:bg-zinc-50/50 dark:border-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-950/50"
            >
              <td className="px-4 py-3 font-mono text-xs text-zinc-700 dark:text-zinc-300">
                {formatTimeLocal(s.occurredAt)}
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-col gap-0.5">
                  <div className="font-medium">
                    {s.title?.trim() ? s.title : "Untitled"}
                  </div>
                  {s.kind ? (
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                      {s.kind}
                    </div>
                  ) : null}
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="inline-flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: s.category?.color ?? "#71717a" }}
                    aria-hidden
                  />
                  <span>{s.category?.name ?? "Unknown"}</span>
                </div>
              </td>
              <td className="px-4 py-3 text-right font-mono text-xs text-zinc-700 dark:text-zinc-300">
                {formatDuration(s.durationSeconds)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

