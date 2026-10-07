"use client";
import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";

export function CloudAccount({ disabled }: { disabled: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [reset, setReset] = useState(false);
  const [signup, setSignup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [eraseOpen, setEraseOpen] = useState(false);
  const [eraseText, setEraseText] = useState("");
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
      if (reset) {
        const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
        if (error) throw error;
        setMessage("登録済みのメールアドレスの場合、再設定メールが届きます。迷惑メールフォルダも確認してください。");
        return;
      }
      const result = signup
        ? await client.auth.signUp({ email, password })
        : await client.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      setPassword("");
      if (signup && !result.data.session) setMessage("確認メールを開いてから、ログインしてください。届かない場合は迷惑メールフォルダも確認し、見つかったメールを「迷惑メールではない」にしてください。");
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
      const messages: Record<string, string> = {
        email_address_not_authorized: "このメールアドレスへの送信は現在制限されています。運営側のメール送信設定が必要です。",
        over_email_send_rate_limit: "メール送信の上限に達しました。時間をおいて再度お試しください。",
        over_request_rate_limit: "操作が集中しています。数分おいて再度お試しください。",
        email_not_confirmed: "確認メールのリンクを開いてから、ログインしてください。",
      };
      setMessage(typeof code === "string" && messages[code] ? messages[code] : "手続きを完了できませんでした。メール・パスワードと通信状態を確認してください。");
    }
    finally { setBusy(false); }
  };
  return <section className="settings-group"><h2>クラウド保存</h2>{userEmail ? <><p>{userEmail}</p><button className="secondary-button" disabled={busy || disabled} onClick={async () => { setBusy(true); const { error } = await client.auth.signOut(); if (error) setMessage("ログアウトできませんでした。再度お試しください。"); setBusy(false); }}>ログアウト</button><button className="text-button" disabled={busy || disabled} onClick={() => setEraseOpen(!eraseOpen)}>このアプリのクラウド記録を削除</button>{eraseOpen && <div><p>所有するすべての住まい・製品・お手入れ・履歴を削除し、参加中の家族共有から退出します。あなたが所有する住まいの記録は、参加家族も使えなくなります。元に戻せません。必要な記録は先にバックアップしてください。</p><p>他のアプリでも使う可能性があるログインアカウントと、端末内の記録は残ります。</p><label><span>確認のため「削除」と入力</span><input value={eraseText} onChange={event => setEraseText(event.target.value)} autoComplete="off" /></label><button className="secondary-button" disabled={busy || disabled || eraseText !== "削除"} onClick={async () => {
          if (!window.confirm("おうちメンテのクラウド記録をすべて削除しますか？元に戻せません。")) return;
          setBusy(true); setMessage("");
          try {
            const { error } = await client.rpc("erase_maintenance_data");
            if (error) throw error;
            setEraseOpen(false); setEraseText("");
            const { error: signOutError } = await client.auth.signOut({ scope: "local" });
            if (signOutError) setMessage("記録は削除しましたがログアウトできませんでした。ログアウトを再実行してください。");
            else setMessage("このアプリのクラウド記録を削除しました。");
          } catch { setMessage("削除を完了できませんでした。通信状態を確認してください。"); }
          finally { setBusy(false); }
        }}>クラウド記録を永久に削除</button><button className="text-button" disabled={busy} onClick={() => setEraseOpen(false)}>キャンセル</button></div>}</> : <><p>ログインすると、同じアカウントの端末で記録を共有できます。端末内の記録は残り、クラウドの記録とは自動で合体しません。</p><form onSubmit={submit} className="form-grid"><label className="wide"><span>メールアドレス</span><input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>{!reset && <label className="wide"><span>パスワード（8文字以上）</span><input type="password" minLength={8} required autoComplete={signup ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} /></label>}<button className="primary-button" disabled={busy || disabled}>{busy ? "処理中…" : reset ? "再設定メールを送信" : signup ? "アカウントを作成" : "ログイン"}</button><button className="text-button" type="button" disabled={busy || disabled} onClick={() => { setSignup(reset ? false : !signup); setReset(false); setMessage(""); }}>{signup || reset ? "ログインに戻る" : "はじめての方"}</button>{!reset && <button className="text-button" type="button" disabled={busy || disabled} onClick={() => { setReset(true); setSignup(false); setPassword(""); setMessage(""); }}>パスワードを忘れた方</button>}</form></>}{message && <p role="status">{message}</p>}</section>;
}
