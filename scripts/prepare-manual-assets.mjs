import {cp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
const require=createRequire(import.meta.url);
const source=dirname(require.resolve('pdfjs-dist/package.json'));
const target=join(process.cwd(),'.manual-assets');
const packageInfo=JSON.parse(await readFile(join(source,'package.json'),'utf8'));
const noticeRoot=join(process.cwd(),'assets/licenses');
const coreNotice=JSON.parse(await readFile(join(noticeRoot,'bundled-core-js-notice.json'),'utf8'));
const coreLicense=await readFile(join(noticeRoot,coreNotice.file));
if(packageInfo.license!=='Apache-2.0'||createHash('sha256').update(coreLicense).digest('hex')!==coreNotice.sha256) {
  throw Error('PDF asset licenses changed; review upstream notices before building.');
}
// Dependency updates must not silently retain an unrelated bundled notice.
for(const file of ['legacy/build/pdf.mjs','legacy/build/pdf.worker.mjs']) {
  const code=await readFile(join(source,file),'utf8');
  const versions=[...code.matchAll(/https:\/\/github\.com\/zloirock\/core-js\/blob\/v([^/]+)\/LICENSE/g)].map(match=>match[1]);
  if(!versions.length||versions.some(version=>version!==coreNotice.version)) {
    throw Error('Bundled core-js version changed; update its official license notice.');
  }
}
await mkdir(target,{recursive:true});
// Physical copies avoid deployment packages with symlinked asset directories.
await cp(join(source,'cmaps'),join(target,'cmaps'),{recursive:true,dereference:true});
await cp(join(source,'legacy/build/pdf.worker.mjs'),join(target,'pdf.worker.mjs'),{dereference:true});
await cp(join(source,'LICENSE'),join(target,'PDFJS-LICENSE.txt'));
await cp(join(noticeRoot,coreNotice.file),join(target,'COREJS-LICENSE.txt'));
await writeFile(join(target,'THIRD-PARTY-NOTICES.json'),JSON.stringify({
  packages:[
    {name:'pdfjs-dist',version:packageInfo.version,license:packageInfo.license,notice:'PDFJS-LICENSE.txt'},
    {name:coreNotice.package,version:coreNotice.version,license:coreNotice.license,notice:'COREJS-LICENSE.txt',source:coreNotice.source},
    {name:'Adobe CMap resources',notice:'cmaps/LICENSE'},
  ],
},null,2)+'\n');
