const DAY = 86_400_000;

// Calendar dates use UTC arithmetic; the app's household calendar is Japan time.
export function addDays(date: string, days: number) {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}
export function today(now = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function daysUntil(date: string) {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today()}T00:00:00Z`)) / DAY);
}
export function formatShort(date: string) {
  const [, month, day] = date.split("-");
  return `${Number(month)}/${Number(day)}`;
}
export function formatLong(date: string) {
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "UTC", year: "numeric", month: "short", day: "numeric" }).format(new Date(`${date}T00:00:00Z`));
}
export function dueLabel(date: string) {
  const days = daysUntil(date);
  if (days < 0) return `${Math.abs(days)}日超過`;
  if (days === 0) return "今日";
  return `あと${days}日`;
}
