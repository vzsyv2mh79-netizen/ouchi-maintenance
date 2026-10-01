import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
function setup() {
  const handlers = {}, saved = new Map();
  const cache = { addAll: async (items) => { for(const item of items) saved.set(item, new Response('asset')); }, put: async (key, value) => saved.set(typeof key === 'string' ? key : key.url, value) };
  let offline = false;
  const fetcher = async (request) => { if(offline) throw new Error('Offline'); if(request === '/') return new Response('<script src="/_next/static/app.js"></script><link href="/_next/static/app.css">',{headers:{'content-type':'text/html'}}); return new Response('asset'); };
  vm.runInNewContext(readFileSync('public/sw.js','utf8'), { self:{location:{origin:'https://example.test'},clients:{claim:async()=>{}},addEventListener:(name,fn)=>handlers[name]=fn},caches:{open:async()=>cache,keys:async()=>['ouchi-shell-v1'],delete:async()=>true,match:async(key)=>saved.get(typeof key === 'string' ? key : key.url)},fetch:fetcher,URL,Response });
  return { handlers,saved,setOffline:()=>offline=true };
}
test('installation retains shell and its resources; offline navigation uses the shell', async()=>{
  const env=setup(); let install;
  env.handlers.install({waitUntil:(p)=>install=p}); await install;
  assert.ok(env.saved.has('/'));assert.ok(env.saved.has('/_next/static/app.js'));assert.ok(env.saved.has('/_next/static/app.css'));
  env.setOffline();let response;
  env.handlers.fetch({request:{url:'https://example.test/',method:'GET',mode:'navigate'},respondWith:(p)=>response=p,waitUntil:()=>{}});
  assert.match(await (await response).text(),/app.js/);
});
test('worker never intercepts API, auth, queries, external requests or mutations',()=>{
  const env=setup();
  for(const [url,method] of [['https://example.test/api/data','GET'],['https://example.test/reset-password','GET'],['https://example.test/?code=secret','GET'],['https://supabase.test/rest/v1/products','GET'],['https://example.test/','POST']]){
    let intercepted=false;env.handlers.fetch({request:{url,method,mode:'navigate'},respondWith:()=>intercepted=true});assert.equal(intercepted,false,url);
  }
});
