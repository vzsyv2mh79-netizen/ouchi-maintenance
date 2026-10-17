begin;
-- Service-only status; verified current Auth is mandatory in its HTTP caller.
-- Exact durable pair/assertion digests are binding, never independent authority.
-- No lease/token/Apple identifiers are returned to the client.
create function public.read_maintenance_restore_job_status(
 target_request uuid,target_user uuid,verified_session uuid,target_epoch uuid,
 expected_bundle text,verified_pair_hash text,verified_assertion_hash text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare j maintenance_private.restore_transfer_jobs;
begin
 if target_request is null or target_user is null or verified_session is null or target_epoch is null
 or target_request='00000000-0000-0000-0000-000000000000'::uuid
 or verified_pair_hash is null or verified_pair_hash !~ '^[0-9a-f]{64}$'
 or verified_assertion_hash is null or verified_assertion_hash !~ '^[0-9a-f]{64}$' then return null; end if;
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 perform 1 from maintenance_private.restore_transfer_policy where id=1 and enabled for share;
 if not found or public.read_maintenance_explicit_enrollment(target_user,verified_session) is distinct from target_epoch then return null; end if;
 select * into j from maintenance_private.restore_transfer_jobs where id=target_request and user_id=target_user
 and session_id=verified_session and app_epoch_id=target_epoch and environment='Sandbox'
 and bundle_id=expected_bundle and pair_hash=verified_pair_hash and assertion_hash=verified_assertion_hash for share;
 if not found then return null; end if;
 if j.phase='completed' then
  if not public.maintenance_restore_completion_is_current(j.id,j.lease_token,target_user,verified_session,target_epoch,j.original_transaction_id,j.app_transaction_id,expected_bundle) then return null; end if;
  return jsonb_build_object('requestID',j.id,'status','complete');
 end if;
 if j.phase not in ('authorized','update_started') then return null; end if;
 return jsonb_build_object('requestID',j.id,'status','pending');
end;$$;
revoke all on function public.read_maintenance_restore_job_status(uuid,uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.read_maintenance_restore_job_status(uuid,uuid,uuid,uuid,text,text,text) to service_role;
commit;
