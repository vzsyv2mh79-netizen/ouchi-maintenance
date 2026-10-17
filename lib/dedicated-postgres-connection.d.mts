type Result={rows:Record<string,unknown>[]};
export type DedicatedPostgresClient={connect:()=>Promise<unknown>;query:(sql:string,args?:unknown[])=>Promise<Result>;end:()=>Promise<unknown>|void;on:(event:'error',listener:()=>void)=>unknown};
export function createDedicatedPostgresConnection(options:{createClient:(bounds:{connectionTimeoutMillis:number;query_timeout:number})=>DedicatedPostgresClient}):(options:{signal:AbortSignal})=>Promise<{abort:()=>void;close:()=>Promise<void>;query:(sql:string,args?:unknown[])=>Promise<Result>}>;
