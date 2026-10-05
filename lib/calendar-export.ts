import type { AppData } from "./types";

function escape(value: string) { return value.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,"); }
function fold(line: string) {
  const encoder = new TextEncoder(); let result = "", current = "", bytes = 0;
  for (const character of line) {
    const length = encoder.encode(character).length;
    if (bytes + length > 75) { result += current + "\r\n"; current = " "; bytes = 1; }
    current += character; bytes += length;
  }
  return result + current;
}
export function calendarExport(data: AppData, now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Ouchi Maintenance//JA", "CALSCALE:GREGORIAN", "X-WR-CALNAME:おうちメンテ", "BEGIN:VTIMEZONE", "TZID:Asia/Tokyo", "BEGIN:STANDARD", "DTSTART:19700101T000000", "TZOFFSETFROM:+0900", "TZOFFSETTO:+0900", "TZNAME:JST", "END:STANDARD", "END:VTIMEZONE"];
  for (const task of data.tasks) {
    const product = data.products.find(p => p.id === task.productId);
    if (!product) continue;
    const date = task.nextDueAt.replace(/-/g, "");
    const uid = [...new TextEncoder().encode(task.id)].map(n => n.toString(16).padStart(2, "0")).join("");
    lines.push("BEGIN:VEVENT", `UID:${uid}@ouchi-maintenance`, `DTSTAMP:${stamp}`, `DTSTART;TZID=Asia/Tokyo:${date}T090000`, `DTEND;TZID=Asia/Tokyo:${date}T093000`, `RRULE:FREQ=DAILY;INTERVAL=${task.intervalDays}`, `SUMMARY:${escape(`${product.name}・${task.name}`)}`, `DESCRIPTION:${escape("おうちメンテで登録した周期です。実施後の次回予定はアプリで確認し、必要に応じてカレンダーも更新してください。")}`, "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:-P1D", `DESCRIPTION:${escape(`${task.name}の予定が明日です`)}`, "END:VALARM", "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
