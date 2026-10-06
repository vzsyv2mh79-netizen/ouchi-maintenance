import { validateData } from "./backup";
import { prepareCloudImport } from "./cloud-import";
import type { AppData } from "./types";

export async function prepareCloudBackup(value: unknown) {
  const data = validateData(value);
  const hash = (await prepareCloudImport(data, crypto.randomUUID())).hash;
  const homes = new Map(data.homes.map(home => [home.id, crypto.randomUUID()]));
  const products = new Map(data.products.map(product => [product.id, crypto.randomUUID()]));
  const tasks = new Map(data.tasks.map(task => [task.id, crypto.randomUUID()]));
  const payload: AppData = {
    homes: data.homes.map(home => ({ ...home, id: homes.get(home.id)!, name: home.name })),
    products: data.products.map(product => ({ ...product, id: products.get(product.id)!, homeId: homes.get(product.homeId)! })),
    tasks: data.tasks.map(task => ({ ...task, id: tasks.get(task.id)!, productId: products.get(task.productId)! })),
    history: data.history.map(history => ({ ...history, id: crypto.randomUUID(), productId: products.get(history.productId)!, taskId: tasks.get(history.taskId)! })),
  };
  return { hash, payload };
}
