begin;
-- Cover legacy erase_maintenance_data and direct home deletion too.
-- BEFORE DELETE holds the parent row lock; membership insertion takes a
-- conflicting parent lock, so a concurrent invite cannot evade this check.
create function maintenance_private.guard_shared_home_delete() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.home_members where "homeId"=old.id order by user_id for update;
 if exists(select 1 from public.home_members where "homeId"=old.id and user_id<>old.owner_id)
 then raise exception using errcode='P0001',message='Family handoff required'; end if;
 return old;
end;$$;
revoke all on function maintenance_private.guard_shared_home_delete() from public,anon,authenticated,service_role;
create trigger guard_shared_home_delete before delete on public.homes
 for each row execute function maintenance_private.guard_shared_home_delete();
commit;
