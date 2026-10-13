-- Local review only. Requires kakei-write-fence.sql and existing auth.uid().
-- Six financial table hooks; intake, worker capabilities and RPC front gates
-- are deliberately not implied. No grants or production migration.
create function private.kb_allowed_financial_handoff(table_name text,before_row jsonb,after_row jsonb) returns boolean
language sql volatile security definer set search_path='' as $$select false$$;
revoke all on function private.kb_allowed_financial_handoff(text,jsonb,jsonb) from public;
create function private.kb_allowed_financial_cleanup(table_name text,before_row jsonb) returns boolean
language sql volatile security definer set search_path='' as $$select false$$;
revoke all on function private.kb_allowed_financial_cleanup(text,jsonb) from public;
create function private.kb_guard_financial_write() returns trigger
language plpgsql volatile security definer set search_path='' as $$
declare before_row jsonb; after_row jsonb; row_data jsonb;
 users uuid[]:=array[auth.uid()]; houses uuid[]:=array[]::uuid[];
begin
 if tg_table_schema<>'public' or tg_table_name not in
 ('kb_households','kb_household_members','kb_transactions','kb_join_requests',
 'kb_premium_preferences','kb_store_transactions') then
  raise exception 'unreviewed financial table';
 end if;
 if tg_op<>'INSERT' then before_row:=to_jsonb(old);end if;
 if tg_op<>'DELETE' then after_row:=to_jsonb(new);end if;
 for row_data in select r from unnest(array[before_row,after_row]) r where r is not null loop
  if tg_table_name='kb_households' then
   users:=array_append(users,(row_data->>'owner_id')::uuid);
   houses:=array_append(houses,(row_data->>'id')::uuid);
  elsif tg_table_name='kb_transactions' then
   users:=array_append(users,(row_data->>'created_by')::uuid);
   houses:=array_append(houses,(row_data->>'household_id')::uuid);
  else
   users:=array_append(users,(row_data->>'user_id')::uuid);
   if tg_table_name='kb_household_members' then
    houses:=array_append(houses,(row_data->>'household_id')::uuid);
   elsif tg_table_name='kb_join_requests' then
    houses:=houses || array(select h.id from public.kb_households h
      where h.invite_token=(row_data->>'invite_token')::uuid);
   end if;
  end if;
 end loop;
 perform private.kb_lock_write_targets(users,houses,false);
 if tg_op='DELETE' and private.kb_allowed_financial_cleanup(tg_table_name,before_row) then return old;end if;
 if tg_op='UPDATE' and private.kb_allowed_financial_handoff(tg_table_name,before_row,after_row) then return new;end if;
 perform private.kb_assert_write_targets(users,houses);
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function private.kb_guard_financial_write() from public;
do $$declare name text;begin
 foreach name in array array['kb_households','kb_household_members','kb_transactions',
 'kb_join_requests','kb_premium_preferences','kb_store_transactions'] loop
  execute format('create trigger kb_shared_write_guard before insert or update or delete on public.%I for each row execute function private.kb_guard_financial_write()',name);
 end loop;
end $$;
