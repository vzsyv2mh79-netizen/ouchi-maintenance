import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const cache=new Map();
function compile(name){
 if(cache.has(name))return cache.get(name);
 let code=ts.transpileModule(readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 code=code.replace(/from ['"]\.\/([^'"]+)['"]/g,(_,n)=>'from '+JSON.stringify(compile(n)));
 code=code.replace(/from ['"]@supabase\/supabase-js['"]/g,'from '+JSON.stringify(import.meta.resolve('@supabase/supabase-js')));
 const url='data:text/javascript;base64,'+Buffer.from(code).toString('base64');cache.set(name,url);return url;
}
const {createEnrollmentAuthClient:create}=await import(compile('enrollment-auth-client'));
const user='11111111-1111-4111-8111-111111111111';
const token='e30.'+Buffer.from(JSON.stringify({sub:user,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.synthetic';

test('actual temporary Auth SDK logs out locally over HTTP after consent cancellation, without revoking original session',async()=>{
 const calls=[];
 const server=createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  calls.push({path:url.pathname,scope:url.searchParams.get('scope'),method:req.method});
  if(url.pathname==='/auth/v1/token'){
   res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({access_token:token,refresh_token:'synthetic-temporary',token_type:'bearer',expires_in:3600,user:{id:user,email:'synthetic@example.invalid'}}));return;
  }
  if(url.pathname==='/auth/v1/logout'){
   assert.equal(req.headers.authorization,'Bearer '+token);
   res.writeHead(204).end();return;
  }
  res.writeHead(500).end();
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const controller=new AbortController();
  const db=create({url:'http://127.0.0.1:'+server.address().port,key:'unused-synthetic',publishableKey:'synthetic-public'},controller.signal);
  const login=await db.auth.signInWithPassword({email:'synthetic@example.invalid',password:'synthetic'});
  assert.equal(login.error,null);assert.equal(login.data.user.id,user);
  controller.abort();
  const logout=await db.auth.signOut({scope:'local'});assert.equal(logout.error,null);
  assert.equal((await db.auth.getSession()).data.session,null);
  assert.deepEqual(calls,[{path:'/auth/v1/token',scope:null,method:'POST'},{path:'/auth/v1/logout',scope:'local',method:'POST'}]);
  // A cancelled caller cannot start a fresh password login through the normal transport.
  const rejected=await db.auth.signInWithPassword({email:'synthetic@example.invalid',password:'synthetic'});
  assert.ok(rejected.error);assert.equal(calls.length,2);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('actual temporary Auth SDK refuses redirects and oversized streamed login responses before obtaining a session',async()=>{
 let destination=0,mode='redirect';
 const server=createServer((req,res)=>{
  if(req.url==='/destination'){destination++;res.writeHead(500).end();return;}
  if(mode==='redirect'){res.writeHead(302,{location:'/destination'}).end();return;}
  res.writeHead(200,{'content-type':'application/json'});res.write('x'.repeat(65537));res.end();
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const config={url:'http://127.0.0.1:'+server.address().port,key:'unused-synthetic',publishableKey:'synthetic-public'};
  for(const value of ['redirect','oversized']){
   mode=value;const db=create(config,new AbortController().signal);
   const result=await db.auth.signInWithPassword({email:'synthetic@example.invalid',password:'synthetic'});
   assert.ok(result.error,value);assert.equal((await db.auth.getSession()).data.session,null);
  }
  assert.equal(destination,0);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
