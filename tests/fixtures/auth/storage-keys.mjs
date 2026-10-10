// Public synthetic CI secret only. Never reads credentials or uses a shared project.
import {createHmac} from 'node:crypto';import {appendFileSync} from 'node:fs';
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const token=role=>{const unsigned=encode({alg:'HS256',typ:'JWT'})+'.'+encode({role,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600});return unsigned+'.'+createHmac('sha256','synthetic-isolated-ci-only-jwt-secret-never-use-in-production').update(unsigned).digest('base64url');};
if(!process.env.GITHUB_ENV)throw Error('CI environment destination required');
appendFileSync(process.env.GITHUB_ENV,`OUCHI_STORAGE_ANON_KEY=${token('anon')}\nOUCHI_STORAGE_SERVICE_KEY=${token('service_role')}\n`);
