import {closureID} from './web-closure-transport';
export type WebClosureReadScope=Readonly<{account:string;epochID:string;submissionID:string;requestID:string}>;
export type WebClosureReadMetadata=WebClosureReadScope&Readonly<{credentialID:string;expiresAt:string}>;
export type WebClosureReadCredential=WebClosureReadMetadata&Readonly<{token:string}>;
export type WebClosureReadStatus=Readonly<{kind:'app-closure-read-status/v1';epochID:string;submissionID:string;requestID:string;credentialID:string;state:'pending'|'running'|'failed'|'complete'}>;
export function closureReadScope(value:WebClosureReadScope):WebClosureReadScope{
  const r=Object.freeze({account:value.account,epochID:value.epochID,submissionID:value.submissionID,requestID:value.requestID});
  if(![r.account,r.epochID,r.submissionID,r.requestID].every(closureID))throw Error('保存した退会処理を確認してください。');
  return r;
}
export const closureReadDate=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
export function closureReadToken(value:unknown):value is string{
  if(typeof value!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(value))return false;
  try{const raw=atob(value.replace(/-/g,'+').replace(/_/g,'/')+'=');return raw.length===32&&btoa(raw).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')===value;}catch{return false;}
}
export function closureReadMetadata(value:unknown):WebClosureReadMetadata{
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('保存した確認情報を読み取れません。');
  const r=value as Record<string,unknown>;
  if(![r.account,r.epochID,r.submissionID,r.requestID,r.credentialID].every(closureID)||!closureReadDate(r.expiresAt))throw Error('保存した確認情報を読み取れません。');
  return Object.freeze({account:r.account,epochID:r.epochID,submissionID:r.submissionID,requestID:r.requestID,credentialID:r.credentialID,expiresAt:r.expiresAt}) as WebClosureReadMetadata;
}
export function sameClosureRead(a:WebClosureReadMetadata,b:WebClosureReadMetadata){return JSON.stringify([a.account,a.epochID,a.submissionID,a.requestID,a.credentialID,a.expiresAt])===JSON.stringify([b.account,b.epochID,b.submissionID,b.requestID,b.credentialID,b.expiresAt]);}
export function closureReadDeadline(expiresAt:string,now=Date.now()){
  if(!closureReadDate(expiresAt)||!Number.isFinite(now)||Date.parse(expiresAt)<=now||Date.parse(expiresAt)>now+30*86400000)throw Error('確認期限を過ぎているか、端末の日時を確認できません。');
}
export function closureReadAlive(value:WebClosureReadMetadata,now=Date.now()){closureReadDeadline(value.expiresAt,now);}
