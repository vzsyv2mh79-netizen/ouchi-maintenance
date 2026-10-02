export function isPushEndpoint(value: unknown): value is string {
 if(typeof value!=='string'||value.length>2048)return false;
 try {
  const url=new URL(value);
  if(url.protocol!=='https:'||url.port||url.username||url.password||url.hash)return false;
  return (url.hostname==='fcm.googleapis.com'&&url.pathname.startsWith('/fcm/send/')) ||
   (url.hostname==='updates.push.services.mozilla.com'&&url.pathname.startsWith('/wpush/')) ||
   (url.hostname==='web.push.apple.com'&&url.pathname.length>1) ||
   (/^[a-z0-9-]+\.notify\.windows\.com$/.test(url.hostname)&&url.pathname==='/w/');
 }catch{return false;}
}
export function validPushKeys(p256dh: unknown,auth: unknown) {
 return typeof p256dh==='string'&&/^B[A-Za-z0-9_-]{86}=?$/.test(p256dh)&&typeof auth==='string'&&/^[A-Za-z0-9_-]{22}(?:==)?$/.test(auth);
}
export function reminderPayload(count: number,date: string) {
 if(!Number.isSafeInteger(count)||count<1||!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('Invalid reminder');
 return {title:'おうちメンテ',body:`期限が来たお手入れが${count}件あります。アプリで確認してください。`,tag:`ouchi-maintenance-${date}`,url:'/'};
}
