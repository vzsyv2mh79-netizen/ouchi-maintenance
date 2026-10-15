import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import draft from '@/ios/Docs/ReleasePreparation/legal-drafts-ja.json';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: '公開前の説明確認 | おうちメンテ',
  robots: { index: false, follow: false },
};
const section = { padding: '1.5rem 0', borderBottom: '1px solid var(--line)', scrollMarginTop: '1rem' };
const paragraph = { lineHeight: 1.9, overflowWrap: 'anywhere' as const };
const pending = [
  ...(!draft.operator ? ['公開する運営者名'] : []),
  ...(!draft.contact ? ['公開する問い合わせ先'] : []),
  ...(!draft.effectiveDate ? ['施行日'] : []),
  '実際の退会処理と家族に残る記録の説明',
  '購入情報・操作ログ・バックアップの保存期間と削除条件',
  '各委託先の処理地域とApp Storeに申告する収集情報',
  '写真の保管枠、契約終了後の扱い、サービス終了時の案内期間',
];
export default function ReleaseInformationPreview() {
  if (process.env.NODE_ENV !== 'development' && process.env.VERCEL_ENV !== 'preview') notFound();
  return <main style={{ maxWidth: 760, margin: '0 auto', padding: '1.5rem 1.25rem 5rem', fontSize: '1rem', color: 'var(--ink)' }}>
    <p><Link href="/">おうちメンテに戻る</Link></p>
    <h1 style={{ fontSize: 'clamp(1.65rem, 5vw, 2.25rem)', lineHeight: 1.5 }}>公開前の説明確認</h1>
    <aside role="note" style={{ ...paragraph, padding: '1rem', border: '2px solid var(--line)', borderRadius: 16 }}>
      <strong>確認用の下書きです</strong><p>正式な利用規約・プライバシーポリシーではありません。購入・請求・契約への同意は行われません。未確定項目を確認してから公開します。</p>
    </aside>
    <nav aria-label="下書きの目次" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', padding: '1rem 0' }}>
      <a href="#pending" style={{ padding: '.75rem 0' }}>未確定項目</a><a href="#terms" style={{ padding: '.75rem 0' }}>利用規約案</a><a href="#privacy" style={{ padding: '.75rem 0' }}>データの取り扱い案</a><a href="#support" style={{ padding: '.75rem 0' }}>サポート案</a>
    </nav>
    <section id="pending" style={section}>
      <h2>公開前に確定すること</h2><ul style={paragraph}>{pending.map(item => <li key={item} style={{ marginBlock: '.75rem' }}>{item}</li>)}</ul>
      <dl style={paragraph}><dt>運営者名</dt><dd style={{ marginLeft: 0 }}>{draft.operator ?? '未確定'}</dd><dt>問い合わせ先</dt><dd style={{ marginLeft: 0 }}>{draft.contact ?? '未確定'}</dd><dt>施行日</dt><dd style={{ marginLeft: 0 }}>{draft.effectiveDate ?? '未確定'}</dd></dl>
    </section>
    <section id="terms" style={section}>
      <h2>利用規約案</h2>{draft.terms.map(item => <article key={item.title} style={{ marginTop: '1.75rem' }}><h3 style={{ fontSize: '1.1rem', lineHeight: 1.6 }}>{item.title}</h3><p style={paragraph}>{item.body}</p></article>)}
    </section>
    <section id="privacy" style={section}>
      <h2>データの取り扱い案</h2>{draft.privacy.map(item => <article key={item.title} style={{ marginTop: '1.75rem' }}><h3 style={{ fontSize: '1.1rem', lineHeight: 1.6 }}>{item.title}</h3><p style={paragraph}>{item.body}</p></article>)}
    </section>
    <section id="support" style={section}>
      <h2>サポート案</h2>
      <p style={paragraph}>{draft.contact ? <>問い合わせ先：{draft.contact}。<Link href="/support">使い方と問い合わせページを見る</Link></> : '問い合わせ窓口は公開前に確定します。'} この確認画面からメールが自動送信されることはありません。</p>
      <h3>問い合わせに添えてほしいこと</h3><p style={paragraph}>利用中のアプリのバージョン、iPhoneなどの機種、困っている操作、表示されたエラーをお知らせください。パスワード、確認コード、カード番号、保証書全体の画像は送らないでください。</p>
      <h3>購入と解約</h3><p style={paragraph}>購入機能は準備中です。提供開始後、Appleで購入した定期購入の管理・解約はAppleの設定画面で行います。退会だけでは定期購入は解約されません。</p>
      <h3>記録の書き出し</h3><p style={paragraph}>設定から保存したバックアップは、端末外でも利用者自身で管理してください。有料契約の終了だけを理由に、基本記録の閲覧・書き出しを止めない方針です。</p>
    </section>
    <p style={paragraph}>この画面の表示は、公開・課金・退会処理の動作確認が完了したことを意味しません。</p>
  </main>;
}
