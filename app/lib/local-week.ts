// Helpers for Monday-start weeks in the user's local timezone.
import { formatYmdInTimeZone, ymdToUtcRangeInTimeZone } from "@/app/lib/timezone";

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

/** True when `fromYmd` is Monday in `timeZone`, and `toYmd` is the Sunday of that same week. */
export function isMondayThroughSundayWeekInTimeZone(
  fromYmd: string,
  toYmd: string,
  timeZone: string,
): boolean {
  const fromRange = ymdToUtcRangeInTimeZone(fromYmd, timeZone);
  if (!fromRange) return false;
  if (fromRange.from.getUTCDay() !== 1) return false;
  const sunday = addDaysToYmdUtc(fromYmd, 6);
  return sunday !== null && sunday === toYmd;
}

export type WeekPresetOption = {
  value: string;
  label: string;
  mondayYmd: string;
  sundayYmd: string;
};

/** Parse YYYY-MM-DD into a UTC Date at 00:00:00, or null if invalid. */
export function parseYmdUtc(ymd: string): Date | null {
  const [yRaw, mRaw, dRaw] = (ymd ?? "").split("-");
  const y = Number.parseInt(yRaw ?? "", 10);
  const m = Number.parseInt(mRaw ?? "", 10);
  const d = Number.parseInt(dRaw ?? "", 10);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  const dt = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
  if (Number.isNaN(dt.getTime())) return null;
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

/** Add signed calendar days to a YYYY-MM-DD string using UTC arithmetic. */
export function addDaysToYmdUtc(ymd: string, deltaDays: number): string | null {
  const base = parseYmdUtc(ymd);
  if (!base) return null;
  const next = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + deltaDays));
  const y = next.getUTCFullYear();
  const m = `${next.getUTCMonth() + 1}`.padStart(2, "0");
  const d = `${next.getUTCDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Local Monday YYYY-MM-DD for the week that contains 'now' in `timeZone`. */
export function startOfWeekMondayYmdInTimeZone(timeZone: string, now = new Date()): string {
  const todayYmd = formatYmdInTimeZone(now, timeZone);
  const range = ymdToUtcRangeInTimeZone(todayYmd, timeZone);
  const day = range?.from.getUTCDay() ?? now.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return addDaysToYmdUtc(todayYmd, mondayOffset) ?? todayYmd;
}

/** Build select options in a fixed timezone: next week, this week, last week, … */
export function buildWeekPresetOptionsInTimeZone(
  timeZone: string,
  numPastWeeks: number,
): WeekPresetOption[] {
  const thisMondayYmd = startOfWeekMondayYmdInTimeZone(timeZone, new Date());
  const out: WeekPresetOption[] = [];

  const nextMondayYmd = addDaysToYmdUtc(thisMondayYmd, 7) ?? thisMondayYmd;
  out.push({
    value: "next",
    label: "Next week",
    mondayYmd: nextMondayYmd,
    sundayYmd: addDaysToYmdUtc(nextMondayYmd, 6)!,
  });

  for (let i = 0; i <= numPastWeeks; i++) {
    const mondayYmd = addDaysToYmdUtc(thisMondayYmd, -i * 7) ?? thisMondayYmd;
    const sundayYmd = addDaysToYmdUtc(mondayYmd, 6);
    if (!sundayYmd) continue;
    const label = i === 0 ? "This week" : i === 1 ? "Last week" : `${i} weeks ago`;
    out.push({
      value: `past-${i}`,
      label,
      mondayYmd,
      sundayYmd,
    });
  }

  return out;
}

/** Stats range presets: today, yesterday, this week, last week (calendar in `timeZone`). */
export function buildStatsRangePresetOptionsInTimeZone(timeZone: string): WeekPresetOption[] {
  const now = new Date();
  const todayYmd = formatYmdInTimeZone(now, timeZone);
  const yesterdayYmd = addDaysToYmdUtc(todayYmd, -1) ?? todayYmd;
  const thisMondayYmd = startOfWeekMondayYmdInTimeZone(timeZone, now);
  const thisSundayYmd = addDaysToYmdUtc(thisMondayYmd, 6)!;
  const lastMondayYmd = addDaysToYmdUtc(thisMondayYmd, -7) ?? thisMondayYmd;
  const lastSundayYmd = addDaysToYmdUtc(lastMondayYmd, 6)!;

  return [
    { value: "today", label: "Today", mondayYmd: todayYmd, sundayYmd: todayYmd },
    { value: "yesterday", label: "Yesterday", mondayYmd: yesterdayYmd, sundayYmd: yesterdayYmd },
    { value: "past-0", label: "This week", mondayYmd: thisMondayYmd, sundayYmd: thisSundayYmd },
    { value: "past-1", label: "Last week", mondayYmd: lastMondayYmd, sundayYmd: lastSundayYmd },
  ];
}

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
