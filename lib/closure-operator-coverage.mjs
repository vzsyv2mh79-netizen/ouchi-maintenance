import {open,constants} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createAccountContentReviewPorts} from './closure-account-content-review.mjs';
import {createPrivateOperatorConnection} from './closure-operator-connection.mjs';
import {readPrivateOperatorJSON} from './closure-operator-inspection.mjs';

const methods=Object.freeze({'capture':'capture','status':'status','page':'page','text':'readText'});
function request(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||!Object.hasOwn(methods,input.operation))throw Error('Explicit coverage operation required');
 const {operation,...scope}=input;return {operation,scope:Object.freeze(scope)};
}

/** Same principal as the later decision writer. Capture creates private review
 * metadata only; it does not authorize retirement or alter household content.
 * Reads return saved inventory; full text is read only when it still matches
 * the captured digest. No historical text copy is stored by the SQL snapshot.
 * The current-state check is a separate observation, not a future write permit.
 */
export async function inspectPrivateOperatorCoverage({connect,input,signal}){
 const {operation,scope}=request(input),ports=createAccountContentReviewPorts({connect});
 const result=await ports.coverage[methods[operation]](scope,signal);
 const {planID,reviewRequestID,userID,epochID}=scope;
 const status=operation==='status'||operation==='capture'?result:await ports.coverage.status({planID,reviewRequestID,userID,epochID},signal);
 return Object.freeze({kind:'closure-operator-coverage/v1',operation,scope,result,status,observedAt:new Date().toISOString(),
  currentMayChange:true,approvalRecorded:false,retirementExecuted:false,accountErasureConfirmed:false});
}

const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function shell(title,body){
 return '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'"><title>'+escape(title)+'｜おうちメンテ</title><style>body{font:17px/1.8 system-ui,sans-serif;max-width:760px;margin:auto;padding:24px;color:#202124;background:#fafafa}h1{font-size:1.6rem}h2{font-size:1.15rem}aside{padding:16px;border:1px solid #999;border-radius:12px}article{border-bottom:1px solid #aaa;padding:12px 0}pre,.content{white-space:pre-wrap;overflow-wrap:anywhere}pre{font-size:14px}details{margin-top:24px}@media(prefers-color-scheme:dark){body{color:#eee;background:#161719}}</style></head><body><h1>'+escape(title)+'</h1>'+body+'</body></html>';
}
export function renderPrivateOperatorCoverage(report){
 if(report?.kind!=='closure-operator-coverage/v1'||!Object.hasOwn(methods,report.operation)||!report.scope||!report.status
  ||typeof report.observedAt!=='string'||typeof report.status.current!=='boolean'||report.approvalRecorded!==false||report.retirementExecuted!==false||report.accountErasureConfirmed!==false)throw Error('Confirmed coverage report required');
 const encoded=JSON.stringify(report);
 if(Buffer.byteLength(encoded)>1048576)throw Error('Bounded coverage report required');
 let body='<aside>運営者向けの非公開の確認画面です。判断の承認・記録の書き換え・退会処理は実行していません。</aside><p>'+(report.status.current?'最後の確認時点では、固定した確認対象と現在の記録は一致しています。以後に変更される可能性があります。':'現在の記録と一致していることを確認できません。この確認結果を退会の根拠に使わず、変更内容を確認してください。')+'</p>';
 body+='<p>確認時刻：'+escape(report.observedAt)+'</p>';
 if(report.operation==='text')body+='<h2>確認対象と一致した本文</h2><div class="content">'+escape(report.result.value)+'</div>';
 else if(report.operation==='page'){
  const labels={scope:'共有する住まい',scope_gap:'確認が必要な範囲',text:'本文',personal_file:'個人の添付',household_file:'住まいの添付'};
  const relations={homes:'住まい',products:'製品',maintenance_tasks:'お手入れ',maintenance_history:'完了履歴',home_members:'家族の表示名'};
  const fields={name:'名前',maker:'メーカー',modelNumber:'品番',memo:'メモ',sourceUrl:'出典URL',sourceNote:'出典メモ',sourceFrequency:'頻度の説明',note:'メモ',nickname:'表示名',categoryId:'分類'};
  body+='<p>今回の表示：'+report.result.items.length+'件</p>'+report.result.items.map(row=>'<article><h2>'+escape(labels[row.kind]??row.kind)+'</h2><p>'+escape(relations[row.relation_name]??row.relation_name??'')+' '+escape(fields[row.field_name]??row.field_name??'')+'</p><pre>'+escape(row.item_key)+'</pre></article>').join('');
  body+=report.result.hasMore?'<p>続きがあります。一覧の一部だけでは確認完了になりません。</p>':'<p>このページが一覧の末尾です。本文や添付の確認完了を意味しません。</p>';
 }else body+='<p>確認対象：'+escape(report.status.itemCount)+'件 ／ 未解決：'+escape(report.status.unresolvedCount)+'件</p>';
 body+='<p>画像・PDFの本文確認や投稿者の確認は、この画面だけでは完了しません。照合情報と確認の根拠は非公開で管理してください。</p><details><summary>照合情報（運営用）</summary><pre>'+escape(encoded)+'</pre></details>';
 return shell('退会申請の確認対象',body);
}

export async function runPrivateOperatorCoverage({args,createClient}){
 const keys=['--config','--project-ref','--request','--output'];
 if(!Array.isArray(args)||args.length!==9||!['--capture-review','--read-review'].includes(args[0])
  ||keys.some((key,i)=>args[1+i*2]!==key||typeof args[2+i*2]!=='string'||!args[2+i*2]))throw Error('Explicit coverage command required');
 const [rawConfig,input]=await Promise.all([readPrivateOperatorJSON(args[2]),readPrivateOperatorJSON(args[6])]);
 const {operation}=request(input);
 if((args[0]==='--capture-review')!==(operation==='capture'))throw Error('Capture must be explicitly selected');
 const connect=createPrivateOperatorConnection({rawConfig,expectedProject:args[4],createClient,purpose:'decision'});
 const handle=await open(args[8],constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
 const digest=createHash('sha256').update(JSON.stringify(input)).digest('hex');
 const write=async html=>{
  const bytes=Buffer.from(html);await handle.truncate(0);let offset=0;
  while(offset<bytes.length){const {bytesWritten}=await handle.write(bytes,offset,bytes.length-offset,offset);if(!bytesWritten)throw Error('Coverage report write unavailable');offset+=bytesWritten;}
  await handle.sync();
 };
 try{
  await write(shell('確認結果は未確認です','<p>通信結果を確認できていません。元の依頼と同じ確認番号を保持し、同じ依頼を確認してください。新しい番号を自動で作らないでください。退会の完了を意味しません。</p><pre>'+digest+'</pre>'));
  const report=await inspectPrivateOperatorCoverage({connect,input,signal:AbortSignal.timeout(15000)});
  await write(renderPrivateOperatorCoverage(report));
  return Object.freeze({status:'saved',operation,output:args[8],approvalRecorded:false,retirementExecuted:false,accountErasureConfirmed:false});
 }finally{await handle.close();}
}
