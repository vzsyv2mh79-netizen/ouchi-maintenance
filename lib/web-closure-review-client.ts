import {closureJSON,closureID,type ClosureTransport} from './web-closure-transport';
import {ClosureProgressUnavailable,readWebClosureProgress,type SavedWebClosureSubmission,type WebClosureProgress} from './web-closure-progress-client';
import {webClosureReferences,type WebClosureReference} from './web-closure-reference-store';
import {readOrEnrollWebAccount} from './web-enrollment-client';
export type WebClosureReview=Readonly<{kind:'app-closure-review/v2';epochID:string;submissionID:string;reviewRequestID:string;state:'review_required'|'cancelled'}>;
export type WebClosureState=Readonly<{kind:'review';receipt:WebClosureReview}|{kind:'progress';progress:WebClosureProgress}|{kind:'unconfirmed'}>;
type Vault=Pick<typeof webClosureReferences,'list'|'current'|'reserve'|'markRetirement'>;
type Options=ClosureTransport&{account:string;vault?:Vault};
async function boundSession(options:Options):Promise<Options>{
  options.signal.throwIfAborted();
  // Session reads supplied by the caller are bounded by the operation's signal.
  const read=async()=>{
    options.signal.throwIfAborted();let stop:()=>void=()=>{};
    const aborted=new Promise<never>((_,reject)=>{stop=()=>reject(options.signal.reason);options.signal.addEventListener('abort',stop,{once:true});});
    try{return await Promise.race([options.session(),aborted]);}finally{options.signal.removeEventListener('abort',stop);}
  };
  const initial=await read();options.signal.throwIfAborted();
  if(!initial||initial.account!==options.account||!initial.token)throw Error('申請したアカウントでログインしてください。');
  const captured=Object.freeze({...initial});
  return {...options,session:async()=>{const current=await read();options.signal.throwIfAborted();if(current?.account!==captured.account||current?.token!==captured.token)throw Error('ログイン状態が変わりました。');return captured;}};
}
async function stored(options:Options,saved:SavedWebClosureSubmission):Promise<WebClosureReference>{
  if(saved.account!==options.account||!closureID(saved.epochID)||!closureID(saved.submissionID))throw Error('保存した申請が一致しません。');
  const result=(await (options.vault??webClosureReferences).list(options.account)).find(r=>r.submissionID===saved.submissionID);
  options.signal.throwIfAborted();
  if(!result||result.account!==saved.account||result.epochID!==saved.epochID)throw Error('保存した申請が一致しません。');
  return result;
}
async function review(options:Options,saved:SavedWebClosureSubmission,action:'request'|'read'|'cancel',password?:string):Promise<WebClosureReview|null>{
  const body={expectedEpochID:saved.epochID,submissionID:saved.submissionID,
    ...(action==='request'?{confirmation:'REQUEST_OUCHI_ACCOUNT_DELETION',password}:action==='cancel'?{confirmation:'CANCEL_OUCHI_DELETION_REVIEW'}:{})};
  const {status,value}=await closureJSON({...options,account:saved.account,path:action,body,statuses:action==='request'?[202]:action==='read'?[200,404]:[200]});
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('確認結果を読み取れません。');const r=value as Record<string,unknown>;
  if(action==='read'&&status===404&&Object.keys(r).sort().join(',')==='epochID,kind,state,submissionID'&&r.kind==='app-closure-review/v2'&&r.state==='review_not_found'&&r.epochID===saved.epochID&&r.submissionID===saved.submissionID)return null;
  if(Object.keys(r).sort().join(',')!=='epochID,kind,reviewRequestID,state,submissionID'||r.kind!=='app-closure-review/v2'||r.epochID!==saved.epochID||r.submissionID!==saved.submissionID||!closureID(r.reviewRequestID)||!['review_required','cancelled'].includes(String(r.state))||action==='request'&&r.state!=='review_required'||action==='cancel'&&r.state!=='cancelled')throw Error('保存した申請と確認結果が一致しません。');
  return Object.freeze({...r}) as WebClosureReview;
}
async function refresh(options:Options,saved:SavedWebClosureSubmission):Promise<WebClosureState>{
  const reference=await stored(options,saved);
  try{
    const progress=await readWebClosureProgress({...options,saved:reference});
    await (options.vault??webClosureReferences).markRetirement(reference);options.signal.throwIfAborted();await options.session();
    return Object.freeze({kind:'progress',progress});
  }catch(error){
    if(!(error instanceof ClosureProgressUnavailable)||reference.retirementObserved)throw error;
  }
  const receipt=await review(options,reference,'read');
  // Missing review plus unmapped/expired progress is uncertain, not permission
  // to automatically repeat a write, replace its saved number, renew enrollment,
  // or erase browser/remote information. Explicit same-number recovery below
  // separately rechecks live enrollment, exact absence and current reference.
  return receipt?Object.freeze({kind:'review',receipt}):Object.freeze({kind:'unconfirmed'});
}
function timed(options:Options):Options{return {...options,signal:AbortSignal.any([options.signal,AbortSignal.timeout(30000)])};}
export async function refreshWebClosure(options:Options,saved:SavedWebClosureSubmission):Promise<WebClosureState>{return refresh(await boundSession(timed(options)),Object.freeze({...saved}));}
async function prepare(op:Options){
  const enrollment=await readOrEnrollWebAccount(op);
  if(!enrollment.enrolled||!enrollment.epochID)throw Error('このログインのおうちメンテ登録を確認してください。');
  const reference=await (op.vault??webClosureReferences).current(op.account,enrollment.epochID);op.signal.throwIfAborted();
  const state=reference?await refresh(op,reference):null;
  return {epochID:enrollment.epochID,reference,state,canRequest:reference===null||state?.kind==='review'&&state.receipt.state==='cancelled'};
}
/** Opening the confirmation form performs reads only. */
export async function prepareWebClosureRequest(options:Options){return prepare(await boundSession(timed(options)));}
export async function requestWebClosure(options:Options&{password:string;onSaved?:(saved:WebClosureReference)=>void}):Promise<{reference:WebClosureReference;state:WebClosureState}>{
  if(!options.password||options.password.length>1024)throw Error('本人確認のパスワードを入力してください。');
  const password=options.password,onSaved=options.onSaved,op=await boundSession(timed(options)),vault=op.vault??webClosureReferences;
  // Read existing registration only. No consent, signup or auto-enrollment.
  const prepared=await prepare(op);
  if(!prepared.canRequest)throw Error('保存した申請の状況を先に確認してください。');
  await op.session();op.signal.throwIfAborted();
  const reference=await vault.reserve(op.account,prepared.epochID,prepared.reference?.submissionID);
  op.signal.throwIfAborted();await op.session();onSaved?.(reference);
  const receipt=await review(op,reference,'request',password);
  if(!receipt)throw Error('申請の受付を確認できません。保存した申請を確認してください。');
  return {reference,state:Object.freeze({kind:'review',receipt})};
}
export async function cancelWebClosure(options:Options,saved:SavedWebClosureSubmission):Promise<WebClosureState>{
  const op=await boundSession(timed(options)),reference=Object.freeze({...saved});
  const current=await refresh(op,reference);
  if(current.kind!=='review'||current.receipt.state!=='review_required')throw Error('取消可能な受付状態を確認できません。もう一度状況を確認してください。');
  const receipt=await review(op,reference,'cancel');
  if(!receipt)throw Error('取消を確認できません。');return Object.freeze({kind:'review',receipt});
}

/** Explicit retry of the SAME durable submission only. Never reserve a new ID,
 * auto-enroll, renew a retired scope, or infer deletion/absence from a timeout.
 * An accepted request is recovered by readback; only exact fresh unavailable
 * progress + missing review permits showing the manual retry confirmation.
 */
async function prepareRetry(op:Options,saved:SavedWebClosureSubmission){
  const reference=await stored(op,Object.freeze({...saved})),vault=op.vault??webClosureReferences;
  const current=await vault.current(op.account,reference.epochID);op.signal.throwIfAborted();
  if(!current||current.submissionID!==reference.submissionID||current.retirementObserved||reference.retirementObserved)throw Error('現在の申請状況を確認してください。');
  const enrollment=await readOrEnrollWebAccount(op);
  if(!enrollment.enrolled||enrollment.epochID!==reference.epochID)throw Error('申請時のおうちメンテ登録を確認できません。');
  const state=await refresh(op,reference);
  return {reference,state,canRetry:state.kind==='unconfirmed'};
}
export async function prepareWebClosureRetry(options:Options,saved:SavedWebClosureSubmission){
  return prepareRetry(await boundSession(timed(options)),saved);
}
export async function retryWebClosure(options:Options&{password:string},saved:SavedWebClosureSubmission):Promise<{reference:WebClosureReference;state:WebClosureState}>{
  if(!options.password||options.password.length>1024)throw Error('本人確認のパスワードを入力してください。');
  const password=options.password,op=await boundSession(timed(options)),prepared=await prepareRetry(op,saved);
  if(!prepared.canRetry)throw Error('受付済み、または処理中の申請です。保存した状況を確認してください。');
  const current=await (op.vault??webClosureReferences).current(op.account,prepared.reference.epochID);
  if(!current||current.submissionID!==prepared.reference.submissionID||current.retirementObserved)throw Error('申請状況が変わりました。');
  op.signal.throwIfAborted();await op.session();
  const receipt=await review(op,prepared.reference,'request',password);
  if(!receipt)throw Error('受付結果を確認できません。保存した申請を読み直してください。');
  return {reference:prepared.reference,state:Object.freeze({kind:'review',receipt})};
}
