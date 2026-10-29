type Result={rows:Record<string,unknown>[]};
type Connection={abort:()=>void;close:()=>Promise<void>;query:(sql:string,args?:unknown[])=>Promise<Result>};
type Transaction={signal:AbortSignal;query:(sql:string,args:unknown[])=>Promise<Result>};
type Identity={userID:string;sessionID:string;epochID:string;aal?:'aal1'|'aal2';authenticatedAt?:number;checkedAt?:number;authStateDigest?:string};
type Scope={homeID:string;epochID:string};
type Intent=Scope&{requestID:string;generation:string};
export class ManagementReauthenticationRequired extends Error {}
export function createOwnerlessHomeManagement(options:{connect:(options:{signal:AbortSignal})=>Promise<Connection>;verifyIdentity:(bearer:string,tx:Transaction)=>Promise<Identity|null>;verifyCurrent?:(bearer:string,tx:Transaction)=>Promise<Identity|null>}):Readonly<{
 readStatus:(input:Scope,bearer:string,signal:AbortSignal)=>Promise<Readonly<Record<string,unknown>>>;
 readClaim:(input:Intent,bearer:string,signal:AbortSignal)=>Promise<Readonly<Record<string,unknown>>>;
 claim:(input:Intent&{confirmation:'CLAIM_HOME_MANAGEMENT'},bearer:string,signal:AbortSignal)=>Promise<Readonly<Record<string,unknown>>>;
}>;
