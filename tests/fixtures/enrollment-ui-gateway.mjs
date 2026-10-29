// Isolated UI transport. Never forwards to public hosts or accepts live secrets.
import http from 'node:http';
import {once} from 'node:events';
export async function startEnrollmentUIGateway({authOrigin, handleEnrollment, handleHousehold, authPort=54321, enrollmentPort=3000}) {
 const origin=new URL(authOrigin);
 if(origin.protocol!=='http:' || origin.hostname!=='127.0.0.1' || origin.pathname!=='/') throw Error('Loopback Auth origin required');
 const evidence={authRequests:0,recordDenials:0,householdReads:0,enrollmentReads:0,enrollmentPosts:0,lostAcknowledgements:0,authResponses:[]};
 const servers=[];
 async function body(req){let chunks=[],size=0;for await(const chunk of req){size+=chunk.length;if(size>16384)throw Error('Body too large');chunks.push(chunk);}return Buffer.concat(chunks);}
 function respond(res,status,value){res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));}
 async function listen(port,handler){
  const server=http.createServer((req,res)=>{Promise.resolve(handler(req,res)).catch(()=>{if(!res.headersSent)respond(res,503,{error:'Isolated fixture unavailable'});else res.destroy();});});
  servers.push(server);server.listen(port,'127.0.0.1');await once(server,'listening');return server.address().port;
 }
 async function stop(){await Promise.all(servers.map(server=>new Promise((resolve,reject)=>{if(!server.listening){resolve();return;}server.close(error=>error?reject(error):resolve());server.closeAllConnections();})));}
 try{
  const actualAuthPort=await listen(authPort,async(req,res)=>{
   const path=new URL(req.url,'http://127.0.0.1');
   const recordRead = (path.pathname.startsWith('/rest/v1/') && req.method==='GET') ||
    (path.pathname==='/rest/v1/rpc/load_household' && req.method==='POST');
   if(recordRead){
    if(handleHousehold && path.pathname==='/rest/v1/rpc/load_household' && req.method==='POST'){
     const payload=await body(req);
     const response=await handleHousehold(new Request('http://127.0.0.1/rest/v1/rpc/load_household',{method:'POST',headers:{'content-type':'application/json',authorization:req.headers.authorization??''},body:payload}));
     if(response.ok)evidence.householdReads++;else evidence.recordDenials++;
     res.writeHead(response.status,{'content-type':'application/json','cache-control':'no-store'});res.end(await response.text());return;
    }
    evidence.recordDenials++;respond(res,403,{message:'Unenrolled fixture session'});return;
   }
   const allowed={ '/auth/v1/token':['POST'], '/auth/v1/user':['GET'], '/auth/v1/logout':['POST'] };
   if(!allowed[path.pathname]?.includes(req.method)){respond(res,404,{error:'Fixture route unavailable'});return;}
   const payload=await body(req);evidence.authRequests++;
   const headers={'content-type':'application/json',apikey:'synthetic-publishable'};
   if(req.headers.authorization)headers.authorization=req.headers.authorization;
   const response=await fetch(origin.origin+path.pathname.slice('/auth/v1'.length)+path.search,{method:req.method,headers,body:payload.length?payload:undefined,redirect:'error'});
   evidence.authResponses.push({path:path.pathname,status:response.status});
   res.writeHead(response.status,{'content-type':'application/json','cache-control':'no-store'});res.end(await response.text());
  });
  const actualEnrollmentPort=await listen(enrollmentPort,async(req,res)=>{
   if(req.url!=='/api/account/enrollment'||!['GET','POST'].includes(req.method)){respond(res,404,{error:'Fixture route unavailable'});return;}
   const payload=await body(req);
   const headers={'content-type':'application/json'};if(req.headers.authorization)headers.authorization=req.headers.authorization;
   if(req.method==='POST')evidence.enrollmentPosts++;else evidence.enrollmentReads++;
   const response=await handleEnrollment(new Request('http://127.0.0.1/api/account/enrollment',{method:req.method,headers,body:payload.length?payload:undefined}));
   // The actual handler has committed before this deliberate transport failure.
   if(req.method==='POST'&&response.ok&&evidence.lostAcknowledgements===0){evidence.lostAcknowledgements++;respond(res,503,{error:'Synthetic acknowledgement loss'});return;}
   res.writeHead(response.status,{'content-type':'application/json','cache-control':'no-store'});res.end(await response.text());
  });
  return {authURL:`http://127.0.0.1:${actualAuthPort}`,enrollmentURL:`http://127.0.0.1:${actualEnrollmentPort}/api/account/enrollment`,evidence,stop};
 }catch(error){await stop();throw error;}
}
