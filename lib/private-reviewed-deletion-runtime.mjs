import {createPrivateOperatorConnection} from './closure-operator-connection.mjs';
import {createReviewedFileCleanup,createReviewedFileFinalization} from './reviewed-file-cleanup.mjs';
import {createReviewedDeletionPrelude} from './reviewed-deletion-prelude.mjs';

/** Explicit private composition, not a dry run: prepare can erase a reviewed
 * source under a current SQL job/lease, after validating its retained copy.
 * No credentials, roles, policy, timer or approval are created here. The SQL
 * file-executor role and supplied Storage key have their actual underlying privileges
 * than these adapter methods; provisioning still requires reviewed approval.
 */
export function createPrivateReviewedDeletionRuntime({fileExecutorConfig,expectedProject,createClient,storage}){
 if(typeof storage?.cleanup!=='function')throw Error('Complete reviewed cleanup Storage required');
 const connect=createPrivateOperatorConnection({rawConfig:fileExecutorConfig,expectedProject,createClient,purpose:'file-cleanup'});
 return createReviewedDeletionPrelude({connect,
  cleanup:createReviewedFileCleanup({connect,storage}),
  finalization:createReviewedFileFinalization({connect})});
}
