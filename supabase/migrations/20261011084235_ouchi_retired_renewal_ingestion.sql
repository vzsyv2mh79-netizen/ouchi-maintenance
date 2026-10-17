begin;
-- Prepared only; verifies owned retirement without granting rights or enabling billing.
create function public.read_maintenance_renewal_retirement(target_environment text,target_original text,target_epoch uuid) returns boolean
language plpgsql volatile security invoker set search_path='' as $$
declare owner maintenance_private.transaction_ownership;
begin
 if target_environment is null or target_environment not in ('Sandbox','Production') or target_original is null or target_original !~ '^[0-9]{1,128}$'
 or target_epoch='00000000-0000-0000-0000-000000000000'::uuid then raise exception 'Invalid renewal locator'; end if;
 select * into owner from maintenance_private.transaction_ownership where environment=target_environment and original_transaction_id=target_original;
 if not found then return null; end if;
 perform pg_advisory_xact_lock(hashtext(owner.user_id::text));
 select * into owner from maintenance_private.transaction_ownership where environment=target_environment and original_transaction_id=target_original for update;
 if not found then return null; end if;
 if target_epoch is not null and target_epoch<>owner.app_epoch_id then raise exception 'Renewal enrollment mismatch'; end if;
 return not exists(select 1 from maintenance_private.app_epochs e join maintenance_private.account_access a on a.user_id=e.user_id
 where e.user_id=owner.user_id and e.epoch_id=owner.app_epoch_id and e.enabled and a.enabled);
end;$$;
create or replace function public.apply_maintenance_verified_renewal(payload jsonb,proof_sha256 text)
returns text language plpgsql security invoker set search_path='' as $$
declare
 owner maintenance_private.transaction_ownership;
 prior maintenance_private.verified_renewals;
 env text:=payload->>'environment'; original text:=payload->>'originalTransactionId';
 epoch uuid:=(payload->>'accountToken')::uuid;
 signed bigint:=(payload->>'signedAt')::bigint; period bigint:=(payload->>'renewalDate')::bigint;
 renewal integer:=(payload->>'autoRenewStatus')::integer;
 retry boolean:=coalesce((payload->>'isInBillingRetryPeriod')::boolean,false);
 grace bigint:=(payload->>'gracePeriodExpiresAt')::bigint;
begin
 if jsonb_typeof(payload) is distinct from 'object' or proof_sha256 is null or proof_sha256 !~ '^[0-9a-f]{64}$'
  or env is null or env not in ('Sandbox','Production') or original is null or epoch is null or signed is null or period is null or renewal is null
  or (payload ? 'isInBillingRetryPeriod' and jsonb_typeof(payload->'isInBillingRetryPeriod') <> 'boolean')
 then raise exception 'Invalid verified renewal'; end if;
 select * into owner from maintenance_private.transaction_ownership where environment=env and original_transaction_id=original;
 if not found then raise exception 'Renewal ownership unavailable'; end if;
 perform pg_advisory_xact_lock(hashtext(owner.user_id::text));
 select * into owner from maintenance_private.transaction_ownership where environment=env and original_transaction_id=original for update;
 if not found or owner.app_epoch_id is distinct from epoch then raise exception 'Renewal ownership mismatch'; end if;
 if signed not between 1 and 9007199254740991 or period not between 1 and 9007199254740991 or renewal not in (0,1)
 or payload->>'productId' is null or payload->>'productId' not in ('ouchi.premium.monthly','ouchi.premium.annual')
 or (grace is not null and (grace not between 1 and 9007199254740991 or grace<=period)) then raise exception 'Invalid renewal fields'; end if;
 if not exists(select 1 from maintenance_private.app_epochs e join maintenance_private.account_access a on a.user_id=e.user_id
 where e.user_id=owner.user_id and e.epoch_id=epoch and e.enabled and a.enabled) then return 'retired'; end if;
 if not exists(select 1 from maintenance_private.verified_transactions t where t.environment=env and t.original_transaction_id=original and t.user_id=owner.user_id and t.app_epoch_id=epoch and t.product_id=payload->>'productId' and t.expires_at=period) then raise exception 'Unpaired renewal period'; end if;
 select * into prior from maintenance_private.verified_renewals where environment=env and original_transaction_id=original for update;
 if found then
  if signed < prior.signed_at then return 'ignored'; end if;
  if signed = prior.signed_at then
   if prior.product_id is distinct from payload->>'productId' or prior.renewal_date <> period or prior.auto_renew_status <> renewal or prior.is_in_retry <> retry or prior.grace_expires_at is distinct from grace then raise exception 'Conflicting renewal snapshot'; end if;
   return 'ignored';
  end if;
  update maintenance_private.verified_renewals set product_id=payload->>'productId',signed_at=signed,renewal_date=period,auto_renew_status=renewal,is_in_retry=retry,grace_expires_at=grace,proof_sha256=apply_maintenance_verified_renewal.proof_sha256 where environment=env and original_transaction_id=original;
  return 'updated';
 end if;
 insert into maintenance_private.verified_renewals(environment,original_transaction_id,user_id,app_epoch_id,product_id,signed_at,renewal_date,auto_renew_status,is_in_retry,grace_expires_at,proof_sha256)
 values(env,original,owner.user_id,epoch,payload->>'productId',signed,period,renewal,retry,grace,proof_sha256);
 return 'inserted';
end;
$$;
revoke all on function public.read_maintenance_renewal_retirement(text,text,uuid),public.apply_maintenance_verified_renewal(jsonb,text) from public,anon,authenticated;
grant execute on function public.read_maintenance_renewal_retirement(text,text,uuid),public.apply_maintenance_verified_renewal(jsonb,text) to service_role;
commit;
