import {createKakeiFamilyCompletion} from './kakei-family-completion.mjs';
import {createKakeiFamilyTransfer} from './kakei-family-transfer.mjs';
import {createAuthBoundConsentEvidenceVerifier,createAuthBoundHandoffConsentVerifier} from './handoff-consent-auth-state.mjs';
/** Explicit v2 composition, never a legacy-v1 fallback. Current Auth is checked
 * before transfer and again inside the pinned COMMIT callback. Historical reads
 * use saved original v2 proofs at the immutable timestamp, not current Auth.
 * The caller supplies sorted locks, bounded private reads and current policy;
 * no production reader, permissions, connection or keys are provided here. */
export function createAuthBoundKakeiFamilyCompletion({key,loadRecords,verifyAuthState,writeFences,verifyReadAuthority}){
 const current=createAuthBoundHandoffConsentVerifier({key,loadRecords,verifyAuthState});
 const transfer=createKakeiFamilyTransfer({verifyConsents:current,writeFences});
 return createKakeiFamilyCompletion({key,transfer,loadRecords,verifyReadAuthority,writeFences,
  verifyEvidenceAt:createAuthBoundConsentEvidenceVerifier({key}),verifyConsentsAtCommit:current});
}
