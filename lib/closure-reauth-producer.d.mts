export const REAUTH_REGISTER_SQL:string;
export const REAUTH_OBSERVE_SQL:string;
export const REAUTH_CLOSE_SQL:string;
export const REAUTH_SWEEP_SQL:string;
type Scope={userID:string;sessionID:string;epochID:string;email:string};
type Client={auth:{signInWithPassword:(credentials:{email:string;password:string})=>Promise<{data:{user:{id:string}|null;session:unknown|null};error:unknown}>;signOut:(options:{scope:'local'})=>Promise<{error:unknown}>}};
export function createClosureReauthenticationProducer(options:{transactions:{run:<T>(signal:AbortSignal,callback:(tx:{query:(sql:string,args:unknown[])=>Promise<{rows:Record<string,unknown>[]}>})=>Promise<T>)=>Promise<T>};clientForRequest:(options:{agent:string;signal:AbortSignal})=>Client}):(email:string,password:string,signal:AbortSignal,scope:Scope)=>Promise<string|null>;
