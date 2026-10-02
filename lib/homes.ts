import type { AppData } from "./types";
export function selectHome(data: AppData, homeId: string): AppData {
  const homes = data.homes.filter(home => home.id === homeId);
  const products = data.products.filter(product => product.homeId === homeId);
  const ids = new Set(products.map(product => product.id));
  return { homes, products, tasks: data.tasks.filter(task => ids.has(task.productId)), history: data.history.filter(history => ids.has(history.productId)) };
}
