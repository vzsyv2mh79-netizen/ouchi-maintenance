import {timingSafeEqual} from 'node:crypto';
type Result={status:string;cleanupBacklog?:boolean};
/** No transport or credentials are constructed before authorization and release gates. */
export async function nativeDeliveryService(request:Request,secret:string|undefined,enabled:boolean,dispatch:(signal:AbortSignal)=>Promise<Result>){
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 const fail=(status:number,error:string)=>Response.json({error},{status,headers});
 if(request.method!=='GET')return fail(405,'Unsupported method');
 const authorization=request.headers.get('authorization');
 if(!secret||secret.length<16||secret.length>4096||!authorization||authorization.length>4103)return fail(401,'Unauthorized');
 const expected=Buffer.from('Bearer '+secret),actual=Buffer.from(authorization);
 if(expected.length!==actual.length||!timingSafeEqual(expected,actual))return fail(401,'Unauthorized');
 if(new URL(request.url).search)return fail(400,'Unsupported parameters');
 if(!enabled)return fail(503,'Native delivery disabled');
 try{
  const signal=AbortSignal.any([request.signal,AbortSignal.timeout(45000)]);signal.throwIfAborted();
  const result=await dispatch(signal);
  if(!['complete','partial','cancelled','unconfirmed','idle'].includes(result.status))return fail(503,'Delivery unconfirmed');
  return Response.json(result,{status:result.status==='unconfirmed'||result.cleanupBacklog?503:200,headers});
 }catch{return fail(503,'Delivery unavailable');}
}
