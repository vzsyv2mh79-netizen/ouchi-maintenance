/** Pure APNs protocol preparation. No network, signing keys, scheduling or activation. */
export function maintenanceAPNsRequest(input:{deviceToken:string;bundleId:string;dueCount:number;now:number}){
 const {deviceToken,bundleId,dueCount,now}=input;
 // Apple advises against assuming a fixed device-token size.
 if(typeof deviceToken!=='string'||!/^([0-9a-f]{2}){16,512}$/i.test(deviceToken)||typeof bundleId!=='string'||bundleId.length>200||!/^[A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)+$/.test(bundleId)||!Number.isSafeInteger(dueCount)||dueCount<0||dueCount>100000||!Number.isSafeInteger(now)||now<=0)throw new Error('Invalid APNs reminder input');
 if(dueCount===0)return null;
 const expiration=Math.floor(now/1000)+3600;
 if(!Number.isSafeInteger(expiration))throw new Error('Invalid APNs expiry');
 return {
  origin:'https://api.sandbox.push.apple.com',
  path:`/3/device/${deviceToken.toLowerCase()}`,
  headers:{'apns-topic':bundleId,'apns-push-type':'alert','apns-priority':'10','apns-collapse-id':'ouchi-maintenance-due','apns-expiration':String(expiration)},
  body:JSON.stringify({aps:{alert:{title:'おうちメンテ',body:`期限が来たお手入れが${dueCount}件あります。アプリで確認してください。`},sound:'default'}}),
 };
}
export type APNsDisposition='accepted'|'retry'|'credentials'|'disable-device'|'stale-unregistration'|'inspect';
/** Only a scoped registration can be disabled; an older invalidation must not cancel its replacement. */
export function maintenanceAPNsDisposition(status:number,reason:unknown,timestamp:unknown,registeredAt:number):APNsDisposition{
 if(!Number.isSafeInteger(registeredAt)||registeredAt<=0)throw new Error('Invalid registration timestamp');
 if(status===200)return 'accepted';
 if(status===429||status===500||status===503)return 'retry';
 if(status===403&&['ExpiredProviderToken','InvalidProviderToken','MissingProviderToken'].includes(String(reason)))return 'credentials';
 if(status===410&&reason==='Unregistered'&&Number.isSafeInteger(timestamp)&&(timestamp as number)>0){
  return (timestamp as number)>=registeredAt?'disable-device':'stale-unregistration';
 }
 return 'inspect';
}
