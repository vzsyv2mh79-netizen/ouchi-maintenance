import type { AppData } from './types';

export function maintenanceReport(data: AppData, homeId: string, now: number) {
  if (!Number.isFinite(now)) throw new Error('Invalid report time');
  const home = data.homes.find(home => home.id === homeId);
  if (!home) throw new Error('Home unavailable');
  const today = new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [year, month] = today.split('-').map(Number);
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 6 + index, 1));
    return { month: date.toISOString().slice(0, 7), completed: 0 };
  });
  const products = data.products.filter(product => product.homeId === homeId);
  const ids = new Set(products.map(product => product.id));
  const tasks = data.tasks.filter(task => ids.has(task.productId));
  const taskIds = new Set(tasks.map(task => task.id));
  const history = data.history.filter(item => ids.has(item.productId) && taskIds.has(item.taskId) && item.completedAt <= today);
  for (const item of history) {
    const bucket = months.find(month => month.month === item.completedAt.slice(0, 7));
    if (bucket) bucket.completed += 1;
  }
  const perProduct = products.map(product => ({
    productId: product.id, name: product.name,
    completedThisMonth: 0, overdue: 0, dueToday: 0,
  }));
  const productTotals = new Map(perProduct.map(product => [product.productId, product]));
  for (const task of tasks) {
    const product = productTotals.get(task.productId)!;
    if (task.nextDueAt < today) product.overdue += 1;
    if (task.nextDueAt === today) product.dueToday += 1;
  }
  for (const item of history) {
    if (item.completedAt.startsWith(today.slice(0, 7))) productTotals.get(item.productId)!.completedThisMonth += 1;
  }
  return {
    homeId: home.id, homeName: home.name, generatedAt: new Date(now).toISOString(), today,
    productCount: products.length, taskCount: tasks.length,
    overdue: perProduct.reduce((total, product) => total + product.overdue, 0),
    dueToday: perProduct.reduce((total, product) => total + product.dueToday, 0),
    months, perProduct,
    explanation: '登録済みのお手入れと完了履歴の集計です。期限は現在の予定、完了件数は記録した日付を基準にしています。故障の予測や安全性の判定ではありません。',
  };
}
