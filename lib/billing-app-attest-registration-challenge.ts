import {createHash,randomBytes} from 'node:crypto';

export type RegistrationScope={userID:string;sessionID:string;epochID:string;requestID:string;keyID:string;appID:string;attestEnvironment:'development'|'production'};
export type RegistrationChallenge=RegistrationScope & {version:1;purpose:'register_ouchi_attested_key';nonce:string;issuedAt:number;expiresAt:number};
const identityKeys=['userID','sessionID','epochID','requestID'] as const;
const scopeKeys=[...identityKeys,'keyID','appID','attestEnvironment'];
const challengeKeys=[...scopeKeys,'version','purpose','nonce','issuedAt','expiresAt'];
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const exactKeys=(value:object,keys:readonly string[])=>Object.keys(value).sort().join(',')===[...keys].sort().join(',');
function validateScope(scope:RegistrationScope){
 if(!scope||typeof scope!=='object'||Array.isArray(scope))throw Error('Invalid registration scope');
 for(const name of identityKeys)if(typeof scope[name]!=='string'||!uuid.test(scope[name])||scope[name]==='00000000-0000-0000-0000-000000000000')throw Error('Invalid registration identity');
 if(scope.epochID===scope.userID)throw Error('Invalid registration enrollment');
 if(typeof scope.keyID!=='string'||!/^[A-Za-z0-9+/]{43}=$/.test(scope.keyID)||Buffer.from(scope.keyID,'base64').length!==32||Buffer.from(scope.keyID,'base64').toString('base64')!==scope.keyID)throw Error('Invalid registration key');
 if(typeof scope.appID!=='string'||!/^[A-Z0-9]{10}\.[A-Za-z0-9][A-Za-z0-9.-]{1,200}$/.test(scope.appID)||!['development','production'].includes(scope.attestEnvironment))throw Error('Invalid registration app scope');
}
/** Server-only construction after live Auth/enrollment checks. Persist before
 * sending to the device. A generated challenge is not authentication, a trusted
 * key registration, a consumed nonce or permission to transfer purchases.
 */
export function createRegistrationChallenge(scope:RegistrationScope,now=Date.now()):Readonly<RegistrationChallenge>{
 validateScope(scope);
 if(!exactKeys(scope,scopeKeys)||!Number.isSafeInteger(now)||now<=0||!Number.isSafeInteger(now+300000))throw Error('Invalid registration challenge');
 return Object.freeze({...scope,version:1,purpose:'register_ouchi_attested_key',nonce:randomBytes(32).toString('base64url'),issuedAt:now,expiresAt:now+300000});
}
/** Rebuild from the SERVER-STORED record, never a submitted client object. These
 * exact UTF8 bytes are the one-time challenge the device hashes for attestKey.
 * Registration and restore have distinct purposes and schemas. Atomic consume,
 * verified proof/key persistence and current Auth remain mandatory and separate.
 */
export function registrationClientData(challenge:RegistrationChallenge,now=Date.now()):Buffer{
 validateScope(challenge);
 if(!exactKeys(challenge,challengeKeys)||challenge.version!==1||challenge.purpose!=='register_ouchi_attested_key'||typeof challenge.nonce!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(challenge.nonce)||Buffer.from(challenge.nonce,'base64url').toString('base64url')!==challenge.nonce)throw Error('Invalid registration challenge');
 if(!Number.isSafeInteger(now)||now<=0||!Number.isSafeInteger(challenge.issuedAt)||challenge.issuedAt<=0||!Number.isSafeInteger(challenge.expiresAt)||challenge.expiresAt-challenge.issuedAt!==300000||challenge.issuedAt>now||now>=challenge.expiresAt)throw Error('Registration challenge expired');
 return Buffer.from(JSON.stringify({version:challenge.version,purpose:challenge.purpose,nonce:challenge.nonce,issuedAt:challenge.issuedAt,expiresAt:challenge.expiresAt,userID:challenge.userID,sessionID:challenge.sessionID,epochID:challenge.epochID,requestID:challenge.requestID,keyID:challenge.keyID,appID:challenge.appID,attestEnvironment:challenge.attestEnvironment}),'utf8');
}
export function registrationClientDataHash(challenge:RegistrationChallenge,now=Date.now()):Buffer{
 return createHash('sha256').update(registrationClientData(challenge,now)).digest();
}
