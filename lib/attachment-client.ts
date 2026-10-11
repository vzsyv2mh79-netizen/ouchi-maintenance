export type AttachmentItem={id:string;size:number;mime:string;createdAt:string};
export type AttachmentBinding={account:string;epoch:string};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validID=(value:unknown):value is string=>typeof value==='string'&&uuid.test(value)&&value!=='00000000-0000-0000-0000-000000000000';
/** Same-origin only; bearer tokens are never forwarded through redirects. */
async function read(query:URLSearchParams,token:string,signal:AbortSignal,limit:number,write?:{method:'POST'|'DELETE';epoch:string;mime?:string;body?:Blob}){
 if(!token||token.length>16384||/\s/.test(token))throw Error('ログインを確認してください。');
 signal.throwIfAborted();
 if(write&&!validID(write.epoch))throw Error('登録状態を確認してください。');
 const headers:Record<string,string>={Authorization:'Bearer '+token};if(write){headers['X-Ouchi-App-Epoch']=write.epoch.toLowerCase();if(write.mime)headers['Content-Type']=write.mime;}
 const response=await fetch('/api/product-attachments?'+query,{method:write?.method??'GET',body:write?.body,headers,cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(30000)])});
 if(!response.ok)throw Error(response.status===401?'ログインを確認してください。':response.status===404?'このファイルへのアクセスを確認できません。':write?.method==='DELETE'?'削除完了を確認できませんでした。同じファイルで再確認してください。':'保存サービスを確認できませんでした。');
 const declared=response.headers.get('content-length');
 if(declared!==null&&(!/^\d+$/.test(declared)||!Number.isSafeInteger(Number(declared))||Number(declared)>limit)){await response.body?.cancel();throw Error('ファイルのサイズを確認できません。');}
 if(!response.body)throw Error('応答を確認できません。');
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0,finished=false;
 try{while(true){signal.throwIfAborted();const {done,value}=await reader.read();signal.throwIfAborted();if(done){finished=true;break;}size+=value.byteLength;if(size>limit)throw Error('応答のサイズを確認できません。');chunks.push(value);}}
 finally{if(!finished)await reader.cancel().catch(()=>{});reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 return {bytes,headers:response.headers};
}
export async function attachmentBinding(token:string,signal:AbortSignal):Promise<AttachmentBinding>{
 const {bytes}=await read(new URLSearchParams({binding:'true'}),token,signal,4096);const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 if(!validID(value.account)||!validID(value.epoch)||value.account.toLowerCase()===value.epoch.toLowerCase())throw Error('登録状態を確認できません。');
 return {account:value.account.toLowerCase(),epoch:value.epoch.toLowerCase()};
}
export async function attachmentPage(product:string,after:string|null,token:string,signal:AbortSignal):Promise<{items:AttachmentItem[];next:string|null}>{
 if(!validID(product)||(after!==null&&!validID(after)))throw Error('製品を確認してください。');
 const query=new URLSearchParams({productId:product.toLowerCase(),page:'true'});if(after)query.set('after',after.toLowerCase());
 const {bytes}=await read(query,token,signal,32768);const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 if(!Array.isArray(value.items)||value.items.length>25||value.items.some((item:AttachmentItem)=>!item||!validID(item.id)||!Number.isSafeInteger(item.size)||item.size<1||item.size>5242880||!['image/jpeg','image/png','application/pdf'].includes(item.mime)||typeof item.createdAt!=='string'||item.createdAt.length>64||!Number.isFinite(Date.parse(item.createdAt))))throw Error('一覧を確認できません。');
 const items:AttachmentItem[]=value.items.map((item:AttachmentItem)=>({...item,id:item.id.toLowerCase()}));
 if(new Set(items.map(item=>item.id)).size!==items.length||items.some((item,index)=>index>0&&item.id<=items[index-1].id||after!==null&&item.id<=after.toLowerCase())||value.next!==null&&(!validID(value.next)||items.length!==25||value.next.toLowerCase()!==items.at(-1)?.id))throw Error('一覧の順序を確認できません。');
 return {items,next:value.next?.toLowerCase()??null};
}
export async function downloadAttachment(id:string,token:string,signal:AbortSignal):Promise<{blob:Blob;filename:string}>{
 if(!validID(id))throw Error('ファイルを確認してください。');id=id.toLowerCase();
 const {bytes,headers}=await read(new URLSearchParams({attachmentId:id}),token,signal,5242880);
 const mime=headers.get('content-type'),type=mime==='image/png'?{extension:'png',prefix:[137,80,78,71,13,10,26,10]}:mime==='image/jpeg'?{extension:'jpg',prefix:[255,216,255]}:mime==='application/pdf'?{extension:'pdf',prefix:[37,80,68,70,45]}:null;
 if(!type||!bytes.length||!type.prefix.every((byte,index)=>bytes[index]===byte))throw Error('ファイル形式を確認できません。');
 const filename=`ouchi-attachment-${id}.${type.extension}`;
 if(headers.get('content-disposition')!==`attachment; filename="${filename}"`)throw Error('ファイル名を確認できません。');
 return {blob:new Blob([bytes],{type:mime!}),filename};
}
/** Caller must persist the immutable pending receipt before sending this same ID. */
export async function uploadAttachment(input:{product:string;id:string;epoch:string;blob:Blob;mime:string;confirmed:boolean},token:string,signal:AbortSignal){
 if(!input.confirmed||!validID(input.product)||!validID(input.id)||!(input.blob instanceof Blob)||input.blob.size<1||input.blob.size>5242880||!['image/jpeg','image/png','application/pdf'].includes(input.mime))throw Error('保存するファイルと確認内容を見直してください。');
 const {bytes}=await read(new URLSearchParams({productId:input.product.toLowerCase(),attachmentId:input.id.toLowerCase()}),token,signal,4096,{method:'POST',epoch:input.epoch,mime:input.mime,body:input.blob});
 const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 if(value.saved!==true||typeof value.attachmentId!=='string'||value.attachmentId.toLowerCase()!==input.id.toLowerCase())throw Error('保存結果を確認できません。同じファイルで再確認してください。');
}
export async function removeAttachment(id:string,epoch:string,confirmed:boolean,token:string,signal:AbortSignal){
 if(!confirmed||!validID(id))throw Error('削除するファイルを確認してください。');
 const {bytes}=await read(new URLSearchParams({attachmentId:id.toLowerCase()}),token,signal,4096,{method:'DELETE',epoch});
 const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 if(value.removed!==true||typeof value.attachmentId!=='string'||value.attachmentId.toLowerCase()!==id.toLowerCase())throw Error('削除結果を確認できません。同じファイルで再確認してください。');
}
