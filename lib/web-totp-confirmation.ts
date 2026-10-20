/** Review-only orchestration. No enrollment/removal, app epoch, consent token,
 * handoff/deletion request, or built-in Supabase setSession side effect.
 * The host must provide an atomic, abort-aware credential compare-and-swap.
 * A getSession-before-setSession pair is NOT an implementation of that port.
 */
export type TOTPLoginBinding=Readonly<{account:string;sessionID:string;token:string;revision:string}>;
export type TOTPPromotion=Readonly<{account:string;sessionID:string;accessToken:string;refreshToken:string}>;
export type TOTPCodeChallenge=Readonly<{id:string;factorID:string;expiresAt:number}>;
type Ports={
 read:()=>Promise<TOTPLoginBinding|null>;
 factors:(binding:TOTPLoginBinding,signal:AbortSignal)=>Promise<readonly string[]>;
 challenge:(binding:TOTPLoginBinding,factorID:string,signal:AbortSignal)=>Promise<TOTPCodeChallenge>;
 verify:(binding:TOTPLoginBinding,challenge:TOTPCodeChallenge,code:string,signal:AbortSignal)=>Promise<TOTPPromotion>;
 commit:(expected:TOTPLoginBinding,promoted:TOTPPromotion,signal:AbortSignal)=>Promise<boolean>;
 clock?:()=>number;
};
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v)&&!/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(v);
const token=(v:unknown)=>typeof v==='string'&&v.length>0&&v.length<=16384&&!/\s/.test(v);
const same=(a:TOTPLoginBinding|null,b:TOTPLoginBinding)=>!!a&&a.account===b.account&&a.sessionID===b.sessionID&&a.token===b.token&&a.revision===b.revision;
export function createWebTOTPConfirmation(ports:Ports){
 const fixed={...ports},clock=fixed.clock??Date.now;
 for(const name of ['read','factors','challenge','verify','commit'] as const)if(typeof fixed[name]!=='function')throw Error('Bound TOTP host ports required');
 let operation:AbortController|null=null,binding:TOTPLoginBinding|null=null,available:readonly string[]=[],challenge:TOTPCodeChallenge|null=null;
 let active=false,generation=0;
 function cancel(){generation++;operation?.abort();operation=null;binding=null;available=[];challenge=null;active=false;}
 async function run<T>(work:(signal:AbortSignal,guard:()=>Promise<void>)=>Promise<T>){
  if(active)throw Error('TOTP confirmation is busy');active=true;const expected=++generation,controller=new AbortController();operation=controller;
  const guard=async()=>{controller.signal.throwIfAborted();if(expected!==generation||!binding||!same(await fixed.read(),binding))throw Error('TOTP login changed');controller.signal.throwIfAborted();if(expected!==generation)throw Error('TOTP confirmation changed');};
  try{return await work(controller.signal,guard);}finally{if(expected===generation){operation=null;active=false;}}
 }
 return Object.freeze({cancel,
  async prepare(){
   cancel();return run(async(signal,guard)=>{
    const value=await fixed.read();signal.throwIfAborted();
    if(!value||!uuid(value.account)||!uuid(value.sessionID)||!token(value.token)||!value.revision)throw Error('Login required');
    binding=Object.freeze({...value});await guard();
    const values=await fixed.factors(binding,signal);await guard();
    if(!Array.isArray(values)||values.length>10||values.some(v=>!uuid(v))||new Set(values).size!==values.length)throw Error('Invalid factor inventory');
    available=Object.freeze([...values]);return available;
   });
  },
  async challenge(factorID:string){return run(async(signal,guard)=>{
   await guard();if(!available.includes(factorID))throw Error('Registered TOTP factor required');
   const result=await fixed.challenge(binding!,factorID,signal);await guard();
   if(!uuid(result?.id)||result.factorID!==factorID||!Number.isSafeInteger(result.expiresAt)||result.expiresAt<=clock()||result.expiresAt>clock()+600000)throw Error('Invalid TOTP challenge');
   challenge=Object.freeze({...result});return challenge;
  });},
  async verify(code:string){return run(async(signal,guard)=>{
   await guard();const captured=challenge,expected=binding!;
   if(!captured||captured.expiresAt<=clock()||!/^\d{6}$/.test(code))throw Error('Current six-digit code required');
   const result=await fixed.verify(expected,captured,code,signal);await guard();
   if(!result||result.account!==expected.account||result.sessionID!==expected.sessionID||!token(result.accessToken)||!token(result.refreshToken)||result.accessToken===expected.token||captured.expiresAt<=clock())throw Error('Bound TOTP result required');
   // No SDK shared-session mutation occurs before the host's atomic boundary.
   if(await fixed.commit(expected,Object.freeze({...result}),signal)!==true)throw Error('TOTP credential adoption unconfirmed');
   signal.throwIfAborted();
   const current=await fixed.read();signal.throwIfAborted();
   if(!current||current.account!==result.account||current.sessionID!==result.sessionID||current.token!==result.accessToken||current.revision===expected.revision)throw Error('TOTP credential persistence unconfirmed');
   challenge=null;binding=null;available=[];
   return Object.freeze({account:result.account,sessionID:result.sessionID,confirmed:true as const});
  });}
 });
}
