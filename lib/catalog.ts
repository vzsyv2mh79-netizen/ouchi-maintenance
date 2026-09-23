import type { Category } from "./types";

export const categories: Category[] = [
  ["aircon", "エアコン", "wind"], ["ecocute", "エコキュート", "droplets"],
  ["washer", "洗濯機", "washing-machine"], ["dryer", "乾燥機", "circle-dashed"],
  ["fridge", "冷蔵庫", "refrigerator"], ["dishwasher", "食洗機", "utensils"],
  ["air-purifier", "空気清浄機", "sparkles"], ["humidifier", "加湿器", "cloud"],
  ["vacuum", "掃除機", "brush-cleaning"], ["robot-vacuum", "ロボット掃除機", "bot"],
  ["range-hood", "レンジフード", "cooking-pot"], ["vent-fan", "換気扇", "fan"],
  ["water-filter", "浄水器", "glass-water"], ["fire-alarm", "火災報知器", "siren"],
  ["other-appliance", "その他家電", "plug"], ["pest-control", "防虫用品", "shield"],
  ["dehumidifier", "除湿剤", "package"], ["other-consumable", "その他消耗品", "box"],
].map(([id, name, icon]) => ({ id, name, icon }));
