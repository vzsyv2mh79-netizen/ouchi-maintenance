-- LOCAL REVIEW ONLY. Never apply to shared Auth without explicit approval.
-- Requires a separately prepared NOLOGIN guard owner; creates no role/grant.
-- No Auth/private row reads, table lock or persistent actor/PII journal.
-- UPDATE OF id is guarded too: INSERT-only does not exclude UUID renaming.
-- Other BEFORE INSERT/UPDATE triggers/rules require separate review; do not
-- remove existing hooks automatically. Runtime metadata fails closed on them.
create function maintenance_private.guard_ouchi_auth_recreation_identity() returns trigger
language plpgsql volatile security invoker set search_path='' as $ouchi_auth_guard$
declare next_key bigint;prior_key bigint;first_key bigint;second_key bigint;
begin
 if TG_TABLE_SCHEMA<>'auth' or TG_TABLE_NAME<>'users' or TG_WHEN<>'BEFORE'
 or TG_LEVEL<>'ROW' or TG_NARGS<>0 or TG_OP not in('INSERT','UPDATE') then
  raise exception 'Unexpected Auth identity guard context' using errcode='55000';
 end if;
 if NEW.id is null then raise exception 'Auth identity ID required' using errcode='23502';end if;
 if TG_OP='UPDATE' and NEW.id is not distinct from OLD.id then return NEW;end if;
 next_key:=('x'||pg_catalog.encode(pg_catalog.substr(pg_catalog.sha256(pg_catalog.convert_to('OuchiMaintenance/auth-recreation-exclusion/v1:'||NEW.id::text,'UTF8')),1,8),'hex'))::bit(64)::bigint;
 first_key:=next_key;second_key:=next_key;
 if TG_OP='UPDATE' then
  prior_key:=('x'||pg_catalog.encode(pg_catalog.substr(pg_catalog.sha256(pg_catalog.convert_to('OuchiMaintenance/auth-recreation-exclusion/v1:'||OLD.id::text,'UTF8')),1,8),'hex'))::bit(64)::bigint;
  first_key:=least(next_key,prior_key);second_key:=greatest(next_key,prior_key);
 end if;
 if pg_catalog.pg_try_advisory_xact_lock(first_key) is not true then
  raise exception 'Auth identity write excluded during account retirement' using errcode='55000';
 end if;
 if second_key<>first_key and pg_catalog.pg_try_advisory_xact_lock(second_key) is not true then
  raise exception 'Auth identity write excluded during account retirement' using errcode='55000';
 end if;
 return NEW;
end;
$ouchi_auth_guard$;
alter function maintenance_private.guard_ouchi_auth_recreation_identity() owner to ouchi_auth_insert_guard_owner;
revoke all on function maintenance_private.guard_ouchi_auth_recreation_identity() from public,anon,authenticated,service_role;
create trigger ouchi_auth_recreation_insert_fence before insert on auth.users for each row execute function maintenance_private.guard_ouchi_auth_recreation_identity();
create trigger ouchi_auth_recreation_id_update_fence before update of id on auth.users for each row execute function maintenance_private.guard_ouchi_auth_recreation_identity();
alter table auth.users enable always trigger ouchi_auth_recreation_insert_fence;
alter table auth.users enable always trigger ouchi_auth_recreation_id_update_fence;
