-- Isolated sandbox only. No production migration is applied by this PR.
create table public.ouchi_sandbox_transactions (
 transaction_id text primary key, original_transaction_id text not null,
 user_id uuid not null references auth.users(id) on delete cascade,
 signed_at bigint not null, payload jsonb not null
);
alter table public.ouchi_sandbox_transactions enable row level security;
revoke all on public.ouchi_sandbox_transactions from public,anon,authenticated;
-- Server role alone writes. Authenticated clients never grant themselves benefits.
grant select,insert,update on public.ouchi_sandbox_transactions to service_role;
create table public.ouchi_sandbox_ownership(original_transaction_id text primary key,user_id uuid not null references auth.users(id) on delete cascade);
alter table public.ouchi_sandbox_ownership enable row level security;
revoke all on public.ouchi_sandbox_ownership from public,anon,authenticated;
grant select,insert,update on public.ouchi_sandbox_ownership to service_role;
create function public.apply_ouchi_sandbox_transaction(payload jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare existing_user uuid; uid uuid=(payload->>'accountToken')::uuid;
begin
 if payload->>'environment' <> 'Sandbox' then raise exception 'Sandbox only'; end if;
 insert into public.ouchi_sandbox_ownership values(payload->>'originalTransactionId',uid) on conflict do nothing;
 select user_id into existing_user from public.ouchi_sandbox_ownership where original_transaction_id=payload->>'originalTransactionId' for update;
 if existing_user<>uid then raise exception 'Purchase belongs to another account'; end if;
 insert into public.ouchi_sandbox_transactions values(payload->>'transactionId',payload->>'originalTransactionId',uid,(payload->>'signedAt')::bigint,payload)
 on conflict(transaction_id) do update set signed_at=excluded.signed_at,payload=excluded.payload
 where ouchi_sandbox_transactions.user_id=excluded.user_id and ouchi_sandbox_transactions.original_transaction_id=excluded.original_transaction_id
 and (excluded.signed_at>ouchi_sandbox_transactions.signed_at or (excluded.signed_at=ouchi_sandbox_transactions.signed_at and (excluded.payload ? 'revokedAt' or (excluded.payload->>'isUpgraded'='true' and not (ouchi_sandbox_transactions.payload ? 'revokedAt')))));
end $$;
revoke execute on function public.apply_ouchi_sandbox_transaction(jsonb) from public,anon,authenticated;
grant execute on function public.apply_ouchi_sandbox_transaction(jsonb) to service_role;
