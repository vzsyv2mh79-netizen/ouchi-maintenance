// Prepared server-only reader. No implicit credential/config discovery, writes,
// token creation, caching, raw Auth configuration output or deployment activation.
const duration = value => value === null || (Number.isSafeInteger(value) && value >= 0 && value <= 315360000);
// Reviewed against the official tagged Session.CheckValidity implementations.
// Version evidence must come from the trusted effective-policy source, never a
// dashboard observation, client body, subscription tier or default assumption.
const reviewedVersions = new Set(['v2.196.0', 'v2.197.0']);
const timestamp = value => typeof value === 'string' && /Z$/.test(value) ? Date.parse(value) : NaN;
const fresh = (checked, now) => Number.isFinite(checked) && Number.isFinite(now) && checked <= now && now - checked < 60000;
async function bounded(promise, signal) {
 signal.throwIfAborted(); let reject;
 const aborted = new Promise((_, fail) => { reject = fail; });
 const stop = () => reject(signal.reason); signal.addEventListener('abort', stop, {once:true});
 try { return await Promise.race([promise, aborted]); } finally { signal.removeEventListener('abort', stop); }
}
/** readEffectiveLowAAL must independently read effective configuration and Auth
 * version for the same project. Missing/unknown is not equivalent to disabled.
 * Caller supplies an approved Auth Config Read credential; none is created here.
 */
function createPolicyReader({projectID,accessToken,readEffectiveLowAAL,fetcher=fetch,clock=Date.now,timeoutMS=3000,strictHighestAAL=false}) {
 if(typeof projectID !== 'string' || !/^[a-z]{20}$/.test(projectID) || typeof accessToken !== 'string' || !accessToken || accessToken.length > 20000 || /\s/.test(accessToken) || typeof readEffectiveLowAAL !== 'function' || typeof fetcher !== 'function' || typeof clock !== 'function' || !Number.isInteger(timeoutMS) || timeoutMS < 1 || timeoutMS > 15000) throw Error('Explicit trusted policy source required');
 const endpoint = 'https://api.supabase.com/v1/projects/'+projectID+'/config/auth';
 const issued = new WeakMap();
 const read = async callerSignal => {
  if(!(callerSignal instanceof AbortSignal)) return null;
  const signal = AbortSignal.any([callerSignal, AbortSignal.timeout(timeoutMS)]);
  let reader, response;
  try {
   signal.throwIfAborted();
   const input = await bounded(Promise.resolve().then(() => readEffectiveLowAAL(signal)),signal);
   // Snapshot before the next await: a shared mutable source cannot change a
   // positive duration into null, or refresh its evidence timestamp in flight.
   const evidence = input && {projectID:input.projectID,checkedAt:input.checkedAt,authVersion:input.authVersion,allowLowAALSeconds:input.allowLowAALSeconds};
   const checked = timestamp(evidence?.checkedAt), started = clock();
   if(evidence?.projectID !== projectID || !fresh(checked,started) || !reviewedVersions.has(evidence.authVersion)
     || (!strictHighestAAL && (!duration(evidence.allowLowAALSeconds) || evidence.allowLowAALSeconds === 0))) return null;
   await bounded(Promise.resolve().then(() => fetcher(endpoint,{method:'GET',headers:{authorization:'Bearer '+accessToken},signal,redirect:'error',cache:'no-store'})).then(value => {
    response = value;
    // A response arriving after the bounded waiter cancelled still owns a body.
    if(signal.aborted) void value?.body?.cancel().catch(() => {});
    return value;
   }),signal);
   signal.throwIfAborted();
   if(response.status !== 200 || response.redirected || (response.url && response.url !== endpoint) || !response.body) return null;
   reader = response.body.getReader(); const chunks=[]; let count=0;
   for(;;) {
    const next = await bounded(reader.read(),signal); signal.throwIfAborted();
    if(next.done) break; count += next.value.byteLength; if(count > 65536) return null; chunks.push(next.value);
   }
   const bytes = new Uint8Array(count); let offset=0;
   for(const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.byteLength; }
   const config = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
   if(!config || Array.isArray(config) || !duration(config.sessions_timebox) || !duration(config.sessions_inactivity_timeout) || typeof config.sessions_single_per_user !== 'boolean' || typeof config.mfa_totp_verify_enabled !== 'boolean' || typeof config.mfa_phone_verify_enabled !== 'boolean' || typeof config.mfa_web_authn_verify_enabled !== 'boolean' || !fresh(checked,clock())) return null;
   signal.throwIfAborted();
   const assurance = strictHighestAAL ? {assuranceMode:'highest-current-aal/v1'} : {allowLowAALSeconds:evidence.allowLowAALSeconds};
   const policy = Object.freeze({projectID,checkedAt:evidence.checkedAt,authVersion:evidence.authVersion,...assurance,timeboxSeconds:config.sessions_timebox === 0 ? null : config.sessions_timebox,inactivitySeconds:config.sessions_inactivity_timeout === 0 ? null : config.sessions_inactivity_timeout,singleSession:config.sessions_single_per_user,totpVerify:config.mfa_totp_verify_enabled,phoneVerify:config.mfa_phone_verify_enabled,webAuthnVerify:config.mfa_web_authn_verify_enabled});
   issued.set(policy,callerSignal); return policy;
  } catch { return null; }
  finally { if(reader) { void reader.cancel().catch(() => {}); reader.releaseLock(); } else { void response?.body?.cancel().catch(() => {}); } }
 };
 // Call after each policy-dependent await, including after a row-lock wait and
 // before committing. This is freshness/custody only, never user authorization.
 return Object.freeze(Object.assign(read,{isCurrent:policy => {
  const caller = issued.get(policy);
  return !!caller && !caller.aborted && fresh(timestamp(policy.checkedAt),clock());
 }}));
}

// Existing evidence-based interface retains its missing/disabled distinction.
export function createHomeHandoffPolicyReader({projectID,accessToken,readEffectiveLowAAL,fetcher,clock,timeoutMS}) {
 return createPolicyReader({projectID,accessToken,readEffectiveLowAAL,fetcher,clock,timeoutMS});
}

/** ONLY for the existing pinned highest-current-AAL identity/actor verifiers.
 * Reviewed GoTrue versions compute highest possible AAL as AAL2 when a verified
 * factor exists, otherwise AAL1. These consumers already require AAL2 with any
 * verified factor and exact JWT/session AAL equality. The lower-than-highest
 * predicate is therefore false; its grace duration is irrelevant, not disabled.
 * Do not pass this policy to a consumer permitting below-highest sessions.
 * Explicit approved Management Auth Config Read credential remains required.
 */
export function createStrictHomeHandoffPolicyReader({projectID,accessToken,authVersionReader,fetcher,clock,timeoutMS}) {
 if(typeof authVersionReader!=='function'||typeof authVersionReader.isCurrent!=='function')throw Error('Issued Auth version source required');
 const readVersion=async signal=>{
  const record=await authVersionReader(signal);
  signal.throwIfAborted();
  return authVersionReader.isCurrent(record)?record:null;
 };
 return createPolicyReader({projectID,accessToken,readEffectiveLowAAL:readVersion,fetcher,clock,timeoutMS,strictHighestAAL:true});
}
