-- Disposable backend-only completion stage. Not an Auth deletion or migration.
create table maintenance_private.family_attachment_completion_contexts(
 token uuid primary key,request_id uuid not null,home_id uuid not null,scope jsonb not null,
 activation_token uuid not null references maintenance_private.family_attachment_activation_contexts(token),
 plan_digest text not null,inventory_digest text not null,proof jsonb not null,
 backend_pid int not null,transaction_id bigint not null,expires_at timestamptz not null,
 foreign key(request_id,home_id) references maintenance_private.family_attachment_journals(request_id,home_id));
create table maintenance_private.family_attachment_completion_receipts(
 request_id uuid not null,home_id uuid not null,scope jsonb not null,
 activation_token uuid not null references maintenance_private.family_attachment_activation_contexts(token),
 completion_token uuid not null unique references maintenance_private.family_attachment_completion_contexts(token),
 plan_digest text not null,inventory_digest text not null,proof jsonb not null,
 completed_at timestamptz not null default clock_timestamp(),primary key(request_id,home_id));
alter table maintenance_private.family_attachment_completion_contexts enable row level security;
alter table maintenance_private.family_attachment_completion_receipts enable row level security;
revoke all on maintenance_private.family_attachment_completion_contexts,maintenance_private.family_attachment_completion_receipts from public,anon,authenticated,service_role;
create trigger immutable_family_completion_context before update or delete
on maintenance_private.family_attachment_completion_contexts for each row
execute function maintenance_private.refuse_family_attachment_journal_change();
create trigger immutable_family_completion_receipt before update or delete
on maintenance_private.family_attachment_completion_receipts for each row
execute function maintenance_private.refuse_family_attachment_journal_change();

create function maintenance_private.check_family_completion_commit()
returns trigger language plpgsql security invoker set search_path='' as $$
declare c maintenance_private.family_attachment_completion_contexts;
 r maintenance_private.family_attachment_completion_receipts;
 a maintenance_private.family_attachment_activation_receipts;j maintenance_private.family_attachment_journals;
 p maintenance_private.household_handoff_plans;h maintenance_private.household_handoff_receipts;
 wanted_sources jsonb;wanted_destinations jsonb;x maintenance_private.family_attachment_activation_rows;actual jsonb;
begin
 if tg_table_name='family_attachment_completion_contexts' then
 select * into c from maintenance_private.family_attachment_completion_contexts where token=new.token;
 else select * into c from maintenance_private.family_attachment_completion_contexts where token=new.completion_token;end if;
 select * into r from maintenance_private.family_attachment_completion_receipts where completion_token=c.token;
 select * into a from maintenance_private.family_attachment_activation_receipts where request_id=c.request_id and home_id=c.home_id;
 select * into j from maintenance_private.family_attachment_journals where request_id=c.request_id and home_id=c.home_id;
 select * into p from maintenance_private.household_handoff_plans where home_id=c.home_id;
 select * into h from maintenance_private.household_handoff_receipts where home_id=c.home_id;
 if c.token is null or r.completion_token is null or a.request_id is null or j.request_id is null
 or c.token::text is distinct from current_setting('maintenance.family_completion_context',true)
 or c.backend_pid<>pg_backend_pid() or c.transaction_id<>txid_current() or c.expires_at<=clock_timestamp()
 or c.activation_token<>a.activation_token or r.activation_token<>a.activation_token
 or c.plan_digest<>a.plan_digest or c.inventory_digest<>a.inventory_digest
 or c.plan_digest<>j.plan_digest or c.inventory_digest<>j.inventory_digest
 or r.request_id<>c.request_id or r.home_id<>c.home_id or r.scope is distinct from c.scope
 or r.plan_digest<>c.plan_digest or r.inventory_digest<>c.inventory_digest or r.proof is distinct from c.proof
 or (c.scope-'nativeLease') is distinct from (j.scope-'nativeLease')
 or p.home_id is null or h.home_id is null or p.scope is distinct from c.scope->'controllerScope'
 or h.scope is distinct from p.scope or h.plan_digest<>p.plan_digest
 or h.successor_id::text is distinct from j.plan->>'recipientID' or h.snapshot_digest is distinct from j.plan->>'snapshotDigest'
 or maintenance_private.household_family_snapshot(c.home_id) is distinct from p.snapshot
 or not exists(select 1 from public.homes where id=c.home_id and owner_id=h.successor_id)
 or not exists(select 1 from maintenance_private.account_deletion_requests n
  join maintenance_private.app_epochs e on e.user_id=n.user_id and e.epoch_id=n.app_epoch_id
  join maintenance_private.household_stop_bindings b on b.user_id=n.user_id
  join maintenance_private.household_family_holds hold on hold.principal=n.user_id and hold.home_id=c.home_id
  join maintenance_private.household_principal_fences f on f.user_id=n.user_id
  where n.id=(c.scope->>'nativeRequestID')::uuid and n.user_id=(c.scope->>'userID')::uuid
  and n.app_epoch_id=(c.scope->>'ownerEpoch')::uuid and n.lease_token=(c.scope->>'nativeLease')::uuid
  and n.state='running' and n.lease_until>clock_timestamp() and b.native_lease=n.lease_token
  and b.state='processing' and b.lease_until>clock_timestamp() and b.scope=c.scope->'controllerScope'
  and hold.scope=b.scope and f.stopped)
 or not exists(select 1 from maintenance_private.app_epochs e join maintenance_private.account_access access using(user_id)
  where e.user_id=h.successor_id and e.epoch_id=(j.plan->>'recipientEpoch')::uuid and e.enabled and access.enabled)
 or exists(select 1 from maintenance_private.account_deletion_requests where user_id=h.successor_id and state<>'complete')
 then raise exception 'Current exact family completion context required at COMMIT';end if;
 -- Storage observations originate only from the private branded adapter, never
 -- client JSON. SQL validates the complete canonical manifest and namespace
 -- metadata/fences; it cannot itself prove S3 absence or fence outside writers.
 select coalesce(jsonb_agg(jsonb_build_object('id',v->>'id','path',v->'source'->>'path') order by v->>'id'),'[]') into wanted_sources
 from jsonb_array_elements(j.plan->'files') v where v->'source'->>'path'<>v->'destination'->>'path';
 select coalesce(jsonb_agg(jsonb_build_object('id',v->>'id','path',v->'destination'->>'path','size',v->'size','mime',v->>'mime','sha256',v->>'sha256') order by v->>'id'),'[]') into wanted_destinations
 from jsonb_array_elements(j.plan->'files') v;
 if c.proof is distinct from jsonb_build_object('sources',wanted_sources,'destinations',wanted_destinations)
 then raise exception 'Complete family cleanup observations required';end if;
 if (select count(*) from maintenance_private.family_attachment_activation_rows where token=a.activation_token)<>jsonb_array_length(j.plan->'files')*2
 or (select count(*) from maintenance_private.product_attachments f join public.products prod on prod.id=f.product_id where prod."homeId"=c.home_id and f.state<>'removed')<>jsonb_array_length(j.plan->'files')
 then raise exception 'Retained complete family inventory required';end if;
 for x in select * from maintenance_private.family_attachment_activation_rows where token=a.activation_token loop
  if x.table_name='product_attachments' then select to_jsonb(v) into actual from maintenance_private.product_attachments v where id=x.attachment_id;
  else select to_jsonb(v) into actual from maintenance_private.attachment_write_attempts v where attachment_id=x.attachment_id;end if;
  if actual is distinct from x.after_row then raise exception 'Retained exact family metadata required';end if;
 end loop;
 if exists(select 1 from maintenance_private.family_attachment_quota where request_id=c.request_id and home_id=c.home_id and state<>'consumed')
 or (select count(*) from maintenance_private.family_attachment_quota where request_id=c.request_id and home_id=c.home_id)<>jsonb_array_length(wanted_sources)
 then raise exception 'Consumed complete family quota required';end if;
 if exists(with wanted as (
  select 'homes'::text kind,c.home_id id union all select 'products',id from public.products where "homeId"=c.home_id
  union all select 'maintenance_tasks',t.id from public.maintenance_tasks t join public.products prod on prod.id=t."productId" where prod."homeId"=c.home_id
 ) select 1 from wanted w left join maintenance_private.household_write_routes rt on rt.kind=w.kind and rt.object_id=w.id
 where rt.home_id is distinct from c.home_id or rt.owner_id is distinct from h.successor_id)
 or (select count(*) from maintenance_private.household_write_routes where home_id=c.home_id)<>1+(select count(*) from public.products where "homeId"=c.home_id)+(select count(*) from public.maintenance_tasks t join public.products prod on prod.id=t."productId" where prod."homeId"=c.home_id)
 then raise exception 'Retained complete family routes required';end if;
 return null;
end $$;
revoke all on function maintenance_private.check_family_completion_commit() from public,anon,authenticated,service_role;
create constraint trigger family_completion_context_commit after insert
on maintenance_private.family_attachment_completion_contexts deferrable initially deferred
for each row execute function maintenance_private.check_family_completion_commit();
create constraint trigger family_completion_receipt_commit after insert
on maintenance_private.family_attachment_completion_receipts deferrable initially deferred
for each row execute function maintenance_private.check_family_completion_commit();
