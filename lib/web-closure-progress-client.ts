import {closureID,closureJSON,type ClosureTransport} from './web-closure-transport';
export type SavedWebClosureSubmission=Readonly<{account:string;epochID:string;submissionID:string}>;
export type WebClosureProgress=Readonly<{kind:'app-closure-progress/v1';epochID:string;submissionID:string;requestID:string;state:'pending'|'running'|'complete'|'failed'}>;
/** Exact scoped canonical 404 permits only reading the older review, never resubmission. */
export class ClosureProgressUnavailable extends Error {}
export async function readWebClosureProgress(options:ClosureTransport&{saved:SavedWebClosureSubmission}):Promise<WebClosureProgress>{
 const saved=Object.freeze({...options.saved});
 if(!closureID(saved.account)||!closureID(saved.epochID)||!closureID(saved.submissionID))throw Error('保存した退会申請が必要です。');
 const {status,value}=await closureJSON({...options,account:saved.account,path:'progress',body:{expectedEpochID:saved.epochID,submissionID:saved.submissionID},statuses:[200,404]});
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('確認結果を読み取れません。');const r=value as Record<string,unknown>;
 if(status===404&&Object.keys(r).sort().join(',')==='epochID,kind,state,submissionID'&&r.kind==='app-closure-progress/v1'&&r.state==='progress_unavailable'&&r.epochID===saved.epochID&&r.submissionID===saved.submissionID)throw new ClosureProgressUnavailable('処理の状況を確認できません。保存した申請情報は残してください。');
 if(status!==200||Object.keys(r).sort().join(',')!=='epochID,kind,requestID,state,submissionID'||r.kind!=='app-closure-progress/v1'||r.epochID!==saved.epochID||r.submissionID!==saved.submissionID||!closureID(r.requestID)||!['pending','running','complete','failed'].includes(String(r.state)))throw Error('保存した申請と確認結果が一致しません。');
 return Object.freeze({...r}) as WebClosureProgress;
}
