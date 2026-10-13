-- Isolated test primitive only. No production migration, grants or worker bypass.
create table private.kb_shared_write_fences (
 target_kind text not null check(target_kind in ('user','household')),
 target_id uuid not null,request_id uuid not null,scope jsonb not null,household_ids uuid[] not null,
 primary key(target_kind,target_id)
);
alter table private.kb_shared_write_fences enable row level security;
revoke all on private.kb_shared_write_fences from public;
create function private.kb_lock_write_targets(users uuid[],houses uuid[],exclusive boolean default false) returns void
language plpgsql volatile security definer set search_path='' as $$
declare id uuid;
begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'reviewed isolation required';end if;
 -- Shared writer locks remain held until transaction end, even with no fence row.
 for id in select distinct u from unnest(users) u where u is not null order by u loop
  if exclusive then perform pg_advisory_xact_lock(19462001,hashtext(id::text));
  else perform pg_advisory_xact_lock_shared(19462001,hashtext(id::text));end if;
 end loop;
 for id in select distinct h from unnest(houses) h where h is not null order by h loop
  if exclusive then perform pg_advisory_xact_lock(19462002,hashtext(id::text));
  else perform pg_advisory_xact_lock_shared(19462002,hashtext(id::text));end if;
 end loop;
end $$;
create function private.kb_assert_write_targets(users uuid[],houses uuid[]) returns void
language plpgsql volatile security definer set search_path='' as $$
begin
 perform private.kb_lock_write_targets(users,houses,false);
 -- VOLATILE SPI reads a fresh READ COMMITTED snapshot AFTER lock acquisition.
 if exists(select 1 from private.kb_shared_write_fences where
 (target_kind='user' and target_id=any(users)) or (target_kind='household' and target_id=any(houses)))
 then raise exception 'Kakei write target closed' using errcode='55000';end if;
end $$;
revoke all on function private.kb_lock_write_targets(uuid[],uuid[],boolean),private.kb_assert_write_targets(uuid[],uuid[]) from public;
