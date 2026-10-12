-- Disposable candidate only; requires immutable family_attachment_journals.
-- Reservations do not expire on timeout. Release/consumption needs the future
-- exact activation/cancellation context; no such route or mutation grant exists.
create table maintenance_private.family_attachment_quota (
 request_id uuid not null,
 home_id uuid not null,
 attachment_id uuid not null unique,
 recipient_id uuid not null,
 recipient_epoch uuid not null,
 size_bytes bigint not null check(size_bytes between 1 and 5242880),
 state text not null default 'reserved' check(state='reserved'),
 primary key(request_id,home_id,attachment_id),
 foreign key(request_id,home_id) references maintenance_private.family_attachment_journals(request_id,home_id)
);
create index family_attachment_quota_recipient on maintenance_private.family_attachment_quota(recipient_id);
alter table maintenance_private.family_attachment_quota enable row level security;
revoke all on maintenance_private.family_attachment_quota from public,anon,authenticated,service_role;
-- Existing server-only reserve RPCs need read-only quota totals in their invoker
-- trigger. This creates no mutation grant or client RLS policy.
grant select on maintenance_private.family_attachment_quota to service_role;
create trigger immutable_family_attachment_quota before update or delete
on maintenance_private.family_attachment_quota for each row
execute function maintenance_private.refuse_family_attachment_journal_change();

create function maintenance_private.guard_family_attachment_reservation()
returns trigger language plpgsql security invoker set search_path='' as $$
declare journal maintenance_private.family_attachment_journals;
 source maintenance_private.product_attachments; recipient maintenance_private.app_epochs;
 proposed jsonb; original jsonb; used_bytes bigint; used_files bigint; principal uuid;
begin
 select * into journal from maintenance_private.family_attachment_journals
 where request_id=new.request_id and home_id=new.home_id;
 if not found then raise exception 'Immutable inventory required'; end if;
 for principal in select distinct id from unnest(array[(journal.plan->>'ownerID')::uuid,new.recipient_id]) id order by id loop
  perform pg_advisory_xact_lock(hashtext(principal::text));
 end loop;
 if new.recipient_id is distinct from (journal.plan->>'recipientID')::uuid
 or new.recipient_epoch is distinct from (journal.plan->>'recipientEpoch')::uuid then raise exception 'Foreign quota recipient';end if;
 select * into recipient from maintenance_private.app_epochs where user_id=new.recipient_id for update;
 if not found or not recipient.enabled or recipient.epoch_id<>new.recipient_epoch
 or not exists(select 1 from maintenance_private.account_access where user_id=new.recipient_id and enabled)
 or exists(select 1 from maintenance_private.account_deletion_requests where user_id=new.recipient_id and state<>'complete') then raise exception 'Quota recipient unavailable';end if;
 select value into proposed from jsonb_array_elements(journal.plan->'files') where value->>'id'=new.attachment_id::text;
 select value into original from jsonb_array_elements(journal.inventory->'files') where value->>'id'=new.attachment_id::text;
 select * into source from maintenance_private.product_attachments where id=new.attachment_id for update;
 if not found or proposed is null or original is null or source.state<>'stored' or source.removal_pending
 or source.user_id is distinct from (journal.plan->>'ownerID')::uuid
 or source.user_id::text is distinct from proposed->'source'->>'userID'
 or source.app_epoch_id::text is distinct from proposed->'source'->>'epoch'
 or source.object_path is distinct from proposed->'source'->>'path'
 or source.size_bytes<>new.size_bytes or source.size_bytes::text is distinct from proposed->>'size'
 or source.mime is distinct from proposed->>'mime' or source.sha256 is distinct from proposed->>'sha256'
 or source.captured_owner_id::text is distinct from journal.plan->>'ownerID'
 or source.product_id::text is distinct from original->>'product_id'
 or not maintenance_private.attachment_write_is_quiet(source.id)
 or not exists(select 1 from public.products p join public.homes h on h.id=p."homeId" where p.id=source.product_id and h.id=new.home_id and h.owner_id=source.user_id)
 then raise exception 'Quota source inventory changed';end if;
 select coalesce(sum(bytes),0),coalesce(sum(files),0) into used_bytes,used_files from (
  select coalesce(sum(size_bytes),0) bytes,count(*) files from maintenance_private.product_attachments where user_id=new.recipient_id and state<>'removed'
  union all select coalesce(sum(size_bytes),0),count(*) from maintenance_private.family_attachment_quota where recipient_id=new.recipient_id
 ) totals;
 if used_bytes+new.size_bytes>104857600 or used_files+1>100 then raise exception 'Attachment quota exceeded';end if;
 return new;
end $$;
revoke all on function maintenance_private.guard_family_attachment_reservation() from public,anon,authenticated,service_role;
create trigger family_attachment_reservation_check before insert
on maintenance_private.family_attachment_quota for each row
execute function maintenance_private.guard_family_attachment_reservation();

create function maintenance_private.guard_attachment_total_quota()
returns trigger language plpgsql security invoker set search_path='' as $$
declare used_bytes bigint;used_files bigint;principal uuid;
begin
 if tg_op='UPDATE' then
  for principal in select distinct id from unnest(array[old.user_id,new.user_id]) id order by id loop
   perform pg_advisory_xact_lock(hashtext(principal::text));
  end loop;
 else perform pg_advisory_xact_lock(hashtext(new.user_id::text));end if;
 if new.state='removed' then return new;end if;
 select coalesce(sum(bytes),0),coalesce(sum(files),0) into used_bytes,used_files from (
  select coalesce(sum(size_bytes),0) bytes,count(*) files from maintenance_private.product_attachments where user_id=new.user_id and state<>'removed' and id<>new.id
  union all select coalesce(sum(size_bytes),0),count(*) from maintenance_private.family_attachment_quota where recipient_id=new.user_id
 ) totals;
 if used_bytes+new.size_bytes>104857600 or used_files+1>100 then raise exception 'Attachment quota exceeded';end if;
 return new;
end $$;
revoke all on function maintenance_private.guard_attachment_total_quota() from public,anon,authenticated;
grant execute on function maintenance_private.guard_attachment_total_quota() to service_role;
create trigger attachment_total_quota_check before insert or update of user_id,size_bytes,state
on maintenance_private.product_attachments for each row
execute function maintenance_private.guard_attachment_total_quota();
