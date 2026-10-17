begin;
-- Prepared only: historical unscoped records are not assigned by guesswork.
alter table maintenance_private.verified_notifications add column user_id uuid, add column app_epoch_id uuid, add column original_transaction_id text;
alter table maintenance_private.verified_notifications add constraint notification_owner_scope check ((user_id is null and app_epoch_id is null and original_transaction_id is null) or (user_id is not null and app_epoch_id is not null and original_transaction_id is not null));
create index verified_notifications_owner_epoch on maintenance_private.verified_notifications(user_id,app_epoch_id);
grant delete on maintenance_private.verified_notifications to service_role;
create or replace function public.record_maintenance_verified_notification(payload jsonb, proof_sha256 text)
returns text language plpgsql security invoker set search_path='' as $$
declare
 inserted uuid;
 scoped boolean; owner maintenance_private.transaction_ownership; uid uuid; epoch uuid; original text;
 prior maintenance_private.verified_notifications%rowtype;
begin
 if payload is null or jsonb_typeof(payload) <> 'object' or proof_sha256 is null then
  raise exception 'Invalid notification';
 end if;
 if proof_sha256 !~ '^[0-9a-f]{64}$' or payload->>'environment' is null or payload->>'environment' not in ('Sandbox','Production')
 or (payload->>'notificationId')::uuid is null or (payload->>'notificationId')::uuid='00000000-0000-0000-0000-000000000000'::uuid
 or payload->>'notificationType' is null or payload->>'notificationType' !~ '^[A-Z_]{1,80}$'
 or (payload->>'subtype' is not null and payload->>'subtype' !~ '^[A-Z_]{1,80}$')
 or (payload->>'signedAt')::bigint is null or (payload->>'signedAt')::bigint not between 1 and 9007199254740991
 or payload->>'disposition' is null or payload->>'disposition' not in ('test','transaction_applied','needs_reconciliation') then raise exception 'Invalid notification fields'; end if;
 scoped:=payload ? 'accountToken' or payload ? 'originalTransactionId';
 if scoped then
  epoch:=(payload->>'accountToken')::uuid;original:=payload->>'originalTransactionId';
  if epoch is null or epoch='00000000-0000-0000-0000-000000000000'::uuid or original is null or original !~ '^[0-9]{1,128}$' then raise exception 'Invalid notification scope'; end if;
  select * into owner from maintenance_private.transaction_ownership where environment=payload->>'environment' and original_transaction_id=original;
  if not found then raise exception 'Unknown notification owner'; end if;
  uid:=owner.user_id;
  perform pg_advisory_xact_lock(hashtext(uid::text));
  select * into owner from maintenance_private.transaction_ownership where environment=payload->>'environment' and original_transaction_id=original for update;
  if not found or owner.user_id is distinct from uid or owner.app_epoch_id is distinct from epoch then raise exception 'Notification owner mismatch'; end if;
  if not exists(select 1 from maintenance_private.app_epochs e join maintenance_private.account_access a on a.user_id=e.user_id where e.user_id=uid and e.epoch_id=epoch and e.enabled and a.enabled) then return 'retired'; end if;
 elsif payload->>'disposition'='transaction_applied' then raise exception 'Applied transaction scope required';
 end if;
 insert into maintenance_private.verified_notifications(environment,notification_id,notification_type,subtype,signed_at,proof_sha256,disposition,user_id,app_epoch_id,original_transaction_id)
 values(payload->>'environment',(payload->>'notificationId')::uuid,payload->>'notificationType',payload->>'subtype',(payload->>'signedAt')::bigint,proof_sha256,payload->>'disposition',uid,epoch,original)
 on conflict(environment,notification_id) do nothing returning notification_id into inserted;
 if inserted is not null then return 'inserted'; end if;
 select * into prior from maintenance_private.verified_notifications
 where environment=payload->>'environment' and notification_id=(payload->>'notificationId')::uuid;
 if not found or prior.proof_sha256 <> proof_sha256
  or prior.notification_type <> payload->>'notificationType'
  or prior.subtype is distinct from payload->>'subtype'
  or prior.signed_at <> (payload->>'signedAt')::bigint
  or prior.disposition <> payload->>'disposition' or prior.user_id is distinct from uid or prior.app_epoch_id is distinct from epoch or prior.original_transaction_id is distinct from original then
  raise exception 'Notification identity conflict';
 end if;
 return 'duplicate';
end;
$$;
revoke all on function public.record_maintenance_verified_notification(jsonb,text) from public,anon,authenticated;
grant execute on function public.record_maintenance_verified_notification(jsonb,text) to service_role;
create function public.erase_maintenance_deletion_notifications(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 perform 1 from maintenance_private.account_deletion_requests where id=target_request for update;
 if not public.maintenance_deletion_lease_is_current(target_request,target_user,target_epoch,target_lease) then return false; end if;
 if not exists(select 1 from maintenance_private.account_deletion_requests where id=target_request and records_erased and inventory_captured) then return false; end if;
 if exists(select 1 from maintenance_private.account_deletion_objects where request_id=target_request and not absence_confirmed) then return false; end if;
 if not exists(select 1 from maintenance_private.account_access where user_id=target_user and not enabled)
 or not exists(select 1 from maintenance_private.app_epochs where user_id=target_user and epoch_id=target_epoch and not enabled) then return false; end if;
 delete from maintenance_private.verified_notifications where user_id=target_user and app_epoch_id=target_epoch;
 return not exists(select 1 from maintenance_private.verified_notifications where user_id=target_user and app_epoch_id=target_epoch);
end;$$;
revoke all on function public.erase_maintenance_deletion_notifications(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.erase_maintenance_deletion_notifications(uuid,uuid,uuid,uuid) to service_role;
commit;
