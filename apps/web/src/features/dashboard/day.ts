export function dashboardTimeZone(value?: string | null) {
  try {
    if (value) { new Intl.DateTimeFormat("en", { timeZone: value }).format(); return value; }
  } catch { /* Invalid saved preferences fall back to UTC. */ }
  return "UTC";
}

export function dashboardDay(timeZone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  return ["year", "month", "day"].map((type) => parts.find((part) => part.type === type)!.value).join("-");
}

export function validDashboardDay(value?: string): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.getUTCFullYear() >= 1000 && date.toISOString().slice(0, 10) === value;
}
