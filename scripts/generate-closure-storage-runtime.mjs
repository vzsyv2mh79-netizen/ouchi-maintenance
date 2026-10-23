import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
const root=new URL('../',import.meta.url);
export async function closureStorageRuntime(){
 const transpile=async name=>ts.transpileModule(await readFile(new URL('lib/'+name+'.ts',root),'utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022},
 }).outputText;
 let output="// Generated from canonical TypeScript by scripts/generate-closure-storage-runtime.mjs.\n// Node-only private inspection/copy transport. Never import into a client bundle.\nimport 'node:process';\nimport { createHash } from 'node:crypto';\nimport { createClient, StorageApiError } from '@supabase/supabase-js';\n";
 output+=await transpile('attachment-fetch');
 for(const [name,fn] of [['closure-file-storage-reader','createClosureFileStorageReader'],['closure-household-file-storage-reader','createClosureHouseholdFileStorageReader'],['household-copy-storage','createHouseholdCopyStorage']]){
  const body=(await transpile(name))
   .replace(/^import 'server-only';\s*$/gm,'')
   .replace(/^import \{ createClient(?:, StorageApiError)? \} from '@supabase\/supabase-js';\s*$/gm,'')
   .replace(/^import \{ createHash \} from 'node:crypto';\s*$/gm,'')
   .replace(/^import \{ createAttachmentFetch \} from '\.\/attachment-fetch';\s*$/gm,'')
   .replace('export function '+fn,'function '+fn);
  if(/^import\b/m.test(body))throw Error('Unreviewed runtime dependency');
  output+=`\nexport const ${fn} = (() => {\n${body}\nreturn ${fn};\n})();\n`;
 }
 return output;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 if(process.argv.length!==2)throw Error('No runtime generation arguments accepted');
 await writeFile(new URL('lib/closure-storage-runtime.mjs',root),await closureStorageRuntime());
}
