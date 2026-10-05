import { validateData } from "./backup";
import type { AppData } from "./types";

export async function prepareCloudImport(value: unknown, homeId: string) {
  const data = validateData(value);
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = [...new Uint8Array(digest)].map((n) => n.toString(16).padStart(2, "0")).join("");
  // Legacy local/demo IDs are not UUIDs. Remap every relation, without mutating local data.
  const products = new Map(data.products.map(p => [p.id, crypto.randomUUID()]));
  const tasks = new Map(data.tasks.map(t => [t.id, crypto.randomUUID()]));
  const payload: Pick<AppData, "products" | "tasks" | "history"> = {
    products: data.products.map(p => ({ ...p, id: products.get(p.id)!, homeId })),
    tasks: data.tasks.map(t => ({ ...t, id: tasks.get(t.id)!, productId: products.get(t.productId)! })),
    history: data.history.map(h => ({ ...h, id: crypto.randomUUID(), productId: products.get(h.productId)!, taskId: tasks.get(h.taskId)! })),
  };
  return { homeId, hash, payload };
}
