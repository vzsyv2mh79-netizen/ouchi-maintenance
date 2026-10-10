import { createClient } from '@supabase/supabase-js';
import { sessionAfterAuthVerification } from '@/lib/verified-app-session';
import { purchaseAccountAfterAuthVerification } from '@/lib/billing-account';
import { readBillingBody } from '@/lib/billing-body';

export const runtime = 'nodejs';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validID = (value: unknown): value is string => typeof value === 'string' && uuid.test(value) && value !== '00000000-0000-0000-0000-000000000000';
async function handle(request: Request, disable: boolean) {
  const headers = { 'Cache-Control': 'no-store' };
  const reply = (error: string, status: number) => Response.json({ error }, { status, headers });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.OUCHI_APNS_TEST_SERVICE_KEY;
  const topic = process.env.APPLE_BUNDLE_ID;
  if (process.env.NODE_ENV !== 'development' || process.env.VERCEL_ENV === 'production'
      || process.env.OUCHI_APNS_TEST_MODE !== 'true' || url !== 'http://127.0.0.1:54321'
      || !key || !topic || topic.length > 200 || !/^[A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)+$/.test(topic)) {
    return reply('iPhone通知は準備中です。', 503);
  }
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ') || authorization.length > 16384
      || !authorization.slice(7) || /\s/.test(authorization.slice(7))) return reply('ログインしてください。', 401);
  try {
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const token = authorization.slice(7);
    const verified = await db.auth.getUser(token);
    if (verified.error || !verified.data.user) return reply('ログインを確認できません。', 401);
    const identity = sessionAfterAuthVerification(token, verified.data.user.id);
    if (!identity) return reply('ログインを確認できません。', 401);
    const epoch = await purchaseAccountAfterAuthVerification(token, identity.userID, async (user, session) => {
      const result = await db.rpc('current_maintenance_purchase_account', { target_user: user, verified_session: session });
      if (result.error) throw new Error('Binding unavailable');
      return result.data;
    });
    if (!epoch) return reply('現在の登録を確認できません。', 403);
    let body: Record<string, unknown>;
    try { body = await readBillingBody(request); } catch { return reply('通知設定を確認してください。', 400); }
    const field = disable ? 'registrationId' : 'deviceToken';
    if (Object.keys(body).length !== 1 || !Object.hasOwn(body, field)) return reply('通知設定を確認してください。', 400);
    const value = body[field];
    if (disable ? !validID(value) : typeof value !== 'string' || !/^([0-9a-f]{2}){16,512}$/i.test(value)) return reply('通知設定を確認してください。', 400);
    const args = { target_user: identity.userID, verified_session: identity.sessionID, expected_epoch: epoch };
    const result = disable
      ? await db.rpc('disable_maintenance_apns', { ...args, registration_id: (value as string).toLowerCase() })
      : await db.rpc('register_maintenance_apns', { ...args, token: (value as string).toLowerCase(), bundle_topic: topic });
    if (result.error) throw new Error('Registration unavailable');
    if (disable) {
      if (result.data !== true && result.data !== false) throw new Error('Invalid acknowledgement');
      return Response.json({ environment: 'Sandbox', disabled: result.data }, { headers });
    }
    if (!validID(result.data)) throw new Error('Invalid registration');
    return Response.json({ environment: 'Sandbox', registrationId: result.data.toLowerCase() }, { headers });
  } catch { return reply('通知設定を保存できません。時間をおいてお試しください。', 503); }
}
export const POST = (request: Request) => handle(request, false);
export const DELETE = (request: Request) => handle(request, true);
