import { normalizeModel, type ProductCandidate } from "./product-lookup";
export const SHARP_INDEX_URL = "https://jp.sharp/support/air_purifier/js/dl_katalist.js";
export function parseSharpIndex(source: string, input: string): ProductCandidate[] {
  const model = normalizeModel(input);
  if (!/^[A-Z0-9][A-Z0-9-]{1,79}$/.test(model)) return [];
  // Parse JSON records, never execute manufacturer JavaScript.
  const records = source.match(/\{[^{}]{1,1000}\}/g) ?? [];
  for (const raw of records) {
    let record: { kisyu?: unknown; cat?: unknown };
    try { record = JSON.parse(raw); } catch { continue; }
    if (typeof record.kisyu !== "string" || normalizeModel(record.kisyu) !== model) continue;
    if (!['kashitsu', 'kuki'].includes(String(record.cat))) continue;
    const url = `https://jp.sharp/support/download/members/?productId=${encodeURIComponent(model)}`;
    return [{ maker: 'SHARP', name: record.cat === 'kashitsu' ? '加湿空気清浄機' : '空気清浄機', modelNumber: model, categoryId: 'air-purifier', productUrl: 'https://jp.sharp/support/air_purifier/download.html', manualUrl: url, verifiedAt: new Date().toISOString().slice(0,10), suggestions: [], lookupNote: '公式の説明書一覧に品番が掲載されています。説明書の内容とお手入れ周期は未確認のため、自動提案はありません。' }];
  }
  return [];
}
