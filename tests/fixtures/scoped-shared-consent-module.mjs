import ts from 'typescript';
import {readFileSync} from 'node:fs';
const url=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const compile=name=>ts.transpileModule(readFileSync(new URL('../../lib/'+name+'.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const session=url(compile('verified-app-session'));
export const scopedModule=await import(url(compile('scoped-shared-consent-identity').replace("'./verified-app-session'",JSON.stringify(session))));

const scopedURL=url(compile('scoped-shared-consent-identity').replace("'./verified-app-session'",JSON.stringify(session)));
export const boundScopedModule=await import(url(compile('bound-scoped-shared-consent').replace("'./scoped-shared-consent-identity'",JSON.stringify(scopedURL))));
const preparedURL=url(compile('prepared-scoped-shared-consent').replace("'./scoped-shared-consent-identity'",JSON.stringify(scopedURL)));
export const preparedScopedModule=await import(preparedURL);
export const preparedOuchiClaimModule=await import(url(compile('prepared-ouchi-claim')
 .replace("'./prepared-scoped-shared-consent'",JSON.stringify(preparedURL))
 .replace("'./shared-deletion-protocol.mjs'",JSON.stringify(new URL('../../lib/shared-deletion-protocol.mjs',import.meta.url).href))));

export const initialFamilyModule=await import(url(compile('initial-family-consent-identity')
 .replace("'./prepared-scoped-shared-consent'",JSON.stringify(preparedURL))
 .replace("'./scoped-shared-consent-identity'",JSON.stringify(scopedURL))
 .replace(/'(.\/[^']+\.mjs)'/g,(_,path)=>JSON.stringify(new URL('../../lib/'+path.slice(2),import.meta.url).href))));

export const ownerOnlyModule=await import(url(compile('ouchi-owner-only-claim')
 .replace("'./verified-app-session'",JSON.stringify(session))
 .replace("'./shared-deletion-protocol.mjs'",JSON.stringify(new URL('../../lib/shared-deletion-protocol.mjs',import.meta.url).href))));

export const preNativeLogoutModule=await import(url(compile('pre-native-after-logout-consent')
 .replace("'./scoped-shared-consent-identity'",JSON.stringify(scopedURL))));

export const ownerAfterLogoutModule=await import(url(compile('ouchi-owner-after-logout-consent')
 .replace("'./shared-deletion-protocol.mjs'",JSON.stringify(new URL('../../lib/shared-deletion-protocol.mjs',import.meta.url).href))));

export const ownerAfterNativeModule=await import(url(compile('ouchi-owner-after-native-consent')
 .replace("'./shared-deletion-protocol.mjs'",JSON.stringify(new URL('../../lib/shared-deletion-protocol.mjs',import.meta.url).href))));

export const ownerAfterAuthModule=await import(url(compile('ouchi-owner-after-auth-consent')
 .replace("'./shared-deletion-protocol.mjs'",JSON.stringify(new URL('../../lib/shared-deletion-protocol.mjs',import.meta.url).href))));
