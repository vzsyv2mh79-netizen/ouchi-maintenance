begin;
-- Apple-signed renewal pairing, including closed epochs for historical storage only.
create function public.read_maintenance_original_transaction(target_environment text,target_original text)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare seed maintenance_private.verified_transactions;
begin
 if target_environment is null or target_environment not in ('Sandbox','Production') or target_original is null or target_original !~ '^[0-9]{1,128}$' then raise exception 'Invalid renewal lookup'; end if;
 select * into seed from maintenance_private.verified_transactions where environment=target_environment and original_transaction_id=target_original
 order by purchased_at desc,signed_at desc,transaction_id desc limit 1;
 if not found then return null; end if;
 return jsonb_strip_nulls(jsonb_build_object('environment',seed.environment,'transactionId',seed.transaction_id,'originalTransactionId',seed.original_transaction_id,'productId',seed.product_id,'accountToken',seed.app_epoch_id,'signedAt',seed.signed_at,'purchasedAt',seed.purchased_at,'expiresAt',seed.expires_at,'revokedAt',seed.revoked_at,'isUpgraded',seed.is_upgraded));
end;$$;
revoke all on function public.read_maintenance_original_transaction(text,text) from public,anon,authenticated;
grant execute on function public.read_maintenance_original_transaction(text,text) to service_role;
commit;
