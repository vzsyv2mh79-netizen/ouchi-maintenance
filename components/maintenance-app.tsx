"use client";

import { useEffect, useState } from "react";
import {
  Archive, ArrowLeft, CalendarDays, Check, CheckCircle2, ChevronRight,
  ClipboardCheck, Clock3, History, Home, House, Info, LayoutGrid,
  Plus, Search, Settings, ShieldCheck, Sparkles, Wrench, X,
} from "lucide-react";
import { categories } from "@/lib/catalog";
import { addDays, daysUntil, dueLabel, formatLong, formatShort, today } from "@/lib/date";
import { seedData } from "@/lib/seed";
import { suggestions } from "@/lib/suggestions";
import type { AppData, MaintenanceKind, MaintenanceTask, Product, SourceKind } from "@/lib/types";

type Tab = "home" | "tasks" | "products" | "history" | "settings";
const storageKey = "ouchi-maintenance-v1";
const navItems = [
  { id: "home", label: "ホーム", icon: Home }, { id: "tasks", label: "やること", icon: ClipboardCheck },
  { id: "products", label: "製品", icon: LayoutGrid }, { id: "history", label: "履歴", icon: History },
  { id: "settings", label: "設定", icon: Settings },
] as const;

export function MaintenanceApp() {
  const [data, setData] = useState<AppData>(seedData);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>("home");
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [modal, setModal] = useState<"product" | "task" | "lookup" | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try { setData(JSON.parse(saved) as AppData); } catch { localStorage.removeItem(storageKey); }
    }
    setReady(true);
  }, []);
  useEffect(() => { if (ready) localStorage.setItem(storageKey, JSON.stringify(data)); }, [data, ready]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 2800); return () => clearTimeout(timer); }, [toast]);

  const completeTask = (taskId: string) => {
    const task = data.tasks.find((item) => item.id === taskId);
    if (!task) return;
    const completedAt = today();
    setData((current) => ({
      ...current,
      tasks: current.tasks.map((item) => item.id === taskId ? { ...item, lastCompletedAt: completedAt, nextDueAt: addDays(completedAt, item.intervalDays) } : item),
      history: [{ id: crypto.randomUUID(), taskId, productId: task.productId, completedAt }, ...current.history],
    }));
    setToast(`「${task.name}」を完了しました`);
  };
  const openProduct = (id: string) => { setSelectedProduct(id); setTab("products"); };
  const addProduct = (product: Product, selected: number[]) => {
    const tasks: MaintenanceTask[] = selected.map((index) => {
      const suggestion = suggestions[product.categoryId][index];
      return { id: crypto.randomUUID(), productId: product.id, ...suggestion, nextDueAt: addDays(today(), suggestion.intervalDays), sourceKind: "一般的な目安" };
    });
    setData((d) => ({ ...d, products: [...d.products, product], tasks: [...d.tasks, ...tasks] }));
    setSelectedProduct(product.id); setModal(null); setToast("製品を追加しました");
  };
  const addTask = (task: MaintenanceTask) => { setData((d) => ({ ...d, tasks: [...d.tasks, task] })); setModal(null); setToast("お手入れ項目を追加しました"); };

  const page = selectedProduct && tab === "products"
    ? <ProductDetail productId={selectedProduct} data={data} onBack={() => setSelectedProduct(null)} onComplete={completeTask} onAddTask={() => setModal("task")} />
    : tab === "home" ? <HomePage data={data} onComplete={completeTask} onOpenProduct={openProduct} onAll={() => setTab("tasks")} />
    : tab === "tasks" ? <TasksPage data={data} onComplete={completeTask} onOpenProduct={openProduct} />
    : tab === "products" ? <ProductsPage data={data} onAdd={() => setModal("product")} onOpenProduct={openProduct} />
    : tab === "history" ? <HistoryPage data={data} onOpenProduct={openProduct} />
    : <SettingsPage data={data} onReset={() => { if (window.confirm("現在の製品・履歴をすべて消してデモデータに戻しますか？")) { setData(seedData); setToast("デモデータを復元しました"); } }} onClear={() => { if (window.confirm("現在の製品・履歴をすべて消して、空の状態から始めますか？")) { setData({ ...seedData, products: [], tasks: [], history: [] }); setToast("空の状態にしました"); } }} />;

  return (
    <div className="app-shell">
      <Sidebar active={tab} onChange={(next) => { setTab(next); setSelectedProduct(null); }} />
      <div className="app-main">
        <Topbar data={data} />
        <main className="page-container">{page}</main>
      </div>
      <BottomNav active={tab} onChange={(next) => { setTab(next); setSelectedProduct(null); }} />
      {modal === "product" && <ProductModal onClose={() => setModal(null)} onSave={addProduct} onLookup={() => setModal("lookup")} />}
      {modal === "task" && selectedProduct && <TaskModal productId={selectedProduct} onClose={() => setModal(null)} onSave={addTask} />}
      {modal === "lookup" && <LookupModal onClose={() => setModal("product")} />}
      {toast && <div className="toast"><span className="toast-check"><Check size={16} /></span>{toast}</div>}
    </div>
  );
}

function Topbar({ data }: { data: AppData }) {
  return <header className="topbar"><div className="mobile-brand"><Logo />おうちメンテ</div><span className="home-switch"><House size={16} />{data.homes[0].name}</span></header>;
}
function Logo() { return <span className="logo-mark"><House size={17} strokeWidth={2.3} /></span>; }
function Sidebar({ active, onChange }: { active: Tab; onChange: (tab: Tab) => void }) {
  return <aside className="sidebar"><div className="brand"><Logo /><span>おうちメンテ</span></div><nav>{navItems.map(({ id, label, icon: Icon }) => <button key={id} className={active === id ? "active" : ""} onClick={() => onChange(id)}><Icon size={20} /><span>{label}</span></button>)}</nav><div className="sidebar-foot"><div><strong>この端末に保存中</strong></div></div></aside>;
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
    <section className="hero-heading"><div><p className="eyebrow">{formatLong(today())}</p><h1>今日のお手入れ</h1><p className="subtitle">住まいを気持ちよく保つために、少しずつ。</p></div><div className="progress-ring"><span>{data.tasks.length - overdue}</span><small>良好</small></div></section>
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

function ProductDetail({ productId, data, onBack, onComplete, onAddTask }: { productId: string; data: AppData; onBack: () => void; onComplete: (id: string) => void; onAddTask: () => void }) {
  const product = data.products.find((p) => p.id === productId)!; const tasks = data.tasks.filter((t) => t.productId === productId);
  return <div className="page"><button className="back-button" onClick={onBack}><ArrowLeft size={18} />製品一覧</button>
    <section className="product-hero"><div className="product-hero-icon">{categoryEmoji(product.categoryId)}</div><div><span>{product.maker}</span><h1>{product.name}</h1><p>{product.modelNumber}</p></div></section>
    <div className="detail-meta"><div><span>カテゴリ</span><strong>{categories.find((c) => c.id === product.categoryId)?.name}</strong></div><div><span>設置日</span><strong>{product.installedDate ? formatLong(product.installedDate) : "未設定"}</strong></div><div><span>登録場所</span><strong>わが家</strong></div></div>
    <div className="section-title detail-title"><div><h2>この製品のお手入れ</h2><p>{tasks.length}件の項目を登録中</p></div><button className="secondary-button" onClick={onAddTask}><Plus size={17} />項目を追加</button></div>
    <div className="maintenance-cards">{tasks.map((task) => <article className="maintenance-card" key={task.id}><div className="maintenance-head"><div className="kind-icon"><Wrench size={19} /></div><div><span className="kind-label">{task.kind}</span><h3>{task.name}</h3></div><button className="complete-button" onClick={() => onComplete(task.id)}><Check size={17} />完了</button></div><div className="maintenance-details"><div><span>設定した周期</span><strong>{intervalLabel(task.intervalDays)}</strong></div><div><span>最終実施日</span><strong>{task.lastCompletedAt ? formatLong(task.lastCompletedAt) : "未実施"}</strong></div><div><span>次回予定日</span><strong className={daysUntil(task.nextDueAt) <= 0 ? "attention" : ""}>{formatLong(task.nextDueAt)}<small>{dueLabel(task.nextDueAt)}</small></strong></div></div><div className="source-row"><Info size={14} /><span>情報源：</span><strong>{task.sourceKind}</strong>{task.id.startsWith("t-") && <em>デモデータ</em>}</div></article>)}</div>
    {tasks.length === 0 && <EmptyState icon={<Wrench />} title="お手入れ項目がありません" text="掃除や交換の周期を登録すると、予定日を一覧で確認できます。" action="項目を追加" onAction={onAddTask} />}
  </div>;
}

function HistoryPage({ data, onOpenProduct }: { data: AppData; onOpenProduct: (id: string) => void }) {
  const sorted = [...data.history].sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  return <div className="page"><PageHeading title="お手入れ履歴" subtitle="いつ、何をしたかを記録しています。" /><div className="history-card">{sorted.map((item, i) => { const product = data.products.find((p) => p.id === item.productId); const task = data.tasks.find((t) => t.id === item.taskId); if (!product || !task) return null; return <button key={item.id} className="history-row" onClick={() => onOpenProduct(product.id)}><div className="history-date"><strong>{formatShort(item.completedAt)}</strong><span>{i === 0 ? "最新" : "完了"}</span></div><span className="history-line" /><div className="history-check"><Check size={15} /></div><div className="history-copy"><span>{product.name}</span><strong>{task.name}</strong></div><ChevronRight size={18} /></button>; })}</div></div>;
}
function SettingsPage({ data, onReset, onClear }: { data: AppData; onReset: () => void; onClear: () => void }) {
  return <div className="page narrow"><PageHeading title="設定" subtitle="おうちメンテの使い方を整えます。" /><div className="settings-group"><h2>おうち</h2><p>{data.homes[0].name} ・ 製品 {data.products.length}件</p></div><div className="settings-group"><h2>データ管理</h2><p><Archive size={16} /> 記録はこの端末のブラウザ内に保存されます。別の端末との同期や自動通知にはまだ対応していません。</p></div><button className="reset-button" onClick={onClear}>空の状態から始める</button><button className="reset-button" onClick={onReset}>デモデータを復元</button><p className="version">おうちメンテ v0.1.0 ・ MVP</p></div>;
}
function PageHeading({ title, subtitle }: { title: string; subtitle: string }) { return <div className="page-heading"><h1>{title}</h1><p>{subtitle}</p></div>; }

function ModalShell({ title, description, onClose, children }: { title: string; description?: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><section className="modal"><div className="modal-header"><div><h2>{title}</h2>{description && <p>{description}</p>}</div><button onClick={onClose}><X size={20} /></button></div>{children}</section></div>;
}
function ProductModal({ onClose, onSave, onLookup }: { onClose: () => void; onSave: (p: Product, selected: number[]) => void; onLookup: () => void }) {
  const [form, setForm] = useState({ categoryId: "aircon", maker: "", name: "", modelNumber: "", purchaseDate: "", installedDate: "", memo: "" });
  const [selected, setSelected] = useState<number[]>([]);
  const update = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));
  const valid = form.name.trim() && form.categoryId;
  const choices = suggestions[form.categoryId] ?? [];
  return <ModalShell title="製品を追加" description="製品の基本情報を登録します。" onClose={onClose}><form onSubmit={(e) => { e.preventDefault(); if (valid) onSave({ id: crypto.randomUUID(), homeId: "home-1", ...form }, selected); }}>
    <button type="button" className="lookup-button" onClick={onLookup}><span><Sparkles size={19} /></span><div><strong>品番から自動で調べる</strong><small>メーカー情報やお手入れ方法を自動入力</small></div><span className="coming-soon">近日対応</span><ChevronRight size={18} /></button>
    <div className="form-grid"><label><span>カテゴリ <em>必須</em></span><select value={form.categoryId} onChange={(e) => { update("categoryId", e.target.value); setSelected([]); }}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label><span>メーカー</span><input value={form.maker} onChange={(e) => update("maker", e.target.value)} placeholder="例：Panasonic" /></label><label className="wide"><span>製品名 <em>必須</em></span><input required value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="例：リビングのエアコン" /></label><label className="wide"><span>品番</span><input value={form.modelNumber} onChange={(e) => update("modelNumber", e.target.value)} placeholder="例：ABC-1234" /></label><label><span>購入日</span><input type="date" value={form.purchaseDate} onChange={(e) => update("purchaseDate", e.target.value)} /></label><label><span>設置日</span><input type="date" value={form.installedDate} onChange={(e) => update("installedDate", e.target.value)} /></label><label className="wide"><span>メモ</span><textarea value={form.memo} onChange={(e) => update("memo", e.target.value)} placeholder="設置場所や保証についてのメモ" /></label></div>
    {choices.length > 0 && <fieldset className="suggestions"><legend>お手入れ候補（任意）</legend><p>一般的な目安です。製品の取扱説明書を確認して選んでください。</p>{choices.map((item, index) => <label key={item.name}><input type="checkbox" checked={selected.includes(index)} onChange={(e) => setSelected((current) => e.target.checked ? [...current, index] : current.filter((i) => i !== index))} /><span>{item.name} ・ 約{intervalLabel(item.intervalDays)}</span></label>)}</fieldset>}
    <div className="modal-actions"><button type="button" className="cancel-button" onClick={onClose}>キャンセル</button><button className="primary-button" disabled={!valid}>製品を追加</button></div></form></ModalShell>;
}
function TaskModal({ productId, onClose, onSave }: { productId: string; onClose: () => void; onSave: (t: MaintenanceTask) => void }) {
  const [name, setName] = useState(""); const [kind, setKind] = useState<MaintenanceKind>("掃除"); const [interval, setInterval] = useState(30); const [source, setSource] = useState<SourceKind>("ユーザー設定");
  return <ModalShell title="お手入れ項目を追加" description="周期を設定すると、次の予定日を自動計算します。" onClose={onClose}><form onSubmit={(e) => { e.preventDefault(); if (name) onSave({ id: crypto.randomUUID(), productId, name, kind, intervalDays: interval, nextDueAt: addDays(today(), interval), sourceKind: source }); }}><div className="form-grid"><label className="wide"><span>メンテナンス名 <em>必須</em></span><input required value={name} onChange={(e) => setName(e.target.value)} placeholder="例：フィルター掃除" /></label><label><span>種類</span><select value={kind} onChange={(e) => setKind(e.target.value as MaintenanceKind)}>{["掃除", "交換", "点検", "補充"].map((v) => <option key={v}>{v}</option>)}</select></label><label><span>周期（日）</span><input type="number" min="1" max="3650" value={interval} onChange={(e) => setInterval(Number(e.target.value))} /></label><label className="wide"><span>情報源</span><select value={source} onChange={(e) => setSource(e.target.value as SourceKind)}>{["メーカー公式", "取扱説明書", "公的情報", "一般的な目安", "ユーザー設定"].map((v) => <option key={v}>{v}</option>)}</select><small className="field-hint">確認できた情報源を正確に選んでください。</small></label></div><div className="modal-actions"><button type="button" className="cancel-button" onClick={onClose}>キャンセル</button><button className="primary-button" disabled={!name}>項目を追加</button></div></form></ModalShell>;
}
function LookupModal({ onClose }: { onClose: () => void }) { return <ModalShell title="品番から自動で調べる" onClose={onClose}><div className="future-feature"><div><Sparkles size={28} /></div><h3>ただいま準備中です</h3><p>メーカー公式サイトや取扱説明書から、信頼できるお手入れ情報を自動で探す機能を開発しています。</p><button className="primary-button" onClick={onClose}>製品情報を手入力する</button></div></ModalShell>; }
function EmptyState({ icon, title, text, action, onAction }: { icon: React.ReactNode; title: string; text: string; action: string; onAction: () => void }) { return <div className="empty-state"><span>{icon}</span><h3>{title}</h3><p>{text}</p><button className="primary-button" onClick={onAction}>{action}</button></div>; }

function categoryEmoji(id: string) { return ({ aircon: "❄", washer: "◉", ecocute: "♨", "air-purifier": "✦", "pest-control": "◇" } as Record<string,string>)[id] ?? "⌂"; }
function intervalLabel(days: number) { if (days % 365 === 0) return `${days / 365}年ごと`; if (days % 30 === 0) return `${days / 30}か月ごと`; if (days % 7 === 0) return `${days / 7}週間ごと`; return `${days}日ごと`; }
