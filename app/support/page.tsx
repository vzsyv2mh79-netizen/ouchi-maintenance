import type { Metadata } from 'next';
import Link from 'next/link';

// Confirmed public support details; independent of unpublished release drafts.
const information = {operator: '滝浪イチロー', contact: 'soccer16black@gmail.com'};

export const metadata: Metadata = {
  title: '使い方・問い合わせ | おうちメンテ',
  description: 'おうちメンテの使い方と問い合わせ先をご案内します。',
};
const section = { padding: '1.25rem 0', borderBottom: '1px solid var(--line)' };
const paragraph = { lineHeight: 1.9, overflowWrap: 'anywhere' as const };

export default function SupportPage() {
  return <main style={{ maxWidth: 760, margin: '0 auto', padding: '1.5rem 1.25rem 5rem', color: 'var(--ink)', fontSize: '1rem' }}>
    <p><Link href="/">おうちメンテに戻る</Link></p>
    <h1 style={{ fontSize: 'clamp(1.65rem, 5vw, 2.25rem)', lineHeight: 1.5 }}>使い方・問い合わせ</h1>
    <p style={paragraph}>家電のお手入れ予定や記録について、困ったときはこちらをご確認ください。</p>
    <section style={section} aria-labelledby="records">
      <h2 id="records">記録が見つからないとき</h2>
      <p style={paragraph}>ログインしているアカウントと、選択している住まいをご確認ください。複数のメールアドレスや住まいを利用している場合、別の記録を表示していることがあります。</p>
    </section>
    <section style={section} aria-labelledby="family">
      <h2 id="family">家族と使うとき</h2>
      <p style={paragraph}>家族はそれぞれ自分のアカウントでログインし、共有する住まいに参加します。招待情報は、参加してほしい相手にだけ渡してください。記録が共有されない場合は、家族と同じ住まいを選んでいるかご確認ください。</p>
    </section>
    <section style={section} aria-labelledby="export">
      <h2 id="export">記録を手元に残す</h2>
      <p style={paragraph}>設定から記録を書き出せます。保存したファイルは利用者自身で管理してください。ほかのアプリで読み込めるかどうかは、そのアプリの対応形式によって異なります。</p>
    </section>
    <section style={section} aria-labelledby="purchases">
      <h2 id="purchases">Appleの定期購入を確認するとき</h2>
      <p style={paragraph}>Appleで購入した定期購入の確認・解約は、<a href="https://apps.apple.com/account/subscriptions">Appleのサブスクリプション管理画面</a>で行えます。アプリの削除や退会だけでは、定期購入は解約されません。</p>
    </section>
    <section style={section} aria-labelledby="contact">
      <h2 id="contact">問い合わせ</h2>
      <dl style={paragraph}>
        <dt>運営者</dt><dd style={{ marginLeft: 0, marginBottom: '.75rem' }}>{information.operator}</dd>
        <dt>メールアドレス</dt><dd style={{ marginLeft: 0 }}>{information.contact}</dd>
      </dl>
      <p><a href={`mailto:${information.contact}`} style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '.75rem 1rem', border: '1px solid var(--line)', borderRadius: 12 }}>メールアプリを開く</a></p>
      <p style={paragraph}>端末の種類、アプリのバージョン、困っている操作、表示されたエラーをお知らせください。パスワード・確認コード・カード番号は送らないでください。画像を添える場合は、不要な個人情報を隠してください。</p>
    </section>
  </main>;
}
