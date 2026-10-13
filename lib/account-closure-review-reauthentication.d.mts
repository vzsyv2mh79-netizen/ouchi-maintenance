type Identity={userID:string;sessionID:string;epochID:string;email:string};
type Scope=Omit<Identity,'email'>&{submissionID:string};
export const CLOSURE_REAUTHENTICATION_STATE_SQL:string;
export function createAccountClosureReviewReauthentication(options:{
 identity:Identity;
 readAuthState:(userID:string,signal:AbortSignal)=>Promise<unknown>;
 authenticate:(email:string,password:string,signal:AbortSignal)=>Promise<string|null>;
 clock?:()=>number;
 lifetimeMS?:number;
}):{
 reauthenticate:(email:string,password:string,signal:AbortSignal)=>Promise<string|null>;
 verify:(scope:Scope,tx:{signal:AbortSignal;query:(sql:string,args:unknown[])=>Promise<{rows:Record<string,unknown>[]}>})=>Promise<boolean>;
};
