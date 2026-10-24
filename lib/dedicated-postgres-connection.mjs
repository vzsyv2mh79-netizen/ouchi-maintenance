/** Dedicated driver transport for private server adapters. The caller supplies
 * a freshly constructed pg.Client with approved credentials/TLS. This module
 * discovers no credentials, opens no pool and never retries an unknown write.
 * SQL authorization and deadlines remain in the private transaction adapter.
 */
async function bounded(work,signal,budgetMs){
 // Timer delivery can lag behind a resolved driver response. Preserve the
 // original operation budget even then; a late COMMIT remains uncertain.
 const deadline=performance.now()+budgetMs;
 const current=()=>{signal.throwIfAborted();if(performance.now()>=deadline)throw Error('Private PostgreSQL operation deadline');};
 current();let stop;
 const cancelled=new Promise((_,reject)=>{stop=()=>reject(signal.reason);signal.addEventListener('abort',stop,{once:true});});
 try{const value=await Promise.race([Promise.resolve().then(()=>{current();return work();}),cancelled]);current();return value;}
 finally{signal.removeEventListener('abort',stop);}
}
export function createDedicatedPostgresConnection({createClient}){
 if(typeof createClient!=='function')throw Error('Fresh private PostgreSQL client required');
 const used=new WeakSet();
 return async({signal})=>{
  if(!(signal instanceof AbortSignal))throw Error('Connection cancellation required');
  signal.throwIfAborted();
  const client=createClient({connectionTimeoutMillis:3000,query_timeout:5000});
  if(!client||typeof client!=='object'||used.has(client)||['connect','query','end','on'].some(key=>typeof client[key]!=='function'))throw Error('Fresh dedicated PostgreSQL client required');
  used.add(client);let closing,busy=false,closed=false;
  const abort=()=>{
   closed=true;
   if(!closing){
    let finish,fail;
    closing=new Promise((resolve,reject)=>{finish=resolve;fail=reject;});
    // pg.Client.end interrupts an active query rather than pooling/reusing it.
    // Publish the shutdown latch before the driver can synchronously emit error.
    try{Promise.resolve(client.end()).then(finish,fail);}catch(error){fail(error);}
    void closing.catch(()=>{});
   }
  };
  const close=async()=>{
   abort();signal.removeEventListener('abort',abort);
   await bounded(()=>closing,AbortSignal.timeout(1000),1000);
  };
  client.on('error',abort);signal.addEventListener('abort',abort,{once:true});
  try{
   await bounded(()=>client.connect(),AbortSignal.any([signal,AbortSignal.timeout(3000)]),3000);
   signal.throwIfAborted();if(closed)throw Error('Private PostgreSQL connection ended');
  }catch(error){try{await close();}catch{/* Preserve acquisition refusal, never reuse the driver. */}throw error;}
  return Object.freeze({abort,close,query:async(sql,args)=>{
   signal.throwIfAborted();if(closed||busy)throw Error('Private PostgreSQL connection unavailable');
   busy=true;
   try{return await bounded(()=>client.query(sql,args),AbortSignal.any([signal,AbortSignal.timeout(5000)]),5000);}
   catch(error){abort();throw error;}
   finally{busy=false;}
  }});
 };
}
