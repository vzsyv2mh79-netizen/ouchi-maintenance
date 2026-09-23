import type { MaintenanceKind } from "./types";

export type Suggestion = { name: string; kind: MaintenanceKind; intervalDays: number };

// These are editable general starting points, never manufacturer recommendations.
export const suggestions: Record<string, Suggestion[]> = {
  aircon: [{ name: "フィルター掃除", kind: "掃除", intervalDays: 14 }],
  ecocute: [{ name: "浴槽フィルター掃除", kind: "掃除", intervalDays: 30 }],
  washer: [{ name: "洗濯槽洗浄", kind: "掃除", intervalDays: 30 }, { name: "乾燥フィルター掃除", kind: "掃除", intervalDays: 7 }],
  dryer: [{ name: "フィルター掃除", kind: "掃除", intervalDays: 7 }],
  "air-purifier": [{ name: "プレフィルター掃除", kind: "掃除", intervalDays: 30 }],
  humidifier: [{ name: "タンク清掃", kind: "掃除", intervalDays: 7 }],
  vacuum: [{ name: "ダストボックス清掃", kind: "掃除", intervalDays: 7 }],
  "robot-vacuum": [{ name: "ブラシ・センサー清掃", kind: "掃除", intervalDays: 30 }],
  "range-hood": [{ name: "フィルター掃除", kind: "掃除", intervalDays: 30 }],
  "water-filter": [{ name: "カートリッジ交換", kind: "交換", intervalDays: 90 }],
  "pest-control": [{ name: "本体を確認・交換", kind: "交換", intervalDays: 90 }],
  dehumidifier: [{ name: "吸湿状態の確認", kind: "点検", intervalDays: 30 }],
};
