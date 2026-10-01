import { getSupabase } from "./supabase";
import type { AppData, MaintenanceTask, Product } from "./types";

function client() {
  const value = getSupabase();
  if (!value) throw new Error("クラウド保存の設定がありません。");
  return value;
}
export async function loadCloud(): Promise<AppData> {
  const { data, error } = await client().rpc("load_household");
  if (error) throw error;
  return data as AppData;
}
export async function saveProduct(product: Product, tasks: MaintenanceTask[]) {
  const { error } = await client().rpc("add_product_with_tasks", { product_data: product, task_data: tasks });
  if (error) throw error;
}
export async function saveTask(task: MaintenanceTask) {
  const { error } = await client().from("maintenance_tasks").insert({ ...task, lastCompletedAt: task.lastCompletedAt || null });
  if (error) throw error;
}
export async function finishTask(taskId: string) {
  const { error } = await client().rpc("complete_maintenance", { task_id: taskId });
  if (error) throw error;
}
