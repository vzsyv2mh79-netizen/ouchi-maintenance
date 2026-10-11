type JobResult={status:'unclaimed'|'recorded'|'unconfirmed';outcome?:string};
export type NativePushBatchDependencies={
 page:(after:string|null,limit:number)=>Promise<string[]>;
 enqueue:(registration:string)=>Promise<string|null>;
 run:(job:string,signal?:AbortSignal)=>Promise<JobResult>;
};
const valid=(id:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)&&id!=='00000000-0000-0000-0000-000000000000';
/** Bounded internal execution; no timer, public endpoint or external sending is enabled. */
export async function runNativePushBatch(deps:NativePushBatchDependencies,signal?:AbortSignal,after:string|null=null){
 if(after!==null&&!valid(after))throw Error('Invalid notification cursor');
 let cursor:string|null=after,visited=0,accepted=0,unconfirmed=0;
 const result=(status:'complete'|'partial'|'cancelled'|'unconfirmed')=>({status,cursor,visited,accepted,unconfirmed});
 for(let page=0;page<4;page++){
  if(signal?.aborted)return result('cancelled');
  let rows:string[];
  try{rows=await deps.page(cursor,25);}catch{return result('unconfirmed');}
  if(!Array.isArray(rows)||rows.length>25)return result('unconfirmed');
  let previous=cursor;
  for(const id of rows){
   if(typeof id!=='string'||!valid(id)||(previous!==null&&id<=previous))return result('unconfirmed');
   previous=id;
  }
  if(rows.length===0)return result('complete');
  for(const id of rows){
   if(signal?.aborted)return result('cancelled');
   let job:string|null;
   try{job=await deps.enqueue(id);}catch{return result('unconfirmed');}
   if(job!==null){
    if(typeof job!=='string'||!valid(job))return result('unconfirmed');
    if(signal?.aborted)return result('cancelled');
    let outcome:JobResult;
    try{outcome=await deps.run(job,signal);}catch{unconfirmed++;return result('unconfirmed');}
    if(outcome.status==='recorded'&&outcome.outcome==='accepted')accepted++;
    if(outcome.status==='unconfirmed')unconfirmed++;
   }
   cursor=id;visited++;
  }
  if(rows.length<25)return result(signal?.aborted?'cancelled':'complete');
 }
 return result('partial');
}
