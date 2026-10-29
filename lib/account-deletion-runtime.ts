import 'server-only';
import {createClient} from '@supabase/supabase-js';
import {createPostgresClient} from './postgres-driver.mjs';
import {createPrivateReviewedDeletionRuntime} from './private-reviewed-deletion-runtime.mjs';
import {createReviewedFileCleanupStorage} from './reviewed-file-cleanup-storage';
import {createAccountDeletionServiceFetch} from './account-deletion-service-fetch';
import {createAccountDeletionDispatcher} from './account-deletion-dispatcher';

type Configuration={projectID:string;secretKey:string;fileExecutorConfig:unknown};
/** Prepared real-SDK/private-SQL composition, still dormant. No environment
 * fallback, route, schedule, policy adoption, credential provisioning or Auth
 * identity deletion. runNext can perform irreversible scoped deletion when
 * independently authorized SQL policies and leases permit it; not a preview.
 */
export function createAccountDeletionRuntime(config:Configuration){
 if(!config||Object.keys(config).sort().join(',')!=='fileExecutorConfig,projectID,secretKey'
  ||typeof config.projectID!=='string'||!/^[a-z]{20}$/.test(config.projectID)
  ||typeof config.secretKey!=='string'||!/^sb_secret_[A-Za-z0-9_-]{1,2000}$/.test(config.secretKey))throw Error('Explicit app deletion runtime configuration required');
 const {projectID,secretKey,fileExecutorConfig}=config;
 const reviewed=createPrivateReviewedDeletionRuntime({fileExecutorConfig,expectedProject:projectID,createClient:createPostgresClient,
  storage:createReviewedFileCleanupStorage({projectID,secretKey})});
 return createAccountDeletionDispatcher({
  clientForRun:signal=>createClient(`https://${projectID}.supabase.co`,secretKey,{
   auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
   global:{fetch:createAccountDeletionServiceFetch(projectID,signal)},
  }),
  prepareReviewedAttachments:(scope,signal)=>reviewed.prepare(scope,signal),
 });
}
