-- Subscription encryption material is visible only to its owner and the server sender.
create table public.maintenance_push_subscriptions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 endpoint text not null unique check(length(endpoint) between 1 and 2048 and endpoint ~ '^https://(fcm\.googleapis\.com/(fcm/send|wp)/|updates\.push\.services\.mozilla\.com/wpush/|web\.push\.apple\.com/|[a-z0-9-]+\.notify\.windows\.com/w/)' and endpoint !~ '#'),
 p256dh text not null check(length(p256dh) between 87 and 88),
 auth text not null check(length(auth) between 22 and 24),
 last_sent_on date,
 claimed_until timestamptz,
 claim_token uuid
);
create index maintenance_push_user_idx on public.maintenance_push_subscriptions(user_id);
alter table public.maintenance_push_subscriptions enable row level security;
create policy own_push_subscriptions on public.maintenance_push_subscriptions for all to authenticated
 using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
revoke all on public.maintenance_push_subscriptions from anon,authenticated;
grant select,insert,delete on public.maintenance_push_subscriptions to authenticated;
grant update(endpoint,p256dh,auth) on public.maintenance_push_subscriptions to authenticated;
grant all on public.maintenance_push_subscriptions to service_role;

-- Only the cron's server credential can call the sender functions. Invoker privileges
-- keep the browser from updating delivery dates or reading another person's endpoints.
create function public.claim_maintenance_push(batch_size integer default 100)
returns table(id uuid, endpoint text, p256dh text, auth text, due_count bigint, claim_token uuid, delivery_day date)
language plpgsql security invoker set search_path='' as $$
declare s record; n bigint; d date := (now() at time zone 'Asia/Tokyo')::date; token uuid;
begin
 for s in select ps.* from public.maintenance_push_subscriptions ps
  where (ps.last_sent_on is null or ps.last_sent_on<d) and (ps.claimed_until is null or ps.claimed_until<now())
  order by ps.id limit greatest(1,least(batch_size,100)) for update skip locked
 loop
  select count(*) into n from public.maintenance_tasks t
  join public.products p on p.id=t."productId"
  join public.homes h on h.id=p."homeId"
  where t."nextDueAt"<=d and (h.owner_id=s.user_id or exists(
   select 1 from public.home_members m where m."homeId"=h.id and m.user_id=s.user_id));
  if n=0 then
   -- No due work: mark this morning checked, so paging cannot repeat these rows.
   update public.maintenance_push_subscriptions ps set last_sent_on=d where ps.id=s.id;
   return query select s.id,s.endpoint,s.p256dh,s.auth,n,null::uuid,d;
   continue;
  end if;
  token:=gen_random_uuid();
  update public.maintenance_push_subscriptions ps set claimed_until=now()+interval '5 minutes',claim_token=token where ps.id=s.id;
  return query select s.id,s.endpoint,s.p256dh,s.auth,n,token,d;
 end loop;
end; $$;
create function public.finish_maintenance_push(subscription_id uuid, delivery_token uuid, delivery_day date, delivered boolean, expired boolean default false)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if expired then
  delete from public.maintenance_push_subscriptions where id=subscription_id and claim_token=delivery_token;
 elsif delivered then
  update public.maintenance_push_subscriptions set last_sent_on=delivery_day,claimed_until=null,claim_token=null
   where id=subscription_id and claim_token=delivery_token;
 end if;
 -- On failure the lease expires. Never pretend a failed notification was delivered.
end; $$;
revoke all on function public.claim_maintenance_push(integer),public.finish_maintenance_push(uuid,uuid,date,boolean,boolean) from public,anon,authenticated;
grant execute on function public.claim_maintenance_push(integer),public.finish_maintenance_push(uuid,uuid,date,boolean,boolean) to service_role;
grant select on public.homes,public.products,public.maintenance_tasks,public.home_members to service_role;

create function maintenance_private.limit_push_devices() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is not null then
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,992));
  if not exists(select 1 from public.maintenance_push_subscriptions s where s.endpoint=new.endpoint)
   and (select count(*) from public.maintenance_push_subscriptions s where s.user_id=new.user_id)>=10 then
   raise exception 'At most ten notification devices per account';
  end if;
 end if;
 return new;
end; $$;
revoke all on function maintenance_private.limit_push_devices() from public,anon;
grant execute on function maintenance_private.limit_push_devices() to authenticated;
create trigger limit_push_devices before insert on public.maintenance_push_subscriptions
 for each row execute function maintenance_private.limit_push_devices();

create or replace function public.erase_maintenance_data() returns void
language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
 delete from public.maintenance_push_subscriptions where user_id=auth.uid();
 delete from public.home_members where user_id=auth.uid();
 delete from public.homes where owner_id=auth.uid();
end; $$;
