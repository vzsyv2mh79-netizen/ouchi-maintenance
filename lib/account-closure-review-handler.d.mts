type Scope={userID:string;sessionID:string;epochID:string;submissionID:string};
type Identity=Omit<Scope,'submissionID'>&{email:string};
export function createAccountClosureReviewHandler(options:{
 verify:(bearer:string,signal:AbortSignal)=>Promise<Identity|null>;
 reauthenticate:(email:string,password:string,signal:AbortSignal)=>Promise<string|null>;
 port:Record<'request'|'read'|'cancel',(scope:Scope,signal:AbortSignal)=>Promise<unknown>>;
 timeoutMS?:number;
}):(request:Request,action:string)=>Promise<Response>;
