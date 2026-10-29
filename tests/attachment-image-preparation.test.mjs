import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const code=ts.transpileModule(readFileSync('lib/attachment-image-preparation.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {attachmentImageDimensions,prepareAttachmentImage}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const png=(width,height)=>{const b=new Uint8Array(45);b.set([137,80,78,71,13,10,26,10]);const v=new DataView(b.buffer);v.setUint32(8,13);b.set([73,72,68,82],12);v.setUint32(16,width);v.setUint32(20,height);b.set([73,69,78,68],37);return b;};
const jpeg=(width,height)=>new Uint8Array([255,216,255,224,0,4,1,2,255,194,0,8,8,height>>8,height&255,width>>8,width&255,3]);
test('preflight bounds dimensions before decoding and refuses malformed/spoofed/truncated headers',()=>{
 assert.deepEqual(attachmentImageDimensions(png(6000,4000),'image/png'),{width:6000,height:4000});
 assert.deepEqual(attachmentImageDimensions(jpeg(16,12),'image/jpeg'),{width:16,height:12});
 for(const [b,m] of [[png(6001,4000),'image/png'],[png(0,1),'image/png'],[png(1,0xffffffff),'image/png'],[png(16,12),'image/jpeg'],[jpeg(16,12),'image/png'],[jpeg(16,12).slice(0,-1),'image/jpeg'],[new Uint8Array([255,216,255,218]),'image/jpeg'],[new Uint8Array(5*1024*1024+1),'image/png']])assert.throws(()=>attachmentImageDimensions(b,m));
 const animated=new Uint8Array(65);animated.set(png(16,12).slice(0,33));new DataView(animated.buffer).setUint32(33,8);animated.set([97,99,84,76],37);animated.set(png(16,12).slice(33),53);assert.throws(()=>attachmentImageDimensions(animated,'image/png'));
 const offset=new Uint8Array(52);offset.set(png(16,12),4);assert.deepEqual(attachmentImageDimensions(offset.subarray(4,49),'image/png'),{width:16,height:12});
});
test('PDF is unchanged; cancelled preparation and missing decoder never return original photo',async()=>{
 const pdf=new File(['%PDF-synthetic'],'warranty.pdf',{type:'application/pdf'}),signal=new AbortController().signal;
 assert.equal(await prepareAttachmentImage(pdf,signal),pdf);
 const stopped=new AbortController();stopped.abort();await assert.rejects(()=>prepareAttachmentImage(pdf,stopped.signal));
 await assert.rejects(()=>prepareAttachmentImage(new File([png(16,12)],'photo.png',{type:'image/png'}),signal));
});

async function mockedBrowser(decoder,document,run){
 const bitmapBefore=Object.getOwnPropertyDescriptor(globalThis,'createImageBitmap'),documentBefore=Object.getOwnPropertyDescriptor(globalThis,'document');
 Object.defineProperty(globalThis,'createImageBitmap',{value:decoder,configurable:true});Object.defineProperty(globalThis,'document',{value:document,configurable:true});
 try{await run();}finally{for(const [key,descriptor] of [['createImageBitmap',bitmapBefore],['document',documentBefore]]){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
}
const photo=()=>new File([png(16,12)],'synthetic.png',{type:'image/png'});
test('cancelled browser decoder releases wait and disposes a late bitmap without staging a file',async()=>{
 let resolveImage,started,closed=0;const entered=new Promise(resolve=>{started=resolve;});
 await mockedBrowser(()=>{started();return new Promise(resolve=>{resolveImage=resolve;});},{createElement(){assert.fail('cancelled decode created canvas');}},async()=>{
  const controller=new AbortController(),result=prepareAttachmentImage(photo(),controller.signal);await entered;
  controller.abort();await assert.rejects(result,error=>error.name==='AbortError');
  resolveImage({width:16,height:12,close(){closed++;}});await new Promise(resolve=>setImmediate(resolve));assert.equal(closed,1);
 });
});
test('stalled browser decoder has a finite deadline and late result is disposed',async()=>{
 let resolveImage,closed=0;
 await mockedBrowser(()=>new Promise(resolve=>{resolveImage=resolve;}),{},async()=>{
  await assert.rejects(()=>prepareAttachmentImage(photo(),new AbortController().signal,15),error=>error.name==='TimeoutError');
  resolveImage({width:16,height:12,close(){closed++;}});await new Promise(resolve=>setImmediate(resolve));assert.equal(closed,1);
 });
});
test('cancelled canvas encoding cleans bitmap/canvas and ignores a late encoded blob',async()=>{
 let completeEncoding,started,closed=0;const entered=new Promise(resolve=>{started=resolve;});
 const canvas={width:0,height:0,getContext(){return {drawImage(){}};},toBlob(callback){completeEncoding=callback;started();}};
 await mockedBrowser(async()=>({width:16,height:12,close(){closed++;}}),{createElement(){return canvas;}},async()=>{
  const controller=new AbortController(),result=prepareAttachmentImage(photo(),controller.signal);await entered;
  controller.abort();await assert.rejects(result,error=>error.name==='AbortError');assert.equal(closed,1);assert.equal(canvas.width,0);assert.equal(canvas.height,0);
  completeEncoding(new Blob([png(16,12)],{type:'image/png'}));await new Promise(resolve=>setImmediate(resolve));assert.equal(closed,1);
 });
});
