import { prepareCloudBackup } from "./cloud-backup";
import { prepareCloudImport } from "./cloud-import";
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

export async function updateProduct(product: Product) {
  const { data, error } = await client().from("products").update(product).eq("id", product.id).select("id");
  if (error || !data?.length) throw error ?? new Error("Product unavailable");
}
export async function updateTask(task: MaintenanceTask) {
  const { data, error } = await client().from("maintenance_tasks").update(task).eq("id", task.id).select("id");
  if (error || !data?.length) throw error ?? new Error("Task unavailable");
}
export async function deleteRecord(table: "products" | "maintenance_tasks", id: string) {
  const { data, error } = await client().from(table).delete().eq("id", id).select("id");
  if (error || !data?.length) throw error ?? new Error("Record unavailable");
}

export async function importLocalData(data: AppData, homeId: string) {
  const prepared = await prepareCloudImport(data, homeId);
  const { error } = await client().rpc("import_maintenance", { target_home: prepared.homeId, import_hash: prepared.hash, payload: prepared.payload });
  if (error) throw error;
}

export async function createHome(name: string, kind: string) {
  const { error } = await client().rpc("create_maintenance_home", { home_name: name, home_kind: kind });
  if (error) throw error;
}
export async function updateHome(id: string, name: string, kind: string) {
  const { data, error } = await client().from("homes").update({ name, kind }).eq("id", id).select("id");
  if (error || !data?.length) throw error ?? new Error("Home unavailable");
}
export async function removeHome(id: string) {
  const { data, error } = await client().from("homes").delete().eq("id", id).select("id");
  if (error || !data?.length) throw error ?? new Error("Home unavailable");
}

export async function restoreCloudBackup(data: AppData) {
  const prepared = await prepareCloudBackup(data);
  const { data: restored, error } = await client().rpc("restore_maintenance_backup", { backup_hash: prepared.hash, payload: prepared.payload });
  if (error) throw error;
  if (restored === false) throw new Error("このバックアップはすでに復元されています。");
}
