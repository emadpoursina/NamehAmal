import { formatDuration } from "@/app/dashboard/format";

export type WeekGoalRow = {
  categoryId: string;
  name: string;
  color: string | null;
  actualSeconds: number;
  targetSeconds: number;
};

// Table comparing tracked time to weekly hour targets for one Monday–Sunday range.
export function WeekGoalsTable({ rows }: { rows: WeekGoalRow[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-black">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-zinc-50 text-left text-xs font-medium text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400">
          <tr>
            <th className="px-4 py-3">Category</th>
            <th className="px-4 py-3 text-right">Actual</th>
            <th className="px-4 py-3 text-right">Target</th>
            <th className="px-4 py-3 text-right">% of target</th>
            <th className="hidden px-4 py-3 sm:table-cell sm:min-w-[8rem]">Progress</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const pct =
              row.targetSeconds > 0
                ? (row.actualSeconds / row.targetSeconds) * 100
                : null;
            const barPct =
              pct === null ? 0 : Number.isFinite(pct) ? Math.min(100, pct) : 0;
            const pctLabel =
              pct === null
                ? "—"
                : `${pct >= 10 || pct === 0 ? pct.toFixed(0) : pct.toFixed(1)}%`;

            return (
              <tr
                key={row.categoryId}
                className="border-t border-zinc-100 text-zinc-900 dark:border-zinc-900 dark:text-zinc-50"
              >
                <td className="px-4 py-3">
                  <div className="inline-flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: row.color ?? "#71717a" }}
                      aria-hidden
                    />
                    <span className="font-medium">{row.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-mono text-xs text-zinc-700 dark:text-zinc-300">
                  {formatDuration(row.actualSeconds)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-xs text-zinc-700 dark:text-zinc-300">
                  {formatDuration(row.targetSeconds)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-xs text-zinc-700 dark:text-zinc-300">
                  {pctLabel}
                </td>
                <td className="hidden px-4 py-3 sm:table-cell">
                  <div className="h-2 w-full max-w-[10rem] rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div
                      className="h-2 rounded-full bg-zinc-700 dark:bg-zinc-300"
                      style={{ width: `${barPct}%` }}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
