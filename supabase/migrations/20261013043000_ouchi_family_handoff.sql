begin;
-- Undeployed, disabled preparation. No real household is transferred here.
create table maintenance_private.home_handoff_policy (
 id smallint primary key check(id=1), enabled boolean not null default false
);
insert into maintenance_private.home_handoff_policy(id,enabled) values(1,false);
create table maintenance_private.home_handoffs (
 id uuid primary key,
 home_id uuid not null references public.homes(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 owner_epoch uuid not null,
 recipient_id uuid not null references auth.users(id) on delete cascade,
 recipient_epoch uuid not null,
 state text not null default 'pending' check(state in ('pending','cancelled','completed')),
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default clock_timestamp()+interval '1 day',
 decided_at timestamptz,
 check(owner_id<>recipient_id),
 check(expires_at>created_at),
 check((state='pending')=(decided_at is null))
);
create index home_handoffs_owner on maintenance_private.home_handoffs(owner_id);
create index home_handoffs_recipient on maintenance_private.home_handoffs(recipient_id);
create index home_handoffs_home on maintenance_private.home_handoffs(home_id);
alter table maintenance_private.home_handoff_policy enable row level security;
alter table maintenance_private.home_handoffs enable row level security;
revoke all on maintenance_private.home_handoff_policy,maintenance_private.home_handoffs from public,anon,authenticated;
grant select on maintenance_private.home_handoff_policy to service_role;
-- Row-lock privilege only; enabled cannot be changed by this role.
grant update(id) on maintenance_private.home_handoff_policy to service_role;
grant select,insert on maintenance_private.home_handoffs to service_role;
grant update(state,decided_at) on maintenance_private.home_handoffs to service_role;
grant select,update(owner_id) on public.homes to service_role;
grant select,delete on public.home_members to service_role;
grant update(nickname) on public.home_members to service_role;

-- Caller must freshly verify the exact bearer before passing these identity fields.
-- Request ID provides idempotency only; it never proves ownership or consent.
create function public.request_maintenance_home_handoff(
 target_request uuid,target_home uuid,target_user uuid,verified_session uuid,
 expected_epoch uuid,target_recipient uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare recipient_epoch uuid; prior maintenance_private.home_handoffs;
begin
 if target_request is null or target_home is null or target_user is null or verified_session is null
 or expected_epoch is null or target_recipient is null or target_user=target_recipient
 or '00000000-0000-0000-0000-000000000000'::uuid=any(array[target_request,target_home,target_user,verified_session,expected_epoch,target_recipient]) then raise exception 'Invalid handoff'; end if;
 perform pg_advisory_xact_lock(hashtext(least(target_user::text,target_recipient::text)));
 perform pg_advisory_xact_lock(hashtext(greatest(target_user::text,target_recipient::text)));
 perform 1 from maintenance_private.home_handoff_policy where id=1 and enabled for share;
 if not found or public.read_maintenance_explicit_enrollment(target_user,verified_session) is distinct from expected_epoch then raise exception 'Live explicit enrollment required'; end if;
 select epoch_id into recipient_epoch from maintenance_private.app_epochs e
 where e.user_id=target_recipient and e.enabled
 and exists(select 1 from maintenance_private.account_access a where a.user_id=e.user_id and a.enabled);
 if recipient_epoch is null then raise exception 'Recipient unavailable'; end if;
 perform 1 from public.homes where id=target_home and owner_id=target_user for update;
 if not found then raise exception 'Home unavailable'; end if;
 perform 1 from public.home_members where "homeId"=target_home and user_id=target_recipient for update;
 if not found then raise exception 'Existing member required'; end if;
 if exists(select 1 from maintenance_private.account_deletion_requests where user_id in (target_user,target_recipient) and state in ('pending','running')) then raise exception 'Account closure pending'; end if;
 select * into prior from maintenance_private.home_handoffs where id=target_request for update;
 if found then
  if prior.home_id<>target_home or prior.owner_id<>target_user or prior.owner_epoch<>expected_epoch
  or prior.recipient_id<>target_recipient or prior.recipient_epoch<>recipient_epoch then raise exception 'Handoff scope conflict'; end if;
 else
  if (select count(*) from maintenance_private.home_handoffs where owner_id=target_user and state='pending' and expires_at>clock_timestamp())>=10 then raise exception 'Too many pending handoffs'; end if;
  insert into maintenance_private.home_handoffs(id,home_id,owner_id,owner_epoch,recipient_id,recipient_epoch)
  values(target_request,target_home,target_user,expected_epoch,target_recipient,recipient_epoch) returning * into prior;
 end if;
 return jsonb_build_object('requestID',prior.id,'homeID',prior.home_id,'state',prior.state,'expiresAt',prior.expires_at);
end;$$;

-- Recipient's explicit acceptance commits the ownership change with its receipt.
-- Owner or recipient may cancel a pending request; no timeout transfers a home.
create function public.decide_maintenance_home_handoff(
 target_request uuid,target_user uuid,verified_session uuid,expected_epoch uuid,accept boolean)
 returns jsonb language plpgsql security invoker set search_path='' as $$
declare item maintenance_private.home_handoffs;
begin
 if target_request is null or target_user is null or verified_session is null or expected_epoch is null or accept is null then raise exception 'Invalid decision'; end if;
 select * into item from maintenance_private.home_handoffs where id=target_request and target_user in (owner_id,recipient_id);
 if not found then raise exception 'Handoff unavailable'; end if;
 perform pg_advisory_xact_lock(hashtext(least(item.owner_id::text,item.recipient_id::text)));
 perform pg_advisory_xact_lock(hashtext(greatest(item.owner_id::text,item.recipient_id::text)));
 perform 1 from maintenance_private.home_handoff_policy where id=1 and enabled for share;
 if not found or public.read_maintenance_explicit_enrollment(target_user,verified_session) is distinct from expected_epoch then raise exception 'Live explicit enrollment required'; end if;
 select * into item from maintenance_private.home_handoffs where id=target_request for update;
 if (target_user=item.owner_id and expected_epoch<>item.owner_epoch) or (target_user=item.recipient_id and expected_epoch<>item.recipient_epoch) then raise exception 'Enrollment changed'; end if;
 if accept and target_user<>item.recipient_id then raise exception 'Recipient acceptance required'; end if;
 if item.state<>'pending' then
  if (accept and item.state<>'completed') or (not accept and item.state<>'cancelled') then raise exception 'Decision conflict'; end if;
 else
  if accept then
   if item.expires_at<=clock_timestamp() then raise exception 'Handoff expired'; end if;
   if not exists(select 1 from maintenance_private.app_epochs e join maintenance_private.account_access a on a.user_id=e.user_id and a.enabled where e.user_id=item.owner_id and e.epoch_id=item.owner_epoch and e.enabled) then raise exception 'Owner enrollment changed'; end if;
   if exists(select 1 from maintenance_private.account_deletion_requests where user_id in (item.owner_id,item.recipient_id) and state in ('pending','running')) then raise exception 'Account closure pending'; end if;
   perform 1 from public.homes where id=item.home_id and owner_id=item.owner_id for update;
   if not found then raise exception 'Ownership changed'; end if;
   perform 1 from public.home_members where "homeId"=item.home_id and user_id=item.recipient_id for update;
   if not found then raise exception 'Membership changed'; end if;
   -- Remote files require an independently verified ownership/quota transfer.
   -- Never relabel their paths or delete them to make a home handoff succeed.
   if exists(select 1 from maintenance_private.product_attachments f join public.products p on p.id=f.product_id where p."homeId"=item.home_id and f.state<>'removed') then raise exception 'Attachment handoff required'; end if;
   update public.homes set owner_id=item.recipient_id where id=item.home_id and owner_id=item.owner_id;
   if not found then raise exception 'Ownership changed'; end if;
   delete from public.home_members where "homeId"=item.home_id and user_id=item.recipient_id;
  end if;
  update maintenance_private.home_handoffs set state=case when accept then 'completed' else 'cancelled' end,decided_at=clock_timestamp() where id=target_request returning * into item;
 end if;
 if accept and not exists(select 1 from public.homes where id=item.home_id and owner_id=item.recipient_id) then raise exception 'Ownership readback failed'; end if;
 return jsonb_build_object('requestID',item.id,'homeID',item.home_id,'state',item.state,'expiresAt',item.expires_at);
end;$$;
revoke all on function public.request_maintenance_home_handoff(uuid,uuid,uuid,uuid,uuid,uuid),public.decide_maintenance_home_handoff(uuid,uuid,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.request_maintenance_home_handoff(uuid,uuid,uuid,uuid,uuid,uuid),public.decide_maintenance_home_handoff(uuid,uuid,uuid,uuid,boolean) to service_role;
commit;
