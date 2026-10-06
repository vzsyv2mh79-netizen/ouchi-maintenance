"use client";
import { PushControls } from "./push-controls";

import Link from "next/link";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Archive, ArrowLeft, CalendarDays, Check, CheckCircle2, ChevronRight,
  ClipboardCheck, Clock3, History, Home, House, Info, LayoutGrid,
  Plus, Search, Settings, ShieldCheck, Sparkles, Wrench, X,
} from "lucide-react";
import { categories } from "@/lib/catalog";
import { addDays, daysUntil, dueLabel, formatLong, formatShort, today } from "@/lib/date";
import { createSeedData } from "@/lib/seed";
import { getSupabase } from "@/lib/supabase";
import { loadCloud, saveProduct, saveTask, finishTask, updateProduct, updateTask, deleteRecord, importLocalData, createHome, updateHome, removeHome, restoreCloudBackup } from "@/lib/cloud-repository";
import { CloudAccount } from "./cloud-account";
import { ManualLookupControls } from "./manual-lookup-controls";
import { HomeControls } from "./home-controls";
import { selectHome } from "@/lib/homes";
import { CalendarControls } from "./calendar-controls";
import { CloudImportControls } from "./cloud-import-controls";
import { InstallControls } from "./install-controls";
import { BackupControls } from "./backup-controls";
import { validateData } from "@/lib/backup";
import { lookupModel, officialSearchLinks, supportedModels, type ProductCandidate } from "@/lib/product-lookup";
import { suggestions } from "@/lib/suggestions";
import type { AppData, MaintenanceKind, MaintenanceTask, Product, SourceKind, Home as HomeRecord } from "@/lib/types";

type Tab = "home" | "tasks" | "products" | "history" | "settings";
const storageKey = "ouchi-maintenance-v1";
const navItems = [
  { id: "home", label: "ホーム", icon: Home }, { id: "tasks", label: "やること", icon: ClipboardCheck },
  { id: "products", label: "製品", icon: LayoutGrid }, { id: "history", label: "履歴", icon: History },
  { id: "settings", label: "設定", icon: Settings },
] as const;

export function MaintenanceApp() {
  const [data, setData] = useState<AppData>(() => ({ homes: [{ id: "home-1", name: "わが家", kind: "home" }], products: [], tasks: [], history: [] }));
  const [homeId, setHomeId] = useState("");
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>("home");
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [modal, setModal] = useState<"product" | "task" | null>(null);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [editTask, setEditTask] = useState<MaintenanceTask | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [authReady, setAuthReady] = useState(() => !getSupabase());
  const [cloudUser, setCloudUser] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const operation = useRef(false);
  const generation = useRef(0);
  const localSnapshot = useRef<string | null>(null);
  const [, refreshDate] = useState(0);
  useEffect(() => {
    const client = getSupabase();
    if (!client) return;
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      setCloudUser(session?.user.id ?? null); setAuthReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!authReady) return;
    let active = true;
    generation.current += 1;
    setHomeId(""); setReady(false); setLoadError(false); setStorageError(false); setSelectedProduct(null); setModal(null); setEditProduct(null); setEditTask(null);
    if (cloudUser) {
      loadCloud().then((value) => { if (active) { setData(value); setReady(true); } })
        .catch(() => { if (active) setLoadError(true); });
    } else {
      try {
        const saved = localStorage.getItem(storageKey);
        localSnapshot.current = saved;
        setData(saved === null ? createSeedData() : validateData(JSON.parse(saved)));
      } catch { setData(createSeedData()); setStorageError(true); }
      setReady(true);
    }
    return () => { active = false; };
  }, [cloudUser, authReady]);
  useEffect(() => {
    if (cloudUser || !authReady) return;
    const receive = (event: StorageEvent) => {
      if (event.key !== storageKey && event.key !== null) return;
      try {
        const raw = localStorage.getItem(storageKey);
        const updated = raw === null ? createSeedData() : validateData(JSON.parse(raw));
        localSnapshot.current = raw;
        setData(updated); setStorageError(false);
        setModal(null); setEditProduct(null); setEditTask(null); setSelectedProduct(null);
        setToast("別のタブで記録が更新されました。最新の記録を表示しています。");
      } catch { setStorageError(true); }
    };
    window.addEventListener("storage", receive);
    return () => window.removeEventListener("storage", receive);
  }, [cloudUser, authReady]);
  useEffect(() => {
    const timer = setInterval(() => refreshDate((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 4000); return () => clearTimeout(timer); }, [toast]);
  const commitChange = async (next: AppData, remote: () => Promise<void>, message: string) => {
    if (operation.current || !ready || storageError) return;
    operation.current = true; setBusy(true);
    const currentGeneration = generation.current;
    try {
      if (cloudUser) { await remote(); const value = await loadCloud(); if (generation.current === currentGeneration) setData(value); }
      else {
        const expectedSnapshot = localSnapshot.current;
        const write = () => {
          const raw = localStorage.getItem(storageKey);
          if (raw !== expectedSnapshot) {
            const updated = raw === null ? createSeedData() : validateData(JSON.parse(raw));
            localSnapshot.current = raw; setData(updated);
            setModal(null); setEditProduct(null); setEditTask(null); setSelectedProduct(null);
            setToast("別のタブで記録が更新されています。内容を確認して、もう一度操作してください。");
            return false;
          }
          const encoded = JSON.stringify(next);
          localStorage.setItem(storageKey, encoded); localSnapshot.current = encoded;
          setData(next); setStorageError(false); return true;
        };
        if (!navigator.locks) {
          setToast("このブラウザでは安全な端末保存を利用できません。最新のブラウザかクラウド保存を利用してください。");
          return;
        }
        const saved = await navigator.locks.request(storageKey, write);
        if (!saved) return;
      }
      if (generation.current === currentGeneration) { setModal(null); setEditProduct(null); setEditTask(null); setToast(message); }
    } catch (cause) {
      if (generation.current === currentGeneration) {
        if (cause instanceof Error && cause.message === "このバックアップはすでに復元されています。") {
          setToast(cause.message); return;
        }
        setToast(cloudUser ? "保存結果を確認できませんでした。再読み込みして確認してください。" : "端末に保存できませんでした。空き容量やブラウザ設定を確認してください。");
        if (cloudUser) setLoadError(true);
      }
    } finally { operation.current = false; setBusy(false); }
  };
  const completeTask = (taskId: string) => {
    const task = data.tasks.find((item) => item.id === taskId);
    if (!task) return;
    const completedAt = today();
    if (data.history.some((h) => h.taskId === taskId && h.completedAt === completedAt)) { setToast("この項目は今日すでに完了しています"); return; }
    void commitChange({ ...data,
      tasks: data.tasks.map((item) => item.id === taskId ? { ...item, lastCompletedAt: completedAt, nextDueAt: addDays(completedAt, item.intervalDays) } : item),
      history: [{ id: crypto.randomUUID(), taskId, productId: task.productId, completedAt }, ...data.history],
    }, () => finishTask(taskId), `「${task.name}」を完了しました`);
  };
  const openProduct = (id: string) => { setSelectedProduct(id); setTab("products"); };
  const addProduct = (product: Product, choices: TaskChoice[]) => {
    const tasks: MaintenanceTask[] = choices.map((choice) => ({ id: crypto.randomUUID(), productId: product.id,
      name: choice.name, kind: choice.kind, intervalDays: choice.intervalDays, sourceKind: choice.sourceKind ?? "一般的な目安",
      sourceUrl: choice.sourceUrl, sourceNote: choice.conditions, sourceFrequency: choice.frequency, nextDueAt: addDays(today(), choice.intervalDays) }));
    void commitChange({ ...data, products: [...data.products, product], tasks: [...data.tasks, ...tasks] }, () => saveProduct(product, tasks), "製品を追加しました");
  };
  const addTask = (task: MaintenanceTask) => { void commitChange({ ...data, tasks: [...data.tasks, task] }, () => saveTask(task), "お手入れ項目を追加しました"); };

  const removeProduct = (product: Product) => {
    if (!window.confirm(`「${product.name}」と関連するお手入れ・履歴を削除しますか？`)) return;
    void commitChange({ ...data, products: data.products.filter(p => p.id !== product.id), tasks: data.tasks.filter(t => t.productId !== product.id), history: data.history.filter(h => h.productId !== product.id) }, () => deleteRecord("products", product.id), "製品を削除しました").then(() => setSelectedProduct(null));
  };
  const removeTask = (task: MaintenanceTask) => {
    if (!window.confirm(`「${task.name}」と関連する履歴を削除しますか？`)) return;
    void commitChange({ ...data, tasks: data.tasks.filter(t => t.id !== task.id), history: data.history.filter(h => h.taskId !== task.id) }, () => deleteRecord("maintenance_tasks", task.id), "項目を削除しました");
  };

  const currentHome = data.homes.find(h => h.id === homeId) ?? data.homes[0];
  const view = selectHome(data, currentHome.id);
  const addHome = (name: string, kind: HomeRecord["kind"]) => {
    const home = { id: crypto.randomUUID(), name, kind };
    void commitChange({ ...data, homes: [...data.homes, home] }, () => createHome(name, kind), "住まいを追加しました");
  };
  const renameHome = (name: string, kind: HomeRecord["kind"]) => {
    void commitChange({ ...data, homes: data.homes.map(h => h.id === currentHome.id ? { ...h, name, kind } : h) }, () => updateHome(currentHome.id, name, kind), "住まいを更新しました");
  };
  const deleteHome = () => {
    if (data.homes.length < 2 || !window.confirm(`「${currentHome.name}」の製品・お手入れ・履歴をすべて削除しますか？共有している家族の記録も削除されます。`)) return;
    const ids = new Set(view.products.map(p => p.id));
    void commitChange({ ...data, homes: data.homes.filter(h => h.id !== currentHome.id), products: data.products.filter(p => !ids.has(p.id)), tasks: data.tasks.filter(t => !ids.has(t.productId)), history: data.history.filter(h => !ids.has(h.productId)) }, () => removeHome(currentHome.id), "住まいを削除しました");
  };
  const page = selectedProduct && tab === "products" && view.products.some(product => product.id === selectedProduct)
    ? <ProductDetail onEditProduct={setEditProduct} onEditTask={setEditTask} onDeleteProduct={removeProduct} onDeleteTask={removeTask} productId={selectedProduct} data={view} onBack={() => setSelectedProduct(null)} onComplete={completeTask} onAddTask={() => setModal("task")} />
    : tab === "home" ? <HomePage data={view} onComplete={completeTask} onOpenProduct={openProduct} onAll={() => setTab("tasks")} />
    : tab === "tasks" ? <TasksPage data={view} onComplete={completeTask} onOpenProduct={openProduct} />
    : tab === "products" ? <ProductsPage data={view} onAdd={() => setModal("product")} onOpenProduct={openProduct} />
    : tab === "history" ? <HistoryPage data={view} onOpenProduct={openProduct} />
    : <SettingsPage key={cloudUser ?? "local"} homeControls={<HomeControls home={currentHome} cloud={!!cloudUser} busy={busy} canDelete={data.homes.length > 1} onCreate={addHome} onUpdate={renameHome} onDelete={deleteHome} onRefresh={() => commitChange(data, async () => {}, "記録を更新しました")} />} backupData={data} onImport={(local) => { void commitChange(data, () => importLocalData(local, currentHome.id), "端末の記録をクラウドに追加しました"); }} onRestore={(restored) => { void commitChange(restored, () => restoreCloudBackup(restored), "バックアップを復元しました"); }} cloud={!!cloudUser} busy={busy} data={view} onReset={() => { if (window.confirm("現在の製品・履歴をすべて消してデモデータに戻しますか？")) { void commitChange(createSeedData(), async () => {}, "デモデータを復元しました");  } }} onClear={() => { if (window.confirm("現在の製品・履歴をすべて消して、空の状態から始めますか？")) { void commitChange({ ...data, products: [], tasks: [], history: [] }, async () => {}, "空の状態にしました");  } }} />;

  if (!ready || loadError) return <div className="page narrow"><h1>おうちメンテ</h1><p role="status">{loadError ? "記録を読み込めませんでした。通信状態を確認して再読み込みしてください。" : "記録を読み込み中…"}</p>{loadError && <><button className="primary-button" onClick={() => window.location.reload()}>再読み込み</button><CloudAccount disabled={busy} /></>}</div>;
  return (
    <div className="app-shell" inert={busy}>
      <Sidebar cloud={!!cloudUser} active={tab} onChange={(next) => { setTab(next); setSelectedProduct(null); }} />
      <div className="app-main">
        <Topbar data={data} homeId={currentHome.id} onSwitch={(id) => { setHomeId(id); setSelectedProduct(null); setModal(null); setEditProduct(null); setEditTask(null); }} />
        <main className="page-container">{storageError && <p role="alert">端末の保存データを読み込めませんでした。保存データは保持されています。ブラウザを再読み込みしてください。安全のため新しい保存は停止しています。</p>}{page}</main>
      </div>
      <BottomNav active={tab} onChange={(next) => { setTab(next); setSelectedProduct(null); }} />
      {modal === "product" && <ProductModal homeId={currentHome.id} onClose={() => setModal(null)} onSave={addProduct} />}
      {modal === "task" && selectedProduct && <TaskModal productId={selectedProduct} onClose={() => setModal(null)} onSave={addTask} />}
      {editProduct && <ProductModal initial={editProduct} homeId={editProduct.homeId} onClose={() => setEditProduct(null)} onSave={(product) => { void commitChange({ ...data, products: data.products.map(p => p.id === product.id ? product : p) }, () => updateProduct(product), "製品を更新しました"); }} />}
      {editTask && <TaskModal initial={editTask} productId={editTask.productId} onClose={() => setEditTask(null)} onSave={(task) => { void commitChange({ ...data, tasks: data.tasks.map(t => t.id === task.id ? task : t) }, () => updateTask(task), "項目を更新しました"); }} />}
      {toast && <div className="toast"><span className="toast-check"><Check size={16} /></span>{toast}</div>}
    </div>
  );
}

function Topbar({ data, homeId, onSwitch }: { data: AppData; homeId: string; onSwitch: (id: string) => void }) {
  return <header className="topbar"><div className="mobile-brand"><Logo />おうちメンテ</div><label className="home-switch"><House size={16} /><select aria-label="表示する住まい" value={homeId} onChange={(e) => onSwitch(e.target.value)}>{data.homes.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</select></label></header>;
}
function Logo() { return <span className="logo-mark"><House size={17} strokeWidth={2.3} /></span>; }
function Sidebar({ active, onChange, cloud }: { cloud: boolean; active: Tab; onChange: (tab: Tab) => void }) {
  return <aside className="sidebar"><div className="brand"><Logo /><span>おうちメンテ</span></div><nav>{navItems.map(({ id, label, icon: Icon }) => <button key={id} className={active === id ? "active" : ""} onClick={() => onChange(id)}><Icon size={20} /><span>{label}</span></button>)}</nav><div className="sidebar-foot"><div><strong>{cloud ? "クラウドに保存中" : "この端末に保存中"}</strong></div></div></aside>;
}
function BottomNav({ active, onChange }: { active: Tab; onChange: (tab: Tab) => void }) {
  return <nav className="bottom-nav">{navItems.map(({ id, label, icon: Icon }) => <button key={id} className={active === id ? "active" : ""} onClick={() => onChange(id)}><Icon size={21} strokeWidth={active === id ? 2.4 : 1.8} /><span>{label}</span></button>)}</nav>;
}

function HomePage({ data, onComplete, onOpenProduct, onAll }: { data: AppData; onComplete: (id: string) => void; onOpenProduct: (id: string) => void; onAll: () => void }) {
  const urgent = data.tasks.filter((t) => daysUntil(t.nextDueAt) <= 14).sort((a, b) => a.nextDueAt.localeCompare(b.nextDueAt));
  const overdue = data.tasks.filter((t) => daysUntil(t.nextDueAt) < 0).length;
  const todayCount = data.tasks.filter((t) => daysUntil(t.nextDueAt) === 0).length;
  const soon = data.tasks.filter((t) => daysUntil(t.nextDueAt) > 0 && daysUntil(t.nextDueAt) <= 14).length;
  const okay = data.tasks.filter((t) => daysUntil(t.nextDueAt) > 14).length;
  return <div className="page home-page">
    <section className="hero-heading"><div><p className="eyebrow">{formatLong(today())}</p><h1>今日のお手入れ</h1><p className="subtitle">住まいを気持ちよく保つために、少しずつ。</p></div><div className="progress-ring" style={{ background: `conic-gradient(#4da67a 0 ${data.tasks.length ? (data.tasks.length - overdue) / data.tasks.length * 100 : 0}%, #e2e7e4 0)` }}><span>{data.tasks.length - overdue}</span><small>良好</small></div></section>
    <div className="status-grid">
      <StatusCard label="期限切れ" count={overdue} tone="red" icon={<Clock3 size={19} />} />
      <StatusCard label="今日" count={todayCount} tone="blue" icon={<CalendarDays size={19} />} />
      <StatusCard label="もうすぐ" count={soon} tone="amber" icon={<Sparkles size={19} />} />
      <StatusCard label="問題なし" count={okay} tone="green" icon={<CheckCircle2 size={19} />} />
    </div>
    <section className="section-block"><div className="section-title"><div><h2>優先するお手入れ</h2><p>{urgent.length}件のお手入れがあります</p></div><button className="text-button" onClick={onAll}>すべて見る <ChevronRight size={16} /></button></div>
      {urgent.length ? <div className="task-list">{urgent.map((task) => <TaskRow key={task.id} task={task} product={data.products.find((p) => p.id === task.productId)!} onComplete={onComplete} onOpenProduct={onOpenProduct} />)}</div> : <p className="list-empty">直近のお手入れはありません。製品画面から登録できます。</p>}
    </section>
    <section className="insight-card"><div className="insight-icon"><ShieldCheck size={23} /></div><div><span className="pill">おうちの状態</span><h3>今後14日のお手入れは{urgent.length}件</h3><p>こまめなお手入れが、製品を長く快適に使うことにつながります。</p></div></section>
  </div>;
}
function StatusCard({ label, count, tone, icon }: { label: string; count: number; tone: string; icon: React.ReactNode }) {
  return <div className={`status-card ${tone}`}><div className="status-top"><span className="status-icon">{icon}</span><span className="status-label">{label}</span></div><strong>{count}</strong><small>件</small></div>;
}
function TaskRow({ task, product, onComplete, onOpenProduct }: { task: MaintenanceTask; product: Product; onComplete: (id: string) => void; onOpenProduct: (id: string) => void }) {
  const days = daysUntil(task.nextDueAt); const state = days < 0 ? "overdue" : days === 0 ? "today" : "soon";
  return <article className="task-row"><button className="product-symbol" onClick={() => onOpenProduct(product.id)}>{categoryEmoji(product.categoryId)}</button><button className="task-copy" onClick={() => onOpenProduct(product.id)}><span className="product-name">{product.name}</span><strong>{task.name}</strong><span className={`due ${state}`}>{dueLabel(task.nextDueAt)}</span></button><button className="complete-button" onClick={() => onComplete(task.id)}><Check size={17} />完了</button></article>;
}

function TasksPage({ data, onComplete, onOpenProduct }: { data: AppData; onComplete: (id: string) => void; onOpenProduct: (id: string) => void }) {
  const [filter, setFilter] = useState("すべて");
  const sorted = data.tasks.filter((task) => {
    const days = daysUntil(task.nextDueAt);
    return filter === "すべて" || (filter === "期限切れ" && days < 0) ||
      (filter === "今月" && task.nextDueAt.slice(0, 7) === today().slice(0, 7)) ||
      (filter === "掃除" && task.kind === "掃除") || (filter === "交換" && task.kind === "交換");
  }).sort((a, b) => a.nextDueAt.localeCompare(b.nextDueAt));
  return <div className="page"><PageHeading title="やること" subtitle="次のお手入れを、予定日順にまとめています。" />
    <div className="filter-chips">{["すべて", "期限切れ", "今月", "掃除", "交換"].map((name) => <button key={name} className={filter === name ? "selected" : ""} onClick={() => setFilter(name)}>{name}</button>)}</div>
    {sorted.length ? <div className="task-list full-list">{sorted.map((task) => <TaskRow key={task.id} task={task} product={data.products.find((p) => p.id === task.productId)!} onComplete={onComplete} onOpenProduct={onOpenProduct} />)}</div> : <p className="list-empty">該当するお手入れはありません。</p>}
  </div>;
}
function ProductsPage({ data, onAdd, onOpenProduct }: { data: AppData; onAdd: () => void; onOpenProduct: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const filtered = data.products.filter((p) => [p.name, p.maker, p.modelNumber].some((value) => value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())));
  return <div className="page"><div className="heading-actions"><PageHeading title="製品" subtitle={`${data.homes[0].name}の製品を管理します。`} /><button className="primary-button" onClick={onAdd}><Plus size={18} />製品を追加</button></div>
    <label className="search-box"><Search size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="製品名・メーカー・品番で検索" /></label>
    {filtered.length ? <div className="product-grid">{filtered.map((product) => { const tasks = data.tasks.filter((t) => t.productId === product.id); const next = [...tasks].sort((a,b) => a.nextDueAt.localeCompare(b.nextDueAt))[0]; return <button className="product-card" key={product.id} onClick={() => onOpenProduct(product.id)}><div className="product-card-icon">{categoryEmoji(product.categoryId)}</div><div className="product-card-copy"><span>{product.maker}</span><h3>{product.name}</h3><p>{product.modelNumber}</p>{next && <div className="product-next"><Clock3 size={14} />次回：{next.name} ・ {dueLabel(next.nextDueAt)}</div>}</div><ChevronRight size={19} /></button>; })}</div> : <p className="list-empty">{query ? "検索に一致する製品はありません。" : "製品がありません。右上の追加ボタンから登録できます。"}</p>}
  </div>;
}

function ProductDetail({ productId, data, onBack, onComplete, onAddTask, onEditProduct, onEditTask, onDeleteProduct, onDeleteTask }: { onEditProduct: (p: Product) => void; onEditTask: (t: MaintenanceTask) => void; onDeleteProduct: (p: Product) => void; onDeleteTask: (t: MaintenanceTask) => void; productId: string; data: AppData; onBack: () => void; onComplete: (id: string) => void; onAddTask: () => void }) {
  const product = data.products.find((p) => p.id === productId)!; const tasks = data.tasks.filter((t) => t.productId === productId);
  return <div className="page"><button className="back-button" onClick={onBack}><ArrowLeft size={18} />製品一覧</button>
    <section className="product-hero"><div className="product-hero-icon">{categoryEmoji(product.categoryId)}</div><div><span>{product.maker}</span><h1>{product.name}</h1><p>{product.modelNumber}</p></div></section>
    <div className="modal-actions"><button className="secondary-button" onClick={() => onEditProduct(product)}>製品を編集</button><button className="text-button" onClick={() => onDeleteProduct(product)}>製品を削除</button></div><div className="detail-meta"><div><span>カテゴリ</span><strong>{categories.find((c) => c.id === product.categoryId)?.name}</strong></div><div><span>設置日</span><strong>{product.installedDate ? formatLong(product.installedDate) : "未設定"}</strong></div><div><span>登録場所</span><strong>{data.homes[0].name}</strong></div></div>
    <div className="section-title detail-title"><div><h2>この製品のお手入れ</h2><p>{tasks.length}件の項目を登録中</p></div><button className="secondary-button" onClick={onAddTask}><Plus size={17} />項目を追加</button></div>
    <div className="maintenance-cards">{tasks.map((task) => <article className="maintenance-card" key={task.id}><div className="maintenance-head"><div className="kind-icon"><Wrench size={19} /></div><div><span className="kind-label">{task.kind}</span><h3>{task.name}</h3></div><button className="complete-button" onClick={() => onComplete(task.id)}><Check size={17} />完了</button></div><div className="maintenance-details"><div><span>設定した周期</span><strong>{intervalLabel(task.intervalDays)}</strong></div><div><span>最終実施日</span><strong>{task.lastCompletedAt ? formatLong(task.lastCompletedAt) : "未実施"}</strong></div><div><span>次回予定日</span><strong className={daysUntil(task.nextDueAt) <= 0 ? "attention" : ""}>{formatLong(task.nextDueAt)}<small>{dueLabel(task.nextDueAt)}</small></strong></div></div><div className="modal-actions"><button className="secondary-button" onClick={() => onEditTask(task)}>項目を編集</button><button className="text-button" onClick={() => onDeleteTask(task)}>項目を削除</button></div>{task.sourceFrequency && <p className="field-hint">{task.sourceFrequency}</p>}{task.sourceNote && <p className="field-hint">{task.sourceNote}</p>}<div className="source-row"><Info size={14} /><span>情報源：</span><strong>{task.sourceKind}</strong>{task.sourceUrl?.startsWith("https://") && <a href={task.sourceUrl} target="_blank" rel="noreferrer">根拠を開く</a>}{task.id.startsWith("t-") && <em>デモデータ</em>}</div></article>)}</div>
    {tasks.length === 0 && <EmptyState icon={<Wrench />} title="お手入れ項目がありません" text="掃除や交換の周期を登録すると、予定日を一覧で確認できます。" action="項目を追加" onAction={onAddTask} />}
  </div>;
}

function HistoryPage({ data, onOpenProduct }: { data: AppData; onOpenProduct: (id: string) => void }) {
  const sorted = [...data.history].sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  return <div className="page"><PageHeading title="お手入れ履歴" subtitle="いつ、何をしたかを記録しています。" /><div className="history-card">{sorted.map((item, i) => { const product = data.products.find((p) => p.id === item.productId); const task = data.tasks.find((t) => t.id === item.taskId); if (!product || !task) return null; return <button key={item.id} className="history-row" onClick={() => onOpenProduct(product.id)}><div className="history-date"><strong>{formatShort(item.completedAt)}</strong><span>{i === 0 ? "最新" : "完了"}</span></div><span className="history-line" /><div className="history-check"><Check size={15} /></div><div className="history-copy"><span>{product.name}</span><strong>{task.name}</strong></div><ChevronRight size={18} /></button>; })}</div></div>;
}
function SettingsPage({ homeControls, backupData, data, onReset, onClear, cloud, busy, onRestore, onImport }: { homeControls: ReactNode; backupData: AppData; onImport: (data: AppData) => void; onRestore: (data: AppData) => void; cloud: boolean; busy: boolean; data: AppData; onReset: () => void; onClear: () => void }) {
  return <div className="page narrow"><PageHeading title="設定" subtitle="おうちメンテの使い方を整えます。" />{homeControls}<div className="settings-group"><h2>おうち</h2><p>{data.homes[0].name} ・ 製品 {data.products.length}件</p></div><div className="settings-group"><h2>データ管理</h2><p><Archive size={16} /> {cloud ? "記録はアカウント専用のクラウドに保存されます。別の端末はログイン・再読み込みすると最新の記録を確認できます。" : "記録はこの端末のブラウザ内に保存されます。機種変更や別のブラウザには自動で引き継がれません。ブラウザのデータ削除・プライベートブラウズの終了で失われるため、定期的にバックアップを保存してください。別のタブで記録が更新されると最新の内容を表示します。編集中のフォームは閉じるため、改めて内容を確認してください。"}</p></div><InstallControls /><PushControls cloud={cloud} /><CalendarControls data={data} />{cloud && data.homes[0].role === "owner" && <CloudImportControls busy={busy} onImport={onImport} />}<BackupControls data={backupData} cloud={cloud} busy={busy} onRestore={onRestore} /><CloudAccount disabled={busy} />{!cloud && <><button className="reset-button" onClick={onClear}>空の状態から始める</button><button className="reset-button" onClick={onReset}>デモデータを復元</button></>}<p><Link href="/about">おうちメンテについて・使い方</Link></p><p className="version">おうちメンテ v0.1.0 ・ MVP</p></div>;
}
function PageHeading({ title, subtitle }: { title: string; subtitle: string }) { return <div className="page-heading"><h1>{title}</h1><p>{subtitle}</p></div>; }

function ModalShell({ title, description, onClose, children }: { title: string; description?: string; onClose: () => void; children: React.ReactNode }) {
  const dialog = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const node = dialog.current;
    const selector = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]';
    const first = node?.querySelector<HTMLElement>(selector); first?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close.current(); }
      if (event.key !== "Tab" || !node) return;
      const focusable = [...node.querySelectorAll<HTMLElement>(selector)];
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    node?.addEventListener("keydown", keydown);
    const overflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { node?.removeEventListener("keydown", keydown); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><section ref={dialog} className="modal" role="dialog" aria-modal="true" aria-label={title}><div className="modal-header"><div><h2>{title}</h2>{description && <p>{description}</p>}</div><button aria-label="閉じる" onClick={onClose}><X size={20} /></button></div>{children}</section></div>;
}
type TaskChoice = { name: string; kind: MaintenanceKind; intervalDays: number; sourceKind?: SourceKind; sourceUrl?: string; frequency?: string; conditions?: string };
function ProductModal({ onClose, onSave, homeId, initial }: { initial?: Product; homeId: string; onClose: () => void; onSave: (p: Product, selected: TaskChoice[]) => void }) {
  const [form, setForm] = useState({ categoryId: initial?.categoryId ?? "aircon", maker: initial?.maker ?? "", name: initial?.name ?? "", modelNumber: initial?.modelNumber ?? "", purchaseDate: initial?.purchaseDate ?? "", installedDate: initial?.installedDate ?? "", memo: initial?.memo ?? "" });
  const [selected, setSelected] = useState<number[]>([]);
  const [lookup, setLookup] = useState(false);
  const [candidate, setCandidate] = useState<ProductCandidate | null>(null);
  const update = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (key === "maker") { setCandidate(null); setSelected([]); }
  };
  const valid = form.name.trim() && form.categoryId;
  const choices: TaskChoice[] = candidate?.suggestions ?? suggestions[form.categoryId] ?? [];
  if (lookup) return <LookupModal onClose={() => setLookup(false)} onSelect={(value) => { setCandidate(value); setSelected([]); setForm((f) => ({ ...f, maker: value.maker, name: value.name, categoryId: value.categoryId, modelNumber: value.modelNumber })); setLookup(false); }} />;
  return <ModalShell title={initial ? "製品を編集" : "製品を追加"} description="製品の基本情報を登録します。" onClose={onClose}><form onSubmit={(e) => { e.preventDefault(); if (valid) onSave({ id: initial?.id ?? crypto.randomUUID(), homeId, ...form, name: form.name.trim(), purchaseDate: String(new FormData(e.currentTarget).get("purchaseDate") ?? "") || undefined, installedDate: String(new FormData(e.currentTarget).get("installedDate") ?? "") || undefined }, selected.map((index) => choices[index])); }}>
    {!initial && <button type="button" className="lookup-button" onClick={() => setLookup(true)}><span><Sparkles size={19} /></span><div><strong>品番から自動で調べる</strong><small>確認済みの公式情報から候補を選択</small></div><ChevronRight size={18} /></button>}
    <div className="form-grid"><label><span>カテゴリ <em>必須</em></span><select value={form.categoryId} onChange={(e) => { update("categoryId", e.target.value); setSelected([]); setCandidate(null); }}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label><span>メーカー</span><input value={form.maker} onChange={(e) => update("maker", e.target.value)} placeholder="例：Panasonic" /></label><label className="wide"><span>製品名 <em>必須</em></span><input required value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="例：リビングのエアコン" /></label><label className="wide"><span>品番</span><input value={form.modelNumber} onChange={(e) => { update("modelNumber", e.target.value); setCandidate(null); setSelected([]); }} placeholder="例：ABC-1234" /></label><label><span>購入日</span><input type="date" name="purchaseDate" defaultValue={form.purchaseDate} /></label><label><span>設置日</span><input type="date" name="installedDate" defaultValue={form.installedDate} /></label><label className="wide"><span>メモ</span><textarea value={form.memo} onChange={(e) => update("memo", e.target.value)} placeholder="設置場所や保証についてのメモ" /></label></div>
    {!initial && !candidate && <p role="status" className="field-hint">この製品の公式周期は未確認です。候補は一般的な目安です。説明書で確認するか、登録後に「項目を追加」から手入力してください。品番は空欄でも登録できます。</p>}
    {!initial && choices.length > 0 && <fieldset className="suggestions"><legend>お手入れ候補（任意）</legend><p>{candidate ? "品番が一致する公式情報を確認して選んでください。予定の周期は必要に応じて見直してください。" : "一般的な目安です。製品の取扱説明書を確認して選んでください。"}</p>{choices.map((item, index) => <label key={item.name}><input type="checkbox" checked={selected.includes(index)} onChange={(e) => setSelected((current) => e.target.checked ? [...current, index] : current.filter((i) => i !== index))} /><span>{item.name} ・ {item.frequency ?? `約${intervalLabel(item.intervalDays)}`}{item.conditions && <small className="field-hint">{item.conditions}</small>}</span></label>)}</fieldset>}
    {candidate && <p className="field-hint"><a href={candidate.manualUrl} target="_blank" rel="noreferrer">取扱説明書</a> ・ <a href={candidate.suggestions[0]?.sourceUrl ?? candidate.productUrl} target="_blank" rel="noreferrer">メーカー公式の根拠</a>（確認日：{candidate.verifiedAt}）</p>}<div className="modal-actions"><button type="button" className="cancel-button" onClick={onClose}>キャンセル</button><button className="primary-button" disabled={!valid}>{initial ? "変更を保存" : "製品を追加"}</button></div></form></ModalShell>;
}
function TaskModal({ productId, onClose, onSave, initial }: { initial?: MaintenanceTask; productId: string; onClose: () => void; onSave: (t: MaintenanceTask) => void }) {
  const [name, setName] = useState(initial?.name ?? ""); const [kind, setKind] = useState<MaintenanceKind>(initial?.kind ?? "掃除"); const [interval, setInterval] = useState(initial?.intervalDays ?? 30); const [source, setSource] = useState<SourceKind>(initial?.sourceKind ?? "ユーザー設定");
  const [sourceUrl, setSourceUrl] = useState(initial?.sourceUrl ?? "");
  const needsUrl = ["メーカー公式", "取扱説明書", "公的情報"].includes(source);
  const valid = name.trim() && Number.isInteger(interval) && interval >= 1 && interval <= 3650 && (!needsUrl || /^https:\/\//.test(sourceUrl));
  return <ModalShell title={initial ? "お手入れ項目を編集" : "お手入れ項目を追加"} description="周期を設定すると、次の予定日を自動計算します。" onClose={onClose}><form onSubmit={(e) => { e.preventDefault(); if (valid) onSave({ ...initial, id: initial?.id ?? crypto.randomUUID(), productId, name: name.trim(), kind, intervalDays: interval, nextDueAt: initial ? String(new FormData(e.currentTarget).get("nextDueAt") ?? initial.nextDueAt) : addDays(today(), interval), sourceKind: source, sourceUrl: sourceUrl || undefined }); }}><div className="form-grid"><label className="wide"><span>メンテナンス名 <em>必須</em></span><input required value={name} onChange={(e) => setName(e.target.value)} placeholder="例：フィルター掃除" /></label><label><span>種類</span><select value={kind} onChange={(e) => setKind(e.target.value as MaintenanceKind)}>{["掃除", "交換", "点検", "補充"].map((v) => <option key={v}>{v}</option>)}</select></label><label><span>周期（日）</span><input type="number" min="1" max="3650" required value={interval} onChange={(e) => setInterval(Number(e.target.value))} /></label>{initial && <label className="wide"><span>次回予定日</span><input type="date" name="nextDueAt" required defaultValue={initial.nextDueAt} /><small>周期を変更しても次回予定日は自動で変更されません。必要に応じて指定してください。</small></label>}<label className="wide"><span>情報源</span><select value={source} onChange={(e) => setSource(e.target.value as SourceKind)}>{["メーカー公式", "取扱説明書", "公的情報", "一般的な目安", "ユーザー設定"].map((v) => <option key={v}>{v}</option>)}</select><small className="field-hint">確認できた情報源を正確に選んでください。</small></label><label className="wide"><span>情報源URL{needsUrl ? "（必須）" : "（任意）"}</span><input type="url" required={needsUrl} value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://…" /></label></div><div className="modal-actions"><button type="button" className="cancel-button" onClick={onClose}>キャンセル</button><button className="primary-button" disabled={!valid}>{initial ? "変更を保存" : "項目を追加"}</button></div></form></ModalShell>;
}
function LookupModal({ onClose, onSelect }: { onClose: () => void; onSelect: (candidate: ProductCandidate) => void }) {
  const [model, setModel] = useState("");
  const [results, setResults] = useState<ProductCandidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  return <ModalShell title="品番から調べる" description={`SHARP・Panasonicの空気清浄機を公式情報から照合します。すぐにお手入れを提案できる品番：${supportedModels.join("、")}`} onClose={onClose}><form onSubmit={async (e) => { e.preventDefault(); if(searching)return; setSearching(true);setSearchError("");setResults(null);try{const known=lookupModel(model);if(known.length){setResults(known);return;}const response=await fetch(`/api/product-lookup?model=${encodeURIComponent(model)}`);const body=await response.json();if(!response.ok)throw new Error();setResults(body.candidates);}catch{setSearchError("公式情報を取得できませんでした。通信状態を確認し、もう一度お試しください。");}finally{setSearching(false);} }} className="form-grid"><label className="wide"><span>品番</span><input required disabled={searching} value={model} onChange={(e) => { setModel(e.target.value); setResults(null); }} placeholder="例：KI-RX75" /></label><button className="primary-button" disabled={searching}>{searching ? "公式情報を確認中…" : "候補を探す"}</button></form>{searchError && <p role="alert">{searchError}</p>}{results?.length === 0 && <div><p role="status">確認済みの候補がありません。メーカーの公式サイトで品番と説明書を確認してください。検索結果からの自動登録には未対応です。</p>{officialSearchLinks(model).map(link => <p key={link.maker}><a href={link.url} target="_blank" rel="noreferrer">{link.maker}の公式情報を検索</a></p>)}</div>}{results?.map((value) => <div className="settings-group" key={value.modelNumber}><h3>{value.maker} {value.modelNumber}</h3><p>{value.name}</p>{value.lookupNote && <p>{value.lookupNote}</p>}<a href={value.productUrl} target="_blank" rel="noreferrer">{value.productLinkLabel ?? (value.lookupNote ? "公式説明書一覧" : "公式製品ページ")}</a> ・ <a href={value.manualUrl} target="_blank" rel="noreferrer">{value.manualLinkLabel ?? (value.lookupNote ? "品番別の説明書を探す" : "取扱説明書")}</a><p>本体の品番と一致することを確認してください。</p><button className="primary-button" onClick={() => onSelect(value)}>この製品を選ぶ</button></div>)}<ManualLookupControls key={`${model}:${results?.[0]?.discoveredManualUrl ?? ""}`} model={model} initialUrl={results?.[0]?.discoveredManualUrl} onSelect={onSelect} /><button className="text-button" onClick={onClose}>手入力に戻る</button></ModalShell>;
}
function EmptyState({ icon, title, text, action, onAction }: { icon: React.ReactNode; title: string; text: string; action: string; onAction: () => void }) { return <div className="empty-state"><span>{icon}</span><h3>{title}</h3><p>{text}</p><button className="primary-button" onClick={onAction}>{action}</button></div>; }

function categoryEmoji(id: string) { return ({ aircon: "❄", washer: "◉", ecocute: "♨", "air-purifier": "✦", "pest-control": "◇" } as Record<string,string>)[id] ?? "⌂"; }
function intervalLabel(days: number) { if (days % 365 === 0) return `${days / 365}年ごと`; if (days % 30 === 0) return `${days / 30}か月ごと`; if (days % 7 === 0) return `${days / 7}週間ごと`; return `${days}日ごと`; }
