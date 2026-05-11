type DateParts = {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number; // 0-59
  second: number; // 0-59
};

// Check whether a string is a valid IANA timezone name.
export function isValidIanaTimeZone(timeZone: string): boolean {
  const tz = (timeZone ?? "").trim();
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Get the browser/device timezone (IANA) when available.
export function getBrowserTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

// Format a Date as YYYY-MM-DD in the provided timezone.
export function formatYmdInTimeZone(value: Date | string, timeZone: string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  const parts = getZonedParts(d, timeZone);
  const y = `${parts.year}`;
  const m = `${parts.month}`.padStart(2, "0");
  const day = `${parts.day}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Format a Date as HH:MM (24-hour, for HTML time inputs) in the given timezone.
export function format24hHmInTimeZone(value: Date | string, timeZone: string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "00:00";
  const parts = getZonedParts(d, timeZone);
  const h = `${parts.hour}`.padStart(2, "0");
  const m = `${parts.minute}`.padStart(2, "0");
  return `${h}:${m}`;
}

// Format a Date as HH:MM in the provided timezone.
export function formatHmInTimeZone(value: Date | string, timeZone: string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return d.toLocaleTimeString([], {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

// Convert YYYY-MM-DD to an inclusive [from,to] UTC Date range for that local day in `timeZone`.
export function ymdToUtcRangeInTimeZone(
  ymd: string,
  timeZone: string,
): { from: Date; to: Date } | null {
  const [yRaw, mRaw, dRaw] = (ymd ?? "").split("-");
  const year = Number.parseInt(yRaw ?? "", 10);
  const month = Number.parseInt(mRaw ?? "", 10);
  const day = Number.parseInt(dRaw ?? "", 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (!isValidIanaTimeZone(timeZone)) return null;

  const fromMs = zonedDateTimeToUtcMs(
    { year, month, day, hour: 0, minute: 0, second: 0 },
    0,
    timeZone,
  );
  const toMs = zonedDateTimeToUtcMs(
    { year, month, day, hour: 23, minute: 59, second: 59 },
    999,
    timeZone,
  );
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return null;
  return { from: new Date(fromMs), to: new Date(toMs) };
}

// Convert YYYY-MM-DD and local wall time (HH:MM or HH:MM:SS) in `timeZone` to a UTC ISO string.
export function ymdAndHmToUtcIsoInTimeZone(
  ymd: string,
  hm: string,
  timeZone: string,
): string | null {
  const [yRaw, mRaw, dRaw] = (ymd ?? "").split("-");
  const year = Number.parseInt(yRaw ?? "", 10);
  const month = Number.parseInt(mRaw ?? "", 10);
  const day = Number.parseInt(dRaw ?? "", 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (!isValidIanaTimeZone(timeZone)) return null;

  const hmNorm = (hm ?? "").trim();
  const [hStr, mStr, sStr] = hmNorm.split(":");
  const hour = Number.parseInt(hStr ?? "", 10);
  const minute = Number.parseInt(mStr ?? "0", 10);
  const second =
    sStr !== undefined && sStr !== "" ? Number.parseInt(sStr, 10) : 0;
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || !Number.isFinite(second)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) {
    return null;
  }

  const ms = zonedDateTimeToUtcMs(
    { year, month, day, hour, minute, second },
    0,
    timeZone,
  );
  return new Date(ms).toISOString();
}

// Convert YYYY-MM-DD to a UTC ISO string for local noon in `timeZone`.
export function ymdToUtcNoonIsoInTimeZone(ymd: string, timeZone: string): string | null {
  const [yRaw, mRaw, dRaw] = (ymd ?? "").split("-");
  const year = Number.parseInt(yRaw ?? "", 10);
  const month = Number.parseInt(mRaw ?? "", 10);
  const day = Number.parseInt(dRaw ?? "", 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (!isValidIanaTimeZone(timeZone)) return null;

  const ms = zonedDateTimeToUtcMs(
    { year, month, day, hour: 12, minute: 0, second: 0 },
    0,
    timeZone,
  );
  return new Date(ms).toISOString();
}

// Compute the UTC offset (in minutes) for a timezone at a given instant.
export function offsetMinutesAt(date: Date, timeZone: string): number | null {
  if (Number.isNaN(date.getTime())) return null;
  if (!isValidIanaTimeZone(timeZone)) return null;
  const parts = getZonedParts(date, timeZone);
  const asUtcMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    0,
  );
  const diffMs = asUtcMs - date.getTime();
  return Math.round(diffMs / 60000);
}

function getZonedParts(date: Date, timeZone: string): DateParts {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const year = Number.parseInt(pick("year"), 10);
  const month = Number.parseInt(pick("month"), 10);
  const day = Number.parseInt(pick("day"), 10);
  const hour = Number.parseInt(pick("hour"), 10);
  const minute = Number.parseInt(pick("minute"), 10);
  const second = Number.parseInt(pick("second"), 10);
  return { year, month, day, hour, minute, second };
}

function zonedDateTimeToUtcMs(
  desired: DateParts,
  millisecond: number,
  timeZone: string,
): number {
  // Start with a naive UTC guess, then iteratively correct it until the formatted zoned time matches.
  let guess = Date.UTC(
    desired.year,
    desired.month - 1,
    desired.day,
    desired.hour,
    desired.minute,
    desired.second,
    millisecond,
  );

  for (let i = 0; i < 4; i++) {
    const got = getZonedParts(new Date(guess), timeZone);
    const desiredUtc = Date.UTC(
      desired.year,
      desired.month - 1,
      desired.day,
      desired.hour,
      desired.minute,
      desired.second,
      0,
    );
    const gotUtc = Date.UTC(
      got.year,
      got.month - 1,
      got.day,
      got.hour,
      got.minute,
      got.second,
      0,
    );

    const delta = desiredUtc - gotUtc;
    if (delta === 0) return guess;
    guess += delta;
  }

  return guess;
}

