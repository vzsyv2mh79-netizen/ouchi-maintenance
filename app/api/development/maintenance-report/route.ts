import { createClient } from '@supabase/supabase-js';
import { billingConfiguration, billingDatabase } from '@/lib/billing-server';
import { entitlementFromTransactions, type VerifiedTransaction } from '@/lib/billing';
import { validateData } from '@/lib/backup';
import { maintenanceReport } from '@/lib/maintenance-report';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'no-store' };
  const config = billingConfiguration();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (process.env.VERCEL_ENV === 'production' || !config || process.env.OUCHI_REPORT_TEST_MODE !== 'true' || !publishableKey?.startsWith('sb_publishable_')) {
    return Response.json({ error: 'レポートは準備中です。' }, { status: 503, headers });
  }
  const token = request.headers.get('authorization');
  if (!token?.startsWith('Bearer ') || token.length > 16384) return Response.json({ error: 'ログインしてください。' }, { status: 401, headers });
  const homeId = new URL(request.url).searchParams.get('homeId');
  if (!homeId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(homeId)) return Response.json({ error: '住まいを選択してください。' }, { status: 400, headers });
  try {
    const db = billingDatabase(config);
    const { data: { user }, error } = await db.auth.getUser(token.slice(7));
    if (error || !user) return Response.json({ error: 'ログインを確認できません。' }, { status: 401, headers });
    const result = await db.from('ouchi_sandbox_transactions').select('payload').eq('user_id', user.id);
    if (result.error) throw new Error('Entitlement unavailable');
    const transactions = (result.data ?? []).map(row => row.payload as VerifiedTransaction).filter(transaction => transaction.environment === 'Sandbox' && transaction.accountToken === user.id.toLowerCase());
    if (entitlementFromTransactions(transactions, Date.now()).plan !== 'premium') return Response.json({ error: 'テスト用の有料利用権が必要です。' }, { status: 403, headers });
    // Household reads use the caller JWT and existing RLS, never service privileges.
    const scoped = createClient(config.url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: token } } });
    const loaded = await scoped.rpc('load_household');
    if (loaded.error) throw new Error('Household unavailable');
    const data = validateData(loaded.data);
    if (!data.homes.some(home => home.id.toLowerCase() === homeId.toLowerCase())) return Response.json({ error: '住まいを確認できません。' }, { status: 404, headers });
    return Response.json({ environment: 'Sandbox', salesEnabled: false, report: maintenanceReport(data, data.homes.find(home => home.id.toLowerCase() === homeId.toLowerCase())!.id, Date.now()) }, { headers });
  } catch {
    return Response.json({ error: 'レポートを作成できません。時間をおいてお試しください。' }, { status: 503, headers });
  }
}
