import type {BillingEnvironment} from "./billing";
import { readBillingBody } from './billing-body';
import {parseReminderSchedule,freeReminderSchedule,type ReminderSchedule} from './reminder-schedule';
export {parseReminderSchedule,freeReminderSchedule,type ReminderSchedule} from './reminder-schedule';
export type ReminderScope=Readonly<{userID:string;sessionID:string;epochID:string}>;
export type ReminderSettingsDependencies={verify:(bearer:string)=>Promise<ReminderScope|null>;read:(scope:ReminderScope)=>Promise<unknown>;save:(scope:ReminderScope,revision:number,schedule:ReminderSchedule)=>Promise<unknown>};
export class ReminderSettingsError extends Error {constructor(public readonly reason:'conflict'|'premium'|'identity'){super(reason);}}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)&&v!=='00000000-0000-0000-0000-000000000000';
function checkedResult(value:unknown,environment:BillingEnvironment="Sandbox"){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid settings');const v=value as Record<string,unknown>;
 if(v.environment!==environment||typeof v.premiumActive!=='boolean'||!Number.isSafeInteger(v.revision)||(v.revision as number)<0)throw Error('Invalid scope');
 const saved=v.saved===null?null:parseReminderSchedule(v.saved),effective=parseReminderSchedule(v.effective);
 if((v.revision===0)!==(saved===null)||JSON.stringify(effective)!==JSON.stringify(v.premiumActive?(saved??freeReminderSchedule):freeReminderSchedule))throw Error('Inconsistent settings');
 return {environment,salesEnabled:false,revision:v.revision,saved,effective,premiumActive:v.premiumActive};
}
/** Test-only route contract. Dependencies absent means preparation, never free access. */
export async function handleReminderSettings(request:Request,deps:ReminderSettingsDependencies|null,formal?:{environment:BillingEnvironment;expectedEpoch:string}){
 const reply=(body:object,status:number)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
 if(!deps)return reply({error:'通知設定は準備中です。'},503);
 if(formal&&(!['Sandbox','Production'].includes(formal.environment)||!uuid(formal.expectedEpoch)))return reply({error:'登録状態を確認し直してください。'},400);
 if(!['GET','PUT'].includes(request.method))return reply({error:'Method not allowed'},405);
 if(new URL(request.url).search)return reply({error:'Invalid request'},400);
 const auth=request.headers.get('authorization');if(!auth||auth.length>16384||!/^Bearer [^\s]+$/.test(auth))return reply({error:'ログインしてください。'},401);
 let input:{revision:number;schedule:ReminderSchedule}|null=null;
 if(request.method==='PUT'){
  if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return reply({error:'Invalid content type'},415);
  try{const body=await readBillingBody(request);if(Object.keys(body).sort().join(',')!=='revision,schedule'||!Number.isSafeInteger(body.revision)||(body.revision as number)<0||(body.revision as number)>=Number.MAX_SAFE_INTEGER)throw Error('Invalid revision');input={revision:body.revision as number,schedule:parseReminderSchedule(body.schedule)};}catch{return reply({error:'設定を確認してください。'},400);}
 }
 try{
  if(request.signal.aborted)throw Error('Cancelled');
  const scope=await deps.verify(auth.slice(7));if(!scope||!uuid(scope.userID)||!uuid(scope.sessionID)||!uuid(scope.epochID))return reply({error:'ログインを確認できません。'},401);
  if(formal&&scope.epochID.toLowerCase()!==formal.expectedEpoch.toLowerCase())return reply({error:'登録状態が変わりました。'},403);
  const fixed=Object.freeze({...scope});if(request.signal.aborted)throw Error('Cancelled');
  const result=input?await deps.save(fixed,input.revision,input.schedule):await deps.read(fixed);
  if(request.signal.aborted)throw Error('Cancelled');
  const checked=checkedResult(result,formal?.environment);
  if(input&&(checked.revision!==input.revision+1||JSON.stringify(checked.saved)!==JSON.stringify(input.schedule)))throw Error('Unconfirmed save');
  if(formal){
   const latest=await deps.verify(auth.slice(7));if(request.signal.aborted)throw Error('Cancelled');
   if(!latest||latest.userID!==fixed.userID||latest.sessionID!==fixed.sessionID||latest.epochID!==fixed.epochID)return reply({error:'ログイン状態が変わりました。最新の設定を読み込んでください。'},403);
   return reply({...checked,purchaseAccountToken:fixed.epochID},200);
  }
  return reply(checked,200);
 }catch(error){
  if(error instanceof ReminderSettingsError){if(error.reason==='conflict')return reply({error:'別の変更があります。最新の設定を読み込んでください。'},409);return reply({error:error.reason==='premium'?'有料利用権を確認してください。':'ログインを確認してください。'},403);}
  // A failed save acknowledgement can be ambiguous. Client must read/retry the
  // same revision/settings; the database guards against duplicate and stale writes.
  return reply({error:'設定の結果を確認できません。最新の設定を読み込んでください。'},503);
 }
}
