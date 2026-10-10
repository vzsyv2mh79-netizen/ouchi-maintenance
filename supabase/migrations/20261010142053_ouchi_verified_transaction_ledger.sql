-- Server must verify Apple JWS before this service-only write. Hashes are audit
-- references, not signature verification. No billing mode or entitlement enabled.
begin;
create table maintenance_private.transaction_ownership (
 environment text not null check(environment in ('Sandbox','Production')),
 original_transaction_id text not null check(length(original_transaction_id) between 1 and 128),
 user_id uuid not null references auth.users(id),
 app_epoch_id uuid not null,
 primary key(environment,original_transaction_id)
);
create table maintenance_private.verified_transactions (
 environment text not null check(environment in ('Sandbox','Production')),
 transaction_id text not null check(length(transaction_id) between 1 and 128),
 original_transaction_id text not null,
 user_id uuid not null references auth.users(id),
 app_epoch_id uuid not null,
 product_id text not null check(product_id in ('ouchi.premium.monthly','ouchi.premium.annual','ouchi.tip.small','ouchi.tip.medium','ouchi.tip.large')),
 signed_at bigint not null check(signed_at between 1 and 9007199254740991),
 purchased_at bigint not null check(purchased_at between 1 and 9007199254740991),
 expires_at bigint check(expires_at between 1 and 9007199254740991),
 revoked_at bigint check(revoked_at between 1 and 9007199254740991),
 is_upgraded boolean not null default false,
 proof_sha256 text not null check(proof_sha256 ~ '^[0-9a-f]{64}$'),
 primary key(environment,transaction_id),
 foreign key(environment,original_transaction_id) references maintenance_private.transaction_ownership(environment,original_transaction_id),
 check(product_id not in ('ouchi.premium.monthly','ouchi.premium.annual') or (expires_at is not null and expires_at>purchased_at))
);
create index verified_transactions_account on maintenance_private.verified_transactions(user_id,app_epoch_id,environment);
alter table maintenance_private.transaction_ownership enable row level security;
alter table maintenance_private.verified_transactions enable row level security;
revoke all on maintenance_private.transaction_ownership,maintenance_private.verified_transactions from public,anon,authenticated;
grant select,insert,update on maintenance_private.transaction_ownership,maintenance_private.verified_transactions to service_role;

create function public.apply_maintenance_verified_transaction(payload jsonb,proof_sha256 text) returns text
language plpgsql security invoker set search_path='' as $$
declare uid uuid; identities bigint; epoch uuid; env text; tx text; original text;
 owner maintenance_private.transaction_ownership; prior maintenance_private.verified_transactions;
 signed bigint; purchased bigint; expiry bigint; revoked bigint; upgraded boolean;
begin
 if jsonb_typeof(payload) is distinct from 'object' or proof_sha256 is null or proof_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'Invalid verified transaction'; end if;
 env:=payload->>'environment';tx:=payload->>'transactionId';original:=payload->>'originalTransactionId';epoch:=(payload->>'accountToken')::uuid;
 if env is null or env not in ('Sandbox','Production') or tx is null or length(tx) not between 1 and 128 or original is null or length(original) not between 1 and 128 or epoch is null then raise exception 'Invalid transaction identity'; end if;
 signed:=(payload->>'signedAt')::bigint;purchased:=(payload->>'purchasedAt')::bigint;expiry:=(payload->>'expiresAt')::bigint;revoked:=(payload->>'revokedAt')::bigint;upgraded:=coalesce((payload->>'isUpgraded')::boolean,false);
 select count(distinct user_id),max(user_id::text)::uuid into identities,uid from maintenance_private.app_session_epochs where epoch_id=epoch;
 if identities<>1 then raise exception 'Unknown purchase enrollment'; end if;
 -- Original ownership is permanent across account closure and later enrollment.
 insert into maintenance_private.transaction_ownership(environment,original_transaction_id,user_id,app_epoch_id) values(env,original,uid,epoch) on conflict do nothing;
 select * into owner from maintenance_private.transaction_ownership where environment=env and original_transaction_id=original for update;
 if owner.user_id is distinct from uid or owner.app_epoch_id is distinct from epoch then raise exception 'Purchase ownership mismatch'; end if;
 -- Serialize same transaction even if a conflicting original ID is supplied.
 perform pg_advisory_xact_lock(hashtext(env||':'||tx));
 select * into prior from maintenance_private.verified_transactions where environment=env and transaction_id=tx for update;
 if found then
  if prior.user_id is distinct from uid or prior.app_epoch_id is distinct from epoch or prior.original_transaction_id is distinct from original or prior.product_id is distinct from payload->>'productId' or prior.purchased_at is distinct from purchased then raise exception 'Immutable transaction identity mismatch'; end if;
  if signed is null or signed<prior.signed_at then return 'ignored'; end if;
  if signed=prior.signed_at and not ((revoked is not null and prior.revoked_at is null) or (upgraded and not prior.is_upgraded and prior.revoked_at is null)) then return 'ignored'; end if;
  update maintenance_private.verified_transactions set signed_at=signed,expires_at=expiry,revoked_at=revoked,is_upgraded=upgraded,proof_sha256=apply_maintenance_verified_transaction.proof_sha256 where environment=env and transaction_id=tx;
  return 'updated';
 end if;
 insert into maintenance_private.verified_transactions(environment,transaction_id,original_transaction_id,user_id,app_epoch_id,product_id,signed_at,purchased_at,expires_at,revoked_at,is_upgraded,proof_sha256)
 values(env,tx,original,uid,epoch,payload->>'productId',signed,purchased,expiry,revoked,upgraded,proof_sha256);
 return 'inserted';
end;$$;
revoke all on function public.apply_maintenance_verified_transaction(jsonb,text) from public,anon,authenticated;
grant execute on function public.apply_maintenance_verified_transaction(jsonb,text) to service_role;
commit;
