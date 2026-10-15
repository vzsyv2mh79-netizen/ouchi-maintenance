begin;
-- Operational observation only. No deletion, scheduler, new role/grant,
-- storage promise or backfill of an unknown historical acceptance time.
alter table maintenance_private.product_attachments
 add column removal_requested_at timestamptz;

create function maintenance_private.capture_attachment_removal_time()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='INSERT' then
  if new.removal_requested_at is not null then
   raise exception 'Attachment removal time is server-owned';
  end if;
  -- A preexisting pending flag without its original event remains unknown.
  return new;
 end if;
 if new.removal_requested_at is distinct from old.removal_requested_at then
  raise exception 'Attachment removal time is immutable';
 end if;
 if not old.removal_pending and new.removal_pending
    and old.removal_requested_at is null then
  new.removal_requested_at=clock_timestamp();
 end if;
 return new;
end;
$$;
revoke all on function maintenance_private.capture_attachment_removal_time()
 from public,anon,authenticated,service_role;
create trigger attachment_removal_time_capture
before insert or update on maintenance_private.product_attachments
for each row execute function maintenance_private.capture_attachment_removal_time();

create index attachment_pending_removal_time_idx
 on maintenance_private.product_attachments(removal_requested_at)
 where removal_pending and state<>'removed';
commit;
