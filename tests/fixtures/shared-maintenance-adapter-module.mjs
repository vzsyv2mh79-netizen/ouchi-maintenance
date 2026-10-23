import {readFileSync} from 'node:fs';
import ts from 'typescript';
const cache=new Map();
function moduleURL(name){
 if(cache.has(name))return cache.get(name);
 const file='lib/'+name,source=readFileSync(file,'utf8');
 let code=name.endsWith('.ts')?ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText:source;
 code=code.replace(/from ['"]\.\/([^'"]+)['"]/g,(_,target)=>`from ${JSON.stringify(moduleURL(/\.(?:ts|mjs)$/.test(target)?target:target+'.ts'))}`);
 const url='data:text/javascript;base64,'+Buffer.from(code).toString('base64');cache.set(name,url);return url;
}
export const {createSharedMaintenanceAdapter}=await import(moduleURL('shared-maintenance-adapter.ts'));

export const {composeSharedMaintenanceHandlers}=await import(moduleURL('shared-maintenance-composition.ts'));
