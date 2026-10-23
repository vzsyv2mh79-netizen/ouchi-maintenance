-- Undeployed review overlay, after shared-maintenance-native-stage.sql.
-- A non-deleting prelogout snapshot may precede personal-object erasure.
-- Canonical public capture and all erasure/complete absence gates are unchanged.
create table maintenance_private.shared_prelogout_receipt_custody(
 request_id uuid primary key,
 native_epoch uuid not null,native_lease uuid not null,scope jsonb not null,
 session_ids uuid[] not null check(cardinality(session_ids) between 1 and 1000)
);
alter table maintenance_private.shared_prelogout_receipt_custody enable row level security;
revoke all on maintenance_private.shared_prelogout_receipt_custody from public,anon,authenticated,service_role;
create function maintenance_private.guard_prelogout_custody_insert() returns trigger
language plpgsql security definer set search_path='' as $$
declare c maintenance_private.shared_native_stage_contexts:=maintenance_private.current_shared_native_stage();ids uuid[];
begin
 if c.backend_pid is null or c.stage<>'captureReceiptSessions' or new.request_id<>c.native_request
  or new.native_epoch<>c.native_epoch or new.native_lease<>c.native_lease or new.scope<>c.scope
  or exists(select 1 from maintenance_private.account_deletion_requests where id=new.request_id and receipt_sessions_captured)
  or exists(select 1 from maintenance_private.deletion_receipt_sessions where request_id=new.request_id) then raise exception 'Current prelogout snapshot authority required';end if;
 select array_agg(a.session_id order by a.session_id) into ids
 from maintenance_private.app_session_epochs a join auth.sessions live on live.id=a.session_id and live.user_id=a.user_id
 where a.user_id=(c.scope->>'userID')::uuid and a.epoch_id=c.native_epoch;
 if ids is null or new.session_ids is distinct from ids then raise exception 'Exact live prelogout sessions required';end if;
 return new;
end $$;
revoke all on function maintenance_private.guard_prelogout_custody_insert() from public,anon,authenticated,service_role;
create trigger authorized_prelogout_snapshot before insert on maintenance_private.shared_prelogout_receipt_custody
 for each row execute function maintenance_private.guard_prelogout_custody_insert();
create function maintenance_private.refuse_prelogout_custody_change() returns trigger
language plpgsql set search_path='' as $$begin raise exception 'Immutable prelogout custody';end$$;
revoke all on function maintenance_private.refuse_prelogout_custody_change() from public,anon,authenticated,service_role;
create trigger immutable_prelogout_custody before update or delete on maintenance_private.shared_prelogout_receipt_custody
for each row execute function maintenance_private.refuse_prelogout_custody_change();

create function maintenance_private.prelogout_custody_is_exact(rid uuid) returns boolean
language sql security definer set search_path='' as $$
 select exists(select 1 from maintenance_private.shared_prelogout_receipt_custody c
  join maintenance_private.account_deletion_requests r on r.id=c.request_id
  where c.request_id=rid and r.app_epoch_id=c.native_epoch and r.user_id::text=c.scope->>'userID'
   and r.receipt_sessions_captured
   and c.session_ids=(select array_agg(s.session_id order by s.session_id) from maintenance_private.deletion_receipt_sessions s where s.request_id=rid)
   and cardinality(c.session_ids)=(select count(distinct id) from unnest(c.session_ids) id))
$$;
revoke all on function maintenance_private.prelogout_custody_is_exact(uuid) from public,anon,authenticated,service_role;
create function maintenance_private.verify_prelogout_custody_at_commit() returns trigger
language plpgsql security definer set search_path='' as $$
declare rid uuid;
begin
 -- UPDATE may move a session to a different request: check both the source
 -- and destination set, including when the destination has no manifest.
 foreach rid in array array[case when tg_op in('UPDATE','DELETE') then old.request_id end,
  case when tg_op in('INSERT','UPDATE') then new.request_id end] loop
  if rid is not null and exists(select 1 from maintenance_private.shared_prelogout_receipt_custody where request_id=rid)
   and maintenance_private.prelogout_custody_is_exact(rid) is distinct from true then raise exception 'Exact prelogout receipt session set required';end if;
 end loop;
 return null;
end $$;
revoke all on function maintenance_private.verify_prelogout_custody_at_commit() from public,anon,authenticated,service_role;
create constraint trigger exact_prelogout_snapshot after insert on maintenance_private.shared_prelogout_receipt_custody
 deferrable initially deferred for each row execute function maintenance_private.verify_prelogout_custody_at_commit();
create constraint trigger exact_prelogout_sessions after insert or update or delete on maintenance_private.deletion_receipt_sessions
 deferrable initially deferred for each row execute function maintenance_private.verify_prelogout_custody_at_commit();

create or replace function maintenance_private.capture_shared_prelogout_receipt_sessions(rid uuid,uid uuid,epoch uuid,lease uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare c maintenance_private.shared_native_stage_contexts;
 snapshot maintenance_private.shared_prelogout_receipt_custody;ids uuid[];
begin
 c:=maintenance_private.current_shared_native_stage();
 if c.backend_pid is null or c.stage<>'captureReceiptSessions' or c.native_request<>rid
 or c.native_epoch<>epoch or c.native_lease<>lease or c.scope->>'userID'<>uid::text
 or not public.maintenance_deletion_lease_is_current(rid,uid,epoch,lease)
 or not exists(select 1 from maintenance_private.account_deletion_requests where id=rid and inventory_captured)
 or not exists(select 1 from maintenance_private.account_access where user_id=uid and not enabled)
 or not exists(select 1 from maintenance_private.app_epochs where user_id=uid and epoch_id=epoch and not enabled)
 then return false;end if;
 select * into snapshot from maintenance_private.shared_prelogout_receipt_custody where request_id=rid for update;
 if found then return snapshot.native_epoch=epoch and snapshot.native_lease=lease and snapshot.scope=c.scope
  and maintenance_private.prelogout_custody_is_exact(rid);end if;
 if exists(select 1 from maintenance_private.account_deletion_requests where id=rid and receipt_sessions_captured)
 or exists(select 1 from maintenance_private.deletion_receipt_sessions where request_id=rid) then return false;end if;
 -- Stopped enrollment/writer gates and the enclosing native-stage authority
 -- remain required. This locks the exact real sessions and their app mapping.
 perform 1 from auth.sessions live join maintenance_private.app_session_epochs a on a.session_id=live.id and a.user_id=live.user_id
  where a.user_id=uid and a.epoch_id=epoch order by live.id for update of live,a;
 select array_agg(a.session_id order by a.session_id) into ids
 from maintenance_private.app_session_epochs a join auth.sessions live on live.id=a.session_id and live.user_id=a.user_id
 where a.user_id=uid and a.epoch_id=epoch;
 if ids is null or cardinality(ids) not between 1 and 1000 then return false;end if;
 insert into maintenance_private.shared_prelogout_receipt_custody values(rid,epoch,lease,c.scope,ids);
 insert into maintenance_private.deletion_receipt_sessions(request_id,session_id) select rid,id from unnest(ids) id;
 update maintenance_private.account_deletion_requests set receipt_sessions_captured=true where id=rid;
 return maintenance_private.prelogout_custody_is_exact(rid);
end $$;
revoke all on function maintenance_private.capture_shared_prelogout_receipt_sessions(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
-- No production roles/grants/migration or retention policy are installed.
-- Manifest disposal must be reviewed with terminal receipt retention before use.
