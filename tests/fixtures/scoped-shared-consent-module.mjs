import ts from 'typescript';
import {readFileSync} from 'node:fs';
const url=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const compile=name=>ts.transpileModule(readFileSync(new URL('../../lib/'+name+'.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const session=url(compile('verified-app-session'));
export const scopedModule=await import(url(compile('scoped-shared-consent-identity').replace("'./verified-app-session'",JSON.stringify(session))));
