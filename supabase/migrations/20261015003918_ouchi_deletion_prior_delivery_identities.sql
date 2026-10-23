begin;
-- Additive correction only. Retired delivery identifiers remain personal data.
-- A current deletion lease retires this Ouchi account, including older epochs;
-- retaining older rows would prevent the existing identity absence checkpoint.
-- Preserve the existing invoker ACLs, lock order and disabled-access gates.
create or replace function public.erase_maintenance_deletion_native_delivery_identities(
 target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 perform 1 from maintenance_private.account_deletion_requests where id=target_request for update;
 if not public.maintenance_deletion_lease_is_current(target_request,target_user,target_epoch,target_lease) then return false;end if;
 if not exists(select 1 from maintenance_private.account_deletion_requests where id=target_request and inventory_captured)
 or exists(select 1 from maintenance_private.account_access where user_id=target_user and enabled)
 or exists(select 1 from maintenance_private.app_epochs where user_id=target_user and enabled) then return false;end if;
 delete from maintenance_private.native_delivery_identities where user_id=target_user;
 return not exists(select 1 from maintenance_private.native_delivery_identities where user_id=target_user);
end $$;
commit;
