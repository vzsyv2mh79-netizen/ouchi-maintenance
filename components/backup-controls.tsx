"use client";
import { useState } from "react";
import { decodeBackup, encodeBackup, MAX_BACKUP_BYTES } from "@/lib/backup";
import type { AppData } from "@/lib/types";

export function BackupControls({ data, cloud, busy, onRestore }: { data: AppData; cloud: boolean; busy: boolean; onRestore: (data: AppData) => void }) {
  const [pending, setPending] = useState<AppData | null>(null);
  const [error, setError] = useState("");
  return <section className="settings-group"><h2>バックアップ</h2><p>製品・お手入れ・履歴をファイルに保存できます。ファイルには記録が含まれるため、大切に保管してください。</p>
    <button className="secondary-button" disabled={busy} onClick={() => {
      try {
        const url = URL.createObjectURL(new Blob([encodeBackup(data)], { type: "application/json" }));
        const link = document.createElement("a"); link.href = url; link.download = `ouchi-maintenance-${new Date().toISOString().slice(0, 10)}.json`; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); setError("");
      } catch (cause) { setError(cause instanceof Error ? `バックアップを作成できませんでした。${cause.message}` : "バックアップを作成できませんでした。"); }
    }}>バックアップを保存</button>
    {!cloud && <><label className="wide"><span>バックアップから復元</span><input type="file" accept=".json,application/json" disabled={busy} onChange={async (event) => {
      const file = event.target.files?.[0]; event.target.value = ""; setPending(null); setError("");
      if (!file) return;
      try { if (file.size > MAX_BACKUP_BYTES) throw new Error(); setPending(decodeBackup(await file.text())); }
      catch { setError("このファイルは復元できません。おうちメンテの正しいバックアップ（10MB以内）を選んでください。"); }
    }} /></label>{pending && <div role="status"><p>製品 {pending.products.length}件・お手入れ {pending.tasks.length}件・履歴 {pending.history.length}件。現在の端末内の記録を置き換えます。</p><button className="primary-button" disabled={busy} onClick={() => { if (window.confirm("現在の端末内の記録を、このバックアップで置き換えますか？")) { onRestore(pending); setPending(null); } }}>この記録で復元</button><button className="text-button" onClick={() => setPending(null)}>キャンセル</button></div>}</>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
