// Operator-only aggregate observation. No credentials, endpoint, schedule or
// erase operation is discovered/enabled here. A reviewed bounded read-only
// private query provider must be explicitly supplied by the deployment.
export const ATTACHMENT_RETENTION_OBSERVATION_SQL=`with observed as materialized (
 select clock_timestamp() as at
), pending as materialized (
 select id,removal_requested_at,write_tracking
 from maintenance_private.product_attachments
 where removal_pending and state<>'removed'
)
select jsonb_build_object(
 'observedAt',(select at from observed),
 'pendingFiles',(select count(*) from pending),
 'unknownRequestTimeFiles',(select count(*) from pending where removal_requested_at is null),
 'futureRequestTimeFiles',(select count(*) from pending where removal_requested_at>(select at from observed)),
 'olderThan30DaysFiles',(select count(*) from pending where removal_requested_at<=(select at from observed)-interval '30 days'),
 'oldestKnownRequestAt',(select min(removal_requested_at) from pending where removal_requested_at<=(select at from observed)),
 'unsettledWriteFiles',(select count(*) from pending p where exists(
  select 1 from maintenance_private.attachment_write_attempts a where a.attachment_id=p.id and a.state<>'settled')),
 'legacyUnknownWriteFiles',(select count(*) from pending where not write_tracking)
) as observation`;

const counters=['pendingFiles','unknownRequestTimeFiles','futureRequestTimeFiles','olderThan30DaysFiles','unsettledWriteFiles','legacyUnknownWriteFiles'];
const keys=[...counters,'observedAt','oldestKnownRequestAt'].sort().join(',');
export async function readAttachmentRetentionObservation(query,signal){
 if(typeof query!=='function'||!(signal instanceof AbortSignal))throw Error('Explicit retention observation provider required');
 signal.throwIfAborted();
 try{
  const result=await query(ATTACHMENT_RETENTION_OBSERVATION_SQL,[],signal);
  signal.throwIfAborted();
  if(!Array.isArray(result?.rows)||result.rows.length!==1)throw Error('Observation unavailable');
  const row=result.rows[0].observation;
  if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).sort().join(',')!==keys
   ||counters.some(key=>!Number.isSafeInteger(row[key])||row[key]<0)
   ||typeof row.observedAt!=='string'||!Number.isFinite(Date.parse(row.observedAt))
   ||(row.oldestKnownRequestAt!==null&&(typeof row.oldestKnownRequestAt!=='string'
    ||!Number.isFinite(Date.parse(row.oldestKnownRequestAt))||Date.parse(row.oldestKnownRequestAt)>Date.parse(row.observedAt)))
   ||counters.some(key=>row[key]>row.pendingFiles)
   ||row.unknownRequestTimeFiles+row.futureRequestTimeFiles>row.pendingFiles
   ||(row.oldestKnownRequestAt===null)!==(row.pendingFiles===row.unknownRequestTimeFiles+row.futureRequestTimeFiles)
   ||row.olderThan30DaysFiles>row.pendingFiles-row.unknownRequestTimeFiles-row.futureRequestTimeFiles)throw Error('Observation unavailable');
  return Object.freeze({...row});
 }catch{
  signal.throwIfAborted();
  throw Error('Attachment retention observation unavailable');
 }
}
