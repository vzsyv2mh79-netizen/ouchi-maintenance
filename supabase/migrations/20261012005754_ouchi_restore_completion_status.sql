begin;
-- Prepared service-only status lookup. "Complete" records a durable past job,
-- NOT a current premium entitlement: later refund/expiry remains in the ledger.
create function public.maintenance_restore_completion_is_current(
 target_request uuid,target_lease uuid,target_user uuid,verified_session uuid,target_epoch uuid,
 original_tx text,store_app_tx text,verified_bundle text)
 returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if target_user is null or target_epoch is null or verified_session is null then return false; end if;
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 return exists(select 1 from maintenance_private.restore_transfer_policy where id=1 and enabled)
 and public.read_maintenance_explicit_enrollment(target_user,verified_session) is not distinct from target_epoch
 and exists(select 1 from maintenance_private.restore_transfer_jobs j
 join maintenance_private.transaction_ownership o on o.environment=j.environment and o.original_transaction_id=j.original_transaction_id
 join maintenance_private.verified_transactions t on t.environment=j.environment and t.transaction_id=j.completed_transaction_id
 where j.id=target_request and j.lease_token=target_lease and j.user_id=target_user and j.session_id=verified_session
 and j.app_epoch_id=target_epoch and j.environment='Sandbox' and j.phase='completed'
 and j.original_transaction_id=original_tx and j.app_transaction_id=store_app_tx and j.bundle_id=verified_bundle
 and o.user_id=target_user and o.app_epoch_id=target_epoch
 and t.user_id=target_user and t.app_epoch_id=target_epoch and t.original_transaction_id=j.original_transaction_id
 and t.signed_at>=floor(extract(epoch from j.authorized_at)*1000)::bigint);
end;$$;
revoke all on function public.maintenance_restore_completion_is_current(uuid,uuid,uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.maintenance_restore_completion_is_current(uuid,uuid,uuid,uuid,uuid,text,text,text) to service_role;
commit;
