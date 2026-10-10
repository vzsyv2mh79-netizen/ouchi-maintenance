begin;
-- Service-only request leasing. No physical erasure or completion RPC yet.
alter table maintenance_private.account_deletion_requests
 add column lease_token uuid,
 add column lease_until timestamptz,
 add column attempts integer not null default 0 check(attempts between 0 and 8),
 add column available_at timestamptz not null default now(),
 add constraint deletion_lease_state check((state='running' and lease_token is not null and lease_until is not null) or (state<>'running' and lease_token is null and lease_until is null));
create index deletion_requests_ready on maintenance_private.account_deletion_requests(state,available_at,lease_until);
-- UPDATE is limited to lease/state columns. Immutable account scope stays protected.
grant update(state,lease_token,lease_until,attempts,available_at,updated_at) on maintenance_private.account_deletion_requests to service_role;
create function public.claim_maintenance_account_deletion() returns jsonb
language plpgsql security invoker set search_path='' as $$
declare job maintenance_private.account_deletion_requests;
begin
 update maintenance_private.account_deletion_requests r set state='failed',lease_token=null,lease_until=null,updated_at=now()
 where r.state in ('pending','running') and
 (exists(select 1 from maintenance_private.app_epochs a where a.user_id=r.user_id and a.epoch_id<>r.app_epoch_id)
 or (r.attempts>=8 and (r.state='pending' or r.lease_until<=now())));
 select * into job from maintenance_private.account_deletion_requests
 where attempts<8 and ((state='pending' and available_at<=now()) or (state='running' and lease_until<=now()))
 order by requested_at,id for update skip locked limit 1;
 if not found then return null; end if;
 update maintenance_private.account_deletion_requests set state='running',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',updated_at=now()
 where id=job.id returning * into job;
 return jsonb_build_object('requestID',job.id,'userID',job.user_id,'epochID',job.app_epoch_id,'leaseToken',job.lease_token,'leaseUntil',job.lease_until);
end;$$;
create function public.maintenance_deletion_lease_is_current(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from maintenance_private.account_deletion_requests r
 where r.id=target_request and r.user_id=target_user and r.app_epoch_id=target_epoch and r.lease_token=target_lease and r.state='running' and r.lease_until>now()
 and not exists(select 1 from maintenance_private.app_epochs a where a.user_id=r.user_id and a.epoch_id<>r.app_epoch_id));
$$;
create function public.defer_maintenance_account_deletion(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 update maintenance_private.account_deletion_requests r set state=case when attempts>=8 then 'failed' else 'pending' end,
 lease_token=null,lease_until=null,available_at=now()+least(interval '1 hour',interval '10 seconds'*power(2,greatest(attempts-1,0))),updated_at=now()
 where r.id=target_request and r.user_id=target_user and r.app_epoch_id=target_epoch and r.lease_token=target_lease and r.state='running' and r.lease_until>now()
 and not exists(select 1 from maintenance_private.app_epochs a where a.user_id=r.user_id and a.epoch_id<>r.app_epoch_id);
 return found;
end;$$;
revoke all on function public.claim_maintenance_account_deletion(),public.maintenance_deletion_lease_is_current(uuid,uuid,uuid,uuid),public.defer_maintenance_account_deletion(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_maintenance_account_deletion(),public.maintenance_deletion_lease_is_current(uuid,uuid,uuid,uuid),public.defer_maintenance_account_deletion(uuid,uuid,uuid,uuid) to service_role;
commit;
