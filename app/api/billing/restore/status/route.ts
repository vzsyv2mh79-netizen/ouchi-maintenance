import {restoreRecoveryEntry} from '@/lib/billing-restore-recovery-entry';
export const runtime='nodejs';
export async function POST(request:Request){return restoreRecoveryEntry(request,'status',process.env);}
