type Query=(sql:string,args?:unknown[])=>Promise<{rows:Record<string,unknown>[]}>;
export function createReceiptTransactions(options:{connect:(options:{signal:AbortSignal})=>Promise<{query:Query;abort:()=>void;close:()=>Promise<void>}>}):<T>(callback:(tx:{signal:AbortSignal;readOnly:boolean;query:Query})=>Promise<T>,options:{signal:AbortSignal;readOnly:boolean})=>Promise<T>;
