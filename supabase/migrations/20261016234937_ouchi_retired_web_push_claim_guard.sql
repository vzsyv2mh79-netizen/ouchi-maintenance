-- Dormant candidate. Closed identities must not acquire/extend a Web push
-- delivery lease while their scoped erasure worker waits for quiescence.
-- Dispatch still independently checks eligibility immediately before sending.
begin;
create function maintenance_private.web_push_account_is_open(target_user uuid)
returns boolean language sql volatile security invoker set search_path='' as $$
 select target_user is not null
 and exists(select 1 from maintenance_private.enrollment_policy where id=1)
 and not exists(select 1 from maintenance_private.account_access where user_id=target_user and not enabled)
 and not exists(select 1 from maintenance_private.app_epochs where user_id=target_user and not enabled)
 and not exists(select 1 from maintenance_private.account_deletion_requests where user_id=target_user and state<>'complete')
 and (exists(select 1 from maintenance_private.enrollment_policy where id=1 and not require_explicit)
  or exists(select 1 from maintenance_private.app_epochs e join maintenance_private.account_access a on a.user_id=e.user_id and a.enabled where e.user_id=target_user and e.enabled));
$$;
revoke all on function maintenance_private.web_push_account_is_open(uuid) from public,anon,authenticated;
grant execute on function maintenance_private.web_push_account_is_open(uuid) to service_role;

create or replace function public.claim_maintenance_push(batch_size integer default 100)
returns table(id uuid,endpoint text,p256dh text,auth text,due_count bigint,claim_token uuid,delivery_day date)
language plpgsql security invoker set search_path='' as $$
declare candidate record;s public.maintenance_push_subscriptions;n bigint;d date:=(clock_timestamp() at time zone 'Asia/Tokyo')::date;token uuid;
begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'Fresh app writes require read committed';end if;
 -- Initial eligibility excludes closed rows before LIMIT, so a page of old
 -- subscriptions cannot hide eligible family members further down the queue.
 -- Do not lock a subscription before the common account lock: retirement
 -- obtains that account lock first, then locks the Ouchi tables.
 for candidate in select ps.id,ps.user_id from public.maintenance_push_subscriptions ps
  where (ps.last_sent_on is null or ps.last_sent_on<d)
   and (ps.claimed_until is null or ps.claimed_until<clock_timestamp())
   and maintenance_private.web_push_account_is_open(ps.user_id)
  order by ps.id limit greatest(1,least(batch_size,100))
 loop
  if not pg_try_advisory_xact_lock(hashtext(candidate.user_id::text)) then continue;end if;
  -- Fresh READ COMMITTED query after the account lock; a retired actor cannot
  -- be authorized by the cursor's earlier snapshot. No waiting on held rows.
  if not maintenance_private.web_push_account_is_open(candidate.user_id) then continue;end if;
  select ps.* into s from public.maintenance_push_subscriptions ps
   where ps.id=candidate.id and ps.user_id=candidate.user_id
    and (ps.last_sent_on is null or ps.last_sent_on<d)
    and (ps.claimed_until is null or ps.claimed_until<clock_timestamp())
   for update skip locked;
  if not found then continue;end if;
  select count(*) into n from public.maintenance_tasks t
   join public.products p on p.id=t."productId" join public.homes h on h.id=p."homeId"
   where t."nextDueAt"<=d and (h.owner_id=s.user_id or exists(select 1 from public.home_members m where m."homeId"=h.id and m.user_id=s.user_id));
  if n=0 then
   update public.maintenance_push_subscriptions ps set last_sent_on=d where ps.id=s.id;
   return query select s.id,s.endpoint,s.p256dh,s.auth,n,null::uuid,d;
  else
   token:=gen_random_uuid();
   update public.maintenance_push_subscriptions ps set claimed_until=clock_timestamp()+interval '5 minutes',claim_token=token where ps.id=s.id;
   return query select s.id,s.endpoint,s.p256dh,s.auth,n,token,d;
  end if;
 end loop;
end;$$;
revoke all on function public.claim_maintenance_push(integer) from public,anon,authenticated;
grant execute on function public.claim_maintenance_push(integer) to service_role;
commit;
