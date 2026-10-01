"use client";
import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";

export function CloudAccount({ disabled }: { disabled: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [signup, setSignup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const client = getSupabase();
  useEffect(() => {
    if (!client) return;
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user.email ?? null);
    });
    return () => subscription.unsubscribe();
  }, [client]);
  if (!client) return <p className="field-hint">クラウド保存は準備中です。現在の記録はこの端末に保存されます。</p>;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const result = signup
        ? await client.auth.signUp({ email, password })
        : await client.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      setPassword("");
      if (signup && !result.data.session) setMessage("確認メールを開いてから、ログインしてください。");
    } catch { setMessage("手続きを完了できませんでした。メール・パスワードと通信状態を確認してください。"); }
    finally { setBusy(false); }
  };
  return <section className="settings-group"><h2>クラウド保存</h2>{userEmail ? <><p>{userEmail}</p><button className="secondary-button" disabled={busy || disabled} onClick={async () => { setBusy(true); const { error } = await client.auth.signOut(); if (error) setMessage("ログアウトできませんでした。再度お試しください。"); setBusy(false); }}>ログアウト</button></> : <><p>ログインすると、同じアカウントの端末で記録を共有できます。端末内の記録は残り、クラウドの記録とは自動で合体しません。</p><form onSubmit={submit} className="form-grid"><label className="wide"><span>メールアドレス</span><input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label><label className="wide"><span>パスワード（8文字以上）</span><input type="password" minLength={8} required autoComplete={signup ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} /></label><button className="primary-button" disabled={busy || disabled}>{busy ? "処理中…" : signup ? "アカウントを作成" : "ログイン"}</button><button className="text-button" type="button" disabled={busy || disabled} onClick={() => setSignup(!signup)}>{signup ? "ログインに戻る" : "はじめての方"}</button></form></>}{message && <p role="status">{message}</p>}</section>;
}
