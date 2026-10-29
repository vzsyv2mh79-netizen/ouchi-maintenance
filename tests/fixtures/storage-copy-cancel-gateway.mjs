import assert from 'node:assert/strict';

// Disposable local gateway only. Observe a real committed Storage response,
// withhold its reply, then cancel the actual caller fetch. Never infer that
// cancellation rolled a write back. No credentials or arbitrary target origin.
export function createStorageCopyCancellation(){
 let state=null;
 const snapshot=()=>state?{requests:state.requests,status:state.status,upstreamEnded:state.upstreamEnded,downstreamClosed:state.downstreamClosed,failed:state.failed}:null;
 const ready=()=>{if(state?.upstreamEnded&&state.downstreamClosed)state.resolve();};
 return Object.freeze({
  start(path,abort){
   assert.equal(state,null);assert.match(path,/^[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.png$/);assert.equal(typeof abort,'function');
   let resolve;const quiet=new Promise(done=>{resolve=done;});
   state={path,abort,resolve,quiet,requests:0,status:null,upstreamEnded:false,downstreamClosed:false,failed:false,response:null};
  },
  intercept(req,res,response){
   if(!state||req.method!=='POST'||req.url!=='/storage/v1/object/ouchi-product-attachments/'+state.path)return false;
   state.requests++;
   if(state.requests!==1){state.failed=true;return false;}
   state.status=response.statusCode;state.response=res;
   res.once('close',()=>{state.downstreamClosed=true;ready();});
   response.once('error',()=>{state.failed=true;res.destroy();state.abort();});
   response.once('aborted',()=>{state.failed=true;res.destroy();state.abort();});
   response.once('end',()=>{
    state.upstreamEnded=true;
    if(!Number.isInteger(state.status)||state.status<200||state.status>=300)state.failed=true;
    // The actual Storage server has finished. With no response forwarded,
    // AbortController must close the real downstream HTTP request itself.
    state.abort();ready();
   });
   response.resume();return true;
  },
  async waitQuiet(signal){
   assert.ok(state);signal.throwIfAborted();let timer,stop;
   const cancelled=new Promise((_,reject)=>{stop=()=>reject(signal.reason);signal.addEventListener('abort',stop,{once:true});});
   const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Copy cancellation did not quiesce')),3000);});
   try{
    await Promise.race([state.quiet,cancelled,timeout]);signal.throwIfAborted();
    assert.deepEqual(snapshot(),{requests:1,status:state.status,upstreamEnded:true,downstreamClosed:true,failed:false});
    assert.ok(state.status>=200&&state.status<300);return snapshot();
   }finally{clearTimeout(timer);signal.removeEventListener('abort',stop);}
  },
  stats:snapshot,
  stop(){if(state&&!state.downstreamClosed)state.response?.destroy();}
 });
}
