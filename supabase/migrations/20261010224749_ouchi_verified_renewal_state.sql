begin;
create table maintenance_private.verified_renewals (
 environment text not null check(environment in ('Sandbox','Production')),
 original_transaction_id text not null,
 user_id uuid not null references auth.users(id),
 app_epoch_id uuid not null,
 product_id text not null check(product_id in ('ouchi.premium.monthly','ouchi.premium.annual')),
 signed_at bigint not null check(signed_at between 1 and 9007199254740991),
 renewal_date bigint not null check(renewal_date between 1 and 9007199254740991),
 auto_renew_status integer not null check(auto_renew_status in (0,1)),
 is_in_retry boolean not null,
 grace_expires_at bigint check(grace_expires_at between 1 and 9007199254740991 and grace_expires_at>renewal_date),
 proof_sha256 text not null check(proof_sha256 ~ '^[0-9a-f]{64}$'),
 primary key(environment,original_transaction_id),
 foreign key(environment,original_transaction_id) references maintenance_private.transaction_ownership(environment,original_transaction_id)
);
create index verified_transactions_period_order on maintenance_private.verified_transactions(environment,original_transaction_id,purchased_at);
alter table maintenance_private.verified_renewals enable row level security;
revoke all on maintenance_private.verified_renewals from public,anon,authenticated;
grant select,insert,update on maintenance_private.verified_renewals to service_role;
create function public.apply_maintenance_verified_renewal(payload jsonb,proof_sha256 text)
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
 select * into owner from maintenance_private.transaction_ownership where environment=env and original_transaction_id=original for update;
 if not found or owner.app_epoch_id is distinct from epoch then raise exception 'Renewal ownership mismatch'; end if;
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
revoke all on function public.apply_maintenance_verified_renewal(jsonb,text) from public,anon,authenticated;
grant execute on function public.apply_maintenance_verified_renewal(jsonb,text) to service_role;

create or replace function public.read_maintenance_verified_entitlement(target_user uuid,verified_session uuid,target_epoch uuid,target_environment text)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare binding uuid;active_product text;active_expiry bigint;now_ms bigint:=floor(extract(epoch from statement_timestamp())*1000)::bigint;
begin
 if target_environment is null or target_environment not in ('Sandbox','Production') then raise exception 'Invalid purchase environment'; end if;
 binding:=public.current_maintenance_purchase_account(target_user,verified_session);
 if binding is null or target_epoch is null or binding<>target_epoch then raise exception 'Purchase account unavailable'; end if;
 with periods as (
  select t.product_id,t.transaction_id,
   case when r.user_id=t.user_id and r.app_epoch_id=t.app_epoch_id and r.product_id=t.product_id
    and r.renewal_date=t.expires_at and r.is_in_retry and r.grace_expires_at>now_ms
    and not exists(select 1 from maintenance_private.verified_transactions newer where newer.environment=t.environment and newer.original_transaction_id=t.original_transaction_id and newer.purchased_at>t.purchased_at)
    then greatest(t.expires_at,r.grace_expires_at) else t.expires_at end as access_until
  from maintenance_private.verified_transactions t left join maintenance_private.verified_renewals r on r.environment=t.environment and r.original_transaction_id=t.original_transaction_id
  where t.user_id=target_user and t.app_epoch_id=target_epoch and t.environment=target_environment
   and t.product_id in ('ouchi.premium.monthly','ouchi.premium.annual') and t.revoked_at is null and not t.is_upgraded and t.purchased_at<=now_ms
 ) select product_id,access_until into active_product,active_expiry from periods where access_until>now_ms order by access_until desc,transaction_id asc limit 1;
 if active_product is null then return jsonb_build_object('plan','free','environment',target_environment); end if;
 return jsonb_build_object('plan','premium','productId',active_product,'expiresAt',active_expiry,'environment',target_environment);
end;
$$;
revoke all on function public.read_maintenance_verified_entitlement(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.read_maintenance_verified_entitlement(uuid,uuid,uuid,text) to service_role;
commit;
