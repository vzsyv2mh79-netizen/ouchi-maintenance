begin;
-- Prepared Sandbox reservation only. No route, scheduler, Apple mutation or
-- ownership completion. Integrate deletion and all purchase writers before use.
create table maintenance_private.restore_transfer_policy(
 id integer primary key check(id=1),enabled boolean not null default false
);
insert into maintenance_private.restore_transfer_policy(id,enabled) values(1,false);
alter table maintenance_private.restore_transfer_policy enable row level security;
revoke all on maintenance_private.restore_transfer_policy from public,anon,authenticated;
grant select on maintenance_private.restore_transfer_policy to service_role;
-- Row-share locks require UPDATE privilege; the singleton id cannot change.
grant update(id) on maintenance_private.restore_transfer_policy to service_role;
-- Only a reviewed operator migration may enable; server role cannot flip policy.
create table maintenance_private.restore_transfer_jobs(
 id uuid primary key,
 user_id uuid not null references auth.users(id),session_id uuid not null,app_epoch_id uuid not null,
 environment text not null check(environment='Sandbox'),
 original_transaction_id text not null check(original_transaction_id ~ '^[1-9][0-9]{0,127}$'),
 app_transaction_id text not null check(app_transaction_id ~ '^[1-9][0-9]{0,127}$'),
 previous_account_token uuid not null,bundle_id text not null,
 lease_token uuid not null,authorized_at timestamptz not null,
 phase text not null default 'authorized' check(phase in ('authorized','update_started')),
 mutation_started_at timestamptz,
 expected_counter bigint not null check(expected_counter between 0 and 4294967294),verified_counter bigint not null check(verified_counter>expected_counter and verified_counter<=4294967295),
 client_hash text not null check(client_hash ~ '^[0-9a-f]{64}$'),
 assertion_hash text not null check(assertion_hash ~ '^[0-9a-f]{64}$'),
 pair_hash text not null check(pair_hash ~ '^[0-9a-f]{64}$'),
 check(user_id<>app_epoch_id and previous_account_token<>app_epoch_id),
 check((phase='authorized' and mutation_started_at is null) or
       (phase='update_started' and mutation_started_at>=authorized_at)),
 unique(environment,original_transaction_id)
);
create index restore_transfer_jobs_user on maintenance_private.restore_transfer_jobs(user_id);
alter table maintenance_private.restore_transfer_jobs enable row level security;
revoke all on maintenance_private.restore_transfer_jobs from public,anon,authenticated;
grant select,insert on maintenance_private.restore_transfer_jobs to service_role;
grant update(phase,mutation_started_at) on maintenance_private.restore_transfer_jobs to service_role;

-- Crypto verification happens in the trusted caller. This RPC atomically binds
-- its result to the stored challenge, consumes nonce/counter and creates one job.
create function public.enqueue_maintenance_restore_transfer(
 target_request uuid,target_user uuid,verified_session uuid,target_epoch uuid,target_key text,
 expected_counter bigint,verified_counter bigint,verified_client_hash text,verified_assertion_hash text,
 verified_pair_hash text,original_tx text,store_app_tx text,prior_account_token uuid,
 bundle_id text,lease_token uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare c maintenance_private.restore_challenges;j maintenance_private.restore_transfer_jobs;
begin
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 perform 1 from maintenance_private.restore_transfer_policy where id=1 and enabled for share;
 if not found then return null; end if;
 if target_request is null or target_user is null or verified_session is null or target_epoch is null
 or target_key is null or prior_account_token is null or lease_token is null or target_epoch=prior_account_token
 or original_tx is null or original_tx !~ '^[1-9][0-9]{0,127}$'
 or store_app_tx is null or store_app_tx !~ '^[1-9][0-9]{0,127}$'
 or bundle_id is null or bundle_id !~ '^[A-Za-z0-9][A-Za-z0-9.-]{1,200}$'
 or public.read_maintenance_explicit_enrollment(target_user,verified_session) is distinct from target_epoch then return null; end if;
 perform pg_advisory_xact_lock(hashtext('Sandbox:restore:'||original_tx));
 select * into j from maintenance_private.restore_transfer_jobs where id=target_request and user_id=target_user for update;
 if found then
  if j.user_id=target_user and j.session_id=verified_session and j.app_epoch_id=target_epoch
  and j.original_transaction_id=original_tx and j.app_transaction_id=store_app_tx
  and j.previous_account_token=prior_account_token and j.bundle_id=enqueue_maintenance_restore_transfer.bundle_id
  and j.lease_token=enqueue_maintenance_restore_transfer.lease_token
  and j.expected_counter=enqueue_maintenance_restore_transfer.expected_counter
  and j.verified_counter=enqueue_maintenance_restore_transfer.verified_counter
  and j.client_hash=verified_client_hash and j.assertion_hash=verified_assertion_hash and j.pair_hash=verified_pair_hash
  then return j.id; end if;
  return null;
 end if;
 if exists(select 1 from maintenance_private.restore_transfer_jobs where id=target_request)
 or exists(select 1 from maintenance_private.restore_transfer_jobs where environment='Sandbox' and original_transaction_id=original_tx)
 or exists(select 1 from maintenance_private.transaction_ownership where environment='Sandbox' and original_transaction_id=original_tx)
 then return null; end if;
 select * into c from maintenance_private.restore_challenges where request_id=target_request;
 if not found or c.challenge->>'purchaseEnvironment' is distinct from 'Sandbox'
 or c.challenge->>'proofSHA256' is distinct from verified_pair_hash
 or substring(c.challenge->>'appID' from 12) is distinct from bundle_id then return null; end if;
 if not public.consume_maintenance_restore_challenge(target_request,target_user,verified_session,target_epoch,target_key,
 expected_counter,verified_counter,verified_client_hash,verified_assertion_hash) then return null; end if;
 insert into maintenance_private.restore_transfer_jobs(id,user_id,session_id,app_epoch_id,environment,
 original_transaction_id,app_transaction_id,previous_account_token,bundle_id,lease_token,authorized_at,
 expected_counter,verified_counter,client_hash,assertion_hash,pair_hash)
 values(target_request,target_user,verified_session,target_epoch,'Sandbox',original_tx,store_app_tx,prior_account_token,
 bundle_id,lease_token,clock_timestamp(),expected_counter,verified_counter,verified_client_hash,verified_assertion_hash,verified_pair_hash);
 return target_request;
end;$$;

create function public.maintenance_restore_transfer_lease_is_current(
 target_request uuid,target_lease uuid,target_user uuid,verified_session uuid,target_epoch uuid,expected_phase text)
 returns boolean language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 return exists(select 1 from maintenance_private.restore_transfer_policy where id=1 and enabled)
 and exists(select 1 from maintenance_private.restore_transfer_jobs j
 where j.id=target_request and j.lease_token=target_lease and j.user_id=target_user
 and j.session_id=verified_session and j.app_epoch_id=target_epoch and j.phase=expected_phase
 and public.read_maintenance_explicit_enrollment(target_user,verified_session)=target_epoch
 and not exists(select 1 from maintenance_private.transaction_ownership o
 where o.environment=j.environment and o.original_transaction_id=j.original_transaction_id));
end;$$;

-- Only the first authorized->unknown transition returns a marker. A duplicate
-- stale worker cannot receive permission to send another external mutation.
create function public.mark_maintenance_restore_transfer_update(
 target_request uuid,target_lease uuid,target_user uuid,verified_session uuid,target_epoch uuid)
 returns jsonb language plpgsql security invoker set search_path='' as $$
declare j maintenance_private.restore_transfer_jobs;
begin
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 if not public.maintenance_restore_transfer_lease_is_current(target_request,target_lease,target_user,verified_session,target_epoch,'authorized') then return null; end if;
 update maintenance_private.restore_transfer_jobs set phase='update_started',mutation_started_at=clock_timestamp()
 where id=target_request and lease_token=target_lease and phase='authorized' returning * into j;
 if not found then return null; end if;
 return jsonb_build_object('id',j.id,'lease',j.lease_token,'userID',j.user_id,'sessionID',j.session_id,'epochID',j.app_epoch_id,
 'originalTransactionID',j.original_transaction_id,'appTransactionID',j.app_transaction_id,'previousAccountToken',j.previous_account_token,
 'environment',j.environment,'bundleID',j.bundle_id,'authorizedAt',floor(extract(epoch from j.authorized_at)*1000)::bigint,
 'phase',j.phase,'mutationStartedAt',floor(extract(epoch from j.mutation_started_at)*1000)::bigint);
end;$$;
revoke all on function public.enqueue_maintenance_restore_transfer(uuid,uuid,uuid,uuid,text,bigint,bigint,text,text,text,text,text,uuid,text,uuid),
 public.maintenance_restore_transfer_lease_is_current(uuid,uuid,uuid,uuid,uuid,text),
 public.mark_maintenance_restore_transfer_update(uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.enqueue_maintenance_restore_transfer(uuid,uuid,uuid,uuid,text,bigint,bigint,text,text,text,text,text,uuid,text,uuid),
 public.maintenance_restore_transfer_lease_is_current(uuid,uuid,uuid,uuid,uuid,text),
 public.mark_maintenance_restore_transfer_update(uuid,uuid,uuid,uuid,uuid) to service_role;
commit;
