-- Dormant prerequisite for reviewed cleanup. UUID-only tombstones are permanent:
-- no account, home, epoch, path, photo content or time-based reuse permission.
-- This migration does NOT retire a file, remove bytes or release capacity.
begin;
create table maintenance_private.retired_attachment_ids(
 attachment_id uuid primary key check(attachment_id<>'00000000-0000-0000-0000-000000000000'::uuid),
 retired_at timestamptz not null default clock_timestamp()
);
alter table maintenance_private.retired_attachment_ids enable row level security;
revoke all on maintenance_private.retired_attachment_ids from public,anon,authenticated,service_role,ouchi_closure_operator;

create function maintenance_private.lock_attachment_identity(target_id uuid) returns void
language plpgsql volatile security invoker set search_path='' as $$
begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'Fresh attachment identity transaction required';end if;
 if target_id is null or target_id='00000000-0000-0000-0000-000000000000'::uuid then raise exception 'Exact attachment identity required';end if;
 -- Shared by original/household admission, tombstone insertion and the future
 -- finalizer. The fresh lookup must be a separate VOLATILE PL/pgSQL statement
 -- AFTER the lock so an INSERT begun before retirement cannot use a stale view.
 perform pg_advisory_xact_lock(hashtextextended('ouchi-attachment-identity:'||target_id::text,0));
end;$$;
revoke all on function maintenance_private.lock_attachment_identity(uuid) from public,anon,authenticated,service_role,ouchi_closure_operator;

create function maintenance_private.guard_retired_attachment_identity() returns trigger
language plpgsql volatile security definer set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if new.id is distinct from old.id then raise exception 'Attachment identity is immutable';end if;
  return new;
 end if;
 perform maintenance_private.lock_attachment_identity(new.id);
 if exists(select 1 from maintenance_private.retired_attachment_ids where attachment_id=new.id) then raise exception 'Retired attachment identity cannot be reused';end if;
 return new;
end;$$;
revoke all on function maintenance_private.guard_retired_attachment_identity() from public,anon,authenticated,service_role,ouchi_closure_operator;
create trigger attachment_identity_admission before insert or update of id on maintenance_private.product_attachments for each row execute function maintenance_private.guard_retired_attachment_identity();
create trigger attachment_identity_admission before insert or update of id on maintenance_private.household_attachments for each row execute function maintenance_private.guard_retired_attachment_identity();

create function maintenance_private.guard_retired_attachment_tombstone() returns trigger
language plpgsql volatile security definer set search_path='' as $$
begin
 if tg_op<>'INSERT' then raise exception 'Retired attachment identity is permanent';end if;
 perform maintenance_private.lock_attachment_identity(new.attachment_id);
 return new;
end;$$;
revoke all on function maintenance_private.guard_retired_attachment_tombstone() from public,anon,authenticated,service_role,ouchi_closure_operator;
create trigger retired_attachment_append_only before insert or update or delete on maintenance_private.retired_attachment_ids for each row execute function maintenance_private.guard_retired_attachment_tombstone();
create trigger retired_attachment_no_truncate before truncate on maintenance_private.retired_attachment_ids for each statement execute function maintenance_private.guard_retired_attachment_tombstone();
commit;
