import type { Metadata } from "next";
import Link from "next/link";
import { Check, House, CalendarDays, ClipboardCheck, ShieldCheck } from "lucide-react";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "おうちメンテについて | 家電のお手入れを、ひとつに",
  description: "家電を登録して、お手入れの予定と実施履歴をまとめて管理。端末内の保存から始められる、おうちメンテの使い方。",
};
const features = [
  { icon: House, title: "家電をひとまとめに", text: "製品名・品番・購入日を記録。自宅と実家など、住まいを分けて管理できます。" },
  { icon: CalendarDays, title: "次のお手入れを見える化", text: "お手入れの周期を設定すると、次回の予定日を計算。期限が近いものから確認できます。" },
  { icon: ClipboardCheck, title: "やったことが残る", text: "お手入れを終えたら「完了」。実施履歴を残し、次の予定を更新します。" },
];
export default function AboutPage() {
  const cloudReady = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  return <div className={styles.wrap}>
    <header className={styles.header}><Link href="/" className={styles.brand}><span><House size={21} /></span>おうちメンテ</Link><Link href="/" className={styles.smallLink}>アプリを開く</Link></header>
    <main>
      <section className={styles.hero}><p className={styles.eyebrow}>毎日の暮らしに、小さなお手入れを。</p><h1>家電のお手入れを、<br />ひとつに。</h1><p className={styles.lead}>「いつ掃除したっけ？」を減らして、<br />おうちの道具を、気持ちよく長く使う。</p><Link href="/" className={styles.cta}>おうちメンテを始める</Link><p className={styles.note}>アカウントなしで、端末内の保存から始められます。</p>
      <div className={styles.example} aria-label="お手入れ管理の使用例"><p>お手入れの例</p><div><span className={styles.check}><Check size={20} /></span><span><strong>空気清浄機のフィルター掃除</strong><small>完了すると、次回の予定を更新</small></span><ClipboardCheck size={22} /></div><div><CalendarDays size={20} /><span><strong>製品に合った周期で管理</strong><small>予定と実施履歴をひとつの場所に</small></span></div></div></section>
      <section className={styles.features} aria-label="できること">{features.map(({icon: Icon,title,text}) => <article key={title}><Icon size={26} /><h2>{title}</h2><p>{text}</p></article>)}</section>
      <section className={styles.steps}><h2>3つのステップで始められます</h2><ol><li><strong>製品を登録</strong><p>製品名と品番を入力。確認済みの対応品番は、公式情報から候補を選べます。</p></li><li><strong>お手入れを設定</strong><p>掃除・交換・点検などを追加して、周期を指定します。根拠となる説明書も保存できます。</p></li><li><strong>終わったら完了</strong><p>ホームで予定を確認し、完了を記録。履歴は後から振り返れます。</p></li></ol></section>
      <section className={styles.storage}><ShieldCheck size={28} /><h2>記録の保存について</h2><p>端末内の記録は、使っているブラウザに保存されます。ブラウザのデータを消すと記録も消えるため、設定から定期的にバックアップを保存してください。</p><p>{cloudReady ? "クラウド保存にログインすると、同じアカウントの端末で記録を確認できます。端末内の記録を引き継ぐときは、設定の移行機能を使ってください。" : "クラウド保存と家族共有は準備中です。現在は端末内の保存をご利用ください。"}</p></section>
      <section className={styles.faq}><h2>使う前に知っておきたいこと</h2><details><summary>品番を入力すれば、どの製品でも自動設定できますか？</summary><p>現在は確認済みの品番のみ候補とお手入れを提案します。未対応品番は公式情報を検索し、手入力で登録できます。一般的な目安と製品の公式情報は区別して表示します。</p></details><details><summary>予定の日に通知は届きますか？</summary><p>アプリからの自動通知はまだ対応していません。設定から予定をカレンダー用ファイルとして書き出せます。カレンダーに取り込んだ後、アプリ側の予定変更は自動反映されません。</p></details><details><summary>ホーム画面に追加して使えますか？</summary><p>SafariやChromeのメニューからホーム画面に追加できます。手順はアプリの設定で確認できます。オフラインでのクラウド更新には対応していません。</p></details></section>
      <section className={styles.bottom}><h2>ひとつの家電から、始めてみよう。</h2><Link href="/" className={styles.cta}>アプリを開く</Link></section>
    </main><footer className={styles.footer}>おうちメンテ · 住まいと家電のお手入れを、ひとつに。</footer>
  </div>;
}
