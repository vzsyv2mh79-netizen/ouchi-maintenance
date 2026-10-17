export type CheckedTransaction={
 readonly signal:AbortSignal;
 query:(sql:string,args:unknown[])=>Promise<{rows:Record<string,unknown>[]}>;
 beforeCommit:(key:string,verify:(tx:CheckedTransaction)=>Promise<boolean>)=>void;
};
export function runWithTransactionCommitChecks<T>(
 raw:Pick<CheckedTransaction,'query'>,
 signal:AbortSignal,
 callback:(tx:CheckedTransaction)=>Promise<T>,
):Promise<T>;
