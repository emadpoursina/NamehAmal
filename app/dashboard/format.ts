// Format a duration in seconds as hh:mm or mm:ss.
export function formatDuration(seconds: number) {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.trunc(seconds)) : 0;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hours > 0) return `${hours}:${`${minutes}`.padStart(2, "0")}`;
  return `${minutes}:${`${secs}`.padStart(2, "0")}`;
}

// Format a Date into a local time string (HH:MM).
export function formatTimeLocal(value: Date | string) {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Format a Date into a local date string (YYYY-MM-DD).
export function formatDateLocalYmd(value: Date | string) {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

