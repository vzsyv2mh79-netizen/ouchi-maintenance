const DAY = 86_400_000;

export function addDays(date: string, days: number) {
  const result = new Date(`${date}T12:00:00`);
  result.setDate(result.getDate() + days);
  return result.toISOString().slice(0, 10);
}

export function today() { return new Date().toISOString().slice(0, 10); }

export function daysUntil(date: string) {
  const target = new Date(`${date}T12:00:00`).getTime();
  const now = new Date(`${today()}T12:00:00`).getTime();
  return Math.round((target - now) / DAY);
}

export function formatShort(date: string) {
  const value = new Date(`${date}T12:00:00`);
  return `${value.getMonth() + 1}/${value.getDate()}`;
}

export function formatLong(date: string) {
  return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "short", day: "numeric" }).format(new Date(`${date}T12:00:00`));
}

export function dueLabel(date: string) {
  const days = daysUntil(date);
  if (days < 0) return `${Math.abs(days)}日超過`;
  if (days === 0) return "今日";
  return `あと${days}日`;
}
