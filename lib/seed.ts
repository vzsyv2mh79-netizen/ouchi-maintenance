import { addDays, today } from "./date";
import type { AppData, MaintenanceHistory, MaintenanceTask, Product } from "./types";

const d = today();
const product = (id: string, categoryId: string, maker: string, name: string, modelNumber: string): Product =>
  ({ id, homeId: "home-1", categoryId, maker, name, modelNumber, installedDate: "2025-04-12" });
const task = (id: string, productId: string, name: string, kind: MaintenanceTask["kind"], intervalDays: number, offset: number): MaintenanceTask =>
  ({ id, productId, name, kind, intervalDays, lastCompletedAt: addDays(d, offset - intervalDays), nextDueAt: addDays(d, offset), sourceKind: "一般的な目安" });

export const seedData: AppData = {
  homes: [{ id: "home-1", name: "わが家", kind: "home" }],
  products: [
    product("p-aircon", "aircon", "Daikin", "リビングのエアコン", "AN40ZRP-W"),
    product("p-washer", "washer", "Panasonic", "ドラム式洗濯乾燥機", "NA-LX129B"),
    product("p-ecocute", "ecocute", "Mitsubishi Electric", "エコキュート", "SRT-S466"),
    product("p-purifier", "air-purifier", "SHARP", "リビングの空気清浄機", "KI-RX75"),
    product("p-pest", "pest-control", "デモブランド", "ゴキブリ対策用品", "DEMO-12"),
  ],
  tasks: [
    task("t-air-filter", "p-aircon", "フィルター掃除", "掃除", 14, 0),
    task("t-air-inside", "p-aircon", "内部清掃", "掃除", 180, 42),
    task("t-dryer-filter", "p-washer", "乾燥フィルター掃除", "掃除", 7, 3),
    task("t-tub", "p-washer", "洗濯槽洗浄", "掃除", 30, -2),
    task("t-bath", "p-ecocute", "浴槽フィルター", "掃除", 30, 12),
    task("t-tank", "p-ecocute", "タンク関連点検", "点検", 180, 78),
    task("t-pre", "p-purifier", "プレフィルター", "掃除", 30, 7),
    task("t-humid", "p-purifier", "加湿フィルター", "掃除", 30, 24),
    task("t-pest", "p-pest", "本体を交換", "交換", 365, 96),
  ],
  history: [
    { id: "h-1", taskId: "t-air-filter", productId: "p-aircon", completedAt: addDays(d, -14) },
    { id: "h-2", taskId: "t-tub", productId: "p-washer", completedAt: addDays(d, -32) },
    { id: "h-3", taskId: "t-pre", productId: "p-purifier", completedAt: addDays(d, -23) },
  ] satisfies MaintenanceHistory[],
};
