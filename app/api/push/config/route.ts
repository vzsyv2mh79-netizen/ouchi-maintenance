import {pushConfiguration} from '@/lib/push-server';
export const runtime='nodejs';
export function GET() {
 const config=pushConfiguration();
 return Response.json({publicKey:config?.publicKey??null},{headers:{'Cache-Control':'no-store'}});
}
