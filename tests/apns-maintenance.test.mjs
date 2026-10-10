import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const compiled=ts.transpileModule(readFileSync('lib/apns-maintenance.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {maintenanceAPNsRequest:prepare,maintenanceAPNsDisposition:disposition,maintenanceAPNsResponse:response}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
test('APNs reminder contains count only, expires promptly and uses a fixed sandbox host',()=>{
 const now=1791637200000,input={deviceToken:'AB'.repeat(32),bundleId:'jp.ouchi.maintenance',dueCount:3,now,productName:'private product',homeName:'private home'};
 const request=prepare(input);assert.equal(request.origin,'https://api.sandbox.push.apple.com');assert.equal(request.path,'/3/device/'+'ab'.repeat(32));assert.equal(request.headers['apns-push-type'],'alert');assert.equal(request.headers['apns-expiration'],String(now/1000+3600));assert.equal(request.headers['apns-collapse-id'],'ouchi-maintenance-due');
 const payload=JSON.parse(request.body);assert.match(payload.aps.alert.body,/3件/);assert.deepEqual(Object.keys(payload),['aps']);assert.ok(!request.body.includes('private'));assert.ok(Buffer.byteLength(request.body)<4096);assert.equal(prepare({...input,dueCount:0}),null);
 assert.ok(prepare({...input,deviceToken:'ab'.repeat(48)}));
 for(const change of [{deviceToken:'../secret'},{deviceToken:'abc'},{bundleId:'topic\r\nheader'},{dueCount:-1},{dueCount:1.5},{now:NaN}])assert.throws(()=>prepare({...input,...change}));
});
test('untrusted APNs response bodies cannot acknowledge unexpected data or disable a device',()=>{
 const at=1791637200000;
 assert.equal(response(200,'',at),'accepted');
 assert.equal(response(200,'{}',at),'inspect');
 assert.equal(response(410,JSON.stringify({reason:'Unregistered',timestamp:at}),at),'disable-device');
 assert.equal(response(410,JSON.stringify({reason:'Unregistered',timestamp:at-1}),at),'stale-unregistration');
 for(const body of ['','null','[]','{','x'.repeat(4097),JSON.stringify({reason:'Unregistered',timestamp:String(at)}),JSON.stringify({reason:'Unregistered',timestamp:Infinity})])assert.equal(response(410,body,at),'inspect');
 assert.equal(response(503,JSON.stringify({reason:'ServiceUnavailable'}),at),'retry');
 assert.equal(response(403,JSON.stringify({reason:'ExpiredProviderToken'}),at),'credentials');
});
test('APNs response separates outages, credentials and scoped stale token invalidations',()=>{
 const at=1791637200000;assert.equal(disposition(200,null,null,at),'accepted');
 for(const status of [429,500,503])assert.equal(disposition(status,'Unavailable',null,at),'retry');
 assert.equal(disposition(403,'ExpiredProviderToken',null,at),'credentials');assert.equal(disposition(410,'Unregistered',at-1,at),'stale-unregistration');assert.equal(disposition(410,'Unregistered',at,at),'disable-device');assert.equal(disposition(410,'Unregistered',null,at),'inspect');assert.equal(disposition(400,'BadDeviceToken',null,at),'inspect');assert.equal(disposition(403,'DeviceTokenNotForTopic',null,at),'inspect');
});
