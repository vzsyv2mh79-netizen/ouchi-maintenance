begin;
-- Interactive recovery only; no rights, scheduler, API trigger, or raw Apple proof stored.
create table maintenance_private.reconciliation_jobs (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id),
 app_epoch_id uuid not null,
 environment text not null check(environment in ('Sandbox','Production')),
 transaction_id text not null check(length(transaction_id) between 1 and 128),
 revision text check(length(revision) between 1 and 4096),
 state text not null default 'queued' check(state in ('queued','running','complete','failed','cancelled')),
 attempts integer not null default 0 check(attempts between 0 and 8),
 available_at timestamptz not null default now(),
 lease_token uuid,
 lease_until timestamptz,
 last_error text check(last_error in ('read_unavailable','verification_failed','storage_unavailable','cancelled','unknown')),
 updated_at timestamptz not null default now(),
 unique(user_id,app_epoch_id,environment),
 check((state='running' and lease_token is not null and lease_until is not null) or (state<>'running' and lease_token is null and lease_until is null))
);
create index reconciliation_jobs_ready on maintenance_private.reconciliation_jobs(environment,state,available_at,lease_until);
alter table maintenance_private.reconciliation_jobs enable row level security;
revoke all on maintenance_private.reconciliation_jobs from public,anon,authenticated;
grant select,insert,update on maintenance_private.reconciliation_jobs to service_role;

create function public.enqueue_maintenance_reconciliation(target_user uuid,verified_session uuid,target_epoch uuid,target_environment text)
returns uuid language plpgsql volatile security invoker set search_path='' as $$
declare seed jsonb; job_id uuid;
begin
 seed:=public.read_maintenance_reconciliation_seed(target_user,verified_session,target_epoch,target_environment);
 if seed is null then return null; end if;
 insert into maintenance_private.reconciliation_jobs(user_id,app_epoch_id,environment,transaction_id)
 values(target_user,target_epoch,target_environment,seed->>'transactionId')
 on conflict(user_id,app_epoch_id,environment) do update set
 transaction_id=case when reconciliation_jobs.state in ('complete','failed','cancelled') then excluded.transaction_id else reconciliation_jobs.transaction_id end,
 revision=case when reconciliation_jobs.state in ('complete','failed','cancelled') then null else reconciliation_jobs.revision end,
 attempts=case when reconciliation_jobs.state in ('complete','failed','cancelled') then 0 else reconciliation_jobs.attempts end,
 available_at=case when reconciliation_jobs.state in ('complete','failed','cancelled') then now() else reconciliation_jobs.available_at end,
 last_error=case when reconciliation_jobs.state in ('complete','failed','cancelled') then null else reconciliation_jobs.last_error end,
 state=case when reconciliation_jobs.state in ('complete','failed','cancelled') then 'queued' else reconciliation_jobs.state end
 returning id into job_id;
 return job_id;
end;$$;

create function public.claim_maintenance_reconciliation(target_environment text)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare job maintenance_private.reconciliation_jobs;
begin
 if target_environment is null or target_environment not in ('Sandbox','Production') then raise exception 'Invalid recovery environment'; end if;
 -- Closed application enrollment must not regain access from a delayed interactive job.
 update maintenance_private.reconciliation_jobs j set state='cancelled',lease_token=null,lease_until=null,last_error='cancelled',updated_at=now()
 where j.environment=target_environment and j.state in ('queued','running') and not exists(
 select 1 from maintenance_private.app_epochs e join maintenance_private.account_access a on a.user_id=e.user_id
 where e.user_id=j.user_id and e.epoch_id=j.app_epoch_id and e.enabled and a.enabled);
 update maintenance_private.reconciliation_jobs set state='failed',lease_token=null,lease_until=null,updated_at=now()
 where environment=target_environment and state='running' and lease_until<=now() and attempts>=8;
 select * into job from maintenance_private.reconciliation_jobs
 where environment=target_environment and attempts<8 and ((state='queued' and available_at<=now()) or (state='running' and lease_until<=now()))
 order by available_at,id for update skip locked limit 1;
 if not found then return null; end if;
 update maintenance_private.reconciliation_jobs set state='running',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',updated_at=now()
 where id=job.id returning * into job;
 return jsonb_build_object('id',job.id,'userId',job.user_id,'accountToken',job.app_epoch_id,'environment',job.environment,'transactionId',job.transaction_id,'revision',job.revision,'attempt',job.attempts,'leaseToken',job.lease_token,'leaseUntil',job.lease_until);
end;$$;

create function public.finish_maintenance_reconciliation(target_job uuid,target_lease uuid,is_complete boolean,next_revision text,error_code text)
returns boolean language plpgsql volatile security invoker set search_path='' as $$
declare job maintenance_private.reconciliation_jobs;
begin
 if is_complete is null or (error_code is not null and error_code not in ('read_unavailable','verification_failed','storage_unavailable','cancelled','unknown'))
 or (next_revision is not null and length(next_revision) not between 1 and 4096)
 or (error_code is not null and (is_complete or next_revision is not null))
 or (error_code is null and ((is_complete and next_revision is not null) or (not is_complete and next_revision is null))) then raise exception 'Invalid recovery result'; end if;
 select * into job from maintenance_private.reconciliation_jobs where id=target_job and state='running' and lease_token=target_lease and lease_until>now() for update;
 if not found then return false; end if;
 if not exists(select 1 from maintenance_private.app_epochs e join maintenance_private.account_access a on a.user_id=e.user_id where e.user_id=job.user_id and e.epoch_id=job.app_epoch_id and e.enabled and a.enabled) then
 update maintenance_private.reconciliation_jobs set state='cancelled',lease_token=null,lease_until=null,last_error='cancelled',updated_at=now() where id=job.id;return false;
 end if;
 update maintenance_private.reconciliation_jobs set
 state=case when error_code='cancelled' then 'cancelled' when error_code is not null and job.attempts>=8 then 'failed' when error_code is not null then 'queued' when is_complete then 'complete' else 'queued' end,
 revision=case when error_code is null then next_revision else job.revision end,
 attempts=case when error_code is null then 0 else job.attempts end,
 available_at=now()+case when error_code is null then interval '1 second' else least(3600,power(2,job.attempts)::integer*5)*interval '1 second' end,
 lease_token=null,lease_until=null,last_error=error_code,updated_at=now() where id=job.id;
 return true;
end;$$;
revoke all on function public.enqueue_maintenance_reconciliation(uuid,uuid,uuid,text),public.claim_maintenance_reconciliation(text),public.finish_maintenance_reconciliation(uuid,uuid,boolean,text,text) from public,anon,authenticated;
grant execute on function public.enqueue_maintenance_reconciliation(uuid,uuid,uuid,text),public.claim_maintenance_reconciliation(text),public.finish_maintenance_reconciliation(uuid,uuid,boolean,text,text) to service_role;
commit;
