import type { CategoryModel } from "@/app/generated/prisma/models";
import { getInternalBaseUrl } from "@/app/server/internal-base-url";
import { ActivityManager } from "./ActivityManager";
import type { ActivityWithCategory } from "./ActivityFormDialog";
import { CategoryManager } from "./CategoryManager";
import { DataManager } from "./DataManager";
import { TimezoneSettingsCard } from "./TimezoneSettingsCard";
import { WeeklyTargetsCard } from "./WeeklyTargetsCard";

// Fetch JSON and throw on non-2xx responses.
async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Request failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

// Render the Settings page with category management.
export default async function SettingsPage() {
  const baseUrl = getInternalBaseUrl();
  const categoriesRes = await fetchJson<{ ok: boolean; data: CategoryModel[] }>(
    `${baseUrl}/api/categories?includeArchived=1`,
  );
  const activitiesRes = await fetchJson<{ ok: boolean; data: ActivityWithCategory[] }>(
    `${baseUrl}/api/activities?includeArchived=true`,
  );

  const categories = categoriesRes.data ?? [];
  const activities = activitiesRes.data ?? [];
  const active = categories.filter((c) => !c.isArchived);
  const archived = categories.filter((c) => c.isArchived);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10 sm:px-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Settings
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Manage categories, activity presets, and keep your workflow tidy.
        </p>
      </div>

      <TimezoneSettingsCard />
      <CategoryManager active={active} archived={archived} />
      <ActivityManager activities={activities} categories={categories} />
      <WeeklyTargetsCard
        key={active.map((c) => `${c.id}:${c.weeklyTargetHours ?? ""}:${c.sortOrder}`).join("|")}
        active={active}
      />
      <DataManager />
    </div>
  );
}

