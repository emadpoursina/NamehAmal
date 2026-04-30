"use client";

import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CategoryModel } from "@/app/generated/prisma/models";

// Create a category by POSTing to the categories API.
async function createCategory(payload: { name: string; color: string | null }) {
  const res = await fetch("/api/categories", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = (await res.json()) as { ok: boolean; error?: string };
  if (!res.ok || !json.ok) {
    throw new Error(json.error || `Failed to create category (${res.status}).`);
  }
}

// Update a category by PATCHing the category API.
export async function patchCategory(
  id: string,
  payload: Partial<
    Pick<CategoryModel, "name" | "color" | "isArchived" | "sortOrder" | "weeklyTargetHours">
  >,
) {
  const res = await fetch(`/api/categories/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = (await res.json()) as { ok: boolean; error?: string };
  if (!res.ok || !json.ok) {
    throw new Error(json.error || `Failed to update category (${res.status}).`);
  }
}

// Delete a category by DELETEing the category API.
async function deleteCategory(id: string) {
  const res = await fetch(`/api/categories/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  const json = (await res.json()) as { ok: boolean; error?: string };
  if (!res.ok || !json.ok) {
    throw new Error(json.error || `Failed to delete category (${res.status}).`);
  }
}

// Render Settings UI for adding, archiving/restoring, and reordering categories.
export function CategoryManager({
  active,
  archived,
}: {
  active: CategoryModel[];
  archived: CategoryModel[];
}) {
  const router = useRouter();

  const activeSorted = useMemo(() => {
    return [...active].sort((a, b) => {
      const ao = a.sortOrder ?? 0;
      const bo = b.sortOrder ?? 0;
      if (ao !== bo) return ao - bo;
      return (a.name ?? "").localeCompare(b.name ?? "");
    });
  }, [active]);

  const archivedSorted = useMemo(() => {
    return [...archived].sort((a, b) => {
      const ao = a.sortOrder ?? 0;
      const bo = b.sortOrder ?? 0;
      if (ao !== bo) return ao - bo;
      return (a.name ?? "").localeCompare(b.name ?? "");
    });
  }, [archived]);

  const [name, setName] = useState("");
  const [color, setColor] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onAddCategory(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) return setError("Name is required.");

    try {
      setIsSaving(true);
      await createCategory({ name: trimmed, color: color.trim() ? color.trim() : null });
      setName("");
      setColor("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create category.");
    } finally {
      setIsSaving(false);
    }
  }

  async function onArchive(id: string) {
    setError(null);
    try {
      setIsSaving(true);
      await patchCategory(id, { isArchived: true });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive category.");
    } finally {
      setIsSaving(false);
    }
  }

  async function onRestore(id: string) {
    setError(null);
    try {
      setIsSaving(true);
      await patchCategory(id, { isArchived: false });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore category.");
    } finally {
      setIsSaving(false);
    }
  }

  // Delete an archived category if it has no sessions.
  async function onDelete(id: string) {
    setError(null);
    const ok = confirm(
      "Delete this category? This is only allowed if it has no sessions.",
    );
    if (!ok) return;

    try {
      setIsSaving(true);
      await deleteCategory(id);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete category.");
    } finally {
      setIsSaving(false);
    }
  }

  async function onMove(id: string, direction: "up" | "down") {
    setError(null);
    const idx = activeSorted.findIndex((c) => c.id === id);
    if (idx < 0) return;

    const swapWith = direction === "up" ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= activeSorted.length) return;

    const a = activeSorted[idx];
    const b = activeSorted[swapWith];

    try {
      setIsSaving(true);
      await patchCategory(a.id, { sortOrder: b.sortOrder ?? 0 });
      await patchCategory(b.id, { sortOrder: a.sortOrder ?? 0 });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reorder categories.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={onAddCategory}
        className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-black"
      >
        <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Categories
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Deep work"
              className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-800 dark:bg-black dark:text-zinc-50"
              disabled={isSaving}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Color (optional)
            </label>
            <input
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="#22c55e"
              className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-800 dark:bg-black dark:text-zinc-50"
              disabled={isSaving}
            />
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : "Add category"}
            </button>
          </div>
        </div>

        {error ? (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            {error}
          </div>
        ) : null}
      </form>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-black">
          <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Active
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {!activeSorted.length ? (
              <div className="text-sm text-zinc-600 dark:text-zinc-400">
                No active categories.
              </div>
            ) : null}

            {activeSorted.map((c, i) => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-black"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: c.color ?? "#71717a" }}
                    aria-hidden
                  />
                  <div className="text-sm text-zinc-900 dark:text-zinc-50">
                    {c.name}
                  </div>
                </div>

                <div className="inline-flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onMove(c.id, "up")}
                    disabled={isSaving || i === 0}
                    className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-black dark:text-zinc-200 dark:hover:bg-zinc-950"
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    onClick={() => onMove(c.id, "down")}
                    disabled={isSaving || i === activeSorted.length - 1}
                    className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-black dark:text-zinc-200 dark:hover:bg-zinc-950"
                  >
                    Down
                  </button>
                  <button
                    type="button"
                    onClick={() => onArchive(c.id)}
                    disabled={isSaving}
                    className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-800 hover:bg-red-100 disabled:opacity-50 dark:border-red-900 dark:bg-red-950 dark:text-red-200 dark:hover:bg-red-900/40"
                  >
                    Archive
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-black">
          <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Archived
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {!archivedSorted.length ? (
              <div className="text-sm text-zinc-600 dark:text-zinc-400">
                No archived categories.
              </div>
            ) : null}

            {archivedSorted.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-black"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: c.color ?? "#71717a" }}
                    aria-hidden
                  />
                  <div className="text-sm text-zinc-900 dark:text-zinc-50">
                    {c.name}
                  </div>
                </div>

                <div className="inline-flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onRestore(c.id)}
                    disabled={isSaving}
                    className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-black dark:text-zinc-200 dark:hover:bg-zinc-950"
                  >
                    Restore
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(c.id)}
                    disabled={isSaving}
                    className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-800 hover:bg-red-100 disabled:opacity-50 dark:border-red-900 dark:bg-red-950 dark:text-red-200 dark:hover:bg-red-900/40"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

