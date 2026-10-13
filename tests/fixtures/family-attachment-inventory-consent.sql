-- Disposable private review store ONLY: no migration, route or role grant.
-- Separate from family-snapshot v1 consent, bound by server signatures to the
-- complete immutable original file/write inventory and receiver epoch.
create table maintenance_private.family_attachment_inventory_consents(
 request_id uuid not null,home_id uuid not null,actor_id uuid not null,
 token text not null check(length(token)<=8192),revoked_at timestamptz,
 primary key(request_id,home_id,actor_id));
alter table maintenance_private.family_attachment_inventory_consents enable row level security;
revoke all on maintenance_private.family_attachment_inventory_consents from public,anon,authenticated,service_role;
create function maintenance_private.guard_inventory_consent_change()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' and (to_jsonb(old)-'revoked_at')=(to_jsonb(new)-'revoked_at')
 and old.revoked_at is null and new.revoked_at is not null then return new;end if;
 raise exception 'Immutable signed inventory consent';
end $$;
revoke all on function maintenance_private.guard_inventory_consent_change() from public,anon,authenticated,service_role;
create trigger immutable_inventory_consent before update or delete on maintenance_private.family_attachment_inventory_consents
for each row execute function maintenance_private.guard_inventory_consent_change();
