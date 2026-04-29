import { headers } from "next/headers";
import type { CategoryModel } from "@/app/generated/prisma/models";
import { formatDuration } from "@/app/dashboard/format";
import {
  addDaysToYmd,
  formatYmdLocal,
  isMondayThroughSundayWeek,
  startOfWeekMondayLocal,
} from "@/app/lib/local-week";
import { StatsFilters } from "@/app/stats/StatsFilters";
import { WeekGoalsTable, type WeekGoalRow } from "@/app/stats/WeekGoalsTable";

type StatsRow = {
  categoryId: string;
  name: string;
  color: string | null;
  seconds: number;
  percent: number;
};

type CategoriesStatsResponse = {
  ok: boolean;
  data: {
    from: string;
    to: string;
    totalSeconds: number;
    byCategory: StatsRow[];
  };
  error?: string;
};

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

// Render the stats page (category totals for a selected date range).
export default async function StatsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const fromRaw = typeof sp.from === "string" ? sp.from : "";
  const toRaw = typeof sp.to === "string" ? sp.to : "";
  const categoryId = typeof sp.categoryId === "string" ? sp.categoryId : "";

  const fromOk = Boolean(ymdToLocalRange(fromRaw));
  const toOk = Boolean(ymdToLocalRange(toRaw));
  const thisWeekMonday = formatYmdLocal(startOfWeekMondayLocal(new Date()));
  const thisWeekSunday = addDaysToYmd(thisWeekMonday, 6) ?? thisWeekMonday;

  let fromYmd: string;
  let toYmd: string;
  if (fromOk && toOk) {
    fromYmd = fromRaw;
    toYmd = toRaw;
    if (toYmd.localeCompare(fromYmd) < 0) toYmd = fromYmd;
  } else {
    fromYmd = thisWeekMonday;
    toYmd = thisWeekSunday;
  }

  const fromRange = ymdToLocalRange(fromYmd);
  const toRange = ymdToLocalRange(toYmd);
  const occurredFrom = fromRange?.from ?? new Date();
  const occurredTo = toRange?.to ?? new Date();

  const baseUrl = await getBaseUrl();
  const categoriesRes = await fetchJson<{ ok: boolean; data: CategoryModel[] }>(
    `${baseUrl}/api/categories?includeArchived=1`,
  );

  const statsUrl = new URL(`${baseUrl}/api/stats/categories`);
  statsUrl.searchParams.set("occurredFrom", occurredFrom.toISOString());
  statsUrl.searchParams.set("occurredTo", occurredTo.toISOString());
  if (categoryId) statsUrl.searchParams.set("categoryId", categoryId);

  const statsRes = await fetchJson<CategoriesStatsResponse>(statsUrl.toString());

  const categories = categoriesRes.data ?? [];
  const byCategory = statsRes.data?.byCategory ?? [];
  const totalSeconds = statsRes.data?.totalSeconds ?? 0;

  const secondsByCategoryId = new Map(
    byCategory.map((r) => [r.categoryId, r.seconds] as const),
  );
  const categoryOrder = new Map(categories.map((c, idx) => [c.id, idx]));

  const goalRows: WeekGoalRow[] = categories
    .filter(
      (c) =>
        typeof c.weeklyTargetHours === "number" &&
        Number.isFinite(c.weeklyTargetHours) &&
        c.weeklyTargetHours >= 0,
    )
    .map((c) => ({
      categoryId: c.id,
      name: c.name,
      color: c.color ?? null,
      actualSeconds: secondsByCategoryId.get(c.id) ?? 0,
      targetSeconds: Math.round((c.weeklyTargetHours as number) * 3600),
    }))
    .sort((a, b) => {
      const ao = categoryOrder.get(a.categoryId) ?? 0;
      const bo = categoryOrder.get(b.categoryId) ?? 0;
      return ao - bo;
    });

  const isGoalsWeek = isMondayThroughSundayWeek(fromYmd, toYmd);
  const showGoalsSection = goalRows.length > 0;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10 sm:px-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Stats
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Time totals by category for the selected range.
        </p>
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-black">
        <StatsFilters
          categories={categories}
          activeFrom={fromYmd}
          activeTo={toYmd}
          activeCategoryId={categoryId || null}
        />
        <div className="text-xs text-zinc-500 dark:text-zinc-400">
          Total: {formatDuration(totalSeconds)}
        </div>
      </div>

      {showGoalsSection ? (
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
            Weekly goals
          </h2>
          {!isGoalsWeek ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Select a full week (Monday through Sunday) using the week control or date fields to
              compare time tracked against your targets.
            </p>
          ) : (
            <WeekGoalsTable rows={goalRows} />
          )}
        </div>
      ) : null}

      {!byCategory.length ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-600 dark:border-zinc-800 dark:bg-black dark:text-zinc-400">
          No sessions found for this range.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-black">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-zinc-50 text-left text-xs font-medium text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 text-right">Time</th>
                <th className="px-4 py-3 text-right">Percent</th>
              </tr>
            </thead>
            <tbody>
              {byCategory.map((row) => (
                <tr
                  key={row.categoryId}
                  className="border-t border-zinc-100 text-zinc-900 dark:border-zinc-900 dark:text-zinc-50"
                >
                  <td className="px-4 py-3">
                    <div className="inline-flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: row.color ?? "#71717a" }}
                        aria-hidden
                      />
                      <span className="font-medium">{row.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-zinc-700 dark:text-zinc-300">
                    {formatDuration(row.seconds)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-zinc-700 dark:text-zinc-300">
                    {row.percent.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

