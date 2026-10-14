export type AuthVersion={projectID:string;authVersion:string;checkedAt:string};
export function createHomeHandoffAuthVersionReader(options:{projectID:string;publishableKey:string;fetcher?:typeof fetch;clock?:()=>number;timeoutMS?:number}):((signal:AbortSignal)=>Promise<AuthVersion|null>)&{isCurrent:(record:AuthVersion|null)=>boolean};
