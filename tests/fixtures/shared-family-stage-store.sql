-- Review only, installed alongside the existing coordinator journal fixture.
create table maintenance_private.shared_family_stage_contexts(
 token uuid primary key,request_id uuid not null unique references private.kb_shared_deletion_journal(request_id),
 scope jsonb not null,coverage_digest text not null check(coverage_digest ~ '^[0-9a-f]{64}$'),
 targets jsonb not null,receipt jsonb not null,backend_pid int not null,transaction_id bigint not null,expires_at timestamptz not null);
alter table maintenance_private.shared_family_stage_contexts enable row level security;
revoke all on maintenance_private.shared_family_stage_contexts from public,anon,authenticated,service_role;
create trigger immutable_shared_family_stage_context before update or delete
on maintenance_private.shared_family_stage_contexts for each row execute function maintenance_private.refuse_family_attachment_journal_change();
create function maintenance_private.guard_shared_family_stage_receipt()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.receipts ? 'handoff-family' and (new.receipts->'handoff-family') is distinct from (old.receipts->'handoff-family')
 then raise exception 'Immutable controller family receipt';end if;
 return new;
end $$;
revoke all on function maintenance_private.guard_shared_family_stage_receipt() from public,anon,authenticated,service_role;
create trigger immutable_shared_family_stage_receipt before update
on private.kb_shared_deletion_journal for each row execute function maintenance_private.guard_shared_family_stage_receipt();
create function maintenance_private.check_shared_family_stage_commit()
returns trigger language plpgsql security invoker set search_path='' as $$
declare c maintenance_private.shared_family_stage_contexts;root private.kb_shared_deletion_journal;
 t jsonb;j maintenance_private.family_attachment_journals;r maintenance_private.family_attachment_completion_receipts;
 homes jsonb;known jsonb;
begin
 if tg_table_name='shared_family_stage_contexts' then
 select * into c from maintenance_private.shared_family_stage_contexts where token=new.token;
 else
 if (new.receipts->'handoff-family') is not distinct from (old.receipts->'handoff-family') then return null;end if;
 select * into c from maintenance_private.shared_family_stage_contexts where request_id=new.request_id;
 end if;
 select * into root from private.kb_shared_deletion_journal where request_id=c.request_id;
 if c.token is null or root.request_id is null or c.token::text is distinct from current_setting('maintenance.shared_family_stage_context',true)
 or c.backend_pid<>pg_backend_pid() or c.transaction_id<>txid_current() or c.expires_at<=clock_timestamp()
 or root.status<>'processing' or root.lease_token::text is distinct from c.scope->>'leaseToken' or root.lease_until<=clock_timestamp()
 or root.scope is distinct from c.scope-'leaseToken' or root.user_id::text is distinct from c.scope->>'userID'
 or root.receipts->'handoff-family' is distinct from c.receipt
 or c.receipt is distinct from (c.scope-'leaseToken')||jsonb_build_object('durable',true,'stage','handoff-family','familyCoverageDigest',c.coverage_digest)
 or root.receipts->'prepare' is null or (root.receipts->'prepare'->>'durable') is distinct from 'true'
 or ((root.receipts->'prepare')-'durable'-'stage') is distinct from root.scope
 or root.receipts->'prepare'->>'stage' is distinct from 'prepare'
 or jsonb_typeof(c.targets)<>'array' or jsonb_array_length(c.targets)>100
 then raise exception 'Current exact controller family checkpoint required at COMMIT';end if;
 select coalesce(jsonb_agg(v.value->'plan'->>'homeID' order by v.value->'plan'->>'homeID'),'[]') into homes from jsonb_array_elements(c.targets) v;
 select coalesce(jsonb_agg(p.home_id::text order by p.home_id::text),'[]') into known
 from maintenance_private.household_handoff_plans p where p.owner_id=root.user_id and (p.scope-'leaseToken')=root.scope;
 if homes is distinct from known or jsonb_array_length(homes)<>(select count(distinct v.value->'plan'->>'homeID') from jsonb_array_elements(c.targets) v)
 or exists(select 1 from public.homes h where h.owner_id=root.user_id
  and (select count(*) from public.home_members where "homeId"=h.id)>1
  and not exists(select 1 from maintenance_private.household_handoff_plans p where p.home_id=h.id and p.owner_id=root.user_id and (p.scope-'leaseToken')=root.scope))
 then raise exception 'Complete original family coverage required';end if;
 for t in select value from jsonb_array_elements(c.targets) loop
  select * into j from maintenance_private.family_attachment_journals where request_id=c.request_id and home_id=(t->'plan'->>'homeID')::uuid;
  select * into r from maintenance_private.family_attachment_completion_receipts where request_id=c.request_id and home_id=(t->'plan'->>'homeID')::uuid;
  if j.request_id is null or r.request_id is null or j.plan is distinct from t->'plan'
  or r.plan_digest<>j.plan_digest or r.inventory_digest<>j.inventory_digest
  or (j.scope-'nativeLease'-'controllerScope') is distinct from ((t->'scope')-'nativeLease'-'controllerScope')
  or ((j.scope->'controllerScope')-'leaseToken') is distinct from root.scope
  or ((t->'scope'->'controllerScope')-'leaseToken') is distinct from root.scope
  or not exists(select 1 from maintenance_private.family_attachment_completion_contexts x
   where x.token=r.completion_token and x.activation_token=r.activation_token and x.plan_digest=r.plan_digest
   and x.inventory_digest=r.inventory_digest and x.scope=r.scope and x.proof=r.proof)
  or not exists(select 1 from maintenance_private.account_deletion_requests n where n.id=(t->'scope'->>'nativeRequestID')::uuid
   and n.user_id=root.user_id and n.app_epoch_id=(t->'scope'->>'ownerEpoch')::uuid
   and n.state='running' and n.lease_token=(t->'scope'->>'nativeLease')::uuid and n.lease_until>clock_timestamp())
  then raise exception 'Every exact current family completion required';end if;
 end loop;
 return null;
end $$;
revoke all on function maintenance_private.check_shared_family_stage_commit() from public,anon,authenticated,service_role;
create constraint trigger shared_family_stage_context_commit after insert
on maintenance_private.shared_family_stage_contexts deferrable initially deferred
for each row execute function maintenance_private.check_shared_family_stage_commit();
create constraint trigger shared_family_stage_receipt_commit after update
on private.kb_shared_deletion_journal deferrable initially deferred
for each row execute function maintenance_private.check_shared_family_stage_commit();
