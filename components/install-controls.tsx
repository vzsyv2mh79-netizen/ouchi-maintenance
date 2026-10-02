"use client";
import { useEffect, useState } from "react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
export function InstallControls() {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [offline, setOffline] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const capture = (event: Event) => { event.preventDefault(); setPrompt(event as InstallEvent); };
    const complete = () => { setInstalled(true); setPrompt(null); };
    const network = () => setOffline(!navigator.onLine);
    network(); setInstalled(window.matchMedia("(display-mode: standalone)").matches);
    window.addEventListener("beforeinstallprompt", capture); window.addEventListener("appinstalled", complete);
    window.addEventListener("online", network); window.addEventListener("offline", network);
    return () => { window.removeEventListener("beforeinstallprompt", capture); window.removeEventListener("appinstalled", complete); window.removeEventListener("online", network); window.removeEventListener("offline", network); };
  }, []);
  return <section className="settings-group"><h2>ホーム画面に追加</h2>
    <p>{installed ? "ホーム画面からアプリとして利用中です。" : "iPhone・iPadはSafariの共有メニューから「ホーム画面に追加」を選んでください。Androidはブラウザのメニューから追加できます。"}</p>
    {prompt && <button className="secondary-button" onClick={async () => { try { await prompt.prompt(); const choice = await prompt.userChoice; setPrompt(null); if (choice.outcome === "accepted") setMessage("追加を受け付けました。"); } catch { setMessage("ブラウザのメニューから追加してください。"); } }}>ホーム画面に追加</button>}
    <p>{offline ? "現在オフラインです。" : "通信できる状態です。"} 一度オンラインで開いた端末では、端末保存の記録をオフラインでも利用できます。クラウド保存と品番のWeb検索には通信が必要です。</p>
    {message && <p role="status">{message}</p>}
  </section>;
}

export function RegisterOffline() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => { /* The online app remains usable when offline support is unavailable. */ });
  }, []);
  return null;
}
