import {restoreChallengeEntry} from '@/lib/billing-restore-challenge-entry';
export const runtime='nodejs';
export async function POST(request:Request){return restoreChallengeEntry(request,process.env);}
