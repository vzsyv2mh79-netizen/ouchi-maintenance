import { notFound } from 'next/navigation';
import { maintenanceReport } from '@/lib/maintenance-report';
import type { AppData } from '@/lib/types';

export const dynamic = 'force-dynamic';
export default function ReportPreview() {
  if (process.env.NODE_ENV !== 'development' && process.env.VERCEL_ENV !== 'preview') notFound();
  const products = ['空気清浄機', 'エアコン', '洗濯機'].map((name, index) => ({ id: `product-${index}`, homeId: 'sample', categoryId: 'other', maker: '', name, modelNumber: '' }));
  const data: AppData = {
    homes: [{ id: 'sample', name: 'わが家', kind: 'home' }], products,
    tasks: products.map((product, index) => ({ id: `task-${index}`, productId: product.id, name: 'フィルターのお手入れ', kind: '掃除', intervalDays: 30, nextDueAt: ['2026-10-08', '2026-10-10', '2026-10-20'][index], sourceKind: 'ユーザー設定' })),
    history: [2, 3, 4, 3, 5, 2].flatMap((count, month) => Array.from({ length: count }, (_, index) => ({ id: `history-${month}-${index}`, taskId: `task-${index % 3}`, productId: `product-${index % 3}`, completedAt: `2026-${String(month + 5).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}` }))),
  };
  const report = maintenanceReport(data, 'sample', Date.parse('2026-10-10T00:00:00Z'));
  const max = Math.max(1, ...report.months.map(month => month.completed));
  const card = { background: '#ffffff', border: '1px solid #e4e9e5', borderRadius: 20, padding: 22, marginTop: 18 };
  return <main style={{ minHeight: '100vh', background: '#f5f7f3', color: '#20382c', padding: '28px 18px 60px' }}>
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      <p style={{ fontSize: 13, fontWeight: 700, color: '#38664c' }}>おうちメンテ</p>
      <h1 style={{ fontSize: 28, margin: '12px 0 8px', fontWeight: 750 }}>お手入れレポート</h1>
      <p style={{ fontSize: 14, color: '#586b5f', lineHeight: 1.8 }}>わが家のお手入れを、月ごとに振り返る。</p>
      <div role="note" style={{ ...card, background: '#fff9e9', borderColor: '#ece0bd', fontSize: 13, lineHeight: 1.8 }}>
        <strong>確認用サンプル</strong><br />実際の記録ではありません。2026年10月10日を例にした画面です。購入・請求は行われません。
      </div>
      <section style={card} aria-labelledby="current-report">
        <h2 id="current-report" style={{ fontSize: 17, fontWeight: 700 }}>今のお手入れ</h2>
        <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, margin: '20px 0 0' }}>
          <div><dt style={{ fontSize: 13 }}>期限を過ぎた項目</dt><dd style={{ margin: '6px 0 0', fontSize: 30, color: '#9a5533' }}>{report.overdue}<span style={{ fontSize: 14 }}> 件</span></dd></div>
          <div><dt style={{ fontSize: 13 }}>今日の項目</dt><dd style={{ margin: '6px 0 0', fontSize: 30 }}>{report.dueToday}<span style={{ fontSize: 14 }}> 件</span></dd></div>
        </dl>
      </section>
      <section style={card} aria-labelledby="monthly-report">
        <h2 id="monthly-report" style={{ fontSize: 17, fontWeight: 700 }}>6か月のお手入れ実績</h2>
        <p style={{ marginTop: 6, fontSize: 13, color: '#586b5f' }}>記録した完了件数</p>
        <ul style={{ listStyle: 'none', padding: 0, margin: '20px 0 0' }}>{report.months.map(month => <li key={month.month} style={{ display: 'grid', gridTemplateColumns: '45px 1fr 38px', alignItems: 'center', gap: 12, marginTop: 15, fontSize: 14 }}>
          <span>{Number(month.month.slice(5))}月</span>
          <span aria-hidden="true" style={{ background: '#edf2ed', borderRadius: 8, height: 20 }}><span style={{ display: 'block', width: `${month.completed / max * 100}%`, height: '100%', background: '#38664c', borderRadius: 8 }} /></span>
          <span style={{ textAlign: 'right' }}>{month.completed}件</span>
        </li>)}</ul>
      </section>
      <section style={card} aria-labelledby="product-report">
        <h2 id="product-report" style={{ fontSize: 17, fontWeight: 700 }}>製品ごとの今月の実績</h2>
        <ul style={{ listStyle: 'none', padding: 0, marginBottom: 0 }}>{report.perProduct.map(product => <li key={product.productId} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, borderTop: '1px solid #e4e9e5', padding: '15px 0', fontSize: 14 }}>
          <span>{product.name}</span><span>{product.completedThisMonth}件</span>
        </li>)}</ul>
      </section>
      <p style={{ marginTop: 20, fontSize: 12, color: '#586b5f', lineHeight: 1.9 }}>{report.explanation}</p>
    </div>
  </main>;
}
