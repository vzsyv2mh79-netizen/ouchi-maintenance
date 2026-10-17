import type {DedicatedPostgresClient} from './dedicated-postgres-connection.mjs';
import type {DeletionScope} from './account-deletion-worker';
import type {createReviewedFileCleanupStorage} from './reviewed-file-cleanup-storage';
export function createPrivateReviewedDeletionRuntime(options:{
 fileExecutorConfig:unknown;
 expectedProject:string;
 createClient:(config:Readonly<Record<string,unknown>>)=>DedicatedPostgresClient;
 storage:ReturnType<typeof createReviewedFileCleanupStorage>;
}):Readonly<{prepare:(scope:DeletionScope,signal:AbortSignal)=>Promise<boolean>}>;
