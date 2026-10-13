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

-- Private approval may only be staged by the server signature-checking provider.
-- No normal client/service role can insert a JSON flag here. This disposable
-- extension requires the atomic activation fixture to be installed first.
create table maintenance_private.family_attachment_inventory_approvals(
 request_id uuid not null,home_id uuid not null,scope jsonb not null,
 binding_digest text not null check(binding_digest ~ '^[0-9a-f]{64}$'),
 plan_digest text not null,inventory_digest text not null,consents jsonb not null,
 backend_pid int not null,transaction_id bigint not null,expires_at timestamptz not null,
 primary key(request_id,home_id,backend_pid,transaction_id));
alter table maintenance_private.family_attachment_inventory_approvals enable row level security;
revoke all on maintenance_private.family_attachment_inventory_approvals from public,anon,authenticated,service_role;
create trigger immutable_inventory_approval before update or delete
on maintenance_private.family_attachment_inventory_approvals for each row
execute function maintenance_private.refuse_family_attachment_journal_change();
alter table maintenance_private.family_attachment_activation_contexts add column inventory_approval jsonb;

create function maintenance_private.capture_inventory_activation_approval()
returns trigger language plpgsql security invoker set search_path='' as $$
declare a maintenance_private.family_attachment_inventory_approvals;actual jsonb;
begin
 select * into a from maintenance_private.family_attachment_inventory_approvals
 where request_id=new.request_id and home_id=new.home_id
 and backend_pid=pg_backend_pid() and transaction_id=txid_current() for update;
 select jsonb_agg(jsonb_build_object('actorID',actor_id,'token',token,'revokedAt',revoked_at) order by actor_id)
 into actual from maintenance_private.family_attachment_inventory_consents
 where request_id=new.request_id and home_id=new.home_id;
 if a.request_id is null or a.scope is distinct from new.scope
 or a.plan_digest is distinct from new.plan_digest or a.inventory_digest is distinct from new.inventory_digest
 or a.expires_at<=clock_timestamp() or jsonb_array_length(a.consents)<>2
 or a.consents is distinct from actual
 or exists(select 1 from maintenance_private.family_attachment_inventory_consents
 where request_id=new.request_id and home_id=new.home_id and revoked_at is not null)
 then raise exception 'Verified transaction-bound inventory approval required';end if;
 new.inventory_approval:=to_jsonb(a);
 new.expires_at:=least(new.expires_at,a.expires_at);
 return new;
end $$;
revoke all on function maintenance_private.capture_inventory_activation_approval() from public,anon,authenticated,service_role;
create trigger capture_inventory_activation_approval before insert
on maintenance_private.family_attachment_activation_contexts for each row
execute function maintenance_private.capture_inventory_activation_approval();

create function maintenance_private.check_inventory_activation_commit()
returns trigger language plpgsql security invoker set search_path='' as $$
declare c maintenance_private.family_attachment_activation_contexts;
 a maintenance_private.family_attachment_inventory_approvals;actual jsonb;
begin
 select * into c from maintenance_private.family_attachment_activation_contexts where token=new.token;
 select * into a from maintenance_private.family_attachment_inventory_approvals
 where request_id=c.request_id and home_id=c.home_id
 and backend_pid=pg_backend_pid() and transaction_id=txid_current();
 select jsonb_agg(jsonb_build_object('actorID',actor_id,'token',token,'revokedAt',revoked_at) order by actor_id)
 into actual from maintenance_private.family_attachment_inventory_consents
 where request_id=c.request_id and home_id=c.home_id;
 if c.token is null or a.request_id is null or c.inventory_approval is distinct from to_jsonb(a)
 or a.scope is distinct from c.scope or a.plan_digest is distinct from c.plan_digest
 or a.inventory_digest is distinct from c.inventory_digest
 or a.backend_pid<>c.backend_pid or a.transaction_id<>c.transaction_id
 or a.expires_at<=clock_timestamp() or c.expires_at<=clock_timestamp()
 or jsonb_array_length(a.consents)<>2 or a.consents is distinct from actual
 or exists(select 1 from maintenance_private.family_attachment_inventory_consents
 where request_id=c.request_id and home_id=c.home_id and revoked_at is not null)
 then raise exception 'Current signed inventory approval required at COMMIT';end if;
 return null;
end $$;
revoke all on function maintenance_private.check_inventory_activation_commit() from public,anon,authenticated,service_role;
create constraint trigger signed_inventory_activation_commit after insert
on maintenance_private.family_attachment_activation_contexts deferrable initially deferred
for each row execute function maintenance_private.check_inventory_activation_commit();
