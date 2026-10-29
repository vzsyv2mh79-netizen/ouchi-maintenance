-- Ouchi-only, finite status capabilities. No shared-account journal, Auth
-- deletion, enrollment, worker dispatch or adopted retention period.
begin;
create table maintenance_private.closure_read_policy(
 id integer primary key check(id=1), enabled boolean not null default false,
 lifetime_seconds integer check(lifetime_seconds between 1 and 2592000),
 check(not enabled or lifetime_seconds is not null)
);
insert into maintenance_private.closure_read_policy(id) values(1);
create table maintenance_private.closure_read_windows(
 request_id uuid primary key references maintenance_private.closure_submission_jobs(request_id) on delete cascade,
 expires_at timestamptz not null
);
create table maintenance_private.closure_read_credentials(
 request_id uuid not null references maintenance_private.closure_read_windows(request_id) on delete cascade,
 credential_id uuid not null check(credential_id<>'00000000-0000-0000-0000-000000000000'::uuid),
 token_hash text not null check(token_hash ~ '^[a-f0-9]{64}$'),
 primary key(request_id,credential_id)
);
alter table maintenance_private.closure_read_policy enable row level security;
alter table maintenance_private.closure_read_windows enable row level security;
alter table maintenance_private.closure_read_credentials enable row level security;
revoke all on maintenance_private.closure_read_policy,maintenance_private.closure_read_windows,maintenance_private.closure_read_credentials from public,anon,authenticated,service_role,ouchi_closure_operator,ouchi_retirement_file_executor,ouchi_closure_progress_reader;
create function maintenance_private.capture_closure_read_window() returns trigger
language plpgsql security definer set search_path='' as $$
declare seconds integer; deadline timestamptz;
begin
 -- Capture once at the real reviewed job's creation. Turning this on later
 -- never backfills, renews or reopens a previously expired window.
 select lifetime_seconds into seconds from maintenance_private.closure_read_policy where id=1 and enabled for share;
 if not found then return new;end if;
 select date_trunc('milliseconds',requested_at+make_interval(secs=>seconds)) into deadline
 from maintenance_private.account_deletion_requests where id=new.request_id;
 if deadline>clock_timestamp() then
  insert into maintenance_private.closure_read_windows values(new.request_id,deadline);
 end if;return new;
end;$$;
revoke all on function maintenance_private.capture_closure_read_window() from public,anon,authenticated,service_role;
create trigger closure_read_window after insert on maintenance_private.closure_submission_jobs for each row execute function maintenance_private.capture_closure_read_window();
create role ouchi_closure_receipt_registrar nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
create role ouchi_closure_receipt_reader nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant usage on schema maintenance_private to ouchi_closure_receipt_registrar,ouchi_closure_receipt_reader;
create function maintenance_private.read_closure_read_window(target_user uuid,verified_session uuid,expected_epoch uuid,expected_submission uuid,expected_request uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare progress jsonb; deadline timestamptz;
begin
 progress:=maintenance_private.read_closure_submission_progress(target_user,verified_session,expected_epoch,expected_submission);
 if progress is null or progress->>'requestID' is distinct from expected_request::text then return null;end if;
 perform 1 from maintenance_private.account_deletion_requests where id=expected_request for share;
 select expires_at into deadline from maintenance_private.closure_read_windows where request_id=expected_request for share;
 if not found or deadline<=clock_timestamp() then return null;end if;
 -- All locks have been obtained; the original Auth session's deadline may
 -- have elapsed while waiting for the job/window locks.
 progress:=maintenance_private.read_closure_submission_progress(target_user,verified_session,expected_epoch,expected_submission);
 if progress is null or progress->>'requestID' is distinct from expected_request::text or deadline<=clock_timestamp() then return null;end if;
 return jsonb_build_object('kind','app-closure-read-window/v1','requestID',expected_request,'epochID',expected_epoch,'submissionID',expected_submission,
  'expiresAt',to_char(deadline at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
end;$$;
create function maintenance_private.register_closure_read_credential(target_user uuid,verified_session uuid,expected_epoch uuid,expected_submission uuid,expected_request uuid,expected_credential uuid,expected_hash text,expected_expiry timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare descriptor jsonb; previous_hash text;
begin
 if expected_request is null or expected_credential is null or expected_credential='00000000-0000-0000-0000-000000000000'::uuid
 or expected_hash is null or expected_hash !~ '^[a-f0-9]{64}$' or expected_expiry is null then raise exception 'Exact saved read credential required';end if;
 -- Serialize cap admission before taking shared descriptor locks: concurrent
 -- devices must neither exceed eight caps nor deadlock on lock upgrades.
 perform pg_advisory_xact_lock(hashtextextended(expected_request::text,991318));
 descriptor:=maintenance_private.read_closure_read_window(target_user,verified_session,expected_epoch,expected_submission,expected_request);
 if descriptor is null or (descriptor->>'expiresAt')::timestamptz<>expected_expiry then return null;end if;
 perform 1 from maintenance_private.closure_read_windows where request_id=expected_request for update;
 descriptor:=maintenance_private.read_closure_read_window(target_user,verified_session,expected_epoch,expected_submission,expected_request);
 if descriptor is null or (descriptor->>'expiresAt')::timestamptz<>expected_expiry then return null;end if;
 select token_hash into previous_hash from maintenance_private.closure_read_credentials where request_id=expected_request and credential_id=expected_credential;
 if found then
  if previous_hash<>expected_hash then raise exception 'Read credential cannot rotate implicitly';end if;
 else
  if (select count(*) from maintenance_private.closure_read_credentials where request_id=expected_request)>=8 then raise exception 'Read credential device limit';end if;
  insert into maintenance_private.closure_read_credentials values(expected_request,expected_credential,expected_hash);
 end if;
 return descriptor||jsonb_build_object('kind','app-closure-read-registration/v1','credentialID',expected_credential,'registered',true);
end;$$;
create function maintenance_private.read_closure_credential_progress(expected_epoch uuid,expected_submission uuid,expected_request uuid,expected_credential uuid,expected_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job maintenance_private.account_deletion_requests%rowtype; deadline timestamptz;
begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'Fresh capability transaction required';end if;
 if expected_hash is null or expected_hash !~ '^[a-f0-9]{64}$' then return null;end if;
 -- A verified scoped capability is the authority for this function; it is
 -- deliberately independent of the now-closed app's login/epoch mappings.
 select r.* into job from maintenance_private.account_deletion_requests r
 join maintenance_private.closure_submission_jobs b on b.request_id=r.id
 join maintenance_private.closure_read_windows w on w.request_id=r.id
 join maintenance_private.closure_read_credentials c on c.request_id=r.id
 where r.id=expected_request and r.app_epoch_id=expected_epoch and b.submission_id=expected_submission
 and c.credential_id=expected_credential and c.token_hash=expected_hash and w.expires_at>clock_timestamp() for share of r;
 if not found then return null;end if;
 select w.expires_at into deadline from maintenance_private.closure_read_windows w join maintenance_private.closure_read_credentials c using(request_id)
 where w.request_id=job.id and c.credential_id=expected_credential and c.token_hash=expected_hash for share of w;
 if not found or deadline<=clock_timestamp() then return null;end if;
 if exists(select 1 from maintenance_private.app_epochs where user_id=job.user_id and epoch_id<>job.app_epoch_id) then return null;end if;
 if job.state='complete' and (job.receipt_expires_at is null or job.receipt_expires_at<=clock_timestamp()
 or not public.maintenance_deletion_completion_is_confirmed(job.id,job.user_id,job.app_epoch_id,job.completion_lease)) then return null;end if;
 if deadline<=clock_timestamp() then return null;end if;
 return jsonb_build_object('kind','app-closure-read-status/v1','requestID',job.id,'epochID',job.app_epoch_id,'submissionID',expected_submission,'credentialID',expected_credential,'state',job.state);
end;$$;
create function maintenance_private.prune_expired_closure_read_windows(batch_size integer default 500) returns integer
language plpgsql security definer set search_path='' as $$
declare removed integer;
begin
 if batch_size is null or batch_size<1 or batch_size>500 then raise exception 'Invalid read cleanup limit';end if;
 with candidates as(select request_id from maintenance_private.closure_read_windows where expires_at<=clock_timestamp() order by expires_at,request_id limit batch_size for update skip locked),
 erased as(delete from maintenance_private.closure_read_windows w using candidates c where w.request_id=c.request_id and w.expires_at<=clock_timestamp() returning w.request_id)
 select count(*)::integer into removed from erased;return removed;
end;$$;
revoke all on function maintenance_private.read_closure_read_window(uuid,uuid,uuid,uuid,uuid),maintenance_private.register_closure_read_credential(uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz),maintenance_private.read_closure_credential_progress(uuid,uuid,uuid,uuid,text),maintenance_private.prune_expired_closure_read_windows(integer) from public,anon,authenticated,service_role,ouchi_closure_operator,ouchi_retirement_file_executor,ouchi_closure_progress_reader;
grant execute on function maintenance_private.read_closure_read_window(uuid,uuid,uuid,uuid,uuid),maintenance_private.register_closure_read_credential(uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz) to ouchi_closure_receipt_registrar;
grant execute on function maintenance_private.read_closure_credential_progress(uuid,uuid,uuid,uuid,text) to ouchi_closure_receipt_reader;
grant execute on function maintenance_private.prune_expired_closure_read_windows(integer) to service_role;
commit;
