"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CategoryModel, SessionModel } from "@/app/generated/prisma/models";
import { formatDateLocalYmd, formatDuration, formatTimeLocal } from "@/app/dashboard/format";
import { EditSessionDialog } from "@/app/dashboard/EditSessionDialog";

type SessionWithCategory = SessionModel & { category: CategoryModel };

// Delete a session by id.
async function deleteSession(id: string) {
  const res = await fetch(`/api/sessions/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  const json = (await res.json()) as { ok: boolean; error?: string };
  if (!res.ok || !json.ok) {
    throw new Error(json.error || `Failed to delete session (${res.status}).`);
  }
}

// Render the sessions list as a compact table.
export function SessionsTable({
  sessions,
  categories,
}: {
  sessions: SessionWithCategory[];
  categories: CategoryModel[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<SessionWithCategory | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (!sessions.length) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-600 dark:border-zinc-800 dark:bg-black dark:text-zinc-400">
        No sessions found for this filter.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-black">
      {editing ? (
        <EditSessionDialog
          session={editing}
          categories={categories}
          onClose={() => setEditing(null)}
        />
      ) : null}
      <table className="w-full border-collapse text-sm">
        <thead className="bg-zinc-50 text-left text-xs font-medium text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400">
          <tr>
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">Time</th>
            <th className="px-4 py-3">Title</th>
            <th className="px-4 py-3">Category</th>
            <th className="px-4 py-3 text-right">Duration</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr
              key={s.id}
              className="border-t border-zinc-100 text-zinc-900 hover:bg-zinc-50/50 dark:border-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-950/50"
            >
              <td className="px-4 py-3 font-mono text-xs text-zinc-700 dark:text-zinc-300">
                {formatDateLocalYmd(s.occurredAt)}
              </td>
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
              <td className="px-4 py-3 text-right">
                <div className="inline-flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditing(s)}
                    className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-black dark:text-zinc-200 dark:hover:bg-zinc-950"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={deletingId === s.id}
                    onClick={async () => {
                      const ok = confirm("Delete this session?");
                      if (!ok) return;
                      try {
                        setDeletingId(s.id);
                        await deleteSession(s.id);
                        router.refresh();
                      } catch (err) {
                        alert(err instanceof Error ? err.message : "Failed to delete session.");
                      } finally {
                        setDeletingId(null);
                      }
                    }}
                    className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-800 hover:bg-red-100 disabled:opacity-50 dark:border-red-900 dark:bg-red-950 dark:text-red-200 dark:hover:bg-red-900/40"
                  >
                    {deletingId === s.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

