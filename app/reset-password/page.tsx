"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const client = getSupabase();
  useEffect(() => {
    if (!client) return;
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session) setReady(true);
      if (event === "SIGNED_OUT") setReady(false);
    });
    return () => subscription.unsubscribe();
  }, [client]);
  return <main className="account-page"><h1>パスワードの再設定</h1>
    {!client ? <p>クラウド保存は準備中です。</p> : done ? <p role="status">パスワードを変更しました。新しいパスワードでログインしてください。</p> : !ready ? <p role="status">再設定メールのリンクからこの画面を開いてください。期限が切れている場合は、設定画面から再度メールを送信してください。</p> :
      <form className="form-grid" onSubmit={async (event) => {
        event.preventDefault(); if (busy || password.length < 8 || password !== confirm) return;
        setBusy(true); setMessage("");
        try {
          const { error } = await client.auth.updateUser({ password });
          if (error) throw error;
          setPassword(""); setConfirm(""); setDone(true);
          const { error: logoutError } = await client.auth.signOut({ scope: "global" });
          if (logoutError) setMessage("変更は保存されましたが、他の端末からのログアウトを確認できませんでした。設定から再度ログアウトしてください。");
        } catch { setMessage("変更できませんでした。通信状態を確認し、必要に応じて再設定メールを送り直してください。"); }
        finally { setBusy(false); }
      }}>
        <label className="wide"><span>新しいパスワード（8文字以上）</span><input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <label className="wide"><span>新しいパスワードをもう一度</span><input type="password" autoComplete="new-password" minLength={8} required value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>
        {confirm && password !== confirm && <p role="status">パスワードが一致していません。</p>}
        <button className="primary-button" disabled={busy || password.length < 8 || password !== confirm}>{busy ? "保存中…" : "パスワードを変更"}</button>
      </form>}
    {message && <p role="status">{message}</p>}<p><Link href="/">おうちメンテに戻る</Link></p>
  </main>;
}
