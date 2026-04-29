// Helpers for Monday-start weeks in the user's local timezone.

/** Format a Date as YYYY-MM-DD in local time. */
export function formatYmdLocal(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Parse YYYY-MM-DD into a local calendar date at 00:00:00, or null if invalid. */
export function parseYmdLocal(ymd: string): Date | null {
  const [yRaw, mRaw, dRaw] = ymd.split("-");
  const y = Number.parseInt(yRaw ?? "", 10);
  const m = Number.parseInt(mRaw ?? "", 10);
  const d = Number.parseInt(dRaw ?? "", 10);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  const dt = new Date(y, m - 1, d, 0, 0, 0, 0);
  if (Number.isNaN(dt.getTime())) return null;
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt;
}

/** Add signed calendar days to a YYYY-MM-DD string in local time. */
export function addDaysToYmd(ymd: string, deltaDays: number): string | null {
  const base = parseYmdLocal(ymd);
  if (!base) return null;
  const next = new Date(base.getFullYear(), base.getMonth(), base.getDate() + deltaDays);
  return formatYmdLocal(next);
}

/** Local Monday 00:00:00 of the week that contains `reference`. */
export function startOfWeekMondayLocal(reference: Date): Date {
  const d = new Date(
    reference.getFullYear(),
    reference.getMonth(),
    reference.getDate(),
    0,
    0,
    0,
    0,
  );
  const day = d.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + mondayOffset);
  return d;
}

/** Bounds Monday 00:00 through Sunday 23:59:59.999 for a week whose Monday is `mondayYmd`. */
export function weekBoundsFromMondayStart(mondayYmd: string): { from: Date; to: Date } | null {
  const monday = parseYmdLocal(mondayYmd);
  if (!monday || monday.getDay() !== 1) return null;
  const to = new Date(
    monday.getFullYear(),
    monday.getMonth(),
    monday.getDate() + 6,
    23,
    59,
    59,
    999,
  );
  return { from: monday, to };
}

/** True when `fromYmd` is Monday, `toYmd` is the Sunday of that same week. */
export function isMondayThroughSundayWeek(fromYmd: string, toYmd: string): boolean {
  const from = parseYmdLocal(fromYmd);
  const to = parseYmdLocal(toYmd);
  if (!from || !to) return false;
  if (from.getDay() !== 1) return false;
  const sunday = addDaysToYmd(fromYmd, 6);
  return sunday !== null && sunday === toYmd;
}

export type WeekPresetOption = {
  value: string;
  label: string;
  mondayYmd: string;
  sundayYmd: string;
};

/** Build select options: next week, this week, last week, …, N weeks ago (local Monday weeks). */
export function buildWeekPresetOptions(numPastWeeks: number): WeekPresetOption[] {
  const thisMonday = startOfWeekMondayLocal(new Date());
  const out: WeekPresetOption[] = [];

  const nextMonday = new Date(thisMonday);
  nextMonday.setDate(nextMonday.getDate() + 7);
  out.push({
    value: "next",
    label: "Next week",
    mondayYmd: formatYmdLocal(nextMonday),
    sundayYmd: addDaysToYmd(formatYmdLocal(nextMonday), 6)!,
  });

  for (let i = 0; i <= numPastWeeks; i++) {
    const monday = new Date(thisMonday);
    monday.setDate(monday.getDate() - i * 7);
    const mondayYmd = formatYmdLocal(monday);
    const sundayYmd = addDaysToYmd(mondayYmd, 6);
    if (!sundayYmd) continue;
    const label =
      i === 0 ? "This week" : i === 1 ? "Last week" : `${i} weeks ago`;
    out.push({
      value: `past-${i}`,
      label,
      mondayYmd,
      sundayYmd,
    });
  }

  return out;
}

/** Find the preset whose Monday/Sunday pair matches both YMD strings, if any. */
export function matchingWeekPresetValue(
  fromYmd: string,
  toYmd: string,
  presets: WeekPresetOption[],
): string {
  const hit = presets.find((p) => p.mondayYmd === fromYmd && p.sundayYmd === toYmd);
  return hit?.value ?? "";
}
