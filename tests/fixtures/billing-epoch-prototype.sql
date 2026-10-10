-- TEST ONLY: run after billing-schema.sql and account-epochs-prototype.sql.
-- Signed Apple verification is outside this ledger; only service_role can invoke.
alter table public.ouchi_sandbox_transactions add column app_epoch_id uuid;
alter table public.ouchi_sandbox_ownership add column app_epoch_id uuid;
create or replace function public.apply_ouchi_sandbox_transaction(payload jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare existing_user uuid; existing_epoch uuid; uid uuid; epoch uuid=(payload->>'accountToken')::uuid;
begin
 if payload->>'environment' is distinct from 'Sandbox' then raise exception 'Sandbox only'; end if;
 select distinct s.user_id into uid from maintenance_private.app_session_epochs s where s.epoch_id=epoch;
 if uid is null then raise exception 'Unknown purchase enrollment'; end if;
 -- Closed epochs remain mapped only for late signed renewals/refunds; readers
 -- must select the verified current epoch. Never transfer original ownership.
 insert into public.ouchi_sandbox_ownership(original_transaction_id,user_id,app_epoch_id) values(payload->>'originalTransactionId',uid,epoch) on conflict do nothing;
 select user_id,app_epoch_id into existing_user,existing_epoch from public.ouchi_sandbox_ownership where original_transaction_id=payload->>'originalTransactionId' for update;
 if existing_user is distinct from uid or existing_epoch is distinct from epoch then raise exception 'Purchase belongs to another enrollment'; end if;
 insert into public.ouchi_sandbox_transactions(transaction_id,original_transaction_id,user_id,signed_at,payload,app_epoch_id) values(payload->>'transactionId',payload->>'originalTransactionId',uid,(payload->>'signedAt')::bigint,payload,epoch)
 on conflict(transaction_id) do update set signed_at=excluded.signed_at,payload=excluded.payload
 where ouchi_sandbox_transactions.user_id=excluded.user_id and ouchi_sandbox_transactions.app_epoch_id=excluded.app_epoch_id and ouchi_sandbox_transactions.original_transaction_id=excluded.original_transaction_id
 and (excluded.signed_at>ouchi_sandbox_transactions.signed_at or (excluded.signed_at=ouchi_sandbox_transactions.signed_at and excluded.payload ? 'revokedAt'));
end;$$;
revoke all on function public.apply_ouchi_sandbox_transaction(jsonb) from public,anon,authenticated;
grant execute on function public.apply_ouchi_sandbox_transaction(jsonb) to service_role;
