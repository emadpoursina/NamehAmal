import { headers } from "next/headers";
import type { CategoryModel, SessionModel } from "@/app/generated/prisma/models";
import { AddSessionForm } from "@/app/dashboard/AddSessionForm";
import { DashboardFilters } from "@/app/dashboard/DashboardFilters";
import { SessionsTable } from "@/app/dashboard/SessionsTable";
import { TrackerCard } from "@/app/dashboard/TrackerCard";

type SessionWithCategory = SessionModel & { category: CategoryModel };

// Format a Date as YYYY-MM-DD in local time.
function formatYmdLocal(date: Date) {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Convert YYYY-MM-DD to a local-day [from,to] range.
function ymdToLocalRange(ymd: string) {
  const [yRaw, mRaw, dRaw] = ymd.split("-");
  const y = Number.parseInt(yRaw ?? "", 10);
  const m = Number.parseInt(mRaw ?? "", 10);
  const d = Number.parseInt(dRaw ?? "", 10);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;

  const from = new Date(y, m - 1, d, 0, 0, 0, 0);
  const to = new Date(y, m - 1, d, 23, 59, 59, 999);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  return { from, to };
}

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

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Parse searchParams for date and categoryId
  const sp = (await searchParams) ?? {};
  const dateRaw = typeof sp.date === "string" ? sp.date : "";
  const categoryId = typeof sp.categoryId === "string" ? sp.categoryId : "";

  // Compute the active date, defaulting to today if not specified or invalid
  const todayYmd = formatYmdLocal(new Date());
  const activeDate = ymdToLocalRange(dateRaw) ? dateRaw : todayYmd;
  const range = ymdToLocalRange(activeDate);

  // Build the base URL for API requests
  const baseUrl = await getBaseUrl();

  // Fetch all categories
  const categoriesRes = await fetchJson<{ ok: boolean; data: CategoryModel[] }>(
    `${baseUrl}/api/categories`,
  );

  // Prepare sessions API URL with filters
  const sessionsUrl = new URL(`${baseUrl}/api/sessions`);
  sessionsUrl.searchParams.set("limit", "200");
  if (categoryId) sessionsUrl.searchParams.set("categoryId", categoryId);
  if (range) {
    sessionsUrl.searchParams.set("occurredFrom", range.from.toISOString());
    sessionsUrl.searchParams.set("occurredTo", range.to.toISOString());
  }

  // Fetch sessions (with joined categories)
  const sessionsRes = await fetchJson<{ ok: boolean; data: SessionWithCategory[] }>(
    sessionsUrl.toString(),
  );

  const categories = categoriesRes.data ?? [];
  const sessions = sessionsRes.data ?? [];

  // Render the dashboard page
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10 sm:px-6">
      {/* Page header */}
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Dashboard
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Track sessions and review your day.
        </p>
      </div>

      {/* Filters and quick actions */}
      <div className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-black">
        <DashboardFilters
          categories={categories}
          activeDate={activeDate}
          activeCategoryId={categoryId || null}
        />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
          <AddSessionForm categories={categories} activeDate={activeDate} />
          <TrackerCard categories={categories} />
          <div className="text-xs text-zinc-500 dark:text-zinc-400 sm:ml-auto">
            {/* Inform user about the number of sessions */}
            Showing {sessions.length} session(s)
          </div>
        </div>
      </div>

      {/* Sessions data table */}
      <SessionsTable sessions={sessions} categories={categories} />
    </div>
  );
}
