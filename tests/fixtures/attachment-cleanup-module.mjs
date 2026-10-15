import {readFileSync} from 'node:fs';
import ts from 'typescript';
const cache=new Map();
function compile(name){
 if(cache.has(name))return cache.get(name);
 let code=ts.transpileModule(readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 code=code.replace(/from ['"]\.\/([^'"]+)['"]/g,(_,target)=>`from ${JSON.stringify(compile(target))}`)
  .replace(/from ['"]@supabase\/supabase-js['"]/g,`from ${JSON.stringify(import.meta.resolve('@supabase/supabase-js'))}`);
 const url='data:text/javascript;base64,'+Buffer.from(code).toString('base64');cache.set(name,url);return url;
}
export const {runAttachmentCleanupBatch,checkedAttachmentCleanupScope}=await import(compile('attachment-cleanup'));
export const {storedAttachmentCleanupServices}=await import(compile('attachment-cleanup-store'));
export const {createAttachmentFetch}=await import(compile('attachment-fetch'));
