-- Local candidate only. Existing NOLOGIN owner/caller contract required.
-- No LOGIN role, membership, broad table DML, production grant or migration.
-- Canonical DEFINER erasers retain their existing ownership; their exact bodies
-- are pinned and remain a production restricted-owner review gate.
create table maintenance_private.shared_native_cleanup_scopes(
 backend_pid integer not null,transaction_id bigint not null,root_request uuid not null,
 scope jsonb not null,native_request uuid not null,native_epoch uuid not null,native_lease uuid not null,
 review_ids uuid[] not null,phase text not null check(phase in('reviewed','claims')),
 primary key(backend_pid,transaction_id));
alter table maintenance_private.shared_native_cleanup_scopes enable row level security;
revoke all on maintenance_private.shared_native_cleanup_scopes from public,anon,authenticated,service_role,shared_retirement_backend;
grant select,insert,delete on maintenance_private.shared_native_cleanup_scopes to ouchi_shared_native_owner;
grant update(phase) on maintenance_private.shared_native_cleanup_scopes to ouchi_shared_native_owner;
create policy cleanup_owner_scope on maintenance_private.shared_native_cleanup_scopes to ouchi_shared_native_owner
 using(backend_pid=pg_backend_pid() and transaction_id=txid_current())
 with check(backend_pid=pg_backend_pid() and transaction_id=txid_current());
create function maintenance_private.guard_shared_native_cleanup_scope() returns trigger
language plpgsql set search_path='' as $$begin
 if (to_jsonb(new)-'phase') is distinct from (to_jsonb(old)-'phase') or old.phase<>'reviewed' or new.phase<>'claims'
 then raise exception 'Immutable scoped cleanup transition';end if;return new;end$$;
create trigger immutable_shared_native_cleanup_scope before update on maintenance_private.shared_native_cleanup_scopes
for each row execute function maintenance_private.guard_shared_native_cleanup_scope();
create function maintenance_private.check_shared_native_cleanup_commit() returns trigger
language plpgsql security definer set search_path='' as $$
declare v maintenance_private.shared_native_cleanup_scopes;j private.kb_shared_deletion_journal;
begin
 if tg_op='DELETE' then v:=old;else v:=new;end if;
 select * into j from private.kb_shared_deletion_journal where request_id=v.root_request;
 if v.backend_pid<>pg_backend_pid() or v.transaction_id<>txid_current()
 or exists(select 1 from maintenance_private.shared_native_cleanup_scopes where backend_pid=v.backend_pid and transaction_id=v.transaction_id)
 or j.scope is distinct from v.scope-'leaseToken' or j.user_id::text is distinct from v.scope->>'userID'
 or j.status<>'processing' or j.lease_token::text is distinct from v.scope->>'leaseToken' or j.lease_until<=clock_timestamp()
 or public.maintenance_deletion_completion_is_confirmed(v.native_request,j.user_id,v.native_epoch,v.native_lease) is distinct from true
 then raise exception 'Same-transaction cleanup and canonical native COMPLETE required';end if;
 return null;
end$$;
create constraint trigger exact_shared_native_cleanup_commit after insert or update or delete on maintenance_private.shared_native_cleanup_scopes
 deferrable initially deferred for each row execute function maintenance_private.check_shared_native_cleanup_commit();
revoke all on function maintenance_private.guard_shared_native_cleanup_scope(),maintenance_private.check_shared_native_cleanup_commit() from public,anon,authenticated,service_role,shared_retirement_backend;
create function maintenance_private.execute_shared_native_cleanup(s jsonb,n uuid,phase text)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare r maintenance_private.account_deletion_requests;c maintenance_private.shared_native_stage_contexts;
 app jsonb;ok boolean;entry record;bound maintenance_private.shared_native_cleanup_scopes;ids uuid[];
begin
 if current_user::text<>'ouchi_shared_native_owner' or session_user::text<>'shared_retirement_backend'
 or coalesce(current_setting('role',true),'none') not in('none',session_user::text)
 or phase is null or phase not in('eraseReviewedMetadata','eraseManagementClaims','eraseClosureMetadata')
 or not exists(select 1 from pg_catalog.pg_roles x where x.rolname=session_user and x.rolcanlogin
  and not x.rolsuper and not x.rolbypassrls and not x.rolcreatedb and not x.rolcreaterole and not x.rolreplication
  and(x.rolvaliduntil is null or x.rolvaliduntil>clock_timestamp())
  and not exists(select 1 from pg_catalog.pg_auth_members m where m.member=x.oid or m.roleid=x.oid))
 or not exists(select 1 from pg_catalog.pg_roles x where x.rolname=current_user and not x.rolcanlogin and not x.rolinherit
  and not x.rolsuper and not x.rolbypassrls and not x.rolcreatedb and not x.rolcreaterole and not x.rolreplication
  and not exists(select 1 from pg_catalog.pg_auth_members m where m.member=x.oid or m.roleid=x.oid))
 then raise exception 'Dedicated native cleanup principal required';end if;
 if maintenance_private.valid_household_scope(s) is distinct from true then raise exception 'Exact native cleanup scope required';end if;
 for entry in select * from(values
('public.erase_reviewed_retirement_metadata(uuid,uuid,uuid,uuid)','bb4949b0a13a0ba98d49aed1a183514b2af07a389cc6170a210640dea6cc53b3'),
('public.erase_maintenance_deletion_management_claims(uuid,uuid,uuid,uuid)','57fb946de2a63989bb57cde2b7480adc23b4db19911fb08d8bed50d00b8d4626'),
('public.erase_maintenance_deletion_closure_metadata(uuid,uuid,uuid,uuid)','2dd1c44ee2b010bbbf7c97ae34fe479fa8f0a9fb69e28848a08299606b5e61bd')
 ) v(signature,sha256) loop
  if not exists(select 1 from pg_catalog.pg_proc p where p.oid=to_regprocedure(entry.signature) and p.prosecdef
   and encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')=entry.sha256)
  then raise exception 'Canonical cleanup body changed';end if;
 end loop;
 perform 1 from private.kb_shared_deletion_journal where request_id=(s->>'requestID')::uuid for update;
 perform pg_advisory_xact_lock(hashtext(s->>'userID'));
 perform 1 from maintenance_private.household_stop_bindings where user_id=(s->>'userID')::uuid for update;
 select value into app from jsonb_array_elements(s->'apps') where value->>'app'='ouchi-maintenance';
 select * into r from maintenance_private.account_deletion_requests where id=(app->>'requestID')::uuid for update;
 if not found or not r.records_erased or not r.inventory_captured then raise exception 'Records must precede native metadata cleanup';end if;
 -- Existing exact native context verifies root lease/order/stop/epoch mapping.
 insert into maintenance_private.shared_native_stage_contexts values(pg_backend_pid(),txid_current(),s,r.id,r.app_epoch_id,n,'eraseRecords',clock_timestamp()+interval '15 seconds');
 c:=maintenance_private.current_shared_native_stage();
 if c.backend_pid is null then raise exception 'Current native cleanup context required';end if;
 -- Canonical erasers delete all rows for target_user. NEVER let that broaden
 -- a request-scoped execution into another request/epoch. Refuse before any of
 -- the three calls if any affected row has unknown/foreign custody.
 if exists(select 1 from maintenance_private.ownerless_home_claims x where x.user_id=r.user_id and x.app_epoch_id<>r.app_epoch_id)
 or exists(select 1 from maintenance_private.reviewed_retirements x where x.user_id=r.user_id and (x.app_epoch_id<>r.app_epoch_id or x.deletion_request_id<>r.id))
 or exists(select 1 from maintenance_private.reviewed_retirement_files f join maintenance_private.account_deletion_requests j on j.id=f.request_id
  where j.user_id=r.user_id and (f.request_id<>r.id or j.app_epoch_id<>r.app_epoch_id))
 or exists(select 1 from maintenance_private.closure_coverage_plans p where p.user_id=r.user_id and
  (p.app_epoch_id<>r.app_epoch_id or p.state<>'sealed' or not exists(select 1 from maintenance_private.reviewed_retirements x
   where x.plan_id=p.plan_id and x.review_request_id=p.review_request_id and x.seal_event_id=p.seal_event_id
    and x.user_id=r.user_id and x.app_epoch_id=r.app_epoch_id and x.deletion_request_id=r.id)))
 or exists(select 1 from maintenance_private.account_closure_reviews x where x.user_id=r.user_id and x.app_epoch_id<>r.app_epoch_id)
 then raise exception 'Foreign or unbound review epoch/request must remain intact';end if;
 if phase='eraseReviewedMetadata' then
  if exists(select 1 from maintenance_private.account_closure_reviews q where q.user_id=r.user_id
   and not exists(select 1 from maintenance_private.reviewed_retirements t where t.review_request_id=q.review_request_id
    and t.user_id=r.user_id and t.app_epoch_id=r.app_epoch_id and t.deletion_request_id=r.id))
  then raise exception 'Unbound review request must remain intact';end if;
  select coalesce(array_agg(q.review_request_id order by q.review_request_id),'{}'::uuid[]) into ids
   from maintenance_private.account_closure_reviews q where q.user_id=r.user_id;
  insert into maintenance_private.shared_native_cleanup_scopes values(pg_backend_pid(),txid_current(),(s->>'requestID')::uuid,s,r.id,r.app_epoch_id,n,ids,'reviewed');
 else
  select * into bound from maintenance_private.shared_native_cleanup_scopes where backend_pid=pg_backend_pid() and transaction_id=txid_current();
  if not found or bound.scope is distinct from s or bound.native_request<>r.id or bound.native_epoch<>r.app_epoch_id or bound.native_lease<>n
   or (phase='eraseManagementClaims' and bound.phase<>'reviewed') or (phase='eraseClosureMetadata' and bound.phase<>'claims')
  then raise exception 'Ordered same-transaction cleanup custody required';end if;
  select coalesce(array_agg(q.review_request_id order by q.review_request_id),'{}'::uuid[]) into ids
   from maintenance_private.account_closure_reviews q where q.user_id=r.user_id;
  if ids is distinct from bound.review_ids then raise exception 'Closure review set changed';end if;
 end if;
 if phase='eraseReviewedMetadata' then
  ok:=public.erase_reviewed_retirement_metadata(r.id,r.user_id,r.app_epoch_id,n);
 elsif phase='eraseManagementClaims' then
  ok:=public.erase_maintenance_deletion_management_claims(r.id,r.user_id,r.app_epoch_id,n);
 else
  -- The review/plan RESTRICT chain must already be gone. This closes only
  -- canonical metadata, never the separate shared original/manifest/result.
  if exists(select 1 from maintenance_private.reviewed_retirements where user_id=r.user_id)
  or exists(select 1 from maintenance_private.closure_coverage_plans where user_id=r.user_id)
  or exists(select 1 from maintenance_private.reviewed_retirement_files where request_id=r.id)
  then raise exception 'Reviewed metadata must precede closure parent erasure';end if;
  ok:=public.erase_maintenance_deletion_closure_metadata(r.id,r.user_id,r.app_epoch_id,n);
 end if;
 if ok is distinct from true then raise exception 'Canonical native cleanup unconfirmed';end if;
 if phase='eraseManagementClaims' then update maintenance_private.shared_native_cleanup_scopes set phase='claims' where backend_pid=pg_backend_pid() and transaction_id=txid_current();
 elsif phase='eraseClosureMetadata' then delete from maintenance_private.shared_native_cleanup_scopes where backend_pid=pg_backend_pid() and transaction_id=txid_current();end if;
 delete from maintenance_private.shared_native_stage_contexts where backend_pid=pg_backend_pid() and transaction_id=txid_current();
 return true;
end$$;
alter function maintenance_private.execute_shared_native_cleanup(jsonb,uuid,text) owner to ouchi_shared_native_owner;
revoke all on function maintenance_private.execute_shared_native_cleanup(jsonb,uuid,text) from public,anon,authenticated,service_role;
grant execute on function maintenance_private.execute_shared_native_cleanup(jsonb,uuid,text) to shared_retirement_backend;
-- Only these exact canonical signatures are added to the existing NOLOGIN
-- owner. The LOGIN receives no canonical EXECUTE or new table/column grant.
grant execute on function public.erase_reviewed_retirement_metadata(uuid,uuid,uuid,uuid),
 public.erase_maintenance_deletion_management_claims(uuid,uuid,uuid,uuid),
 public.erase_maintenance_deletion_closure_metadata(uuid,uuid,uuid,uuid) to ouchi_shared_native_owner;
