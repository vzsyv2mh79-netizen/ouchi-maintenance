import 'server-only';
/** Read-only test configuration. Never verifies or accepts purchase proofs. */
export function sandboxReportReadConfiguration() {
 if (process.env.VERCEL_ENV === 'production' || process.env.OUCHI_REPORT_TEST_MODE !== 'true' ||
     process.env.BILLING_MODE !== 'sandbox' || process.env.BILLING_ACCOUNT_BINDING_MODE !== 'epoch' ||
     process.env.BILLING_STORAGE_MODE !== 'verified-ledger') return null;
 const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
 if (!url || !key) return null;
 return {url, key, environment: 'Sandbox' as const, storage: 'verified-ledger' as const};
}
