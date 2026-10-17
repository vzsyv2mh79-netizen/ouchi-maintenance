begin;
create function public.maintenance_reconciliation_lease_is_current(target_job uuid,target_lease uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from maintenance_private.reconciliation_jobs j
 join maintenance_private.app_epochs e on e.user_id=j.user_id and e.epoch_id=j.app_epoch_id
 join maintenance_private.account_access a on a.user_id=j.user_id
 where j.id=target_job and j.state='running' and j.lease_token=target_lease and j.lease_until>now() and e.enabled and a.enabled);
$$;
create function public.read_maintenance_reconciliation_job_seed(target_job uuid,target_lease uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare seed maintenance_private.verified_transactions;
begin
 if not public.maintenance_reconciliation_lease_is_current(target_job,target_lease) then raise exception 'Recovery lease unavailable'; end if;
 select t.* into seed from maintenance_private.reconciliation_jobs j join maintenance_private.verified_transactions t
 on t.transaction_id=j.transaction_id and t.environment=j.environment and t.user_id=j.user_id and t.app_epoch_id=j.app_epoch_id
 where j.id=target_job and j.lease_token=target_lease;
 if not found then raise exception 'Recovery seed unavailable'; end if;
 return jsonb_strip_nulls(jsonb_build_object('environment',seed.environment,'transactionId',seed.transaction_id,'originalTransactionId',seed.original_transaction_id,'productId',seed.product_id,'accountToken',seed.app_epoch_id,'signedAt',seed.signed_at,'purchasedAt',seed.purchased_at,'expiresAt',seed.expires_at,'revokedAt',seed.revoked_at,'isUpgraded',seed.is_upgraded));
end;$$;
revoke all on function public.maintenance_reconciliation_lease_is_current(uuid,uuid),public.read_maintenance_reconciliation_job_seed(uuid,uuid) from public,anon,authenticated;
grant execute on function public.maintenance_reconciliation_lease_is_current(uuid,uuid),public.read_maintenance_reconciliation_job_seed(uuid,uuid) to service_role;
commit;
