import {createAttachmentFetch} from './attachment-fetch';
/** Only the configured project Auth API; marker agent cannot be overridden by
 * SDK headers. Independent logout cleanup remains bounded after caller abort.
 */
export function closureReviewAuthFetch(authURL:string,signal:AbortSignal,agent?:string):typeof fetch{
 if(!/^https:\/\/[a-z]{20}\.supabase\.co$/.test(authURL)||!(signal instanceof AbortSignal)||
  (agent!==undefined&&!/^OuchiMaintenance\/closure-reauth\/v1\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(agent)))throw Error('Bounded configured Auth transport required');
 return async(input,init)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
  if(url.origin!==authURL||!url.pathname.startsWith('/auth/v1/'))throw Error('Configured Auth origin required');
  const logout=url.pathname==='/auth/v1/logout';
  const headers=new Headers(init?.headers??(input instanceof Request?input.headers:undefined));
  if(agent)headers.set('User-Agent',agent);
  return createAttachmentFetch(logout?AbortSignal.timeout(5000):signal,5000,65536)(input,{...init,headers,cache:'no-store'});
 };
}
