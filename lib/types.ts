export type Category = { id: string; name: string; icon: string };
export type Home = { id: string; name: string; kind: "home" | "parents" | "second" | "rental" };
export type Product = {
  id: string; homeId: string; categoryId: string; maker: string; name: string;
  modelNumber: string; purchaseDate?: string; installedDate?: string; memo?: string;
};
export type SourceKind = "メーカー公式" | "取扱説明書" | "公的情報" | "一般的な目安" | "ユーザー設定";
export type MaintenanceKind = "掃除" | "交換" | "点検" | "補充";
export type MaintenanceTask = {
  id: string; productId: string; name: string; kind: MaintenanceKind; intervalDays: number;
  lastCompletedAt?: string; nextDueAt: string; sourceKind: SourceKind; sourceUrl?: string;
};
export type MaintenanceHistory = {
  id: string; taskId: string; productId: string; completedAt: string; note?: string;
};
export type AppData = { homes: Home[]; products: Product[]; tasks: MaintenanceTask[]; history: MaintenanceHistory[] };
