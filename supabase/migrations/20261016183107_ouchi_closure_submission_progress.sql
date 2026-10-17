-- Read-only bridge from a saved review submission to the real deletion job.
-- No guessed/backfilled mapping. Finite completed-job pruning cascades it away.
begin;
create table maintenance_private.closure_submission_jobs(
 request_id uuid primary key references maintenance_private.account_deletion_requests(id) on delete cascade,
 submission_id uuid not null check(submission_id<>'00000000-0000-0000-0000-000000000000'::uuid)
);
alter table maintenance_private.closure_submission_jobs enable row level security;
revoke all on maintenance_private.closure_submission_jobs from public,anon,authenticated,service_role,ouchi_closure_operator,ouchi_retirement_file_executor;
create function maintenance_private.capture_closure_submission_job() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.state='retirement_queued' and old.state is distinct from new.state then
  insert into maintenance_private.closure_submission_jobs(request_id,submission_id)
  select r.deletion_request_id,new.submission_id from maintenance_private.reviewed_retirements r
  where r.review_request_id=new.review_request_id and r.user_id=new.user_id and r.app_epoch_id=new.app_epoch_id;
  if not found then raise exception 'Exact retirement submission mapping required';end if;
 end if;return new;
end;$$;
revoke all on function maintenance_private.capture_closure_submission_job() from public,anon,authenticated,service_role,ouchi_closure_operator,ouchi_retirement_file_executor;
create trigger retirement_submission_job after update of state on maintenance_private.account_closure_reviews for each row execute function maintenance_private.capture_closure_submission_job();
create role ouchi_closure_progress_reader nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant usage on schema maintenance_private to ouchi_closure_progress_reader;
create function maintenance_private.read_closure_submission_progress(target_user uuid,verified_session uuid,expected_epoch uuid,expected_submission uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare request_key uuid;progress jsonb;
begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'Fresh progress transaction required';end if;
 if auth.uid() is distinct from target_user or target_user is null or verified_session is null or expected_epoch is null or expected_submission is null then raise exception 'Verified submission identity required';end if;
 -- The caller verified this exact bearer with Auth.getUser. Independently pin
 -- the real original session; closing Ouchi never deletes shared Auth here.
 perform 1 from auth.sessions where id=verified_session and user_id=target_user and(not_after is null or not_after>clock_timestamp()) for share;
 if not found or not exists(select 1 from auth.sessions where id=verified_session and user_id=target_user and(not_after is null or not_after>clock_timestamp())) then return null;end if;
 select r.id into request_key from maintenance_private.account_deletion_requests r join maintenance_private.closure_submission_jobs b on b.request_id=r.id
 where r.user_id=target_user and r.app_epoch_id=expected_epoch and b.submission_id=expected_submission;
 if not found then return null;end if;
 -- Before receipt capture, only the original session mapped to this exact app
 -- epoch may discover the job. Later, the canonical finite snapshot governs.
 if not exists(select 1 from maintenance_private.deletion_receipt_sessions s where s.request_id=request_key and s.session_id=verified_session)
 and not exists(select 1 from maintenance_private.app_session_epochs s where s.session_id=verified_session and s.user_id=target_user and s.epoch_id=expected_epoch) then return null;end if;
 progress:=public.read_maintenance_session_deletion_progress(target_user,verified_session,request_key);
 if progress is null or progress->>'epochID' is distinct from expected_epoch::text then return null;end if;
 if progress->>'state'='complete' and not exists(select 1 from maintenance_private.account_deletion_requests where id=request_key and receipt_expires_at>clock_timestamp()) then return null;end if;
 -- Only the canonical progress function may acknowledge completed erasure.
 return jsonb_build_object('kind','app-closure-progress/v1','requestID',request_key,'epochID',expected_epoch,'submissionID',expected_submission,'state',progress->>'state');
end;$$;
revoke all on function maintenance_private.read_closure_submission_progress(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role,ouchi_closure_operator,ouchi_retirement_file_executor;
grant execute on function maintenance_private.read_closure_submission_progress(uuid,uuid,uuid,uuid) to ouchi_closure_progress_reader;
commit;
