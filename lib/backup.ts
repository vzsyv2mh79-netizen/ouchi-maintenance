import type { AppData } from "./types";

const kinds = ["掃除", "交換", "点検", "補充"];
const sources = ["メーカー公式", "取扱説明書", "公的情報", "一般的な目安", "ユーザー設定"];
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("形式が正しくありません");
  return value as Record<string, unknown>;
}
function text(value: unknown, required = false) {
  if (typeof value !== "string" || value.length > 10000 || (required && !value.trim())) throw new Error("文字列が正しくありません");
  return value;
}
function day(value: unknown) {
  const result = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(Date.parse(result)) || new Date(result).toISOString().slice(0, 10) !== result) throw new Error("日付が正しくありません");
  return result;
}
function optional(value: unknown, date = false) { return value == null ? undefined : date ? day(value) : text(value); }
function rows(value: unknown) {
  if (!Array.isArray(value) || value.length > 10000) throw new Error("件数または形式が正しくありません");
  const result = value.map(record);
  const ids = result.map((item) => text(item.id, true));
  if (new Set(ids).size !== ids.length) throw new Error("IDが重複しています");
  return result;
}
export function validateData(value: unknown): AppData {
  const data = record(value);
  const homes = rows(data.homes).map((h) => {
    if (!["home", "parents", "second", "rental"].includes(String(h.kind))) throw new Error("住まいの種類が正しくありません");
    return { id: text(h.id, true), name: text(h.name, true), kind: h.kind as AppData["homes"][number]["kind"] };
  });
  if (!homes.length) throw new Error("住まいがありません");
  const products = rows(data.products).map((p) => ({ id: text(p.id, true), homeId: text(p.homeId, true), categoryId: text(p.categoryId, true), maker: text(p.maker), name: text(p.name, true), modelNumber: text(p.modelNumber), purchaseDate: optional(p.purchaseDate, true), installedDate: optional(p.installedDate, true), memo: optional(p.memo) }));
  const tasks = rows(data.tasks).map((t) => {
    if (!kinds.includes(String(t.kind)) || !sources.includes(String(t.sourceKind)) || !Number.isInteger(t.intervalDays) || Number(t.intervalDays) < 1 || Number(t.intervalDays) > 3650) throw new Error("お手入れの設定が正しくありません");
    const url = optional(t.sourceUrl);
    if (url && !/^https?:\/\//.test(url)) throw new Error("情報源URLが正しくありません");
    if (["メーカー公式", "取扱説明書", "公的情報"].includes(String(t.sourceKind)) && !url?.startsWith("https://")) throw new Error("根拠のURLがありません");
    return { id: text(t.id, true), productId: text(t.productId, true), name: text(t.name, true), kind: t.kind as AppData["tasks"][number]["kind"], intervalDays: Number(t.intervalDays), nextDueAt: day(t.nextDueAt), lastCompletedAt: optional(t.lastCompletedAt, true), sourceKind: t.sourceKind as AppData["tasks"][number]["sourceKind"], sourceUrl: url, sourceNote: optional(t.sourceNote), sourceFrequency: optional(t.sourceFrequency) };
  });
  const history = rows(data.history).map((h) => ({ id: text(h.id, true), taskId: text(h.taskId, true), productId: text(h.productId, true), completedAt: day(h.completedAt), note: optional(h.note) }));
  if (products.some((p) => !homes.some((h) => h.id === p.homeId)) || tasks.some((t) => !products.some((p) => p.id === t.productId)) || history.some((h) => !tasks.some((t) => t.id === h.taskId && t.productId === h.productId))) throw new Error("記録の関連付けが正しくありません");
  return { homes, products, tasks, history };
}
export function encodeBackup(data: AppData) {
  return JSON.stringify({ app: "ouchi-maintenance", version: 1, exportedAt: new Date().toISOString(), data: validateData(data) }, null, 2);
}
export function decodeBackup(raw: string) {
  if (raw.length > 10 * 1024 * 1024) throw new Error("ファイルは10MB以内にしてください");
  const envelope = record(JSON.parse(raw));
  if (envelope.app !== "ouchi-maintenance" || envelope.version !== 1) throw new Error("対応するバックアップではありません");
  return validateData(envelope.data);
}
