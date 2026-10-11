begin;
-- Ouchi purchase-record category only. No Apple cancellation, ownership transfer,
-- shared Auth deletion, identity finalization or completion transition.
grant delete on maintenance_private.verified_transactions,maintenance_private.verified_renewals,maintenance_private.transaction_ownership to service_role;
create function public.erase_maintenance_deletion_purchase_ledger(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 perform 1 from maintenance_private.account_deletion_requests where id=target_request for update;
 if not public.maintenance_deletion_lease_is_current(target_request,target_user,target_epoch,target_lease) then return false; end if;
 if not exists(select 1 from maintenance_private.account_deletion_requests where id=target_request and inventory_captured and records_erased and receipt_sessions_captured)
 or exists(select 1 from maintenance_private.account_deletion_objects where request_id=target_request) then return false; end if;
 if not exists(select 1 from maintenance_private.account_access where user_id=target_user and not enabled)
 or not exists(select 1 from maintenance_private.app_epochs where user_id=target_user and epoch_id=target_epoch and not enabled) then return false; end if;
 -- Refuse corrupted ownership links before deleting any category; never remove
 -- another owner's records merely because an original transaction key matches.
 if exists(select 1 from maintenance_private.verified_transactions t left join maintenance_private.transaction_ownership o
   on o.environment=t.environment and o.original_transaction_id=t.original_transaction_id
   where (t.user_id=target_user or o.user_id=target_user) and (t.user_id is distinct from o.user_id or t.app_epoch_id is distinct from o.app_epoch_id))
 or exists(select 1 from maintenance_private.verified_renewals t left join maintenance_private.transaction_ownership o
   on o.environment=t.environment and o.original_transaction_id=t.original_transaction_id
   where (t.user_id=target_user or o.user_id=target_user) and (t.user_id is distinct from o.user_id or t.app_epoch_id is distinct from o.app_epoch_id))
 or exists(select 1 from maintenance_private.verified_notifications t left join maintenance_private.transaction_ownership o
   on o.environment=t.environment and o.original_transaction_id=t.original_transaction_id
   where t.user_id is not null and (t.user_id=target_user or o.user_id=target_user)
    and (t.user_id is distinct from o.user_id or t.app_epoch_id is distinct from o.app_epoch_id)) then return false; end if;
 delete from maintenance_private.verified_notifications where user_id=target_user;
 delete from maintenance_private.verified_renewals where user_id=target_user;
 delete from maintenance_private.verified_transactions where user_id=target_user;
 delete from maintenance_private.transaction_ownership where user_id=target_user;
 return not exists(select 1 from maintenance_private.verified_notifications where user_id=target_user)
  and not exists(select 1 from maintenance_private.verified_renewals where user_id=target_user)
  and not exists(select 1 from maintenance_private.verified_transactions where user_id=target_user)
  and not exists(select 1 from maintenance_private.transaction_ownership where user_id=target_user);
end;$$;
revoke all on function public.erase_maintenance_deletion_purchase_ledger(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.erase_maintenance_deletion_purchase_ledger(uuid,uuid,uuid,uuid) to service_role;
commit;
