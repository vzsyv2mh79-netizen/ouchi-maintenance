import {restoreProcessEntry} from '@/lib/billing-restore-process-entry';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(request:Request){return restoreProcessEntry(request,process.env);}
