import { headers } from "next/headers";
import type { CategoryModel } from "@/app/generated/prisma/models";
import { CategoryManager } from "./CategoryManager";
import { DataManager } from "./DataManager";
import { WeeklyTargetsCard } from "./WeeklyTargetsCard";

// Build an absolute URL for internal API fetches.
async function getBaseUrl() {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

// Fetch JSON and throw on non-2xx responses.
async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Request failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

// Render the Settings page with category management.
export default async function SettingsPage() {
  const baseUrl = await getBaseUrl();
  const categoriesRes = await fetchJson<{ ok: boolean; data: CategoryModel[] }>(
    `${baseUrl}/api/categories?includeArchived=1`,
  );

  const categories = categoriesRes.data ?? [];
  const active = categories.filter((c) => !c.isArchived);
  const archived = categories.filter((c) => c.isArchived);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10 sm:px-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Settings
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Manage categories and keep your workflow tidy.
        </p>
      </div>

      <CategoryManager active={active} archived={archived} />
      <WeeklyTargetsCard
        key={active.map((c) => `${c.id}:${c.weeklyTargetHours ?? ""}:${c.sortOrder}`).join("|")}
        active={active}
      />
      <DataManager />
    </div>
  );
}

