/** Billing-only Supabase transport. An aborted request may already have committed server-side. */
export function createBillingFetch(timeoutMs=10000):typeof fetch{
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw new Error('Invalid billing transport deadline');
 return async(input,init)=>{
  const signals=[AbortSignal.timeout(timeoutMs)];
  if(input instanceof Request)signals.push(input.signal);
  if(init?.signal)signals.push(init.signal);
  return fetch(input,{...init,signal:AbortSignal.any(signals)});
 };
}
