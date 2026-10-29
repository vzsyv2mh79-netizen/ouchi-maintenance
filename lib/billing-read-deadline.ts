/** Bounds waiting for read-only Apple requests. Does not cancel the SDK HTTP transport. */
export function boundedBillingRead<T>(read:()=>Promise<T>,signal?:AbortSignal,timeoutMs=15000):Promise<T>{
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000)return Promise.reject(new Error('Invalid billing read deadline'));
 if(signal?.aborted)return Promise.reject(new Error('Billing read cancelled'));
 return new Promise<T>((resolve,reject)=>{
  let settled=false;
  const finish=(error:Error|null,value?:T)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);if(error)reject(error);else resolve(value as T);};
  const cancel=()=>finish(new Error('Billing read cancelled'));
  const timer=setTimeout(()=>finish(new Error('Billing read deadline exceeded')),timeoutMs);
  signal?.addEventListener('abort',cancel,{once:true});
  if(signal?.aborted){cancel();return;}
  Promise.resolve().then(()=>{if(settled)return undefined;return read();}).then(value=>{if(!settled)finish(null,value);},()=>finish(new Error('Billing read unavailable')));
 });
}
