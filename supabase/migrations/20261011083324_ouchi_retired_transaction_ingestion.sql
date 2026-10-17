begin;
-- Prepared additive change only. No production application or identity erasure.
-- Known retired enrollments may update an existing immutable transaction (refund/
-- revocation ordering), but cannot add a new owner or transaction period.
create or replace function public.apply_maintenance_verified_transaction(payload jsonb,proof_sha256 text) returns text
language plpgsql security invoker set search_path='' as $$
declare uid uuid; identities bigint; epoch uuid; env text; tx text; original text;
 owner maintenance_private.transaction_ownership; prior maintenance_private.verified_transactions;
 signed bigint; purchased bigint; expiry bigint; revoked bigint; upgraded boolean; retired boolean;
begin
 if jsonb_typeof(payload) is distinct from 'object' or proof_sha256 is null or proof_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'Invalid verified transaction'; end if;
 env:=payload->>'environment';tx:=payload->>'transactionId';original:=payload->>'originalTransactionId';epoch:=(payload->>'accountToken')::uuid;
 if env is null or env not in ('Sandbox','Production') or tx is null or length(tx) not between 1 and 128 or original is null or length(original) not between 1 and 128 or epoch is null then raise exception 'Invalid transaction identity'; end if;
 signed:=(payload->>'signedAt')::bigint;purchased:=(payload->>'purchasedAt')::bigint;expiry:=(payload->>'expiresAt')::bigint;revoked:=(payload->>'revokedAt')::bigint;upgraded:=coalesce((payload->>'isUpgraded')::boolean,false);
 select count(distinct user_id),max(user_id::text)::uuid into identities,uid from maintenance_private.app_session_epochs where epoch_id=epoch;
 if identities<>1 then raise exception 'Unknown purchase enrollment'; end if;
 -- Share the enrollment/deletion user lock before touching ownership rows.
 -- A delayed event never creates a new owner/period after closure or retirement.
 perform pg_advisory_xact_lock(hashtext(uid::text));
 retired:=not exists(select 1 from maintenance_private.app_epochs e
  join maintenance_private.account_access a on a.user_id=e.user_id
  where e.user_id=uid and e.epoch_id=epoch and e.enabled and a.enabled);
 if signed is null or signed not between 1 and 9007199254740991 or purchased is null or purchased not between 1 and 9007199254740991
 or (expiry is not null and expiry not between 1 and 9007199254740991) or (revoked is not null and revoked not between 1 and 9007199254740991)
 or payload->>'productId' is null or payload->>'productId' not in ('ouchi.premium.monthly','ouchi.premium.annual','ouchi.tip.small','ouchi.tip.medium','ouchi.tip.large')
 or (payload->>'productId' in ('ouchi.premium.monthly','ouchi.premium.annual') and (expiry is null or expiry<=purchased)) then raise exception 'Invalid verified transaction fields'; end if;
 -- Existing ownership remains immutable until approved final erasure. This is
 -- not an authorization to retain purchase identifiers permanently.
 if not retired then
  insert into maintenance_private.transaction_ownership(environment,original_transaction_id,user_id,app_epoch_id) values(env,original,uid,epoch) on conflict do nothing;
 end if;
 select * into owner from maintenance_private.transaction_ownership where environment=env and original_transaction_id=original for update;
 if not found then return 'retired'; end if;
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
 if retired then return 'retired'; end if;
 insert into maintenance_private.verified_transactions(environment,transaction_id,original_transaction_id,user_id,app_epoch_id,product_id,signed_at,purchased_at,expires_at,revoked_at,is_upgraded,proof_sha256)
 values(env,tx,original,uid,epoch,payload->>'productId',signed,purchased,expiry,revoked,upgraded,proof_sha256);
 return 'inserted';
end;$$;
revoke all on function public.apply_maintenance_verified_transaction(jsonb,text) from public,anon,authenticated;
grant execute on function public.apply_maintenance_verified_transaction(jsonb,text) to service_role;
commit;
