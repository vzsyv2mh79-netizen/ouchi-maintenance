import {open,constants} from 'node:fs/promises';
import {createDedicatedPostgresConnection} from './dedicated-postgres-connection.mjs';
import {createAccountContentReviewPorts} from './closure-account-content-review.mjs';

const principal='ouchi_closure_inspection_runtime';
export function operatorInspectionConfig(raw,expectedProject){
 try{
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||!/^[a-z]{20}$/.test(expectedProject)
   ||Object.keys(raw).some(key=>!['projectRef','databaseURL','ca'].includes(key))||raw.projectRef!==expectedProject||typeof raw.databaseURL!=='string')return null;
  const url=new URL(raw.databaseURL);
  if(!['postgres:','postgresql:'].includes(url.protocol)||url.search||url.hash||url.pathname!=='/postgres'||(url.port&&url.port!=='5432'))return null;
  const user=decodeURIComponent(url.username),password=decodeURIComponent(url.password);
  const direct=url.hostname==='db.'+expectedProject+'.supabase.co'&&user===principal;
  const pooled=/^aws-\d+-[a-z]+-[a-z]+-\d+\.pooler\.supabase\.com$/.test(url.hostname)&&user===principal+'.'+expectedProject;
  if((!direct&&!pooled)||!password||password.length>2000)return null;
  if(raw.ca!==undefined&&(typeof raw.ca!=='string'||raw.ca.length>65536||!raw.ca.startsWith('-----BEGIN CERTIFICATE-----')||!raw.ca.trimEnd().endsWith('-----END CERTIFICATE-----')))return null;
  return Object.freeze({principal,database:Object.freeze({host:url.hostname,port:5432,user,password,database:'postgres',
   ssl:Object.freeze({rejectUnauthorized:true,...(raw.ca?{ca:raw.ca}:{})}),application_name:'ouchi-operator-inspection'})});
 }catch{return null;}
}

/** Never discover an admin/service credential or relax certificate validation. */
export function createOperatorInspectionConnection({rawConfig,expectedProject,createClient}){
 const config=operatorInspectionConfig(rawConfig,expectedProject);
 if(!config||typeof createClient!=='function')throw Error('Private operator configuration required');
 const acquire=createDedicatedPostgresConnection({createClient:bounds=>createClient({...config.database,...bounds})});
 return async options=>{
  const connection=await acquire(options);
  try{
   const result=await connection.query('select session_user::text as principal,current_database()::text as database');
   if(result?.rows?.length!==1||result.rows[0].principal!==config.principal||result.rows[0].database!=='postgres')throw Error('Private operator principal unavailable');
   return Object.freeze({...connection,query:async(sql,args)=>{
    const result=await connection.query(sql,args);
    if(sql==='BEGIN'||sql==='BEGIN READ ONLY')await connection.query('SET LOCAL ROLE ouchi_closure_inspector');
    return result;
   }});
  }catch(error){await connection.close();throw error;}
 };
}

/** Credential and scoped-request inputs must be private, bounded regular files.
 * No environment fallback, symlink following or unbounded readFile allocation. */
export async function readPrivateOperatorJSON(path){
 const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{
  const stat=await handle.stat();
  if(!stat.isFile()||stat.uid!==process.getuid()||stat.nlink!==1||![0o400,0o600].includes(stat.mode&0o7777)||stat.size<1||stat.size>98304)throw Error('Private operator input unavailable');
  const bytes=Buffer.alloc(98305),read=await handle.read(bytes,0,bytes.length,0);
  if(read.bytesRead<1||read.bytesRead>98304)throw Error('Private operator input unavailable');
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,read.bytesRead)));
 }finally{await handle.close();}
}

/** Only these five bounded reads are exposed. Approval, redaction, copying,
 * retirement and worker execution are not dispatchable through this inspector. */
export async function inspectClosureOperatorRequest({connect,input,signal}){
 if(!input||typeof input!=='object'||Array.isArray(input)||typeof input.operation!=='string')throw Error('Explicit inspection operation required');
 const {operation,...scope}=input;
 const ports=createAccountContentReviewPorts({connect});
 let result;
 switch(operation){
  case 'queue':
   if(Object.keys(scope).sort().join(',')!=='afterReview')throw Error('Explicit queue cursor required');
   result=await ports.personalFiles.queue(scope.afterReview,signal);break;
  case 'fields':result=await ports.personalFiles.inventory(scope,signal);break;
  case 'field':result=await ports.personalFiles.readField(scope,signal);break;
  case 'files':result=await ports.personalFiles.fileInventory(scope,signal);break;
  case 'household-files':result=await ports.householdFiles.fileInventory(scope,signal);break;
  default:throw Error('Read-only inspection operation required');
 }
 return Object.freeze({kind:'closure-operator-inspection/v1',operation,observedAt:new Date().toISOString(),
  scope:Object.freeze({...scope}),consistentSnapshot:false,approvalRecorded:false,accountErasureConfirmed:false,result});
}

const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function inspectionContent(report){
 const data=report.result;
 const relations={homes:'住まい',products:'製品',maintenance_tasks:'お手入れ',maintenance_history:'完了履歴',home_members:'家族の表示名'};
 const fields={name:'名前',maker:'メーカー',modelNumber:'品番',memo:'メモ',sourceUrl:'出典URL',sourceNote:'出典メモ',sourceFrequency:'頻度の説明',note:'メモ',nickname:'表示名',categoryId:'分類'};
 if(report.operation==='field')return '<h2>確認する本文</h2><div class="content">'+escape(data.value===null?'（空欄）':data.value)+'</div>';
 if(report.operation==='queue'){
  const states={needs_review:'追加確認が必要',assessment_recorded:'確認内容を記録済み（削除の承認ではありません）',revoked:'判断の撤回'};
  return data.length?'<p>'+data.length+'件を表示しています。一度に確認できるのは50件までです。</p>'+data.map((row,i)=>'<article><h2>申請 '+(i+1)+'</h2><p>受付日時：'+escape(row.requested_at)+'</p><p>'+escape(states[row.latest_outcome]??'未確認')+'</p></article>').join(''):'<p>このページに表示する申請はありません。</p>';
 }
 if(!Array.isArray(data.items))throw Error('Inspection items required');
 if(report.operation==='fields')return (data.items.length?data.items.map(row=>'<article><h2>'+escape(relations[row.relation_name]??row.relation_name)+'・'+escape(fields[row.field_name]??row.field_name)+'</h2><div class="content">'+escape(row.preview)+'</div>'+(row.truncated?'<p><strong>一部のみの表示です。全文の確認が必要です。</strong></p>':'')+'</article>').join(''):'<p>このページに表示する項目はありません。</p>')+(data.hasMore?'<p>続きの項目があります。</p>':'');
 return '<p>画像やPDFの内容は表示していません。ファイルの情報だけで保管・削除の判断をしないでください。</p>'+(data.items.length?data.items.map((row,i)=>'<article><h2>ファイル '+(i+1)+'</h2><p>形式：'+escape(row.mime)+' ／ 容量：'+escape(row.size_bytes)+' bytes</p><p>状態：'+escape(row.file_state)+'</p></article>').join(''):'<p>このページに表示するファイルはありません。</p>')+(data.hasMore?'<p>続きのファイルがあります。</p>':'');
}
export function renderOperatorInspection(report){
 if(report?.kind!=='closure-operator-inspection/v1'||!report.scope||typeof report.scope!=='object'||Array.isArray(report.scope)||report.approvalRecorded!==false||report.accountErasureConfirmed!==false)throw Error('Inspection report required');
 const body=JSON.stringify(report.result,null,2);
 if(typeof body!=='string'||Buffer.byteLength(body)>1048576)throw Error('Bounded inspection report required');
 const labels={queue:'退会申請の一覧',fields:'確認する記録の一覧',field:'記録の本文',files:'添付ファイルの一覧','household-files':'住まいで保管するファイルの一覧'};
 if(!Object.hasOwn(labels,report.operation))throw Error('Inspection report required');
 const metadata=structuredClone(report.result);
 if(report.operation==='field')delete metadata.value;
 if(report.operation==='fields')for(const row of metadata.items)delete row.preview;
 return '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'"><title>退会申請の確認｜おうちメンテ</title><style>body{font:17px/1.8 system-ui,sans-serif;max-width:760px;margin:0 auto;padding:24px;color:#202124;background:#fafafa}h1{font-size:1.6rem}h2{font-size:1.2rem}aside{padding:16px;border:1px solid #aaa;border-radius:12px}article{padding:12px 0;border-bottom:1px solid #aaa}.content{white-space:pre-wrap;overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:14px/1.8 ui-monospace,monospace;padding:16px;background:#eee;border-radius:12px}details{margin-top:24px}@media(prefers-color-scheme:dark){body{color:#eee;background:#161719}pre{background:#242527}}</style></head><body><h1>'+labels[report.operation]+'</h1><aside>運営者向け・閲覧専用です。承認・記録の変更・退会処理は実行していません。<p>表示内容には非公開の申請情報が含まれます。公開サイトや共有フォルダへ置かないでください。</p></aside><p>確認時刻：'+escape(report.observedAt)+'</p><p>複数ページは同じ時点の一覧とは限りません。省略表示やファイルの情報だけで、投稿者や内容の確認を終えたとは扱いません。</p>'+inspectionContent(report)+'<details><summary>照合情報（運営用）</summary><pre>'+escape(JSON.stringify({request:report.scope,result:metadata},null,2))+'</pre></details></body></html>';
}

export async function savePrivateOperatorInspection(path,report){
 const html=renderOperatorInspection(report);
 const handle=await open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
 try{await handle.writeFile(html,'utf8');}
 finally{await handle.close();}
}

export async function runPrivateOperatorInspection({args,createClient}){
 const keys=['--config','--project-ref','--request','--output'];
 if(!Array.isArray(args)||args.length!==8||keys.some((key,i)=>args[i*2]!==key||typeof args[i*2+1]!=='string'||!args[i*2+1]))throw Error('Explicit inspection arguments required');
 const [rawConfig,input]=await Promise.all([readPrivateOperatorJSON(args[1]),readPrivateOperatorJSON(args[5])]);
 const connect=createOperatorInspectionConnection({rawConfig,expectedProject:args[3],createClient});
 const report=await inspectClosureOperatorRequest({connect,input,signal:AbortSignal.timeout(15000)});
 await savePrivateOperatorInspection(args[7],report);
 return Object.freeze({status:'saved',operation:report.operation,output:args[7],approvalRecorded:false,accountErasureConfirmed:false});
}
