begin;
-- Prepared Sandbox-only cancellation. Never cancels an existing transfer job.
-- A private receipt and removal of its unconsumed nonce are one transaction.
create table maintenance_private.restore_cancelled_requests(
 request_id uuid primary key check(request_id<>'00000000-0000-0000-0000-000000000000'::uuid),
 user_id uuid not null references auth.users(id),session_id uuid not null,app_epoch_id uuid not null,key_id text not null,
 app_id text not null,attest_environment text not null check(attest_environment in ('development','production')),
 pair_hash text not null check(pair_hash ~ '^[0-9a-f]{64}$'),
 assertion_hash text not null check(assertion_hash ~ '^[0-9a-f]{64}$'),
 cancelled_at timestamptz not null default clock_timestamp(),
 foreign key(key_id,user_id,app_epoch_id) references maintenance_private.restore_attested_keys(key_id,user_id,app_epoch_id) on delete cascade
);
create index restore_cancelled_requests_user on maintenance_private.restore_cancelled_requests(user_id);
alter table maintenance_private.restore_cancelled_requests enable row level security;
revoke all on maintenance_private.restore_cancelled_requests from public,anon,authenticated;
-- Immutable to the server role. Erasure follows strict account proof-key cleanup.
grant select,insert on maintenance_private.restore_cancelled_requests to service_role;

create function maintenance_private.refuse_cancelled_restore_challenge() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtext(new.user_id::text));
 if exists(select 1 from maintenance_private.restore_cancelled_requests where request_id=new.request_id) then
  raise exception 'Cancelled restore request cannot be reissued';
 end if;
 return new;
end;$$;
create trigger restore_challenge_cancelled before insert on maintenance_private.restore_challenges
 for each row execute function maintenance_private.refuse_cancelled_restore_challenge();
revoke all on function maintenance_private.refuse_cancelled_restore_challenge() from public,anon,authenticated;

create function public.cancel_maintenance_unreserved_restore(
 target_request uuid,target_user uuid,verified_session uuid,target_epoch uuid,target_key text,
 expected_app text,expected_attest_environment text,verified_pair_hash text,verified_assertion_hash text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c maintenance_private.restore_challenges; r maintenance_private.restore_cancelled_requests;
begin
 if target_request is null or target_user is null or verified_session is null or target_epoch is null
 or target_request='00000000-0000-0000-0000-000000000000'::uuid
 or verified_pair_hash is null or verified_pair_hash !~ '^[0-9a-f]{64}$'
 or verified_assertion_hash is null or verified_assertion_hash !~ '^[0-9a-f]{64}$' then return null; end if;
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 perform 1 from maintenance_private.restore_transfer_policy where id=1 and enabled for share;
 if not found or public.read_maintenance_restore_key(target_user,verified_session,target_epoch,target_key,
 expected_app,expected_attest_environment) is null then return null; end if;
 -- No job of any phase/owner can be cancelled, even with matching hashes.
 if exists(select 1 from maintenance_private.restore_transfer_jobs where id=target_request) then return null; end if;
 select * into r from maintenance_private.restore_cancelled_requests where request_id=target_request;
 if found then
  if r.user_id is distinct from target_user or r.session_id is distinct from verified_session
  or r.app_epoch_id is distinct from target_epoch or r.key_id is distinct from target_key
  or r.app_id is distinct from expected_app or r.attest_environment is distinct from expected_attest_environment
  or r.pair_hash is distinct from verified_pair_hash or r.assertion_hash is distinct from verified_assertion_hash
  then return null; end if;
 else
  select * into c from maintenance_private.restore_challenges where request_id=target_request for update;
  if not found or c.user_id is distinct from target_user or c.session_id is distinct from verified_session
  or c.app_epoch_id is distinct from target_epoch or c.key_id is distinct from target_key
  or c.challenge->>'appID' is distinct from expected_app
  or c.challenge->>'attestEnvironment' is distinct from expected_attest_environment
  or c.challenge->>'purchaseEnvironment' is distinct from 'Sandbox'
  or c.challenge->>'proofSHA256' is distinct from verified_pair_hash
  or c.consumed_at is not null then return null; end if;
  -- Expiry is not proof of absence. The exact stored nonce and absence of a job
  -- are checked while holding the same account lock as enqueue/consume.
  delete from maintenance_private.restore_challenges where request_id=target_request;
  insert into maintenance_private.restore_cancelled_requests(request_id,user_id,session_id,app_epoch_id,key_id,
  app_id,attest_environment,pair_hash,assertion_hash)
  values(target_request,target_user,verified_session,target_epoch,target_key,expected_app,
  expected_attest_environment,verified_pair_hash,verified_assertion_hash);
 end if;
 return jsonb_build_object('requestID',target_request,'status','cancelled',
 'pairSHA256',verified_pair_hash,'assertionSHA256',verified_assertion_hash);
end;$$;
revoke all on function public.cancel_maintenance_unreserved_restore(uuid,uuid,uuid,uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.cancel_maintenance_unreserved_restore(uuid,uuid,uuid,uuid,text,text,text,text,text) to service_role;

create or replace function public.issue_maintenance_restore_challenge(payload jsonb,client_hash text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare k maintenance_private.restore_attested_keys; c maintenance_private.restore_challenges; u uuid; s uuid; e uuid; r uuid; now_at timestamptz; issued timestamptz; expiry timestamptz; field_name text;
begin
 if payload is null or jsonb_typeof(payload)<>'object' or client_hash is null or client_hash !~ '^[0-9a-f]{64}$'
 or (select count(*) from jsonb_object_keys(payload))<>14 or payload->'version' is distinct from '1'::jsonb
 or payload->>'purpose' is distinct from 'restore_ouchi_subscription' or payload->>'purchaseEnvironment' is distinct from 'Sandbox'
 or payload->>'issuedAt' !~ '^[1-9][0-9]{0,15}$' or payload->>'expiresAt' !~ '^[1-9][0-9]{0,15}$'
 or payload->>'proofSHA256' !~ '^[0-9a-f]{64}$'
 or encode(sha256(convert_to(maintenance_private.restore_client_data(payload),'UTF8')),'hex')<>client_hash then return null; end if;
 for field_name in select unnest(array['userID','sessionID','epochID','requestID','keyID','appID','attestEnvironment','purchaseEnvironment','proofSHA256','purpose','nonce']) loop
  if jsonb_typeof(payload->field_name) is distinct from 'string' then return null; end if;
 end loop;
 if jsonb_typeof(payload->'issuedAt') is distinct from 'number' or jsonb_typeof(payload->'expiresAt') is distinct from 'number'
 or payload->>'nonce' !~ '^[A-Za-z0-9_-]{43}$'
 or rtrim(translate(encode(decode(translate(payload->>'nonce','-_','+/')||'=','base64'),'base64'),'+/','-_'),'=')<>payload->>'nonce' then return null; end if;
 u=(payload->>'userID')::uuid; s=(payload->>'sessionID')::uuid; e=(payload->>'epochID')::uuid; r=(payload->>'requestID')::uuid;
 if u::text is distinct from payload->>'userID' or s::text is distinct from payload->>'sessionID' or e::text is distinct from payload->>'epochID' or r::text is distinct from payload->>'requestID'
 or u is null or s is null or e is null or r is null or u=e
 or u='00000000-0000-0000-0000-000000000000'::uuid or s='00000000-0000-0000-0000-000000000000'::uuid
 or e='00000000-0000-0000-0000-000000000000'::uuid or r='00000000-0000-0000-0000-000000000000'::uuid then return null; end if;
 perform pg_advisory_xact_lock(hashtext(u::text));
 perform 1 from maintenance_private.restore_transfer_policy where id=1 and enabled for share;
 if not found or public.read_maintenance_explicit_enrollment(u,s) is distinct from e then return null; end if;
 if exists(select 1 from maintenance_private.restore_cancelled_requests where request_id=r) then return null; end if;
 select * into k from maintenance_private.restore_attested_keys where key_id=payload->>'keyID' and user_id=u and app_epoch_id=e and app_id=payload->>'appID' and attest_environment=payload->>'attestEnvironment' for update;
 if not found then return null; end if;
 now_at=clock_timestamp();
 select * into c from maintenance_private.restore_challenges where request_id=r for update;
 if found then
  if c.user_id=u and c.session_id=s and c.app_epoch_id=e and c.key_id=k.key_id
  and c.challenge->>'appID'=k.app_id and c.challenge->>'attestEnvironment'=k.attest_environment
  and c.challenge->>'purchaseEnvironment'='Sandbox' and c.challenge->>'proofSHA256'=payload->>'proofSHA256'
  and c.consumed_at is null and c.issued_at<=now_at and c.expires_at>now_at then return c.challenge; end if;
  return null;
 end if;
 issued=to_timestamp((payload->>'issuedAt')::numeric/1000); expiry=to_timestamp((payload->>'expiresAt')::numeric/1000);
 if issued>now_at or expiry<=now_at or expiry<>issued+interval '5 minutes' then return null; end if;
 -- Expired nonce data only; retained transfer jobs are independent and unchanged.
 delete from maintenance_private.restore_challenges where request_id in (select request_id from maintenance_private.restore_challenges where user_id=u and key_id=k.key_id and expires_at<=now_at order by expires_at,request_id limit 100);
 if (select count(*) from maintenance_private.restore_challenges where user_id=u and key_id=k.key_id and consumed_at is null and expires_at>now_at)>=5 then return null; end if;
 insert into maintenance_private.restore_challenges(request_id,user_id,session_id,app_epoch_id,key_id,challenge,nonce,client_data_sha256,issued_at,expires_at)
 values(r,u,s,e,k.key_id,payload,payload->>'nonce',client_hash,issued,expiry);
 return payload;
end;$$;
commit;
