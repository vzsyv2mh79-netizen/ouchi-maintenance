-- Disposable review only. Requires household context/fences and journal/quota.
create table maintenance_private.family_attachment_activation_contexts(
 token uuid primary key,household_token uuid not null,
 request_id uuid not null,home_id uuid not null,scope jsonb not null,
 plan_digest text not null,inventory_digest text not null,expected_inventory_digest text not null,consents jsonb not null,
 backend_pid int not null,transaction_id bigint not null,expires_at timestamptz not null,
 foreign key(request_id,home_id) references maintenance_private.family_attachment_journals(request_id,home_id));
create table maintenance_private.family_attachment_activation_rows(
 token uuid not null references maintenance_private.family_attachment_activation_contexts(token),
 table_name text not null check(table_name in ('product_attachments','attachment_write_attempts')),
 attachment_id uuid not null,before_row jsonb not null,after_row jsonb not null,
 primary key(token,table_name,attachment_id));
create table maintenance_private.family_attachment_activation_receipts(
 request_id uuid not null,home_id uuid not null,plan_digest text not null,
 activation_token uuid not null unique references maintenance_private.family_attachment_activation_contexts(token),
 inventory_digest text not null,expected_inventory_digest text not null,activated_at timestamptz not null default clock_timestamp(),
 primary key(request_id,home_id),
 foreign key(request_id,home_id) references maintenance_private.family_attachment_journals(request_id,home_id));
alter table maintenance_private.family_attachment_activation_contexts enable row level security;
alter table maintenance_private.family_attachment_activation_rows enable row level security;
alter table maintenance_private.family_attachment_activation_receipts enable row level security;
revoke all on maintenance_private.family_attachment_activation_contexts,maintenance_private.family_attachment_activation_rows,maintenance_private.family_attachment_activation_receipts from public,anon,authenticated,service_role;
-- Historical evidence must remain bound to the committed transaction, even
-- after its live write capability expires. No public role gets access.
create trigger immutable_family_activation_context before update or delete
on maintenance_private.family_attachment_activation_contexts for each row
execute function maintenance_private.refuse_family_attachment_journal_change();
create trigger immutable_family_activation_rows before update or delete
on maintenance_private.family_attachment_activation_rows for each row
execute function maintenance_private.refuse_family_attachment_journal_change();
create trigger immutable_family_activation_receipt before update or delete
on maintenance_private.family_attachment_activation_receipts for each row
execute function maintenance_private.refuse_family_attachment_journal_change();

create function maintenance_private.current_family_attachment_activation()
returns uuid language plpgsql security definer set search_path='' as $$
declare locator text:=current_setting('maintenance.attachment_activation_context',true);
 c maintenance_private.family_attachment_activation_contexts;
 h maintenance_private.household_handoff_contexts;j maintenance_private.family_attachment_journals;
 b maintenance_private.household_stop_bindings;p maintenance_private.household_handoff_plans;
begin
 if locator is null or locator='' then return null;end if;
 select * into c from maintenance_private.family_attachment_activation_contexts where token=locator::uuid;
 if not found or c.backend_pid<>pg_backend_pid() or c.transaction_id<>txid_current() or c.expires_at<=clock_timestamp() then return null;end if;
 select * into h from maintenance_private.household_handoff_contexts where token=c.household_token;
 select * into j from maintenance_private.family_attachment_journals where request_id=c.request_id and home_id=c.home_id;
 select * into b from maintenance_private.household_stop_bindings where user_id=h.owner_id;
 select * into p from maintenance_private.household_handoff_plans where home_id=c.home_id;
 if h.token is null or j.request_id is null or b.user_id is null
 or h.backend_pid<>pg_backend_pid() or h.transaction_id<>txid_current() or h.expires_at<=clock_timestamp()
 or h.home_id<>c.home_id or h.owner_id::text is distinct from c.scope->>'userID'
 or h.scope is distinct from c.scope->'controllerScope' or h.native_lease::text is distinct from c.scope->>'nativeLease'
 or b.scope is distinct from h.scope or b.native_lease<>h.native_lease or b.state<>'processing' or b.lease_until<=clock_timestamp()
 or j.plan_digest<>c.plan_digest or j.inventory_digest<>c.inventory_digest
 or p.home_id is null or p.plan_digest<>h.plan_digest or p.scope is distinct from h.scope
 or j.plan->>'snapshotDigest' is distinct from p.plan->>'familySnapshotDigest'
 or c.consents is distinct from (select jsonb_agg(to_jsonb(x) order by actor_id) from maintenance_private.household_handoff_consents x where home_id=c.home_id)
 or (select count(*) from maintenance_private.household_handoff_consents where home_id=c.home_id and revoked_at is null and actor_id in(h.owner_id,h.successor_id))<>2
 or (j.scope-'nativeLease') is distinct from (c.scope-'nativeLease')
 or j.plan->>'recipientID' is distinct from h.successor_id::text
 or not exists(select 1 from jsonb_array_elements(h.scope->'apps') a where a->>'app'='ouchi-maintenance' and a->>'requestID'=c.scope->>'nativeRequestID' and a->>'scopeID'=c.scope->>'ownerEpoch')
 or not exists(select 1 from maintenance_private.app_epochs e join maintenance_private.account_access a using(user_id)
  where e.user_id=h.successor_id and e.enabled and a.enabled and e.epoch_id::text=j.plan->>'recipientEpoch')
 or exists(select 1 from maintenance_private.account_deletion_requests where user_id=h.successor_id and state<>'complete')
 or not exists(select 1 from maintenance_private.household_family_holds where home_id=c.home_id and principal=h.owner_id and scope=h.scope)
 or not exists(select 1 from maintenance_private.household_principal_fences where user_id=h.owner_id and stopped)
 or not exists(select 1 from maintenance_private.account_deletion_requests r join maintenance_private.app_epochs e on e.user_id=r.user_id and e.epoch_id=r.app_epoch_id
  where r.id=(c.scope->>'nativeRequestID')::uuid and r.user_id=h.owner_id and r.app_epoch_id=(c.scope->>'ownerEpoch')::uuid
  and r.lease_token=h.native_lease and r.state='running' and r.lease_until>clock_timestamp())
 then return null;end if;
 return c.token;
end $$;
create function maintenance_private.bind_family_activation_receipt()
returns trigger language plpgsql security invoker set search_path='' as $$
declare t uuid:=maintenance_private.current_family_attachment_activation();
 c maintenance_private.family_attachment_activation_contexts;
begin
 select * into c from maintenance_private.family_attachment_activation_contexts where token=t;
 if c.token is null or new.request_id is distinct from c.request_id
 or new.home_id is distinct from c.home_id or new.plan_digest is distinct from c.plan_digest
 or new.inventory_digest is distinct from c.inventory_digest
 or new.expected_inventory_digest is distinct from c.expected_inventory_digest
 or (new.activation_token is not null and new.activation_token is distinct from t)
 then raise exception 'Exact committed activation receipt binding required';end if;
 new.activation_token:=t;
 new.activated_at:=clock_timestamp();
 return new;
end $$;
revoke all on function maintenance_private.bind_family_activation_receipt() from public,anon,authenticated,service_role;
create trigger bind_family_activation_receipt before insert
on maintenance_private.family_attachment_activation_receipts for each row
execute function maintenance_private.bind_family_activation_receipt();

create or replace function maintenance_private.allowed_family_attachment_activation(tbl text,before_value jsonb,after_value jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare t uuid:=maintenance_private.current_family_attachment_activation();id uuid;
begin
 if t is null then return false;end if;
 id:=(case when tbl='product_attachments' then before_value->>'id' else before_value->>'attachment_id' end)::uuid;
 return exists(select 1 from maintenance_private.family_attachment_activation_rows r where r.token=t and r.table_name=tbl and r.attachment_id=id
  and r.before_row=before_value and (r.after_row-'object_path')=(after_value-'object_path'));
end $$;
revoke all on function maintenance_private.current_family_attachment_activation(),maintenance_private.allowed_family_attachment_activation(text,jsonb,jsonb) from public,anon,authenticated,service_role;

alter table maintenance_private.family_attachment_quota drop constraint family_attachment_quota_state_check;
alter table maintenance_private.family_attachment_quota add constraint family_attachment_quota_state_check check(state in ('reserved','consumed'));
create function maintenance_private.guard_family_quota_consumption()
returns trigger language plpgsql security definer set search_path='' as $$
declare t uuid:=maintenance_private.current_family_attachment_activation();
begin
 if tg_op='UPDATE' and t is not null and old.state='reserved' and new.state='consumed'
 and (to_jsonb(old)-'state')=(to_jsonb(new)-'state')
 and exists(select 1 from maintenance_private.family_attachment_activation_contexts c
 join maintenance_private.family_attachment_journals j on j.request_id=c.request_id and j.home_id=c.home_id
 join maintenance_private.family_attachment_activation_rows r on r.token=c.token and r.table_name='product_attachments' and r.attachment_id=old.attachment_id
 where c.token=t and c.request_id=old.request_id and c.home_id=old.home_id
 and old.recipient_id::text=j.plan->>'recipientID' and old.recipient_epoch::text=j.plan->>'recipientEpoch'
 and old.size_bytes::text=r.before_row->>'size_bytes') then return new;end if;
 raise exception 'Verified quota consumption required';
end $$;
revoke all on function maintenance_private.guard_family_quota_consumption() from public,anon,authenticated,service_role;
drop trigger immutable_family_attachment_quota on maintenance_private.family_attachment_quota;
create trigger immutable_family_attachment_quota before update or delete on maintenance_private.family_attachment_quota
for each row execute function maintenance_private.guard_family_quota_consumption();

-- Enforce the whole group at COMMIT, even if a faulty backend returns after
-- consuming quota or omits the receipt for a member-only, zero-quota handoff.
create function maintenance_private.check_family_attachment_activation_commit()
returns trigger language plpgsql security definer set search_path='' as $$
declare t uuid;c maintenance_private.family_attachment_activation_contexts;
 j maintenance_private.family_attachment_journals;a maintenance_private.family_attachment_activation_receipts;
 h maintenance_private.household_handoff_receipts;p maintenance_private.household_handoff_plans;
 r maintenance_private.family_attachment_activation_rows;actual jsonb;expected_count int;
begin
 if tg_table_name='family_attachment_activation_contexts' then t:=new.token;
 else t:=maintenance_private.current_family_attachment_activation();end if;
 select * into c from maintenance_private.family_attachment_activation_contexts where token=t;
 if c.token is null or c.token is distinct from maintenance_private.current_family_attachment_activation() then raise exception 'Atomic activation context expired or changed';end if;
 select * into j from maintenance_private.family_attachment_journals where request_id=c.request_id and home_id=c.home_id;
 select * into a from maintenance_private.family_attachment_activation_receipts where request_id=c.request_id and home_id=c.home_id;
 select * into h from maintenance_private.household_handoff_receipts where home_id=c.home_id;
 select * into p from maintenance_private.household_handoff_plans where home_id=c.home_id;
 if a.request_id is null or h.home_id is null or a.activation_token is distinct from c.token or a.plan_digest<>c.plan_digest or a.inventory_digest<>c.inventory_digest
 or a.expected_inventory_digest<>c.expected_inventory_digest or h.scope is distinct from c.scope->'controllerScope'
 or h.successor_id::text is distinct from j.plan->>'recipientID' or h.plan_digest<>p.plan_digest
 or h.snapshot_digest is distinct from j.plan->>'snapshotDigest'
 or not exists(select 1 from public.homes where id=c.home_id and owner_id=h.successor_id)
 or not exists(select 1 from maintenance_private.household_write_routes where kind='homes' and object_id=c.home_id and owner_id=h.successor_id)
 or exists(select 1 from maintenance_private.household_write_routes where home_id=c.home_id and owner_id<>h.successor_id)
 or maintenance_private.household_family_snapshot(c.home_id) is distinct from p.snapshot
 then raise exception 'Atomic ownership and attachment receipts required';end if;
 -- Equality of the entire route set, not just the home route or surviving rows.
 if exists(with wanted as (
  select 'homes'::text kind,c.home_id id
  union all select 'products',x.id from public.products x where x."homeId"=c.home_id
  union all select 'maintenance_tasks',x.id from public.maintenance_tasks x join public.products y on y.id=x."productId" where y."homeId"=c.home_id
 ) select 1 from wanted w left join maintenance_private.household_write_routes rt on rt.kind=w.kind and rt.object_id=w.id
 where rt.home_id is distinct from c.home_id or rt.owner_id is distinct from h.successor_id)
 or (select count(*) from maintenance_private.household_write_routes where home_id=c.home_id)
 <> 1+(select count(*) from public.products where "homeId"=c.home_id)
    +(select count(*) from public.maintenance_tasks x join public.products y on y.id=x."productId" where y."homeId"=c.home_id)
 then raise exception 'Complete activated write route set required';end if;
 expected_count:=jsonb_array_length(j.plan->'files');
 if (select count(*) from maintenance_private.family_attachment_activation_rows where token=t)<>expected_count*2
 or (select count(*) from maintenance_private.product_attachments f join public.products x on x.id=f.product_id where x."homeId"=c.home_id and f.state<>'removed')<>expected_count
 then raise exception 'Complete activated inventory required';end if;
 for r in select * from maintenance_private.family_attachment_activation_rows where token=t loop
  if r.table_name='product_attachments' then select to_jsonb(x) into actual from maintenance_private.product_attachments x where id=r.attachment_id;
  else select to_jsonb(x) into actual from maintenance_private.attachment_write_attempts x where attachment_id=r.attachment_id;end if;
  if actual is distinct from r.after_row then raise exception 'Exact activated file and write rows required';end if;
 end loop;
 for actual in select value from jsonb_array_elements(j.plan->'files') where value->'source'->>'userID'=j.plan->>'ownerID' loop
  if not exists(select 1 from maintenance_private.family_attachment_quota q where q.request_id=c.request_id and q.home_id=c.home_id
   and q.attachment_id::text=actual->>'id' and q.state='consumed' and q.recipient_id::text=j.plan->>'recipientID'
   and q.recipient_epoch::text=j.plan->>'recipientEpoch' and q.size_bytes::text=actual->>'size') then raise exception 'Exact consumed receiver quota required';end if;
 end loop;
 if (select count(*) from maintenance_private.family_attachment_quota where request_id=c.request_id and home_id=c.home_id)
 <> (select count(*) from jsonb_array_elements(j.plan->'files') f where f->'source'->>'userID'=j.plan->>'ownerID')
 then raise exception 'Foreign receiver quota refused';end if;
 return null;
end $$;
revoke all on function maintenance_private.check_family_attachment_activation_commit() from public,anon,authenticated,service_role;
create constraint trigger family_attachment_activation_group_commit after insert
on maintenance_private.family_attachment_activation_contexts deferrable initially deferred
for each row execute function maintenance_private.check_family_attachment_activation_commit();
create constraint trigger family_attachment_activation_receipt_commit after insert
on maintenance_private.family_attachment_activation_receipts deferrable initially deferred
for each row execute function maintenance_private.check_family_attachment_activation_commit();
