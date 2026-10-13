import {createAccountClosureReviewHandler} from './account-closure-review-handler.mjs';
import {createAccountClosureReviewReauthentication,CLOSURE_REAUTHENTICATION_STATE_SQL} from './account-closure-review-reauthentication.mjs';
import {createAccountClosureReviewTransactionPort} from './account-closure-review-transaction';
import {createHomeHandoffIdentityVerifier} from './home-handoff-identity';
type PortOptions=Parameters<typeof createAccountClosureReviewTransactionPort>[0];
type Identity={userID:string;sessionID:string;epochID:string;email:string};
type Options={
 enabled?:boolean;
 identityOptions:Omit<PortOptions['identityOptions'],'getUser'>&{getUser:(bearer:string,signal:AbortSignal)=>Promise<{data:{user:{id:string;email?:string}|null};error:unknown}>};
 transactions:PortOptions['transactions'];
 authenticate:(email:string,password:string,signal:AbortSignal)=>Promise<string|null>;
 timeoutMS?:number;
};

/** Backend composition only; no route/connection/grant is registered here.
 * Runtime acquisition of current policy and a dedicated bounded least-privilege
 * transaction provider remain explicit deployment dependencies. Disabled by
 * default. Each HTTP invocation owns its identity, bearer, witness and port;
 * concurrent users cannot overwrite one another's authentication context.
 */
export function createAccountClosureReviewServer({enabled=false,identityOptions,transactions,authenticate,timeoutMS=10000}:Options){
 createHomeHandoffIdentityVerifier(identityOptions);
 if(typeof transactions?.run!=='function'||typeof authenticate!=='function'||typeof enabled!=='boolean'||!Number.isInteger(timeoutMS)||timeoutMS<1||timeoutMS>20000)throw Error('Bounded review server providers required');
 return async(request:Request,action:string)=>{
  if(!enabled)return Response.json({error:'Account review is not available'},{status:503,headers:{'Cache-Control':'no-store'}});
  let first:Identity|null=null,port:ReturnType<typeof createAccountClosureReviewTransactionPort>|null=null,witness:ReturnType<typeof createAccountClosureReviewReauthentication>|null=null;
  const verify=async(bearer:string,signal:AbortSignal)=>{
   let email:string|undefined;
   const options={...identityOptions,getUser:async(token:string,s:AbortSignal)=>{
    if(token!==bearer)throw Error('Original bearer required');
    const result=await identityOptions.getUser(token,s);email=result.error?undefined:result.data.user?.email;return result;
   }};
   const identity=await transactions.run(signal,tx=>createHomeHandoffIdentityVerifier(options)(bearer,{signal,query:(sql,args)=>tx.query(sql,args)}));
   signal.throwIfAborted();
   if(!identity||typeof email!=='string'||!email||email.length>320)return null;
   const current=Object.freeze({...identity,email});
   if(first===null){
    first=current;
    witness=createAccountClosureReviewReauthentication({identity:current,authenticate,readAuthState:(userID,s)=>transactions.run(s,async tx=>{
     s.throwIfAborted();const result=await tx.query(CLOSURE_REAUTHENTICATION_STATE_SQL,[userID]);s.throwIfAborted();
     if(result.rows.length!==1)throw Error('Current reauthentication state required');return result.rows[0].reauthentication_state;
    })});
    port=createAccountClosureReviewTransactionPort({bearer,identityOptions,transactions,verifyReauthentication:witness.verify,timeoutMS});
   }
   return current;
  };
  const handler=createAccountClosureReviewHandler({verify,timeoutMS,
   reauthenticate:(email,password,signal)=>{if(!witness)throw Error('Verified request identity required');return witness.reauthenticate(email,password,signal);},
   port:{request:(scope,signal)=>{if(!port)throw Error('Verified request identity required');return port.request(scope,signal);},read:(scope,signal)=>{if(!port)throw Error('Verified request identity required');return port.read(scope,signal);},cancel:(scope,signal)=>{if(!port)throw Error('Verified request identity required');return port.cancel(scope,signal);}},
  });
  return handler(request,action);
 };
}
