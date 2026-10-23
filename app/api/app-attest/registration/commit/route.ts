import {appAttestRegistrationEntry} from '@/lib/billing-app-attest-registration-entry';
export const runtime='nodejs';
export async function POST(request:Request){return appAttestRegistrationEntry(request,'commit',process.env);}
