begin;
-- Dormant service-only Sandbox dispatch. Persistent 60-second polling throttle
-- does not expire a job, release ownership or retry an uncertain Apple mutation.
alter table maintenance_private.restore_transfer_jobs add column last_dispatch_at timestamptz;
alter table maintenance_private.restore_transfer_jobs add constraint restore_dispatch_time
 check(last_dispatch_at is null or last_dispatch_at>=authorized_at);
grant update(last_dispatch_at) on maintenance_private.restore_transfer_jobs to service_role;

create function public.claim_maintenance_restore_transfer(
 target_request uuid,target_user uuid,verified_session uuid,target_epoch uuid,
 expected_bundle text,verified_pair_hash text,verified_assertion_hash text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare j maintenance_private.restore_transfer_jobs; now_at timestamptz;
begin
 if target_request is null or target_user is null or verified_session is null or target_epoch is null
 or verified_pair_hash is null or verified_pair_hash !~ '^[0-9a-f]{64}$'
 or verified_assertion_hash is null or verified_assertion_hash !~ '^[0-9a-f]{64}$' then return null; end if;
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 perform 1 from maintenance_private.restore_transfer_policy where id=1 and enabled for share;
 if not found or public.read_maintenance_explicit_enrollment(target_user,verified_session) is distinct from target_epoch then return null; end if;
 select * into j from maintenance_private.restore_transfer_jobs where id=target_request and user_id=target_user
 and session_id=verified_session and app_epoch_id=target_epoch and environment='Sandbox' and bundle_id=expected_bundle
 and pair_hash=verified_pair_hash and assertion_hash=verified_assertion_hash for update;
 if not found then return null; end if;
 if j.phase='completed' then
  if not public.maintenance_restore_completion_is_current(j.id,j.lease_token,target_user,verified_session,target_epoch,
   j.original_transaction_id,j.app_transaction_id,expected_bundle) then return null; end if;
  return jsonb_build_object('status','complete');
 end if;
 if j.phase not in ('authorized','update_started') then return null; end if;
 now_at=clock_timestamp();
 if now_at<j.authorized_at then return null; end if;
 if j.last_dispatch_at is not null and now_at<j.last_dispatch_at+interval '60 seconds' then
  return jsonb_build_object('status','pending');
 end if;
 update maintenance_private.restore_transfer_jobs set last_dispatch_at=now_at where id=j.id;
 return jsonb_build_object('status','claimed','job',jsonb_strip_nulls(jsonb_build_object(
 'id',j.id,'lease',j.lease_token,'userID',j.user_id,'sessionID',j.session_id,'epochID',j.app_epoch_id,
 'originalTransactionID',j.original_transaction_id,'appTransactionID',j.app_transaction_id,
 'previousAccountToken',j.previous_account_token,'environment',j.environment,'bundleID',j.bundle_id,
 'authorizedAt',floor(extract(epoch from j.authorized_at)*1000)::bigint,'phase',j.phase,
 'mutationStartedAt',floor(extract(epoch from j.mutation_started_at)*1000)::bigint)));
end;$$;
revoke all on function public.claim_maintenance_restore_transfer(uuid,uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.claim_maintenance_restore_transfer(uuid,uuid,uuid,uuid,text,text,text) to service_role;
commit;
