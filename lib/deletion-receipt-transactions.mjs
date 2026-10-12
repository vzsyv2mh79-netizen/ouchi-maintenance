/** Prepared adapter for a dedicated connection, never a shared pool client.
 * connect({signal}) must bound acquisition. abort() synchronously closes the
 * transport, interrupting in-flight SQL; close() settles its shutdown.
 * A lost COMMIT acknowledgement remains ambiguous and requires receipt retry.
 */
export function createReceiptTransactions({connect}) {
 if(typeof connect!=='function')throw Error('Dedicated connection provider required');
 return async(callback,{signal,readOnly}={})=>{
  if(!(signal instanceof AbortSignal)||typeof readOnly!=='boolean')throw Error('Explicit cancellation and transaction mode required');
  signal.throwIfAborted();
  const connection=await connect({signal});
  if(!connection||typeof connection.query!=='function'||typeof connection.abort!=='function'||typeof connection.close!=='function')throw Error('Cancellable dedicated connection required');
  let aborted=false,begun=false,inQuery=false;
  const stop=()=>{aborted=true;connection.abort();};
  signal.addEventListener('abort',stop,{once:true});
  try {
   if(signal.aborted)stop();
   signal.throwIfAborted();
   const query=async(...args)=>{
    signal.throwIfAborted();
    if(inQuery)throw Error('Concurrent receipt SQL refused');
    inQuery=true;
    try {const result=await connection.query(...args);signal.throwIfAborted();return result;}
    finally {inQuery=false;}
   };
   await query(readOnly?'BEGIN READ ONLY':'BEGIN');begun=true;
   await query("SET LOCAL statement_timeout = '4500ms'");
   await query("SET LOCAL lock_timeout = '1000ms'");
   const result=await callback(Object.freeze({query,signal,readOnly}));
   signal.throwIfAborted();
   await query('COMMIT');begun=false;
   return result;
  } catch(error) {
   if(begun&&!aborted){try{await connection.query('ROLLBACK');}catch{connection.abort();}}
   throw error;
  } finally {
   signal.removeEventListener('abort',stop);
   await connection.close();
  }
 };
}
