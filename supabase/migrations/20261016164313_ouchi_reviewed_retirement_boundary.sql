-- Dormant reviewed retirement. Bounded SQL-only transaction; never network I/O.
-- Attachment-bearing reviews stay refused until their physical custody executor
-- and all cleanup receipts are integrated. No production policy is enabled.
begin;
create table maintenance_private.reviewed_retirement_policy(id integer primary key check(id=1),enabled boolean not null default false,writer_coverage_verified boolean not null default false);
insert into maintenance_private.reviewed_retirement_policy values(1,false,false);
alter table maintenance_private.reviewed_retirement_policy enable row level security;
revoke all on maintenance_private.reviewed_retirement_policy from public,anon,authenticated,service_role,ouchi_closure_operator;
create table maintenance_private.reviewed_retirements(
 event_id uuid primary key,review_request_id uuid not null unique references maintenance_private.account_closure_reviews(review_request_id) on delete restrict,
 plan_id uuid not null unique references maintenance_private.closure_coverage_plans(plan_id) on delete restrict,seal_event_id uuid not null,
 user_id uuid not null,app_epoch_id uuid not null,operator_principal name not null,
 deletion_request_id uuid not null unique references maintenance_private.account_deletion_requests(id) on delete restrict,
 detached_home_count integer not null check(detached_home_count>=0),departed_membership_count integer not null check(departed_membership_count>=0),
 committed_at timestamptz not null default clock_timestamp(),unique(user_id,app_epoch_id)
);
alter table maintenance_private.reviewed_retirements enable row level security;
revoke all on maintenance_private.reviewed_retirements from public,anon,authenticated,service_role,ouchi_closure_operator;
grant select on maintenance_private.reviewed_retirements to service_role;
alter table maintenance_private.account_closure_reviews drop constraint account_closure_reviews_state_check;
alter table maintenance_private.account_closure_reviews add constraint account_closure_reviews_state_check check(state in('review_required','cancelled','retirement_queued'));
-- New queued transition requires an actual same-transaction retirement receipt;
-- a caller-supplied GUC or client flag is never sufficient. Preserve cancellation.
create or replace function maintenance_private.guard_closure_review_cancel() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if row(new.review_request_id,new.user_id,new.app_epoch_id,new.submission_id,new.requested_at)
 is distinct from row(old.review_request_id,old.user_id,old.app_epoch_id,old.submission_id,old.requested_at) or old.state<>'review_required' then raise exception 'Immutable pending review required';end if;
 if new.state='retirement_queued' and new.cancelled_at is null and exists(
  select 1 from maintenance_private.reviewed_retirements t join maintenance_private.account_deletion_requests d on d.id=t.deletion_request_id
  where t.review_request_id=old.review_request_id and t.user_id=old.user_id and t.app_epoch_id=old.app_epoch_id
   and t.operator_principal=session_user and d.user_id=old.user_id and d.app_epoch_id=old.app_epoch_id and d.state='pending'
   and not exists(select 1 from maintenance_private.app_epochs e where e.user_id=old.user_id and e.enabled)
   and not exists(select 1 from maintenance_private.account_access a where a.user_id=old.user_id and a.enabled)) then return new;end if;
 if new.state<>'cancelled' or new.cancelled_at is null or public.current_maintenance_purchase_account(old.user_id,nullif(current_setting('maintenance.closure_cancel_session',true),'')::uuid) is distinct from old.app_epoch_id then raise exception 'Verified cancellation required';end if;
 return new;
end;$$;
-- Data API writes must recheck the actor in a fresh READ COMMITTED SPI query
-- after waiting for the retirement table locks; an earlier RLS snapshot alone
-- cannot authorize a departed account. Service callbacks use no end-user claims.
create or replace function maintenance_private.enforce_open_maintenance_account() returns trigger
language plpgsql volatile security definer set search_path='' as $$
begin
 if auth.uid() is not null then
  if exists(select 1 from maintenance_private.reviewed_retirement_policy where id=1 and enabled)
   and current_setting('transaction_isolation')<>'read committed' then raise exception 'Fresh app writes require read committed';end if;
  if not maintenance_private.maintenance_account_is_open() then raise exception 'App account closed';end if;
 end if;
 if tg_op='DELETE' then return old;else return new;end if;
end;$$;
create trigger retirement_actor_write_gate before insert or update or delete on public.homes for each row execute function maintenance_private.enforce_open_maintenance_account();
create trigger retirement_actor_write_gate before insert or update or delete on public.products for each row execute function maintenance_private.enforce_open_maintenance_account();
create trigger retirement_actor_write_gate before insert or update or delete on public.maintenance_tasks for each row execute function maintenance_private.enforce_open_maintenance_account();
create trigger retirement_actor_write_gate before insert or update or delete on public.maintenance_history for each row execute function maintenance_private.enforce_open_maintenance_account();
create trigger retirement_actor_write_gate before insert or update or delete on public.home_invites for each row execute function maintenance_private.enforce_open_maintenance_account();
create trigger retirement_actor_write_gate before insert or update or delete on public.maintenance_push_subscriptions for each row execute function maintenance_private.enforce_open_maintenance_account();
create trigger retirement_actor_write_gate before insert or update or delete on public.maintenance_imports for each row execute function maintenance_private.enforce_open_maintenance_account();
create trigger retirement_actor_write_gate before insert or update or delete on public.maintenance_backup_restores for each row execute function maintenance_private.enforce_open_maintenance_account();

-- The server-only notification test claim also creates identifying metadata.
-- Serialize it with retirement before its existing endpoint throttle lock.
create or replace function public.claim_maintenance_push_test(target_user uuid,target_endpoint text)
returns table(endpoint text,p256dh text,auth text)
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 perform pg_advisory_xact_lock(hashtextextended(target_user::text,993));
 if exists(select 1 from maintenance_private.account_access where user_id=target_user and not enabled)
 or exists(select 1 from maintenance_private.app_epochs where user_id=target_user and not enabled)
 or exists(select 1 from maintenance_private.account_deletion_requests where user_id=target_user and state<>'complete')
 or(exists(select 1 from maintenance_private.enrollment_policy where id=1 and require_explicit)
  and not exists(select 1 from maintenance_private.app_epochs e join maintenance_private.account_access a on a.user_id=e.user_id and a.enabled where e.user_id=target_user and e.enabled)) then raise exception 'App account closed';end if;
 if not exists(select 1 from public.maintenance_push_subscriptions s where s.user_id=target_user and s.endpoint=target_endpoint) then raise exception using errcode='P0002',message='Subscription unavailable';end if;
 if exists(select 1 from public.maintenance_push_test_limits l where l.user_id=target_user and l.requested_at>now()-interval '1 minute') then raise exception using errcode='P0003',message='Test notification rate limit';end if;
 insert into public.maintenance_push_test_limits(user_id,requested_at) values(target_user,now()) on conflict(user_id) do update set requested_at=excluded.requested_at;
 return query select s.endpoint,s.p256dh,s.auth from public.maintenance_push_subscriptions s where s.user_id=target_user and s.endpoint=target_endpoint;
end;$$;
create function maintenance_private.read_reviewed_retirement(target_event uuid,target_plan uuid,target_review uuid,target_user uuid,target_epoch uuid,target_seal uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t maintenance_private.reviewed_retirements;
begin
 perform 1 from maintenance_private.closure_operator_principals where principal=session_user and enabled for share;
 if not found then raise exception 'Authorized operator connection required';end if;
 select * into t from maintenance_private.reviewed_retirements where event_id=target_event and plan_id=target_plan and review_request_id=target_review and user_id=target_user and app_epoch_id=target_epoch and seal_event_id=target_seal and operator_principal=session_user;
 if not found then return null;end if;
 return jsonb_build_object('kind','reviewed-retirement/v1','eventID',t.event_id,'planID',t.plan_id,'reviewRequestID',t.review_request_id,'userID',t.user_id,'epochID',t.app_epoch_id,'sealEventID',t.seal_event_id,
 'deletionRequestID',t.deletion_request_id,'detachedHomeCount',t.detached_home_count,'departedMembershipCount',t.departed_membership_count,'state','retirement_queued','accountErasureConfirmed',false);
end;$$;
create function maintenance_private.execute_reviewed_retirement(target_event uuid,target_plan uuid,target_review uuid,target_user uuid,target_epoch uuid,target_seal uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p maintenance_private.closure_coverage_plans;o jsonb;prior jsonb;detached integer;departed integer;
begin
 perform 1 from maintenance_private.closure_operator_principals where principal=session_user and enabled for share;
 if not found then raise exception 'Authorized operator connection required';end if;
 if target_event is null or target_event='00000000-0000-0000-0000-000000000000'::uuid or target_seal is null then raise exception 'Explicit retirement identity required';end if;
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 prior:=maintenance_private.read_reviewed_retirement(target_event,target_plan,target_review,target_user,target_epoch,target_seal);
 if prior is not null then return prior;end if;
 if exists(select 1 from maintenance_private.reviewed_retirements where event_id=target_event or(user_id=target_user and app_epoch_id=target_epoch)) then raise exception 'Retirement event conflict';end if;
 perform 1 from maintenance_private.reviewed_retirement_policy where id=1 and enabled and writer_coverage_verified for share;
 if not found then raise exception 'Reviewed retirement unavailable';end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'Fresh retirement transaction required';end if;
 -- Deliberately coarse MVP gate, Ouchi tables only. Prevents all set/row
 -- phantoms while rechecking and detaching. No Storage/network call may occur
 -- inside this transaction. Backend enforces 1s lock/4.5s statement deadlines.
 lock table public.homes,public.home_members,public.home_invites,public.products,public.maintenance_tasks,public.maintenance_history,public.maintenance_imports,public.maintenance_backup_restores,public.maintenance_push_subscriptions,public.maintenance_push_test_limits,
 maintenance_private.product_attachments,maintenance_private.attachment_write_attempts,maintenance_private.household_attachments,
 maintenance_private.household_copy_intents,maintenance_private.household_copy_writes,maintenance_private.closure_legacy_home_events,
 maintenance_private.closure_file_inspections,maintenance_private.closure_file_decisions,maintenance_private.closure_household_file_inspections,maintenance_private.closure_household_file_decisions,
 maintenance_private.closure_coverage_text_decisions,maintenance_private.closure_coverage_redactions,maintenance_private.account_closure_reviews,
 maintenance_private.account_access,maintenance_private.app_epochs,maintenance_private.app_session_epochs in share row exclusive mode;
 p:=maintenance_private.require_closure_coverage_plan(target_plan,target_review,target_user,target_epoch);
 if p.state<>'sealed' or p.seal_event_id is distinct from target_seal then raise exception 'Exact sealed review required';end if;
 o:=maintenance_private.observe_closure_coverage(target_plan);
 if (o->>'current')::boolean is not true or (o->>'unresolvedCount')::integer<>0 or p.bindings is distinct from o->'bindings' then raise exception 'Sealed review changed';end if;
 if exists(select 1 from maintenance_private.closure_coverage_items where plan_id=target_plan and kind in('personal_file','household_file'))
 or exists(select 1 from maintenance_private.household_copy_intents where user_id=target_user or source_uploader_id=target_user or source_captured_owner_id=target_user)
 then raise exception 'Attachment retirement executor required';end if;
 if not exists(select 1 from maintenance_private.enrollment_policy where id=1 and require_explicit)
 or not exists(select 1 from maintenance_private.account_access where user_id=target_user and enabled) then raise exception 'Current explicit app enrollment required';end if;
 -- Shared homes survive with no designated recipient. Unshared homes remain
 -- owned by the closed actor for the existing scoped erasure worker to remove.
 update public.home_invites v set revoked=true from public.homes h where v."homeId"=h.id and h.owner_id=target_user and exists(select 1 from public.home_members m where m."homeId"=h.id and m.user_id<>target_user);
 update public.homes h set owner_id=null where h.owner_id=target_user and exists(select 1 from public.home_members m where m."homeId"=h.id and m.user_id<>target_user);
 get diagnostics detached=row_count;
 delete from public.home_members where user_id=target_user;get diagnostics departed=row_count;
 update maintenance_private.account_access set enabled=false where user_id=target_user;
 update maintenance_private.app_epochs set enabled=false where user_id=target_user and epoch_id=target_epoch;
 insert into maintenance_private.account_deletion_requests(id,user_id,app_epoch_id) values(target_event,target_user,target_epoch);
 insert into maintenance_private.reviewed_retirements(event_id,review_request_id,plan_id,seal_event_id,user_id,app_epoch_id,operator_principal,deletion_request_id,detached_home_count,departed_membership_count)
 values(target_event,target_review,target_plan,target_seal,target_user,target_epoch,session_user,target_event,detached,departed);
 update maintenance_private.account_closure_reviews set state='retirement_queued' where review_request_id=target_review;
 return maintenance_private.read_reviewed_retirement(target_event,target_plan,target_review,target_user,target_epoch,target_seal);
end;$$;
revoke all on function maintenance_private.read_reviewed_retirement(uuid,uuid,uuid,uuid,uuid,uuid),maintenance_private.execute_reviewed_retirement(uuid,uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function maintenance_private.read_reviewed_retirement(uuid,uuid,uuid,uuid,uuid,uuid),maintenance_private.execute_reviewed_retirement(uuid,uuid,uuid,uuid,uuid,uuid) to ouchi_closure_operator;

-- No job completion here. This removes only identifying review metadata after
-- the exact running erasure job has removed its scoped records/inventory.
create function public.erase_reviewed_retirement_metadata(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 perform 1 from maintenance_private.account_deletion_requests where id=target_request and user_id=target_user and app_epoch_id=target_epoch and records_erased and inventory_captured for update;
 if not found or not public.maintenance_deletion_lease_is_current(target_request,target_user,target_epoch,target_lease) then return false;end if;
 if exists(select 1 from maintenance_private.app_epochs where user_id=target_user and enabled)
 or exists(select 1 from maintenance_private.account_access where user_id=target_user and enabled)
 or exists(select 1 from public.homes where owner_id=target_user) or exists(select 1 from public.home_members where user_id=target_user)
 or exists(select 1 from maintenance_private.household_copy_intents where user_id=target_user or source_uploader_id=target_user or source_captured_owner_id=target_user) then return false;end if;
 delete from maintenance_private.reviewed_retirements where user_id=target_user;
 delete from maintenance_private.closure_coverage_plans where user_id=target_user;
 return true;
end;$$;
revoke all on function public.erase_reviewed_retirement_metadata(uuid,uuid,uuid,uuid) from public,anon,authenticated,ouchi_closure_operator;
grant execute on function public.erase_reviewed_retirement_metadata(uuid,uuid,uuid,uuid) to service_role;
create or replace function public.maintenance_deletion_completion_is_confirmed(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from maintenance_private.account_deletion_requests r
 join maintenance_private.deletion_retention_checks c on c.request_id=r.id
 where r.id=target_request and r.user_id=target_user and r.app_epoch_id=target_epoch
 and r.state='complete' and r.completion_lease=target_lease and r.receipt_expires_at>statement_timestamp()
 and r.identity_erased and r.records_erased and r.inventory_captured and r.receipt_sessions_captured
 and c.checked_at<=r.updated_at and c.confirmed_until>r.updated_at
 and r.receipt_expires_at=r.updated_at+make_interval(secs=>c.receipt_lifetime_seconds))
 and exists(select 1 from maintenance_private.enrollment_policy where id=1 and require_explicit)
 and not exists(select 1 from maintenance_private.restore_transfer_jobs where user_id=target_user)
 and not exists(select 1 from maintenance_private.attest_registration_challenges where user_id=target_user)
 and not exists(select 1 from maintenance_private.restore_attested_keys where user_id=target_user)
 and not exists(select 1 from maintenance_private.restore_challenges where user_id=target_user)
 and not exists(select 1 from maintenance_private.app_session_epochs where user_id=target_user)
 and not exists(select 1 from maintenance_private.app_epochs where user_id=target_user)
 and not exists(select 1 from maintenance_private.ownerless_home_claims where user_id=target_user)
 and not exists(select 1 from maintenance_private.closure_file_inspections where user_id=target_user)
 and not exists(select 1 from maintenance_private.closure_file_decisions where user_id=target_user)
 and not exists(select 1 from maintenance_private.attachment_capacity_claims where split_part(object_path,'/',1)=target_user::text)
 and not exists(select 1 from maintenance_private.household_copy_intents where user_id=target_user or source_uploader_id=target_user or source_captured_owner_id=target_user)
 and not exists(select 1 from maintenance_private.closure_household_file_inspections where user_id=target_user)
 and not exists(select 1 from maintenance_private.closure_household_file_decisions where user_id=target_user)
 and not exists(select 1 from maintenance_private.closure_coverage_plans where user_id=target_user)
 and not exists(select 1 from maintenance_private.reviewed_retirements where user_id=target_user)
 and not exists(select 1 from maintenance_private.account_access where user_id=target_user);
$$;
create or replace function public.complete_maintenance_account_deletion(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
declare receipt_seconds integer;
begin
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 if exists(select 1 from maintenance_private.reviewed_retirements where user_id=target_user)
 or exists(select 1 from maintenance_private.closure_coverage_plans where user_id=target_user)
 or exists(select 1 from maintenance_private.closure_household_file_inspections where user_id=target_user)
 or exists(select 1 from maintenance_private.closure_household_file_decisions where user_id=target_user)
 or exists(select 1 from maintenance_private.ownerless_home_claims where user_id=target_user)
 or exists(select 1 from maintenance_private.closure_file_inspections where user_id=target_user)
 or exists(select 1 from maintenance_private.closure_file_decisions where user_id=target_user)
 or exists(select 1 from maintenance_private.attachment_capacity_claims where split_part(object_path,'/',1)=target_user::text)
 or exists(select 1 from maintenance_private.household_copy_intents where user_id=target_user or source_uploader_id=target_user or source_captured_owner_id=target_user) then return false; end if;
 perform 1 from maintenance_private.account_deletion_requests where id=target_request for update;
 perform 1 from maintenance_private.enrollment_policy where id=1 and require_explicit for share;
 if not found then return false; end if;
 -- Idempotent acknowledgement never extends expiry or changes timestamps.
 if public.maintenance_deletion_completion_is_confirmed(target_request,target_user,target_epoch,target_lease) then return true; end if;
 if not public.maintenance_deletion_identity_is_erased(target_request,target_user,target_epoch,target_lease)
 or exists(select 1 from maintenance_private.account_deletion_objects where request_id=target_request)
 or not exists(select 1 from maintenance_private.deletion_receipt_sessions where request_id=target_request) then return false; end if;
 select c.receipt_lifetime_seconds into receipt_seconds from maintenance_private.deletion_retention_checks c
 where c.request_id=target_request and c.checked_at<=statement_timestamp() and c.confirmed_until>statement_timestamp() for share;
 if not found then return false; end if;
 update maintenance_private.account_deletion_requests set state='complete',completion_lease=target_lease,
 lease_token=null,lease_until=null,updated_at=statement_timestamp(),receipt_expires_at=statement_timestamp()+make_interval(secs=>receipt_seconds)
 where id=target_request;
 return public.maintenance_deletion_completion_is_confirmed(target_request,target_user,target_epoch,target_lease);
end;$$;
commit;
