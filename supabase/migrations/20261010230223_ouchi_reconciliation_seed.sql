begin;
-- Interactive recovery seed only. Caller must first verify the exact bearer with Auth.getUser.
create function public.read_maintenance_reconciliation_seed(target_user uuid,verified_session uuid,target_epoch uuid,target_environment text)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare binding uuid;seed maintenance_private.verified_transactions;
begin
 if target_environment is null or target_environment not in ('Sandbox','Production') then raise exception 'Invalid recovery environment'; end if;
 binding:=public.current_maintenance_purchase_account(target_user,verified_session);
 if binding is null or target_epoch is null or binding<>target_epoch then raise exception 'Recovery enrollment unavailable'; end if;
 select * into seed from maintenance_private.verified_transactions t
 where t.user_id=target_user and t.app_epoch_id=target_epoch and t.environment=target_environment
 order by (t.product_id in ('ouchi.premium.monthly','ouchi.premium.annual')) desc,t.signed_at desc,t.transaction_id asc limit 1;
 if not found then return null; end if;
 return jsonb_strip_nulls(jsonb_build_object('environment',seed.environment,'transactionId',seed.transaction_id,'originalTransactionId',seed.original_transaction_id,'productId',seed.product_id,'accountToken',seed.app_epoch_id,'signedAt',seed.signed_at,'purchasedAt',seed.purchased_at,'expiresAt',seed.expires_at,'revokedAt',seed.revoked_at,'isUpgraded',seed.is_upgraded));
end;
$$;
revoke all on function public.read_maintenance_reconciliation_seed(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.read_maintenance_reconciliation_seed(uuid,uuid,uuid,text) to service_role;
commit;
