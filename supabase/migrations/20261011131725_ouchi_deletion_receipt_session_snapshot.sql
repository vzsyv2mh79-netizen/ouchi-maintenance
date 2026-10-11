begin;
-- Independent receipt authorization, not account finalization or activation.
alter table maintenance_private.account_deletion_requests
 add column receipt_sessions_captured boolean not null default false,
 add column receipt_expires_at timestamptz,
 add constraint finite_deletion_receipt_expiry check(receipt_expires_at is null or
   (receipt_expires_at>updated_at and receipt_expires_at<=updated_at+interval '30 days'));
create table maintenance_private.deletion_receipt_sessions (
 request_id uuid not null references maintenance_private.account_deletion_requests(id) on delete cascade,
 session_id uuid not null,
 primary key(request_id,session_id)
);
alter table maintenance_private.deletion_receipt_sessions enable row level security;
revoke all on maintenance_private.deletion_receipt_sessions from public,anon,authenticated;
grant select,insert,delete on maintenance_private.deletion_receipt_sessions to service_role;
grant update(receipt_sessions_captured) on maintenance_private.account_deletion_requests to service_role;
create function public.capture_maintenance_deletion_receipt_sessions(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 perform 1 from maintenance_private.account_deletion_requests where id=target_request for update;
 if not public.maintenance_deletion_lease_is_current(target_request,target_user,target_epoch,target_lease) then return false; end if;
 if not exists(select 1 from maintenance_private.account_deletion_requests where id=target_request and inventory_captured and records_erased)
 or exists(select 1 from maintenance_private.account_deletion_objects where request_id=target_request and not absence_confirmed) then return false; end if;
 if not exists(select 1 from maintenance_private.account_access where user_id=target_user and not enabled)
 or not exists(select 1 from maintenance_private.app_epochs where user_id=target_user and epoch_id=target_epoch and not enabled) then return false; end if;
 if exists(select 1 from maintenance_private.account_deletion_requests where id=target_request and receipt_sessions_captured) then return true; end if;
 insert into maintenance_private.deletion_receipt_sessions(request_id,session_id)
 select target_request,s.session_id from maintenance_private.app_session_epochs s
 join auth.sessions live on live.id=s.session_id and live.user_id=s.user_id
 where s.user_id=target_user and s.epoch_id=target_epoch;
 if not exists(select 1 from maintenance_private.deletion_receipt_sessions where request_id=target_request) then return false; end if;
 update maintenance_private.account_deletion_requests set receipt_sessions_captured=true where id=target_request;
 return true;
end;$$;
create or replace function public.read_maintenance_session_deletion_progress(target_user uuid,verified_session uuid,target_request uuid default null) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('requestID',r.id,'userID',r.user_id,'epochID',r.app_epoch_id,'state',r.state)
 from maintenance_private.account_deletion_requests r
 where r.user_id=target_user and (target_request is null or r.id=target_request)
 and public.maintenance_auth_session_is_current(target_user,verified_session)
 and not exists(select 1 from maintenance_private.app_epochs e where e.user_id=target_user and e.epoch_id<>r.app_epoch_id)
 and case when r.receipt_sessions_captured then
  exists(select 1 from maintenance_private.deletion_receipt_sessions s where s.request_id=r.id and s.session_id=verified_session)
  and (r.state<>'complete' or r.receipt_expires_at>statement_timestamp())
 else exists(select 1 from maintenance_private.app_epochs e where e.user_id=target_user and e.epoch_id=r.app_epoch_id) end
 order by r.requested_at desc,r.id limit 1;
$$;
revoke all on function public.capture_maintenance_deletion_receipt_sessions(uuid,uuid,uuid,uuid),public.read_maintenance_session_deletion_progress(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.capture_maintenance_deletion_receipt_sessions(uuid,uuid,uuid,uuid),public.read_maintenance_session_deletion_progress(uuid,uuid,uuid) to service_role;
grant delete on maintenance_private.account_deletion_requests to service_role;
create function public.prune_maintenance_completed_deletion_receipts(batch_size integer default 500) returns integer
language plpgsql security invoker set search_path='' as $$
declare removed integer;
begin
 if batch_size is null or batch_size<1 or batch_size>500 then raise exception 'Invalid receipt cleanup limit'; end if;
 with candidates as (
  select r.id from maintenance_private.account_deletion_requests r
  where r.state='complete' and r.receipt_sessions_captured and r.receipt_expires_at<=statement_timestamp()
   and r.inventory_captured and r.records_erased
   and not exists(select 1 from maintenance_private.account_deletion_objects o where o.request_id=r.id)
  order by r.receipt_expires_at,r.id limit batch_size for update skip locked
 ), erased as (
  delete from maintenance_private.account_deletion_requests r using candidates c where r.id=c.id returning r.id
 ) select count(*)::integer into removed from erased;
 return removed;
end;$$;
revoke all on function public.prune_maintenance_completed_deletion_receipts(integer) from public,anon,authenticated;
grant execute on function public.prune_maintenance_completed_deletion_receipts(integer) to service_role;
commit;
