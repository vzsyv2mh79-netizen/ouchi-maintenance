"use client";
import { useState } from "react";
import { selectHome } from "@/lib/homes";
import { validateData } from "@/lib/backup";
import type { AppData } from "@/lib/types";

export function CloudImportControls({ busy, onImport }: { busy: boolean; onImport: (data: AppData) => void }) {
  const [pending, setPending] = useState<AppData | null>(null);
  const [sourceHomeId, setSourceHomeId] = useState("");
  const selected = pending ? selectHome(pending, sourceHomeId) : null;
  const [message, setMessage] = useState("");
  return <section className="settings-group"><h2>この端末の記録を移行</h2><p>端末に保存した製品・お手入れ・履歴を、現在のクラウドの住まいに追加します。端末の記録は残ります。</p>
    <button className="secondary-button" disabled={busy} onClick={() => {
      try {
        const raw = localStorage.getItem("ouchi-maintenance-v1");
        if (!raw) { setMessage("この端末には保存済みの記録がありません。"); setPending(null); return; }
        const data = validateData(JSON.parse(raw));
        setSourceHomeId(data.homes[0].id);
        setPending(data); setMessage("");
      } catch { setMessage("端末の記録を読み込めませんでした。元のデータは変更していません。"); }
    }}>移行する記録を確認</button>
    {pending && selected && <div><label>移行元の住まい<select value={sourceHomeId} onChange={event => setSourceHomeId(event.target.value)}>{pending.homes.map(home => <option key={home.id} value={home.id}>{home.name}</option>)}</select></label><p>製品 {selected.products.length}件・お手入れ {selected.tasks.length}件・履歴 {selected.history.length}件。デモ記録が含まれていないか確認してください。同じ記録の再送は重複しませんが、端末側を変更して再度移行すると別の記録として追加されます。</p><button className="primary-button" disabled={busy || !selected.products.length} onClick={() => {
      if (window.confirm("この端末の記録を現在のクラウドの住まいに追加しますか？クラウドの既存記録は残ります。")) { onImport(selected); setPending(null); }
    }}>クラウドに追加</button><button className="text-button" onClick={() => setPending(null)}>キャンセル</button></div>}
    {message && <p role="status">{message}</p>}
  </section>;
}
