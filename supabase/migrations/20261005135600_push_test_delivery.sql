-- Only the authenticated server endpoint can claim a user's own test notification.
create table public.maintenance_push_test_limits (
 user_id uuid primary key references auth.users(id) on delete cascade,
 requested_at timestamptz not null default now()
);
alter table public.maintenance_push_test_limits enable row level security;
revoke all on public.maintenance_push_test_limits from public,anon,authenticated;
grant all on public.maintenance_push_test_limits to service_role;
create function public.claim_maintenance_push_test(target_user uuid, target_endpoint text)
returns table(endpoint text,p256dh text,auth text)
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(target_user::text,993));
 if not exists(select 1 from public.maintenance_push_subscriptions s where s.user_id=target_user and s.endpoint=target_endpoint) then
  raise exception using errcode='P0002',message='Subscription unavailable';
 end if;
 if exists(select 1 from public.maintenance_push_test_limits l where l.user_id=target_user and l.requested_at>now()-interval '1 minute') then
  raise exception using errcode='P0003',message='Test notification rate limit';
 end if;
 insert into public.maintenance_push_test_limits(user_id,requested_at) values(target_user,now())
 on conflict(user_id) do update set requested_at=excluded.requested_at;
 return query select s.endpoint,s.p256dh,s.auth from public.maintenance_push_subscriptions s where s.user_id=target_user and s.endpoint=target_endpoint;
end; $$;
revoke all on function public.claim_maintenance_push_test(uuid,text) from public,anon,authenticated;
grant execute on function public.claim_maintenance_push_test(uuid,text) to service_role;

-- Removing a subscription removes obsolete account-wide test throttles once the last device is gone.
create function maintenance_private.clear_push_test_limit() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is not null and auth.uid()<>old.user_id then raise exception 'Subscription unavailable'; end if;
 if not exists(select 1 from public.maintenance_push_subscriptions where user_id=old.user_id) then
  delete from public.maintenance_push_test_limits where user_id=old.user_id;
 end if;
 return old;
end; $$;
revoke all on function maintenance_private.clear_push_test_limit() from public,anon,authenticated;
create trigger clear_push_test_limit after delete on public.maintenance_push_subscriptions
 for each row execute function maintenance_private.clear_push_test_limit();
